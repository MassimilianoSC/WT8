// @vitest-environment node
/** Formule, righe di sistema e progress: casi delle tabelle §5.5 dell'architettura, D-35, D-37, D-42, D-84–D-86, D-93, D-96, D-99. */
import { describe, expect, it } from "vitest";
import type { FieldValue, TemplateId } from "@/lib/contract";
import { computeFormulas, FATTURABILE_META_KEY, type EngineRow, type EngineSnapshot, type FormulaContext, type FormulaResult } from "@/lib/engines/formulas";
import { computeProgress } from "@/lib/engines/progress";
import { computeRows, ENTE_WARNING, enteChangedWarning } from "@/lib/engines/rows";
import { emptyNotes } from "@/lib/store/practice-factory";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";

const snap = (values: Record<string, FieldValue> = {}, repeats: Record<string, EngineRow[]> = {}, extra: Partial<EngineSnapshot> = {}): EngineSnapshot => ({
  values,
  repeats,
  formulaMeta: {},
  transversal: { noteOperative: emptyNotes(), fatturabile: "NO", fatturabileManual: false, fatturato: null },
  ...extra,
});
const row = (rowId: string, ordinal: number, values: Record<string, FieldValue>, extra: Partial<EngineRow> = {}): EngineRow => ({ rowId, ordinal, values, ...extra });

function run(templateId: TemplateId, before: EngineSnapshot, after: EngineSnapshot, opts: Partial<FormulaContext> = {}): FormulaResult {
  const c = COMPILED_TEMPLATES[templateId];
  return computeFormulas({
    templateId,
    template: c.template,
    bindings: c.bindings,
    before,
    after,
    today: "2026-10-08",
    now: new Date("2026-10-08T07:00:00Z"),
    operationId: "op-1",
    actorId: null,
    manualWrites: new Set(),
    fatturabileWritten: false,
    ...opts,
  });
}
/** Applica il risultato all'istantanea (come farà il servizio), per simulare il salvataggio successivo. */
function applied(s: EngineSnapshot, r: FormulaResult): EngineSnapshot {
  const repeats = Object.fromEntries(
    Object.entries(s.repeats).map(([g, rows]) => [g, rows.map((x) => (r.rowMetadata[x.rowId] ? { ...x, metadata: { ...x.metadata, ...r.rowMetadata[x.rowId] } } : x))])
  );
  return { values: { ...s.values, ...r.values }, repeats, formulaMeta: { ...s.formulaMeta, ...r.formulaMeta }, transversal: { ...s.transversal, ...r.transversal } };
}

describe("formule semplici (§5.2)", () => {
  it("Tipologia attività PE: Progetto se valorizzato, altrimenti Incarico; template senza Progetto usa Incarico", () => {
    const withProj = run("INWIT", snap(), snap({ F012: { code: "NEW_SITE" }, F013: { code: "PNRR" } }));
    expect(withProj.values.F108).toEqual({ code: "PNRR" });
    const noProj = run("INWIT", snap(), snap({ F012: { code: "NEW_SITE" }, F013: null }));
    expect(noProj.values.F108).toEqual({ code: "NEW_SITE" });
    expect(run("TOWERNET", snap(), snap({ F012: { code: "NEW_SITE" } })).values.F098).toEqual({ code: "NEW_SITE" });
  });

  it("Forecast Geologica +15 di calendario senza saltare le festività", () => {
    const r = run("INWIT", snap(), snap({ F073: "2026-12-20" }));
    expect(r.values.F074).toBe("2027-01-04");
    expect(r.toasts.find((t) => t.flowId === "F074")!.message).toContain("04/01/2027");
  });

  it("ILIAD Forecast Protocollo = Data assegnazione + 30; il Protocollo ILIAD non calcola il forecast permessi", () => {
    const r = run("ILIAD", snap(), snap({ F027: "2026-01-31", F072: "2026-01-01" }));
    expect(r.values.F028).toBe("2026-03-02");
    expect(r.values.F070).toBeUndefined();
  });

  it("toast solo se il valore cambia", () => {
    const after = snap({ F073: "2026-12-20" });
    const first = run("INWIT", snap(), after);
    const second = run("INWIT", applied(after, first), applied(after, first));
    expect(second.toasts).toEqual([]);
    expect(second.systemChanges).toEqual([]);
  });
});

describe("Forecast Ottenimento Permessi (§5.3, D-84, D-85, D-96)", () => {
  const integr = (rows: EngineRow[]) => ({ INTEGRAZIONE: rows });

  it("base = Protocollo + 67 solo per TOWERNET/INWIT/LEONARDO", () => {
    expect(run("INWIT", snap(), snap({ F051: "2026-01-01" })).values.F052).toBe("2026-03-09");
  });

  it("prima compilazione di Invio: controllo memorizzato, forecast spostato della durata", () => {
    const before = snap({ F051: "2026-01-01" }, integr([row("r1", 1, { F055: "2026-02-10" })]));
    const after = snap({ F051: "2026-01-01" }, integr([row("r1", 1, { F055: "2026-02-10", F057: "2026-02-20" })]));
    const r = run("INWIT", before, after, { today: "2026-02-25" });
    expect(r.rowMetadata.r1!.integrationCheck).toMatchObject({ checkedAtRomeDate: "2026-02-25", remainingDays: 12, eligible: true, operationId: "op-1" });
    expect(r.values.F052).toBe("2026-03-19");
    expect(r.toasts.find((t) => t.flowId === "F052")!.message).toContain("spostato di 10 giorni");
  });

  it("soglia: 15 giorni idoneo, 16 no; il controllo non si ripete il giorno dopo", () => {
    const before = snap({ F051: "2026-01-01" }, integr([row("r1", 1, { F055: "2026-02-10" })]));
    const after = snap({ F051: "2026-01-01" }, integr([row("r1", 1, { F055: "2026-02-10", F057: "2026-02-20" })]));
    expect(run("INWIT", before, after, { today: "2026-02-22" }).rowMetadata.r1!.integrationCheck!.eligible).toBe(true);
    const no = run("INWIT", before, after, { today: "2026-02-21" });
    expect(no.rowMetadata.r1!.integrationCheck).toMatchObject({ remainingDays: 16, eligible: false });
    const saved = applied(after, no);
    const nextDay = run("INWIT", saved, saved, { today: "2026-02-22" });
    expect(nextDay.rowMetadata).toEqual({});
    expect(saved.values.F052 ?? nextDay.values.F052).toBe("2026-03-09");
  });

  it("due integrazioni idonee (10 e 4 giorni): vale l'ultima, nessuna somma", () => {
    const chk = (d: string) => ({ integrationCheck: { checkedAtRomeDate: d, remainingDays: 5, eligible: true, operationId: "x" } });
    const s = snap({ F051: "2026-01-01" }, integr([row("r1", 1, { F055: "2026-02-01", F057: "2026-02-11" }, { metadata: chk("2026-02-11") }), row("r2", 2, { F055: "2026-03-01", F057: "2026-03-05" }, { metadata: chk("2026-03-05") })]));
    expect(run("INWIT", s, s).values.F052).toBe("2026-03-13");
  });

  it("modifica manuale: blocco permanente, anche svuotando; il Protocollo non lo sovrascrive", () => {
    const before = snap({ F051: "2026-01-01", F052: "2026-03-09" });
    const after = snap({ F051: "2026-01-01", F052: "2026-04-30" });
    const r = run("INWIT", before, after, { manualWrites: new Set(["F052"]) });
    expect(r.formulaMeta.F052).toMatchObject({ mode: "MANUAL", manual: { operationId: "op-1" } });
    expect(r.values.F052).toBeUndefined();
    const locked = applied(after, r);
    const protChanged = { ...locked, values: { ...locked.values, F051: "2026-02-01" } };
    const r2 = run("INWIT", locked, protChanged);
    expect(r2.values.F052).toBeUndefined();
    expect(r2.toasts.filter((t) => t.flowId === "F052")).toEqual([]);
    const cleared = { ...locked, values: { ...locked.values, F052: null } };
    expect(run("INWIT", locked, cleared, { manualWrites: new Set(["F052"]) }).formulaMeta.F052.mode).toBe("MANUAL");
  });

  it("durata negativa: nessuno spostamento e avviso; base assente al controllo: non idoneo memorizzato", () => {
    const chk = { integrationCheck: { checkedAtRomeDate: "2026-02-25", remainingDays: 12, eligible: true, operationId: "x" } };
    const neg = snap({ F051: "2026-01-01" }, integr([row("r1", 1, { F055: "2026-02-20", F057: "2026-02-10" }, { metadata: chk })]));
    const r = run("INWIT", neg, neg);
    expect(r.values.F052).toBe("2026-03-09");
    expect(r.toasts.some((t) => t.kind === "WARNING")).toBe(true);

    const before = snap({}, integr([row("r1", 1, { F055: "2026-02-10" })]));
    const after = snap({}, integr([row("r1", 1, { F055: "2026-02-10", F057: "2026-02-20" })]));
    const noBase = run("INWIT", before, after, { today: "2026-02-25" });
    expect(noBase.rowMetadata.r1!.integrationCheck).toMatchObject({ eligible: false, remainingDays: null });
    const later = applied(after, noBase);
    const withProt = { ...later, values: { ...later.values, F051: "2026-01-01" } };
    expect(run("INWIT", later, withProt).values.F052).toBe("2026-03-09"); // nessuno spostamento: controllo non idoneo
  });
});

describe("Fatturabile (§5.4, D-37, D-96)", () => {
  const arpa = (...rows: EngineRow[]) => ({ ARPA: rows });
  const pos = (id: string, ord: number) => row(id, ord, { F060: { code: "POSITIVO" } });
  const neg = (id: string, ord: number) => row(id, ord, { F060: { code: "NEGATIVO" } });

  it("Ottenimento Permessi oggi−29 / oggi−30 con ultimo ARPA Positivo: NO / SI", () => {
    expect(run("INWIT", snap(), snap({ F050: "2026-09-09" }, arpa(pos("a", 1)))).transversal.fatturabile).toBeUndefined();
    const si = run("INWIT", snap(), snap({ F050: "2026-09-08" }, arpa(pos("a", 1))));
    expect(si.transversal.fatturabile).toBe("SI");
    expect(si.systemChanges.find((c) => c.target.transversal === "fatturabile")!.reason).toContain("Positivo");
  });

  it("Positivo vecchio ma ultimo ARPA Negativo o vuoto: nessun SI automatico; in AUTO un SI torna NO", () => {
    expect(run("INWIT", snap(), snap({ F050: "2026-01-01" }, arpa(pos("a", 1), row("b", 2, {})))).transversal.fatturabile).toBeUndefined();
    const wasSi = snap({ F050: "2026-01-01" }, arpa(pos("a", 1)), { transversal: { noteOperative: emptyNotes(), fatturabile: "SI", fatturabileManual: false, fatturato: null } });
    const corrected = { ...wasSi, values: { F050: null } };
    expect(run("INWIT", wasSi, corrected).transversal.fatturabile).toBe("NO");
  });

  it("decisione manuale del PM: NO resta NO a soglia superata", () => {
    const after = snap({ F050: "2026-01-01" }, arpa(pos("a", 1)));
    const r = run("INWIT", snap(), after, { fatturabileWritten: true });
    expect(r.transversal).toMatchObject({ fatturabileManual: true });
    expect(r.transversal.fatturabile).toBeUndefined();
    expect(r.formulaMeta[FATTURABILE_META_KEY]).toMatchObject({ mode: "MANUAL", manual: { operationId: "op-1" } });
    const locked = applied(after, r);
    expect(run("INWIT", locked, locked).transversal.fatturabile).toBeUndefined();
  });

  it("nuovo esito Negativo dopo un SI manuale: NO forzato una volta, il blocco manuale resta", () => {
    const manualSi = snap({ F050: "2026-01-01" }, arpa(pos("a", 1)), { transversal: { noteOperative: emptyNotes(), fatturabile: "SI", fatturabileManual: true, fatturato: null } });
    const after = { ...manualSi, repeats: arpa(pos("a", 1), neg("b", 2)) };
    const r = run("INWIT", manualSi, after);
    expect(r.transversal.fatturabile).toBe("NO");
    expect(r.transversal.fatturabileManual).toBeUndefined(); // invariato: true
    expect(r.formulaMeta[FATTURABILE_META_KEY].detail).toMatchObject({ forcedNegativeRows: ["b"] });
    const saved = applied(after, r);
    // Il PM decide di nuovo SI: la stessa riga negativa non forza più.
    const pmSi = { ...saved, transversal: { ...saved.transversal, fatturabile: "SI" as const } };
    expect(run("INWIT", saved, pmSi, { fatturabileWritten: true }).transversal.fatturabile).toBeUndefined();
  });

  it("nello stesso salvataggio SI manuale + nuovo Negativo: vince il Negativo", () => {
    const before = snap({}, arpa(pos("a", 1)));
    const after = snap({}, arpa(pos("a", 1), neg("b", 2)), { transversal: { noteOperative: emptyNotes(), fatturabile: "SI", fatturabileManual: false, fatturato: null } });
    expect(run("INWIT", before, after, { fatturabileWritten: true }).transversal.fatturabile).toBe("NO");
  });
});

describe("righe di sistema (D-35, D-99, D-93)", () => {
  const T = COMPILED_TEMPLATES.INWIT.template;
  let n = 0;
  const ctx = (before: EngineSnapshot, after: EngineSnapshot) => ({
    templateId: "INWIT" as const,
    template: T,
    before,
    after,
    enteLabel: (e: { code: string } | null) => (e?.code === "SOPRINTENDENZA" ? "Soprintendenza" : (e?.code ?? null)),
    newRowId: () => `new${++n}`,
  });
  const vincolo = (stato: string | null) => row("v1", 1, {}, { constraint: { code: "MONUMENTALE", stato: stato ? { code: stato } : null, ente: { code: "SOPRINTENDENZA" } } });

  it("vincolo PRESENTE: una voce Ente collegata e bloccata col nome dell'ente; nessun doppione", () => {
    const after = snap({}, { VINCOLI: [vincolo("PRESENTE")], ENTE: [] });
    const r = computeRows(ctx(snap(), after));
    expect(r.add).toEqual([expect.objectContaining({ groupKey: "ENTE", ordinal: 1, values: { F063: "Soprintendenza" }, metadata: { origin: { groupKey: "VINCOLI", rowId: "v1" }, locked: true, generatedName: "Soprintendenza" } })]);
    const withEnte = snap({}, { VINCOLI: [vincolo("PRESENTE")], ENTE: [row("e1", 1, { F063: "Soprintendenza" }, { metadata: { origin: { groupKey: "VINCOLI", rowId: "v1" }, locked: true } })] });
    expect(computeRows(ctx(withEnte, withEnte))).toEqual({ add: [], remove: [], update: [] });
  });

  it("vincolo non più PRESENTE: voce vuota tolta; con dati conservata, sbloccata e segnalata; di nuovo PRESENTE: bloccata", () => {
    const ente = (values: Record<string, FieldValue>, meta = { origin: { groupKey: "VINCOLI", rowId: "v1" }, locked: true } as EngineRow["metadata"]) => row("e1", 1, values, { metadata: meta });
    const empty = snap({}, { VINCOLI: [vincolo("ASSENTE")], ENTE: [ente({ F063: "Soprintendenza" })] });
    expect(computeRows(ctx(empty, empty)).remove).toEqual([expect.objectContaining({ rowId: "e1" })]);
    const withData = snap({}, { VINCOLI: [vincolo("ASSENTE")], ENTE: [ente({ F063: "Soprintendenza", F065: "2026-10-01" })] });
    expect(computeRows(ctx(withData, withData)).update).toEqual([expect.objectContaining({ rowId: "e1", metadata: { locked: false, warning: ENTE_WARNING } })]);
    const again = snap({}, { VINCOLI: [vincolo("PRESENTE")], ENTE: [ente({ F063: "Soprintendenza", F065: "2026-10-01" }, { origin: { groupKey: "VINCOLI", rowId: "v1" }, locked: false, warning: ENTE_WARNING })] });
    expect(computeRows(ctx(again, again)).update).toEqual([expect.objectContaining({ metadata: { locked: true, warning: undefined } })]);
  });

  it("Ripresentazione Pratica compilata la prima volta: una nuova riga ARPA, una sola", () => {
    const before = snap({}, { ARPA: [row("a1", 1, { F060: { code: "NEGATIVO" } })] });
    const after = snap({}, { ARPA: [row("a1", 1, { F060: { code: "NEGATIVO" }, F062: "2026-10-05" })] });
    const r = computeRows(ctx(before, after));
    expect(r.add).toEqual([expect.objectContaining({ groupKey: "ARPA", ordinal: 2, values: {}, metadata: { origin: { groupKey: "ARPA", rowId: "a1" } } })]);
    const withNew = snap({}, { ARPA: [after.repeats.ARPA[0], row("a2", 2, {}, { metadata: { origin: { groupKey: "ARPA", rowId: "a1" } } })] });
    expect(computeRows(ctx(before, withNew)).add).toEqual([]);
  });

  describe("voce Ente: nome generato e cambio dell'ente (D-126 M-02, M-03)", () => {
    const label = (e: { code: string } | null) => (e?.code === "SOPRINTENDENZA" ? "Soprintendenza" : e?.code === "COMUNE" ? "Comune" : null);
    const rc = (before: EngineSnapshot, after: EngineSnapshot) => computeRows({ ...ctx(before, after), enteLabel: label });
    const v = (stato: string, ente: string | null) => row("v1", 1, {}, { constraint: { code: "PAESAGGISTICO", stato: { code: stato }, ente: ente ? { code: ente } : null } });
    const e = (values: Record<string, FieldValue>, meta: EngineRow["metadata"] = {}) =>
      row("e1", 1, values, { metadata: { origin: { groupKey: "VINCOLI", rowId: "v1" }, locked: true, generatedName: "Soprintendenza", ...meta } });
    const s = (vin: EngineRow, ente: EngineRow) => snap({}, { VINCOLI: [vin], ENTE: [ente] });

    it("R2 (revisione): nome personalizzato come unico dato → la voce resta, sbloccata e segnalata", () => {
      const after = s(v("ASSENTE", "SOPRINTENDENZA"), e({ F063: "Soprintendenza - ufficio tutela, referente Rossi" }));
      const r = rc(after, after);
      expect(r.remove).toEqual([]);
      expect(r.update).toEqual([expect.objectContaining({ rowId: "e1", metadata: { locked: false, warning: ENTE_WARNING } })]);
    });

    it("solo il nome generato → voce vuota, tolta; anche senza nome", () => {
      const generated = s(v("ASSENTE", "SOPRINTENDENZA"), e({ F063: "Soprintendenza" }));
      expect(rc(generated, generated).remove).toEqual([expect.objectContaining({ rowId: "e1" })]);
      const noName = s(v("ASSENTE", null), e({}, { generatedName: null }));
      expect(rc(noName, noName).remove).toHaveLength(1);
    });

    it("R3 (revisione): ente cambiato su voce intatta → stesso rowId, nome aggiornato e ricordato", () => {
      const after = s(v("PRESENTE", "COMUNE"), e({ F063: "Soprintendenza" }));
      expect(rc(after, after)).toEqual({
        add: [],
        remove: [],
        update: [expect.objectContaining({ groupKey: "ENTE", rowId: "e1", values: { F063: "Comune" }, metadata: { generatedName: "Comune" } })],
      });
    });

    it("ente prima vuoto, poi scelto: la voce creata senza nome si completa", () => {
      const created = rc(snap(), snap({}, { VINCOLI: [v("PRESENTE", null)], ENTE: [] })).add[0];
      expect(created).toMatchObject({ values: {}, metadata: { generatedName: null } });
      const after = s(v("PRESENTE", "COMUNE"), e({}, { generatedName: null }));
      expect(rc(after, after).update).toEqual([expect.objectContaining({ values: { F063: "Comune" }, metadata: { generatedName: "Comune" } })]);
    });

    it("ente cambiato su voce lavorata o con nome personalizzato: nessuna sovrascrittura, avviso", () => {
      for (const values of [{ F063: "Soprintendenza", F065: "2026-10-01" }, { F063: "Soprintendenza Roma" }] as Record<string, FieldValue>[]) {
        const after = s(v("PRESENTE", "COMUNE"), e(values));
        const r = rc(after, after);
        expect(r.update).toEqual([expect.objectContaining({ rowId: "e1", metadata: { warning: enteChangedWarning("Comune") } })]);
        expect(r.update[0].values).toBeUndefined();
        // l'avviso già presente non si ripete
        const warned = s(v("PRESENTE", "COMUNE"), e(values, { warning: enteChangedWarning("Comune") }));
        expect(rc(warned, warned).update).toEqual([]);
      }
    });

    it("nome allineato a mano al nuovo ente: diventa il nome generato e l'avviso sparisce", () => {
      const after = s(v("PRESENTE", "COMUNE"), e({ F063: "Comune", F065: "2026-10-01" }, { warning: enteChangedWarning("Comune") }));
      expect(rc(after, after).update).toEqual([expect.objectContaining({ metadata: { generatedName: "Comune", warning: undefined } })]);
    });

    it("di nuovo PRESENTE con lo stesso ente: riga e nome invariati, solo blocco e avviso tolto", () => {
      const after = s(v("PRESENTE", "SOPRINTENDENZA"), e({ F063: "Soprintendenza", F065: "x" }, { locked: false, warning: ENTE_WARNING }));
      expect(rc(after, after).update).toEqual([expect.objectContaining({ rowId: "e1", metadata: { locked: true, warning: undefined } })]);
    });

    it("voce senza generatedName, ente cambiato → aggiornata se intatta, segnalata se lavorata (ripiego: ente PRIMA del cambio)", () => {
      const legacy = (values: Record<string, FieldValue>) => row("e1", 1, values, { metadata: { origin: { groupKey: "VINCOLI", rowId: "v1" }, locked: true } });
      const before = s(v("PRESENTE", "SOPRINTENDENZA"), legacy({ F063: "Soprintendenza" }));
      const after = s(v("PRESENTE", "COMUNE"), legacy({ F063: "Soprintendenza" }));
      expect(rc(before, after).update).toEqual([expect.objectContaining({ rowId: "e1", values: { F063: "Comune" }, metadata: { generatedName: "Comune" } })]);
      const worked = s(v("PRESENTE", "COMUNE"), legacy({ F063: "Soprintendenza", F065: "2026-10-01" }));
      expect(rc(s(v("PRESENTE", "SOPRINTENDENZA"), legacy({ F063: "Soprintendenza", F065: "2026-10-01" })), worked).update).toEqual([
        expect.objectContaining({ metadata: { warning: enteChangedWarning("Comune") } }),
      ]);
    });

    it("voci senza generatedName (precedenti a M-02): vale il nome che il sistema genererebbe ora", () => {
      const legacy = row("e1", 1, { F063: "Soprintendenza" }, { metadata: { origin: { groupKey: "VINCOLI", rowId: "v1" }, locked: true } });
      const after = snap({}, { VINCOLI: [v("ASSENTE", "SOPRINTENDENZA")], ENTE: [legacy] });
      expect(rc(after, after).remove).toHaveLength(1);
    });
  });

  it("ARPA (D-126 §3.2): il figlio si apre una volta per riga; eliminato, non si riapre da solo", () => {
    const parent = (vals: Record<string, FieldValue>, meta?: EngineRow["metadata"]) => row("a1", 1, vals, meta ? { metadata: meta } : {});
    const opened = computeRows(ctx(snap({}, { ARPA: [parent({})] }), snap({}, { ARPA: [parent({ F062: "2026-10-05" })] })));
    expect(opened.update).toEqual([expect.objectContaining({ groupKey: "ARPA", rowId: "a1", metadata: { arpaOpened: true } })]);
    // Figlio eliminato, padre svuotato e ricompilato: nessun nuovo figlio.
    const again = computeRows(ctx(snap({}, { ARPA: [parent({}, { arpaOpened: true })] }), snap({}, { ARPA: [parent({ F062: "2026-11-05" }, { arpaOpened: true })] })));
    expect(again).toEqual({ add: [], remove: [], update: [] });
  });
});

describe("progress (v0.1.7)", () => {
  const T = COMPILED_TEMPLATES.INWIT.template;
  const vincoli = () => T.constraints.map((c, i) => row(`v${i}`, i + 1, {}, { constraint: { code: c.code, stato: null, ente: null } }));

  it("pratica vuota: totali per gruppo, nessun compilato; VINCOLI conta 11 righe; nessuna riga = nessun contributo", () => {
    const p = computeProgress(T, { values: {}, repeats: { VINCOLI: vincoli() } });
    for (const g of ["PM_PERMESSI", "UT_PE", "AIE", "DL"] as const) expect(p[g].filled, g).toBe(0);
    const masters = T.occurrences.filter((o) => o.kind === "MASTER" && o.ownerGroup === "PM_PERMESSI" && !o.repeatGroup && !(o.computed && !o.computed.manualOverride));
    expect(p.PM_PERMESSI.total).toBeLessThanOrEqual(masters.length + 11);
    expect(p.PM_PERMESSI.total).toBeGreaterThan(11);
  });

  it("condizione falsa non conta; vera conta; compilati e righe ripetibili", () => {
    const hidden = computeProgress(T, { values: { F010: { code: "ROOF_TOP" } }, repeats: {} });
    const shown = computeProgress(T, { values: { F010: { code: "RAW_LAND" } }, repeats: {} });
    expect(shown.PM_PERMESSI.total).toBeGreaterThan(hidden.PM_PERMESSI.total); // campi "solo Raw Land"
    expect(shown.PM_PERMESSI.filled).toBe(1);
    const oneTenant = computeProgress(T, { values: {}, repeats: { TENANT: [row("t1", 1, { F018: { code: "TIM" } })] } });
    const none = computeProgress(T, { values: {}, repeats: {} });
    expect(oneTenant.PM_PERMESSI.total).toBe(none.PM_PERMESSI.total + 3);
    expect(oneTenant.PM_PERMESSI.filled).toBe(1);
  });

  it("calcolati non modificabili esclusi, Forecast Ottenimento Permessi incluso", () => {
    const withGeo = computeProgress(T, { values: { F074: "2026-10-01" }, repeats: {} });
    expect(withGeo.PM_PERMESSI.filled).toBe(0);
    const withPerm = computeProgress(T, { values: { F052: "2026-10-01" }, repeats: {} });
    expect(withPerm.PM_PERMESSI.filled).toBe(1);
  });
});

describe("collegamenti dei motori (src/data/engine-bindings.json)", () => {
  it("ogni flowId punta al campo giusto del template compilato", async () => {
    const { ENGINE_BINDINGS } = await import("@/lib/engines/formulas");
    for (const [t, b] of Object.entries(ENGINE_BINDINGS.templates)) {
      const occ = (f: string) => COMPILED_TEMPLATES[t as TemplateId].template.occurrences.find((o) => o.kind === "MASTER" && o.flowId === f)!;
      expect(occ(b.ottenimentoPermessi).label, t).toBe("Ottenimento Permessi");
      expect(occ(b.arpa.esito)).toMatchObject({ label: "Esito parere Arpa", repeatGroup: "ARPA", dataType: "SELECT" });
      expect(occ(b.arpa.parere)).toMatchObject({ label: "Parere Arpa", repeatGroup: "ARPA" });
      expect(occ(b.arpa.ripresentazione)).toMatchObject({ label: "Ripresentazione Pratica", repeatGroup: "ARPA", dataType: "DATE" });
      expect(occ(b.enteNome)).toMatchObject({ label: "Nome Ente", repeatGroup: "ENTE" });
    }
  });
});
