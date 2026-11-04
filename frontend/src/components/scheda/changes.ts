import type { FieldChange, FieldOccurrenceDTO, FieldValue, PraticaDetailDTO, RepeatRowDTO } from "@/lib/contract";

/**
 * Local, not-yet-saved edits of the sheet. Value edits are buffered by target
 * (last edit wins) and replayed on top of the practice: after a save, or after
 * a 409 reload, the pending edits survive (contract v0.1.4, R5).
 * Row structure (ADD_ROW / REMOVE_ROW) is not buffered: it is sent at once.
 */

export type ValueChange = Exclude<FieldChange, { op: "ADD_ROW" } | { op: "REMOVE_ROW" }>;

export function isRowOp(c: FieldChange): c is Extract<FieldChange, { op: "ADD_ROW" } | { op: "REMOVE_ROW" }> {
  return "op" in c;
}

type ConstraintChange = Extract<ValueChange, { constraint: unknown }>;

/** Identity of the value a change targets. */
export function changeKey(c: ValueChange): string {
  if ("transversal" in c) return c.transversal === "noteOperative" ? `T:noteOperative:${c.group}` : `T:${c.transversal}`;
  if ("constraint" in c) return `V:${c.rowId}`;
  if ("repeat" in c) return `R:${c.repeat}:${c.rowId}:${c.flowId}`;
  return `F:${c.flowId}`;
}

function savedConstraint(p: PraticaDetailDTO, c: ConstraintChange) {
  return p.repeats[c.repeat]?.find((r) => r.rowId === c.rowId)?.constraint;
}

/** A Vincoli edit equals the saved row when every field it sets is unchanged. */
function constraintUnchanged(p: PraticaDetailDTO, c: ConstraintChange): boolean {
  const saved = savedConstraint(p, c);
  return (Object.keys(c.constraint) as Array<"stato" | "ente">).every((k) => same(saved?.[k], c.constraint[k]));
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Fatturabile: clicking the current value is still a decision (D-131, D-137
 * A-03: NO → NO too) when the value is automatic or a FATTURABILE_KO episode
 * is open; only then the edit is not "back to the saved value".
 */
function unchanged(p: PraticaDetailDTO, c: Exclude<ValueChange, ConstraintChange>): boolean {
  if (!same(currentValue(p, c), c.value)) return false;
  if (!("transversal" in c) || c.transversal !== "fatturabile") return true;
  const koOpen = p.alerts.some((a) => a.rule === "FATTURABILE_KO" && a.status === "OPEN");
  return p.transversal.fatturabileManual && !koOpen;
}

function currentValue(p: PraticaDetailDTO, c: Exclude<ValueChange, ConstraintChange>): unknown {
  if ("transversal" in c) return c.transversal === "noteOperative" ? p.transversal.noteOperative[c.group] ?? "" : p.transversal[c.transversal];
  if ("repeat" in c) return p.repeats[c.repeat]?.find((r) => r.rowId === c.rowId)?.values[c.flowId];
  return p.values[c.flowId];
}

/** Adds an edit to the pending map; an edit back to the saved value drops it. */
export function addPending(
  pending: ReadonlyMap<string, ValueChange>,
  saved: PraticaDetailDTO,
  change: ValueChange
): Map<string, ValueChange> {
  const next = new Map(pending);
  const key = changeKey(change);
  if ("constraint" in change) {
    // Stato and ente of one row are edited separately but sent together.
    const prev = next.get(key) as ConstraintChange | undefined;
    const merged: ConstraintChange = { ...change, constraint: { ...prev?.constraint, ...change.constraint } };
    if (constraintUnchanged(saved, merged)) next.delete(key);
    else next.set(key, merged);
    return next;
  }
  if (unchanged(saved, change)) next.delete(key);
  else next.set(key, change);
  return next;
}

/** Pending edits whose target no longer exists (e.g. a row removed by
 *  someone else) are dropped instead of being replayed. */
export function prunePending(pending: ReadonlyMap<string, ValueChange>, saved: PraticaDetailDTO): Map<string, ValueChange> {
  const next = new Map<string, ValueChange>();
  pending.forEach((c, key) => {
    if ("repeat" in c && !saved.repeats[c.repeat]?.some((r) => r.rowId === c.rowId)) return;
    if ("constraint" in c) {
      if (!constraintUnchanged(saved, c)) next.set(key, c);
    } else if (!unchanged(saved, c)) next.set(key, c);
  });
  return next;
}

/** The practice as the user sees it: saved data + pending edits. Pure. */
export function applyPending(saved: PraticaDetailDTO, pending: ReadonlyMap<string, ValueChange>): PraticaDetailDTO {
  if (pending.size === 0) return saved;
  const values: Record<string, FieldValue> = { ...saved.values };
  const repeats: Record<string, RepeatRowDTO[]> = { ...saved.repeats };
  const transversal = { ...saved.transversal };

  pending.forEach((c) => {
    if ("transversal" in c) {
      if (c.transversal === "noteOperative") transversal.noteOperative = { ...transversal.noteOperative, [c.group]: c.value };
      else if (c.transversal === "fatturabile") {
        transversal.fatturabile = c.value;
        transversal.fatturabileManual = true;
      } else transversal.fatturato = c.value;
    } else if ("constraint" in c) {
      const patch = c.constraint;
      repeats[c.repeat] = (repeats[c.repeat] ?? []).map((r) =>
        r.rowId === c.rowId && r.constraint ? { ...r, constraint: { ...r.constraint, ...patch } } : r
      );
    } else if ("repeat" in c) {
      repeats[c.repeat] = (repeats[c.repeat] ?? []).map((r) =>
        r.rowId === c.rowId ? { ...r, values: { ...r.values, [c.flowId]: c.value } } : r
      );
    } else {
      values[c.flowId] = c.value;
    }
  });
  return { ...saved, values, repeats, transversal };
}

/**
 * Cascades (ISTAT Regione → Provincia → Comune, any list with parentFlowId):
 * changing or clearing a parent clears its children in the SAME save, since
 * the server refuses an inconsistent cascade and never clears on its own
 * (D-132). Setting the parent back to its saved value drops those clears.
 */
export function addPendingWithCascade(
  pending: ReadonlyMap<string, ValueChange>,
  saved: PraticaDetailDTO,
  change: ValueChange,
  occurrences: FieldOccurrenceDTO[]
): Map<string, ValueChange> {
  let next = addPending(pending, saved, change);
  if (!("flowId" in change) || "constraint" in change) return next;
  const row = "repeat" in change ? { repeat: change.repeat, rowId: change.rowId } : null;
  const parentReverted = !next.has(changeKey(change));

  const clearChildren = (parentFlowId: string) => {
    for (const child of occurrences) {
      if (child.kind !== "MASTER" || !child.flowId || child.list?.parentFlowId !== parentFlowId) continue;
      const clear: ValueChange = row
        ? { occurrenceKey: child.occurrenceKey, repeat: row.repeat, rowId: row.rowId, flowId: child.flowId, value: null }
        : { occurrenceKey: child.occurrenceKey, flowId: child.flowId, value: null };
      const key = changeKey(clear);
      if (parentReverted) {
        // Back to the saved parent: forget the clears the cascade had added.
        if (next.get(key) && (next.get(key) as { value?: unknown }).value === null) next.delete(key);
      } else {
        next = addPending(next, saved, clear);
      }
      clearChildren(child.flowId);
    }
  };
  clearChildren(change.flowId);
  return next;
}
