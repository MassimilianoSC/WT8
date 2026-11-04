/**
 * Avanzamento per gruppo (contratto v0.1.7, §5.1). PURO.
 * total = occorrenze MASTER del gruppo visibili per condizione, esclusi mirror, trasversali e calcolati con
 * manualOverride = false; nei gruppi ripetibili conta ogni riga esistente (nessuna riga = nessun contributo);
 * VINCOLI conta le sue righe (compilata = stato presente). filled = di queste, quelle non vuote (D-110).
 */
import { GROUP_IDS, type GroupId, type GroupProgressDTO, type TemplateDTO } from "@/lib/contract";
import { evaluateCondition, isEmpty, repeatIndex } from "@/lib/engines/conditions";
import type { EngineSnapshot } from "@/lib/engines/formulas";

export function computeProgress(t: TemplateDTO, s: Pick<EngineSnapshot, "values" | "repeats">): Record<GroupId, GroupProgressDTO> {
  const out = Object.fromEntries(GROUP_IDS.map((g) => [g, { filled: 0, total: 0 }])) as Record<GroupId, GroupProgressDTO>;
  const repeatOf = repeatIndex(t);
  const base = { values: s.values, repeats: s.repeats, repeatOf };
  for (const o of t.occurrences) {
    if (o.kind !== "MASTER" || !o.flowId) continue;
    if (o.computed && !o.computed.manualOverride) continue;
    const p = out[o.ownerGroup];
    const group = o.repeatGroup;
    if (!group) {
      if (!evaluateCondition(o.condition, base)) continue;
      p.total++;
      if (!isEmpty(s.values[o.flowId])) p.filled++;
      continue;
    }
    for (const row of s.repeats[group] ?? []) {
      if (group === "VINCOLI") {
        p.total++;
        if (!isEmpty(row.constraint?.stato ?? null)) p.filled++;
        continue;
      }
      if (!evaluateCondition(o.condition, { ...base, row: { repeat: group, values: row.values } })) continue;
      p.total++;
      if (!isEmpty(row.values[o.flowId])) p.filled++;
    }
  }
  return out;
}
