/**
 * TEST FIXTURE: the template of a practice from GET /api/templates/{id} (served
 * by serveTemplates in the tests). The fixtures use this instead of
 * sheet-source.fetchTemplate so that mocking sheet-source never imports itself.
 */
import { apiFetch } from "@/lib/client";
import type { TemplateDTO, TemplateId } from "@/lib/contract";

export function fixtureTemplate(id: TemplateId): Promise<TemplateDTO> {
  return apiFetch<TemplateDTO>(`/api/templates/${id}`);
}
