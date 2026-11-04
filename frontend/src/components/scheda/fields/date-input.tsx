"use client";
import * as React from "react";
import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DateCalendar } from "@/components/scheda/fields/date-calendar";
import { cn } from "@/lib/utils";
import { isoToIt, itToIso, maskItDate } from "@/components/scheda/fields/format";

/**
 * Date field always typed and shown as gg/mm/aaaa (D-38), whatever the browser
 * locale; transported as "YYYY-MM-DD". Emits on blur, only valid dates or null.
 * Beside it a calendar (D-190): a picked day is written as if typed (same
 * checks, same onChange, so on the sheet it joins the pending edits).
 * Disabled (read-only): no calendar.
 */
export function DateInput({
  id,
  value,
  onChange,
  disabled,
  invalidLabel = "Data non valida (gg/mm/aaaa)",
  validate,
}: {
  id?: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  disabled?: boolean;
  invalidLabel?: string;
  /** Extra rule on a real date (e.g. a range): a message refuses it. */
  validate?: (iso: string) => string | null;
}) {
  const [text, setText] = React.useState(isoToIt(value));
  const [invalid, setInvalid] = React.useState<string | false>(false);
  const [calendarOpen, setCalendarOpen] = React.useState(false);

  // Follow external updates (e.g. a recalculated forecast).
  React.useEffect(() => {
    setText(isoToIt(value));
    setInvalid(false);
  }, [value]);

  function commit(typed = text) {
    if (typed.trim() === "") {
      setInvalid(false);
      if (value !== null) onChange(null);
      return;
    }
    const iso = itToIso(typed);
    if (!iso) {
      setInvalid(invalidLabel);
      return;
    }
    const rule = validate?.(iso);
    if (rule) {
      setInvalid(rule);
      return;
    }
    setInvalid(false);
    if (iso !== value) onChange(iso);
  }

  function pick(iso: string) {
    const typed = isoToIt(iso);
    setText(typed);
    setCalendarOpen(false);
    commit(typed);
  }

  return (
    <div className="space-y-1">
      <div className="flex">
        <Input
          id={id}
          inputMode="numeric"
          placeholder="gg/mm/aaaa"
          value={text}
          disabled={disabled}
          aria-invalid={invalid ? true : undefined}
          onChange={(e) => setText(maskItDate(e.target.value))}
          onBlur={() => commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
          className={cn("font-mono tabular", invalid && "border-status-error")}
        />
        {/* Modal (C1): scrolls with the wheel even inside a Dialog (see combobox.tsx). */}
        {!disabled && (
          <Popover modal open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Scegli la data dal calendario"
                className="flex h-10 w-10 shrink-0 items-center justify-center border border-l-0 border-input bg-background hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid={id ? `${id}-calendar` : "date-calendar-open"}
              >
                <CalendarDays className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              // Zoom 200% on a short screen: never past the window, the month scrolls inside.
              className="max-h-[var(--radix-popover-content-available-height)] overflow-y-auto"
              collisionPadding={8}
              onOpenAutoFocus={(e) => {
                // Focus the selected (or today's) day, not the first arrow.
                e.preventDefault();
                (e.currentTarget as HTMLElement | null)?.querySelector<HTMLButtonElement>('[data-day][tabindex="0"]')?.focus();
              }}
            >
              <DateCalendar value={itToIso(text) ?? value} onSelect={pick} />
            </PopoverContent>
          </Popover>
        )}
      </div>
      {invalid && <p className="font-mono text-[10px] text-status-error">{invalid}</p>}
    </div>
  );
}
