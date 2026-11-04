// @vitest-environment node
/**
 * B7 sul replica set usa-e-getta: job giornaliero, lock e ripresa, promemoria dopo un fermo, Fatturabile temporale,
 * chiusure da compilazione nel PATCH, Fatturabile KO, autorizzazione delle mail.
 *   MONGO_RS_TEST_URL="mongodb://127.0.0.1:27021/?directConnection=true" yarn vitest run tests/server/alerts-job.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, ObjectId, type Db } from "mongodb";
import type { FieldChange, FieldValue, MembershipDTO, PraticaDetailDTO, UserDTO } from "@/lib/contract";
import { acquireLock } from "@/lib/jobs/lock";
import { deliverBatch } from "@/lib/jobs/outbox-delivery";
import { saveCursor, startRun } from "@/lib/jobs/runs";
import { bootstrapStore, store } from "@/lib/store/db";
import type { StoreUserDoc } from "@/lib/store/types";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";
import { authorizeAlertMail, runAlertDaily } from "@/services/alerts-job";
import { archivePractice, changeStato, createPractice } from "@/services/practices-v2/commands";
import { patchFields } from "@/services/practices-v2/fields";
import { getHistory } from "@/services/practices-v2/history";
import { getPracticeDetail } from "@/services/practices-v2/read";
import { toUserDTO } from "@/services/users-v2";
import { assertDisposableTarget } from "../../scripts/db/guard";

const T = COMPILED_TEMPLATES.INWIT.template;
const key = (flowId: string) => T.occurrences.find((o) => o.kind === "MASTER" && o.flowId === flowId)!.occurrenceKey;
const set = (flowId: string, value: FieldValue): FieldChange => ({ occurrenceKey: key(flowId), flowId, value });
const at = (iso: string) => new Date(iso);

const URL_RS = process.env.MONGO_RS_TEST_URL;
describe.skipIf(!URL_RS)("B7 sul replica set usa-e-getta", () => {
  let client: MongoClient;
  let db: Db;
  const DB = `practicehub_test_b7_${Date.now()}`;
  const u: Record<string, UserDTO> = {};
  const m = (group: MembershipDTO["group"], role: MembershipDTO["role"], leader = false): MembershipDTO => ({ templateId: "INWIT", group, role, leader });
  const deps = (iso: string) => ({ client, db, clock: () => at(iso) });

  async function user(k: string, memberships: MembershipDTO[]) {
    const doc: StoreUserDoc = { _id: new ObjectId(), email: `${k}@test.local`, name: k, passwordHash: null, status: "active", isAdmin: false, memberships, authVersion: 1, createdAt: at("2026-09-01T00:00:00Z"), updatedAt: at("2026-09-01T00:00:00Z") };
    await store.users(db).insertOne(doc);
    u[k] = toUserDTO(doc);
  }
  const create = (codiceSito: string, iso = "2026-09-01T08:00:00Z") =>
    createPractice(deps(iso), u.pm, { templateId: "INWIT", committente: { code: "TODOS" }, clienteFinale: { code: "INWIT" }, codiceG7: "1", codiceSito, nomeSito: "N" });
  const patch = (d: Pick<PraticaDetailDTO, "id" | "iteration" | "revision">, changes: FieldChange[], iso: string, by = u.pm) =>
    patchFields(deps(iso), by, d.id, { iteration: d.iteration, revision: d.revision, changes });
  const alertsOf = (id: string) => store.alerts(db).find({ practiceId: new ObjectId(id) }).toArray();

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    client = await new MongoClient(URL_RS!).connect();
    db = client.db(DB);
    await bootstrapStore(db);
    await user("pmLeader", [m("PM_PERMESSI", "PM", true)]);
    await user("ppLeader", [m("PM_PERMESSI", "PERMESSI", true)]);
    await user("pm", [m("PM_PERMESSI", "PM")]);
    await user("utLeader", [m("UT_PE", "UT", true)]);
    await user("admin", []);
    await store.users(db).updateOne({ _id: new ObjectId(u.admin.id) }, { $set: { isAdmin: true } });
    u.admin = { ...u.admin, isAdmin: true };
  });
  afterAll(async () => {
    await client?.db(DB).dropDatabase();
    await client?.close();
  });

  it("quando gira: solo nei giorni lavorativi dalle 09:00 di Roma", async () => {
    expect((await runAlertDaily({ client, db }, { owner: "w", now: () => at("2026-10-17T08:00:00Z") })).status).toBe("NOT_DUE"); // sabato
    expect((await runAlertDaily({ client, db }, { owner: "w", now: () => at("2026-10-19T06:59:00Z") })).status).toBe("NOT_DUE"); // 08:59 a Roma
  });

  it("apertura a scadenza, destinatari, mail solo per Forecast UT, timeline; un solo giro al giorno; PATCH chiude nello stesso salvataggio", async () => {
    const d = await create("APERTURA");
    const p = await patch(d, [set("F023", "2026-10-01"), set("F092", "2026-10-22")], "2026-10-01T08:00:00Z", u.admin);
    const r = await runAlertDaily({ client, db }, { owner: "w1", now: () => at("2026-10-20T07:00:00Z") });
    expect(r.status).toBe("DONE");
    const alerts = await alertsOf(d.id);
    expect(alerts.map((a) => a.ruleId).sort()).toEqual(["FORECAST_UT", "SOPRALLUOGO"]);
    const sop = alerts.find((a) => a.ruleId === "SOPRALLUOGO")!;
    expect(sop).toMatchObject({ status: "OPEN", dueLocalDate: "2026-10-12", generation: 1, ownerGroup: "PM_PERMESSI" });
    expect(sop.recipientsSnapshot.map(String).sort()).toEqual([u.pmLeader.id, u.ppLeader.id].sort());
    const ut = alerts.find((a) => a.ruleId === "FORECAST_UT")!;
    expect(ut.recipientsSnapshot.map(String).sort()).toEqual([u.pmLeader.id, u.utLeader.id].sort());
    expect(await store.outbox(db).countDocuments({ eventKey: `alert:${ut._id.toHexString()}:OPEN` })).toBe(2);
    expect(await store.outbox(db).countDocuments({ eventKey: `alert:${sop._id.toHexString()}:OPEN` })).toBe(0); // solo in-app
    expect(await store.notifications(db).countDocuments({ eventKey: `alert:${sop._id.toHexString()}:OPEN` })).toBe(2);
    expect((await getPracticeDetail(db, u.pm, d.id)).openAlerts).toBe(2);
    expect((await runAlertDaily({ client, db }, { owner: "w2", now: () => at("2026-10-20T08:00:00Z") })).status).toBe("ALREADY_DONE");
    expect(await alertsOf(d.id)).toHaveLength(2);

    // Chiusura da compilazione nel PATCH (D-97): stessa transazione, timeline, riepilogo; la mail non ancora partita si annulla.
    const cur = await getPracticeDetail(db, u.pm, d.id);
    const closed = await patch(cur, [set("F024", "2026-10-20"), set("F101", "2026-10-20")], "2026-10-20T09:00:00Z", u.admin);
    expect(closed.practice.openAlerts).toBe(0);
    expect((await alertsOf(d.id)).every((a) => a.status === "CLOSED" && a.closeMode === "AUTO")).toBe(true);
    const ev = await getHistory(db, u.pm, d.id, { view: "events" });
    expect(ev.items.filter((e) => e.kind === "ALERT_CLOSE")).toHaveLength(2);
    expect(await authorizeAlertMail(db, { eventKey: `alert:${ut._id.toHexString()}:OPEN` })).toMatch(/chiuso/);
    // D-137 A-07: le mail non ancora in invio si annullano nella transazione della chiusura.
    expect(await store.outbox(db).find({ eventKey: `alert:${ut._id.toHexString()}:OPEN` }).toArray()).toEqual([
      expect.objectContaining({ status: "CANCELLED" }),
      expect.objectContaining({ status: "CANCELLED" }),
    ]);
    const sent: unknown[] = [];
    const report = await deliverBatch({ client, db }, async (m) => void sent.push(m), {
      owner: "t",
      now: () => at("2026-10-20T09:01:00Z"),
      authorize: (i, s) => authorizeAlertMail(db, i, s),
    });
    expect(report.sent).toBe(0);
    expect(sent).toEqual([]);
    expect(p.practice.revision).toBe(2);
  });

  it("due worker insieme: un solo esecutore, nessun doppione", async () => {
    const d = await create("DOPPI");
    await patch(d, [set("F023", "2026-10-01")], "2026-10-01T08:00:00Z");
    const [a, b] = await Promise.all([
      runAlertDaily({ client, db }, { owner: "A", now: () => at("2026-10-21T07:00:00Z") }),
      runAlertDaily({ client, db }, { owner: "B", now: () => at("2026-10-21T07:00:00Z") }),
    ]);
    expect([a.status, b.status], JSON.stringify([a.error, b.error])).toEqual(expect.arrayContaining(["DONE"]));
    expect([a.status, b.status].filter((s) => s === "DONE")).toHaveLength(1);
    expect((await alertsOf(d.id)).filter((x) => x.ruleId === "SOPRALLUOGO")).toHaveLength(1);
  });

  it("ripresa dopo un crash: il giro RUNNING riparte dal cursore e non rifà le pratiche già trattate", async () => {
    const day = "2026-10-22";
    // Il worker precedente ha avviato il giro, salvato il cursore ed è morto con la lease ancora attiva.
    const dead = { client, db, lock: (await acquireLock(db, "alert_daily", "morto", 60_000, at(`${day}T07:00:00Z`)))!, clock: () => at(`${day}T07:00:00Z`) };
    const run = (await startRun(dead, "alert_daily", day))!;
    const all = await store.practices(db).find({ archived: false }, { projection: { _id: 1 } }).sort({ _id: 1 }).toArray();
    await saveCursor(dead, run, { after: all[0]._id.toHexString() });
    expect((await runAlertDaily({ client, db }, { owner: "nuovo", now: () => at(`${day}T07:00:30Z`) })).status).toBe("LOCKED");
    const r = await runAlertDaily({ client, db }, { owner: "nuovo", now: () => at(`${day}T07:02:00Z`) });
    expect(r, r.error).toMatchObject({ status: "DONE", processed: all.length - 1 });
    expect(await store.jobRuns(db).findOne({ jobKey: "alert_daily", localDate: day })).toMatchObject({ status: "DONE", attempts: 2 });
  });

  it("promemoria settimanali dopo un fermo: l'apertura in ritardo assorbe i turni passati; poi uno per turno", async () => {
    const d = await create("OFFERTA");
    await patch(d, [set("F071", "2026-09-01")], "2026-09-01T08:00:00Z");
    await runAlertDaily({ client, db }, { owner: "w", now: () => at("2026-10-23T07:00:00Z") });
    const offerta = (await alertsOf(d.id)).find((a) => a.ruleId === "OFFERTA_ODA")!;
    // D-137 A-11: scadenza 08/09, apertura il 23/10: i sei turni fino al 20/10 sono assorbiti dall'apertura.
    expect(offerta).toMatchObject({ status: "OPEN", dueLocalDate: "2026-09-08", reminderCount: 6, lastReminderAt: at("2026-10-23T07:00:00Z") });
    const reminders = () => store.notifications(db).distinct("eventKey", { eventKey: { $regex: `^alert:${offerta._id.toHexString()}:REMINDER:` } });
    await runAlertDaily({ client, db }, { owner: "w", now: () => at("2026-10-26T08:00:00Z") }); // lunedì: nessun arretrato
    expect(await reminders()).toEqual([]);
    await runAlertDaily({ client, db }, { owner: "w", now: () => at("2026-10-30T08:00:00Z") }); // turno del 27/10 (08/09 + 49 giorni)
    expect(await reminders()).toEqual([`alert:${offerta._id.toHexString()}:REMINDER:2026-10-27`]);
    expect(await store.notifications(db).countDocuments({ eventKey: `alert:${offerta._id.toHexString()}:REMINDER:2026-10-27` })).toBe(2); // PM leader e leader PM/Permessi
    expect((await store.alerts(db).findOne({ _id: offerta._id }))!.reminderCount).toBe(7);
  });

  it("Fatturabile temporale: il giorno dello scatto il job lo porta a SI con storico SYSTEM e nuova revisione", async () => {
    const d = await create("FATT");
    const p = await patch(d, [set("F050", "2026-09-01"), { repeat: "ARPA", op: "ADD_ROW", clientRowKey: "a", values: { F060: { code: "POSITIVO" } } }], "2026-09-15T08:00:00Z");
    expect(p.practice.transversal.fatturabile).toBe("NO");
    const r = await runAlertDaily({ client, db }, { owner: "w", now: () => at("2026-10-27T08:00:00Z") });
    expect(r.fatturabileChanged).toBeGreaterThanOrEqual(1);
    const now = await getPracticeDetail(db, u.pm, d.id);
    expect(now).toMatchObject({ revision: p.practice.revision + 1, transversal: { fatturabile: "SI" } });
    const h = await getHistory(db, u.pm, d.id, { view: "fields" });
    expect(h.items.find((i) => i.transversal === "fatturabile")).toMatchObject({ source: "SYSTEM", newValue: "SI", detail: expect.stringContaining("controllo giornaliero") });
  });

  it("pratica archiviata: nessuna apertura; Fatturabile KO aperto dal comando (D-137 A-01), confermato dal job e chiuso dalla decisione manuale (D-131)", async () => {
    const arch = await create("ARCH");
    const a1 = await patch(arch, [set("F023", "2026-09-01")], "2026-09-01T08:00:00Z");
    const term = await changeStato(deps("2026-09-02T08:00:00Z"), u.pm, arch.id, { revision: a1.practice.revision, stato: "TERMINATO" });
    await archivePractice(deps("2026-09-02T08:00:00Z"), u.pm, arch.id, { revision: term.revision });
    const ko = await create("KO");
    const k1 = await changeStato(deps("2026-09-02T08:00:00Z"), u.pm, ko.id, { revision: 1, stato: "KO" });
    expect((await runAlertDaily({ client, db }, { owner: "w", now: () => at("2026-10-28T08:00:00Z") })).status).toBe("DONE");
    expect(await alertsOf(arch.id)).toEqual([]);
    const fk = (await alertsOf(ko.id)).find((a) => a.ruleId === "FATTURABILE_KO")!;
    expect(fk).toMatchObject({ status: "OPEN", dueAt: null });
    expect(fk.recipientsSnapshot.map(String)).toEqual([u.pmLeader.id]);
    const cur = await getPracticeDetail(db, u.pm, ko.id);
    await patch(cur, [{ transversal: "fatturabile", value: "NO" }], "2026-10-28T09:00:00Z"); // NO → NO: è comunque la decisione
    expect(await store.alerts(db).findOne({ _id: fk._id })).toMatchObject({ status: "CLOSED", closeMode: "AUTO", closedBy: new ObjectId(u.pm.id), closeReason: expect.stringContaining("FIELD_MANUAL") });
    // Ancora KO il giorno dopo: nessun nuovo episodio.
    await runAlertDaily({ client, db }, { owner: "w", now: () => at("2026-10-29T08:00:00Z") });
    expect((await alertsOf(ko.id)).filter((a) => a.ruleId === "FATTURABILE_KO")).toHaveLength(1);
    expect(k1.statoAttivita).toBe("KO");
  });
});
