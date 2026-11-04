/**
 * Cosa passa da un'iterazione all'altra (ripresentazione, D-25) e da una pratica alla sua rilavorazione (D-26).
 * PURO. Le regole sono dati (engine-bindings.json → inheritance): sezioni ereditate, gruppi ripetibili e
 * flowId esclusi. Codice G7 non si eredita mai da qui: lo decide il comando. I calcolati non si copiano: li
 * ricalcola il motore delle formule sulla nuova iterazione.
 */
import engineBindings from "@/data/engine-bindings.json";
import type { FieldValue, TemplateDTO, TemplateId } from "@/lib/contract";
import { isEmpty } from "@/lib/engines/conditions";
import { IDENTITY_FLOWS } from "@/lib/store/practice-factory";
import type { RepeatRowDoc } from "@/lib/store/types";

export type InheritanceMode = "resubmit" | "rework";

interface InheritanceRules {
  resubmitSections: string[];
  reworkSections: string[];
  excludedRepeatGroups: string[];
  excludedFlowIds: Record<TemplateId, string[]>;
}
export const INHERITANCE = (engineBindings as unknown as { inheritance: InheritanceRules }).inheritance;

export interface InheritancePlan {
  /** flowId non ripetibili da copiare. */
  flowIds: string[];
  /** Gruppi ripetibili da copiare riga per riga. */
  repeatGroups: string[];
}

const sectionSuffix = (sectionKey: string) => sectionKey.slice(sectionKey.indexOf(".") + 1);

export function inheritancePlan(template: TemplateDTO, mode: InheritanceMode): InheritancePlan {
  const sections = new Set(mode === "resubmit" ? INHERITANCE.resubmitSections : INHERITANCE.reworkSections);
  const excluded = new Set([IDENTITY_FLOWS.codiceG7, ...(INHERITANCE.excludedFlowIds[template.id] ?? [])]);
  const excludedGroups = new Set(["VINCOLI", ...INHERITANCE.excludedRepeatGroups]);
  const flowIds = new Set<string>();
  const groups = new Set<string>();
  for (const o of template.occurrences) {
    if (o.kind !== "MASTER" || !o.flowId || !sections.has(sectionSuffix(o.sectionKey))) continue;
    if (o.computed || excluded.has(o.flowId)) continue;
    if (o.repeatGroup) {
      if (!excludedGroups.has(o.repeatGroup)) groups.add(o.repeatGroup);
    } else flowIds.add(o.flowId);
  }
  return { flowIds: [...flowIds].sort(), repeatGroups: [...groups].sort() };
}

export interface InheritedData {
  /** Solo i valori non vuoti. */
  values: Record<string, FieldValue>;
  rows: Array<{ groupKey: string; ordinal: number; values: Record<string, FieldValue> }>;
}

/** Valori e righe ereditati dall'iterazione d'origine, secondo il piano. Le righe ripartono da ordinal 1. */
export function inherit(
  plan: InheritancePlan,
  source: { values: Record<string, FieldValue>; rows: Pick<RepeatRowDoc, "groupKey" | "ordinal" | "values">[] }
): InheritedData {
  const values: Record<string, FieldValue> = {};
  for (const f of plan.flowIds) if (!isEmpty(source.values[f])) values[f] = source.values[f];
  const rows: InheritedData["rows"] = [];
  for (const g of plan.repeatGroups) {
    const groupRows = source.rows.filter((r) => r.groupKey === g).sort((a, b) => a.ordinal - b.ordinal);
    groupRows.forEach((r, i) => {
      const v: Record<string, FieldValue> = {};
      for (const [k, x] of Object.entries(r.values)) if (!isEmpty(x)) v[k] = x;
      rows.push({ groupKey: g, ordinal: i + 1, values: v });
    });
  }
  return { values, rows };
}
