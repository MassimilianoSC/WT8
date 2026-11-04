import { GROUP_IDS, TEMPLATE_IDS, type GroupId, type IsoDate, type StatsQuery, type TemplateId } from "@/lib/contract";
import { oneOf, validDay, type ParamsLike } from "@/components/pratiche/list-url";

/**
 * What Statistiche reads from the address, so the assistant's STATS and
 * WORKLOAD sources open the right view. Read only: the page does not write
 * back. Access is still checked by the view (templates and groups allowed).
 *
 *   /statistiche?template=ILIAD&da=2026-10-01&a=2026-10-31
 *   /statistiche?vista=carichi&template=ILIAD&gruppo=UT_PE
 */

export interface StatsInitial {
  tab?: "stats" | "workload";
  templateId?: TemplateId;
  from?: IsoDate;
  to?: IsoDate;
  group?: GroupId;
}

export function statsInitialFromParams(params: ParamsLike): StatsInitial {
  const from = validDay(params.get("da"));
  const to = validDay(params.get("a"));
  const ordered = !(from && to && from > to);
  const out: StatsInitial = {};
  const vista = params.get("vista");
  if (vista === "carichi") out.tab = "workload";
  else if (vista === "statistiche") out.tab = "stats";
  const templateId = oneOf(TEMPLATE_IDS, params.get("template"));
  if (templateId) out.templateId = templateId;
  if (ordered && from) out.from = from;
  if (ordered && to) out.to = to;
  const group = oneOf(GROUP_IDS, params.get("gruppo"));
  if (group) out.group = group;
  return out;
}

/** From a server page's searchParams (first value of each). */
export function paramsOf(searchParams: Record<string, string | string[] | undefined>): ParamsLike {
  return {
    get: (name) => {
      const v = searchParams[name];
      return (Array.isArray(v) ? v[0] : v) ?? null;
    },
  };
}

export function statsHref(q: StatsQuery): string {
  const p = new URLSearchParams();
  if (q.templateId) p.set("template", q.templateId);
  if (q.from) p.set("da", q.from);
  if (q.to) p.set("a", q.to);
  const qs = p.toString();
  return qs ? `/statistiche?${qs}` : "/statistiche";
}

export function workloadHref(q: { templateId: TemplateId; group?: GroupId }): string {
  const p = new URLSearchParams({ vista: "carichi", template: q.templateId });
  if (q.group) p.set("gruppo", q.group);
  return `/statistiche?${p.toString()}`;
}
