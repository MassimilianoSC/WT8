// @vitest-environment node
/**
 * D-207 (albero per Incarico / Lavorazione, alert sui campi nascosti) e D-208 ("Nessuna data"): parti pure del server.
 */
import { describe, expect, it } from "vitest";
import { NO_DATE, NO_DATE_LABEL, type FieldOccurrenceDTO, type FieldValue } from "@/lib/contract";
import { evaluateTargets, reconcileAlerts, type AlertRuleSpec, type ExistingAlert } from "@/lib/alerts/engine";
import { computeProgress } from "@/lib/engines/progress";
import { convertCell } from "@/lib/import/convert";
import { cellText } from "@/lib/practice/csv";
import { normalizeFieldValue } from "@/lib/practice/normalize";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";
import { fieldVisibility } from "@/services/alerts-engine";

const INWIT = COMPILED_TEMPLATES.INWIT.template;
const th = { days: 2, unit: "WORKING_DAYS" as const, version: 1 };
// Forecast UT (F092) → Invio AS/VS (F101): la regola reale FORECAST_UT di INWIT, e una copia a chiusura manuale.
const SPEC: AlertRuleSpec = { ruleId: "PROVA", kind: "FIELD", direction: "BEFORE", ownerGroup: "UT_PE", leaderGroups: [], email: false, manualClose: true, templates: { INWIT: { trigger: "F092", close: "F101" } } };
const targets = (values: Record<string, FieldValue>) =>
  evaluateTargets({ templateId: "INWIT", values, repeats: {}, stato: "CREATA", thresholds: { PROVA: th }, isVisible: fieldVisibility(INWIT, values, []) }, [SPEC]);
const open = (over: Partial<ExistingAlert> = {}): ExistingAlert => ({
  id: "a1", ruleId: "PROVA", rowId: null, generation: 1, status: "OPEN", closeMode: null, dueAt: new Date("2026-11-06T08:00:00Z"),
  dueLocalDate: "2026-11-06", sourceFingerprint: "2026-11-10", resolvedAt: null, reminderCount: 0, ...over,
});
const NOW = new Date("2026-11-09T10:00:00Z");

describe("alert sui campi nascosti (D-207, Q10)", () => {
  it("visibilità del campo dalle condizioni del template: Invio AS/VS nascosto con Caratterizzazione, visibile con New Site e a Incarico vuoto", () => {
    expect(fieldVisibility(INWIT, { F012: { code: "CARATTERIZZAZIONE" } }, [])("F101", null)).toBe(false);
    expect(fieldVisibility(INWIT, { F012: { code: "NEW_SITE" } }, [])("F101", null)).toBe(true);
    expect(fieldVisibility(INWIT, {}, [])("F101", null)).toBe(true);
    expect(fieldVisibility(INWIT, {}, [])("F999", null)).toBe(true); // nessuna occorrenza: non si spegne nulla
  });

  it("campo nascosto: l'alert non è da segnalare e lo dichiara", () => {
    const [t] = targets({ F012: { code: "CARATTERIZZAZIONE" }, F092: "2026-11-10" });
    expect(t).toMatchObject({ pending: false, hidden: true });
    const [v] = targets({ F012: { code: "NEW_SITE" }, F092: "2026-11-10" });
    expect(v.pending).toBe(true);
    expect(v.hidden).toBeUndefined();
  });

  it("un episodio aperto si chiude anche se la regola è a chiusura manuale; tornato visibile si riapre (nuova generazione)", () => {
    const hidden = targets({ F012: { code: "CARATTERIZZAZIONE" }, F092: "2026-11-10" });
    expect(reconcileAlerts(hidden, [open()], NOW, [SPEC])).toEqual([{ type: "CLOSE", alertId: "a1", reason: "Campo nascosto da una condizione: l'alert non si applica" }]);
    const visible = targets({ F012: { code: "NEW_SITE" }, F092: "2026-11-10" });
    const actions = reconcileAlerts(visible, [open({ status: "CLOSED", closeMode: "AUTO", resolvedAt: NOW })], NOW, [SPEC]);
    expect(actions).toEqual([expect.objectContaining({ type: "OPEN", generation: 2 })]);
  });

  it("senza isVisible il motore resta quello di prima (tutto visibile)", () => {
    const [t] = evaluateTargets({ templateId: "INWIT", values: { F012: { code: "CARATTERIZZAZIONE" }, F092: "2026-11-10" }, repeats: {}, stato: "CREATA", thresholds: { PROVA: th } }, [SPEC]);
    expect(t.pending).toBe(true);
  });
});

describe("Nessuna data (D-208)", () => {
  const date = { dataType: "DATE" as const, label: "Data sopralluogo" };
  const forecast = { ...date, label: "Forecast", computed: { formula: "F", description: "x", manualOverride: true } };

  it("si salva solo nelle date compilate a mano", () => {
    expect(normalizeFieldValue(date, NO_DATE)).toBe(NO_DATE);
    expect(() => normalizeFieldValue(forecast, NO_DATE)).toThrow(/calcolato/);
    expect(() => normalizeFieldValue(date, "nessuna")).toThrow(/data non valida/);
  });

  it("conta come compilato nell'avanzamento", () => {
    const occ = INWIT.occurrences.find((o) => o.occurrenceKey === "F024@PM_PERMESSI.FASE_PRELIMINARE")!;
    const before = computeProgress(INWIT, { values: {}, repeats: {} }).PM_PERMESSI;
    const after = computeProgress(INWIT, { values: { [occ.flowId!]: NO_DATE }, repeats: {} }).PM_PERMESSI;
    expect(after.filled).toBe(before.filled + 1);
    expect(after.total).toBe(before.total);
  });

  it("chiude l'alert che aspettava quella data; come trigger non apre nulla", () => {
    const visibleAll = () => true;
    const [closed] = evaluateTargets({ templateId: "INWIT", values: { F092: "2026-11-10", F101: NO_DATE }, repeats: {}, stato: "CREATA", thresholds: { PROVA: th }, isVisible: visibleAll }, [SPEC]);
    expect(closed.pending).toBe(false);
    const [noTrigger] = evaluateTargets({ templateId: "INWIT", values: { F092: NO_DATE }, repeats: {}, stato: "CREATA", thresholds: { PROVA: th }, isVisible: visibleAll }, [SPEC]);
    expect(noTrigger).toMatchObject({ pending: false, trigger: null });
  });

  it("export e import: la cella è \"Nessuna data\" in entrambi i sensi", () => {
    const lookup = { listLabel: () => null, userName: () => null };
    expect(cellText({ dataType: "DATE" }, NO_DATE, lookup)).toBe(NO_DATE_LABEL);
    expect(cellText({ dataType: "DATE" }, "2026-11-06", lookup)).toBe("06/11/2026");
    const occ = { dataType: "DATE", label: "Data", list: undefined } as unknown as FieldOccurrenceDTO;
    const lookups = { listCode: () => null, userId: () => null, istatCode: () => null };
    expect(convertCell(occ, "Nessuna data", lookups)).toEqual({ ok: true, value: NO_DATE });
    expect(convertCell(occ, "nessuna DATA", lookups)).toEqual({ ok: true, value: NO_DATE });
  });
});
