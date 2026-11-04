"use client";
import * as React from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { NONE_CODE, type SelectValue } from "@/lib/contract";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ALTRO, NONE_LABEL, selectLabel, type Option } from "@/components/scheda/fields/format";

/** Long lists (e.g. ISTAT comuni) render only the first matches. */
const MAX_VISIBLE = 100;

function normalize(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

type Props = {
  id?: string;
  options: Option[];
  allowOther: boolean;
  /** "Nessuno" (user fields, v0.1.7): exclusive, also in multiple mode. */
  allowNone?: boolean;
  /** Shown when there is nothing to choose (empty list, ISTAT unavailable…). */
  emptyText?: string;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
} & (
  | { multiple?: false; value: SelectValue | null; onChange: (v: SelectValue | null) => void }
  | { multiple: true; value: SelectValue[]; onChange: (v: SelectValue[]) => void }
);

/**
 * Searchable select (G §17.4, §17.11) for SELECT / MULTISELECT / USER / USERS.
 * "Altro" (code ALTRO) asks for a free text valid on this practice only.
 */
export function Combobox(props: Props) {
  const { id, options, allowOther, allowNone = false, emptyText, disabled, loading, placeholder = "Seleziona…" } = props;
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef<HTMLUListElement>(null);
  const listboxId = React.useId();

  const selected: SelectValue[] = props.multiple ? props.value : props.value ? [props.value] : [];
  const selectedCodes = new Set(selected.map((v) => v.code));
  const other = selected.find((v) => v.code === ALTRO);

  // "Altro" is offered once, even when the list already carries it.
  const allOptions = React.useMemo(() => {
    // Deactivated items are not offered; "Altro" comes from allowOther only (D-100).
    const base = options.filter((o) => o.code !== ALTRO && o.code !== NONE_CODE && !o.inactive);
    const none = allowNone ? [{ code: NONE_CODE, label: NONE_LABEL }] : [];
    return [...none, ...base, ...(allowOther ? [{ code: ALTRO, label: "Altro" }] : [])];
  }, [options, allowOther, allowNone]);

  const matches = React.useMemo(() => {
    const q = normalize(query.trim());
    const found = q ? allOptions.filter((o) => normalize(o.label).includes(q) || normalize(o.code).includes(q)) : allOptions;
    return found;
  }, [allOptions, query]);
  const visible = matches.slice(0, MAX_VISIBLE);

  React.useEffect(() => setActive(0), [query, open]);
  // A search left from the last opening would filter new options (e.g. the provinces of another region) to nothing.
  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  function choose(code: string) {
    if (props.multiple) {
      let next = selectedCodes.has(code)
        ? props.value.filter((v) => v.code !== code)
        : [...props.value, code === ALTRO ? { code, otherText: "" } : { code }];
      // "Nessuno" never combines with users.
      if (!selectedCodes.has(code)) next = code === NONE_CODE ? [{ code }] : next.filter((v) => v.code !== NONE_CODE);
      props.onChange(next);
    } else {
      props.onChange(code === ALTRO ? { code, otherText: other?.otherText ?? "" } : { code });
      setOpen(false);
    }
  }

  function setOtherText(text: string) {
    if (props.multiple) {
      props.onChange(props.value.map((v) => (v.code === ALTRO ? { code: ALTRO, otherText: text } : v)));
    } else {
      props.onChange({ code: ALTRO, otherText: text });
    }
  }

  function clear() {
    if (props.multiple) props.onChange([]);
    else props.onChange(null);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, visible.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = visible[active];
      if (o) choose(o.code);
    }
  }

  React.useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const summary = selected.map((v) => selectLabel(v, options)).join(", ");

  return (
    <div className="space-y-1.5">
      {/* Modal (C1): it locks scrolling around itself, so inside a Dialog, whose lock lets through only its own
          content, the portalled list still scrolls with the wheel; outside a Dialog the page waits while it is open. */}
      <Popover modal open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            disabled={disabled}
            className={cn(
              "flex h-10 w-full items-center justify-between gap-2 rounded-none border border-input bg-background px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
              !summary && "text-muted-foreground"
            )}
          >
            <span className="truncate">{loading ? "Caricamento…" : summary || placeholder}</span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[16rem]" onKeyDown={onKeyDown}>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca…"
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul id={listboxId} ref={listRef} role="listbox" aria-multiselectable={props.multiple || undefined} className="max-h-64 overflow-auto py-1">
            {visible.length === 0 && (
              <li className="px-3 py-2 font-mono text-xs text-muted-foreground">
                {loading ? "Caricamento…" : !query.trim() && emptyText ? emptyText : "Nessun risultato"}
              </li>
            )}
            {visible.map((o, i) => {
              const isSelected = selectedCodes.has(o.code);
              return (
                <li
                  key={o.code}
                  data-index={i}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o.code)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm",
                    i === active && "bg-accent",
                    o.code === ALTRO && "border-t border-border"
                  )}
                >
                  <Check className={cn("h-4 w-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{o.label}</span>
                </li>
              );
            })}
            {matches.length > MAX_VISIBLE && (
              <li className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Altri {matches.length - MAX_VISIBLE} risultati: affina la ricerca
              </li>
            )}
          </ul>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => {
                clear();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2 font-mono text-xs uppercase tracking-wider text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" /> Svuota
            </button>
          )}
        </PopoverContent>
      </Popover>
      {other && (
        <OtherText value={other.otherText ?? ""} onCommit={setOtherText} disabled={disabled} />
      )}
    </div>
  );
}

/** Free text for "Altro": valid on this practice only (G §17.4). */
function OtherText({ value, onCommit, disabled }: { value: string; onCommit: (t: string) => void; disabled?: boolean }) {
  const [text, setText] = React.useState(value);
  React.useEffect(() => setText(value), [value]);
  return (
    <Input
      value={text}
      placeholder="Specifica il valore (Altro)"
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== value) onCommit(text);
      }}
    />
  );
}
