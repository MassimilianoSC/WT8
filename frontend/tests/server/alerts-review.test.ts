// @vitest-environment node
/**
 * Regressioni della revisione degli alert (docs/proposte/REVISIONE_ALERT_v1.md, D-137): le riproduzioni R01–R14 del
 * revisore riscritte sul comportamento ATTESO, più i collaudi del §4. Replica set usa-e-getta:
 *   MONGO_RS_TEST_URL="mongodb://127.0.0.1:27021/?directConnection=true" yarn vitest run tests/server/alerts-review.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoClient, ObjectId, type Db } from "mongodb";
import type { FieldValue, PraticaDetailDTO, UserDTO } from "@/lib/contract";
import { evaluateTargets, reconcileAlerts, reminderAt, type ExistingAlert } from "@/lib/alerts/engine";
import { ALERT_RULES, bootstrapStore, store } from "@/lib/store/db";
import type { StoreUserDoc } from "@/lib/store/types";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";
import { alertEmail } from "@/lib/email";
import { acquireLock, LockLostError } from "@/lib/jobs/lock";
import { claimNext, deliverBatch, deliverOne, type OutgoingMail } from "@/lib/jobs/outbox-delivery";
import { enqueueDeliveries } from "@/lib/store/outbox";
import { runOperation } from "@/lib/store/transaction";
import { completeRun, failRun, saveCursor, startRun } from "@/lib/jobs/runs";
import { alertLabel, closeAlert } from "@/services/alerts";
import { authorizeAlertMail, processPractice, runAlertDaily } from "@/services/alerts-job";
import { updateAlertRule } from "@/services/alert-rules";
import { archivePractice, changeStato, createPractice, restorePractice, resubmitPractice } from "@/services/practices-v2/commands";
import { patchFields } from "@/services/practices-v2/fields";
import { getPracticeDetail } from "@/services/practices-v2/read";
import { toUserDTO } from "@/services/users-v2";
import { assertDisposableTarget } from "../../scripts/db/guard";
import { requeueOutbox } from "../../scripts/db/outbox-requeue";

// Prove che creano database sul replica set: sotto il carico della suite completa 30 s non bastano (timeout visti
// l'11/10/2026 con la macchina carica). Un blocco vero resta un errore entro 90 s; i limiti espliciti più alti restano.
vi.setConfig({ testTimeout: 90_000 });

const URL_RS = process.env.MONGO_RS_TEST_URL;
const T = COMPILED_TEMPLATES.INWIT.template;
const at = (s: string) => new Date(s);
const t0 = at("2026-10-08T07:00:00Z");

/* ---------- C2, parte pura del motore ---------- */

const v1 = Object.fromEntries(ALERT_RULES.filter((r) => r.templates.includes("INWIT")).map((r) => [r.ruleId, { days: r.days, unit: r.unit, version: 1 }]));
const offertaTargets = (f071: string | null) => evaluateTargets({ templateId: "INWIT", values: { F071: f071 }, repeats: {}, stato: "CREATA", thresholds: v1 }).filter((t) => t.ruleId === "OFFERTA_ODA");
const episode = (o: Partial<ExistingAlert>): ExistingAlert => ({
  id: "x",
  ruleId: "OFFERTA_ODA",
  rowId: null,
  generation: 1,
  status: "OPEN",
  closeMode: null,
  dueAt: null,
  dueLocalDate: "2026-10-08",
  sourceFingerprint: "2026-10-01",
  resolvedAt: null,
  reminderCount: 0,
  ruleVersion: 1,
  openedAt: at("2026-10-08T07:00:00Z"),
  lastReminderAt: at("2026-10-08T07:00:00Z"),
  ...o,
});

describe("D-155 — etichette degli alert", () => {
  it("la soglia della versione al posto di \"giorni\"; singolare; calendario; FATTURABILE_KO leggibile", () => {
    expect(alertLabel("SOPRALLUOGO", { days: 7, unit: "WORKING_DAYS" })).toBe("Data sopralluogo: 7 giorni lavorativi dopo la Data assegnazione");
    expect(alertLabel("ODA_FV_ASSEGNAZIONE", { days: 1, unit: "WORKING_DAYS" })).toBe("Stato ODA da richiedere: 1 giorno lavorativo dopo la Data assegnazione");
    expect(alertLabel("FORECAST_UT", { days: 2, unit: "WORKING_DAYS" })).toBe("Forecast UT: 2 giorni lavorativi prima, se Invio AS/VS è vuoto");
    expect(alertLabel("OFFERTA_ODA", { days: 7, unit: "CALENDAR_DAYS" })).toMatch(/^Invio Offerta: 7 giorni di calendario dopo/);
    expect(alertLabel("FATTURABILE_KO")).toBe("Pratica KO: decidere se è fatturabile");
    // Ogni regola con soglia ha "giorni" nell'etichetta, quindi il numero compare sempre.
    for (const r of ALERT_RULES) expect(alertLabel(r.ruleId, { days: 9, unit: "WORKING_DAYS" }), r.ruleId).toContain("9 giorni lavorativi");
  });
});

describe("C2 — promemoria e soglie, motore puro (A-09, A-10, A-11)", () => {
  it("R04: Offerta svuotata con l'episodio aperto → i promemoria continuano dall'ancora memorizzata", () => {
    const a = episode({});
    const actions = reconcileAlerts(offertaTargets(null), [a], at("2026-10-29T08:00:00Z")); // 09:00 di Roma (ora solare)
    expect(actions).toEqual([
      { type: "MARK_RESOLVED", alertId: "x" },
      { type: "REMIND", alertId: "x", reminderCount: 3, slot: "2026-10-29", nextReminder: reminderAt("2026-10-08", 4) },
    ]);
    // Mai una chiusura automatica (D-133, D-44).
    expect(actions.some((x) => x.type === "CLOSE")).toBe(false);
  });

  it("R05: trigger posticipato dopo tre promemoria → ricorrenza dalla nuova ancora, primo turno 16/11", () => {
    const a = episode({ reminderCount: 3, lastReminderAt: at("2026-10-29T08:00:00Z") });
    const [r] = reconcileAlerts(offertaTargets("2026-11-02"), [a], at("2026-10-30T08:00:00Z"));
    expect(r).toMatchObject({ type: "RESCHEDULE", due: { dueLocalDate: "2026-11-09" }, reminderCount: 0, nextReminder: reminderAt("2026-11-09", 1) });
    const moved = episode({ dueLocalDate: "2026-11-09", sourceFingerprint: "2026-11-02", reminderCount: 0, lastReminderAt: at("2026-10-29T08:00:00Z") });
    expect(reconcileAlerts(offertaTargets("2026-11-02"), [moved], at("2026-11-16T08:00:00Z"))).toEqual([
      { type: "REMIND", alertId: "x", reminderCount: 1, slot: "2026-11-16", nextReminder: reminderAt("2026-11-09", 2) },
    ]);
  });

  it("§4.5: trigger anticipato dopo tre promemoria → i turni già coperti dall'ultimo invio non si ripetono", () => {
    const a = episode({ reminderCount: 3, lastReminderAt: at("2026-10-29T08:00:00Z") });
    // Nuova scadenza 01/10: turni 08/10, 15/10, 22/10, 29/10 già coperti dall'invio del 29/10.
    const [r] = reconcileAlerts(offertaTargets("2026-09-24"), [a], at("2026-10-30T08:00:00Z"));
    expect(r).toMatchObject({ type: "RESCHEDULE", due: { dueLocalDate: "2026-10-01" }, reminderCount: 4, nextReminder: reminderAt("2026-10-01", 5) });
    const moved = episode({ dueLocalDate: "2026-10-01", sourceFingerprint: "2026-09-24", reminderCount: 4, lastReminderAt: at("2026-10-29T08:00:00Z") });
    expect(reconcileAlerts(offertaTargets("2026-09-24"), [moved], at("2026-11-04T08:00:00Z"))).toEqual([]);
    expect(reconcileAlerts(offertaTargets("2026-09-24"), [moved], at("2026-11-05T08:00:00Z"))).toEqual([
      { type: "REMIND", alertId: "x", reminderCount: 5, slot: "2026-11-05", nextReminder: reminderAt("2026-10-01", 6) },
    ]);
  });

  it("R06 (motore): apertura in ritardo → turni trascorsi consumati, nessun promemoria arretrato subito dopo", () => {
    const [o] = reconcileAlerts(offertaTargets("2026-09-01"), [], at("2026-10-08T07:00:00Z"));
    expect(o).toMatchObject({ type: "OPEN", due: { dueLocalDate: "2026-09-08" }, reminderCount: 4, nextReminder: reminderAt("2026-09-08", 5) });
    const opened = episode({ dueLocalDate: "2026-09-08", sourceFingerprint: "2026-09-01", reminderCount: 4 });
    expect(reconcileAlerts(offertaTargets("2026-09-01"), [opened], at("2026-10-08T07:01:00Z"))).toEqual([]);
  });
});

describe.skipIf(!URL_RS)("revisione alert D-137 sul replica set usa-e-getta", () => {
  let client: MongoClient;
  let db: Db;
  const DB = `practicehub_test_alert_review_${Date.now()}`;
  let pm: UserDTO, pp: UserDTO, admin: UserDTO;

  const deps = (s = "2026-10-08T07:00:00Z") => ({ client, db, clock: () => at(s) });
  const set = (flowId: string, value: FieldValue) => ({
    flowId,
    occurrenceKey: T.occurrences.find((o) => o.kind === "MASTER" && o.flowId === flowId)!.occurrenceKey,
    value,
  });
  const fatturabile = (value: "SI" | "NO") => ({ transversal: "fatturabile" as const, value });
  const create = (sito: string) =>
    createPractice(deps(), pm, { templateId: "INWIT", committente: { code: "TODOS" }, clienteFinale: { code: "INWIT" }, codiceG7: "1", codiceSito: sito, nomeSito: "N" });
  const patch = async (d: PraticaDetailDTO, changes: unknown[], time = "2026-10-08T08:00:00Z") =>
    (await patchFields(deps(time), admin, d.id, { iteration: d.iteration, revision: d.revision, changes } as never)).practice;
  const stato = (d: PraticaDetailDTO, s: "KO" | "ASSEGNATO" | "TERMINATO", time = "2026-10-08T08:00:00Z") =>
    changeStato(deps(time), pm, d.id, { revision: d.revision, stato: s });
  const koAlerts = (id: string) => store.alerts(db).find({ practiceId: new ObjectId(id), ruleId: "FATTURABILE_KO" }).sort({ generation: 1 }).toArray();

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    client = await new MongoClient(URL_RS!).connect();
    db = client.db(DB);
    await bootstrapStore(db);
    const user = async (name: string, role: "PM" | "PERMESSI", isAdmin = false) => {
      const doc: StoreUserDoc = {
        _id: new ObjectId(),
        name,
        email: `${name.toLowerCase()}@test.local`,
        passwordHash: null,
        status: "active",
        isAdmin,
        memberships: isAdmin ? [] : [{ templateId: "INWIT", group: "PM_PERMESSI", role, leader: true }],
        authVersion: 1,
        createdAt: t0,
        updatedAt: t0,
      };
      await store.users(db).insertOne(doc);
      return toUserDTO(doc);
    };
    pm = await user("PM", "PM");
    pp = await user("PP", "PERMESSI");
    admin = await user("ADMIN", "PM", true);
  });
  afterAll(async () => {
    await client?.db(DB).dropDatabase();
    await client?.close();
  });

  describe("C1 — ciclo KO (A-01, A-02, A-03)", () => {
    it("R01: il comando KO apre subito; l'uscita da KO prima del job non perde l'episodio", async () => {
      const d = await create("R01");
      const k = await stato(d, "KO");
      const opened = await koAlerts(d.id);
      expect(opened).toHaveLength(1);
      expect(opened[0]).toMatchObject({ status: "OPEN", generation: 1, openedAt: at("2026-10-08T08:00:00Z") });
      expect(k.openAlerts).toBe(1);
      await stato(k, "ASSEGNATO", "2026-10-08T09:00:00Z");
      expect((await runAlertDaily({ client, db }, { owner: "r01", now: () => at("2026-10-09T07:00:00Z") })).status).toBe("DONE");
      const after = await koAlerts(d.id);
      // Resta aperto finché il PM non decide Fatturabile (D-131), ma la situazione è risolta: al rientro una generazione nuova.
      expect(after).toHaveLength(1);
      expect(after[0].status).toBe("OPEN");
      expect(after[0].resolvedAt).toEqual(at("2026-10-08T09:00:00Z"));
    });

    it("§4.1: uscita da KO con l'episodio ancora aperto, poi decisione → al nuovo KO la seconda generazione", async () => {
      let d = await create("KOOUT");
      d = await stato(d, "KO");
      d = await stato(d, "ASSEGNATO", "2026-10-08T09:00:00Z");
      d = await patch(d, [fatturabile("SI")], "2026-10-08T09:30:00Z");
      expect((await koAlerts(d.id))[0]).toMatchObject({ status: "CLOSED", resolvedAt: at("2026-10-08T09:00:00Z") });
      d = await stato(d, "KO", "2026-10-08T10:00:00Z");
      expect((await koAlerts(d.id)).map((a) => [a.generation, a.status])).toEqual([
        [1, "CLOSED"],
        [2, "OPEN"],
      ]);
    });

    it("§4.1: uscita e rientro in KO prima della decisione → stesso episodio; dopo la decisione nessuna riapertura", async () => {
      let d = await create("KOBACK");
      d = await stato(d, "KO");
      d = await stato(d, "ASSEGNATO", "2026-10-08T09:00:00Z");
      d = await stato(d, "KO", "2026-10-08T10:00:00Z");
      let ko = await koAlerts(d.id);
      expect(ko).toHaveLength(1);
      expect(ko[0]).toMatchObject({ status: "OPEN", resolvedAt: null });
      expect((await store.alertEvents(db).find({ alertId: ko[0]._id }).sort({ eventIndex: 1 }).toArray()).map((e) => e.kind)).toEqual(["OPEN", "RESOLVED", "UNRESOLVED"]);
      d = await patch(d, [fatturabile("NO")], "2026-10-08T10:30:00Z");
      await patch(d, [set("F003", "N2")], "2026-10-08T10:31:00Z");
      ko = await koAlerts(d.id);
      expect(ko.map((a) => [a.generation, a.status])).toEqual([[1, "CLOSED"]]);
    });

    it("R01b: decisione, uscita e rientro manuali → seconda generazione", async () => {
      let d = await create("R01b");
      d = await stato(d, "KO");
      d = await patch(d, [fatturabile("NO")]);
      let ko = await koAlerts(d.id);
      expect(ko[0]).toMatchObject({ status: "CLOSED", closeReason: "FIELD_MANUAL: decisione manuale su Fatturabile", resolvedAt: null });
      d = await stato(d, "ASSEGNATO", "2026-10-08T09:00:00Z");
      ko = await koAlerts(d.id);
      // L'uscita da KO si registra subito (D-137 A-01), senza attendere un salvataggio o il job.
      expect(ko[0].resolvedAt).toEqual(at("2026-10-08T09:00:00Z"));
      d = await stato(d, "KO", "2026-10-08T10:00:00Z");
      ko = await koAlerts(d.id);
      expect(ko.map((a) => [a.generation, a.status])).toEqual([
        [1, "CLOSED"],
        [2, "OPEN"],
      ]);
      // Il blocco manuale della decisione precedente non annulla la richiesta nuova (A-03).
      expect(d.transversal.fatturabileManual).toBe(true);
    });

    it("R02: FATTURABILE_KO non si chiude con la rotta generica, nemmeno l'ADMIN; canCloseManually false", async () => {
      let d = await create("R02");
      d = await stato(d, "KO");
      const a = (await koAlerts(d.id))[0];
      await expect(closeAlert({ client, db }, pp, a._id.toHexString())).rejects.toMatchObject({ status: 403 });
      await expect(closeAlert({ client, db }, admin, a._id.toHexString())).rejects.toMatchObject({ status: 403 });
      expect((await koAlerts(d.id))[0].status).toBe("OPEN");
      const seen = await getPracticeDetail(db, admin, d.id);
      expect(seen.alerts.find((x) => x.rule === "FATTURABILE_KO")).toMatchObject({ canCloseManually: false, label: "Pratica KO: decidere se è fatturabile" });
      // L'unica via: la decisione su Fatturabile (qui NO → NO).
      expect(d.transversal.fatturabile).toBe("NO");
      await patch(seen, [fatturabile("NO")]);
      expect((await koAlerts(d.id))[0]).toMatchObject({ status: "CLOSED", closedBy: new ObjectId(admin.id) });
    });

    it("R03: KO automatico e decisione nello stesso PATCH → episodio nato chiuso, nessuna richiesta inviata", async () => {
      const d = await create("R03");
      const r = await patch(d, [set("F069", { code: "KO" }), set("F070", "2026-10-08"), fatturabile("NO")]);
      expect(r.statoAttivita).toBe("KO");
      expect(r.transversal.fatturabileManual).toBe(true);
      const ko = await koAlerts(d.id);
      expect(ko).toHaveLength(1);
      expect(ko[0]).toMatchObject({ status: "CLOSED", closeMode: "AUTO", closeReason: "FIELD_MANUAL: decisione manuale su Fatturabile" });
      expect(r.openAlerts).toBe(0);
      expect(await store.notifications(db).countDocuments({ eventKey: `alert:${ko[0]._id.toHexString()}:OPEN` })).toBe(0);
      const kinds = (await store.alertEvents(db).find({ alertId: ko[0]._id }).sort({ eventIndex: 1 }).toArray()).map((e) => e.kind);
      expect(kinds[0]).toBe("OPEN");
      expect(kinds.at(-1)).toBe("CLOSE");
    });

    it("R03b: decisione successiva all'ingresso in KO, prima del job → episodio chiuso", async () => {
      let d = await create("R03b");
      d = await stato(d, "KO");
      expect((await koAlerts(d.id))[0].status).toBe("OPEN");
      d = await patch(d, [fatturabile("NO")], "2026-10-08T08:01:00Z");
      expect((await koAlerts(d.id))[0]).toMatchObject({ status: "CLOSED", closedAt: at("2026-10-08T08:01:00Z") });
      expect(d.openAlerts).toBe(0);
    });

    it("§4.1: KO seguito subito dall'archivio → l'episodio esiste ed è sospeso; il job non lo tocca", async () => {
      let d = await create("KOARCH");
      d = await stato(d, "KO");
      d = await archivePractice(deps("2026-10-08T08:01:00Z"), pm, d.id, { revision: d.revision });
      expect(await koAlerts(d.id)).toEqual([expect.objectContaining({ status: "OPEN", executionStatus: "SUSPENDED" })]);
      await runAlertDaily({ client, db }, { owner: "koarch", now: () => at("2026-10-12T07:00:00Z") });
      expect(await koAlerts(d.id)).toEqual([expect.objectContaining({ status: "OPEN", executionStatus: "SUSPENDED" })]);
    });

    it("§4.1: KO automatico rientrato e di nuovo KO senza salvataggi estranei → due generazioni", async () => {
      let d = await create("KOAUTO");
      d = await patch(d, [set("F069", { code: "KO" }), set("F070", "2026-10-08")]);
      expect((await koAlerts(d.id)).map((a) => a.status)).toEqual(["OPEN"]);
      d = await patch(d, [fatturabile("SI")], "2026-10-08T08:05:00Z");
      d = await patch(d, [set("F069", null), set("F070", null)], "2026-10-08T08:10:00Z");
      expect(d.statoAttivita).not.toBe("KO");
      expect((await koAlerts(d.id))[0].resolvedAt).toEqual(at("2026-10-08T08:10:00Z"));
      d = await patch(d, [set("F069", { code: "KO" }), set("F070", "2026-10-09")], "2026-10-09T08:00:00Z");
      expect((await koAlerts(d.id)).map((a) => [a.generation, a.status])).toEqual([
        [1, "CLOSED"],
        [2, "OPEN"],
      ]);
    });
  });

  describe("C3 — fencing (A-06, A-08)", () => {
    const hex = (n: number) => n.toString(16).padStart(24, "0");

    it("R09: dopo il takeover il vecchio titolare non sposta il cursore né decide l'esito; il cursore va solo avanti", async () => {
      const job = async (owner: string, s: string) => ({ client, db, lock: (await acquireLock(db, "R09", owner, 60_000, at(s)))!, clock: () => at(s) });
      const old = await job("old", "2026-10-08T07:00:00Z");
      const run = (await startRun(old, "R09", "2026-10-08"))!;
      await saveCursor(old, run, { after: hex(1) });
      const fresh = await job("new", "2026-10-08T07:02:00Z");
      expect(fresh.lock.fencingToken).toBeGreaterThan(old.lock.fencingToken);
      expect(await startRun(fresh, "R09", "2026-10-08")).toMatchObject({ _id: run._id, cursor: { after: hex(1) }, fencingToken: fresh.lock.fencingToken });
      await saveCursor(fresh, run, { after: hex(5) });
      const late = { ...old, clock: () => at("2026-10-08T07:02:10Z") };
      await expect(saveCursor(late, run, { after: hex(9) })).rejects.toBeInstanceOf(LockLostError);
      await expect(completeRun(late, run)).rejects.toBeInstanceOf(LockLostError);
      expect(await failRun(late, run, new Error("tardivo"))).toBe(false);
      // Il titolare non torna indietro (un cursore più vecchio è un errore, non una sovrascrittura).
      await expect(saveCursor(fresh, run, { after: hex(3) })).rejects.toBeInstanceOf(LockLostError);
      await saveCursor(fresh, run, { after: hex(5) }); // stesso cursore: ritentativo ammesso
      expect(await store.jobRuns(db).findOne({ _id: run._id })).toMatchObject({ status: "RUNNING", cursor: { after: hex(5) } });
      await completeRun(fresh, run);
      expect(await failRun(fresh, run, new Error("dopo DONE"))).toBe(false);
      expect(await store.jobRuns(db).findOne({ _id: run._id })).toMatchObject({ status: "DONE", error: null });
    });

    it("R09b: takeover durante l'ultima scansione → il vecchio non marca DONE; il nuovo titolare completa", async () => {
      const emptyDb = client.db(`${DB}_empty`);
      await bootstrapStore(emptyDb);
      const original = store.practices;
      let late = false;
      try {
        store.practices = ((target: Db) =>
          target.databaseName === emptyDb.databaseName
            ? {
                find: () => ({
                  sort: () => ({
                    limit: () => ({
                      toArray: async () => {
                        if (!late) {
                          late = true;
                          await acquireLock(emptyDb, "alert_daily", "new", 60_000, at("2026-10-08T07:02:00Z"));
                        }
                        return [];
                      },
                    }),
                  }),
                }),
              }
            : original(target)) as typeof store.practices;
        const report = await runAlertDaily({ client, db: emptyDb }, { owner: "old", leaseMs: 60_000, now: () => (late ? at("2026-10-08T07:02:00Z") : t0) });
        expect(report.status).toBe("FAILED");
        expect(await store.jobRuns(emptyDb).findOne({ jobKey: "alert_daily", localDate: "2026-10-08" })).toMatchObject({ status: "RUNNING", error: null });
      } finally {
        store.practices = original;
      }
      const resumed = await runAlertDaily({ client, db: emptyDb }, { owner: "new", leaseMs: 60_000, now: () => at("2026-10-08T07:03:00Z") });
      expect(resumed.status).toBe("DONE");
      expect(await store.jobRuns(emptyDb).findOne({ jobKey: "alert_daily", localDate: "2026-10-08" })).toMatchObject({ status: "DONE", attempts: 2 });
      await emptyDb.dropDatabase();
    }, 90_000); // da solo ~14 s; sotto il carico della suite superava i 30 s

    it("R10: lease scaduta senza takeover → la pratica non si scrive (ora corrente, non quella dell'operazione)", async () => {
      const created = await create("R10");
      const d = await patch(created, [set("F050", "2026-09-01"), { repeat: "ARPA", op: "ADD_ROW", clientRowKey: "a", values: { F060: { code: "POSITIVO" } } }], "2026-09-15T08:00:00Z");
      expect(d.transversal.fatturabile).toBe("NO");
      const h = (await acquireLock(db, "R10", "old", 60_000, t0))!;
      const functional = t0;
      await expect(processPractice({ client, db }, h, new ObjectId(d.id), "2026-10-08", functional, () => at("2026-10-08T07:01:01Z"))).rejects.toBeInstanceOf(LockLostError);
      expect((await getPracticeDetail(db, pm, d.id)).transversal.fatturabile).toBe("NO");
      expect(await store.operations(db).findOne({ actorId: "system:alert_daily", practiceId: new ObjectId(d.id) })).toBeNull();
      // Con la lease valida la stessa operazione passa (stessa ora funzionale).
      await processPractice({ client, db }, h, new ObjectId(d.id), "2026-10-08", functional, () => at("2026-10-08T07:00:30Z"));
      expect((await getPracticeDetail(db, pm, d.id)).transversal.fatturabile).toBe("SI");
    });

    it("§4.2: lavoro lungo → la lease si rinnova prima della metà, senza perdere il giro", async () => {
      for (let i = 0; i < 5; i++) await create(`LUNGO${i}`);
      const day = "2026-10-13";
      let ms = Date.parse(`${day}T07:00:00Z`);
      // Ogni lettura dell'orologio avanza di 5 s: il giro intero dura molte volte la lease di 60 s.
      const report = await runAlertDaily({ client, db }, { owner: "lento", leaseMs: 60_000, chunk: 2, now: () => new Date((ms += 5_000)) });
      expect(report.status, report.error).toBe("DONE");
      expect(report.processed).toBeGreaterThan(3);
      expect(ms - Date.parse(`${day}T07:00:00Z`)).toBeGreaterThan(3 * 60_000);
      expect(await store.jobRuns(db).findOne({ jobKey: "alert_daily", localDate: day })).toMatchObject({ status: "DONE" });
    });
  });

  describe("C2 — promemoria e soglie sul database (A-09, A-11, A-13)", () => {
    const alertOf = async (id: string, ruleId: string) => (await store.alerts(db).findOne({ practiceId: new ObjectId(id), ruleId }))!;
    const reminders = (alertId: ObjectId) => store.notifications(db).distinct("eventKey", { eventKey: { $regex: `^alert:${alertId.toHexString()}:REMINDER:` } });

    it("R06: apertura in ritardo e secondo salvataggio un minuto dopo → nessun promemoria arretrato", async () => {
      const d = await create("R06");
      const first = await patch(d, [set("F071", "2026-09-01")], "2026-10-08T07:00:00Z");
      await patch(first, [set("F003", "N2")], "2026-10-08T07:01:00Z");
      const a = await alertOf(d.id, "OFFERTA_ODA");
      expect(a).toMatchObject({ status: "OPEN", dueLocalDate: "2026-09-08", reminderCount: 4 });
      expect(await reminders(a._id)).toEqual([]);
    });

    it("R04 (servizio): Offerta svuotata → resta aperta e il promemoria della settimana dopo parte comunque", async () => {
      const d = await create("R04");
      const p = await patch(d, [set("F071", "2026-10-01")], "2026-10-08T07:00:00Z");
      await patch(p, [set("F071", null)], "2026-10-09T08:00:00Z");
      const a = await alertOf(d.id, "OFFERTA_ODA");
      expect(a).toMatchObject({ status: "OPEN", resolvedAt: at("2026-10-09T08:00:00Z") });
      await runAlertDaily({ client, db }, { owner: "r04", now: () => at("2026-10-15T07:00:00Z") });
      expect(await reminders(a._id)).toEqual([`alert:${a._id.toHexString()}:REMINDER:2026-10-15`]);
    });

    it("R12: soglia cambiata dopo l'apertura, poi trigger corretto → scadenza con la soglia della SUA versione", async () => {
      const d = await create("R12");
      const first = await patch(d, [set("F023", "2026-10-01")], "2026-10-20T07:00:00Z");
      const a = await alertOf(d.id, "SOPRALLUOGO");
      expect(a).toMatchObject({ ruleVersion: 1, dueLocalDate: "2026-10-12" });
      await updateAlertRule({ client, db }, admin, "SOPRALLUOGO", "INWIT", { days: 1, revision: 1 } as never);
      await patch(first, [set("F023", "2026-10-02")], "2026-10-20T07:01:00Z");
      expect(await store.alerts(db).findOne({ _id: a._id })).toMatchObject({ ruleVersion: 1, dueLocalDate: "2026-10-13" });
      const ev = await store.alertEvents(db).findOne({ alertId: a._id, kind: "RESCHEDULE" });
      expect(ev?.detail).toMatchObject({ ruleVersion: 1, threshold: { days: 7, unit: "WORKING_DAYS" }, trigger: "2026-10-02", dueLocalDate: "2026-10-13" });
      // §4.6: un episodio nuovo usa la soglia nuova (v2: 1 giorno lavorativo).
      const other = await create("R12bis");
      await patch(other, [set("F023", "2026-10-01")], "2026-10-20T07:02:00Z");
      expect(await alertOf(other.id, "SOPRALLUOGO")).toMatchObject({ ruleVersion: 2, dueLocalDate: "2026-10-02" });
      // D-155: l'etichetta riporta la soglia della versione di ciascun episodio, anche nelle notifiche.
      expect((await getPracticeDetail(db, admin, d.id)).alerts.find((x) => x.rule === "SOPRALLUOGO")?.label).toBe("Data sopralluogo: 7 giorni lavorativi dopo la Data assegnazione");
      expect((await getPracticeDetail(db, admin, other.id)).alerts.find((x) => x.rule === "SOPRALLUOGO")?.label).toBe("Data sopralluogo: 1 giorno lavorativo dopo la Data assegnazione");
      const n = await store.notifications(db).findOne({ eventKey: `alert:${(await alertOf(other.id, "SOPRALLUOGO"))._id.toHexString()}:OPEN` });
      expect(n?.title).toBe("Alert: Data sopralluogo: 1 giorno lavorativo dopo la Data assegnazione");
    });

    it("§4.5: archivio per settimane e ripristino → un solo promemoria di recupero, nessuna raffica", async () => {
      let d = await create("ARCHREM");
      d = await patch(d, [set("F071", "2026-10-01")], "2026-10-08T07:00:00Z");
      const a = await alertOf(d.id, "OFFERTA_ODA");
      d = await stato(d, "TERMINATO", "2026-10-08T08:00:00Z");
      d = await archivePractice(deps("2026-10-08T09:00:00Z"), pm, d.id, { revision: d.revision });
      await restorePractice(deps("2026-11-09T07:30:00Z"), pm, d.id, { revision: d.revision });
      await runAlertDaily({ client, db }, { owner: "archrem", now: () => at("2026-11-10T08:00:00Z") });
      expect(await reminders(a._id)).toEqual([`alert:${a._id.toHexString()}:REMINDER:2026-11-05`]);
    });
  });

  describe("C4 — recapito (A-04, A-05, A-07, A-12, A-14)", () => {
    const deps = () => ({ client, db });
    const enqueue = (eventKey: string, user: UserDTO = pm) =>
      runOperation(client, db, { actorId: "review", request: { eventKey }, now: t0, skipBootstrap: true }, (ctx) =>
        enqueueDeliveries(ctx, [{ eventKey, userId: new ObjectId(user.id), payload: { to: user.email, subject: eventKey, html: "<p>x</p>" } }])
      );
    const outcomes = async (eventKey: RegExp | string) =>
      (await store.deliveryEvents(db).find({ eventKey }).sort({ at: 1, _id: 1 }).toArray()).map((e) => e.outcome);
    const authorize = (i: Parameters<typeof authorizeAlertMail>[1], s?: Parameters<typeof authorizeAlertMail>[2]) => authorizeAlertMail(db, i, s);
    /** Pratica con FORECAST_UT aperto (mail obbligatoria, D-46) alla data indicata. */
    const withUtAlert = async (sito: string, time: string) => {
      const d = await create(sito);
      await patch(d, [set("F092", "2026-10-08")], time);
      const a = (await store.alerts(db).findOne({ practiceId: new ObjectId(d.id), ruleId: "FORECAST_UT" }))!;
      expect(a.status).toBe("OPEN");
      return { d, a, mails: () => store.outbox(db).find({ alertId: a._id }).toArray() };
    };

    it("R07: il vecchio worker con claim superato non invia dopo il SENT del nuovo", async () => {
      await enqueue("R07");
      const old = (await claimNext(db, t0, 60_000))!;
      const sent: string[] = [];
      const sender = async (m: OutgoingMail) => void sent.push(m.messageId);
      expect(await deliverBatch(deps(), sender, { owner: "new", now: () => at("2026-10-08T07:02:00Z"), batchSize: 1 })).toMatchObject({ sent: 1 });
      expect(await deliverOne(deps(), old, sender, { owner: "old", now: () => at("2026-10-08T07:03:00Z") })).toBe("lost");
      expect(sent).toHaveLength(1);
      expect(await outcomes("R07")).toEqual(["SENDING", "SENT", "LOST"]);
    });

    it("§4.3: claim scaduto prima di qualunque invio → lo riprende un altro, il vecchio non invia", async () => {
      await enqueue("R07b");
      const old = (await claimNext(db, t0, 60_000))!;
      const fresh = (await claimNext(db, at("2026-10-08T07:01:01Z"), 60_000))!;
      expect(fresh.claimToken).not.toBe(old.claimToken);
      const sent: OutgoingMail[] = [];
      expect(await deliverOne(deps(), old, async (m) => void sent.push(m), { owner: "old", now: () => at("2026-10-08T07:01:02Z") })).toBe("lost");
      expect(await deliverOne(deps(), fresh, async (m) => void sent.push(m), { owner: "new", now: () => at("2026-10-08T07:01:02Z") })).toBe("sent");
      expect(sent).toHaveLength(1);
    });

    it("R08: SMTP giù per ore → nessuna perdita; un solo avviso agli ADMIN dopo un'ora; al ripristino parte", async () => {
      await enqueue("R08");
      const fail = async () => {
        throw new Error("SMTP 451 temporaneo");
      };
      let ms = t0.getTime();
      for (let i = 0; i < 12; i++) {
        await deliverBatch(deps(), fail, { owner: "r08", now: () => new Date(ms), backoffMs: () => 0, batchSize: 1 });
        ms += 15 * 60_000; // tre ore in tutto
      }
      expect(await store.outbox(db).findOne({ eventKey: "R08" })).toMatchObject({ status: "PENDING", attempts: 12, warnedAt: expect.any(Date) });
      const warnings = await store.notifications(db).find({ userId: new ObjectId(admin.id), kind: "SYSTEM", eventKey: /^delivery-failing:/ }).toArray();
      expect(warnings).toHaveLength(1);
      expect(warnings[0].link).toBeNull();
      const sent: OutgoingMail[] = [];
      await deliverBatch(deps(), async (m) => void sent.push(m), { owner: "r08", now: () => at("2026-10-09T07:00:00Z") });
      expect(sent.map((m) => m.subject)).toEqual(["R08"]);
      expect((await outcomes("R08")).filter((o) => o === "RETRY")).toHaveLength(12);
    });

    it("A-05: errore permanente → FAILED con avviso; outbox:requeue (dry-run, poi --yes) la rimette in coda e parte", async () => {
      await enqueue("PERM");
      const reject = async () => {
        throw Object.assign(new Error("550 5.1.1 mailbox inesistente"), { responseCode: 550 });
      };
      expect(await deliverBatch(deps(), reject, { owner: "perm", now: () => t0, batchSize: 1 })).toMatchObject({ failed: 1 });
      const doc = (await store.outbox(db).findOne({ eventKey: "PERM" }))!;
      expect(doc.status).toBe("FAILED");
      expect(await store.notifications(db).countDocuments({ userId: new ObjectId(admin.id), eventKey: `delivery-failed:${doc._id.toHexString()}` })).toBe(1);
      const quiet = () => {};
      const dry = await requeueOutbox(db, { ids: [doc._id.toHexString()], log: quiet });
      expect(dry).toMatchObject({ executed: false, requeued: 0, matched: [expect.objectContaining({ eventKey: "PERM" })] });
      expect((await store.outbox(db).findOne({ _id: doc._id }))!.status).toBe("FAILED");
      const done = await requeueOutbox(db, { ids: [doc._id.toHexString()], yes: true, now: at("2026-10-08T07:30:00Z"), by: "prova", log: quiet });
      expect(done.requeued).toBe(1);
      expect(await store.outbox(db).findOne({ _id: doc._id })).toMatchObject({ status: "PENDING", nextAttemptAt: at("2026-10-08T07:30:00Z") });
      const sent: OutgoingMail[] = [];
      await deliverBatch(deps(), async (m) => void sent.push(m), { owner: "perm", now: () => at("2026-10-08T07:31:00Z") });
      expect(sent.map((m) => m.subject)).toEqual(["PERM"]);
      expect(await outcomes("PERM")).toEqual(["SENDING", "FAILED", "REQUEUED", "SENDING", "SENT"]);
      await expect(requeueOutbox(db, { log: quiet })).rejects.toThrow(/--failed/);
    });

    it("R14: il successo dopo un errore non cancella la diagnosi: eventi RETRY con motivo, poi SENDING e SENT", async () => {
      await enqueue("R14");
      await deliverBatch(deps(), async () => {
        throw new Error("SMTP 451 causa-da-conservare");
      }, { owner: "r14", now: () => t0, backoffMs: () => 0, batchSize: 1 });
      await deliverBatch(deps(), async () => {}, { owner: "r14", now: () => at("2026-10-08T07:01:00Z"), batchSize: 1 });
      expect(await store.outbox(db).findOne({ eventKey: "R14" })).toMatchObject({ status: "SENT", attempts: 2 });
      const ev = await store.deliveryEvents(db).find({ eventKey: "R14" }).sort({ at: 1, _id: 1 }).toArray();
      expect(ev.map((e) => [e.outcome, e.attempt])).toEqual([
        ["SENDING", 1],
        ["RETRY", 1],
        ["SENDING", 2],
        ["SENT", 2],
      ]);
      expect(ev[1]).toMatchObject({ reason: expect.stringContaining("causa-da-conservare"), at: t0, by: "r14" });
      // Solo metadati: nessun contenuto della mail negli eventi.
      expect(JSON.stringify(ev)).not.toContain("<p>");
    });

    it("R11: alert arretrato aperto sabato alle 08:00 → la mail parte lunedì alle 09:00, non prima", async () => {
      const { mails } = await withUtAlert("R11", "2026-10-10T06:00:00Z");
      expect((await mails()).map((m) => m.nextAttemptAt)).toEqual((await mails()).map(() => at("2026-10-12T07:00:00Z")));
      const sent: OutgoingMail[] = [];
      const send = async (m: OutgoingMail) => void sent.push(m);
      await deliverBatch(deps(), send, { owner: "weekend", now: () => at("2026-10-10T06:00:00Z"), authorize });
      await deliverBatch(deps(), send, { owner: "weekend", now: () => at("2026-10-12T06:59:00Z"), authorize });
      expect(sent).toEqual([]);
      await deliverBatch(deps(), send, { owner: "lunedi", now: () => at("2026-10-12T07:00:00Z"), authorize });
      expect(sent.length).toBe((await mails()).length);
      expect(sent.length).toBeGreaterThan(0);
    });

    it("§4.7: ritentativo che cade nel fine settimana → rinviato a lunedì; le mail non di alert partono subito", async () => {
      const { mails } = await withUtAlert("R11b", "2026-10-09T15:00:00Z"); // venerdì 17:00
      await deliverBatch(deps(), async () => {
        throw new Error("SMTP 451");
      }, { owner: "ven", now: () => at("2026-10-09T15:00:00Z"), backoffMs: () => 24 * 3_600_000, authorize });
      for (const m of await mails()) expect(m).toMatchObject({ status: "PENDING", nextAttemptAt: at("2026-10-12T07:00:00Z") });
      // Fuori orario anche se presa in carico (es. orologio avanti): rinviata, non fallita.
      await store.outbox(db).updateMany({ alertId: (await mails())[0].alertId }, { $set: { nextAttemptAt: at("2026-10-10T08:00:00Z") } });
      const r = await deliverBatch(deps(), async () => {}, { owner: "sab", now: () => at("2026-10-10T08:00:00Z"), authorize });
      expect(r.deferred).toBe((await mails()).length);
      for (const m of await mails()) expect(m).toMatchObject({ status: "PENDING", nextAttemptAt: at("2026-10-12T07:00:00Z") });
      // Un invito o un'Assegna (non di alert) il sabato parte subito.
      await runOperation(client, db, { actorId: "review", request: { invite: 1 }, now: at("2026-10-10T08:00:00Z"), skipBootstrap: true }, (ctx) =>
        enqueueDeliveries(ctx, [{ eventKey: "invite:sabato", userId: new ObjectId(pp.id), payload: { to: pp.email, subject: "invito", html: "<p>x</p>" } }])
      );
      const sent: OutgoingMail[] = [];
      await deliverBatch(deps(), async (m) => void sent.push(m), { owner: "sab", now: () => at("2026-10-10T08:00:01Z"), authorize });
      expect(sent.map((m) => m.subject)).toEqual(["invito"]);
    });

    it("R13: chiusura committata tra il controllo e l'invio → nessuna mail (confine di emissione)", async () => {
      const { a, mails } = await withUtAlert("R13", "2026-10-08T08:00:00Z");
      const sent: OutgoingMail[] = [];
      const r = await deliverBatch(deps(), async (m) => void sent.push(m), {
        owner: "r13",
        now: () => at("2026-10-08T08:01:00Z"),
        authorize: async (item, session) => {
          const decision = await authorizeAlertMail(db, item, session);
          // La chiusura (altra transazione) si committa mentre il passaggio a SENDING è in corso.
          await closeAlert({ client, db }, admin, a._id.toHexString());
          return decision;
        },
      });
      expect(sent).toEqual([]);
      expect(r.sent).toBe(0);
      for (const m of await mails()) expect(m.status).toBe("CANCELLED");
    });

    it("§4.3: chiusura DOPO il confine di emissione → la mail già in invio non si ritira (D-90)", async () => {
      const { a, mails } = await withUtAlert("R13b", "2026-10-08T08:00:00Z");
      const sent: OutgoingMail[] = [];
      await deliverBatch(deps(), async (m) => {
        await closeAlert({ client, db }, admin, a._id.toHexString());
        sent.push(m);
      }, { owner: "r13b", now: () => at("2026-10-08T08:01:00Z"), authorize, batchSize: 1 });
      expect(sent).toHaveLength(1);
      // La mail in invio resta SENT; le eventuali altre dello stesso alert, non ancora in invio, sono annullate.
      const statuses = (await mails()).map((m) => m.status);
      expect(statuses.filter((x) => x === "SENT")).toHaveLength(1);
      expect(statuses.every((x) => x === "SENT" || x === "CANCELLED")).toBe(true);
    });

    it("§4.3: archivio, ripresentazione o destinatario disattivato tra presa in carico e invio → nessuna mail", async () => {
      // Archivio.
      let { d, mails } = await withUtAlert("R13c", "2026-10-08T08:00:00Z");
      const claimed = (await claimNext(db, at("2026-10-08T08:01:00Z")))!;
      expect(String(claimed.alertId)).toBe(String((await mails())[0].alertId));
      let cur = await stato(await getPracticeDetail(db, pm, d.id), "TERMINATO", "2026-10-08T08:01:10Z");
      await archivePractice(deps(), pm, d.id, { revision: cur.revision });
      const sent: OutgoingMail[] = [];
      expect(await deliverOne(deps(), claimed, async (m) => void sent.push(m), { owner: "x", now: () => at("2026-10-08T08:01:20Z"), authorize })).toBe("lost");
      for (const m of await mails()) expect(m.status).toBe("CANCELLED");
      // Ripresentazione.
      ({ d, mails } = await withUtAlert("R13d", "2026-10-08T08:00:00Z"));
      cur = await getPracticeDetail(db, pm, d.id);
      await resubmitPractice(deps(), pm, d.id, { revision: cur.revision });
      await deliverBatch(deps(), async (m) => void sent.push(m), { owner: "x", now: () => at("2026-10-08T08:02:00Z"), authorize });
      for (const m of await mails()) expect(m.status).toBe("CANCELLED");
      expect(sent).toEqual([]);
      // Destinatario disattivato prima del passaggio a SENDING.
      await enqueue("R13e", pp);
      const c2 = (await claimNext(db, at("2026-10-08T08:03:00Z")))!;
      await store.users(db).updateOne({ _id: new ObjectId(pp.id) }, { $set: { status: "deactivated" } });
      try {
        expect(await deliverOne(deps(), c2, async (m) => void sent.push(m), { owner: "x", now: () => at("2026-10-08T08:03:01Z") })).toBe("cancelled");
      } finally {
        await store.users(db).updateOne({ _id: new ObjectId(pp.id) }, { $set: { status: "active" } });
      }
      expect(sent).toEqual([]);
    });

    it("§4.9: alertEmail fa l'escape dei valori; notifiche e mail degli alert non contengono le Note Operative", async () => {
      const mail = alertEmail({ name: "<b>Ugo</b>", label: "<i>x</i>", codiceSito: "<script>1</script>", nomeSito: "\"onload=x", gestore: "INWIT", due: "08/10/2026", reminder: false, link: "https://x/\"><script>" });
      expect(mail.html).not.toMatch(/<script>|<b>Ugo|<i>x/);
      expect(mail.html).toContain("&lt;script&gt;");
      let d = await create("NOTE");
      d = await patch(d, [{ transversal: "noteOperative", group: "PM_PERMESSI", value: "SEGRETO-PM" }, { transversal: "noteOperative", group: "UT_PE", value: "SEGRETO-UT" }]);
      await patch(d, [set("F092", "2026-10-08")], "2026-10-08T08:30:00Z");
      const a = (await store.alerts(db).findOne({ practiceId: new ObjectId(d.id), ruleId: "FORECAST_UT" }))!;
      const notes = await store.notifications(db).find({ eventKey: { $regex: `^alert:${a._id.toHexString()}:` } }).toArray();
      const mails = await store.outbox(db).find({ alertId: a._id }).toArray();
      const events = await store.alertEvents(db).find({ alertId: a._id }).toArray();
      expect(notes.length + mails.length).toBeGreaterThan(0);
      expect(JSON.stringify([notes, mails, events])).not.toContain("SEGRETO");
    });
  });
});
