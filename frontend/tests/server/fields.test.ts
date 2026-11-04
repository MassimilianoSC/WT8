// @vitest-environment node
/**
 * PATCH dei campi (contratto §5.2): orchestrazione dei motori in una transazione. Replica set usa-e-getta:
 *   MONGO_RS_TEST_URL="mongodb://127.0.0.1:27021/?directConnection=true" yarn vitest run tests/server/fields.test.ts
 * Comprende le prove mancanti §4.6, §4.7, §4.8 e §4.9 della revisione dei motori (D-126).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoClient, ObjectId, type Db } from "mongodb";
import type { FieldChange, FieldValue, MembershipDTO, PraticaDetailDTO, UserDTO } from "@/lib/contract";
import { bootstrapStore, store } from "@/lib/store/db";
import type { StoreUserDoc } from "@/lib/store/types";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";
import { assignPractice, changeStato, createPractice, type PracticeDeps } from "@/services/practices-v2/commands";
import { patchFields } from "@/services/practices-v2/fields";
import { getHistory } from "@/services/practices-v2/history";
import { getPracticeDetail } from "@/services/practices-v2/read";
import { toUserDTO } from "@/services/users-v2";
import { assertDisposableTarget } from "../../scripts/db/guard";

// Prove che creano database sul replica set: sotto il carico della suite completa 30 s non bastano (timeout visti
// l'11/10/2026 con la macchina carica). Un blocco vero resta un errore entro 90 s; i limiti espliciti più alti restano.
vi.setConfig({ testTimeout: 90_000 });

const T = COMPILED_TEMPLATES.INWIT.template;
const key = (flowId: string) => T.occurrences.find((o) => o.kind === "MASTER" && o.flowId === flowId)!.occurrenceKey;
const set = (flowId: string, value: FieldValue): FieldChange => ({ occurrenceKey: key(flowId), flowId, value });
const setRow = (repeat: string, rowId: string, flowId: string, value: FieldValue): FieldChange => ({ occurrenceKey: key(flowId), repeat, rowId, flowId, value });

const URL_RS = process.env.MONGO_RS_TEST_URL;
describe.skipIf(!URL_RS)("PATCH dei campi sul replica set usa-e-getta", () => {
  let client: MongoClient;
  let db: Db;
  let deps: PracticeDeps;
  const DB = `practicehub_test_fields_${Date.now()}`;
  const now = new Date("2026-10-08T07:00:00Z");
  const u: Record<string, UserDTO> = {};
  const m = (group: MembershipDTO["group"], role: MembershipDTO["role"], leader = false, templateId: MembershipDTO["templateId"] = "INWIT"): MembershipDTO => ({ templateId, group, role, leader });

  async function user(k: string, memberships: MembershipDTO[], extra: Partial<StoreUserDoc> = {}) {
    const doc: StoreUserDoc = { _id: new ObjectId(), email: `${k}@test.local`, name: k, passwordHash: null, status: "active", isAdmin: false, memberships, authVersion: 1, createdAt: now, updatedAt: now, ...extra };
    await store.users(db).insertOne(doc);
    u[k] = toUserDTO(doc);
  }
  const create = (codiceSito: string) =>
    createPractice(deps, u.pm, { templateId: "INWIT", committente: { code: "TODOS" }, clienteFinale: { code: "INWIT" }, codiceG7: "1", codiceSito, nomeSito: "N" });
  const patch = (d: Pick<PraticaDetailDTO, "id" | "iteration" | "revision">, changes: FieldChange[], by = u.pm, operationId?: string) =>
    patchFields(deps, by, d.id, { iteration: d.iteration, revision: d.revision, changes, ...(operationId ? { operationId } : {}) });

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    client = await new MongoClient(URL_RS!).connect();
    db = client.db(DB);
    deps = { client, db, clock: () => now };
    await bootstrapStore(db);
    await user("pmLeader", [m("PM_PERMESSI", "PM", true)]);
    await user("pm", [m("PM_PERMESSI", "PM")]);
    await user("ut", [m("UT_PE", "UT")]);
    await user("iliad", [m("PM_PERMESSI", "PM", true, "ILIAD")]);
    await user("admin", [], { isAdmin: true });
  });
  afterAll(async () => {
    await client?.db(DB).dropDatabase();
    await client?.close();
  });

  it("scrittura semplice: storico USER, stato automatico con evento SYSTEM, revisione; retry = replay senza doppioni", async () => {
    const d = await create("BASE");
    const op = "77777777-7777-4777-8777-777777777777";
    const r = await patch(d, [set("F002", "BASE-2"), set("F023", "2026-10-01")], u.pm, op);
    expect(r.practice).toMatchObject({ revision: 2, codiceSito: "BASE-2", statoAttivita: "ASSEGNATO", statoSource: "AUTO" });
    const again = await patch(d, [set("F002", "BASE-2"), set("F023", "2026-10-01")], u.pm, op);
    expect(again.practice.revision).toBe(2);
    const h = await getHistory(db, u.pm, d.id, {});
    expect(h.items.filter((i) => i.operationId === op && i.source === "USER").map((i) => i.flowId).sort()).toEqual(["F002", "F023"]);
    expect(h.items.find((i) => i.kind === "STATO")).toMatchObject({ source: "SYSTEM", userId: null });
    // §15.4 (D-192): l'evento STATO automatico registra la data del fatto (Data assegnazione), non solo l'ora del salvataggio.
    const ev = await store.events(db).findOne({ practiceId: new ObjectId(d.id), kind: "STATO", operationId: op });
    expect(ev!.structuredDetail).toMatchObject({ from: "CREATA", to: "ASSEGNATO", autoEventDate: "2026-10-01" });
  });

  it("ordine degli errori: 404 → 409 iterazione → 403 (tutti i rejected) → 422 → 409 revisione", async () => {
    const d = await create("ORDINE");
    await expect(patch(d, [set("F002", "x")], u.iliad)).rejects.toMatchObject({ status: 404 });
    await expect(patch({ ...d, iteration: 2 }, [set("F023", "non-data")])).rejects.toMatchObject({ status: 409, extra: { code: "ITERATION_CONFLICT" } });
    // UT non assegnato: tutti i rifiuti insieme, e la data invalida non emerge.
    await expect(patch(d, [set("F002", "x"), set("F023", "non-data"), set("F095", { code: u.ut.id })], u.ut)).rejects.toMatchObject({
      status: 403,
      extra: { rejected: [key("F002"), key("F023"), key("F095")] },
    });
    await expect(patch({ ...d, revision: 99 }, [set("F023", "2026-02-30")])).rejects.toMatchObject({ status: 422 });
    await expect(patch({ ...d, revision: 99 }, [set("F023", "2026-02-28")])).rejects.toMatchObject({ status: 409, extra: { code: "REVISION_CONFLICT", currentRevision: 1 } });
    expect((await store.practices(db).findOne({ _id: new ObjectId(d.id) }))!.revision).toBe(1);
  });

  it("due salvataggi concorrenti sulla stessa revisione: uno riesce, l'altro 409 REVISION_CONFLICT senza effetti", async () => {
    const d = await create("CONC");
    const [x, y] = await Promise.allSettled([patch(d, [set("F002", "X")]), patch(d, [set("F002", "Y")])]);
    const ko = [x, y].filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ko).toHaveLength(1);
    expect(ko[0].reason).toMatchObject({ status: 409, extra: { code: "REVISION_CONFLICT" } });
    const h = await getHistory(db, u.pm, d.id, { view: "fields" });
    expect(h.items.filter((i) => i.flowId === "F002")).toHaveLength(2); // creazione + un solo salvataggio
  });

  it("tutte o nessuna: un rifiuto annulla anche le modifiche valide", async () => {
    const d = await create("TUTTE");
    await expect(patch(d, [set("F002", "cambiato"), set("F108", { code: "NEW_SITE" })], u.admin)).rejects.toMatchObject({ status: 403, extra: { rejected: [key("F108")] } });
    const now2 = await getPracticeDetail(db, u.pm, d.id);
    expect(now2).toMatchObject({ codiceSito: "TUTTE", revision: 1 });
  });

  it("calcolati: non modificabile → 403 COMPUTED; modificabile scritto → bloccato (MANUAL) e non più ricalcolato", async () => {
    const d = await create("CALC");
    await expect(patch(d, [set("F074", "2026-01-01")])).rejects.toMatchObject({ status: 403, extra: { rejected: [key("F074")] } });
    const geo = await patch(d, [set("F073", "2026-12-20"), set("F012", { code: "NEW_SITE" })]);
    expect(geo.practice.values).toMatchObject({ F074: "2027-01-04", F108: { code: "NEW_SITE" } });
    expect(geo.toasts.map((t) => t.flowId).sort()).toEqual(["F074", "F108"]);
    const prot = await patch(geo.practice, [set("F051", "2026-10-01")]);
    expect(prot.practice.values.F052).toBe("2026-12-07");
    const manual = await patch(prot.practice, [set("F052", "2027-03-01")]);
    expect(manual.practice.manualLocks).toEqual(["F052"]);
    const later = await patch(manual.practice, [set("F051", "2026-11-01")]);
    expect(later.practice.values.F052).toBe("2027-03-01");
    const h = await getHistory(db, u.pm, d.id, { view: "fields" });
    expect(h.items.find((i) => i.flowId === "F074")).toMatchObject({ source: "SYSTEM", detail: expect.stringContaining("15") });
  });

  it("campo nascosto per condizione: si scrive normalmente (D-31)", async () => {
    const d = await create("NASCOSTO");
    const add = await patch(d, [{ repeat: "ARPA", op: "ADD_ROW", clientRowKey: "a", values: {} }]);
    const rowId = add.createdRows!.a;
    // Esito parere Arpa compare solo con il parere compilato: qui il parere è vuoto.
    const r = await patch(add.practice, [setRow("ARPA", rowId, "F060", { code: "POSITIVO" })]);
    expect(r.practice.repeats.ARPA[0].values.F060).toEqual({ code: "POSITIVO" });
  });

  it("ADD_ROW già pieno (§4.6): controllo dell'integrazione memorizzato, createdRows, retry senza doppioni; rowId mai riusati", async () => {
    const d = await create("INTEGRA");
    const prot = await patch(d, [set("F051", "2026-08-01")]);
    const op = "88888888-8888-4888-8888-888888888888";
    const add = await patch(prot.practice, [{ repeat: "INTEGRAZIONE", op: "ADD_ROW", clientRowKey: "i1", values: { F055: "2026-09-20", F057: "2026-09-30" } }], u.pm, op);
    const rowId = add.createdRows!.i1;
    const again = await patch(prot.practice, [{ repeat: "INTEGRAZIONE", op: "ADD_ROW", clientRowKey: "i1", values: { F055: "2026-09-20", F057: "2026-09-30" } }], u.pm, op);
    expect(again.createdRows).toEqual({ i1: rowId });
    expect(add.practice.repeats.INTEGRAZIONE).toHaveLength(1);
    const row = await store.repeatRows(db).findOne({ _id: new ObjectId(rowId) });
    expect(row!.metadata.integrationCheck).toMatchObject({ checkedAtRomeDate: "2026-10-08", eligible: true });
    expect(add.practice.values.F052).toBe("2026-10-17"); // base 07/10 + 10 giorni di integrazione
    // Tolta e aggiunta di nuovo: rowId nuovo, ordinal successivo.
    const rem = await patch(add.practice, [{ repeat: "INTEGRAZIONE", op: "REMOVE_ROW", rowId }]);
    const add2 = await patch(rem.practice, [{ repeat: "INTEGRAZIONE", op: "ADD_ROW", clientRowKey: "i2" }]);
    expect(add2.createdRows!.i2).not.toBe(rowId);
    expect(add2.practice.repeats.INTEGRAZIONE.map((r) => r.rowId)).toEqual([add2.createdRows!.i2]);
    // D-132 P-03: ordinal mai riusato, verificato sul documento salvato.
    expect((await store.repeatRows(db).findOne({ _id: new ObjectId(add2.createdRows!.i2) }))!.ordinal).toBe(2);
    expect((await store.iterations(db).findOne({ _id: new ObjectId(d.iterationId) }))!.rowSeq).toMatchObject({ INTEGRAZIONE: 2, VINCOLI: 11 });
    const h = await getHistory(db, u.pm, d.id, { view: "fields" });
    expect(h.items.find((i) => i.kind === "ROW_REMOVE")).toMatchObject({ rowSnapshot: { F055: "2026-09-20", F057: "2026-09-30" } });
  });

  it("errori di riga con codice (contratto v0.5.3 §5): ROW_NOT_FOUND, ROW_REMOVED, ROW_GROUP_MISMATCH, ROW_OTHER_ITERATION; testo sempre «Riga non trovata…»", async () => {
    const d = await create("RIGHE");
    const prot = await patch(d, [set("F051", "2026-08-01")]);
    const add = await patch(prot.practice, [{ repeat: "INTEGRAZIONE", op: "ADD_ROW", clientRowKey: "a" }, { repeat: "INTEGRAZIONE", op: "ADD_ROW", clientRowKey: "b" }]);
    const [a, b] = [add.createdRows!.a, add.createdRows!.b];
    const fail = async (changes: FieldChange[]) => {
      try {
        await patch(add.practice, changes);
        return null;
      } catch (e) {
        const h = e as { status: number; message: string; extra?: { code?: string; rowId?: string } };
        expect(h.message).toMatch(/^Riga non trovata/);
        return { status: h.status, code: h.extra?.code, rowId: h.extra?.rowId };
      }
    };
    const ghost = new ObjectId().toHexString();
    expect(await fail([setRow("INTEGRAZIONE", ghost, "F055", "2026-09-20")])).toEqual({ status: 422, code: "ROW_NOT_FOUND", rowId: ghost });
    expect(await fail([{ repeat: "INTEGRAZIONE", op: "REMOVE_ROW", rowId: "non-un-id" }])).toEqual({ status: 422, code: "ROW_NOT_FOUND", rowId: "non-un-id" });
    expect(await fail([{ repeat: "INTEGRAZIONE", op: "REMOVE_ROW", rowId: a }, setRow("INTEGRAZIONE", a, "F055", "2026-09-20")])).toEqual({ status: 422, code: "ROW_REMOVED", rowId: a });
    expect(await fail([{ repeat: "ARPA", op: "REMOVE_ROW", rowId: a }])).toEqual({ status: 422, code: "ROW_GROUP_MISMATCH", rowId: a });
    const vincolo = d.repeats.VINCOLI[0].rowId;
    expect(await fail([{ repeat: "VINCOLI", rowId: a, constraint: { stato: { code: "PRESENTE" } } }])).toEqual({ status: 422, code: "ROW_GROUP_MISMATCH", rowId: a });
    expect(await fail([{ repeat: "INTEGRAZIONE", op: "REMOVE_ROW", rowId: vincolo }])).toEqual({ status: 422, code: "ROW_GROUP_MISMATCH", rowId: vincolo });
    // Riga della stessa pratica in un'altra iterazione (es. aperta prima della ripresentazione).
    const old = (await store.repeatRows(db).findOne({ _id: new ObjectId(b) }))!;
    const past = { ...old, _id: new ObjectId(), iterationId: new ObjectId() };
    await store.repeatRows(db).insertOne(past);
    expect(await fail([setRow("INTEGRAZIONE", past._id.toHexString(), "F055", "2026-09-20")])).toEqual({ status: 422, code: "ROW_OTHER_ITERATION", rowId: past._id.toHexString() });
    // Riga di un'altra pratica: come inesistente, senza dettagli.
    const other = await create("RIGHE-ALTRA");
    const foreign = other.repeats.VINCOLI[0].rowId;
    expect(await fail([{ repeat: "VINCOLI", rowId: foreign, constraint: { stato: { code: "PRESENTE" } } }])).toEqual({ status: 422, code: "ROW_NOT_FOUND", rowId: foreign });
    // Tolta da un salvataggio precedente: ROW_NOT_FOUND.
    const rem = await patch(add.practice, [{ repeat: "INTEGRAZIONE", op: "REMOVE_ROW", rowId: a }]);
    await expect(patch(rem.practice, [setRow("INTEGRAZIONE", a, "F055", "2026-09-20")])).rejects.toMatchObject({ status: 422, message: "Riga non trovata", extra: { code: "ROW_NOT_FOUND", rowId: a } });
    await store.repeatRows(db).deleteOne({ _id: past._id });
  });

  it("Invio senza Richiesta e poi Richiesta (§4.6): il controllo resta quello del primo Invio", async () => {
    const d = await create("INVIO");
    const prot = await patch(d, [set("F051", "2026-08-01")]);
    const add = await patch(prot.practice, [{ repeat: "INTEGRAZIONE", op: "ADD_ROW", clientRowKey: "i", values: { F057: "2026-09-30" } }]);
    const rowId = add.createdRows!.i;
    const first = (await store.repeatRows(db).findOne({ _id: new ObjectId(rowId) }))!.metadata.integrationCheck;
    expect(first).toMatchObject({ eligible: true });
    const r = await patch(add.practice, [setRow("INTEGRAZIONE", rowId, "F055", "2026-09-20")]);
    expect((await store.repeatRows(db).findOne({ _id: new ObjectId(rowId) }))!.metadata.integrationCheck).toEqual(first);
    expect(r.practice.values.F052).toBe("2026-10-17");
    // Svuotato e ricompilato: il controllo originale resta.
    const empty = await patch(r.practice, [setRow("INTEGRAZIONE", rowId, "F057", null)]);
    await patch(empty.practice, [setRow("INTEGRAZIONE", rowId, "F057", "2026-10-02")]);
    expect((await store.repeatRows(db).findOne({ _id: new ObjectId(rowId) }))!.metadata.integrationCheck).toEqual(first);
  });

  it("Vincoli → voci Ente: creazione bloccata, rimozione rifiutata, cambio ente sulla voce intatta, tolta quando non più Presente", async () => {
    const d = await create("VINCOLI");
    const v = (code: string) => d.repeats.VINCOLI.find((r) => r.constraint!.code === code)!.rowId;
    const pres = await patch(d, [{ repeat: "VINCOLI", rowId: v("PAESAGGISTICO"), constraint: { stato: { code: "PRESENTE" }, ente: { code: "SOPRINTENDENZA" } } }]);
    const ente = pres.practice.repeats.ENTE[0];
    expect(ente).toMatchObject({ locked: true, values: { F063: "Soprintendenza" }, origin: { repeat: "VINCOLI", rowId: v("PAESAGGISTICO") } });
    await expect(patch(pres.practice, [{ repeat: "ENTE", op: "REMOVE_ROW", rowId: ente.rowId }])).rejects.toMatchObject({ status: 422, extra: { code: "ROW_LOCKED", rowId: ente.rowId } });
    const cambio = await patch(pres.practice, [{ repeat: "VINCOLI", rowId: v("PAESAGGISTICO"), constraint: { ente: { code: "COMUNE" } } }]);
    expect(cambio.practice.repeats.ENTE).toEqual([expect.objectContaining({ rowId: ente.rowId, values: { F063: "Comune" } })]);
    await expect(patch(cambio.practice, [{ repeat: "VINCOLI", rowId: v("MONUMENTALE"), constraint: { stato: { code: "PRESENTE" }, ente: { code: "COMUNE" } } }])).rejects.toMatchObject({ status: 422 }); // ente unico
    const via = await patch(cambio.practice, [{ repeat: "VINCOLI", rowId: v("PAESAGGISTICO"), constraint: { stato: { code: "ASSENTE" } } }]);
    expect(via.practice.repeats.ENTE).toEqual([]);
    const h = await getHistory(db, u.pm, d.id, { view: "fields" });
    expect(h.items.filter((i) => i.repeat === "ENTE" && i.source === "SYSTEM").map((i) => i.kind).sort()).toEqual(["FIELD", "ROW_ADD", "ROW_REMOVE"]);
  });

  it("Fatturabile e ARPA composti (§4.7, §4.9): ciclo aperto una volta, NO forzato per riga, ultima riga per ordinal", async () => {
    const d = await create("FATT");
    const base = await patch(d, [set("F050", "2026-01-01"), { repeat: "ARPA", op: "ADD_ROW", clientRowKey: "a1", values: { F060: { code: "POSITIVO" } } }]);
    expect(base.practice.transversal.fatturabile).toBe("SI");
    const a1 = base.createdRows!.a1;
    // Ripresentazione: nasce la riga ARPA vuota, che diventa l'ultima → Fatturabile torna NO nello stesso salvataggio.
    const ripres = await patch(base.practice, [setRow("ARPA", a1, "F062", "2026-09-01")]);
    expect(ripres.practice.repeats.ARPA).toHaveLength(2);
    expect(ripres.practice.transversal.fatturabile).toBe("NO");
    const a2 = ripres.practice.repeats.ARPA[1].rowId;
    // Le modifiche arrivano in ordine diverso dall'ordinal: conta l'ordinal.
    const neg = await patch(ripres.practice, [setRow("ARPA", a2, "F060", { code: "POSITIVO" }), setRow("ARPA", a1, "F060", { code: "NEGATIVO" })]);
    expect(neg.practice.transversal.fatturabile).toBe("NO"); // nuovo Negativo vince nello stesso salvataggio
    const pos = await patch(neg.practice, [setRow("ARPA", a1, "F060", { code: "POSITIVO" })]);
    expect(pos.practice.transversal.fatturabile).toBe("SI");
    const neg2 = await patch(pos.practice, [setRow("ARPA", a1, "F060", { code: "NEGATIVO" })]);
    expect(neg2.practice.transversal.fatturabile).toBe("SI"); // stessa riga già forzata: non si forza di nuovo; ultima riga (a2) positiva
    // Svuotata e ricompilata, la Ripresentazione non riapre un altro ciclo.
    const vuota = await patch(neg2.practice, [setRow("ARPA", a1, "F062", null)]);
    const ancora = await patch(vuota.practice, [setRow("ARPA", a1, "F062", "2026-09-15")]);
    expect(ancora.practice.repeats.ARPA).toHaveLength(2);
    const h = await getHistory(db, u.pm, d.id, { view: "fields" });
    // NO→SI (Positivo), SI→NO (nuova riga ARPA vuota ultima), NO→SI (di nuovo Positivo): ogni cambio con la causa.
    const fatt = h.items.filter((i) => i.transversal === "fatturabile" && i.source === "SYSTEM");
    expect(fatt.map((i) => i.newValue).reverse()).toEqual(["SI", "NO", "SI"]);
    expect(fatt.every((i) => !!i.detail)).toBe(true);
  });

  it("Note Operative per gruppo (§4.8): solo dopo l'Assegna, solo la propria; storico con noteGroup", async () => {
    const d = await create("NOTE");
    const note = (group: "PM_PERMESSI" | "UT_PE", value: string): FieldChange => ({ transversal: "noteOperative", group, value });
    await expect(patch(d, [note("UT_PE", "ut")], u.ut)).rejects.toMatchObject({ status: 403, extra: { rejected: ["TRASV.NOTE_OPERATIVE.UT_PE"] } });
    const a = await assignPractice(deps, u.pm, d.id, { revision: 1, groups: ["UT_PE"] });
    const r = await patch(a, [note("UT_PE", "nota ut")], u.ut);
    expect(r.practice.transversal.noteOperative).toEqual({ UT_PE: "nota ut" });
    await expect(patch(r.practice, [note("PM_PERMESSI", "x")], u.ut)).rejects.toMatchObject({ status: 403 });
    const pm = await patch(r.practice, [note("PM_PERMESSI", "nota pm")]);
    expect(pm.practice.transversal.noteOperative).toEqual({ PM_PERMESSI: "nota pm" });
    const ut = await getHistory(db, u.ut, d.id, { view: "fields" });
    expect(ut.items.filter((i) => i.transversal === "noteOperative").map((i) => i.noteGroup)).toEqual(["UT_PE"]);
    // Fatturato solo PM e ADMIN.
    await expect(patch(pm.practice, [{ transversal: "fatturato", value: "SI" }], u.ut)).rejects.toMatchObject({ status: 403, extra: { rejected: ["TRASV.FATTURATO"] } });
  });

  it("ISTAT: codici esistenti e cascata coerente; utenti assegnabili", async () => {
    const d = await create("ISTAT");
    await expect(patch(d, [set("F006", { code: "99" })])).rejects.toMatchObject({ status: 422 });
    await expect(patch(d, [set("F006", { code: "01" }), set("F007", { code: "215" })])).rejects.toMatchObject({ status: 422, message: expect.stringContaining("non appartiene") });
    const ok = await patch(d, [set("F006", { code: "01" }), set("F007", { code: "201" }), set("F008", { code: "001001" })]);
    expect(ok.practice.values).toMatchObject({ F007: { code: "201" }, F008: { code: "001001" } });
    await expect(patch(ok.practice, [set("F095", { code: u.pm.id })], u.admin)).rejects.toMatchObject({ status: 422, message: expect.stringContaining("non assegnabile") });
    expect((await patch(ok.practice, [set("F095", { code: u.ut.id })], u.admin)).practice.values.F095).toEqual({ code: u.ut.id });
  });

  it("manuale e PATCH (D-119): un fallback non rilascia, un evento nuovo sì", async () => {
    const d = await create("MAN");
    const two = await patch(d, [set("F023", "2026-10-05"), set("F051", "2026-10-05")]);
    expect(two.practice.statoAttivita).toBe("PROTOCOLLATO");
    const man = await changeStato(deps, u.pm, d.id, { revision: two.practice.revision, stato: "STAND_BY" });
    const back = await patch(man, [set("F051", null)]);
    expect(back.practice).toMatchObject({ statoAttivita: "STAND_BY", statoSource: "MANUAL" });
    const nuovo = await patch(back.practice, [set("F051", "2026-10-07")]);
    expect(nuovo.practice).toMatchObject({ statoAttivita: "PROTOCOLLATO", statoSource: "AUTO" });
  });

  describe("correzioni della revisione del PATCH (D-132)", () => {
    it("P-01a: Ripresentazione svuotata e ricompilata dopo aver tolto il figlio → nessun secondo ciclo (giro documento → motore → documento)", async () => {
      const d = await create("P01A");
      const add = await patch(d, [{ repeat: "ARPA", op: "ADD_ROW", clientRowKey: "a", values: { F062: "2026-10-01" } }]);
      const parent = add.createdRows!.a;
      expect(add.practice.repeats.ARPA).toHaveLength(2);
      expect((await store.repeatRows(db).findOne({ _id: new ObjectId(parent) }))!.metadata.arpaOpened).toBe(true);
      const child = add.practice.repeats.ARPA.find((r) => r.rowId !== parent)!.rowId;
      const r1 = await patch(add.practice, [{ repeat: "ARPA", op: "REMOVE_ROW", rowId: child }, setRow("ARPA", parent, "F062", null)]);
      const r2 = await patch(r1.practice, [setRow("ARPA", parent, "F062", "2026-10-02")]);
      expect(r2.practice.repeats.ARPA.map((r) => r.rowId)).toEqual([parent]);
    });

    it("P-01b: nome Ente scritto a mano dopo il cambio d'ente, poi vincolo ASSENTE → la voce resta, sbloccata e segnalata", async () => {
      const d = await create("P01B");
      const vin = d.repeats.VINCOLI.find((r) => r.constraint!.code === "PAESAGGISTICO")!.rowId;
      const pres = await patch(d, [{ repeat: "VINCOLI", rowId: vin, constraint: { stato: { code: "PRESENTE" }, ente: { code: "SOPRINTENDENZA" } } }]);
      const ente = pres.practice.repeats.ENTE[0].rowId;
      const worked = await patch(pres.practice, [setRow("ENTE", ente, "F065", "2026-10-01")]);
      const cambio = await patch(worked.practice, [{ repeat: "VINCOLI", rowId: vin, constraint: { ente: { code: "COMUNE" } } }]);
      expect(cambio.practice.repeats.ENTE[0]).toMatchObject({ values: { F063: "Soprintendenza" }, warning: expect.stringContaining("Comune") });
      const fine = await patch(cambio.practice, [
        setRow("ENTE", ente, "F063", "Comune"),
        setRow("ENTE", ente, "F065", null),
        { repeat: "VINCOLI", rowId: vin, constraint: { stato: { code: "ASSENTE" } } },
      ]);
      expect(fine.practice.repeats.ENTE).toEqual([expect.objectContaining({ rowId: ente, values: expect.objectContaining({ F063: "Comune" }), warning: expect.any(String) })]);
      expect(fine.practice.repeats.ENTE[0].locked).toBeUndefined();
    });

    it("P-03: integrazione tolta e riaggiunta con la stessa data → ordinal 2 e il manuale si rilascia", async () => {
      const d = await create("P03");
      const add = await patch(d, [{ repeat: "INTEGRAZIONE", op: "ADD_ROW", clientRowKey: "i", values: { F055: "2026-10-05" } }]);
      expect(add.practice.statoAttivita).toBe("INTEGRAZIONE_RICHIESTA");
      const man = await changeStato(deps, u.pm, d.id, { revision: add.practice.revision, stato: "STAND_BY" });
      const rem = await patch(man, [{ repeat: "INTEGRAZIONE", op: "REMOVE_ROW", rowId: add.createdRows!.i }]);
      expect(rem.practice).toMatchObject({ statoAttivita: "STAND_BY", statoSource: "MANUAL" });
      const again = await patch(rem.practice, [{ repeat: "INTEGRAZIONE", op: "ADD_ROW", clientRowKey: "j", values: { F055: "2026-10-05" } }]);
      expect((await store.repeatRows(db).findOne({ _id: new ObjectId(again.createdRows!.j) }))!.ordinal).toBe(2);
      expect(again.practice).toMatchObject({ statoAttivita: "INTEGRAZIONE_RICHIESTA", statoSource: "AUTO" });
    });

    it("P-02: cascata ISTAT controllata sul risultato finale, in qualunque ordine, figli salvati compresi", async () => {
      const d = await create("P02");
      const ok = await patch(d, [set("F006", { code: "01" }), set("F007", { code: "201" }), set("F008", { code: "001001" })]);
      // Solo la Regione cambia: Torino e Agliè non appartengono alla Lombardia.
      await expect(patch(ok.practice, [set("F006", { code: "03" })])).rejects.toMatchObject({ status: 422 });
      // Stessa combinazione in due ordini: stesso rifiuto.
      const vuota = await create("P02B");
      await expect(patch(vuota, [set("F007", { code: "201" }), set("F006", { code: "03" })])).rejects.toMatchObject({ status: 422 });
      await expect(patch(vuota, [set("F006", { code: "03" }), set("F007", { code: "201" })])).rejects.toMatchObject({ status: 422 });
      // Figlio invariato rispedito: la parentela si controlla comunque.
      await expect(patch(ok.practice, [set("F006", { code: "03" }), set("F007", { code: "201" })])).rejects.toMatchObject({ status: 422 });
      // Figlio senza genitore; genitore svuotato con figli pieni.
      await expect(patch(vuota, [set("F007", { code: "201" })])).rejects.toMatchObject({ status: 422, message: expect.stringContaining("serve prima") });
      await expect(patch(ok.practice, [set("F006", null)])).rejects.toMatchObject({ status: 422 });
      // Cascata coerente sostituita per intero: riesce; svuotata dal basso: riesce.
      const mi = await patch(ok.practice, [set("F008", null), set("F007", { code: "215" }), set("F006", { code: "03" })]);
      expect(mi.practice.values).toMatchObject({ F006: { code: "03" }, F007: { code: "215" }, F008: null });
      // Il rifiuto precede il conflitto di revisione.
      await expect(patch({ ...mi.practice, revision: 99 }, [set("F006", { code: "01" })])).rejects.toMatchObject({ status: 422 }); // Milano non è in Piemonte
    });

    it("P-04: con ente unico l'ente non si azzera né si cambia; lo stesso codice è ammesso", async () => {
      const d = await create("P04");
      const mon = d.repeats.VINCOLI.find((r) => r.constraint!.code === "MONUMENTALE")!.rowId;
      await expect(patch(d, [{ repeat: "VINCOLI", rowId: mon, constraint: { ente: null } }])).rejects.toMatchObject({ status: 422 });
      await expect(patch(d, [{ repeat: "VINCOLI", rowId: mon, constraint: { ente: { code: "COMUNE" } } }])).rejects.toMatchObject({ status: 422 });
      const okEnte = await patch(d, [{ repeat: "VINCOLI", rowId: mon, constraint: { stato: { code: "PRESENTE" }, ente: { code: "SOPRINTENDENZA" } } }]);
      expect(okEnte.practice.repeats.ENTE[0].values.F063).toBe("Soprintendenza");
    });

    it("P-05: Codice G7 intero non negativo; gli altri NUMBER restano decimali", async () => {
      const d = await create("P05");
      await expect(patch(d, [set("F001", 1.5)])).rejects.toMatchObject({ status: 422 });
      await expect(patch(d, [set("F001", -3)])).rejects.toMatchObject({ status: 422 });
      const ok = await patch(d, [set("F001", 4502), set("F021", 45.123)]);
      expect(ok.practice).toMatchObject({ codiceG7: "4502", values: expect.objectContaining({ F021: 45.123 }) });
    });

    it("P-07: rifiuto sui Vincoli con la chiave contrattuale repeat:VINCOLI", async () => {
      const d = await create("P07");
      const vin = d.repeats.VINCOLI[0].rowId;
      await expect(patch(d, [{ repeat: "VINCOLI", rowId: vin, constraint: { stato: { code: "PRESENTE" } } }], u.ut)).rejects.toMatchObject({ status: 403, extra: { rejected: ["repeat:VINCOLI"] } });
    });

    it("P-08: l'avviso del delta negativo compare solo quando la condizione nasce", async () => {
      const d = await create("P08");
      const prot = await patch(d, [set("F051", "2026-08-01")]);
      const neg = await patch(prot.practice, [{ repeat: "INTEGRAZIONE", op: "ADD_ROW", clientRowKey: "i", values: { F055: "2026-10-06", F057: "2026-10-01" } }]);
      expect(neg.toasts.filter((t) => t.kind === "WARNING")).toHaveLength(1);
      const other = await patch(neg.practice, [set("F003", "Nuovo nome")]);
      expect(other.toasts).toEqual([]);
    });

    it("P-09: ADD_ROW con valori iniziali → ROW_ADD più una FIELD USER per ogni valore non vuoto", async () => {
      const d = await create("P09");
      const add = await patch(d, [{ repeat: "INTEGRAZIONE", op: "ADD_ROW", clientRowKey: "i", values: { F055: "2026-10-05", F056: "nota", F057: null } }]);
      const h = await getHistory(db, u.pm, d.id, { view: "fields" });
      const mine = h.items.filter((i) => i.rowId === add.createdRows!.i && i.source === "USER");
      expect(mine.map((i) => [i.kind, i.flowId ?? null]).sort()).toEqual([["FIELD", "F055"], ["FIELD", "F056"], ["ROW_ADD", null]]);
    });

    it("P-11: clientRowKey che coincidono con nomi di proprietà ereditate", async () => {
      const d = await create("P11");
      const r = await patch(d, [
        { repeat: "INTEGRAZIONE", op: "ADD_ROW", clientRowKey: "constructor" },
        { repeat: "INTEGRAZIONE", op: "ADD_ROW", clientRowKey: "toString" },
      ]);
      expect(Object.keys(r.createdRows!).sort()).toEqual(["constructor", "toString"]);
      await expect(patch(r.practice, [{ repeat: "INTEGRAZIONE", op: "ADD_ROW", clientRowKey: "x" }, { repeat: "INTEGRAZIONE", op: "ADD_ROW", clientRowKey: "x" }])).rejects.toMatchObject({ status: 422 });
    });

    it("§3.5: più scritture dello stesso campo → vale l'ultima, storico solo della variazione netta", async () => {
      const d = await create("NETTO");
      const op = "99999999-9999-4999-8999-999999999991";
      await patch(d, [set("F003", "B"), set("F003", "N")], u.pm, op); // N è il valore salvato: nessuna variazione
      const op2 = "99999999-9999-4999-8999-999999999992";
      const r = await patch({ ...d, revision: 2 }, [set("F003", "B"), set("F003", "C")], u.pm, op2);
      expect(r.practice.nomeSito).toBe("C");
      const h = await getHistory(db, u.pm, d.id, { view: "fields" });
      expect(h.items.filter((i) => i.operationId === op)).toEqual([]);
      expect(h.items.filter((i) => i.operationId === op2).map((i) => [i.oldValue, i.newValue])).toEqual([["N", "C"]]);
    });

    it("§3.6: il solo ritorno MANUAL → AUTO senza cambio di stato registra un evento STATO", async () => {
      const d = await create("RITORNO");
      const a = await patch(d, [set("F023", "2026-10-01")]);
      const man = await changeStato(deps, u.pm, d.id, { revision: a.practice.revision, stato: "PROTOCOLLATO" });
      const r = await patch(man, [set("F051", "2026-10-05")]);
      expect(r.practice).toMatchObject({ statoAttivita: "PROTOCOLLATO", statoSource: "AUTO" });
      const ev = await getHistory(db, u.pm, d.id, { view: "events" });
      expect(ev.items[0]).toMatchObject({ kind: "STATO", source: "SYSTEM", detail: expect.stringContaining("torna automatico") });
    });

    it("§4.1: guasto a metà in ogni punto → nessun effetto (revisione, valori, righe, riepilogo, storico, eventi, ricevuta)", async () => {
      for (const at of ["afterCas", "afterIteration", "afterRows", "duringHistory", "beforeReceipt"] as const) {
        const d = await create(`GUASTO-${at}`);
        const vin = d.repeats.VINCOLI.find((r) => r.constraint!.code === "PAESAGGISTICO")!.rowId;
        const pid = new ObjectId(d.id);
        const snapshot = async () => ({
          practice: await store.practices(db).findOne({ _id: pid }),
          iteration: await store.iterations(db).findOne({ practiceId: pid }),
          rows: await store.repeatRows(db).countDocuments({ practiceId: pid }),
          history: await store.valueHistory(db).countDocuments({ practiceId: pid }),
          events: await store.events(db).countDocuments({ practiceId: pid }),
          receipts: await store.operations(db).countDocuments({ practiceId: pid }),
        });
        const before = await snapshot();
        const op = `aaaaaaaa-aaaa-4aaa-8aaa-${String(Date.now()).slice(-12).padStart(12, "0")}`;
        await expect(
          patchFields({ ...deps, faultAt: at }, u.pm, d.id, {
            iteration: 1,
            revision: 1,
            operationId: op,
            changes: [set("F023", "2026-10-01"), { repeat: "ARPA", op: "ADD_ROW", clientRowKey: "a", values: { F062: "2026-10-01" } }, { repeat: "VINCOLI", rowId: vin, constraint: { stato: { code: "PRESENTE" }, ente: { code: "COMUNE" } } }],
          })
        ).rejects.toThrow(`Guasto simulato: ${at}`);
        expect(await snapshot(), at).toEqual(before);
        // Senza guasto la stessa operazione riesce (la ricevuta non c'era).
        const ok = await patch(d, [set("F023", "2026-10-01"), { repeat: "ARPA", op: "ADD_ROW", clientRowKey: "a", values: { F062: "2026-10-01" } }, { repeat: "VINCOLI", rowId: vin, constraint: { stato: { code: "PRESENTE" }, ente: { code: "COMUNE" } } }], u.pm, op);
        expect(ok.practice).toMatchObject({ revision: 2, statoAttivita: "ASSEGNATO" });
        expect(ok.practice.repeats.ARPA).toHaveLength(2);
        expect(ok.practice.repeats.ENTE).toHaveLength(1);
      }
    }, 120_000);

    it("§4.2: PATCH concorrenti con la stessa operationId e righe di sistema → tutti riescono, stessi createdRows e toast, un solo effetto", async () => {
      const d = await create("IDEMP");
      const vin = d.repeats.VINCOLI.find((r) => r.constraint!.code === "PAESAGGISTICO")!.rowId;
      const op = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
      const body = (): FieldChange[] => [
        { repeat: "ARPA", op: "ADD_ROW", clientRowKey: "a1", values: { F062: "2026-10-01" } },
        { repeat: "INTEGRAZIONE", op: "ADD_ROW", clientRowKey: "i1", values: { F055: "2026-10-05" } },
        { repeat: "VINCOLI", rowId: vin, constraint: { stato: { code: "PRESENTE" }, ente: { code: "SOPRINTENDENZA" } } },
      ];
      const results = await Promise.allSettled([1, 2, 3, 4].map(() => patch(d, body(), u.pm, op)));
      expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled", "fulfilled", "fulfilled"]);
      const ok = results as PromiseFulfilledResult<Awaited<ReturnType<typeof patch>>>[];
      for (const r of ok) expect(r.value.createdRows).toEqual(ok[0].value.createdRows);
      for (const r of ok) expect(r.value.toasts).toEqual(ok[0].value.toasts);
      const pid = new ObjectId(d.id);
      expect((await store.practices(db).findOne({ _id: pid }))!.revision).toBe(2);
      expect(await store.repeatRows(db).countDocuments({ practiceId: pid, groupKey: { $in: ["ARPA", "INTEGRAZIONE", "ENTE"] } })).toBe(4);
      expect(await store.operations(db).countDocuments({ operationId: op })).toBe(1);
      // Stesso UUID con un corpo diverso → OPERATION_REUSED; un altro attore con lo stesso UUID → operazione propria.
      await expect(patch({ ...d, revision: 2 }, [set("F003", "x")], u.pm, op)).rejects.toMatchObject({ status: 409, extra: { code: "OPERATION_REUSED" } });
      const other = await patch({ ...d, revision: 2 }, [set("F003", "y")], u.admin, op);
      expect(other.practice.revision).toBe(3);
    }, 90_000);
  });
});
