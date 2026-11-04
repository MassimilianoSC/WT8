import { addDays, format, startOfMonth, subMonths, subYears } from "date-fns";
import { TEMPLATE_IDS, type IsoDate, type TemplateId } from "@/lib/contract";
import { oneOf, validDay, type ParamsLike } from "@/components/pratiche/list-url";

/**
 * Filters of Andamento in the address (UX note §2), so a manager bookmarks the
 * view. Same names as Statistiche (template, da, a) plus passo and confronto.
 * Unlike Statistiche the page writes them back on every change.
 *
 *   /andamento?template=ILIAD&da=2025-10-01&a=2026-09-30&passo=mese&confronto=anno
 */

export type Passo = "settimana" | "mese";
export type Confronto = "precedente" | "anno";

export interface AndamentoFilters {
  /** null = every client. */
  templateId: TemplateId | null;
  from: IsoDate;
  to: IsoDate;
  passo: Passo;
  confronto: Confronto;
}

/** More weekly buckets than this are unreadable: the page proposes Mese (UX note §2). */
export const MAX_WEEKS = 26;

const iso = (d: Date) => format(d, "yyyy-MM-dd") as IsoDate;

/** Default: every client, the last 12 months, by month, against the previous period. */
export function defaultFilters(today = new Date()): AndamentoFilters {
  return { templateId: null, from: iso(startOfMonth(subMonths(today, 11))), to: iso(today), passo: "mese", confronto: "precedente" };
}

/** Invalid values are dropped for the default, as in stats-url.ts. */
export function filtersFromParams(params: ParamsLike, today = new Date()): AndamentoFilters {
  const d = defaultFilters(today);
  const from = validDay(params.get("da"));
  const to = validDay(params.get("a"));
  const ordered = !(from && to && from > to);
  return {
    templateId: oneOf(TEMPLATE_IDS, params.get("template")) ?? null,
    from: (ordered && from) || d.from,
    to: (ordered && to) || d.to,
    passo: oneOf(["settimana", "mese"] as const, params.get("passo")) ?? d.passo,
    confronto: oneOf(["precedente", "anno"] as const, params.get("confronto")) ?? d.confronto,
  };
}

/** The address of a view; defaults are left out so a plain /andamento stays plain. */
export function andamentoHref(f: AndamentoFilters, today = new Date()): string {
  const d = defaultFilters(today);
  const p = new URLSearchParams();
  if (f.templateId) p.set("template", f.templateId);
  if (f.from !== d.from || f.to !== d.to) {
    p.set("da", f.from);
    p.set("a", f.to);
  }
  if (f.passo !== d.passo) p.set("passo", f.passo);
  if (f.confronto !== d.confronto) p.set("confronto", f.confronto);
  const qs = p.toString();
  return `/andamento${qs ? `?${qs}` : ""}`;
}

export type Preset = "mese" | "trimestre" | "anno";

/** Period buttons: they write da/a, ending today. */
export function presetRange(preset: Preset, today = new Date()): { from: IsoDate; to: IsoDate } {
  const to = iso(today);
  if (preset === "mese") return { from: iso(addDays(subMonths(today, 1), 1)), to };
  if (preset === "trimestre") return { from: iso(addDays(subMonths(today, 3), 1)), to };
  return { from: iso(addDays(subYears(today, 1), 1)), to };
}

/** Number of weekly buckets of a period (rounded up). */
export function weeksIn(from: IsoDate, to: IsoDate): number {
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
  return Math.ceil(days / 7);
}
