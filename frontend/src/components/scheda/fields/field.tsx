"use client";
import * as React from "react";
import { AlertTriangle, Lock } from "lucide-react";
import type {
  AlertDTO,
  FieldOccurrenceDTO,
  FieldValue,
  OccurrenceAccessDTO,
  SelectValue,
} from "@/lib/contract";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { GROUP_LABEL } from "@/components/pratiche/labels";
import { Combobox } from "@/components/scheda/fields/combobox";
import { DateInput } from "@/components/scheda/fields/date-input";
import { NumberInput } from "@/components/scheda/fields/number-input";
import { formatValue, type Option } from "@/components/scheda/fields/format";

/** Why an occurrence is read-only, in plain Italian (OccurrenceAccessDTO.reason). */
export function readOnlyReason(occurrence: FieldOccurrenceDTO, access: OccurrenceAccessDTO | undefined): string {
  switch (access?.reason) {
    case "MIRROR":
      return `Compilato da ${GROUP_LABEL[occurrence.ownerGroup]}`;
    case "NOT_MY_GROUP":
      return `Di competenza di ${GROUP_LABEL[occurrence.ownerGroup]}`;
    case "NOT_ASSIGNED":
      return "Il tuo gruppo non ha ancora ricevuto l'Assegna";
    case "ARCHIVED":
      return "Pratica archiviata: sola lettura";
    case "PAST_ITERATION":
      return "Iterazione passata: sola lettura";
    case "COMPUTED":
      return occurrence.computed?.description
        ? `Calcolato: ${occurrence.computed.description}`
        : "Calcolato automaticamente";
    default:
      return "Sola lettura";
  }
}

export interface FieldProps {
  occurrence: FieldOccurrenceDTO;
  value: FieldValue | undefined;
  /** Missing access = read-only: editability is decided by the backend only. */
  access: OccurrenceAccessDTO | undefined;
  onChange: (value: FieldValue) => void;
  /** Options for SELECT / MULTISELECT / USER / USERS. */
  options?: Option[];
  optionsLoading?: boolean;
  /** Text of an empty menu (empty list, ISTAT unavailable, parent not chosen). */
  optionsEmptyText?: string;
  /** Open alert on this field, highlighted (D-44). */
  alert?: AlertDTO;
  /** Distinguishes the same occurrence across repeat-group rows. */
  idSuffix?: string;
  /** Replaces the access-based reason (e.g. past iteration). */
  reasonOverride?: string;
  /** Computed field overridden by hand: the calculation is stopped (manualLocks). */
  manualLocked?: boolean;
}

function asSelect(v: FieldValue | undefined): SelectValue | null {
  return v && typeof v === "object" && !Array.isArray(v) && "code" in v ? v : null;
}

function asSelectArray(v: FieldValue | undefined): SelectValue[] {
  return Array.isArray(v) ? v : [];
}

/** One occurrence: label, input by DataType, or read-only value with reason. */
export const Field = React.memo(function Field({
  occurrence,
  value,
  access,
  onChange,
  options,
  optionsLoading,
  optionsEmptyText,
  alert,
  idSuffix,
  reasonOverride,
  manualLocked,
}: FieldProps) {
  const id = `f-${occurrence.occurrenceKey}${idSuffix ? `-${idSuffix}` : ""}`.replace(/[^A-Za-z0-9_-]/g, "_");
  const editable = access?.editable === true;
  const wide = occurrence.dataType === "LONGTEXT";

  return (
    <div
      className={cn(
        "space-y-1.5",
        wide && "md:col-span-2 lg:col-span-3",
        alert && "border-l-2 border-status-error pl-3"
      )}
      data-testid={`field-${occurrence.occurrenceKey}`}
      data-flow-id={occurrence.flowId ?? undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={editable ? id : undefined} title={occurrence.universal || undefined}>
          {occurrence.label}
          {occurrence.required && <span className="ml-0.5 text-status-error" aria-hidden>*</span>}
        </Label>
        {alert && (
          <span className="flex items-center gap-1 font-mono text-[10px] uppercase text-status-error" title={alert.label}>
            <AlertTriangle className="h-3 w-3" /> Alert
          </span>
        )}
      </div>

      {editable ? (
        <FieldInput
          id={id}
          occurrence={occurrence}
          value={value}
          onChange={onChange}
          options={options}
          optionsLoading={optionsLoading}
          optionsEmptyText={optionsEmptyText}
        />
      ) : (
        <ReadOnlyValue text={formatValue(occurrence.dataType, value, options)} reason={reasonOverride ?? readOnlyReason(occurrence, access)} />
      )}
      {editable && occurrence.computed && (
        <p className="font-mono text-[10px] text-muted-foreground">
          {manualLocked
            ? "Impostato a mano: il calcolo automatico è fermo"
            : `Calcolato: ${occurrence.computed.description} · una modifica a mano ferma il calcolo`}
        </p>
      )}
      {alert && <p className="font-mono text-[10px] text-status-error">{alert.label}</p>}
    </div>
  );
});

function FieldInput({
  id,
  occurrence,
  value,
  onChange,
  options,
  optionsLoading,
  optionsEmptyText,
}: {
  id: string;
  occurrence: FieldOccurrenceDTO;
  value: FieldValue | undefined;
  onChange: (value: FieldValue) => void;
  options?: Option[];
  optionsLoading?: boolean;
  optionsEmptyText?: string;
}) {
  const allowOther = occurrence.list?.allowOther ?? false;
  const allowNone = occurrence.list?.allowNone ?? false;

  switch (occurrence.dataType) {
    case "LONGTEXT":
      return (
        <Textarea
          id={id}
          rows={3}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "NUMBER":
      return <NumberInput id={id} value={typeof value === "number" ? value : null} onChange={onChange} />;
    case "DATE":
      return <DateInput id={id} value={typeof value === "string" ? value : null} onChange={onChange} />;
    case "SELECT":
    case "USER":
      return (
        <Combobox
          id={id}
          options={options ?? []}
          loading={optionsLoading}
          emptyText={optionsEmptyText}
          allowOther={occurrence.dataType === "SELECT" && allowOther}
          allowNone={occurrence.dataType === "USER" && allowNone}
          value={asSelect(value)}
          onChange={onChange}
        />
      );
    case "MULTISELECT":
    case "USERS":
      return (
        <Combobox
          id={id}
          multiple
          options={options ?? []}
          loading={optionsLoading}
          emptyText={optionsEmptyText}
          allowOther={occurrence.dataType === "MULTISELECT" && allowOther}
          allowNone={occurrence.dataType === "USERS" && allowNone}
          value={asSelectArray(value)}
          onChange={onChange}
        />
      );
    case "TEXT":
    default:
      return <Input id={id} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />;
  }
}

function ReadOnlyValue({ text, reason }: { text: string; reason: string }) {
  return (
    <div className="flex min-h-10 items-start gap-2 border border-dashed border-border bg-muted/40 px-3 py-2" title={reason}>
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <div className={cn("whitespace-pre-wrap break-words text-sm", !text && "text-muted-foreground")}>{text || "—"}</div>
        <div className="font-mono text-[10px] text-muted-foreground">{reason}</div>
      </div>
    </div>
  );
}
