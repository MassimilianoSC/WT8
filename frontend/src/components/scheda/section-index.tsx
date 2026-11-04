"use client";
import * as React from "react";
import type { AlertDTO, GroupId } from "@/lib/contract";
import { cn } from "@/lib/utils";
import { GROUP_LABEL } from "@/components/pratiche/labels";
import { sectionProgress, type GroupView, type SheetValues } from "@/components/scheda/layout";
import { sectionAlerts } from "@/components/scheda/alert-visibility";
import { alertIndex } from "@/components/scheda/sections";

/**
 * Side index of the sheet: groups and sections with counters and a red dot
 * where a field has an open alert. A click opens the section and scrolls to it.
 * At the bottom, apart from the groups, "Commenti (n)" (C4) and "Storico" (C3):
 * those boxes are always open, so their entries always read as open sections.
 */
export function SectionIndex({
  groups,
  data,
  alerts,
  enabledGroups,
  open,
  onSelect,
  onHistory,
  onComments,
  commentCount = null,
}: {
  groups: GroupView[];
  data: SheetValues;
  alerts: AlertDTO[];
  enabledGroups: GroupId[];
  open: string[];
  onSelect: (sectionKey: string) => void;
  /** Scrolls to the history box (C3); without it, no entry. */
  onHistory?: () => void;
  /** Scrolls to the comments box (C4); without it, no entry. */
  onComments?: () => void;
  /** Comments of the iteration on screen, null until read. */
  commentCount?: number | null;
}) {
  // Same rule as the section counter (L9): no dot for an alert on a field hidden here and shown elsewhere.
  const alertFlows = React.useMemo(() => alertIndex(alerts), [alerts]);

  return (
    <nav aria-label="Indice delle sezioni" className="space-y-4" data-testid="section-index">
      {groups.map((g) => (
        <div key={g.group} className={cn(!enabledGroups.includes(g.group) && "opacity-50")}>
          <div className="border-b border-foreground pb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.2em]">
            {GROUP_LABEL[g.group]}
          </div>
          <ul className="mt-1 space-y-px">
            {g.sections.map((s) => {
              const { filled, total } = sectionProgress(s, data);
              const hasAlert = sectionAlerts(s, groups, data, alertFlows).count > 0;
              const isOpen = open.includes(s.section.key);
              return (
                <li key={s.section.key}>
                  <button
                    type="button"
                    onClick={() => onSelect(s.section.key)}
                    data-testid={`index-${s.section.key}`}
                    className={cn(
                      "flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent",
                      isOpen ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    <span
                      className={cn("h-1.5 w-1.5 shrink-0", hasAlert ? "bg-status-error" : "bg-transparent")}
                      aria-label={hasAlert ? "Alert aperto" : undefined}
                    />
                    <span className="min-w-0 flex-1 truncate">{s.section.label}</span>
                    <span className="font-mono text-[10px] tabular text-muted-foreground">
                      {filled}/{total}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {(onComments || onHistory) && (
        // Not a role's section: on their own, under a rule, after every group.
        <div className="space-y-px border-t border-foreground pt-2">
          {onComments && (
            <button
              type="button"
              onClick={onComments}
              data-testid="index-commenti"
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent"
            >
              <span className="h-1.5 w-1.5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{commentCount === null ? "Commenti" : `Commenti (${commentCount})`}</span>
            </button>
          )}
          {onHistory && (
            <button
              type="button"
              onClick={onHistory}
              data-testid="index-storico"
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent"
            >
              <span className="h-1.5 w-1.5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate">Storico</span>
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
