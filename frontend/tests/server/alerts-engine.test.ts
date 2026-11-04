// @vitest-environment node
/** Motore degli alert (B7): collegamenti, scadenze (architettura §6.6), bersagli, riconciliazione, destinatari. */
import { describe, expect, it } from "vitest";
import { TEMPLATE_IDS, type FieldValue, type TemplateId } from "@/lib/contract";
import { ALERT_SPECS, dueOf, evaluateTargets, reconcileAlerts, reminderAt, type AlertTarget, type ExistingAlert, type Threshold } from "@/lib/alerts/engine";
import { alertRecipients } from "@/lib/alerts/recipients";
import { ALERT_RULES } from "@/lib/store/db";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";

const thresholds = (t: TemplateId): Partial<Record<string, Threshold>> =>
  Object.fromEntries(ALERT_RULES.filter((r) => r.templates.includes(t)).map((r) => [r.ruleId, { days: r.days, unit: r.unit, version: 1 }]));
const at = (iso: string) => new Date(iso);
const targetsOf = (templateId: TemplateId, values: Record<string, FieldValue>, repeats: Record<string, Array<{ rowId: string; values: Record<string, FieldValue> }>> = {}, stato: "CREATA" | "KO" = "CREATA") =>
  evaluateTargets({ templateId, values, repeats, stato, thresholds: thresholds(templateId) });
const target = (ts: AlertTarget[], ruleId: string, rowId: string | null = null) => ts.find((t) => t.ruleId === ruleId && t.rowId === rowId)!;

describe("collegamenti (alert-bindings.json)", () => {
  it("ogni trigger e chiusura è un MASTER DATE del template; ARPA sulla stessa riga; soglia presente per ogni regola a campo", () => {
    for (const spec of ALERT_SPECS) {
      for (const [t, b] of Object.entries(spec.templates) as Array<[TemplateId, { trigger?: string; close?: string }]>) {
        const occ = (f: string) => COMPILED_TEMPLATES[t].template.occurrences.find((o) => o.kind === "MASTER" && o.flowId === f);
        if (spec.kind === "STATO_KO") continue;
        expect(occ(b.trigger!)?.dataType, `${spec.ruleId} ${t} trigger`).toBe("DATE");
        if (b.close) expect(occ(b.close), `${spec.ruleId} ${t} chiusura`).toBeDefined();
        expect(occ(b.trigger!)?.repeatGroup, spec.ruleId).toBe(spec.repeatGroup);
        expect(ALERT_RULES.find((r) => r.ruleId === spec.ruleId)?.templates, `${spec.ruleId} soglia`).toContain(t);
      }
    }
  });

  it("ambiti espliciti: CDMS solo ILIAD; Offerta escluso FV e LEONARDO; ODA solo FV; Fine lavori, Parere Arpa compreso LEONARDO", () => {
    const of = (id: string) => Object.keys(ALERT_SPECS.find((s) => s.ruleId === id)!.templates).sort();
    expect(of("CDMS_EM")).toEqual(["ILIAD"]);
    expect(of("OFFERTA_ODA")).toEqual(["ILIAD", "INWIT", "TIM_FIBERCOP", "TOWERNET"]);
    expect(of("ODA_FV_PACCHETTO")).toEqual(["FASTWEB_VODAFONE"]);
    expect(of("PARERE_ARPA")).toContain("LEONARDO");
    expect(of("FATTURABILE_KO")).toEqual([...TEMPLATE_IDS].sort());
    expect(ALERT_SPECS.filter((s) => s.email).map((s) => s.ruleId).sort()).toEqual(["FORECAST_AIE", "FORECAST_UT"]);
    expect(ALERT_SPECS.filter((s) => s.weeklyReminder).map((s) => s.ruleId).sort()).toEqual(["CDMS_EM", "OFFERTA_ODA"]);
  });
});

describe("scadenze (architettura §6.6, D-43, D-97)", () => {
  const wd = (days: number) => ({ days, unit: "WORKING_DAYS" as const });
  it("giorni lavorativi in avanti: weekend, Pasquetta, Natale, 4 ottobre dal 2026", () => {
    expect(dueOf("2026-10-09", "AFTER", wd(1)).dueLocalDate).toBe("2026-10-12"); // venerdì → lunedì
    expect(dueOf("2026-04-03", "AFTER", wd(1)).dueLocalDate).toBe("2026-04-07");
    expect(dueOf("2026-12-24", "AFTER", wd(1)).dueLocalDate).toBe("2026-12-28");
    expect(dueOf("2027-10-01", "AFTER", wd(1)).dueLocalDate).toBe("2027-10-05");
    expect(dueOf("2025-10-03", "AFTER", wd(1)).dueLocalDate).toBe("2025-10-06");
    expect(dueOf("2026-12-23", "AFTER", wd(20)).dueLocalDate).toBe("2027-01-25"); // +20 attraverso Capodanno ed Epifania
  });
  it("prima del forecast; calendario con rinvio; 09:00 di Roma con ora legale e solare", () => {
    expect(dueOf("2026-10-12", "BEFORE", wd(2)).dueLocalDate).toBe("2026-10-08");
    expect(dueOf("2026-10-02", "AFTER", { days: 7, unit: "CALENDAR_DAYS" }).dueLocalDate).toBe("2026-10-09");
    expect(dueOf("2026-10-03", "AFTER", { days: 7, unit: "CALENDAR_DAYS" }).dueLocalDate).toBe("2026-10-12"); // sabato → lunedì
    expect(dueOf("2026-07-01", "AFTER", wd(1)).dueAt.toISOString()).toBe("2026-07-02T07:00:00.000Z");
    expect(dueOf("2026-12-01", "AFTER", wd(1)).dueAt.toISOString()).toBe("2026-12-02T08:00:00.000Z");
  });
  it("promemoria settimanali: ancora + 7k di calendario, ognuna rinviata senza far slittare le successive", () => {
    expect(reminderAt("2026-10-09", 1).dueLocalDate).toBe("2026-10-16");
    expect(reminderAt("2026-12-18", 1).dueLocalDate).toBe("2026-12-28"); // venerdì 25 → lunedì 28 (26 sabato)
    expect(reminderAt("2026-12-18", 2).dueLocalDate).toBe("2027-01-04"); // 1° gennaio festivo, poi weekend
    expect(reminderAt("2026-12-18", 3).dueLocalDate).toBe("2027-01-08"); // l'ancora non slitta: 18/12 + 21
  });
});

describe("bersagli", () => {
  it("Sopralluogo: da segnalare con trigger valido e chiusura vuota; la chiusura compilata lo risolve", () => {
    const t = target(targetsOf("INWIT", { F023: "2026-10-01" }), "SOPRALLUOGO");
    expect(t).toMatchObject({ pending: true, subject: { flowId: "F024" }, due: { dueLocalDate: "2026-10-12" } }); // +7 lavorativi
    expect(target(targetsOf("INWIT", { F023: "2026-10-01", F024: "2026-10-05" }), "SOPRALLUOGO").pending).toBe(false);
    expect(target(targetsOf("INWIT", { F023: "01/10/2026" }), "SOPRALLUOGO").pending).toBe(false);
  });
  it("CDMS solo con Committente CELLNEX e chiuso solo dalla data EM (non EM SELECT né Numero EM)", () => {
    expect(target(targetsOf("ILIAD", { F108: "2026-10-01" }), "CDMS_EM").pending).toBe(false);
    const cellnex = { F004: { code: "CELLNEX" }, F108: "2026-10-01" };
    expect(target(targetsOf("ILIAD", cellnex), "CDMS_EM").pending).toBe(true);
    expect(target(targetsOf("ILIAD", { ...cellnex, F111: { code: "X" }, F110: "123" }), "CDMS_EM").pending).toBe(true);
    expect(target(targetsOf("ILIAD", { ...cellnex, F109: "2026-10-20" }), "CDMS_EM").pending).toBe(false);
  });
  it("Offerta: solo dal campo Invio Offerta della fatturazione (F099), non da F044", () => {
    expect(target(targetsOf("ILIAD", { F044: "2026-10-01" }), "OFFERTA_ODA").pending).toBe(false);
    expect(target(targetsOf("ILIAD", { F099: "2026-10-01", F102: "ODA-1" }), "OFFERTA_ODA").pending).toBe(true); // l'ODA non chiude da sola
  });
  it("ODA FASTWEB: aperture e chiusure sui codici di Stato ODA (D-116)", () => {
    const fv = (code: string | null, extra: Record<string, FieldValue> = {}) => targetsOf("FASTWEB_VODAFONE", { F025: "2026-10-01", F046: "2026-10-02", ...(code ? { F014: { code } } : {}), ...extra });
    expect([target(fv("DA_RICHIEDERE"), "ODA_FV_ASSEGNAZIONE").pending, target(fv("DA_RICHIEDERE"), "ODA_FV_PACCHETTO").pending]).toEqual([true, true]);
    expect([target(fv("RICHIESTI"), "ODA_FV_ASSEGNAZIONE").pending, target(fv("RICHIESTI"), "ODA_FV_PACCHETTO").pending]).toEqual([false, true]);
    expect([target(fv("PRESENTI"), "ODA_FV_ASSEGNAZIONE").pending, target(fv("PRESENTI"), "ODA_FV_PACCHETTO").pending]).toEqual([false, false]);
    expect(target(fv("DA_RICHIEDERE"), "ODA_FV_ASSEGNAZIONE").due!.dueLocalDate).toBe("2026-10-02");
    // D-133: Stato ODA vuoto vale come DA_RICHIEDERE per entrambe.
    expect([target(fv(null), "ODA_FV_ASSEGNAZIONE").pending, target(fv(null), "ODA_FV_PACCHETTO").pending]).toEqual([true, true]);
  });
  it("Parere Arpa: una per riga; Fatturabile KO con stato KO di qualunque origine; senza soglia nessun alert", () => {
    const ts = targetsOf("INWIT", {}, { ARPA: [{ rowId: "a1", values: { F058: "2026-10-01" } }, { rowId: "a2", values: { F058: "2026-10-01", F059: "2026-10-03" } }] });
    expect([target(ts, "PARERE_ARPA", "a1").pending, target(ts, "PARERE_ARPA", "a2").pending]).toEqual([true, false]);
    expect(target(ts, "PARERE_ARPA", "a1").subject).toEqual({ flowId: "F059", groupKey: "ARPA", rowId: "a1" });
    expect(target(targetsOf("INWIT", {}, {}, "KO"), "FATTURABILE_KO")).toMatchObject({ pending: true, due: null });
    expect(evaluateTargets({ templateId: "INWIT", values: { F023: "2026-10-01" }, repeats: {}, stato: "CREATA", thresholds: {} }).map((t) => t.ruleId)).toEqual(["FATTURABILE_KO"]);
  });
});

describe("riconciliazione", () => {
  const existing = (o: Partial<ExistingAlert>): ExistingAlert => ({
    id: "x", ruleId: "SOPRALLUOGO", rowId: null, generation: 1, status: "OPEN", closeMode: null, dueAt: null, dueLocalDate: "2026-10-12", sourceFingerprint: "2026-10-01", resolvedAt: null, reminderCount: 0, ...o,
  });
  const sop = (values: Record<string, FieldValue>) => targetsOf("INWIT", values).filter((t) => t.ruleId === "SOPRALLUOGO");

  it("si apre solo a scadenza raggiunta, una volta; trigger cambiato → ripianificato, nessun doppione", () => {
    expect(reconcileAlerts(sop({ F023: "2026-10-01" }), [], at("2026-10-12T06:59:00Z"))).toEqual([]);
    expect(reconcileAlerts(sop({ F023: "2026-10-01" }), [], at("2026-10-12T07:00:00Z"))).toEqual([expect.objectContaining({ type: "OPEN", generation: 1 })]);
    expect(reconcileAlerts(sop({ F023: "2026-10-01" }), [existing({})], at("2026-10-20T07:00:00Z"))).toEqual([]);
    expect(reconcileAlerts(sop({ F023: "2026-10-05" }), [existing({})], at("2026-10-20T07:00:00Z"))).toEqual([expect.objectContaining({ type: "RESCHEDULE", alertId: "x", sourceFingerprint: "2026-10-05" })]);
  });

  it("risolto → chiusura AUTO; chiuso a mano resta chiuso; nuova generazione solo dopo una risoluzione (D-97)", () => {
    expect(reconcileAlerts(sop({ F023: "2026-10-01", F024: "2026-10-09" }), [existing({})], at("2026-10-20T07:00:00Z"))).toEqual([expect.objectContaining({ type: "CLOSE", alertId: "x" })]);
    const manual = existing({ status: "CLOSED", closeMode: "MANUAL" });
    expect(reconcileAlerts(sop({ F023: "2026-10-01" }), [manual], at("2026-10-20T07:00:00Z"))).toEqual([]);
    expect(reconcileAlerts(sop({ F023: "2026-10-01", F024: "2026-10-09" }), [manual], at("2026-10-20T07:00:00Z"))).toEqual([{ type: "MARK_RESOLVED", alertId: "x" }]);
    const resolved = existing({ status: "CLOSED", closeMode: "AUTO", resolvedAt: at("2026-10-15T07:00:00Z") });
    expect(reconcileAlerts(sop({ F023: "2026-10-01" }), [resolved], at("2026-10-20T07:00:00Z"))).toEqual([expect.objectContaining({ type: "OPEN", generation: 2 })]);
  });

  it("chiusura manuale (Offerta, Fatturabile KO): mai chiusura automatica; KO uscito e rientrato dopo la decisione → nuovo episodio", () => {
    const ko = (stato: "KO" | "CREATA") => targetsOf("INWIT", {}, {}, stato).filter((t) => t.ruleId === "FATTURABILE_KO");
    const open = existing({ ruleId: "FATTURABILE_KO", sourceFingerprint: "KO", dueLocalDate: null });
    expect(reconcileAlerts(ko("KO"), [], at("2026-10-08T10:00:00Z"))).toEqual([expect.objectContaining({ type: "OPEN", ruleId: "FATTURABILE_KO", due: null })]);
    // Fuori da KO: resta aperto (D-131) ma l'uscita si registra subito (D-137 A-01); rientro prima della decisione → annullata.
    expect(reconcileAlerts(ko("CREATA"), [open], at("2026-10-09T07:00:00Z"))).toEqual([{ type: "MARK_RESOLVED", alertId: "x" }]);
    expect(reconcileAlerts(ko("CREATA"), [{ ...open, resolvedAt: at("2026-10-09T07:00:00Z") }], at("2026-10-09T08:00:00Z"))).toEqual([]);
    expect(reconcileAlerts(ko("KO"), [{ ...open, resolvedAt: at("2026-10-09T07:00:00Z") }], at("2026-10-09T09:00:00Z"))).toEqual([{ type: "MARK_UNRESOLVED", alertId: "x" }]);
    const decided = { ...open, status: "CLOSED" as const, closeMode: "AUTO" as const, resolvedAt: null };
    expect(reconcileAlerts(ko("KO"), [decided], at("2026-10-10T07:00:00Z"))).toEqual([]); // ancora KO dopo la decisione
    expect(reconcileAlerts(ko("CREATA"), [decided], at("2026-10-11T07:00:00Z"))).toEqual([{ type: "MARK_RESOLVED", alertId: "x" }]);
    expect(reconcileAlerts(ko("KO"), [{ ...decided, resolvedAt: at("2026-10-11T07:00:00Z") }], at("2026-10-12T07:00:00Z"))).toEqual([expect.objectContaining({ type: "OPEN", generation: 2 })]);
  });

  it("promemoria settimanali: uno solo dopo un fermo, il più recente dovuto", () => {
    const offerta = targetsOf("INWIT", { F071: "2026-10-01" }).filter((t) => t.ruleId === "OFFERTA_ODA");
    const opened = reconcileAlerts(offerta, [], at("2026-10-08T07:00:00Z"));
    expect(opened).toEqual([expect.objectContaining({ type: "OPEN", nextReminder: { dueLocalDate: "2026-10-15", dueAt: expect.any(Date) } })]);
    const alert = existing({ ruleId: "OFFERTA_ODA", dueLocalDate: "2026-10-08", sourceFingerprint: "2026-10-01" });
    expect(reconcileAlerts(offerta, [alert], at("2026-10-14T07:00:00Z"))).toEqual([]);
    expect(reconcileAlerts(offerta, [alert], at("2026-11-02T07:00:00Z"))).toEqual([
      { type: "REMIND", alertId: "x", reminderCount: 3, slot: "2026-10-29", nextReminder: reminderAt("2026-10-08", 4) },
    ]);
  });

  it("riga ARPA tolta: l'episodio aperto si chiude; due righe indipendenti", () => {
    const a1 = existing({ id: "e1", ruleId: "PARERE_ARPA", rowId: "a1", sourceFingerprint: "2026-10-01" });
    const ts = targetsOf("INWIT", {}, { ARPA: [{ rowId: "a2", values: { F058: "2026-10-01" } }] });
    const acts = reconcileAlerts(ts, [a1], at("2026-10-20T07:00:00Z"));
    expect(acts).toEqual(expect.arrayContaining([expect.objectContaining({ type: "CLOSE", alertId: "e1" }), expect.objectContaining({ type: "OPEN", rowId: "a2" })]));
  });
});

describe("destinatari (D-45)", () => {
  const m = (group: "PM_PERMESSI" | "UT_PE" | "AIE" | "DL", role: "PM" | "PERMESSI" | "UT" | "AIE" | "DL", leader: boolean, templateId: TemplateId = "TIM_FIBERCOP") => ({ templateId, group, role, leader });
  const users = [
    { id: "pmL", status: "active" as const, memberships: [m("PM_PERMESSI", "PM", true), m("UT_PE", "UT", true)] },
    { id: "pm", status: "active" as const, memberships: [m("PM_PERMESSI", "PM", false)] },
    { id: "utL", status: "active" as const, memberships: [m("UT_PE", "UT", true)] },
    { id: "dlOff", status: "deactivated" as const, memberships: [m("DL", "DL", true)] },
    { id: "altro", status: "active" as const, memberships: [m("AIE", "AIE", true, "INWIT")] },
  ];
  it("PM leader + leader dei gruppi, deduplicati; nessun sostituto: quote mancanti nel log", () => {
    const pe = ALERT_SPECS.find((s) => s.ruleId === "FORECAST_PE")!;
    expect(alertRecipients(users, "TIM_FIBERCOP", pe)).toEqual({ userIds: ["pmL", "utL"], missing: ["DL"] });
    expect(alertRecipients(users, "INWIT", ALERT_SPECS.find((s) => s.ruleId === "FORECAST_AIE")!)).toEqual({ userIds: ["altro"], missing: ["PM"] });
  });
});
