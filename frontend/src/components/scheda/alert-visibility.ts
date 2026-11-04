import type { ConditionDTO, FieldOccurrenceDTO } from "@/lib/contract";
import { isVisible } from "@/components/scheda/conditions";
import type { GroupView, SectionView, SheetValues } from "@/components/scheda/layout";

/**
 * Where an open alert can be seen (L9). A field may appear in several sections
 * (MASTER + MIRROR) and a condition may hide one of them: "Approvazione AIE"
 * shows in Fase AIE but in Pacchetto Permessi only when AIE = SÌ. One rule for
 * the section counter, the red dot of the side index and "Vai al campo":
 * an alert counts where its field is shown; if it is hidden everywhere it
 * counts in its own section, which says which field to fill to see it.
 * Repeat-group fields show their alerts row by row: never "hidden" here.
 * Pure module: no React, no I/O.
 */

type AlertKeys = { has(flowId: string): boolean };

const inRepeat = (o: FieldOccurrenceDTO, data: SheetValues) => !!o.flowId && data.repeatOf.has(o.flowId);

export function shownHere(o: FieldOccurrenceDTO, data: SheetValues): boolean {
  return inRepeat(o, data) || isVisible(o.condition, data);
}

/** flowIds a condition reads, once each: the fields to fill to show the occurrence. */
export function conditionFlows(c: ConditionDTO | null | undefined): string[] {
  if (!c) return [];
  if ("all" in c) return [...new Set(c.all.flatMap(conditionFlows))];
  if ("any" in c) return [...new Set(c.any.flatMap(conditionFlows))];
  return [c.flowId];
}

/** The section where an occurrence of the field is shown: the preferred one, else the MASTER, else any. */
export function visibleOccurrence(
  flowId: string,
  groups: GroupView[],
  data: SheetValues,
  preferSection?: string
): { occurrence: FieldOccurrenceDTO; section: SectionView } | undefined {
  const shown = groups
    .flatMap((g) => g.sections)
    .flatMap((section) => section.occurrences.filter((o) => o.flowId === flowId && shownHere(o, data)).map((occurrence) => ({ occurrence, section })));
  return (
    shown.find((s) => s.section.section.key === preferSection) ??
    shown.find((s) => s.occurrence.kind === "MASTER") ??
    shown[0]
  );
}

export interface HiddenAlert {
  occurrence: FieldOccurrenceDTO;
  /** Labels of the fields its condition reads ("AIE"). */
  controllers: string[];
  /** Section where the same field is shown with its alert, if any. */
  visibleIn?: SectionView;
}

/** Alerts of a section: how many to count, and the ones on fields hidden here. */
export function sectionAlerts(
  view: SectionView,
  groups: GroupView[],
  data: SheetValues,
  alerts: AlertKeys
): { count: number; hidden: HiddenAlert[] } {
  const withAlert = view.occurrences.filter((o) => o.flowId && alerts.has(o.flowId));
  const labelOf = (flowId: string) =>
    groups.flatMap((g) => g.sections).flatMap((s) => s.occurrences).find((o) => o.flowId === flowId)?.label ?? flowId;
  const hidden: HiddenAlert[] = withAlert
    .filter((o) => !shownHere(o, data))
    .map((o) => ({
      occurrence: o,
      controllers: conditionFlows(o.condition).map(labelOf),
      visibleIn: visibleOccurrence(o.flowId as string, groups, data)?.section,
    }));
  const count = withAlert.filter((o) => shownHere(o, data)).length + hidden.filter((h) => !h.visibleIn).length;
  return { count, hidden };
}
