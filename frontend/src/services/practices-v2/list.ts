/**
 * Elenco delle pratiche (contratto §5.1): GET /api/practices?templateId=&stato=&archived=&q=&scope=&sort=&page=.
 * La rotta è in collisione con la beta ed entra al cutover (D-68); il servizio è già pronto e provato.
 *
 * La visibilità si traduce in un filtro Mongo equivalente a isInScope del motore dei permessi (B4): stessa
 * appartenenza (template + gruppo), PM/Permessi vedono tutto il template, gli altri gruppi solo le pratiche in
 * cui sono abilitati; scope=all = tutte le pratiche dei propri template; ADMIN tutte. Le prove confrontano
 * il filtro con isInScope pratica per pratica.
 */
import type { Db, Document, Filter } from "mongodb";
import {
  STATI_ATTIVITA,
  TEMPLATE_IDS,
  type GroupId,
  type PracticeListQuery,
  type PracticeListResponse,
  type PracticeScope,
  type PracticeSort,
  type StatoAttivita,
  type TemplateId,
  type UserDTO,
} from "@/lib/contract";
import { membershipsIn } from "@/lib/engines/access";
import { addCalendarDays, isValidIsoDate, romeTime } from "@/lib/calendario";
import { HttpError } from "@/lib/http-error";
import { toSummaryDTO } from "@/lib/practice/detail";
import { store } from "@/lib/store/db";
import type { PracticeDoc } from "@/lib/store/types";

export const PRACTICE_PAGE_SIZE = 50;
/** Stati "chiusi" per l'ordinamento open_first. */
export const CLOSED_STATI: readonly StatoAttivita[] = ["TERMINATO", "KO"];

const SCOPES: readonly PracticeScope[] = ["assigned", "all"];
const SORTS: readonly PracticeSort[] = ["open_first", "updated_desc", "created_desc"];

/** Parametri della query string (400 se non validi). */
export function parseListQuery(params: URLSearchParams): PracticeListQuery {
  const one = <T extends string>(name: string, allowed: readonly T[]): T | undefined => {
    const v = params.get(name);
    if (v === null || v === "") return undefined;
    if (!(allowed as readonly string[]).includes(v)) throw new HttpError(`Parametro ${name} non valido`, 400);
    return v as T;
  };
  const archivedRaw = params.get("archived");
  if (archivedRaw !== null && archivedRaw !== "" && archivedRaw !== "true" && archivedRaw !== "false") throw new HttpError("Parametro archived non valido", 400);
  const pageRaw = params.get("page");
  const page = pageRaw === null || pageRaw === "" ? undefined : Number(pageRaw);
  if (page !== undefined && (!Number.isInteger(page) || page < 1)) throw new HttpError("Parametro page non valido", 400);
  const date = (name: string) => {
    const v = params.get(name);
    if (v === null || v === "") return undefined;
    if (!isValidIsoDate(v)) throw new HttpError(`Parametro ${name} non valido (AAAA-MM-GG)`, 400);
    return v;
  };
  const from = date("from");
  const to = date("to");
  if (from && to && from > to) throw new HttpError("Il periodo inizia dopo la fine", 400);
  const q = params.get("q")?.trim();
  if (q && q.length > 200) throw new HttpError("Ricerca troppo lunga", 400);
  return {
    templateId: one("templateId", TEMPLATE_IDS),
    stato: one("stato", STATI_ATTIVITA),
    archived: archivedRaw === "true" ? true : archivedRaw === "false" ? false : undefined,
    q: q || undefined,
    scope: one("scope", SCOPES),
    sort: one("sort", SORTS),
    page,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
}

/** Filtro di visibilità; null = nessuna pratica visibile. */
export function visibilityFilter(user: UserDTO, scope: PracticeScope): Filter<PracticeDoc> | null {
  if (user.status !== "active") return null;
  if (user.isAdmin) return {};
  const branches: Filter<PracticeDoc>[] = [];
  for (const t of TEMPLATE_IDS) {
    const mine = membershipsIn(user, t);
    if (mine.length === 0) continue;
    if (scope === "all" || mine.some((m) => m.group === "PM_PERMESSI")) branches.push({ templateId: t });
    else branches.push({ templateId: t, enabledGroups: { $in: [...new Set<GroupId>(mine.map((m) => m.group))] } });
  }
  return branches.length ? { $or: branches } : null;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Filtro dell'elenco (visibilità, archivio, gestore, stato, ricerca); null = nessuna pratica visibile. Usato anche dall'export. */
export function listFilter(user: UserDTO, q: PracticeListQuery): Filter<PracticeDoc> | null {
  const visible = visibilityFilter(user, q.scope ?? "assigned");
  if (!visible) return null;
  const and: Filter<PracticeDoc>[] = [visible, { archived: q.archived ?? false }];
  if (q.templateId) and.push({ templateId: q.templateId as TemplateId });
  if (q.stato) and.push({ "currentSummary.statoAttivita": q.stato });
  // D-129: data di creazione, giorni di Roma con estremi compresi.
  if (q.from) and.push({ createdAt: { $gte: romeTime(q.from, 0, 0) } });
  if (q.to) and.push({ createdAt: { $lt: romeTime(addCalendarDays(q.to, 1), 0, 0) } });
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), "i");
    and.push({ $or: [{ "currentSummary.codiceSito": rx }, { "currentSummary.nomeSito": rx }, { "currentSummary.codiceG7": rx }] });
  }
  return { $and: and };
}

/** Pipeline di ordinamento dell'elenco (open_first: aperte prima, poi updatedAt decrescente). */
export function listOrderStages(sort: PracticeListQuery["sort"] = "open_first"): Document[] {
  const order: Document =
    sort === "created_desc" ? { createdAt: -1, _id: -1 } : sort === "updated_desc" ? { updatedAt: -1, _id: -1 } : { _closed: 1, updatedAt: -1, _id: -1 };
  return [
    ...(sort === "open_first" ? [{ $addFields: { _closed: { $cond: [{ $in: ["$currentSummary.statoAttivita", [...CLOSED_STATI]] }, 1, 0] } } }] : []),
    { $sort: order },
  ];
}

export async function listPractices(db: Db, user: UserDTO, q: PracticeListQuery): Promise<PracticeListResponse> {
  const page = q.page ?? 1;
  const pageSize = PRACTICE_PAGE_SIZE;
  const filter = listFilter(user, q);
  if (!filter) return { items: [], total: 0, page, pageSize };
  const pipeline: Document[] = [{ $match: filter }, ...listOrderStages(q.sort), { $skip: (page - 1) * pageSize }, { $limit: pageSize }, { $project: { _closed: 0 } }];
  const [total, docs] = await Promise.all([
    store.practices(db).countDocuments(filter),
    store.practices(db).aggregate<PracticeDoc>(pipeline).toArray(),
  ]);
  return { items: docs.map(toSummaryDTO), total, page, pageSize };
}
