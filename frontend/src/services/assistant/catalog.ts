/**
 * Catalogo semantico delle date (progetto §4.3), dato versionato di o3 in src/data/assistant-date-catalog.json e
 * verificato sui template compilati (tests/server/assistant-date-catalog.test.ts). Una voce per milestone e template.
 */
import raw from "@/data/assistant-date-catalog.json";
import type { GroupId, TemplateId } from "@/lib/contract";

export type DateKind = "FORECAST" | "DEADLINE" | "RECORDED";

export interface DateCatalogEntry {
  semanticId: string;
  templateId: TemplateId;
  flowId: string;
  sectionKey: string;
  repeatGroup?: string;
  dateKind: DateKind;
  completionFlowId?: string;
  businessGroup: GroupId;
  ownerGroup: GroupId;
  label: string;
  sourceDecision: string;
}

const data = raw as unknown as { version: number; entries: DateCatalogEntry[] };

export const DATE_CATALOG_VERSION = data.version;
export const DATE_CATALOG: readonly DateCatalogEntry[] = data.entries;

export function catalogFor(templateId: TemplateId, dateKind?: DateKind): DateCatalogEntry[] {
  return DATE_CATALOG.filter((e) => e.templateId === templateId && (!dateKind || e.dateKind === dateKind));
}

/** Id semantici disponibili per i template dati (per descrivere lo strumento al modello). */
export function semanticIds(templates: readonly TemplateId[], dateKind?: DateKind): string[] {
  return [...new Set(DATE_CATALOG.filter((e) => templates.includes(e.templateId) && (!dateKind || e.dateKind === dateKind)).map((e) => e.semanticId))].sort();
}
