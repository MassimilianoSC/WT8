import {
  STATI_ATTIVITA,
  TEMPLATE_IDS,
  type IsoDate,
  type PracticeListQuery,
  type PracticeScope,
  type PracticeSort,
  type StatoAttivita,
  type TemplateId,
} from "@/lib/contract";

/**
 * The practice list's filters in the address, so a filtered list can be
 * shared with a link and the assistant's LIST sources open the same view.
 * Defaults are left out; unknown or malformed values are ignored.
 *
 *   /pratiche?template=ILIAD&stato=ASSEGNATO&q=Roma&da=2026-10-01&a=2026-10-31&tutte=1&ordine=created_desc
 */

export interface ListFilters {
  templateId?: TemplateId;
  stato?: StatoAttivita;
  q?: string;
  from?: IsoDate;
  to?: IsoDate;
  scope: PracticeScope;
  sort: PracticeSort;
}

export const SORTS: readonly PracticeSort[] = ["open_first", "updated_desc", "created_desc"];

export function defaultSort(archive: boolean): PracticeSort {
  return archive ? "updated_desc" : "open_first";
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A real "YYYY-MM-DD" day, or undefined. */
export function validDay(v: string | null): IsoDate | undefined {
  if (!v || !ISO_DAY.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : undefined;
}

export function oneOf<T extends string>(values: readonly T[], v: string | null): T | undefined {
  return v !== null && (values as readonly string[]).includes(v) ? (v as T) : undefined;
}

export type ParamsLike = { get(name: string): string | null };

export function filtersFromParams(params: ParamsLike, archive: boolean): ListFilters {
  let from = validDay(params.get("da"));
  let to = validDay(params.get("a"));
  // A reversed range is not a filter the page can show: drop it.
  if (from && to && from > to) from = to = undefined;
  const q = params.get("q")?.trim();
  return {
    templateId: oneOf(TEMPLATE_IDS, params.get("template")),
    stato: oneOf(STATI_ATTIVITA, params.get("stato")),
    q: q ? q.slice(0, 200) : undefined,
    from,
    to,
    // The archive has no "assigned" switch.
    scope: !archive && params.get("tutte") === "1" ? "all" : "assigned",
    sort: oneOf(SORTS, params.get("ordine")) ?? defaultSort(archive),
  };
}

export function filtersToParams(f: ListFilters, archive: boolean): URLSearchParams {
  const p = new URLSearchParams();
  if (f.templateId) p.set("template", f.templateId);
  if (f.stato) p.set("stato", f.stato);
  if (f.q?.trim()) p.set("q", f.q.trim());
  if (f.from) p.set("da", f.from);
  if (f.to) p.set("a", f.to);
  if (!archive && f.scope === "all") p.set("tutte", "1");
  if (f.sort !== defaultSort(archive)) p.set("ordine", f.sort);
  return p;
}

/** Link to the list (or the archive) showing exactly this query. Page is not carried. */
export function listHref(query: PracticeListQuery): string {
  const archive = !!query.archived;
  const qs = filtersToParams(
    {
      templateId: query.templateId,
      stato: query.stato,
      q: query.q,
      from: query.from,
      to: query.to,
      scope: query.scope ?? "assigned",
      sort: query.sort ?? defaultSort(archive),
    },
    archive
  ).toString();
  const base = archive ? "/pratiche/archivio" : "/pratiche";
  return qs ? `${base}?${qs}` : base;
}
