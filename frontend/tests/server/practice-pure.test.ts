// @vitest-environment node
/** B5b, parti pure: normalizzazione in scrittura (D-110), ereditarietà (D-25, D-26), mapper della scheda, Assegna. */
import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { NONE_CODE, TEMPLATE_IDS, type FieldOccurrenceDTO, type MembershipDTO, type UserDTO } from "@/lib/contract";
import { assignEmail } from "@/lib/email";
import { inherit, inheritancePlan } from "@/lib/practice/inheritance";
import { toDetailDTO, toSummaryDTO } from "@/lib/practice/detail";
import { notesOf, visibleNoteGroups, visibleNotes } from "@/lib/practice/notes";
import { listCodesOf, normalizeConstraint, normalizeFieldValue, normalizeNoteOperative } from "@/lib/practice/normalize";
import { buildIteration, buildNewPractice } from "@/lib/store/practice-factory";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";
import { defaultTodayFlowIds } from "@/services/practices-v2/commands";
import { hiddenNotesFilter, parseHistoryQuery } from "@/services/practices-v2/history";

const occ = (dataType: FieldOccurrenceDTO["dataType"], list?: FieldOccurrenceDTO["list"]) => ({ dataType, label: "Campo", list });
const sel = { listId: "L", kind: "CONFIGURABLE" as const, allowOther: true };
const usr = { listId: "U", kind: "USERS" as const, allowOther: false, allowNone: true };
const uid = "0123456789abcdef01234567";

describe("normalizzazione in scrittura (D-110)", () => {
  it("testo e date: soli spazi → null; testo valorizzato invariato; date reali", () => {
    expect(normalizeFieldValue(occ("TEXT"), "   ")).toBeNull();
    expect(normalizeFieldValue(occ("LONGTEXT"), " a ")).toBe(" a ");
    expect(normalizeFieldValue(occ("DATE"), " ")).toBeNull();
    expect(normalizeFieldValue(occ("DATE"), "2026-02-28")).toBe("2026-02-28");
    expect(() => normalizeFieldValue(occ("DATE"), "2026-02-30")).toThrow(/data non valida/);
    expect(() => normalizeFieldValue(occ("DATE"), "28/02/2026")).toThrow(/422|data/);
    expect(() => normalizeFieldValue(occ("TEXT"), 3 as never)).toThrow(/testo/);
    expect(() => normalizeFieldValue(occ("TEXT"), "x".repeat(2001))).toThrow(/troppo lungo/);
  });

  it("numeri finiti; null e undefined → null", () => {
    expect(normalizeFieldValue(occ("NUMBER"), 0)).toBe(0);
    expect(() => normalizeFieldValue(occ("NUMBER"), "5" as never)).toThrow(/numero/);
    expect(normalizeFieldValue(occ("NUMBER"), null)).toBeNull();
    expect(normalizeFieldValue(occ("NUMBER"), undefined)).toBeNull();
  });

  it("SELECT: codice vuoto → 422; Altro con testo obbligatorio; testo solo con Altro", () => {
    expect(() => normalizeFieldValue(occ("SELECT", sel), { code: "  " })).toThrow(expect.objectContaining({ status: 422 }));
    expect(normalizeFieldValue(occ("SELECT", sel), { code: " RAW " })).toEqual({ code: "RAW" });
    expect(normalizeFieldValue(occ("SELECT", sel), { code: "ALTRO", otherText: " boh " })).toEqual({ code: "ALTRO", otherText: "boh" });
    expect(() => normalizeFieldValue(occ("SELECT", sel), { code: "ALTRO", otherText: " " })).toThrow(/Altro/);
    expect(() => normalizeFieldValue(occ("SELECT", sel), { code: "RAW", otherText: "x" })).toThrow(/solo con Altro/);
    expect(normalizeFieldValue(occ("SELECT", { ...sel, allowOther: false }), { code: "ALTRO" })).toEqual({ code: "ALTRO" });
    expect(() => normalizeFieldValue(occ("SELECT", sel), { code: "A", x: 1 } as never)).toThrow(/chiavi/);
  });

  it("MULTISELECT e USERS: [] → null, codici univoci, Nessuno esclusivo e solo se ammesso", () => {
    expect(normalizeFieldValue(occ("MULTISELECT", sel), [])).toBeNull();
    expect(() => normalizeFieldValue(occ("MULTISELECT", sel), [{ code: "A" }, { code: "A" }])).toThrow(/ripetuti/);
    expect(normalizeFieldValue(occ("USERS", usr), [{ code: uid }])).toEqual([{ code: uid }]);
    expect(normalizeFieldValue(occ("USER", usr), { code: NONE_CODE })).toEqual({ code: NONE_CODE });
    expect(() => normalizeFieldValue(occ("USERS", usr), [{ code: NONE_CODE }, { code: uid }])).toThrow(/Nessuno/);
    expect(() => normalizeFieldValue(occ("USER", { ...usr, allowNone: false }), { code: NONE_CODE })).toThrow(/Nessuno/);
    expect(() => normalizeFieldValue(occ("USER", usr), { code: "mario" })).toThrow(/utente/);
    expect(() => normalizeFieldValue(occ("USER", usr), { code: uid, otherText: "x" })).toThrow(/testo libero/);
  });

  it("codici da controllare sulle liste; vincoli; note operative", () => {
    expect(listCodesOf(occ("MULTISELECT", sel), [{ code: "A" }, { code: "ALTRO", otherText: "x" }])).toEqual(["A"]);
    expect(listCodesOf(occ("SELECT", { ...sel, allowOther: false }), { code: "ALTRO" })).toEqual(["ALTRO"]);
    expect(listCodesOf(occ("USER", usr), { code: NONE_CODE })).toEqual([]);
    expect(listCodesOf(occ("TEXT"), "x")).toEqual([]);
    expect(normalizeConstraint("Parco", { stato: { code: "PRESENTE" } })).toEqual({ stato: { code: "PRESENTE" } });
    expect(normalizeConstraint("Parco", { ente: null })).toEqual({ ente: null });
    expect(() => normalizeConstraint("Parco", { stato: { code: "" } })).toThrow(/Parco \(stato\)/);
    expect(normalizeNoteOperative("  \n ")).toBe("");
  });
});

describe("ereditarietà (D-25, D-26)", () => {
  it("in nessun template si ereditano G7, ODA, Note ODA, Stato ODA, Vincoli o calcolati", () => {
    for (const id of TEMPLATE_IDS) {
      const t = COMPILED_TEMPLATES[id].template;
      for (const mode of ["resubmit", "rework"] as const) {
        const plan = inheritancePlan(t, mode);
        expect(plan.flowIds).not.toContain("F001");
        expect(plan.repeatGroups).not.toContain("ODA");
        expect(plan.repeatGroups).not.toContain("VINCOLI");
        const labels = plan.flowIds.map((f) => t.occurrences.find((o) => o.kind === "MASTER" && o.flowId === f)!);
        expect(labels.filter((o) => /\bODA\b/i.test(o.label)).map((o) => o.label), `${id} ${mode}`).toEqual([]);
        expect(labels.filter((o) => o.computed)).toEqual([]);
        expect(plan.flowIds).toEqual(expect.arrayContaining(["F002", "F003", "F004", "F005"]));
      }
      expect(inheritancePlan(t, "resubmit").repeatGroups).toEqual(["TENANT"]);
      expect(inheritancePlan(t, "rework").repeatGroups).toEqual([]);
    }
  });

  it("rilavorazione: solo il Core; ripresentazione: anche Dati Secondari", () => {
    const t = COMPILED_TEMPLATES.INWIT.template;
    const sec = (f: string) => t.occurrences.find((o) => o.kind === "MASTER" && o.flowId === f)!.sectionKey;
    expect(inheritancePlan(t, "rework").flowIds.every((f) => sec(f) === "PM_PERMESSI.CORE")).toBe(true);
    const resub = inheritancePlan(t, "resubmit").flowIds;
    expect(resub.some((f) => sec(f) === "PM_PERMESSI.DATI_SECONDARI")).toBe(true);
    expect(resub.every((f) => ["PM_PERMESSI.CORE", "PM_PERMESSI.DATI_SECONDARI"].includes(sec(f)))).toBe(true);
  });

  it("inherit copia i valori non vuoti e rinumera le righe", () => {
    const plan = { flowIds: ["F002", "F003"], repeatGroups: ["TENANT"] };
    const out = inherit(plan, {
      values: { F001: 5, F002: "S1", F003: "  ", F099: "x" },
      rows: [
        { groupKey: "TENANT", ordinal: 7, values: { F018: { code: "A" }, F019: "" } },
        { groupKey: "TENANT", ordinal: 3, values: { F018: { code: "B" } } },
        { groupKey: "ODA", ordinal: 1, values: { F014: "x" } },
      ],
    });
    expect(out.values).toEqual({ F002: "S1" });
    expect(out.rows).toEqual([
      { groupKey: "TENANT", ordinal: 1, values: { F018: { code: "B" } } },
      { groupKey: "TENANT", ordinal: 2, values: { F018: { code: "A" } } },
    ]);
  });
});

describe("scheda (PraticaDetailDTO)", () => {
  const t = COMPILED_TEMPLATES.INWIT.template;
  const now = new Date("2026-10-08T07:00:00Z");
  const b = buildNewPractice({
    practiceId: new ObjectId(),
    iterationId: new ObjectId(),
    templateId: "INWIT",
    template: t,
    identity: { codiceG7: "77", codiceSito: "S1", nomeSito: "Sito", committente: { code: "TODOS" }, clienteFinale: { code: "INWIT" } },
    createdBy: null,
    now,
  });
  const pm: UserDTO = { id: uid, name: "PM", email: "pm@x", status: "active", isAdmin: false, memberships: [{ templateId: "INWIT", group: "PM_PERMESSI", role: "PM", leader: false }], createdAt: "", updatedAt: "" };

  it("iterazione corrente: accessi, azioni, righe VINCOLI, progress e riferimenti", () => {
    const d = toDetailDTO({ practice: b.practice, iteration: b.iteration, rows: b.rows, iterations: [b.iteration] }, t, pm);
    expect(d).toMatchObject({ iteration: 1, revision: 1, codiceG7: "77", statoAttivita: "CREATA", statoSource: "AUTO", manualLocks: [], templateVersion: t.version });
    expect(d.repeats.VINCOLI).toHaveLength(11);
    expect(d.repeats.TENANT).toEqual([]);
    expect(d.access["F002@PM_PERMESSI.CORE"]).toEqual({ editable: true });
    expect(d.actions).toMatchObject({ canAssign: true, canDelete: true, canResubmit: false });
    expect(d.repeatAccess.VINCOLI).toEqual({ canAddRows: false, canRemoveRows: false });
    expect(d.progress.PM_PERMESSI.total).toBeGreaterThan(0);
    expect(d.iterations).toEqual([{ id: b.iteration._id.toHexString(), n: 1, codiceG7: "77", createdAt: now.toISOString(), current: true }]);
  });

  it("iterazione passata: sola lettura, valori di quell'iterazione, dati attuali della pratica", () => {
    const next = buildIteration({ practiceId: b.practice._id, iterationId: new ObjectId(), n: 2, template: t, values: { F001: 88, F002: "S1" }, now });
    const practice = { ...b.practice, currentIterationId: next._id, currentIterationN: 2, revision: 5 };
    const d = toDetailDTO({ practice, iteration: b.iteration, rows: b.rows, iterations: [b.iteration, next] }, t, pm);
    expect(d).toMatchObject({ iteration: 1, revision: 5, codiceG7: "77", alerts: [] });
    // v0.4.2: ogni occorrenza in sola lettura con il motivo PAST_ITERATION.
    expect(Object.keys(d.access).length).toBeGreaterThan(0);
    expect(Object.values(d.access).every((a) => !a.editable && a.reason === "PAST_ITERATION")).toBe(true);
    expect(Object.values(d.actions).every((v) => v === false || (Array.isArray(v) && v.length === 0))).toBe(true);
    expect(Object.values(d.repeatAccess).every((r) => !r.canAddRows && !r.canRemoveRows)).toBe(true);
    expect(d.iterations.map((i) => [i.n, i.current, i.codiceG7])).toEqual([[1, false, "77"], [2, true, "88"]]);
  });

  it("riepilogo con progress memorizzato o a zero", () => {
    expect(toSummaryDTO(b.practice).progress.DL).toEqual({ filled: 0, total: 0 });
  });
});

describe("Assegna e storico", () => {
  it("date del giorno all'Assegna verso UT+PE: due campi per template (D-21)", () => {
    const expected = { ILIAD: ["F127", "F141"], TOWERNET: ["F087", "F097"], TIM_FIBERCOP: ["F089", "F099"], INWIT: ["F093", "F107"], FASTWEB_VODAFONE: ["F064", "F079"], LEONARDO: ["F083", "F098"] };
    for (const id of TEMPLATE_IDS) expect(defaultTodayFlowIds(COMPILED_TEMPLATES[id].bindings).sort()).toEqual(expected[id]);
  });

  it("mail di Assegna con escape di nota e nomi", () => {
    const m = assignEmail({ name: "<b>Ugo</b>", codiceSito: "S1", nomeSito: "A&B", gestore: "INWIT", groups: "UT/PE", actorName: "Eva", note: "<script>x</script>", link: "http://h/p?a=1&b=2" });
    expect(m.subject).toBe("Pratica S1 assegnata a UT/PE");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).toContain("A&amp;B");
    expect(m.html).toContain("&lt;b&gt;Ugo");
  });

  it("parametri dello storico", () => {
    expect(parseHistoryQuery(new URLSearchParams("iteration=2&page=3&view=fields"))).toEqual({ iteration: 2, page: 3, view: "fields" });
    expect(parseHistoryQuery(new URLSearchParams(""))).toEqual({ iteration: undefined, page: undefined, view: undefined });
    expect(() => parseHistoryQuery(new URLSearchParams("view=tutto"))).toThrow(/view/);
    expect(() => parseHistoryQuery(new URLSearchParams("page=0"))).toThrow(/page/);
  });
});

describe("destinatari aggiuntivi dell'Assegna (D-116, provvisorio R-16 B1)", () => {
  it("DL avvisato quando la destinazione comprende UT_PE, una sola volta e solo se non è già destinatario", async () => {
    const { assignNotifiedGroups } = await import("@/lib/engines/access");
    expect(assignNotifiedGroups(["UT_PE"])).toEqual({ targets: ["UT_PE"], extra: ["DL"] });
    expect(assignNotifiedGroups(["UT_PE", "DL"]).extra).toEqual([]);
    expect(assignNotifiedGroups(["AIE"]).extra).toEqual([]);
  });
});

describe("Note Operative per gruppo (D-121)", () => {
  const who = (memberships: MembershipDTO[], extra: Partial<UserDTO> = {}): UserDTO => ({
    id: uid, name: "u", email: "u@x", status: "active", isAdmin: false, memberships, createdAt: "", updatedAt: "", ...extra,
  });
  const m = (group: MembershipDTO["group"], role: MembershipDTO["role"], leader = false, templateId: MembershipDTO["templateId"] = "INWIT"): MembershipDTO => ({ templateId, group, role, leader });

  it("chi vede quali note: il proprio gruppo; tutte per PM leader del gestore e ADMIN", () => {
    expect(visibleNoteGroups(who([m("PM_PERMESSI", "PM")]), "INWIT")).toEqual(["PM_PERMESSI"]);
    expect(visibleNoteGroups(who([m("PM_PERMESSI", "PERMESSI", true)]), "INWIT")).toEqual(["PM_PERMESSI"]); // leader ma non PM
    expect(visibleNoteGroups(who([m("PM_PERMESSI", "PM", true)]), "INWIT")).toEqual(["PM_PERMESSI", "UT_PE", "AIE", "DL"]);
    expect(visibleNoteGroups(who([m("PM_PERMESSI", "PM", true, "ILIAD")]), "INWIT")).toEqual([]); // leader di un altro gestore
    expect(visibleNoteGroups(who([m("UT_PE", "UT"), m("DL", "DL")]), "INWIT")).toEqual(["UT_PE", "DL"]);
    expect(visibleNoteGroups(who([], { isAdmin: true }), "LEONARDO")).toEqual(["PM_PERMESSI", "UT_PE", "AIE", "DL"]);
    expect(visibleNoteGroups(who([m("AIE", "AIE")], { status: "deactivated" }), "INWIT")).toEqual([]);
  });

  it("nota unica dei documenti precedenti = nota di PM/Permessi; solo le visibili escono", () => {
    expect(notesOf({ noteOperative: "vecchia" })).toEqual({ PM_PERMESSI: "vecchia", UT_PE: "", AIE: "", DL: "" });
    expect(notesOf({ noteOperative: { UT_PE: "x" } })).toEqual({ PM_PERMESSI: "", UT_PE: "x", AIE: "", DL: "" });
    expect(visibleNotes({ PM_PERMESSI: "a", UT_PE: "b", AIE: "", DL: "d" }, ["UT_PE", "AIE"])).toEqual({ UT_PE: "b", AIE: "" });
  });

  it("scheda: note e voci d'accesso solo dei gruppi visibili", () => {
    const t = COMPILED_TEMPLATES.INWIT.template;
    const b = buildNewPractice({
      practiceId: new ObjectId(),
      iterationId: new ObjectId(),
      templateId: "INWIT",
      template: t,
      identity: { codiceG7: "1", codiceSito: "S", nomeSito: "N", committente: { code: "TODOS" }, clienteFinale: { code: "INWIT" } },
      createdBy: null,
      now: new Date(),
    });
    b.iteration.transversal.noteOperative = { PM_PERMESSI: "pm", UT_PE: "ut", AIE: "aie", DL: "dl" };
    const agg = { practice: b.practice, iteration: b.iteration, rows: b.rows, iterations: [b.iteration] };
    const ut = toDetailDTO(agg, t, who([m("UT_PE", "PE")]));
    expect(ut.transversal.noteOperative).toEqual({ UT_PE: "ut" });
    expect(Object.keys(ut.access).filter((k) => k.startsWith("TRASV.NOTE_OPERATIVE"))).toEqual(["TRASV.NOTE_OPERATIVE.UT_PE"]);
    const leader = toDetailDTO(agg, t, who([m("PM_PERMESSI", "PM", true)]));
    expect(leader.transversal.noteOperative).toEqual({ PM_PERMESSI: "pm", UT_PE: "ut", AIE: "aie", DL: "dl" });
    expect(Object.keys(leader.access).filter((k) => k.startsWith("TRASV.NOTE_OPERATIVE"))).toHaveLength(4);
  });

  it("filtro dello storico: nessun filtro se tutto è visibile; le voci senza gruppo sono di PM/Permessi", () => {
    expect(hiddenNotesFilter(["PM_PERMESSI", "UT_PE", "AIE", "DL"])).toEqual({});
    expect(hiddenNotesFilter(["PM_PERMESSI", "UT_PE"])).toEqual({ $nor: [{ "target.transversal": "noteOperative", "target.noteGroup": { $in: ["AIE", "DL"] } }] });
    expect(hiddenNotesFilter(["UT_PE"]).$nor).toHaveLength(2);
  });
});

describe("metadati di riga: giro documento → motore → documento (D-132 P-01, §4.3)", () => {
  it("origin, locked, warning, integrationCheck, generatedName (anche null) e arpaOpened si conservano", async () => {
    const { toEngineRow } = await import("@/lib/practice/detail");
    const { applyEngineMetadata } = await import("@/services/practices-v2/fields");
    const origin = { groupKey: "VINCOLI", rowId: new ObjectId() };
    const integrationCheck = { checkedAtRomeDate: "2026-10-08", remainingDays: 3, eligible: true, operationId: "op" };
    for (const metadata of [
      { origin, locked: true, warning: "w", generatedName: "Soprintendenza" },
      { origin, locked: false, generatedName: null },
      { arpaOpened: true, integrationCheck },
      {},
    ]) {
      const doc = { _id: new ObjectId(), practiceId: new ObjectId(), iterationId: new ObjectId(), groupKey: "ENTE", ordinal: 1, values: {}, metadata, createdAt: new Date(), updatedAt: new Date() };
      const back = { ...doc, metadata: {} };
      applyEngineMetadata(back, toEngineRow(doc).metadata!);
      expect(back.metadata).toEqual(metadata);
    }
  });
});
