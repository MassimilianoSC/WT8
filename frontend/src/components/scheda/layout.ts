import {
  GROUP_IDS,
  type FieldOccurrenceDTO,
  type FieldValue,
  type GroupId,
  type PopupRefDTO,
  type RepeatGroupDTO,
  type RepeatRowDTO,
  type SectionDTO,
  type TemplateDTO,
} from "@/lib/contract";
import { isFilled, isVisible } from "@/components/scheda/conditions";

/**
 * Pure structure of the practice sheet: groups → sections → blocks, in
 * template order. Visibility is not applied here (it depends on the values).
 */

export type Block =
  | { kind: "fields"; occurrences: FieldOccurrenceDTO[] }
  | { kind: "repeat"; repeat: RepeatGroupDTO; occurrences: FieldOccurrenceDTO[] }
  | { kind: "popup"; popup: PopupRefDTO; blocks: Block[] };

export interface SectionView {
  section: SectionDTO;
  blocks: Block[];
  /** Every occurrence of the section, flat and ordered. */
  occurrences: FieldOccurrenceDTO[];
}

export interface GroupView {
  group: GroupId;
  sections: SectionView[];
}

/** Consecutive occurrences sharing a repeat group become one repeat block. */
function repeatRuns(occurrences: FieldOccurrenceDTO[], repeats: ReadonlyMap<string, RepeatGroupDTO>): Block[] {
  const blocks: Block[] = [];
  for (const o of occurrences) {
    const last = blocks[blocks.length - 1];
    const repeat = o.repeatGroup ? repeats.get(o.repeatGroup) : undefined;
    if (repeat) {
      if (last?.kind === "repeat" && last.repeat.key === repeat.key) last.occurrences.push(o);
      else blocks.push({ kind: "repeat", repeat, occurrences: [o] });
    } else if (last?.kind === "fields") {
      last.occurrences.push(o);
    } else {
      blocks.push({ kind: "fields", occurrences: [o] });
    }
  }
  return blocks;
}

/** Consecutive occurrences sharing a pop-up become one pop-up block (which
 *  may itself contain repeat blocks); the rest is split into repeat runs. */
export function buildBlocks(occurrences: FieldOccurrenceDTO[], repeats: ReadonlyMap<string, RepeatGroupDTO>): Block[] {
  const runs: Array<{ popup?: PopupRefDTO; items: FieldOccurrenceDTO[] }> = [];
  for (const o of occurrences) {
    const last = runs[runs.length - 1];
    const key = o.popup?.key;
    if (last && last.popup?.key === key) last.items.push(o);
    else runs.push({ popup: o.popup, items: [o] });
  }
  return runs.flatMap((run): Block[] =>
    run.popup ? [{ kind: "popup", popup: run.popup, blocks: repeatRuns(run.items, repeats) }] : repeatRuns(run.items, repeats)
  );
}

export function buildSheet(
  sections: SectionDTO[],
  occurrences: FieldOccurrenceDTO[],
  repeatGroups: RepeatGroupDTO[]
): GroupView[] {
  const repeats = new Map(repeatGroups.map((r) => [r.key, r]));
  const bySection = new Map<string, FieldOccurrenceDTO[]>();
  for (const o of occurrences) {
    if (!o.flowId) continue; // transversal fields live in their own panel
    const list = bySection.get(o.sectionKey) ?? [];
    list.push(o);
    bySection.set(o.sectionKey, list);
  }

  const ordered = [...sections].sort((a, b) => a.order - b.order);
  return GROUP_IDS.map((group) => ({
    group,
    sections: ordered
      .filter((s) => s.group === group)
      .map((section) => {
        const items = (bySection.get(section.key) ?? []).sort((a, b) => a.order - b.order);
        return { section, occurrences: items, blocks: buildBlocks(items, repeats) };
      }),
  })).filter((g) => g.sections.length > 0);
}

export function buildSheetFromTemplate(template: TemplateDTO): GroupView[] {
  return buildSheet(template.sections, template.occurrences, template.repeatGroups);
}

/** Sections open at first: all those of the user's own groups. */
export function defaultOpenSections(groups: GroupView[], myGroups: GroupId[]): string[] {
  return groups.filter((g) => myGroups.includes(g.group)).flatMap((g) => g.sections.map((s) => s.section.key));
}

export interface SheetValues {
  values: Record<string, FieldValue | undefined>;
  repeats: Record<string, RepeatRowDTO[] | undefined>;
  repeatOf: ReadonlyMap<string, string>;
}

/**
 * Local compilation counter of a section, same rule as the backend's
 * progress (v0.1.7): visible MASTER occurrences, no mirrors, no computed
 * fields that cannot be overridden; a repeatable MASTER counts once per row;
 * Vincoli rows count as compiled when their state is set.
 */
export function sectionProgress(view: SectionView, data: SheetValues): { filled: number; total: number } {
  let filled = 0;
  let total = 0;
  for (const o of view.occurrences) {
    if (o.kind !== "MASTER" || !o.flowId) continue;
    if (o.computed && !o.computed.manualOverride) continue;
    if (o.repeatGroup) {
      for (const row of data.repeats[o.repeatGroup] ?? []) {
        const ctx = { ...data, row: { repeat: o.repeatGroup, values: row.values } };
        if (!isVisible(o.condition, ctx)) continue;
        total += 1;
        if (isFilled(row.constraint ? row.constraint.stato : row.values[o.flowId])) filled += 1;
      }
    } else {
      if (!isVisible(o.condition, data)) continue;
      total += 1;
      if (isFilled(data.values[o.flowId])) filled += 1;
    }
  }
  return { filled, total };
}

/** The template's Incarico / Lavorazione field (list INCARICO), parent of the tree conditions (D-207). */
export function treeFlowId(template: Pick<TemplateDTO, "occurrences">): string | null {
  return template.occurrences.find((o) => o.kind === "MASTER" && o.list?.listId === "INCARICO")?.flowId ?? null;
}

function cites(condition: FieldOccurrenceDTO["condition"], flowId: string): boolean {
  if (!condition) return false;
  if ("all" in condition) return condition.all.some((c) => cites(c, flowId));
  if ("any" in condition) return condition.any.some((c) => cites(c, flowId));
  return condition.flowId === flowId;
}

/**
 * D-207 (Q3): a section disappears when every occurrence is hidden and at least one is hidden by a condition on
 * Incarico / Lavorazione. A section emptied only by other conditions stays, with its 0/n counter (D-122).
 */
export function sectionHiddenByTree(view: SectionView, data: SheetValues, flowId: string | null): boolean {
  if (!flowId || view.occurrences.length === 0) return false;
  if (!view.occurrences.some((o) => cites(o.condition, flowId))) return false;
  return view.occurrences.every((o) => !isVisible(o.condition, data));
}

/** The sheet without the sections removed by the tree; groups left empty disappear too. */
export function visibleTree(groups: GroupView[], data: SheetValues, flowId: string | null): GroupView[] {
  if (!flowId) return groups;
  return groups
    .map((g) => ({ ...g, sections: g.sections.filter((s) => !sectionHiddenByTree(s, data, flowId)) }))
    .filter((g) => g.sections.length > 0);
}
