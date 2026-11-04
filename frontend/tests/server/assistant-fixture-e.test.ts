// @vitest-environment node
/**
 * Fixture E dell'assistente (§13.3): costruzione sul seed S0 e coerenza (riepilogo, revisione, alert, storico).
 *   MONGO_RS_TEST_URL="mongodb://127.0.0.1:27021/?directConnection=true" yarn vitest run tests/server/assistant-fixture-e.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { store } from "@/lib/store/db";
import { assertDisposableTarget } from "../../scripts/db/guard";
import { applyFixtureE, E_LEGACY_NOTE, E_NOTES, E_NOW, eIds, seedS0 } from "../fixtures/assistant-e";

const URL_RS = process.env.MONGO_RS_TEST_URL;
describe.skipIf(!URL_RS)("fixture E sul seed S0", () => {
  let client: MongoClient;
  let db: Db;
  const DB = `practicehub_test_ai_e_${Date.now()}`;

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    client = await new MongoClient(URL_RS!).connect();
    db = client.db(DB);
    await seedS0(db);
    await applyFixtureE(db, { alerts: true, history: true, legacyHistory: true });
  }, 180_000);
  afterAll(async () => {
    await client?.db(DB).dropDatabase();
    await client?.close();
  });

  it("ILIAD-1: date, tecnici e note dei quattro gruppi; riepilogo e revisione coerenti", async () => {
    const p = (await store.practices(db).findOne({ _id: eIds.practice("ILIAD-1") }))!;
    const it = (await store.iterations(db).findOne({ _id: p.currentIterationId }))!;
    expect(it.values).toMatchObject({ F126: "2026-10-14", F140: "2026-10-16", F129: { code: eIds.user("ut").toHexString() }, F144: [{ code: eIds.user("pe").toHexString() }] });
    expect(it.values.F135 ?? null).toBeNull();
    expect(it.transversal.noteOperative).toEqual(E_NOTES);
    expect(p.currentSummary.transversal.noteOperative).toEqual(E_NOTES);
    expect(p.revision).toBe(2);
    expect(p.enabledGroups).toEqual(["PM_PERMESSI", "UT_PE"]);
    expect(p.currentSummary).toMatchObject({ statoAttivita: "ASSEGNATO", openAlerts: 2 });
  });

  it("TOWERNET-1 concluso l'08/10, TIM-1 Forecast PE 08/10 senza invio; S0 invariato altrove", async () => {
    const tn = (await store.iterations(db).findOne({ _id: eIds.iteration("TOWERNET-1") }))!;
    expect(tn.values).toMatchObject({ F096: "2026-10-15", F105: "2026-10-08", F100: [{ code: eIds.user("pe").toHexString() }] });
    const tim = (await store.iterations(db).findOne({ _id: eIds.iteration("TIM-1") }))!;
    expect(tim.values.F097).toBe("2026-10-08");
    expect(tim.values.F106 ?? null).toBeNull();
    expect(await store.repeatRows(db).countDocuments({ iterationId: tim._id, groupKey: "ARPA" })).toBe(2);
    // Conteggi S0 (§13.1): 7 non archiviate.
    expect(await store.practices(db).countDocuments({ archived: false })).toBe(7);
  });

  it("E-alert: 3 aperti, 1 scaduto a E_NOW; E-history: due note del 07/10 con gruppo più la voce legacy", async () => {
    expect(await store.alerts(db).countDocuments({ status: "OPEN", executionStatus: "ACTIVE" })).toBe(3);
    expect(await store.alerts(db).countDocuments({ status: "OPEN", dueAt: { $lt: E_NOW } })).toBe(1);
    const h = await store.valueHistory(db).find({ practiceId: eIds.practice("ILIAD-1") }).sort({ timestamp: 1 }).toArray();
    expect(h.map((x) => [x.target.noteGroup ?? null, x.newValue])).toEqual([
      ["PM_PERMESSI", E_NOTES.PM_PERMESSI],
      ["UT_PE", E_NOTES.UT_PE],
      [null, E_LEGACY_NOTE],
    ]);
  });
});
