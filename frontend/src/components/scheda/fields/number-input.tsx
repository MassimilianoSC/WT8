"use client";
import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDecimal, parseDecimal } from "@/components/scheda/fields/format";

/** Decimal field accepting the Italian comma. Emits on blur. */
export function NumberInput({
  id,
  value,
  onChange,
  disabled,
  placeholder,
  min,
  max,
}: {
  id?: string;
  value: number | null;
  onChange: (n: number | null) => void;
  disabled?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
}) {
  const [text, setText] = React.useState(formatDecimal(value));
  const [invalid, setInvalid] = React.useState(false);

  React.useEffect(() => {
    setText(formatDecimal(value));
    setInvalid(false);
  }, [value]);

  function commit() {
    const n = parseDecimal(text);
    const outOfRange = typeof n === "number" && ((min !== undefined && n < min) || (max !== undefined && n > max));
    if (n === undefined || outOfRange) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (n !== value) onChange(n);
  }

  return (
    <div className="space-y-1">
      <Input
        id={id}
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        className={cn("font-mono tabular", invalid && "border-status-error")}
      />
      {invalid && (
        <p className="font-mono text-[10px] text-status-error">
          {min !== undefined && max !== undefined ? `Numero tra ${min} e ${max}` : "Numero non valido"}
        </p>
      )}
    </div>
  );
}
