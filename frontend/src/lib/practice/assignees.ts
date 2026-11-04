/**
 * Persone che compaiono nei campi utente (USER/USERS, D-39) di un'iterazione. PURO. Serve a statistiche e carichi
 * di lavoro (contratto §9, §10). "Nessuno" non conta; contano anche i campi nascosti per condizione (D-31) e le
 * righe dei gruppi ripetibili.
 */
import { NONE_CODE, type FieldOccurrenceDTO, type FieldValue, type RoleId, type TemplateDTO } from "@/lib/contract";

export function userFields(t: Pick<TemplateDTO, "occurrences">): FieldOccurrenceDTO[] {
  return t.occurrences.filter((o) => o.kind === "MASTER" && o.flowId && (o.dataType === "USER" || o.dataType === "USERS"));
}

const codesOf = (v: FieldValue | undefined): string[] => {
  if (!v || typeof v !== "object") return [];
  return (Array.isArray(v) ? v : [v]).map((x) => x.code).filter((c) => c && c !== NONE_CODE);
};

/** userId → ruoli dei campi in cui compare (undefined se il campo non dichiara un ruolo). */
export function assigneesOf(
  t: Pick<TemplateDTO, "occurrences">,
  values: Record<string, FieldValue | undefined>,
  rows: ReadonlyArray<{ groupKey: string; values: Record<string, FieldValue | undefined> }>
): Map<string, Set<RoleId | undefined>> {
  const out = new Map<string, Set<RoleId | undefined>>();
  const add = (userId: string, role: RoleId | undefined) => {
    if (!out.has(userId)) out.set(userId, new Set());
    out.get(userId)!.add(role);
  };
  for (const o of userFields(t)) {
    const sources = o.repeatGroup ? rows.filter((r) => r.groupKey === o.repeatGroup).map((r) => r.values) : [values];
    for (const src of sources) for (const id of codesOf(src[o.flowId!])) add(id, o.list?.userRole);
  }
  return out;
}
