// @vitest-environment node
/**
 * B5b, comandi e storico sul replica set usa-e-getta (mai la 27017 della beta):
 *   node scripts/db/mongo-rs.mjs start --port 27021
 *   MONGO_RS_TEST_URL="mongodb://127.0.0.1:27021/?directConnection=true" yarn vitest run tests/server/practices-v2.test.ts
 *   node scripts/db/mongo-rs.mjs stop
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, ObjectId, type Db } from "mongodb";
import type { MembershipDTO, PraticaDetailDTO, SelectValue, UserDTO } from "@/lib/contract";
import { bootstrapStore, store } from "@/lib/store/db";
import type { StoreUserDoc } from "@/lib/store/types";
import {
  archivePractice,
  assignPractice,
  changeStato,
  createPractice,
  deletePractice,
  resubmitPractice,
  restorePractice,
  reworkPractice,
  type PracticeDeps,
} from "@/services/practices-v2/commands";
import { getHistory } from "@/services/practices-v2/history";
import { getPracticeDetail } from "@/services/practices-v2/read";
import { toUserDTO, updateUser } from "@/services/users-v2";
import { assertDisposableTarget } from "../../scripts/db/guard";

const URL_RS = process.env.MONGO_RS_TEST_URL;
describe.skipIf(!URL_RS)("comandi della pratica sul replica set usa-e-getta", () => {
  let client: MongoClient;
  let db: Db;
  let deps: PracticeDeps;
  const DB = `practicehub_test_practices_${Date.now()}`;
  const now = new Date("2026-10-08T07:00:00Z");
  const users: Record<string, UserDTO> = {};

  const m = (group: MembershipDTO["group"], role: MembershipDTO["role"], leader = false, templateId: MembershipDTO["templateId"] = "INWIT"): MembershipDTO => ({ templateId, group, role, leader });
  async function user(key: string, memberships: MembershipDTO[], extra: Partial<StoreUserDoc> = {}): Promise<UserDTO> {
    const doc: StoreUserDoc = { _id: new ObjectId(), email: `${key}@test.local`, name: key, passwordHash: null, status: "active", isAdmin: false, memberships, authVersion: 1, createdAt: now, updatedAt: now, ...extra };
    await store.users(db).insertOne(doc);
    return (users[key] = toUserDTO(doc));
  }
  const uuid = () => crypto.randomUUID();
  const base = { templateId: "INWIT" as const, committente: { code: "TODOS" } as SelectValue, clienteFinale: { code: "INWIT" } as SelectValue, codiceG7: "4501", codiceSito: "MI001", nomeSito: "Milano Centro" };
  const create = (by = users.pm, extra: Partial<typeof base> & { operationId?: string } = {}) => createPractice(deps, by, { ...base, ...extra });

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    client = await new MongoClient(URL_RS!).connect();
    db = client.db(DB);
    deps = { client, db, clock: () => now };
    await bootstrapStore(db);
    await user("leader", [m("PM_PERMESSI", "PM", true)]);
    await user("pm", [m("PM_PERMESSI", "PM")]);
    await user("ut", [m("UT_PE", "UT")]);
    await user("pe", [m("UT_PE", "PE")]);
    await user("dl", [m("DL", "DL")]);
    await user("aie", [m("AIE", "AIE")]);
    await user("utIliad", [m("UT_PE", "UT", false, "ILIAD")]);
    await user("pmLeo", [m("PM_PERMESSI", "PM", false, "LEONARDO")]);
    await user("admin", [], { isAdmin: true });
    await user("utOff", [m("UT_PE", "UT")], { status: "deactivated" });
  });
  afterAll(async () => {
    await client?.db(DB).dropDatabase();
    await client?.close();
  });

  describe("creazione", () => {
    it("PM del template: iterazione 1 CREATA, 11 vincoli, storico dei 5 campi d'identità ed evento CREATE", async () => {
      const d = await create();
      expect(d).toMatchObject({ templateId: "INWIT", iteration: 1, revision: 1, statoAttivita: "CREATA", codiceG7: "4501", codiceSito: "MI001", enabledGroups: ["PM_PERMESSI"] });
      expect(d.values.F001).toBe(4501);
      expect(d.repeats.VINCOLI).toHaveLength(11);
      const h = await getHistory(db, users.pm, d.id, {});
      expect(h.items.filter((i) => i.kind === "FIELD").map((i) => i.flowId).sort()).toEqual(["F001", "F002", "F003", "F004", "F005"]);
      expect(h.items[0]).toMatchObject({ kind: "CREATE", userName: "pm", source: "USER" });
      const p = await store.practices(db).findOne({ _id: new ObjectId(d.id) });
      expect(p!.currentSummary.progress!.PM_PERMESSI.filled).toBeGreaterThanOrEqual(5);
    });

    it("stessa operationId: una sola pratica e la stessa risposta", async () => {
      const op = uuid();
      const a = await create(users.pm, { operationId: op, codiceSito: "RETRY" });
      const b = await create(users.pm, { operationId: op, codiceSito: "RETRY" });
      expect(b.id).toBe(a.id);
      expect(await store.practices(db).countDocuments({ "currentSummary.codiceSito": "RETRY" })).toBe(1);
    });

    it("rifiuti: 403 senza ruolo PM, 422 per combinazione di un altro gestore, codice fuori lista, Altro senza testo, gestore senza PM leader", async () => {
      await expect(create(users.aie)).rejects.toMatchObject({ status: 403 });
      await expect(create(users.pm, { clienteFinale: { code: "TIM" } })).rejects.toMatchObject({ status: 422, message: expect.stringContaining("TIM_FIBERCOP") });
      await expect(create(users.pm, { committente: { code: "CELLNEX" } })) // nella lista comune, non in quella di INWIT
        .rejects.toMatchObject({ status: 422 });
      await expect(create(users.pm, { committente: { code: "NON_ESISTE" } })).rejects.toMatchObject({ status: 422, message: expect.stringContaining("non presente") });
      await expect(create(users.pm, { committente: { code: "ALTRO" } })).rejects.toMatchObject({ status: 422 });
      const altro = await create(users.pm, { committente: { code: "ALTRO", otherText: "Impresa X" }, codiceSito: "ALT" });
      expect(altro.committente).toEqual({ code: "ALTRO", otherText: "Impresa X" });
      await expect(createPractice(deps, users.pmLeo, { ...base, templateId: "LEONARDO", committente: { code: "LEONARDO" }, clienteFinale: { code: "LEONARDO" } })).rejects.toMatchObject({ status: 422, message: expect.stringContaining("PM leader") });
    });
  });

  describe("Assegna (D-21)", () => {
    let d: PraticaDetailDTO;
    beforeAll(async () => {
      d = await create(users.pm, { codiceSito: "ASSEGNA" });
    });

    it("unione dei gruppi, Incarichi alla data del giorno, notifiche e mail a ogni membro attivo dei gruppi", async () => {
      const op = uuid();
      const r = await assignPractice(deps, users.pm, d.id, { revision: 1, groups: ["UT_PE", "DL"], note: "Urgente <davvero>", operationId: op });
      expect(r.revision).toBe(2);
      expect(r.enabledGroups.sort()).toEqual(["DL", "PM_PERMESSI", "UT_PE"]);
      expect(r.values.F093).toBe("2026-10-08");
      expect(r.values.F107).toBe("2026-10-08");
      const key = `assign:${d.id}:2`;
      const notified = await store.notifications(db).find({ eventKey: key }).toArray();
      const ids = notified.map((n) => n.userId.toHexString()).sort();
      expect(ids).toEqual([users.ut.id, users.pe.id, users.dl.id].sort());
      expect(notified.find((n) => n.userId.toHexString() === users.dl.id)!.title).toBe("Pratica ASSEGNA assegnata a DL");
      const mails = await store.outbox(db).find({ eventKey: key }).toArray();
      expect(mails).toHaveLength(3);
      expect(mails[0].payload.html).toContain("Urgente &lt;davvero&gt;");
      // ritentativo: nessun effetto ripetuto
      const again = await assignPractice(deps, users.pm, d.id, { revision: 1, groups: ["UT_PE", "DL"], note: "Urgente <davvero>", operationId: op });
      expect(again.revision).toBe(2);
      expect(await store.notifications(db).countDocuments({ eventKey: { $regex: `^assign:${d.id}:` } })).toBe(3);
    });

    it("una nuova Assegna notifica di nuovo (DL per conoscenza con UT+PE, D-116) e non sovrascrive gli Incarichi", async () => {
      const r = await assignPractice(deps, users.pm, d.id, { revision: 2, groups: ["UT_PE"] });
      expect(r.revision).toBe(3);
      const n3 = await store.notifications(db).find({ eventKey: `assign:${d.id}:3` }).toArray();
      expect(n3.map((n) => n.userId.toHexString()).sort()).toEqual([users.ut.id, users.pe.id, users.dl.id].sort());
      expect(n3.find((n) => n.userId.toHexString() === users.dl.id)).toMatchObject({ title: "Pratica ASSEGNA assegnata a UT/PE", body: expect.stringContaining(" a UT/PE") });
      expect(await store.outbox(db).countDocuments({ eventKey: `assign:${d.id}:3` })).toBe(3);
      expect(r.enabledGroups).not.toContain("AIE");
      const h = await getHistory(db, users.pm, d.id, { view: "fields" });
      expect(h.items.filter((i) => i.flowId === "F093")).toHaveLength(1);
      expect(h.items.find((i) => i.flowId === "F093")).toMatchObject({ source: "SYSTEM", userId: null, detail: expect.stringContaining("D-21") });
    });

    it("Assegna senza UT+PE: nessun destinatario aggiuntivo", async () => {
      const r = await assignPractice(deps, users.pm, d.id, { revision: 3, groups: ["AIE"] });
      const n = await store.notifications(db).find({ eventKey: `assign:${d.id}:${r.revision}` }).toArray();
      expect(n.map((x) => x.userId.toHexString())).toEqual([users.aie.id]);
    });

    it("D-143: chi esegue l'Assegna non riceve notifica né mail, anche se membro del gruppo destinatario o del DL", async () => {
      const multi = await user("pmUtDl", [m("PM_PERMESSI", "PM"), m("UT_PE", "UT"), m("DL", "DL")]);
      const p = await create(multi, { codiceSito: "AUTO" });
      const r = await assignPractice(deps, multi, p.id, { revision: p.revision, groups: ["UT_PE"] });
      const key = `assign:${p.id}:${r.revision}`;
      const ids = (await store.notifications(db).find({ eventKey: key }).toArray()).map((n) => n.userId.toHexString());
      expect(ids).not.toContain(multi.id);
      expect(ids.sort()).toEqual([users.ut.id, users.pe.id, users.dl.id].sort());
      expect(await store.outbox(db).countDocuments({ eventKey: key, userId: new ObjectId(multi.id) })).toBe(0);
    });

    it("rifiuti: 409 con revisione vecchia, 422 gruppo non assegnabile, 403 senza ruolo, 404 altro gestore", async () => {
      await expect(assignPractice(deps, users.pm, d.id, { revision: 1, groups: ["AIE"] })).rejects.toMatchObject({ status: 409, extra: { code: "REVISION_CONFLICT", currentRevision: 4 } });
      await expect(assignPractice(deps, users.pm, d.id, { revision: 4, groups: ["PM_PERMESSI"] })).rejects.toMatchObject({ status: 422 });
      await expect(assignPractice(deps, users.ut, d.id, { revision: 4, groups: ["AIE"] })).rejects.toMatchObject({ status: 403 });
      await expect(assignPractice(deps, users.utIliad, d.id, { revision: 4, groups: ["AIE"] })).rejects.toMatchObject({ status: 404 });
      await expect(assignPractice(deps, users.pm, "nonvalido", { revision: 4, groups: ["AIE"] })).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("stato, archivio, ripristino, cancellazione", () => {
    it("stato manuale (PM), archiviazione solo da TERMINATO/KO, ripristino", async () => {
      const d = await create(users.pm, { codiceSito: "ARCH" });
      await expect(archivePractice(deps, users.pm, d.id, { revision: 1 })).rejects.toMatchObject({ status: 422 });
      await expect(changeStato(deps, users.ut, d.id, { revision: 1, stato: "TERMINATO" })).rejects.toMatchObject({ status: 403 });
      const s = await changeStato(deps, users.pm, d.id, { revision: 1, stato: "TERMINATO" });
      expect(s).toMatchObject({ statoAttivita: "TERMINATO", statoSource: "MANUAL", revision: 2 });
      const a = await archivePractice(deps, users.dl, d.id, { revision: 2 });
      expect(a.archived).toBe(true);
      expect(a.archivedAt).toBe(now.toISOString());
      expect(a.actions).toMatchObject({ canRestore: false, canAssign: false }); // vista del DL: ripristina solo PM/ADMIN
      expect((await getPracticeDetail(db, users.pm, d.id)).actions).toMatchObject({ canRestore: true, canAssign: false, canArchive: false });
      await expect(assignPractice(deps, users.pm, d.id, { revision: 3, groups: ["AIE"] })).rejects.toMatchObject({ status: 422 });
      await expect(restorePractice(deps, users.dl, d.id, { revision: 3 })).rejects.toMatchObject({ status: 403 });
      const r = await restorePractice(deps, users.pm, d.id, { revision: 3 });
      expect(r).toMatchObject({ archived: false, archivedAt: null, revision: 4 });
      const ev = await getHistory(db, users.pm, d.id, { view: "events" });
      expect(ev.items.map((i) => i.kind)).toEqual(["RESTORE", "ARCHIVE", "STATO", "CREATE"]);
    });

    it("cancellazione: solo CREATA, toglie tutto e lascia la traccia in audit_log", async () => {
      const d = await create(users.pm, { codiceSito: "DEL" });
      await assignPractice(deps, users.pm, d.id, { revision: 1, groups: ["DL"] });
      await expect(deletePractice(deps, users.dl, d.id, { revision: 2 })).rejects.toMatchObject({ status: 403 });
      await expect(deletePractice(deps, users.pm, d.id, { revision: 1 })).rejects.toMatchObject({ status: 409 });
      const op = uuid();
      await deletePractice(deps, users.pm, d.id, { revision: 2, operationId: op });
      const pid = new ObjectId(d.id);
      expect(await store.practices(db).countDocuments({ _id: pid })).toBe(0);
      expect(await store.iterations(db).countDocuments({ practiceId: pid })).toBe(0);
      expect(await store.repeatRows(db).countDocuments({ practiceId: pid })).toBe(0);
      expect(await store.valueHistory(db).countDocuments({ practiceId: pid })).toBe(0);
      expect(await store.events(db).countDocuments({ practiceId: pid })).toBe(0);
      expect(await store.notifications(db).countDocuments({ "link.practiceId": pid })).toBe(0);
      expect(await store.outbox(db).countDocuments({ eventKey: `assign:${d.id}:2` })).toBe(0);
      const audit = await store.auditLog(db).find({ "practice.id": pid }).toArray();
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ kind: "PRACTICE_DELETE", actorName: "pm", operationId: op, practice: { templateId: "INWIT", codiceSito: "DEL", codiceG7: "4501", iterations: 1 } });
      await deletePractice(deps, users.pm, d.id, { revision: 2, operationId: op }); // ritentativo: nessun errore, nessuna seconda traccia
      expect(await store.auditLog(db).countDocuments({ "practice.id": pid })).toBe(1);
      await expect(getPracticeDetail(db, users.pm, d.id)).rejects.toMatchObject({ status: 404 });

      const t = await create(users.pm, { codiceSito: "DEL2" });
      await changeStato(deps, users.pm, t.id, { revision: 1, stato: "ASSEGNATO" });
      await expect(deletePractice(deps, users.pm, t.id, { revision: 2 })).rejects.toMatchObject({ status: 422 });
    });
  });

  describe("rilavorazione e ripresentazione", () => {
    let origin: PraticaDetailDTO;
    beforeAll(async () => {
      origin = await create(users.pm, { codiceSito: "ORIG" });
      const it1 = await store.iterations(db).findOne({ _id: new ObjectId(origin.iterationId) });
      // Valori di prova: Core (Incarico F012, Note Core), Dati Secondari, fase operativa; righe TENANT e ODA.
      await store.iterations(db).updateOne(
        { _id: it1!._id },
        { $set: { "values.F012": { code: "NEW_SITE" }, "values.F016": "SR-1", "values.F021": 45.46, "values.F023": "2026-09-01", "transversal.noteOperative": { PM_PERMESSI: "nota", UT_PE: "ut", AIE: "", DL: "dl" } } }
      );
      const row = (groupKey: string, ordinal: number, values: Record<string, unknown>) => ({
        _id: new ObjectId(),
        practiceId: it1!.practiceId,
        iterationId: it1!._id,
        groupKey,
        ordinal,
        values: values as never,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      });
      await store.repeatRows(db).insertMany([row("TENANT", 1, { F018: { code: "ILIAD" } }), row("ODA", 1, { F014: "ODA-1" })]);
    });

    it("rilavorazione: nuova pratica collegata, solo Core senza ODA, G7 dell'origine o del comando, formule ricalcolate", async () => {
      const r = await reworkPractice(deps, users.pm, origin.id, {});
      expect(r.id).not.toBe(origin.id);
      expect(r).toMatchObject({ originPracticeId: origin.id, iteration: 1, revision: 1, codiceG7: "4501", statoAttivita: "CREATA", enabledGroups: ["PM_PERMESSI"] });
      expect(r.values.F012).toEqual({ code: "NEW_SITE" });
      expect(r.values.F108).toEqual({ code: "NEW_SITE" }); // Tipologia attività PE derivata
      expect(r.values.F016).toBe("SR-1");
      expect(r.values.F021).toBeUndefined(); // Dati Secondari: solo con la ripresentazione
      expect(r.values.F023).toBeUndefined();
      expect(r.repeats.ODA).toEqual([]);
      expect(r.repeats.TENANT).toEqual([]);
      expect(r.transversal.noteOperative).toEqual({ PM_PERMESSI: "" });
      const ev = await getHistory(db, users.pm, r.id, { view: "events" });
      expect(ev.items[0]).toMatchObject({ kind: "REWORK" });
      const withG7 = await reworkPractice(deps, users.pm, origin.id, { codiceG7: "999" });
      expect(withG7.codiceG7).toBe("999");
      expect((await getPracticeDetail(db, users.pm, origin.id)).revision).toBe(origin.revision);
      await expect(reworkPractice(deps, users.ut, origin.id, {})).rejects.toMatchObject({ status: 403 });
    });

    it("ripresentazione: solo PM leader; iterazione 2 con Core e Dati Secondari, TENANT, vincoli nuovi, note conservate", async () => {
      await expect(resubmitPractice(deps, users.pm, origin.id, { revision: 1 })).rejects.toMatchObject({ status: 403 });
      const r = await resubmitPractice(deps, users.leader, origin.id, { revision: 1 });
      expect(r).toMatchObject({ iteration: 2, revision: 2, codiceG7: null, statoAttivita: "CREATA", statoSource: "AUTO" });
      expect(r.values.F001).toBeUndefined();
      expect(r.values.F012).toEqual({ code: "NEW_SITE" });
      expect(r.values.F016).toBe("SR-1");
      expect(r.values.F021).toBe(45.46);
      expect(r.values.F023).toBeUndefined();
      expect(r.repeats.TENANT.map((x) => x.values)).toEqual([{ F018: { code: "ILIAD" } }]);
      expect(r.repeats.ODA).toEqual([]);
      expect(r.repeats.VINCOLI).toHaveLength(11);
      // le quattro note restano (D-25, D-121); il PM leader le vede tutte, un PM non leader solo quella di PM/Permessi
      expect(r.transversal).toEqual({ noteOperative: { PM_PERMESSI: "nota", UT_PE: "ut", AIE: "", DL: "dl" }, fatturabile: "NO", fatturabileManual: false, fatturato: null });
      expect((await getPracticeDetail(db, users.pm, origin.id)).transversal.noteOperative).toEqual({ PM_PERMESSI: "nota" });
      expect((await getPracticeDetail(db, users.ut, origin.id)).transversal.noteOperative).toEqual({ UT_PE: "ut" });
      expect(r.iterations.map((i) => [i.n, i.current])).toEqual([[1, false], [2, true]]);
      const old = await store.iterations(db).findOne({ practiceId: new ObjectId(origin.id), n: 1 });
      expect(old!.closedAt).toEqual(now);

      const past = await getPracticeDetail(db, users.pm, origin.id, 1);
      expect(past).toMatchObject({ iteration: 1, codiceG7: "4501", revision: 2 });
      expect(Object.values(past.access).every((a) => a.editable === false && a.reason === "PAST_ITERATION")).toBe(true);
      expect(past.repeats.ODA).toHaveLength(1);
      await expect(getPracticeDetail(db, users.pm, origin.id, 3)).rejects.toMatchObject({ status: 404 });

      const all = await getHistory(db, users.pm, origin.id, {});
      const it2 = await getHistory(db, users.pm, origin.id, { iteration: 2 });
      expect(it2.items.every((i) => i.iteration === 2)).toBe(true);
      expect(it2.items.find((i) => i.kind === "RESUBMIT")).toBeTruthy();
      expect(all.total).toBeGreaterThan(it2.total);

      const g7 = await resubmitPractice(deps, users.admin, origin.id, { revision: 2, codiceG7: "123" });
      expect(g7).toMatchObject({ iteration: 3, codiceG7: "123" });
    });
  });

  it("storico: le voci delle note di gruppi non visibili non escono, nemmeno nel totale (D-121)", async () => {
    const d = await create(users.pm, { codiceSito: "NOTE" });
    const it1 = (await store.iterations(db).findOne({ practiceId: new ObjectId(d.id) }))!;
    const voce = (noteGroup: "UT_PE" | "AIE" | undefined, i: number) => ({
      _id: new ObjectId(), operationId: `note-${d.id}`, opKey: `test|note-${d.id}`, changeIndex: i, practiceId: it1.practiceId, iterationId: it1._id, n: 1, templateVersion: it1.templateVersion,
      kind: "FIELD" as const, target: { transversal: "noteOperative" as const, ...(noteGroup ? { noteGroup } : {}) }, oldValue: "", newValue: `nota ${i}`,
      actorId: null, actorName: "x", source: "USER" as const, timestamp: now, revision: 1,
    });
    await store.valueHistory(db).insertMany([voce("UT_PE", 0), voce("AIE", 1), voce(undefined, 2)]);
    const notesFor = async (u: UserDTO) => {
      const h = await getHistory(db, u, d.id, { view: "fields" });
      return { total: h.total, groups: h.items.filter((i) => i.transversal === "noteOperative").map((i) => i.noteGroup).sort() };
    };
    // ognuno vede le 5 voci dei campi d'identità più le sole note visibili
    expect(await notesFor(users.ut)).toEqual({ total: 6, groups: ["UT_PE"] });
    expect(await notesFor(users.pm)).toEqual({ total: 6, groups: ["PM_PERMESSI"] }); // la nota senza gruppo è di PM/Permessi
    expect(await notesFor(users.leader)).toEqual({ total: 8, groups: ["AIE", "PM_PERMESSI", "UT_PE"] });
  });

  it("storico paginato: 50 per pagina, totale e ordine dal più recente", async () => {
    const d = await create(users.pm, { codiceSito: "PAG" });
    let rev = 1;
    for (let i = 0; i < 50; i++) {
      await changeStato(deps, users.pm, d.id, { revision: rev, stato: i % 2 ? "ASSEGNATO" : "PROTOCOLLATO" });
      rev++;
    }
    const p1 = await getHistory(db, users.pm, d.id, { page: 1 });
    const p2 = await getHistory(db, users.pm, d.id, { page: 2 });
    expect(p1.total).toBe(5 + 1 + 50);
    expect(p1.items).toHaveLength(50);
    expect(p2.items).toHaveLength(6);
    expect(new Set([...p1.items, ...p2.items].map((i) => i.id)).size).toBe(56);
    expect(p1.items[0].detail).toContain("→ ASSEGNATO");
    const ev = await getHistory(db, users.pm, d.id, { view: "events", page: 2 });
    expect(ev.total).toBe(51);
    expect(ev.items.map((i) => i.kind)).toEqual(["CREATE"]);
    await expect(getHistory(db, users.utIliad, d.id, {})).rejects.toMatchObject({ status: 404 });
  }, 60_000);

  it("D-101 con guardia: creazione e rimozione dell'ultimo PM leader in parallelo non passano entrambe", async () => {
    for (let i = 0; i < 3; i++) {
      const leader = await user(`leaderTw${i}`, [m("PM_PERMESSI", "PM", true, "TOWERNET")]);
      await store.practices(db).deleteMany({ templateId: "TOWERNET" });
      const [c, u] = await Promise.allSettled([
        createPractice(deps, leader, { ...base, templateId: "TOWERNET", committente: { code: "TOWERNET" }, clienteFinale: { code: "TOWERNET" } }),
        updateUser(deps, { id: users.admin.id, isAdmin: true }, leader.id, { memberships: [m("PM_PERMESSI", "PM", false, "TOWERNET")] }),
      ]);
      expect(c.status === "fulfilled" && u.status === "fulfilled", `giro ${i}`).toBe(false);
      expect([c, u].some((x) => x.status === "fulfilled")).toBe(true);
      await store.users(db).updateOne({ _id: new ObjectId(leader.id) }, { $set: { status: "deactivated" } });
    }
  }, 60_000);

  describe("M-04 (D-126): il ripristino non riattiva un gestore senza PM leader", () => {
    const tim = { ...base, templateId: "TIM_FIBERCOP" as const, committente: { code: "FIBERCOP" }, clienteFinale: { code: "TIM" } };
    /** Pratica TIM archiviata (TERMINATO) con un PM leader appena creato. */
    async function archivedWithLeader(key: string) {
      const leader = await user(key, [m("PM_PERMESSI", "PM", true, "TIM_FIBERCOP")]);
      const d = await createPractice(deps, leader, { ...tim, codiceSito: key });
      await changeStato(deps, leader, d.id, { revision: 1, stato: "TERMINATO" });
      await archivePractice(deps, leader, d.id, { revision: 2 });
      return { leader, d };
    }

    it("archivia → togli l'ultimo leader (consentito) → ripristina: 422; con un nuovo leader: ripristino riuscito", async () => {
      await store.practices(db).deleteMany({ templateId: "TIM_FIBERCOP" });
      const { leader, d } = await archivedWithLeader("leaderTim");
      await updateUser(deps, { id: users.admin.id, isAdmin: true }, leader.id, { memberships: [m("PM_PERMESSI", "PM", false, "TIM_FIBERCOP")] });
      await expect(restorePractice(deps, users.admin, d.id, { revision: 3 })).rejects.toMatchObject({ status: 422, message: expect.stringContaining("PM leader") });
      expect((await store.practices(db).findOne({ _id: new ObjectId(d.id) }))!).toMatchObject({ archived: true, revision: 3 });
      const nuovo = await user("leaderTim2", [m("PM_PERMESSI", "PM", true, "TIM_FIBERCOP")]);
      expect((await restorePractice(deps, users.admin, d.id, { revision: 3 })).archived).toBe(false);
      await store.users(db).updateOne({ _id: new ObjectId(nuovo.id) }, { $set: { status: "deactivated" } });
      await store.practices(db).deleteMany({ templateId: "TIM_FIBERCOP" });
    });

    it("ripristino e rimozione dell'ultimo leader in parallelo non passano entrambi", async () => {
      for (let i = 0; i < 3; i++) {
        await store.practices(db).deleteMany({ templateId: "TIM_FIBERCOP" });
        const { leader, d } = await archivedWithLeader(`leaderTimP${i}`);
        const [r, u] = await Promise.allSettled([
          restorePractice(deps, users.admin, d.id, { revision: 3 }),
          updateUser(deps, { id: users.admin.id, isAdmin: true }, leader.id, { memberships: [m("PM_PERMESSI", "PM", false, "TIM_FIBERCOP")] }),
        ]);
        expect(r.status === "fulfilled" && u.status === "fulfilled", `giro ${i}`).toBe(false);
        expect([r, u].some((x) => x.status === "fulfilled")).toBe(true);
        // Invariante: nessuna pratica TIM non archiviata senza un PM leader attivo.
        const active = await store.practices(db).countDocuments({ templateId: "TIM_FIBERCOP", archived: false });
        const leaders = await store.users(db).countDocuments({ status: "active", memberships: { $elemMatch: { templateId: "TIM_FIBERCOP", role: "PM", leader: true } } });
        expect(active === 0 || leaders > 0, `giro ${i}`).toBe(true);
        await store.users(db).updateOne({ _id: new ObjectId(leader.id) }, { $set: { status: "deactivated" } });
      }
    }, 60_000);
  });
});
