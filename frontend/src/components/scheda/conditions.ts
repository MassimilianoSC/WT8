import type { ConditionDTO, FieldValue, SelectValue, TemplateDTO } from "@/lib/contract";

/**
 * Interface conditions (D-31): they only decide whether an occurrence is
 * shown. The backend re-checks them on write; a hidden value stays stored.
 * Pure module: no React, no I/O.
 */

type Values = Record<string, FieldValue | undefined>;

export interface ConditionContext {
  /** Non-repeatable values of the practice, keyed by flowId. */
  values: Values;
  /** Rows of every repeat group, keyed by repeat-group key (Vincoli rows carry `constraint`). */
  repeats?: Record<string, ReadonlyArray<{ values: Values; constraint?: { stato: SelectValue | null } }> | undefined>;
  /** Repeat-group row the occurrence is rendered in, if any. */
  row?: { repeat: string; values: Values };
  /** flowId → key of the repeat group it belongs to (see buildRepeatIndex). */
  repeatOf: ReadonlyMap<string, string>;
}

/** flowId → repeat-group key, from the template's repeat groups. */
export function buildRepeatIndex(template: Pick<TemplateDTO, "repeatGroups">): Map<string, string> {
  const index = new Map<string, string>();
  for (const g of template.repeatGroups) {
    for (const flowId of g.flowIds) index.set(flowId, g.key);
  }
  return index;
}

/** Whether a value counts as compiled: null, blank text, empty lists and an
 *  empty code are empty. Anything else of unknown shape counts as empty. */
export function isFilled(value: FieldValue | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.some((v) => isFilled(v));
  if ("code" in value) return value.code.trim() !== "";
  return false;
}

/** Codes a value can be compared with: list codes, plain text, numbers. */
export function codesOf(value: FieldValue | undefined): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "string") return value.trim() === "" ? [] : [value];
  if (typeof value === "number") return Number.isFinite(value) ? [String(value)] : [];
  if (Array.isArray(value)) return value.map((v) => v.code).filter((c) => c !== "");
  if ("code" in value) return value.code === "" ? [] : [value.code];
  return [];
}

/**
 * Values a flowId stands for, from the occurrence's point of view:
 * - same repeat group as the current row → that row only (v0.1.1);
 * - another repeat group, or a repeatable flowId cited by a non-repeatable
 *   field → one value per row of that group (v0.1.5);
 * - otherwise → the practice's non-repeatable value.
 */
function lookup(flowId: string, ctx: ConditionContext): Array<FieldValue | undefined> {
  const repeat = ctx.repeatOf.get(flowId);
  if (repeat === undefined) return [ctx.values[flowId]];
  if (ctx.row?.repeat === repeat) return [ctx.row.values[flowId]];
  // The Vincoli container stands for the state of each constraint (v0.1.7).
  return (ctx.repeats?.[repeat] ?? []).map((r) => (r.constraint ? r.constraint.stato : r.values[flowId]));
}

/** Evaluates a condition; `null`/`undefined` means always visible. */
export function isVisible(condition: ConditionDTO | null | undefined, ctx: ConditionContext): boolean {
  if (!condition) return true;
  if ("all" in condition) return condition.all.every((c) => isVisible(c, ctx));
  if ("any" in condition) return condition.any.some((c) => isVisible(c, ctx));

  // Over several rows the positive form (FILLED, EQ/IN) needs at least one
  // row; its negation (EMPTY, NEQ) means "no row" (v0.1.5).
  const candidates = lookup(condition.flowId, ctx);
  switch (condition.op) {
    case "FILLED":
      return candidates.some(isFilled);
    case "EMPTY":
      return !candidates.some(isFilled);
    case "EQ":
    case "NEQ":
    case "IN": {
      const expected = Array.isArray(condition.value) ? condition.value : [condition.value];
      // MULTISELECT: true when at least one selected code matches.
      const match = candidates.some((v) => codesOf(v).some((c) => expected.includes(c)));
      return condition.op === "NEQ" ? !match : match;
    }
    default:
      return true;
  }
}
