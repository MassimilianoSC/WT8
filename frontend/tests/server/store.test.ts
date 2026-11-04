// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";
import { computeFormulas } from "@/lib/engines/formulas";
import { deriveAutomaticState } from "@/lib/engines/state";
import { engineSnapshot } from "@/lib/practice/detail";
import { bootstrapStore, PRODUCTION_DB_NAMES, store } from "@/lib/store/db";
import { OpLog } from "@/lib/store/oplog";
import { enqueueDeliveries } from "@/lib/store/outbox";
import { buildNewPractice } from "@/lib/store/practice-factory";
import { seedDemo, seedEmail, seedId, SEED_USERS } from "@/lib/store/seed-demo";
import { bumpPracticeRevision, requestHash, runOperation } from "@/lib/store/transaction";
import { getTemplate } from "@/services/templates";
import { PRODUCTION_DB_NAMES as PRODUCTION_DB_NAMES_SCRIPTS } from "../../scripts/db/backup-db.mjs";
import { assertDisposableTarget, portsOf } from "../../scripts/db/guard";
import { resetDatabase } from "../../scripts/db/reset-core";

// Prove che creano database sul replica set: sotto il carico della suite completa 30 s non bastano (timeout visti
// l'11/10/2026 con la macchina carica). Un blocco vero resta un errore entro 90 s; i limiti espliciti più alti restano.
vi.setConfig({ testTimeout: 90_000 });

const INWIT = COMPILED_TEMPLATES.INWIT.template;
const identity = { codiceG7: "123", codiceSito: "S1", nomeSito: "Sito", committente: { code: "TODOS" }, clienteFinale: { code: "INWIT" } };

describe("parti pure", () => {
  it("protezione degli script: solo locale, mai 27017 né i database della beta", () => {
    expect(portsOf("mongodb://127.0.0.1/?directConnection=true")).toEqual([27017]);
    expect(portsOf("mongodb://[::1]:27021")).toEqual([27021]);
    expect(() => assertDisposableTarget("mongodb://127.0.0.1:27017", "practicehub_test")).toThrow(/27017/);
    expect(() => assertDisposableTarget("mongodb://127.0.0.1", "practicehub_test")).toThrow(/27017/);
    expect(() => assertDisposableTarget("mongodb://127.0.0.1:27021", "practicehub")).toThrow(/beta/);
    expect(() => assertDisposableTarget("mongodb://127.0.0.1:27021", "practicehub_v2")).toThrow(/beta/);
    expect(() => assertDisposableTarget("mongodb+srv://a:b@x.mongodb.net", "x")).toThrow();
    expect(() => assertDisposableTarget("mongodb://127.0.0.1:27021", "")).toThrow(/--db/);
    expect(() => assertDisposableTarget("mongodb://127.0.0.1:27021/?directConnection=true", "practicehub_test_v2")).not.toThrow();
    // D-158: il database di esercizio del nuovo stack solo con il SUO flag; il flag della beta non basta; il collaudo è libero.
    for (const prod of ["practicehub_prod", "practicehub_prod_legacy"]) {
      expect(() => assertDisposableTarget("mongodb://mongo:27018/?replicaSet=rs0", prod)).toThrow(/esercizio/);
      expect(() => assertDisposableTarget("mongodb://mongo:27018/?replicaSet=rs0", prod, true)).toThrow(/esercizio/);
      expect(() => assertDisposableTarget("mongodb://mongo:27018/?replicaSet=rs0", prod, false, true)).not.toThrow();
    }
    expect(() => assertDisposableTarget("mongodb://mongo:27018/?replicaSet=rs0", "practicehub_collaudo")).not.toThrow();
    expect([...PRODUCTION_DB_NAMES]).toEqual(PRODUCTION_DB_NAMES_SCRIPTS);
  });

  it("nuova pratica: iterazione 1 CREATA, PM_PERMESSI abilitato, 11 righe VINCOLI senza stato", () => {
    const b = buildNewPractice({
      practiceId: new ObjectId(),
      iterationId: new ObjectId(),
      templateId: "INWIT",
      template: INWIT,
      identity,
      createdBy: null,
      enabledGroups: ["AIE"],
      now: new Date("2026-10-08T07:00:00Z"),
    });
    expect(b.practice.enabledGroups).toEqual(["PM_PERMESSI", "AIE"]);
    expect(b.iteration.values.F001).toBe(123);
    expect(b.practice.currentSummary.codiceG7).toBe("123");
    expect(b.iteration.stateMeta).toMatchObject({ stato: "CREATA", source: "AUTO" });
    expect(b.iteration.templateVersion).toBe(INWIT.version);
    expect(b.rows).toHaveLength(11);
    expect(b.rows.every((r) => r.groupKey === "VINCOLI" && r.constraint?.stato === null)).toBe(true);
    expect(b.rows.find((r) => r.constraint?.code === "MONUMENTALE")!.constraint!.ente).toEqual({ code: "SOPRINTENDENZA" });
  });

  it("hash della richiesta indipendente dall'ordine delle chiavi", () => {
    expect(requestHash({ a: 1, b: { c: 2, d: [1, 2] } })).toBe(requestHash({ b: { d: [1, 2], c: 2 }, a: 1 }));
    expect(requestHash({ a: 1 })).not.toBe(requestHash({ a: 2 }));
  });

  it("R4 (revisione): ricevuta commessa dopo il controllo preliminare → replay, senza eseguire il callback (D-126 M-05)", async () => {
    const operationId = "33333333-3333-4333-8333-333333333333";
    const request = { revision: 1, stato: "STAND_BY" };
    let done: unknown = null;
    let reads = 0;
    let callbackRuns = 0;
    const operations = {
      findOne: async () => {
        reads++;
        return done;
      },
      insertOne: async () => {
        throw new Error("non deve inserire");
      },
    };
    const fakeDb = { collection: () => operations } as unknown as Db;
    const fakeClient = {
      startSession: () => ({
        withTransaction: async (cb: () => Promise<void>) => {
          // Il concorrente commette dopo il controllo preliminare e prima del callback del perdente.
          done = { actorId: "u", operationId, requestHash: requestHash(request), result: { revision: 2 } };
          await cb();
        },
        endSession: async () => {},
      }),
    } as unknown as MongoClient;
    const out = await runOperation(fakeClient, fakeDb, { actorId: "u", operationId, request, skipBootstrap: true }, async () => {
      callbackRuns++;
      return { revision: 99 };
    });
    expect(out).toEqual({ result: { revision: 2 }, operationId, replayed: true });
    expect(callbackRuns).toBe(0);
    expect(reads).toBe(2);
    // Stesso interleaving con un corpo diverso → OPERATION_REUSED.
    done = { actorId: "u", operationId, requestHash: requestHash({ altro: true }), result: {} };
    await expect(runOperation(fakeClient, fakeDb, { actorId: "u", operationId, request, skipBootstrap: true }, async () => ({}))).rejects.toMatchObject({ status: 409, extra: { code: "OPERATION_REUSED" } });
  });
});

/**
 * Integrazione su un MongoDB LOCALE in replica set usa-e-getta (transazioni), mai la 27017 della beta:
 *   node scripts/db/mongo-rs.mjs start --port 27021
 *   MONGO_RS_TEST_URL="mongodb://127.0.0.1:27021/?directConnection=true" yarn vitest run tests/server/store.test.ts
 *   node scripts/db/mongo-rs.mjs stop
 */
const URL_RS = process.env.MONGO_RS_TEST_URL;
describe.skipIf(!URL_RS)("modello nuovo su replica set usa-e-getta", () => {
  let client: MongoClient;
  let db: Db;
  const DB = `practicehub_test_store_${Date.now()}`;
  let tmp: string;

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    client = await new MongoClient(URL_RS!).connect();
    db = client.db(DB);
    await bootstrapStore(db);
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ph-store-"));
  });
  afterAll(async () => {
    await client?.db(DB).dropDatabase();
    await client?.db(`${DB}_seed`).dropDatabase();
    await client?.db(`${DB}_reset`).dropDatabase();
    await client?.close();
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  async function newPractice(): Promise<ObjectId> {
    const b = buildNewPractice({ practiceId: new ObjectId(), iterationId: new ObjectId(), templateId: "INWIT", template: INWIT, identity, createdBy: null, now: new Date() });
    await store.practices(db).insertOne(b.practice);
    await store.iterations(db).insertOne(b.iteration);
    return b.practice._id;
  }

  /** Salvataggio di prova: revisione + una voce di storico + un'intenzione di mail. */
  const save = (practiceId: ObjectId, expected: number, operationId?: string, body: unknown = { v: 1 }) =>
    runOperation(client, db, { actorId: "u1", operationId, request: body, practiceId, skipBootstrap: true }, async (ctx) => {
      const revision = await bumpPracticeRevision(ctx, practiceId, expected);
      await store.valueHistory(db).insertOne(
        {
          _id: new ObjectId(),
          operationId: ctx.operationId,
          opKey: ctx.opKey,
          changeIndex: 0,
          practiceId,
          iterationId: new ObjectId(),
          n: 1,
          templateVersion: INWIT.version,
          kind: "FIELD",
          target: { flowId: "F010" },
          oldValue: null,
          newValue: { code: "RAW_LAND" },
          actorId: null,
          actorName: "Prova",
          source: "USER",
          timestamp: ctx.now,
          revision,
        },
        { session: ctx.session }
      );
      await enqueueDeliveries(ctx, [{ eventKey: `save:${practiceId}:${revision}`, userId: new ObjectId("0000000000000000000000aa"), payload: { to: "a@b.it", subject: "s", html: "h" } }]);
      return { revision };
    });

  it("due salvataggi sulla stessa revisione: uno riesce, l'altro 409 REVISION_CONFLICT", async () => {
    const id = await newPractice();
    const [a, b] = await Promise.allSettled([save(id, 1), save(id, 1)]);
    const ok = [a, b].filter((r) => r.status === "fulfilled");
    const ko = [a, b].filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(ko).toHaveLength(1);
    expect(ko[0].reason).toMatchObject({ status: 409, extra: { code: "REVISION_CONFLICT", currentRevision: 2 } });
    expect((await store.practices(db).findOne({ _id: id }))!.revision).toBe(2);
    expect(await store.valueHistory(db).countDocuments({ practiceId: id })).toBe(1);
  });

  it("errore a metà: rollback completo (revisione, storico, outbox, ricevuta)", async () => {
    const id = await newPractice();
    const op = "11111111-1111-4111-8111-111111111111";
    await expect(
      runOperation(client, db, { actorId: "u1", operationId: op, request: {}, practiceId: id, skipBootstrap: true }, async (ctx) => {
        await bumpPracticeRevision(ctx, id, 1);
        await store.valueHistory(db).insertOne({ _id: new ObjectId(), operationId: ctx.operationId, opKey: ctx.opKey, changeIndex: 0, practiceId: id, iterationId: new ObjectId(), n: 1, templateVersion: "x", kind: "FIELD", target: {}, oldValue: null, newValue: "x", actorId: null, actorName: null, source: "USER", timestamp: ctx.now, revision: 2 }, { session: ctx.session });
        await enqueueDeliveries(ctx, [{ eventKey: `fail:${id}`, userId: new ObjectId(), payload: { to: "a@b.it", subject: "s", html: "h" } }]);
        throw new Error("guasto simulato");
      })
    ).rejects.toThrow("guasto simulato");
    expect((await store.practices(db).findOne({ _id: id }))!.revision).toBe(1);
    expect(await store.valueHistory(db).countDocuments({ practiceId: id })).toBe(0);
    expect(await store.outbox(db).countDocuments({ eventKey: `fail:${id}` })).toBe(0);
    expect(await store.operations(db).countDocuments({ operationId: op })).toBe(0);
  });

  it("retry con la stessa operationId: un solo effetto e la stessa risposta", async () => {
    const id = await newPractice();
    const op = "22222222-2222-4222-8222-222222222222";
    const first = await save(id, 1, op);
    const again = await save(id, 1, op); // stessa revisione attesa: senza deduplica sarebbe un 409
    expect(first).toMatchObject({ replayed: false, result: { revision: 2 } });
    expect(again).toMatchObject({ replayed: true, result: { revision: 2 } });
    expect(await store.valueHistory(db).countDocuments({ practiceId: id })).toBe(1);
    expect(await store.outbox(db).countDocuments({ eventKey: `save:${id}:2` })).toBe(1);
    expect(await store.operations(db).countDocuments({ operationId: op })).toBe(1);
  });

  it("tentativi concorrenti con la stessa operationId: TUTTI riescono con la stessa risposta, un solo effetto (D-126 M-05)", async () => {
    for (let giro = 0; giro < 3; giro++) {
      const id = await newPractice();
      const op = `33333333-3333-4333-8333-33333333333${giro}`;
      const results = await Promise.allSettled([save(id, 1, op), save(id, 1, op), save(id, 1, op), save(id, 1, op)]);
      expect(results.map((r) => r.status), `giro ${giro}`).toEqual(["fulfilled", "fulfilled", "fulfilled", "fulfilled"]);
      const ok = results as PromiseFulfilledResult<{ result: { revision: number }; replayed: boolean }>[];
      for (const r of ok) expect(r.value.result.revision).toBe(2);
      expect(ok.filter((r) => !r.value.replayed)).toHaveLength(1);
      expect(await store.valueHistory(db).countDocuments({ practiceId: id })).toBe(1);
      expect(await store.outbox(db).countDocuments({ eventKey: `save:${id}:2` })).toBe(1);
      expect(await store.operations(db).countDocuments({ operationId: op })).toBe(1);
    }
  });

  it("stessa operationId con corpi diversi in concorrenza: uno riesce, l'altro OPERATION_REUSED (mai REVISION_CONFLICT)", async () => {
    for (let giro = 0; giro < 3; giro++) {
      const id = await newPractice();
      const op = `55555555-5555-4555-8555-55555555555${giro}`;
      const [a, b] = await Promise.allSettled([save(id, 1, op, { v: "a" }), save(id, 1, op, { v: "b" })]);
      const ko = [a, b].filter((r) => r.status === "rejected") as PromiseRejectedResult[];
      expect(ko, `giro ${giro}`).toHaveLength(1);
      expect(ko[0].reason).toMatchObject({ status: 409, extra: { code: "OPERATION_REUSED" } });
      expect(await store.valueHistory(db).countDocuments({ practiceId: id })).toBe(1);
    }
  });

  it("M-06 (D-126): stesso operationId da due attori su pratiche diverse → entrambe riescono, storico separato (anche voci SYSTEM)", async () => {
    const op = "66666666-6666-4666-8666-666666666666";
    const ids = [await newPractice(), await newPractice()];
    const run = (actorId: string, practiceId: ObjectId) =>
      runOperation(client, db, { actorId, operationId: op, request: { p: practiceId.toHexString() }, practiceId, skipBootstrap: true }, async (ctx) => {
        const revision = await bumpPracticeRevision(ctx, practiceId, 1);
        const log = new OpLog(ctx, { id: new ObjectId(), name: actorId });
        const ref = { practiceId, iterationId: new ObjectId(), n: 1, templateVersion: INWIT.version };
        log.field(ref, revision, { kind: "FIELD", target: { flowId: "F010" }, oldValue: null, newValue: "x", source: "USER" });
        log.field(ref, revision, { kind: "FIELD", target: { flowId: "F108" }, oldValue: null, newValue: "y", detail: "formula", source: "SYSTEM" });
        log.event(ref, { kind: "STATO", detail: actorId });
        await log.flush();
        return { revision };
      });
    const [a, b] = await Promise.allSettled([run("attore-A", ids[0]), run("attore-B", ids[1])]);
    expect([a.status, b.status]).toEqual(["fulfilled", "fulfilled"]);
    for (const id of ids) {
      expect(await store.valueHistory(db).countDocuments({ practiceId: id })).toBe(2);
      expect(await store.events(db).countDocuments({ practiceId: id })).toBe(1);
    }
    expect((await store.valueHistory(db).distinct("opKey", { operationId: op })).sort()).toEqual([`attore-A|${op}`, `attore-B|${op}`]);
    // Ciascuno ha la propria ricevuta: il retry di B è un replay di B, non un errore.
    expect((await run("attore-B", ids[1])).replayed).toBe(true);
  });

  it("M-06: il bootstrap toglie i vecchi indici unici sul solo operationId", async () => {
    const legacy = client.db(`${DB}_legacy`);
    await legacy.collection("value_history").createIndex({ operationId: 1, changeIndex: 1 }, { unique: true });
    await legacy.collection("practice_events").createIndex({ operationId: 1, eventIndex: 1 }, { unique: true });
    await bootstrapStore(legacy);
    const names = async (c: string) => (await legacy.collection(c).indexes()).map((i) => i.name);
    expect(await names("value_history")).not.toContain("operationId_1_changeIndex_1");
    expect(await names("value_history")).toContain("opKey_1_changeIndex_1");
    expect(await names("practice_events")).not.toContain("operationId_1_eventIndex_1");
    await legacy.dropDatabase();
  }, 90_000);

  it("stessa operationId con un corpo diverso: 409 OPERATION_REUSED", async () => {
    const id = await newPractice();
    const op = "44444444-4444-4444-8444-444444444444";
    await save(id, 1, op, { v: 1 });
    await expect(save(id, 2, op, { v: 2 })).rejects.toMatchObject({ status: 409, extra: { code: "OPERATION_REUSED" } });
  });

  it("outbox: la stessa intenzione in due operazioni resta una sola", async () => {
    const intent = { eventKey: "dup:1", userId: new ObjectId("0000000000000000000000bb"), payload: { to: "a@b.it", subject: "s", html: "h" } };
    for (let i = 0; i < 2; i++) {
      await runOperation(client, db, { actorId: "u1", request: { i }, skipBootstrap: true }, (ctx) => enqueueDeliveries(ctx, [intent]));
    }
    expect(await store.outbox(db).countDocuments({ eventKey: "dup:1" })).toBe(1);
  });

  it("snapshot dei template immutabili e versioni archiviate leggibili", async () => {
    expect((await bootstrapStore(db)).templatesInserted).toBe(0);
    await store.templates(db).updateOne({ templateId: "INWIT", version: INWIT.version }, { $set: { "compiled.label": "MODIFICATO" } });
    await bootstrapStore(db);
    expect((await store.templates(db).findOne({ templateId: "INWIT", version: INWIT.version }))!.compiled.label).toBe("MODIFICATO");
    await store.templates(db).insertOne({ _id: new ObjectId(), templateId: "INWIT", version: "2026-01-01.aaaaaaaaaaaa", baseline: "2026-01-01", compiled: { ...INWIT, version: "2026-01-01.aaaaaaaaaaaa" }, bindings: COMPILED_TEMPLATES.INWIT.bindings, createdAt: new Date() });
    expect((await getTemplate("INWIT", "2026-01-01.aaaaaaaaaaaa", async () => db)).version).toBe("2026-01-01.aaaaaaaaaaaa");
    await expect(getTemplate("INWIT", "2025-01-01.bbbbbbbbbbbb", async () => db)).rejects.toMatchObject({ status: 404 });
  });

  it("seed demo ripetibile: stessi id, nessun doppione, scenari del §1.6", async () => {
    const sdb = client.db(`${DB}_seed`);
    // D-158: mai sul database di esercizio, prima di qualunque scrittura.
    await expect(seedDemo(client.db("practicehub_prod"), { password: "Prova-Seed-2026" })).rejects.toThrow(/esercizio/);
    // Nessuna scrittura del seed (bootstrap e utenti); il database può esistere per altre prove in parallelo (backup-db).
    const prodCollections = (await client.db("practicehub_prod").listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
    expect(prodCollections).not.toContain("templates");
    expect(prodCollections).not.toContain("users");
    const first = await seedDemo(sdb, { password: "Prova-Seed-2026" });
    const second = await seedDemo(sdb, { password: "Prova-Seed-2026" });
    expect(first.inserted.users).toBe(SEED_USERS.length);
    expect(Object.values(second.inserted).every((n) => n === 0)).toBe(true);
    expect(await store.users(sdb).countDocuments()).toBe(SEED_USERS.length);
    // Un PM leader attivo per ogni gestore (D-101) e un leader per gruppo.
    for (const t of Object.keys(COMPILED_TEMPLATES)) {
      expect(await store.users(sdb).countDocuments({ status: "active", memberships: { $elemMatch: { templateId: t, role: "PM", leader: true } } }), t).toBeGreaterThan(0);
      for (const g of ["PM_PERMESSI", "UT_PE", "AIE", "DL"]) {
        expect(await store.users(sdb).countDocuments({ memberships: { $elemMatch: { templateId: t, group: g, leader: true } } }), `${t} ${g}`).toBeGreaterThan(0);
      }
    }
    expect((await store.users(sdb).findOne({ email: seedEmail("multi") }))!.memberships).toHaveLength(3);
    // Scenari.
    const towernet = await store.practices(sdb).find({ templateId: "TOWERNET" }).toArray();
    expect(new Set(towernet.map((p) => p.currentSummary.codiceG7)).size).toBe(1); // G7 ripetuto
    expect(await store.iterations(sdb).countDocuments({ practiceId: seedId("practice:INWIT-1") })).toBe(2);
    expect((await store.practices(sdb).findOne({ _id: seedId("practice:LEONARDO-2") }))!.originPracticeId).toEqual(seedId("practice:LEONARDO-1"));
    expect((await store.practices(sdb).findOne({ _id: seedId("practice:FV-1") }))!.archived).toBe(true);
    expect(await store.repeatRows(sdb).countDocuments({ practiceId: seedId("practice:TIM-1"), groupKey: "ARPA" })).toBe(2);
    const ente = await store.repeatRows(sdb).findOne({ practiceId: seedId("practice:ILIAD-1"), groupKey: "ENTE" });
    const vincolo = await store.repeatRows(sdb).findOne({ _id: ente!.metadata.origin!.rowId });
    expect(vincolo!.constraint).toMatchObject({ code: "MONUMENTALE", stato: { code: "PRESENTE" } });
    expect(ente!.metadata.locked).toBe(true);
    // D-143: il seed passa dagli stessi motori di un salvataggio: ricalcolando non cambia nulla (nessuna voce "Sistema"
    // al primo salvataggio dell'utente) e lo stato AUTO è quello del motore; gli altri sono stati impostati a mano.
    const now = new Date("2026-10-01T08:00:00Z");
    let manual = 0;
    for (const p of await store.practices(sdb).find().toArray()) {
      for (const it of await store.iterations(sdb).find({ practiceId: p._id }).toArray()) {
        const rows = await store.repeatRows(sdb).find({ iterationId: it._id }).toArray();
        const snap = engineSnapshot(it, rows);
        const { template, bindings } = COMPILED_TEMPLATES[p.templateId];
        const res = computeFormulas({ templateId: p.templateId, template, bindings, before: snap, after: snap, today: "2026-10-01", now, operationId: "check", actorId: null, manualWrites: new Set(), fatturabileWritten: false });
        expect(res.systemChanges, `${p.currentSummary.codiceSito} iterazione ${it.n}`).toEqual([]);
        const auto = deriveAutomaticState({ templateId: p.templateId, values: it.values, repeats: snap.repeats });
        expect(it.stateMeta.autoStato).toBe(auto.stato);
        if (it.stateMeta.source === "AUTO") expect(it.stateMeta.stato).toBe(auto.stato);
        else manual++;
      }
    }
    expect(manual).toBeGreaterThan(0); // i piani demo con uno stato non automatico (es. ASSEGNATO, KO)
  }, 90_000);

  it("azzeramento: dry-run senza scritture, poi backup + azzeramento con utenti conservati", async () => {
    const name = `${DB}_reset`;
    const rdb = client.db(name);
    await seedDemo(rdb, { password: "Prova-Seed-2026" });
    const quiet = () => {};
    const dry = await resetDatabase({ client, uri: URL_RS!, dbName: name, backupDir: tmp, log: quiet });
    expect(dry.executed).toBe(false);
    expect(dry.before.practices).toBe(8);
    expect(await store.practices(rdb).countDocuments()).toBe(8);
    expect(fs.readdirSync(tmp)).toHaveLength(0);
    await expect(resetDatabase({ client, uri: URL_RS!, dbName: "practicehub", yes: true, log: quiet })).rejects.toThrow(/beta/);

    const run = await resetDatabase({ client, uri: URL_RS!, dbName: name, yes: true, backupDir: tmp, log: quiet });
    expect(run.executed).toBe(true);
    expect(run.backupFolder && fs.existsSync(path.join(run.backupFolder, "manifest.json"))).toBe(true);
    expect(run.after!.practices).toBe(0);
    expect(run.after!.templates).toBe(6); // bootstrap dopo l'azzeramento
    expect(await store.users(rdb).countDocuments()).toBe(SEED_USERS.length); // utenti conservati
  }, 120_000); // sotto il carico della suite (2 file in parallelo) bootstrap e seed su un database nuovo superavano i 60 s
});
