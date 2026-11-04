// @vitest-environment node
/**
 * A13 (D-178): azzeramento delle SOLE pratiche il giorno della partenza. Database usa-e-getta:
 *   MONGO_RS_TEST_URL="mongodb://127.0.0.1:27021/?directConnection=true" yarn vitest run tests/server/reset-practices.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { store } from "@/lib/store/db";
import { SEED_USERS } from "@/lib/store/seed-demo";
import { resetDatabase } from "../../scripts/db/reset-core";
import { assertDisposableTarget } from "../../scripts/db/guard";
import { applyFixtureE, eIds, seedS0 } from "../fixtures/assistant-e";

const URL_RS = process.env.MONGO_RS_TEST_URL;
describe.skipIf(!URL_RS)("azzeramento \"solo pratiche\" (D-178)", () => {
  let client: MongoClient;
  let db: Db;
  let tmp: string;
  const DB = `practicehub_test_reset_pratiche_${Date.now()}`;
  const quiet = () => {};
  const now = new Date("2026-10-09T08:00:00Z");
  const ids = { inviteOut: new ObjectId(), alertOut: new ObjectId(), assignOut: new ObjectId() };

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    client = await new MongoClient(URL_RS!).connect();
    db = client.db(DB);
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ph-reset-pratiche-"));
    await seedS0(db);
    await applyFixtureE(db, { alerts: true, history: true });
    const user = eIds.user("pm");
    const out = (id: ObjectId, eventKey: string, alertId: ObjectId | null) => ({
      _id: id, eventKey, userId: user, channel: "EMAIL" as const, payload: { to: "pm@prova.local", subject: "s", html: "h" }, status: "PENDING" as const,
      alertId, attempts: 0, nextAttemptAt: now, leaseUntil: null, claimToken: null, lastError: null, sentAt: null, createdAt: now,
    });
    const alert = (await store.alerts(db).findOne({}))!;
    await store.outbox(db).insertMany([out(ids.inviteOut, `invite:${user.toHexString()}`, null), out(ids.alertOut, `alert:${alert._id.toHexString()}:1`, alert._id), out(ids.assignOut, `assign:${new ObjectId().toHexString()}`, null)]);
    await store.deliveryEvents(db).insertMany([
      { _id: new ObjectId(), outboxId: ids.inviteOut, eventKey: "invite", alertId: null, userId: user, attempt: 1, at: now, outcome: "SENT", by: "t" },
      { _id: new ObjectId(), outboxId: ids.alertOut, eventKey: "alert", alertId: alert._id, userId: user, attempt: 1, at: now, outcome: "DEFERRED", by: "t" },
    ]);
    await store.notifications(db).insertOne({ _id: new ObjectId(), userId: user, kind: "ASSIGN" as never, eventKey: "assign:x", title: "t", body: "b", link: { practiceId: eIds.practice("ILIAD-1") }, createdAt: now, readAt: null });
    await store.operations(db).insertMany([
      { _id: new ObjectId(), actorId: "a", operationId: "op-pratica", requestHash: "h", practiceId: eIds.practice("ILIAD-1"), status: "DONE", result: {}, createdAt: now },
      { _id: new ObjectId(), actorId: "a", operationId: "op-import", requestHash: "h", practiceId: null, status: "DONE", result: { created: 1, updated: 0, reworks: 0, skipped: 0, failed: [] }, createdAt: now },
      { _id: new ObjectId(), actorId: "a", operationId: "op-utente", requestHash: "h", practiceId: null, status: "DONE", result: { id: "u" }, createdAt: now },
    ]);
    await store.importPreviews(db).insertOne({ _id: new ObjectId(), expiresAt: new Date(Date.now() + 86400_000) } as never);
    await store.assistantSettings(db).insertOne({ _id: "global", enabled: false, dailyLimit: 12, perMinuteLimit: 3, revision: 2, updatedAt: now, updatedBy: null, updatedByName: "Admin" });
    await store.auditLog(db).insertOne({ _id: new ObjectId(), kind: "ASSISTANT_SETTINGS", actorId: null, actorName: "Admin", at: now, operationId: "o", changes: [] });
    await store.authTokens(db).insertOne({ _id: new ObjectId(), userId: user, type: "invite", token: "t".repeat(64), expiresAt: new Date(Date.now() + 86400_000), usedAt: null, createdAt: now });
  }, 240_000);
  afterAll(async () => {
    await client?.db(DB).dropDatabase();
    await client?.close();
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("protezioni: practicehub_prod solo con --consenti-esercizio; non si combina con utenti o seed", async () => {
    await expect(resetDatabase({ client, uri: URL_RS!, dbName: "practicehub_prod", practicesOnly: true, log: quiet })).rejects.toThrow(/esercizio/);
    await expect(resetDatabase({ client, uri: URL_RS!, dbName: DB, practicesOnly: true, includeUsers: true, log: quiet })).rejects.toThrow(/non si combina/);
    await expect(resetDatabase({ client, uri: URL_RS!, dbName: DB, practicesOnly: true, seedPassword: "Prova-Seed-2026", log: quiet })).rejects.toThrow(/non si combina/);
  });

  it("dry-run: conta cosa toglierebbe, non scrive niente e non fa copie", async () => {
    const dry = await resetDatabase({ client, uri: URL_RS!, dbName: DB, practicesOnly: true, backupDir: tmp, log: quiet });
    expect(dry.executed).toBe(false);
    expect(dry.before).toMatchObject({ practices: 8, alerts: 3, notifications: 1, delivery_outbox: 2, delivery_events: 1, operations: 2, import_previews: 1 });
    expect(dry.before.value_history).toBeGreaterThan(0);
    expect(await store.practices(db).countDocuments()).toBe(8);
    expect(fs.readdirSync(tmp)).toHaveLength(0);
  });

  it("esecuzione: copia di sicurezza, pratiche e dipendenti a zero; utenti, token, liste, soglie, impostazioni, audit, mail degli account restano", async () => {
    const lists = await store.lists(db).countDocuments();
    const rules = await store.ruleConfig(db).countDocuments();
    const templates = await store.templates(db).countDocuments();
    const run = await resetDatabase({ client, uri: URL_RS!, dbName: DB, practicesOnly: true, yes: true, backupDir: tmp, log: quiet });
    expect(run.executed).toBe(true);
    expect(run.backupFolder && fs.existsSync(path.join(run.backupFolder, "manifest.json"))).toBe(true);
    expect(Object.values(run.after!).every((n) => n === 0)).toBe(true);
    for (const c of ["practices", "practice_iterations", "repeat_rows", "value_history", "practice_events", "alerts", "alert_events", "notifications", "import_previews"]) {
      expect(await db.collection(c).countDocuments(), c).toBe(0);
    }
    expect(await store.users(db).countDocuments()).toBe(SEED_USERS.length);
    expect(await store.authTokens(db).countDocuments()).toBe(1);
    expect(await store.lists(db).countDocuments()).toBe(lists);
    expect(await store.ruleConfig(db).countDocuments()).toBe(rules);
    expect(await store.templates(db).countDocuments()).toBe(templates);
    expect(await store.assistantSettings(db).findOne({ _id: "global" })).toMatchObject({ enabled: false, dailyLimit: 12 });
    expect(await store.auditLog(db).countDocuments()).toBe(1);
    expect((await store.outbox(db).find({}).toArray()).map((d) => d._id.toHexString())).toEqual([ids.inviteOut.toHexString()]);
    expect((await store.deliveryEvents(db).find({}).toArray()).map((d) => d.outboxId.toHexString())).toEqual([ids.inviteOut.toHexString()]);
    expect((await store.operations(db).find({}).toArray()).map((d) => d.operationId)).toEqual(["op-utente"]);
    // Collezioni svuotate, non cancellate: gli indici restano.
    expect((await store.practices(db).indexes()).length).toBeGreaterThan(1);
  }, 120_000);
});
