/**
 * Letture autorizzate dell'assistente (progetto §4.1, §4.4, §5.1). Si parte SEMPRE dal filtro dell'elenco
 * (listFilter = visibilità + archivio + gestore + stato + ricerca) e si aggiungono condizioni con $and: mai al
 * posto del filtro di visibilità. Le pratiche non visibili non entrano in nessun totale.
 *
 * Limiti (versione snella): un conteggio si fa in Mongo sull'insieme autorizzato; una scansione che legge valori
 * delle iterazioni si ferma a MAX_SCAN pratiche (oltre: QUERY_TOO_BROAD, nessun totale inventato). Ogni query ha
 * maxTimeMS.
 */
import type { Filter } from "mongodb";
import type { FieldValue, UserDTO } from "@/lib/contract";
import { assigneesOf, userFields } from "@/lib/practice/assignees";
import { store } from "@/lib/store/db";
import type { PracticeDoc } from "@/lib/store/types";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";
import { CLOSED_STATI, listFilter } from "@/services/practices-v2/list";
import { normalizeSelection, ToolError, type Selection, type ToolContext } from "./tools/common";

export const MAX_SCAN = 2000;
export const QUERY_MS = 2000;

/** Filtro autorizzato della selezione (senza il tecnico, che richiede i valori); null = nessuna pratica visibile. */
export function selectionFilter(user: UserDTO, sel: Selection, opts: { activeOnly?: boolean } = {}): Filter<PracticeDoc> | null {
  const s = normalizeSelection(sel);
  const base = listFilter(user, { templateId: s.templateId, stato: s.stato, archived: s.archived, q: s.q, scope: s.scope });
  if (!base) return null;
  const and: Filter<PracticeDoc>[] = [base];
  if (s.clienteFinaleCode) and.push({ "currentSummary.clienteFinale.code": s.clienteFinaleCode });
  if (s.enabledGroup) and.push({ enabledGroups: s.enabledGroup });
  if (opts.activeOnly) and.push({ "currentSummary.statoAttivita": { $nin: [...CLOSED_STATI] } });
  return { $and: and };
}

export interface CurrentValues {
  practice: PracticeDoc;
  values: Record<string, FieldValue>;
  rows: Array<{ _id: string; groupKey: string; ordinal: number; values: Record<string, FieldValue> }>;
}

const order = (a: PracticeDoc, b: PracticeDoc) =>
  a.templateId.localeCompare(b.templateId) || a.currentSummary.codiceSito.localeCompare(b.currentSummary.codiceSito) || a._id.toHexString().localeCompare(b._id.toHexString());

/**
 * Pratiche della selezione con valori e righe dell'iterazione corrente (solo i gruppi richiesti), filtrate per
 * tecnico se chiesto. QUERY_TOO_BROAD oltre MAX_SCAN pratiche candidate.
 */
export async function scanSelection(
  ctx: ToolContext,
  sel: Selection,
  opts: { activeOnly?: boolean; rowGroups?: (p: PracticeDoc) => string[] } = {}
): Promise<CurrentValues[]> {
  const filter = selectionFilter(ctx.user, sel, opts);
  if (!filter) return [];
  const practices = await store.practices(ctx.db).find(filter, { maxTimeMS: QUERY_MS }).limit(MAX_SCAN + 1).toArray();
  if (practices.length > MAX_SCAN) throw new ToolError("QUERY_TOO_BROAD", `Più di ${MAX_SCAN} pratiche: restringi per cliente, stato o periodo`);
  practices.sort(order);
  if (ctx.signal.aborted) throw new ToolError("INVALID", "annullata");

  const iterationIds = practices.map((p) => p.currentIterationId);
  const iterations = await store.iterations(ctx.db).find({ _id: { $in: iterationIds } }, { projection: { _id: 1, values: 1 }, maxTimeMS: QUERY_MS }).toArray();
  const groupsWanted = new Set<string>();
  for (const p of practices) {
    for (const g of opts.rowGroups?.(p) ?? []) groupsWanted.add(g);
    if (sel.assignee) for (const o of userFields(COMPILED_TEMPLATES[p.templateId].template)) if (o.repeatGroup) groupsWanted.add(o.repeatGroup);
  }
  const rows = groupsWanted.size
    ? await store.repeatRows(ctx.db)
        .find({ iterationId: { $in: iterationIds }, groupKey: { $in: [...groupsWanted] } }, { projection: { _id: 1, iterationId: 1, groupKey: 1, ordinal: 1, values: 1 }, maxTimeMS: QUERY_MS })
        .sort({ groupKey: 1, ordinal: 1 })
        .toArray()
    : [];
  const valuesBy = new Map(iterations.map((i) => [i._id.toHexString(), i.values]));
  const rowsBy = new Map<string, CurrentValues["rows"]>();
  for (const r of rows) {
    const k = r.iterationId.toHexString();
    if (!rowsBy.has(k)) rowsBy.set(k, []);
    rowsBy.get(k)!.push({ _id: r._id.toHexString(), groupKey: r.groupKey, ordinal: r.ordinal, values: r.values });
  }
  let out: CurrentValues[] = practices.map((p) => ({
    practice: p,
    values: valuesBy.get(p.currentIterationId.toHexString()) ?? {},
    rows: rowsBy.get(p.currentIterationId.toHexString()) ?? [],
  }));
  if (sel.assignee) {
    const who = sel.assignee === "me" ? ctx.user.id : sel.assignee;
    out = out.filter((c) => assigneesOf(COMPILED_TEMPLATES[c.practice.templateId].template, c.values, c.rows).has(who));
  }
  return out;
}

/** Conteggio esatto della selezione senza tecnico (in Mongo). */
export async function countSelection(ctx: ToolContext, sel: Selection, opts: { activeOnly?: boolean } = {}): Promise<number> {
  const filter = selectionFilter(ctx.user, sel, opts);
  if (!filter) return 0;
  return store.practices(ctx.db).countDocuments(filter, { maxTimeMS: QUERY_MS });
}

/** Valore di data "YYYY-MM-DD" o null (le date si salvano come stringhe, contratto §5). */
export function dateValue(v: FieldValue | undefined): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/** Vuoto come nel contratto (D-110): null, stringa di soli spazi, codice vuoto, elenco vuoto. */
export function isEmptyValue(v: FieldValue | undefined): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return !("code" in v) || !String((v as { code: string }).code ?? "").trim();
  return false;
}
