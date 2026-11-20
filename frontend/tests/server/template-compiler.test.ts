// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { ConditionDTO, FieldOccurrenceDTO, TemplateDTO, TemplateId } from "@/lib/contract";
import { compileTemplates, stableStringify, type CompileResult, type CompilerInput } from "@/lib/templates/compiler";
import { loadCompilerInput, repoPaths } from "@/lib/templates/load";

const FRONTEND = path.resolve(__dirname, "../..");
const paths = repoPaths(FRONTEND);

let input: CompilerInput;
let result: CompileResult;
const tpl = (id: TemplateId): TemplateDTO => result.templates[id]!.template;
const occ = (id: TemplateId, flowId: string) => tpl(id).occurrences.filter((o) => o.flowId === flowId);
const master = (id: TemplateId, flowId: string) => occ(id, flowId).find((o) => o.kind === "MASTER")!;
const refs = (c: ConditionDTO | null | undefined): string[] =>
  !c ? [] : "all" in c ? c.all.flatMap(refs) : "any" in c ? c.any.flatMap(refs) : [c.flowId];
/** Parti di una condizione (all: [cella, regole Incarico…] → elenco; singola → [c]). */
const parts = (c: ConditionDTO | null | undefined): ConditionDTO[] => (!c ? [] : "all" in c ? c.all : [c]);
/** D-207: flowId di Incarico / Lavorazione per template. */
const INCARICO: Record<TemplateId, string> = { ILIAD: "F015", TOWERNET: "F012", TIM_FIBERCOP: "F014", INWIT: "F012", FASTWEB_VODAFONE: "F013", LEONARDO: "F013" };
const onIncarico = (id: TemplateId, p: ConditionDTO) => "flowId" in p && p.flowId === INCARICO[id];
/** La condizione senza la regola per Incarico (D-207). */
const cell = (id: TemplateId, c: ConditionDTO | null | undefined): ConditionDTO | null => {
  const rest = parts(c).filter((p) => !onIncarico(id, p));
  return rest.length === 0 ? null : rest.length === 1 ? rest[0] : { all: rest };
};
/** Codici di Incarico per cui l'occorrenza è nascosta (NEQ della regola D-207). */
const hiddenFor = (id: TemplateId, c: ConditionDTO | null | undefined): string[] => {
  const p = parts(c).find((x) => onIncarico(id, x)) as { op: string; value: string | string[] } | undefined;
  if (!p) return [];
  expect(p.op).toBe("NEQ");
  return Array.isArray(p.value) ? [...p.value] : [p.value];
};

beforeAll(() => {
  input = loadCompilerInput(paths);
  result = compileTemplates(input);
});

describe("inventario e diagnostica (§2.7)", () => {
  it("nessun errore di compilazione", () => {
    const errors = result.diagnostics.filter((d) => d.severity === "ERROR");
    expect(errors, JSON.stringify(errors, null, 1)).toEqual([]);
  });

  it("conteggi per template: righe dell'MD, occorrenze dopo le esclusioni, flowId", () => {
    const expected: Record<TemplateId, [number, number, number]> = {
      ILIAD: [190, 184, 155], // F104/F105 alias dei trasversali (D-76); Importo/Costo UT e PE esclusi (D-201)
      TOWERNET: [133, 129, 113], // Importo/Costo esclusi (D-201)
      TIM_FIBERCOP: [143, 139, 115], // B3 eliminati (D-100, D-114); +Codice sito proprietà (D-203); Importo/Costo esclusi (D-201)
      INWIT: [145, 141, 123], // Importo/Costo esclusi (D-201)
      FASTWEB_VODAFONE: [122, 118, 104], // B3 eliminati (D-100, D-114); Importo/Costo esclusi (D-201)
      LEONARDO: [140, 136, 114], // Importo/Costo esclusi (D-201)
    };
    for (const [id, [rows, occurrences, flowIds]] of Object.entries(expected)) {
      expect(result.manifest.templates[id], id).toMatchObject({ sourceRows: rows, occurrences, flowIds });
    }
    const totalRows = Object.values(result.manifest.templates).reduce((a, t) => a + t.sourceRows, 0);
    expect(totalRows).toBe(873);
  });

  it("50/50 formulazioni delle condizioni incontrate e tradotte (D-114: tolta la n.21, aggiunte n.50 e n.51)", () => {
    expect(input.conditions.formulations).toHaveLength(50);
    expect(result.diagnostics.filter((d) => d.code === "FORMULATION_UNUSED")).toEqual([]);
    expect(result.diagnostics.filter((d) => d.code === "CONDITION_UNTRANSLATED")).toEqual([]);
  });

  it("tutte le correzioni applicate con precondizione valida; B1–B4 non sono più correzioni (D-114)", () => {
    expect(input.overrides.overrides).toHaveLength(40); // 16 + 24 esclusioni Importo/Costo (D-201)
    expect(input.overrides.overrides.filter((o) => /R-1 B[1-4]/.test(o.decision))).toEqual([]);
    expect(result.diagnostics.filter((d) => d.code.startsWith("OVERRIDE_"))).toEqual([]);
  });
});

describe("master e mirror", () => {
  it("un solo MASTER per flowId; i mirror hanno master, gruppo, tipo e lista del master", () => {
    for (const id of Object.keys(result.templates) as TemplateId[]) {
      const byFlow = new Map<string, FieldOccurrenceDTO[]>();
      for (const o of tpl(id).occurrences) byFlow.set(o.flowId!, [...(byFlow.get(o.flowId!) ?? []), o]);
      for (const [flowId, list] of byFlow) {
        const masters = list.filter((o) => o.kind === "MASTER");
        expect(masters, `${id} ${flowId}`).toHaveLength(1);
        for (const m of list.filter((o) => o.kind === "MIRROR")) {
          expect(m.ownerGroup, `${id} ${flowId}`).toBe(masters[0].ownerGroup);
          expect(m.dataType, `${id} ${flowId}`).toBe(masters[0].dataType);
          expect(m.list, `${id} ${flowId}`).toEqual(masters[0].list);
          expect(m.required).toBe(false);
        }
      }
    }
  });

  it("R-1: B1 master AIE, B2 Forecast AIE master PM, B3 eliminati; B4 superata: Invio AS/VS master PM (D-207)", () => {
    expect(master("TIM_FIBERCOP", "F047").ownerGroup).toBe("AIE"); // B1 (F046 → F047 dopo D-203)
    expect(master("ILIAD", "F119").sectionKey).toBe("AIE.FASE_AIE"); // B1
    expect(master("INWIT", "F043").ownerGroup).toBe("PM_PERMESSI"); // B2
    expect(occ("TIM_FIBERCOP", "F035").map((o) => o.order).sort((a, b) => a - b)).not.toContain(77); // B3 (F034 → F035, riga 76 → 77 dopo D-203)
    expect(master("TIM_FIBERCOP", "F035").sectionKey).toBe("PM_PERMESSI.FASE_PRELIMINARE");
    expect(occ("FASTWEB_VODAFONE", "F033").some((o) => o.order === 61)).toBe(false);
    expect(master("TIM_FIBERCOP", "F097").sectionKey).toBe("PM_PERMESSI.FASE_PRELIMINARE"); // D-207 (era B4: master UT)
    expect(master("TIM_FIBERCOP", "F097").dataType).toBe("DATE");
  });

  it("LEONARDO F065: master PM #70 con la sola condizione PE = SI (D-78)", () => {
    const m = master("LEONARDO", "F065");
    expect(m.order).toBe(70);
    expect(m.condition).toEqual({ flowId: "F063", op: "EQ", value: "SI" });
  });

  it("ILIAD F104/F105 esclusi: valgono i trasversali (D-76)", () => {
    expect(occ("ILIAD", "F104")).toEqual([]);
    expect(occ("ILIAD", "F105")).toEqual([]);
    expect(result.templates.ILIAD!.bindings.excluded.map((e) => e.transversalAlias).filter(Boolean)).toEqual(["TRASV.FATTURABILE", "TRASV.FATTURATO"]);
    expect(tpl("ILIAD").transversal.map((t) => t.occurrenceKey)).toEqual([
      "TRASV.NOTE_OPERATIVE.PM_PERMESSI",
      "TRASV.NOTE_OPERATIVE.UT_PE",
      "TRASV.NOTE_OPERATIVE.AIE",
      "TRASV.NOTE_OPERATIVE.DL",
      "TRASV.FATTURABILE",
      "TRASV.FATTURATO",
    ]);
    // v0.3.0 (D-121): ogni nota appartiene al proprio gruppo.
    expect(tpl("ILIAD").transversal.slice(0, 4).map((t) => t.ownerGroup)).toEqual(["PM_PERMESSI", "UT_PE", "AIE", "DL"]);
  });
});

describe("condizioni (§2.3, D-92)", () => {
  it("esempi del §2.3", () => {
    expect(cell("ILIAD", master("ILIAD", "F093").condition)).toEqual({ flowId: "F092", op: "EQ", value: "SI" });
    expect(occ("TIM_FIBERCOP", "F071").find((o) => o.kind === "MIRROR")!.condition).toEqual({ flowId: "F087", op: "EQ", value: "SI" });
    const nota = master("ILIAD", "F074");
    expect(cell("ILIAD", nota.condition)).toEqual({ flowId: "F073", op: "FILLED" });
    expect(nota.repeatGroup).toBe("INTEGRAZIONE");
  });

  it("Piemonte confrontato col codice ISTAT, deposito sismico sul flag", () => {
    expect(cell("ILIAD", master("ILIAD", "F113").condition)).toEqual({ flowId: "F006", op: "NEQ", value: "01" });
    const dep = cell("ILIAD", master("ILIAD", "F153").condition) as { flowId: string };
    expect(master("ILIAD", dep.flowId).dataType).toBe("SELECT");
  });

  it("Protocollo autocertificazione sempre visibile (D-77)", () => {
    expect(master("TOWERNET", "F061").condition).toBeNull();
    // INWIT: nessuna condizione di cella; resta solo la regola di sezione per Incarico (D-207).
    expect(cell("INWIT", master("INWIT", "F068").condition)).toBeNull();
  });

  it("ogni condizione cita un flowId del template; Incarico solo con NEQ (D-207); mai Geologica", () => {
    for (const id of Object.keys(result.templates) as TemplateId[]) {
      const flows = new Set(tpl(id).occurrences.map((o) => o.flowId));
      expect(master(id, INCARICO[id]).label, id).toBe("Incarico / Lavorazione");
      expect(master(id, INCARICO[id]).condition, id).toBeNull();
      for (const o of tpl(id).occurrences) {
        for (const f of refs(o.condition)) {
          expect(flows.has(f), `${id} ${o.occurrenceKey} → ${f}`).toBe(true);
          expect(master(id, f).label, `${id} ${o.occurrenceKey}`).not.toMatch(/geologica/i);
        }
        hiddenFor(id, o.condition); // l'unica forma ammessa su Incarico è NEQ
        expect(refs(cell(id, o.condition)), `${id} ${o.occurrenceKey}`).not.toContain(INCARICO[id]);
      }
    }
  });
});

describe("albero per Incarico / Lavorazione (D-207)", () => {
  /** Occorrenze visibili con Incarico = code e gli altri valori dati (codici). */
  const visibleKeys = (id: TemplateId, code: string, extra: Record<string, string> = {}) => {
    const vals: Record<string, string> = { [INCARICO[id]]: code, ...extra };
    const ok = (c: ConditionDTO | null | undefined): boolean => {
      if (!c) return true;
      if ("all" in c) return c.all.every(ok);
      if ("any" in c) return c.any.some(ok);
      const v = vals[c.flowId];
      if (!("value" in c)) return c.op === "FILLED" ? !!v : !v;
      const exp = Array.isArray(c.value) ? c.value : [c.value];
      const m = !!v && exp.includes(v);
      return c.op === "NEQ" ? !m : m;
    };
    return tpl(id).occurrences.filter((o) => ok(o.condition)).map((o) => o.occurrenceKey);
  };

  it("nessun errore INCARICO_*; il manifest dichiara la versione delle regole", () => {
    expect(result.diagnostics.filter((d) => d.code.startsWith("INCARICO_"))).toEqual([]);
    expect(result.manifest.incaricoVersion).toBe(input.incarico!.version);
  });

  it("INWIT Caratterizzazione: Core, Dati secondari e solo i campi elencati (più la caratterizzazione UT)", () => {
    const outside = visibleKeys("INWIT", "CARATTERIZZAZIONE").filter((k) => !/@PM_PERMESSI\.(CORE|DATI_SECONDARI)$/.test(k));
    expect(outside.sort()).toEqual(
      [
        "F023@PM_PERMESSI.FASE_PRELIMINARE",
        "F024@PM_PERMESSI.FASE_PRELIMINARE",
        "F025@PM_PERMESSI.FASE_PRELIMINARE",
        "F105@PM_PERMESSI.FASE_PRELIMINARE",
        "F102@PM_PERMESSI.FASE_PRELIMINARE",
        "F103@PM_PERMESSI.FASE_PRELIMINARE",
        "F102@UT_PE.UT",
        "F103@UT_PE.UT",
        "F104@UT_PE.UT",
        "F105@UT_PE.UT",
      ].sort()
    );
  });

  it("INWIT Progetto Esecutivo: Assegnazione PE porta con sé il flag PE; i mirror di campi PM nascosti spariscono", () => {
    const keys = visibleKeys("INWIT", "PROGETTO_ESECUTIVO", { F078: "SI", F010: "RAW_LAND", F116: "SI" });
    expect(keys).toContain("F078@PM_PERMESSI.UT_PE");
    expect(keys).toContain("F079@PM_PERMESSI.UT_PE");
    expect(keys).toContain("F115@UT_PE.PE");
    expect(keys).toContain("F120@DL.DIREZIONE_LAVORI");
    expect(keys).not.toContain("F073@UT_PE.PE"); // Geologica: master PM nascosto
    expect(keys).not.toContain("F125@DL.DIREZIONE_LAVORI"); // Forecast CIL: non è deposito sismico
    expect(keys.some((k) => k.endsWith("@AIE.FASE_AIE"))).toBe(false); // Q4
  });

  it("Incarico vuoto, Altro o valore nuovo: visibile tutto ciò che non ha altre condizioni (Q6)", () => {
    for (const id of Object.keys(result.templates) as TemplateId[]) {
      const free = tpl(id).occurrences.filter((o) => cell(id, o.condition) === null && !(o.condition && "all" in o.condition));
      for (const code of ["", "ALTRO", "VALORE_NUOVO"]) {
        const keys = new Set(visibleKeys(id, code));
        for (const o of free) expect(keys.has(o.occurrenceKey), `${id} ${code} ${o.occurrenceKey}`).toBe(true);
      }
    }
  });

  it("Invio AS/VS: master PM in tutti i template, UT in sola lettura; visibilità della risposta Q2", () => {
    const asvs: Record<TemplateId, string> = { ILIAD: "F135", TOWERNET: "F095", TIM_FIBERCOP: "F097", INWIT: "F101", FASTWEB_VODAFONE: "F072", LEONARDO: "F091" };
    for (const [id, f] of Object.entries(asvs) as Array<[TemplateId, string]>) {
      expect(master(id, f).ownerGroup, id).toBe("PM_PERMESSI");
      expect(occ(id, f).find((o) => o.sectionKey === "UT_PE.UT")!.kind, id).toBe("MIRROR");
    }
    expect(hiddenFor("TIM_FIBERCOP", master("TIM_FIBERCOP", "F097").condition)).toEqual(["DEMOLIZIONE"]);
    expect(hiddenFor("LEONARDO", master("LEONARDO", "F091").condition)).toEqual([]);
    expect(hiddenFor("FASTWEB_VODAFONE", master("FASTWEB_VODAFONE", "F072").condition).sort()).toEqual(["APPLICABILITA", "DEMOLIZIONE"]);
    expect(hiddenFor("TOWERNET", master("TOWERNET", "F095").condition)).toEqual([]); // lista TOWERNET: solo i 4 valori ammessi
    expect(hiddenFor("INWIT", master("INWIT", "F101").condition).sort()).toEqual(["CARATTERIZZAZIONE", "DEMOLIZIONE", "HOUSING", "PROGETTO_ESECUTIVO"]);
  });

  it("ILIAD Geologica: Raw Land e New Site (Q8, revoca di J18 per ILIAD); TIM Progetto non con New Site", () => {
    for (const f of ["F086", "F087", "F088", "F089"]) {
      expect(cell("ILIAD", master("ILIAD", f).condition), f).toEqual({ flowId: "F010", op: "EQ", value: "RAW_LAND" });
      expect(hiddenFor("ILIAD", master("ILIAD", f).condition), f).not.toContain("NEW_SITE");
      expect(hiddenFor("ILIAD", master("ILIAD", f).condition), f).toContain("DEMOLIZIONE");
    }
    expect(hiddenFor("TIM_FIBERCOP", master("TIM_FIBERCOP", "F015").condition)).toEqual(["NEW_SITE", "COLLOCATO_NEW_SITE"]);
  });

  it("un codice assente dalla lista o una voce inesistente sono errori", () => {
    const bad = structuredClone(input);
    bad.incarico!.templates.TIM_FIBERCOP!.fieldRules![0].visibleFor.push("INVENTATO");
    expect(compileTemplates(bad).diagnostics.some((d) => d.code === "INCARICO_CODE_UNKNOWN" && d.templateId === "TIM_FIBERCOP")).toBe(true);
    const bad2 = structuredClone(input);
    bad2.incarico!.templates.INWIT!.sectionRules!.values.CARATTERIZZAZIONE.visible.push("F999");
    expect(compileTemplates(bad2).diagnostics.some((d) => d.code === "INCARICO_KEY_UNKNOWN")).toBe(true);
  });
});

describe("tipi, liste, calcolati, ripetibili, vincoli", () => {
  it("tipi D-93", () => {
    for (const id of Object.keys(result.templates) as TemplateId[]) expect(master(id, "F001").dataType, id).toBe("NUMBER");
    expect(master("LEONARDO", "F021").dataType).toBe("DATE");
    expect(master("ILIAD", "F079").dataType).toBe("DATE");
    expect(master("ILIAD", "F100").dataType).toBe("TEXT");
    expect(master("ILIAD", "F085").dataType).toBe("DATE"); // D-83
    expect(master("ILIAD", "F047").list?.kind).toBe("CONFIGURABLE");
  });

  it("campi utente: Tecnico PE multiplo con Nessuno, gli altri singoli", () => {
    const pe = tpl("ILIAD").occurrences.find((o) => o.kind === "MASTER" && o.label === "Tecnico PE")!;
    expect(pe.dataType).toBe("USERS");
    expect(pe.list).toMatchObject({ kind: "USERS", userRole: "PE", allowNone: true });
    const ut = tpl("ILIAD").occurrences.find((o) => o.kind === "MASTER" && o.label === "Tecnico UT")!;
    expect(ut.dataType).toBe("USER");
    expect(ut.list).toMatchObject({ kind: "USERS", userRole: "UT" });
  });

  it("obbligatori alla creazione e liste di Committente / Cliente Finale", () => {
    for (const id of Object.keys(result.templates) as TemplateId[]) {
      const req = tpl(id).occurrences.filter((o) => o.required).map((o) => o.flowId).sort();
      expect(req, id).toEqual(["F001", "F002", "F003", "F004", "F005"]);
      expect(master(id, "F004").list).toMatchObject({ listId: "COMMITTENTE", allowOther: true });
      expect(master(id, "F005").list).toMatchObject({ listId: "CLIENTE_FINALE", allowOther: true });
    }
  });

  it("cascata ISTAT Regione → Provincia → Comune", () => {
    expect(master("INWIT", "F006").list).toMatchObject({ listId: "ISTAT_REGIONI", kind: "ISTAT" });
    expect(master("INWIT", "F007").list).toMatchObject({ listId: "ISTAT_PROVINCE", parentFlowId: "F006" });
    expect(master("INWIT", "F008").list).toMatchObject({ listId: "ISTAT_COMUNI", parentFlowId: "F007" });
  });

  it("calcolati con manualOverride e copia informativa sui mirror", () => {
    expect(master("INWIT", "F052").computed).toMatchObject({ formula: "FORECAST_OTTENIMENTO_PERMESSI", manualOverride: true });
    expect(master("ILIAD", "F070").computed).toBeNull(); // ILIAD: forecast manuale
    expect(master("ILIAD", "F028").computed).toMatchObject({ formula: "FORECAST_PROTOCOLLO_ILIAD", manualOverride: false });
    for (const o of occ("ILIAD", "F088")) expect(o.computed?.formula).toBe("FORECAST_GEOLOGICA");
    expect(master("TOWERNET", "F098").list).toMatchObject({ listId: "TIPOLOGIA_ATTIVITA_PE", kind: "CONTROLLED" });
  });

  it("ripetibili: un flowId in un solo gruppo, VINCOLI a righe fisse; FASTWEB senza INTEGRAZIONE", () => {
    for (const id of Object.keys(result.templates) as TemplateId[]) {
      const seen = new Set<string>();
      for (const g of tpl(id).repeatGroups) {
        for (const f of g.flowIds) {
          expect(seen.has(f), `${id} ${f}`).toBe(false);
          seen.add(f);
        }
        expect(g.rowPolicy).toBe(g.key === "VINCOLI" ? "FIXED" : "DYNAMIC");
        expect(g.schemaKind).toBe(g.key === "VINCOLI" ? "VINCOLI" : "FIELDS");
      }
    }
    expect(tpl("FASTWEB_VODAFONE").repeatGroups.map((g) => g.key)).not.toContain("INTEGRAZIONE");
    expect(master("FASTWEB_VODAFONE", "F014").repeatGroup).toBeUndefined(); // Stato ODA scalare
  });

  it("11 vincoli con codici stabili", () => {
    const c = tpl("INWIT").constraints;
    expect(c.map((x) => x.code)).toEqual([
      "MONUMENTALE", "ARCHEOLOGICO", "PAESAGGISTICO", "PARCO", "AEROPORTUALE", "IDROGEOLOGICO",
      "FASCIA_CIMITERIALE", "FASCIA_POZZI", "FASCIA_CORSI_ACQUA", "ALTRO", "AMBIENTALI_NATURALISTICI",
    ]);
    expect(c.find((x) => x.code === "MONUMENTALE")).toMatchObject({ enteList: null, defaultEnte: "SOPRINTENDENZA" });
    expect(c.find((x) => x.code === "AEROPORTUALE")!.enteList).toMatchObject({ listId: "ENTE_VINCOLO_AEROPORTUALE" });
  });

  it("occorrenze ordinate per sezione e riga, chiavi univoche", () => {
    for (const id of Object.keys(result.templates) as TemplateId[]) {
      const t = tpl(id);
      const order = new Map(t.sections.map((s) => [s.key, s.order]));
      const keys = t.occurrences.map((o) => [order.get(o.sectionKey)!, o.order] as const);
      expect(keys).toEqual([...keys].sort((a, b) => a[0] - b[0] || a[1] - b[1]));
      expect(new Set(t.occurrences.map((o) => o.occurrenceKey)).size).toBe(t.occurrences.length);
    }
  });
});

describe("robustezza e determinismo", () => {
  it("serializzazione deterministica: due compilazioni identiche", () => {
    expect(stableStringify(compileTemplates(loadCompilerInput(paths)))).toBe(stableStringify(result));
  });

  it("i JSON committati sono aggiornati", () => {
    for (const [id, t] of Object.entries(result.templates)) {
      expect(fs.readFileSync(path.join(paths.outDir, `${id}.json`), "utf8"), id).toBe(stableStringify(t) + "\n");
    }
    expect(fs.readFileSync(path.join(paths.outDir, "manifest.json"), "utf8")).toBe(stableStringify(result.manifest) + "\n");
  });

  it("D-187: cambiando solo un collegamento interno la versione cambia (template mostrato identico)", () => {
    const [formula, def] = Object.entries(input.bindings.computed).find(([, c]) => Object.values(c.bindings).some((b) => b && Object.keys(b.inputs).length > 0))!;
    const templateId = (Object.keys(def.bindings) as TemplateId[]).find((t) => Object.keys(def.bindings[t]!.inputs).length > 0)!;
    const b = def.bindings[templateId]!;
    const [k, ref] = Object.entries(b.inputs)[0];
    const changed = { ...def, bindings: { ...def.bindings, [templateId]: { ...b, inputs: { ...b.inputs, [`${k}_altro`]: ref } } } };
    const r = compileTemplates({ ...input, bindings: { ...input.bindings, computed: { ...input.bindings.computed, [formula]: changed } } });
    const before = result.templates[templateId]!;
    const after = r.templates[templateId]!;
    const { version: v1, ...shown1 } = before.template;
    const { version: v2, ...shown2 } = after.template;
    expect(stableStringify(shown2)).toBe(stableStringify(shown1));
    expect(stableStringify(after.bindings)).not.toBe(stableStringify(before.bindings));
    expect(v2).not.toBe(v1);
    // Gli altri template non cambiano versione.
    for (const t of Object.keys(result.templates) as TemplateId[]) if (t !== templateId) expect(r.templates[t]!.template.version).toBe(result.templates[t]!.template.version);
  });

  it("una riga modificata invalida la correzione (impronta)", () => {
    const file = input.bindings.templates.LEONARDO.file;
    const md = input.markdown[file].replace("| 70 | PM/Permessi |", "| 70 | PM/Permessi  |");
    const r = compileTemplates({ ...input, markdown: { ...input.markdown, [file]: md } });
    expect(r.diagnostics.some((d) => d.code === "OVERRIDE_PRECONDITION" && d.templateId === "LEONARDO" && d.row === 70)).toBe(true);
  });

  it("una formulazione nuova è un errore, mai 'sempre visibile'", () => {
    const file = input.bindings.templates.INWIT.file;
    const md = input.markdown[file].replace("| compare solo se PE = SI |", "| compare solo se PE = NO |");
    expect(md).not.toBe(input.markdown[file]);
    const r = compileTemplates({ ...input, markdown: { ...input.markdown, [file]: md } });
    expect(r.diagnostics.some((d) => d.code === "CONDITION_UNTRANSLATED" && d.templateId === "INWIT")).toBe(true);
  });
});

describe("etichette delle liste dei vincoli (D-157)", () => {
  it("distinte e parlanti; le fasce di rispetto in una voce", async () => {
    const { constraintListLabel } = await import("@/lib/lists/catalog");
    expect(constraintListLabel("Stato", ["Paesaggistico", "Parco"])).toBe("Stato del vincolo (Paesaggistico, Parco)");
    expect(constraintListLabel("Stato", ["Monumentale", "Fascia di rispetto — Pozzi", "Fascia di rispetto — Cimiteriale"])).toBe("Stato del vincolo (Monumentale, Fasce di rispetto)");
    expect(constraintListLabel("Ente", ["Aeroportuale"])).toBe("Ente del vincolo Aeroportuale");
    expect(constraintListLabel("Stato", ["Vincoli Ambientali Naturalistici"])).toBe("Stato dei Vincoli Ambientali Naturalistici");
    type Entry = { templateId: string | null; listId: string; label: string };
    const raw = (await import("@/data/templates/lists-initial.json")).default as unknown as Entry[] | { lists: Entry[] };
    const catalog = Array.isArray(raw) ? raw : raw.lists;
    const common = catalog.filter((l) => l.templateId === null && /vincol/i.test(l.label));
    expect(common.length).toBeGreaterThanOrEqual(7);
    expect(new Set(common.map((l) => l.label)).size).toBe(common.length);
  });
});
