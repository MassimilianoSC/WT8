/**
 * get_calendar e get_issues (progetto §4.2, semantica chiusa del §4.3).
 *
 * - FORECAST = data operativa registrata. Con pendingOnly (predefinito per FORECAST) solo se la conclusione è vuota;
 *   nei gruppi ripetibili (ARPA, ENTE) la conclusione è sulla STESSA riga. Un forecast vuoto non è un ritardo.
 * - RECORDED = data di un evento o consegna già compilata. DEADLINE = scadenze esplicite del catalogo più gli alert
 *   OPEN/ACTIVE dell'iterazione corrente, con il dueAt dell'episodio (mai ricalcolato con le soglie di oggi).
 * - "Forecast scaduto" = forecast prima di oggi (Roma) e conclusione vuota; "alert scaduto" = OPEN/ACTIVE con
 *   dueAt < adesso. Fenomeni diversi, contati separatamente; il numero di pratiche distinte è a parte.
 */
import type { Filter } from "mongodb";
import { z } from "zod";
import { visibleTemplates } from "@/lib/engines/access";
import { romeDate } from "@/lib/calendario";
import { store } from "@/lib/store/db";
import type { AlertDoc, PracticeDoc } from "@/lib/store/types";
import { alertLabel } from "@/services/alerts";
import { catalogFor, semanticIds, type DateCatalogEntry, type DateKind } from "../catalog";
import { dateValue, isEmptyValue, QUERY_MS, scanSelection, type CurrentValues } from "../reads";
import {
  fitResult,
  MAX_ITEMS,
  normalizeSelection,
  periodSchema,
  practiceSource,
  selectionSchema,
  type Period,
  type Selection,
  type ToolContext,
  type ToolResult,
} from "./common";
import { selectionSource } from "./practices";
import type { TemplateId } from "@/lib/contract";

const templatesOf = (ctx: ToolContext, sel: Selection): TemplateId[] => (sel.templateId ? [sel.templateId] : visibleTemplates(ctx.user));
const inPeriod = (d: string, p: Period) => d >= p.from && d <= p.to;

interface DateHit {
  c: CurrentValues;
  e: DateCatalogEntry;
  date: string;
  done: string | null;
  rowId?: string;
}

/** Date del catalogo nelle iterazioni correnti della selezione (righe ripetibili comprese). */
function dateHits(scanned: CurrentValues[], entries: (t: TemplateId) => DateCatalogEntry[]): DateHit[] {
  const out: DateHit[] = [];
  for (const c of scanned) {
    for (const e of entries(c.practice.templateId)) {
      const rows = e.repeatGroup ? c.rows.filter((r) => r.groupKey === e.repeatGroup).map((r) => ({ values: r.values, rowId: r._id })) : [{ values: c.values, rowId: undefined }];
      for (const r of rows) {
        const date = dateValue(r.values[e.flowId]);
        if (!date) continue;
        const done = e.completionFlowId ? dateValue(r.values[e.completionFlowId]) ?? (isEmptyValue(r.values[e.completionFlowId]) ? null : "compilato") : null;
        out.push({ c, e, date, done, rowId: r.rowId });
      }
    }
  }
  return out;
}

const repeatGroupsFor = (entries: (t: TemplateId) => DateCatalogEntry[]) => (p: PracticeDoc) => [...new Set(entries(p.templateId).map((e) => e.repeatGroup).filter((g): g is string => !!g))];

function hitItem(ctx: ToolContext, h: DateHit) {
  const p = h.c.practice;
  return {
    fonte: practiceSource(ctx, p, `${h.e.label} — ${p.currentSummary.codiceSito}`, { flowId: h.e.flowId, sectionKey: h.e.sectionKey, ...(h.rowId ? { rowId: h.rowId } : {}) }),
    pratica: { id: p._id.toHexString(), codiceSito: p.currentSummary.codiceSito, nomeSito: p.currentSummary.nomeSito, templateId: p.templateId, iterazione: p.currentIterationN },
    milestone: h.e.semanticId,
    etichetta: h.e.label,
    tipo: h.e.dateKind,
    data: h.date,
    ...(h.e.completionFlowId ? { conclusa: h.done !== null, ...(h.done && h.done !== "compilato" ? { dataConclusione: h.done } : {}) } : {}),
    ...(h.rowId ? { riga: h.rowId } : {}),
  };
}

/** Alert OPEN/ACTIVE delle iterazioni correnti delle pratiche date. */
async function openAlerts(ctx: ToolContext, practices: PracticeDoc[], extra: Filter<AlertDoc> = {}): Promise<AlertDoc[]> {
  if (practices.length === 0) return [];
  return store.alerts(ctx.db)
    .find({ status: "OPEN", executionStatus: "ACTIVE", iterationId: { $in: practices.map((p) => p.currentIterationId) }, ...extra }, { maxTimeMS: QUERY_MS })
    .sort({ dueAt: 1, _id: 1 })
    .toArray();
}

function alertItem(ctx: ToolContext, a: AlertDoc, p: PracticeDoc) {
  return {
    fonte: practiceSource(ctx, p, `${alertLabel(a.ruleId)} — ${p.currentSummary.codiceSito}`, {
      ...(a.subject.flowId ? { flowId: a.subject.flowId } : {}),
      ...(a.subject.sectionKey ? { sectionKey: a.subject.sectionKey } : {}),
      ...(a.subject.rowId ? { rowId: a.subject.rowId.toHexString() } : {}),
    }),
    pratica: { id: p._id.toHexString(), codiceSito: p.currentSummary.codiceSito, nomeSito: p.currentSummary.nomeSito, templateId: p.templateId, iterazione: p.currentIterationN },
    alert: a.ruleId,
    etichetta: alertLabel(a.ruleId),
    scadenza: a.dueAt ? a.dueAt.toISOString() : null,
    scadenzaGiorno: a.dueLocalDate,
    scaduto: !!a.dueAt && a.dueAt.getTime() < ctx.now.getTime(),
  };
}

/**
 * Voci del catalogo del tipo chiesto per le milestone chieste. Una milestone del tipo "sbagliato" vale per la sua
 * coppia: con FORECAST, CONSEGNA_PE indica il Forecast PE che la conclude; con RECORDED, PE indica la consegna
 * (Invio PE) che conclude quel forecast. Così "consegne previste/effettuate" funziona con entrambi i nomi.
 */
export function milestonesFor(t: TemplateId, kind: DateKind, wanted: Set<string> | null): DateCatalogEntry[] {
  const all = catalogFor(t);
  const ofKind = all.filter((e) => e.dateKind === kind);
  if (!wanted) return ofKind;
  return ofKind.filter((e) => {
    if (wanted.has(e.semanticId)) return true;
    if (kind === "FORECAST") return all.some((r) => r.dateKind === "RECORDED" && wanted.has(r.semanticId) && r.flowId === e.completionFlowId);
    if (kind === "RECORDED") return all.some((f) => f.dateKind === "FORECAST" && wanted.has(f.semanticId) && f.completionFlowId === e.flowId);
    return false;
  });
}

/* ---------- get_calendar ---------- */

export const getCalendarSchema = z.strictObject({
  selection: selectionSchema,
  period: periodSchema,
  dateKind: z.enum(["FORECAST", "DEADLINE", "RECORDED"]),
  milestones: z.array(z.string().trim().toUpperCase().regex(/^[A-Z_]{2,40}$/)).min(1).max(8).optional(),
  pendingOnly: z.boolean().optional(),
});

export async function getCalendar(ctx: ToolContext, args: z.infer<typeof getCalendarSchema>): Promise<ToolResult> {
  const sel = normalizeSelection(args.selection);
  const kind: DateKind = args.dateKind;
  const pendingOnly = args.pendingOnly ?? kind === "FORECAST";
  const wanted = args.milestones ? new Set(args.milestones) : null;
  const entries = (t: TemplateId) => milestonesFor(t, kind, wanted);
  const allowedTemplates = new Set(templatesOf(ctx, sel));
  const scanned = (await scanSelection(ctx, sel, { rowGroups: repeatGroupsFor(entries) })).filter((c) => allowedTemplates.has(c.practice.templateId));

  type Row = { date: string; site: string; item: Record<string, unknown>; practiceId: string };
  const rows: Row[] = [];
  for (const h of dateHits(scanned, entries)) {
    if (!inPeriod(h.date, args.period)) continue;
    if (kind === "FORECAST" && pendingOnly && h.done !== null) continue;
    rows.push({ date: h.date, site: h.c.practice.currentSummary.codiceSito, item: hitItem(ctx, h), practiceId: h.c.practice._id.toHexString() });
  }
  if (kind === "DEADLINE") {
    const byIt = new Map(scanned.map((c) => [c.practice.currentIterationId.toHexString(), c.practice]));
    for (const a of await openAlerts(ctx, scanned.map((c) => c.practice))) {
      if (!a.dueAt) continue;
      const day = romeDate(a.dueAt);
      if (!inPeriod(day, args.period)) continue;
      const p = byIt.get(a.iterationId.toHexString())!;
      rows.push({ date: day, site: p.currentSummary.codiceSito, item: { ...alertItem(ctx, a, p), tipo: "ALERT" }, practiceId: p._id.toHexString() });
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.site.localeCompare(b.site));
  const totalPractices = new Set(rows.map((r) => r.practiceId)).size;
  const setIndex = selectionSource(ctx, sel);
  ctx.facts.add({ key: "calendar.milestones", label: `Date ${kind} nel periodo`, value: rows.length, scopeLabel: "Milestone (non pratiche)", period: args.period, sourceIndex: setIndex });
  ctx.facts.add({ key: "calendar.practices", label: "Pratiche distinte", value: totalPractices, scopeLabel: "Pratiche con almeno una data nel periodo", period: args.period, sourceIndex: setIndex });
  const shown = rows.slice(0, MAX_ITEMS);
  return fitResult(
    {
      asOf: ctx.now.toISOString(),
      selection: { ...sel, periodo: args.period, tipo: kind, pendingOnly, ...(args.milestones ? { milestones: args.milestones } : {}), fonteInsieme: setIndex },
      items: shown.map((r) => r.item),
      total: rows.length,
      complete: shown.length === rows.length,
      truncated: shown.length < rows.length,
      ...(shown.length < rows.length ? { omittedReason: "ROWS" as const } : {}),
      note:
        `totalMilestones=${rows.length}, totalPractices=${totalPractices}` +
        (wanted && [...allowedTemplates].every((t) => entries(t).length === 0)
          ? `. Nessuna delle milestone chieste esiste come ${kind}: id validi ${semanticIds([...allowedTemplates], kind).join(", ")}`
          : ""),
    },
    10000
  );
}

/* ---------- get_issues ---------- */

const ISSUE_KINDS = ["OPEN_ALERT", "OVERDUE_ALERT", "OVERDUE_FORECAST", "KO", "STAND_BY"] as const;
export const getIssuesSchema = z.strictObject({
  selection: selectionSchema,
  kinds: z.array(z.enum(ISSUE_KINDS)).min(1).max(5),
  period: periodSchema.optional(),
});

export async function getIssues(ctx: ToolContext, args: z.infer<typeof getIssuesSchema>): Promise<ToolResult> {
  const sel = normalizeSelection(args.selection);
  const kinds = new Set(args.kinds);
  const forecastEntries = (t: TemplateId) => (kinds.has("OVERDUE_FORECAST") ? catalogFor(t, "FORECAST").filter((e) => e.completionFlowId) : []);
  const scanned = await scanSelection(ctx, sel, { rowGroups: repeatGroupsFor(forecastEntries) });
  const practices = scanned.map((c) => c.practice);
  type Row = { order: string; practiceId: string; kind: string; item: Record<string, unknown> };
  const rows: Row[] = [];
  const counts: Record<string, number> = {};
  const count = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);

  if (kinds.has("OPEN_ALERT") || kinds.has("OVERDUE_ALERT")) {
    const byIt = new Map(practices.map((p) => [p.currentIterationId.toHexString(), p]));
    for (const a of await openAlerts(ctx, practices)) {
      const day = a.dueAt ? romeDate(a.dueAt) : null;
      if (args.period && (!day || !inPeriod(day, args.period))) continue;
      const overdue = !!a.dueAt && a.dueAt.getTime() < ctx.now.getTime();
      const p = byIt.get(a.iterationId.toHexString())!;
      if (kinds.has("OPEN_ALERT")) count("OPEN_ALERT");
      if (overdue) count("OVERDUE_ALERT");
      if (kinds.has("OPEN_ALERT") || overdue) rows.push({ order: day ?? "9999", practiceId: p._id.toHexString(), kind: overdue ? "OVERDUE_ALERT" : "OPEN_ALERT", item: { tipo: overdue ? "OVERDUE_ALERT" : "OPEN_ALERT", ...alertItem(ctx, a, p) } });
    }
    if (!kinds.has("OVERDUE_ALERT")) delete counts.OVERDUE_ALERT;
  }
  if (kinds.has("OVERDUE_FORECAST")) {
    for (const h of dateHits(scanned, forecastEntries)) {
      if (h.done !== null || h.date >= ctx.todayRome) continue;
      if (args.period && !inPeriod(h.date, args.period)) continue;
      count("OVERDUE_FORECAST");
      rows.push({ order: h.date, practiceId: h.c.practice._id.toHexString(), kind: "OVERDUE_FORECAST", item: { ...hitItem(ctx, h), tipo: "OVERDUE_FORECAST" } });
    }
  }
  for (const stato of ["KO", "STAND_BY"] as const) {
    if (!kinds.has(stato)) continue;
    for (const p of practices.filter((x) => x.currentSummary.statoAttivita === stato)) {
      count(stato);
      rows.push({ order: "0000", practiceId: p._id.toHexString(), kind: stato, item: { tipo: stato, fonte: practiceSource(ctx, p, `${p.currentSummary.codiceSito} — stato ${stato}`), pratica: { id: p._id.toHexString(), codiceSito: p.currentSummary.codiceSito, nomeSito: p.currentSummary.nomeSito, templateId: p.templateId } } });
    }
  }
  rows.sort((a, b) => a.order.localeCompare(b.order) || a.practiceId.localeCompare(b.practiceId));
  const distinct = new Set(rows.map((r) => r.practiceId)).size;
  const setIndex = selectionSource(ctx, sel);
  for (const k of args.kinds) ctx.facts.add({ key: `issues.${k}`, label: k, value: counts[k] ?? 0, scopeLabel: "Episodi o milestone (non pratiche)", ...(args.period ? { period: args.period } : {}), sourceIndex: setIndex });
  ctx.facts.add({ key: "issues.practices", label: "Pratiche distinte", value: distinct, scopeLabel: "Pratiche con almeno una criticità", sourceIndex: setIndex });
  const shown = rows.slice(0, MAX_ITEMS);
  return fitResult(
    {
      asOf: ctx.now.toISOString(),
      selection: { ...sel, tipi: args.kinds, ...(args.period ? { periodo: args.period } : {}), fonteInsieme: setIndex },
      items: shown.map((r) => r.item),
      total: rows.length,
      complete: shown.length === rows.length,
      truncated: shown.length < rows.length,
      ...(shown.length < rows.length ? { omittedReason: "ROWS" as const } : {}),
      note: `conteggi=${JSON.stringify(counts)}, praticheDistinte=${distinct}`,
    },
    10000
  );
}
