import { apiFetch } from "@/lib/client";
import type {
  FieldChange,
  FieldChangeRequest,
  FieldChangeResponse,
  HistoryResponse,
  HistoryView,
  PraticaDetailDTO,
  TemplateDTO,
  TemplateId,
} from "@/lib/contract";
import { loadCatalog, optionsOf } from "@/components/scheda/lists-source";
import type { Option } from "@/components/scheda/fields/format";

/**
 * Data access of the practice sheet: templates (GET /api/templates/{id}, B2),
 * practice, iterations, saves and history (contract §5).
 */

const templateCache = new Map<string, Promise<TemplateDTO>>();

/** TemplateDTO from the route, cached per id and version for the session. */
export function fetchTemplate(id: TemplateId, version?: string): Promise<TemplateDTO> {
  const key = `${id}@${version ?? "current"}`;
  let p = templateCache.get(key);
  if (!p) {
    const qs = version ? `?version=${encodeURIComponent(version)}` : "";
    p = apiFetch<TemplateDTO>(`/api/templates/${id}${qs}`);
    p.catch(() => templateCache.delete(key));
    templateCache.set(key, p);
  }
  return p;
}

// ─── Practice ───────────────────────────────────────────────────────────────

export async function loadSheet(id: string): Promise<{ template: TemplateDTO; practice: PraticaDetailDTO }> {
  const practice = await apiFetch<PraticaDetailDTO>(`/api/practices/${encodeURIComponent(id)}`);
  // Each iteration is read with its own template version (v0.1.7).
  const template = await fetchTemplate(practice.templateId, practice.templateVersion);
  return { template, practice };
}

/** A past iteration: always read-only (D-25, v0.1.7 §5.1). */
export async function loadIteration(id: string, n: number): Promise<PraticaDetailDTO> {
  return apiFetch<PraticaDetailDTO>(`/api/practices/${encodeURIComponent(id)}/iterations/${n}`);
}

export async function reloadPractice(id: string): Promise<PraticaDetailDTO> {
  return (await loadSheet(id)).practice;
}

/** PATCH /fields with the revision read (409 if someone saved meanwhile). */
export async function saveFields(practice: PraticaDetailDTO, changes: FieldChange[]): Promise<FieldChangeResponse> {
  const body: FieldChangeRequest = { iteration: practice.iteration, revision: practice.revision, changes };
  return apiFetch<FieldChangeResponse>(`/api/practices/${encodeURIComponent(practice.id)}/fields`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

// ─── History ────────────────────────────────────────────────────────────────

/** view: fields = value history, events = timeline (v0.1.7). */
export async function loadHistory(id: string, iteration: number, page: number, view: HistoryView): Promise<HistoryResponse> {
  const params = new URLSearchParams({ iteration: String(iteration), page: String(page), view });
  return apiFetch<HistoryResponse>(`/api/practices/${encodeURIComponent(id)}/history?${params.toString()}`);
}

// ─── Lists ──────────────────────────────────────────────────────────────────

/** Active items of a list as options, from the real lists (B6).
 *  templateId null = common lists (creation: CLIENTE_FINALE, COMMITTENTE). */
export async function loadListOptions(listId: string, templateId: TemplateId | null): Promise<Option[]> {
  const catalog = await loadCatalog(templateId);
  return optionsOf(catalog.get(listId)).filter((o) => !o.inactive);
}
