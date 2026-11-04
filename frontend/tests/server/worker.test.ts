// @vitest-environment node
/**
 * B7, parte indipendente dai motori: lock con fencing, job_runs, recapito dell'outbox. Replica set usa-e-getta:
 *   MONGO_RS_TEST_URL="mongodb://127.0.0.1:27021/?directConnection=true" yarn vitest run tests/server/worker.test.ts
 * Nessuna mail reale: il mittente è finto.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { acquireLock, assertFence, LockLostError, releaseLock, renewLock } from "@/lib/jobs/lock";
import { claimNext, defaultBackoffMs, deliverBatch, messageIdOf, type OutgoingMail } from "@/lib/jobs/outbox-delivery";
import { completeRun, failRun, saveCursor, startRun } from "@/lib/jobs/runs";
import { bootstrapStore, store } from "@/lib/store/db";
import { enqueueDeliveries } from "@/lib/store/outbox";
import { runOperation } from "@/lib/store/transaction";
import type { StoreUserDoc } from "@/lib/store/types";
import { assertDisposableTarget } from "../../scripts/db/guard";

describe("attesa tra i tentativi", () => {
  it("1, 2, 4… minuti, al massimo un'ora (D-137 A-05)", () => {
    expect([1, 2, 3, 4].map(defaultBackoffMs)).toEqual([60_000, 120_000, 240_000, 480_000]);
    expect(defaultBackoffMs(30)).toBe(3_600_000);
  });
});

const URL_RS = process.env.MONGO_RS_TEST_URL;
describe.skipIf(!URL_RS)("worker sul replica set usa-e-getta", () => {
  let client: MongoClient;
  let db: Db;
  const DB = `practicehub_test_worker_${Date.now()}`;
  const t0 = new Date("2026-10-08T07:00:00Z");
  const at = (ms: number) => new Date(t0.getTime() + ms);
  let active: StoreUserDoc;
  let off: StoreUserDoc;

  const user = async (key: string, status: StoreUserDoc["status"]) => {
    const u: StoreUserDoc = { _id: new ObjectId(), email: `${key}@test.local`, name: key, passwordHash: null, status, isAdmin: false, memberships: [], authVersion: 1, createdAt: t0, updatedAt: t0 };
    await store.users(db).insertOne(u);
    return u;
  };
  const enqueue = (eventKey: string, userId: ObjectId, now = t0) =>
    runOperation(client, db, { actorId: "test", request: { eventKey }, now, skipBootstrap: true }, (ctx) =>
      enqueueDeliveries(ctx, [{ eventKey, userId, payload: { to: "x@test.local", subject: `s ${eventKey}`, html: "<p>h</p>" } }])
    );

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    client = await new MongoClient(URL_RS!).connect();
    db = client.db(DB);
    await bootstrapStore(db);
    active = await user("attivo", "active");
    off = await user("disattivato", "deactivated");
  });
  afterAll(async () => {
    await client?.db(DB).dropDatabase();
    await client?.close();
  });

  describe("lock con fencing", () => {
    it("un proprietario alla volta; rinnovo; scadenza e ripresa con token più alto; rilascio", async () => {
      const a = await acquireLock(db, "job-a", "w1", 60_000, t0);
      expect(a).toMatchObject({ owner: "w1", fencingToken: 1 });
      expect(await acquireLock(db, "job-a", "w2", 60_000, at(1000))).toBeNull();
      expect(await renewLock(db, a!, 60_000, at(30_000))).toBe(true);
      expect(await acquireLock(db, "job-a", "w2", 60_000, at(80_000))).toBeNull(); // lease rinnovata fino a 90 s
      const b = await acquireLock(db, "job-a", "w2", 60_000, at(100_000));
      expect(b).toMatchObject({ owner: "w2", fencingToken: 2 });
      expect(await renewLock(db, a!, 60_000, at(100_001))).toBe(false);
      await releaseLock(db, a!); // non è più suo: nessun effetto
      expect(await acquireLock(db, "job-a", "w3", 60_000, at(101_000))).toBeNull();
      await releaseLock(db, b!);
      expect(await acquireLock(db, "job-a", "w3", 60_000, at(102_000))).toMatchObject({ fencingToken: 3 });
    });

    it("assertFence nella transazione: il vecchio proprietario non può più scrivere", async () => {
      const old = (await acquireLock(db, "job-b", "w1", 60_000, t0))!;
      const fresh = (await acquireLock(db, "job-b", "w2", 60_000, at(61_000)))!;
      const write = (h: typeof old, now: Date, tag: string) =>
        runOperation(client, db, { actorId: "test", request: { tag }, now, skipBootstrap: true }, async (ctx) => {
          await assertFence(ctx, h, now);
          await store.writeGuards(ctx.db).insertOne({ _id: tag, version: 1, updatedAt: now }, { session: ctx.session });
          return tag;
        });
      await expect(write(old, at(62_000), "vecchio")).rejects.toBeInstanceOf(LockLostError);
      expect(await store.writeGuards(db).countDocuments({ _id: "vecchio" })).toBe(0);
      expect((await write(fresh, at(62_000), "nuovo")).result).toBe("nuovo");
      await expect(write(fresh, at(200_000), "scaduto")).rejects.toBeInstanceOf(LockLostError);
    });
  });

  describe("job_runs", () => {
    it("una esecuzione per giorno: ripresa dopo errore con il cursore, DONE non si ripete", async () => {
      const job = async (ms: number) => ({ client, db, lock: (await acquireLock(db, "runs-test", "w", 60_000, at(ms)))!, clock: () => at(ms) });
      const j1 = await job(0);
      const r1 = (await startRun(j1, "alert_daily", "2026-10-08"))!;
      expect(r1).toMatchObject({ status: "RUNNING", attempts: 1, cursor: null, fencingToken: j1.lock.fencingToken });
      await saveCursor(j1, r1, { after: "p-10" });
      expect(await failRun({ ...j1, clock: () => at(1000) }, r1, new Error("guasto"))).toBe(true);
      const j2 = await job(2000);
      const r2 = (await startRun(j2, "alert_daily", "2026-10-08"))!;
      expect(r2).toMatchObject({ _id: r1._id, status: "RUNNING", attempts: 2, cursor: { after: "p-10" }, error: null, fencingToken: j2.lock.fencingToken });
      await completeRun({ ...j2, clock: () => at(3000) }, r2);
      expect(await startRun({ ...j2, clock: () => at(4000) }, "alert_daily", "2026-10-08")).toBeNull();
      expect(await startRun({ ...j2, clock: () => at(4000) }, "alert_daily", "2026-10-09")).toMatchObject({ attempts: 1 });
    });
  });

  describe("recapito dell'outbox", () => {
    const deps = () => ({ client, db });
    const zero = { sent: 0, retried: 0, failed: 0, cancelled: 0, deferred: 0, lost: 0, warned: 0 };
    const events = async (eventKey: string) => (await store.deliveryEvents(db).find({ eventKey }).sort({ at: 1, _id: 1 }).toArray()).map((e) => e.outcome);

    it("invio riuscito: CLAIMED → SENDING → SENT con Message-ID stabile; un secondo giro non rimanda nulla", async () => {
      await enqueue("ok:1", active._id);
      const sent: OutgoingMail[] = [];
      const r = await deliverBatch(deps(), async (m) => void sent.push(m), { owner: "w1", now: () => at(1000) });
      expect(r).toEqual({ ...zero, sent: 1 });
      const doc = (await store.outbox(db).findOne({ eventKey: "ok:1" }))!;
      expect(doc).toMatchObject({ status: "SENT", attempts: 1, claimToken: null, leaseUntil: null, sentAt: at(1000) });
      expect(sent[0]).toMatchObject({ to: "x@test.local", subject: "s ok:1", messageId: messageIdOf(doc) });
      expect(await events("ok:1")).toEqual(["SENDING", "SENT"]);
      expect(await deliverBatch(deps(), async (m) => void sent.push(m), { owner: "w1", now: () => at(2000) })).toEqual(zero);
    });

    it("errore temporaneo: si ritenta senza limite di numero (attesa al massimo un'ora); errore permanente → FAILED con avviso", async () => {
      await enqueue("ko:1", active._id);
      const boom = async () => {
        throw new Error("SMTP 451 temporaneo");
      };
      const opts = { owner: "w1", backoffMs: () => 10_000 };
      expect(await deliverBatch(deps(), boom, { ...opts, now: () => at(0) })).toMatchObject({ retried: 1 });
      const doc = (await store.outbox(db).findOne({ eventKey: "ko:1" }))!;
      expect(doc).toMatchObject({ status: "PENDING", attempts: 1, nextAttemptAt: at(10_000), lastError: "Error: SMTP 451 temporaneo", firstErrorAt: at(0) });
      expect(await deliverBatch(deps(), boom, { ...opts, now: () => at(5_000) })).toMatchObject({ retried: 0 }); // non ancora dovuto
      for (let i = 1; i <= 6; i++) await deliverBatch(deps(), boom, { ...opts, now: () => at(i * 10_000) });
      expect(await store.outbox(db).findOne({ eventKey: "ko:1" })).toMatchObject({ status: "PENDING", attempts: 7 }); // oltre il vecchio massimo di questa prova (3); R08 in alerts-review va oltre gli 8 predefiniti
      expect(defaultBackoffMs(30)).toBe(3_600_000);

      await enqueue("perm:1", active._id);
      const reject = async () => {
        throw Object.assign(new Error("550 utente inesistente"), { responseCode: 550 });
      };
      expect(await deliverBatch(deps(), reject, { owner: "w1", now: () => at(200_000), batchSize: 1 })).toMatchObject({ failed: 1, warned: 1 });
      expect(await store.outbox(db).findOne({ eventKey: "perm:1" })).toMatchObject({ status: "FAILED", lastError: expect.stringContaining("550") });
    }, 60_000); // molte transazioni in sequenza: sotto il carico dell'intera suite supera i 30 s predefiniti

    it("destinatario disattivato o autorizzazione negata: nessun invio, CANCELLED con motivo", async () => {
      await enqueue("off:1", off._id);
      await enqueue("auth:1", active._id);
      const sent: OutgoingMail[] = [];
      const r = await deliverBatch(deps(), async (m) => void sent.push(m), {
        owner: "w1",
        now: () => at(1000),
        authorize: async (i) => (i.eventKey === "auth:1" ? "Pratica archiviata" : null),
      });
      expect(r).toMatchObject({ cancelled: 2, sent: 0 });
      expect(sent).toEqual([]);
      expect(await store.outbox(db).findOne({ eventKey: "off:1" })).toMatchObject({ status: "CANCELLED", lastError: expect.stringContaining("non più attivo") });
      expect(await store.outbox(db).findOne({ eventKey: "auth:1" })).toMatchObject({ status: "CANCELLED", lastError: "Pratica archiviata" });
      expect(await events("auth:1")).toEqual(["CANCELLED"]);
    });

    it("due worker insieme: ogni messaggio è preso da uno solo", async () => {
      for (let i = 0; i < 20; i++) await enqueue(`par:${i}`, active._id);
      const seen: string[] = [];
      const sender = async (m: OutgoingMail) => {
        await new Promise((r) => setTimeout(r, 5));
        seen.push(m.subject);
      };
      const [a, b] = await Promise.all([
        deliverBatch(deps(), sender, { owner: "w1", now: () => at(1000) }),
        deliverBatch(deps(), sender, { owner: "w2", now: () => at(1000) }),
      ]);
      expect(a.sent + b.sent).toBe(20);
      expect(new Set(seen).size).toBe(20);
      expect(seen).toHaveLength(20);
      expect(await store.outbox(db).countDocuments({ eventKey: /^par:/, status: "SENT", attempts: 1 })).toBe(20);
    });

    it("worker morto dopo il confine di emissione: alla scadenza della lease un altro rimanda (stesso Message-ID)", async () => {
      await enqueue("crash:1", active._id);
      const taken = (await claimNext(db, at(0), 60_000))!;
      expect(taken).toMatchObject({ eventKey: "crash:1", status: "CLAIMED", attempts: 0 });
      // Il worker entra in SENDING e muore durante l'invio.
      await store.outbox(db).updateOne({ _id: taken._id }, { $set: { status: "SENDING", sendingAt: at(0) }, $inc: { attempts: 1 } });
      expect(await claimNext(db, at(30_000), 60_000)).toBeNull(); // lease valida
      const sent: OutgoingMail[] = [];
      expect(await deliverBatch(deps(), async (m) => void sent.push(m), { owner: "w2", now: () => at(61_000) })).toMatchObject({ sent: 1 });
      expect(sent[0].messageId).toBe(messageIdOf(taken));
      expect(await store.outbox(db).findOne({ eventKey: "crash:1" })).toMatchObject({ status: "SENT", attempts: 2 });
      // Il primo worker "si risveglia": il suo claimToken non vale più.
      const r = await store.outbox(db).updateOne({ _id: taken._id, claimToken: taken.claimToken }, { $set: { status: "PENDING" } });
      expect(r.modifiedCount).toBe(0);
    });
  });
});
