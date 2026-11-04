// @vitest-environment node
/**
 * B7, parte legata ai dati: sospensione/ripresa su archivio/ripristino, SUPERSEDED alla ripresentazione, chiusura
 * manuale idempotente, alert nella scheda. Replica set usa-e-getta:
 *   MONGO_RS_TEST_URL="mongodb://127.0.0.1:27021/?directConnection=true" yarn vitest run tests/server/alerts.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, ObjectId, type Db } from "mongodb";
import type { MembershipDTO, UserDTO } from "@/lib/contract";
import { bootstrapStore, store } from "@/lib/store/db";
import type { AlertDoc, StoreUserDoc } from "@/lib/store/types";
import { closeAlert } from "@/services/alerts";
import { archivePractice, changeStato, createPractice, resubmitPractice, restorePractice, type PracticeDeps } from "@/services/practices-v2/commands";
import { getHistory } from "@/services/practices-v2/history";
import { getPracticeDetail } from "@/services/practices-v2/read";
import { toUserDTO } from "@/services/users-v2";
import { assertDisposableTarget } from "../../scripts/db/guard";

const URL_RS = process.env.MONGO_RS_TEST_URL;
describe.skipIf(!URL_RS)("alert sul replica set usa-e-getta", () => {
  let client: MongoClient;
  let db: Db;
  let deps: PracticeDeps;
  const DB = `practicehub_test_alerts_${Date.now()}`;
  const now = new Date("2026-10-08T07:00:00Z");
  const u: Record<string, UserDTO> = {};
  const m = (group: MembershipDTO["group"], role: MembershipDTO["role"], leader = false, templateId: MembershipDTO["templateId"] = "INWIT"): MembershipDTO => ({ templateId, group, role, leader });

  async function user(key: string, memberships: MembershipDTO[], extra: Partial<StoreUserDoc> = {}) {
    const doc: StoreUserDoc = { _id: new ObjectId(), email: `${key}@test.local`, name: key, passwordHash: null, status: "active", isAdmin: false, memberships, authVersion: 1, createdAt: now, updatedAt: now, ...extra };
    await store.users(db).insertOne(doc);
    u[key] = toUserDTO(doc);
  }
  const create = (codiceSito: string) =>
    createPractice(deps, u.pmLeader, { templateId: "INWIT", committente: { code: "TODOS" }, clienteFinale: { code: "INWIT" }, codiceG7: "1", codiceSito, nomeSito: "N" });
  async function addAlert(practiceId: string, iterationId: string, ruleId: string, extra: Partial<AlertDoc> = {}): Promise<string> {
    const a: AlertDoc = {
      _id: new ObjectId(), practiceId: new ObjectId(practiceId), iterationId: new ObjectId(iterationId), ruleId, subject: {}, episodeKey: new ObjectId().toHexString(), generation: 1,
      sourceFingerprint: "x", ruleVersion: 1, calendarVersion: "1", dueLocalDate: null, dueAt: new Date(now.getTime() + 86_400_000), status: "OPEN", executionStatus: "ACTIVE",
      openedAt: now, closedAt: null, closeMode: null, closedBy: null, closeReason: null, recipientsSnapshot: [], nextReminderAt: null, ...extra,
    };
    await store.alerts(db).insertOne(a);
    await store.practices(db).updateOne({ _id: a.practiceId }, { $inc: { "currentSummary.openAlerts": a.status === "OPEN" ? 1 : 0 } });
    return a._id.toHexString();
  }

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    client = await new MongoClient(URL_RS!).connect();
    db = client.db(DB);
    deps = { client, db, clock: () => now };
    await bootstrapStore(db);
    await user("pmLeader", [m("PM_PERMESSI", "PM", true)]);
    await user("pm", [m("PM_PERMESSI", "PM")]);
    await user("utLeader", [m("UT_PE", "UT", true)]);
    await user("ut", [m("UT_PE", "UT")]);
    await user("iliad", [m("UT_PE", "UT", true, "ILIAD")]);
    await user("admin", [], { isAdmin: true });
  });
  afterAll(async () => {
    await client?.db(DB).dropDatabase();
    await client?.close();
  });

  it("scheda: alert aperti dell'iterazione corrente con il permesso di chiusura per l'utente", async () => {
    const d = await create("SCHEDA");
    const sop = await addAlert(d.id, d.iterationId, "SOPRALLUOGO", { ownerGroup: "UT_PE" });
    await addAlert(d.id, d.iterationId, "OFFERTA_ODA", { dueAt: new Date(now.getTime() + 2 * 86_400_000) });
    await addAlert(d.id, d.iterationId, "VERBALE", { status: "CLOSED", closeMode: "AUTO", closedAt: now });
    const forLeader = await getPracticeDetail(db, u.utLeader, d.id);
    expect(forLeader.alerts.map((a) => [a.rule, a.canCloseManually])).toEqual([["SOPRALLUOGO", true], ["OFFERTA_ODA", false]]);
    expect(forLeader.alerts[0]).toMatchObject({ id: sop, iteration: 1, status: "OPEN", executionStatus: "ACTIVE", label: expect.stringContaining("sopralluogo") });
    expect((await getPracticeDetail(db, u.ut, d.id)).alerts.every((a) => !a.canCloseManually)).toBe(true);
    expect((await getPracticeDetail(db, u.pmLeader, d.id)).alerts.map((a) => a.canCloseManually)).toEqual([false, true]);
    expect((await getPracticeDetail(db, u.admin, d.id)).alerts.every((a) => a.canCloseManually)).toBe(true);
  });

  it("chiusura manuale: permessi, idempotenza, timeline e conteggio aggiornato", async () => {
    const d = await create("CHIUDI");
    const sop = await addAlert(d.id, d.iterationId, "SOPRALLUOGO", { ownerGroup: "UT_PE" });
    const oda = await addAlert(d.id, d.iterationId, "OFFERTA_ODA");
    await expect(closeAlert(deps, u.ut, sop)).rejects.toMatchObject({ status: 403 });
    await expect(closeAlert(deps, u.iliad, sop)).rejects.toMatchObject({ status: 404 });
    await expect(closeAlert(deps, u.utLeader, "nonvalido")).rejects.toMatchObject({ status: 404 });
    const closed = await closeAlert(deps, u.utLeader, sop, "55555555-5555-4555-8555-555555555555");
    expect(closed).toMatchObject({ status: "CLOSED", closeMode: "MANUAL", closedBy: u.utLeader.id, closedByName: "utLeader", canCloseManually: false });
    const again = await closeAlert(deps, u.utLeader, sop);
    expect(again).toEqual(closed);
    expect(await store.alertEvents(db).countDocuments({ alertId: new ObjectId(sop), kind: "CLOSE" })).toBe(1);
    await expect(closeAlert(deps, u.utLeader, oda)).rejects.toMatchObject({ status: 403 }); // OFFERTA_ODA: solo leader PM/Permessi e ADMIN
    expect((await closeAlert(deps, u.pmLeader, oda)).status).toBe("CLOSED");
    expect((await store.practices(db).findOne({ _id: new ObjectId(d.id) }))!.currentSummary.openAlerts).toBe(0);
    const ev = await getHistory(db, u.pm, d.id, { view: "events" });
    expect(ev.items.filter((e) => e.kind === "ALERT_CLOSE").map((e) => e.userName).sort()).toEqual(["pmLeader", "utLeader"]);
  });

  it("archivio sospende, ripristino riprende (non sono chiusure)", async () => {
    const d = await create("ARCH");
    // A chiusura manuale: il comando di stato riconcilia gli alert (D-137 A-01) e un episodio di regola a chiusura
    // automatica senza trigger verrebbe chiuso; qui interessa solo il ciclo sospensione/ripresa.
    const a1 = await addAlert(d.id, d.iterationId, "OFFERTA_ODA");
    await changeStato(deps, u.pm, d.id, { revision: 1, stato: "TERMINATO" });
    const arch = await archivePractice(deps, u.pm, d.id, { revision: 2 });
    expect(arch.openAlerts).toBe(0);
    expect(arch.alerts.map((a) => [a.status, a.executionStatus])).toEqual([["OPEN", "SUSPENDED"]]);
    expect(await store.alertEvents(db).countDocuments({ alertId: new ObjectId(a1), kind: "SUSPEND" })).toBe(1);
    const back = await restorePractice(deps, u.pm, d.id, { revision: 3 });
    expect(back.openAlerts).toBe(1);
    expect(back.alerts.map((a) => a.executionStatus)).toEqual(["ACTIVE"]);
    expect(await store.alertEvents(db).countDocuments({ alertId: new ObjectId(a1), kind: "RESUME" })).toBe(1);
  });

  it("ripresentazione: gli alert dell'iterazione chiusa diventano SUPERSEDED, la nuova parte senza alert", async () => {
    const d = await create("RESUB");
    const a1 = await addAlert(d.id, d.iterationId, "SOPRALLUOGO");
    const r = await resubmitPractice(deps, u.pmLeader, d.id, { revision: 1 });
    expect(r).toMatchObject({ iteration: 2, alerts: [], openAlerts: 0 });
    expect(await store.alerts(db).findOne({ _id: new ObjectId(a1) })).toMatchObject({ status: "OPEN", executionStatus: "SUPERSEDED" });
    expect((await getPracticeDetail(db, u.pm, d.id, 1)).alerts).toEqual([]);
  });
});
