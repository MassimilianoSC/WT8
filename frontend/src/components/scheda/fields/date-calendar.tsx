"use client";
import * as React from "react";
import {
  addDays,
  addMonths,
  addYears,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { it } from "date-fns/locale";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Month picker beside the date fields (D-190): Italian, week from Monday,
 * today marked, the written date selected. Keyboard as the ARIA date grid:
 * arrows ±1 day / ±1 week, Home/End the week, PgUp/PgDn ±1 month (with Shift
 * ±1 year), Enter or Space picks; Esc is the popover's. No HTML from data,
 * no dependency beyond date-fns.
 */

const WEEKDAYS = [
  ["lun", "lunedì"],
  ["mar", "martedì"],
  ["mer", "mercoledì"],
  ["gio", "giovedì"],
  ["ven", "venerdì"],
  ["sab", "sabato"],
  ["dom", "domenica"],
] as const;

const WEEK = { weekStartsOn: 1 as const };
const toIso = (d: Date) => format(d, "yyyy-MM-dd");

/** 6 weeks from the Monday before the 1st: the grid never changes height. */
export function monthGrid(month: Date): Date[][] {
  const first = startOfWeek(startOfMonth(month), WEEK);
  return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)));
}

export function DateCalendar({
  value,
  onSelect,
  today = new Date(),
}: {
  /** Selected date, "YYYY-MM-DD" or null. */
  value: string | null;
  onSelect: (iso: string) => void;
  /** For tests. */
  today?: Date;
}) {
  const selected = value ? parseISO(value) : null;
  const [focused, setFocused] = React.useState<Date>(() => selected ?? today);
  const month = startOfMonth(focused);
  const monthKey = month.getTime();
  const grid = React.useMemo(() => monthGrid(new Date(monthKey)), [monthKey]);
  const gridRef = React.useRef<HTMLTableElement>(null);
  const moved = React.useRef(false);

  // Keep the keyboard focus on the focused day after it moves.
  React.useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${toIso(focused)}"]`)?.focus();
  }, [focused]);

  const move = (d: Date) => {
    moved.current = true;
    setFocused(d);
  };

  function onKeyDown(e: React.KeyboardEvent) {
    const step: Record<string, () => Date> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      Home: () => startOfWeek(focused, WEEK),
      End: () => endOfWeek(focused, WEEK),
      PageUp: () => (e.shiftKey ? addYears(focused, -1) : addMonths(focused, -1)),
      PageDown: () => (e.shiftKey ? addYears(focused, 1) : addMonths(focused, 1)),
    };
    if (step[e.key]) {
      e.preventDefault();
      move(step[e.key]());
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(toIso(focused));
    }
  }

  const title = format(month, "LLLL yyyy", { locale: it });
  const nav = (label: string, to: Date, icon: React.ReactNode, testId: string) => (
    <button
      type="button"
      aria-label={label}
      onClick={() => setFocused(to)}
      className="flex h-8 w-8 items-center justify-center border border-transparent hover:border-border hover:bg-accent"
      data-testid={testId}
    >
      {icon}
    </button>
  );

  return (
    <div className="w-[17.5rem] p-3" data-testid="date-calendar">
      <div className="mb-2 flex items-center justify-between gap-1">
        <div className="flex">
          {nav("Anno precedente", addYears(focused, -1), <ChevronsLeft className="h-4 w-4" />, "calendar-prev-year")}
          {nav("Mese precedente", addMonths(focused, -1), <ChevronLeft className="h-4 w-4" />, "calendar-prev-month")}
        </div>
        <p className="font-mono text-xs uppercase tracking-wider" aria-live="polite" data-testid="calendar-title">
          {title}
        </p>
        <div className="flex">
          {nav("Mese successivo", addMonths(focused, 1), <ChevronRight className="h-4 w-4" />, "calendar-next-month")}
          {nav("Anno successivo", addYears(focused, 1), <ChevronsRight className="h-4 w-4" />, "calendar-next-year")}
        </div>
      </div>
      <table ref={gridRef} role="grid" aria-label={title} className="w-full border-collapse" onKeyDown={onKeyDown}>
        <thead>
          <tr>
            {WEEKDAYS.map(([short, full]) => (
              <th key={short} scope="col" abbr={full} className="pb-1 text-center font-mono text-[10px] font-normal uppercase text-muted-foreground">
                {short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((week, w) => (
            <tr key={w}>
              {week.map((day) => {
                const iso = toIso(day);
                const isSelected = !!selected && isSameDay(day, selected);
                const isToday = isSameDay(day, today);
                const isFocused = isSameDay(day, focused);
                return (
                  <td key={iso} role="gridcell" aria-selected={isSelected} className="p-0 text-center">
                    <button
                      type="button"
                      tabIndex={isFocused ? 0 : -1}
                      data-day={iso}
                      aria-label={format(day, "EEEE d MMMM yyyy", { locale: it })}
                      aria-current={isToday ? "date" : undefined}
                      onClick={() => onSelect(iso)}
                      onFocus={() => !isFocused && setFocused(day)}
                      className={cn(
                        "h-9 w-9 border font-mono text-xs tabular outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isSelected ? "border-foreground bg-foreground text-background" : isToday ? "border-foreground" : "border-transparent hover:bg-accent",
                        !isSameMonth(day, month) && !isSelected && "text-muted-foreground"
                      )}
                    >
                      {format(day, "d")}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
