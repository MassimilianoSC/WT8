import { apiFetch } from "@/lib/client";
import type {
  ExportQuery,
  GroupId,
  StatsDTO,
  StatsQuery,
  TemplateId,
  WorkloadItemDTO,
  WorkloadResponse,
} from "@/lib/contract";

/** Statistics (§9), workload (§10) and export URL (§11) of contract v0.2. */

/** The page always sends a period (the backend default is the last 30 days). */
type PeriodQuery = StatsQuery & { from: string; to: string };

export async function loadStats(q: PeriodQuery): Promise<StatsDTO> {
  const params = new URLSearchParams({ from: q.from, to: q.to });
  if (q.templateId) params.set("templateId", q.templateId);
  return apiFetch<StatsDTO>(`/api/stats?${params.toString()}`);
}

export async function loadWorkload(templateId: TemplateId, group?: GroupId): Promise<WorkloadItemDTO[]> {
  const params = new URLSearchParams({ templateId });
  if (group) params.set("group", group);
  return (await apiFetch<WorkloadResponse>(`/api/workload?${params.toString()}`)).items;
}

/** Export URL (§11): templateId is mandatory; same filters as the list. */
export function exportUrl(q: ExportQuery): string {
  const params = new URLSearchParams({ templateId: q.templateId });
  if (q.stato) params.set("stato", q.stato);
  params.set("archived", String(q.archived ?? false));
  if (q.q) params.set("q", q.q);
  if (q.from) params.set("from", q.from);
  if (q.to) params.set("to", q.to);
  // Same scope as the list the user is looking at (v0.3.4).
  if (q.scope) params.set("scope", q.scope);
  return `/api/export?${params.toString()}`;
}

/** Last 30 days up to today (the default period of §9). */
export function defaultPeriod(today = new Date()): { from: string; to: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const from = new Date(today);
  from.setDate(from.getDate() - 30);
  return { from: iso(from), to: iso(today) };
}
