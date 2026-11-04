/**
 * Storico e timeline (contratto §7, D-47): GET /api/practices/{id}/history?iteration=&page=&view=.
 * Unisce lo storico dei valori (value_history: FIELD, ROW_ADD, ROW_REMOVE) e gli eventi (practice_events),
 * dal più recente. `iteration` assente = tutte le iterazioni (D-25: lo storico di tutte resta consultabile).
 * Le voci delle Note Operative di gruppi non visibili all'utente non escono mai, nemmeno nel totale (D-121).
 */
import type { Db, Filter } from "mongodb";
import { GROUP_IDS, type GroupId, type HistoryEntryDTO, type HistoryResponse, type HistoryView, type UserDTO } from "@/lib/contract";
import { HttpError } from "@/lib/http-error";
import { visibleNoteGroups } from "@/lib/practice/notes";
import { store } from "@/lib/store/db";
import type { PracticeEventDoc, ValueHistoryDoc } from "@/lib/store/types";
import { loadVisiblePractice, parsePracticeId } from "@/services/practices-v2/repository";

export const HISTORY_PAGE_SIZE = 50;

export interface HistoryQuery {
  iteration?: number;
  page?: number;
  view?: HistoryView;
}

/** Parametri della query string (400 se non validi). */
export function parseHistoryQuery(params: URLSearchParams): HistoryQuery {
  const int = (name: string, min: number) => {
    const raw = params.get(name);
    if (raw === null || raw === "") return undefined;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min) throw new HttpError(`Parametro ${name} non valido`, 400);
    return n;
  };
  const view = params.get("view");
  if (view !== null && view !== "" && view !== "fields" && view !== "events") throw new HttpError("Parametro view non valido", 400);
  return { iteration: int("iteration", 1), page: int("page", 1), view: (view || undefined) as HistoryView | undefined };
}

const iso = (d: Date) => d.toISOString();

/** Gruppo della nota di una voce; le voci scritte prima di D-121 erano della nota unica, cioè di PM/Permessi. */
const noteGroupOf = (h: ValueHistoryDoc): GroupId => h.target.noteGroup ?? "PM_PERMESSI";

/** Esclude le voci delle note di gruppi non visibili (D-121): così anche il totale della paginazione le ignora. */
export function hiddenNotesFilter(visible: readonly GroupId[]): Filter<ValueHistoryDoc> {
  const hidden = GROUP_IDS.filter((g) => !visible.includes(g));
  if (hidden.length === 0) return {};
  const nor: Filter<ValueHistoryDoc>[] = [{ "target.transversal": "noteOperative", "target.noteGroup": { $in: hidden } }];
  if (hidden.includes("PM_PERMESSI")) nor.push({ "target.transversal": "noteOperative", "target.noteGroup": { $exists: false } });
  return { $nor: nor };
}

export function valueEntryDTO(h: ValueHistoryDoc): HistoryEntryDTO {
  return {
    id: h._id.toHexString(),
    practiceId: h.practiceId.toHexString(),
    iteration: h.n,
    kind: h.kind,
    ...(h.target.flowId ? { flowId: h.target.flowId } : {}),
    ...(h.target.groupKey ? { repeat: h.target.groupKey } : {}),
    ...(h.target.rowId ? { rowId: h.target.rowId.toHexString() } : {}),
    ...(h.target.transversal ? { transversal: h.target.transversal } : {}),
    ...(h.target.transversal === "noteOperative" ? { noteGroup: noteGroupOf(h) } : {}),
    oldValue: h.oldValue,
    newValue: h.newValue,
    ...(h.rowSnapshot ? { rowSnapshot: h.rowSnapshot } : {}),
    source: h.source,
    operationId: h.operationId,
    ...(h.detail ? { detail: h.detail } : {}),
    userId: h.actorId ? h.actorId.toHexString() : null,
    userName: h.actorName,
    timestamp: iso(h.timestamp),
  };
}

export function eventEntryDTO(e: PracticeEventDoc): HistoryEntryDTO {
  return {
    id: e._id.toHexString(),
    practiceId: e.practiceId.toHexString(),
    iteration: e.n,
    kind: e.kind,
    source: e.source,
    operationId: e.operationId,
    detail: e.detail,
    userId: e.actorId ? e.actorId.toHexString() : null,
    userName: e.actorName,
    timestamp: iso(e.timestamp),
  };
}

/** Ordine: istante decrescente, poi _id decrescente (gli id crescono nell'ordine di scrittura). */
type Keyed = { entry: HistoryEntryDTO; t: number; oid: string };
const compare = (a: Keyed, b: Keyed) => b.t - a.t || (a.oid < b.oid ? 1 : a.oid > b.oid ? -1 : 0);

export async function getHistory(db: Db, user: UserDTO, id: string, q: HistoryQuery): Promise<HistoryResponse> {
  const practice = await loadVisiblePractice(db, user, parsePracticeId(id));
  const page = q.page ?? 1;
  const pageSize = HISTORY_PAGE_SIZE;
  const need = page * pageSize;
  const base = { practiceId: practice._id, ...(q.iteration !== undefined ? { n: q.iteration } : {}) };
  const wantFields = q.view !== "events";
  const wantEvents = q.view !== "fields";

  const keyed: Keyed[] = [];
  let total = 0;
  if (wantFields) {
    const f = { ...base, ...hiddenNotesFilter(visibleNoteGroups(user, practice.templateId)) } as Filter<ValueHistoryDoc>;
    total += await store.valueHistory(db).countDocuments(f);
    const docs = await store.valueHistory(db).find(f).sort({ timestamp: -1, _id: -1 }).limit(need).toArray();
    for (const d of docs) keyed.push({ entry: valueEntryDTO(d), t: d.timestamp.getTime(), oid: d._id.toHexString() });
  }
  if (wantEvents) {
    const f = base as Filter<PracticeEventDoc>;
    total += await store.events(db).countDocuments(f);
    const docs = await store.events(db).find(f).sort({ timestamp: -1, _id: -1 }).limit(need).toArray();
    for (const d of docs) keyed.push({ entry: eventEntryDTO(d), t: d.timestamp.getTime(), oid: d._id.toHexString() });
  }
  keyed.sort(compare);
  return { items: keyed.slice((page - 1) * pageSize, need).map((k) => k.entry), total, page, pageSize };
}
