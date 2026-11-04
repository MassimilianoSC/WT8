import { apiFetch } from "@/lib/client";
import type {
  PraticaSummaryDTO,
  PracticeListQuery,
  PracticeListResponse,
  TemplateId,
  TemplateSummaryDTO,
} from "@/lib/contract";

/** GET /api/templates (B2). */
export async function listTemplates(): Promise<TemplateSummaryDTO[]> {
  return apiFetch<TemplateSummaryDTO[]>("/api/templates");
}

export async function listPratiche(query: PracticeListQuery): Promise<PracticeListResponse> {
  const params = new URLSearchParams();
  if (query.templateId) params.set("templateId", query.templateId);
  if (query.stato) params.set("stato", query.stato);
  // Always explicit: the main list never depends on the backend's default.
  params.set("archived", String(query.archived ?? false));
  if (query.q) params.set("q", query.q);
  if (query.scope) params.set("scope", query.scope);
  if (query.sort) params.set("sort", query.sort);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  params.set("page", String(query.page ?? 1));
  return apiFetch<PracticeListResponse>(`/api/practices?${params.toString()}`);
}

/**
 * Practices of a client with the same Codice G7, Codice Sito and Nome Sito,
 * archived ones included (D-157: a duplicate stays allowed, G7 is not unique
 * D-24, but creating one must be a conscious choice). Searched through the
 * list (q = G7, every practice of the client), then matched exactly.
 */
export async function findDuplicates(
  templateId: TemplateId,
  key: { codiceG7: string; codiceSito: string; nomeSito: string }
): Promise<PraticaSummaryDTO[]> {
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  const pages = await Promise.all(
    [false, true].map((archived) => listPratiche({ templateId, q: key.codiceG7.trim(), scope: "all", archived }))
  );
  return pages
    .flatMap((p) => p.items)
    .filter(
      (p) =>
        (p.codiceG7 ?? "").trim() === key.codiceG7.trim() &&
        norm(p.codiceSito) === norm(key.codiceSito) &&
        norm(p.nomeSito) === norm(key.nomeSito)
    );
}
