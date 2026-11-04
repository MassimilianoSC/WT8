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
      ILIAD: [190, 188, 159], // F104/F105 alias dei trasversali (D-76)
      TOWERNET: [133, 133, 117],
      TIM_FIBERCOP: [142, 142, 118], // B3: righe eliminate negli MD (D-100, D-114)
      INWIT: [145, 145, 127],
      FASTWEB_VODAFONE: [122, 122, 108], // B3: righe eliminate negli MD (D-100, D-114)
      LEONARDO: [140, 140, 118],
    };
    for (const [id, [rows, occurrences, flowIds]] of Object.entries(expected)) {
      expect(result.manifest.templates[id], id).toMatchObject({ sourceRows: rows, occurrences, flowIds });
    }
    const totalRows = Object.values(result.manifest.templates).reduce((a, t) => a + t.sourceRows, 0);
    expect(totalRows).toBe(872);
  });

  it("50/50 formulazioni delle condizioni incontrate e tradotte (D-114: tolta la n.21, aggiunte n.50 e n.51)", () => {
    expect(input.conditions.formulations).toHaveLength(50);
    expect(result.diagnostics.filter((d) => d.code === "FORMULATION_UNUSED")).toEqual([]);
    expect(result.diagnostics.filter((d) => d.code === "CONDITION_UNTRANSLATED")).toEqual([]);
  });

  it("tutte le correzioni applicate con precondizione valida; B1–B4 non sono più correzioni (D-114)", () => {
    expect(input.overrides.overrides).toHaveLength(16);
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

  it("R-1: B1 master AIE, B2 Forecast AIE master PM, B3 eliminati, B4 Invio AS/VS master UT", () => {
    expect(master("TIM_FIBERCOP", "F046").ownerGroup).toBe("AIE"); // B1
    expect(master("ILIAD", "F119").sectionKey).toBe("AIE.FASE_AIE"); // B1
    expect(master("INWIT", "F043").ownerGroup).toBe("PM_PERMESSI"); // B2
    expect(occ("TIM_FIBERCOP", "F034").map((o) => o.order).sort((a, b) => a - b)).not.toContain(76); // B3
    expect(master("TIM_FIBERCOP", "F034").sectionKey).toBe("PM_PERMESSI.FASE_PRELIMINARE");
    expect(occ("FASTWEB_VODAFONE", "F033").some((o) => o.order === 61)).toBe(false);
    expect(master("TIM_FIBERCOP", "F096").sectionKey).toBe("UT_PE.UT"); // B4
    expect(master("TIM_FIBERCOP", "F096").dataType).toBe("DATE");
  });

  it("LEONARDO F065: master PM #70 con la sola condizione PE = SI (D-78)", () => {
    const m = master("LEONARDO", "F065");
    expect(m.order).toBe(70);
    expect(m.condition).toEqual({ flowId: "F063", op: "EQ", value: "SI" });
  });

  it("ILIAD F104/F105 esclusi: valgono i trasversali (D-76)", () => {
    expect(occ("ILIAD", "F104")).toEqual([]);
    expect(occ("ILIAD", "F105")).toEqual([]);
    expect(result.templates.ILIAD!.bindings.excluded.map((e) => e.transversalAlias)).toEqual(["TRASV.FATTURABILE", "TRASV.FATTURATO"]);
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
    expect(master("ILIAD", "F093").condition).toEqual({ flowId: "F092", op: "EQ", value: "SI" });
    expect(occ("TIM_FIBERCOP", "F070").find((o) => o.kind === "MIRROR")!.condition).toEqual({ flowId: "F086", op: "EQ", value: "SI" });
    const nota = master("ILIAD", "F074");
    expect(nota.condition).toEqual({ flowId: "F073", op: "FILLED" });
    expect(nota.repeatGroup).toBe("INTEGRAZIONE");
  });

  it("Piemonte confrontato col codice ISTAT, deposito sismico sul flag", () => {
    expect(master("ILIAD", "F113").condition).toEqual({ flowId: "F006", op: "NEQ", value: "01" });
    const dep = master("ILIAD", "F153").condition as { flowId: string };
    expect(master("ILIAD", dep.flowId).dataType).toBe("SELECT");
  });

  it("Protocollo autocertificazione sempre visibile (D-77)", () => {
    expect(master("TOWERNET", "F061").condition).toBeNull();
    expect(master("INWIT", "F068").condition).toBeNull();
  });

  it("ogni condizione cita un flowId del template; nessuna dipende da Incarico/Lavorazione o Geologica", () => {
    for (const id of Object.keys(result.templates) as TemplateId[]) {
      const flows = new Set(tpl(id).occurrences.map((o) => o.flowId));
      for (const o of tpl(id).occurrences) {
        for (const f of refs(o.condition)) {
          expect(flows.has(f), `${id} ${o.occurrenceKey} → ${f}`).toBe(true);
          expect(master(id, f).label, `${id} ${o.occurrenceKey}`).not.toMatch(/incarico|geologica/i);
        }
      }
    }
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
