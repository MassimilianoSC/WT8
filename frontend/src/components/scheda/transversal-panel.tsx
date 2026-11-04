"use client";
import * as React from "react";
import { Lock } from "lucide-react";
import type {
  FieldChange,
  FieldOccurrenceDTO,
  GroupId,
  OccurrenceAccessDTO,
  TransversalValuesDTO,
} from "@/lib/contract";
import { GROUP_LABEL, GROUP_ORDER } from "@/components/pratiche/labels";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { readOnlyReason } from "@/components/scheda/fields/field";

type YesNo = "SI" | "NO";

/** Occurrence key of a group's Note Operative (v0.3.0, D-121). */
export const noteKey = (g: GroupId) => `TRASV.NOTE_OPERATIVE.${g}`;

/**
 * Transversal fields (D-37, G §12) at the top of the sheet: Note Operative,
 * one per group (D-121: only the groups the user may see are present; their
 * own editable, the others read-only), Fatturabile and Fatturato beside them.
 */
export function TransversalPanel({
  values,
  occurrences,
  access,
  onChange,
}: {
  values: TransversalValuesDTO;
  /** TemplateDTO.transversal, to read labels and computed descriptions. */
  occurrences: FieldOccurrenceDTO[];
  access: Record<string, OccurrenceAccessDTO | undefined>;
  onChange: (change: FieldChange) => void;
}) {
  const occ = (key: string) => occurrences.find((o) => o.occurrenceKey === key);
  const fatturabile = occ("TRASV.FATTURABILE");
  const fatturato = occ("TRASV.FATTURATO");
  const canFatturabile = access["TRASV.FATTURABILE"]?.editable === true;
  const canFatturato = access["TRASV.FATTURATO"]?.editable === true;
  // Absent key = not visible to this user; "" = visible and empty (v0.3.0).
  const groups = GROUP_ORDER.filter((g) => values.noteOperative[g] !== undefined);

  return (
    <div className="grid grid-cols-1 border-2 border-foreground bg-card lg:grid-cols-[1fr_auto]" data-testid="transversal-panel">
      <div className="p-4">
        <div className="mb-2 font-mono text-xs uppercase tracking-wider">Note Operative</div>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna nota visibile per il tuo gruppo.</p>
        ) : (
          <div className={cn("grid grid-cols-1 gap-4", groups.length > 1 && "md:grid-cols-2")}>
            {groups.map((g) => (
              <GroupNote
                key={g}
                group={g}
                value={values.noteOperative[g] ?? ""}
                occurrence={occ(noteKey(g))}
                access={access[noteKey(g)]}
                onCommit={(value) => onChange({ transversal: "noteOperative", group: g, value })}
              />
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-px border-t border-border bg-border lg:w-80 lg:grid-cols-1 lg:border-l lg:border-t-0">
        <div className="space-y-1.5 bg-card p-4" id="trasv-fatturabile-box">
          <div className="flex items-center justify-between gap-2">
            <Label>{fatturabile?.label ?? "Fatturabile"}</Label>
            <span
              className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
              title={
                values.fatturabileManual
                  ? "Impostato a mano: i ricalcoli automatici positivi sono bloccati"
                  : fatturabile?.computed?.description ?? "Calcolato automaticamente"
              }
            >
              {values.fatturabileManual ? "manuale" : "automatico"}
            </span>
          </div>
          <YesNoToggle
            value={values.fatturabile}
            disabled={!canFatturabile}
            onChange={(v) => v && onChange({ transversal: "fatturabile", value: v })}
            testId="trasv-fatturabile"
          />
        </div>
        <div className="space-y-1.5 bg-card p-4">
          <Label>{fatturato?.label ?? "Fatturato"}</Label>
          <YesNoToggle
            value={values.fatturato}
            allowEmpty
            disabled={!canFatturato}
            onChange={(v) => onChange({ transversal: "fatturato", value: v })}
            testId="trasv-fatturato"
          />
        </div>
      </div>
    </div>
  );
}

/** One group's Note Operative: editable where access allows, else read-only with the reason. */
function GroupNote({
  group,
  value,
  occurrence,
  access,
  onCommit,
}: {
  group: GroupId;
  value: string;
  occurrence: FieldOccurrenceDTO | undefined;
  access: OccurrenceAccessDTO | undefined;
  onCommit: (value: string) => void;
}) {
  const [text, setText] = React.useState(value);
  React.useEffect(() => setText(value), [value]);
  const id = `trasv-note-${group}`;
  const editable = access?.editable === true;
  return (
    <div className="space-y-1.5" data-testid={`note-${group}`}>
      <Label htmlFor={id}>{GROUP_LABEL[group]}</Label>
      {editable ? (
        <Textarea
          id={id}
          rows={3}
          value={text}
          aria-label={`Note Operative ${GROUP_LABEL[group]}`}
          placeholder="Eccezioni e lavorazioni straordinarie non rappresentabili nei campi strutturati…"
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            if (text !== value) onCommit(text);
          }}
        />
      ) : (
        <ReadOnlyText text={value} reason={occurrence ? readOnlyReason(occurrence, access) : "Sola lettura"} />
      )}
    </div>
  );
}

function YesNoToggle({
  value,
  onChange,
  disabled,
  allowEmpty,
  testId,
}: {
  value: YesNo | null;
  onChange: (v: YesNo | null) => void;
  disabled?: boolean;
  allowEmpty?: boolean;
  testId: string;
}) {
  const choices: YesNo[] = ["SI", "NO"];
  return (
    <div className="flex items-center gap-2">
      <div role="radiogroup" className="inline-flex border border-border" data-testid={testId}>
        {choices.map((c) => {
          const active = value === c;
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(active && allowEmpty ? null : c)}
              className={cn(
                "h-9 w-14 font-mono text-xs uppercase tracking-wider transition-colors disabled:cursor-not-allowed",
                active ? "bg-foreground text-background" : "bg-background text-muted-foreground",
                !disabled && !active && "hover:bg-accent hover:text-foreground"
              )}
            >
              {c === "SI" ? "SÌ" : "NO"}
            </button>
          );
        })}
      </div>
      {disabled && <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Sola lettura" />}
    </div>
  );
}

function ReadOnlyText({ text, reason }: { text: string; reason: string }) {
  return (
    <div className="flex items-start gap-2 border border-dashed border-border bg-muted/40 px-3 py-2" title={reason}>
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <div>
        <p className={cn("whitespace-pre-wrap text-sm", !text && "text-muted-foreground")}>{text || "—"}</p>
        <p className="font-mono text-[10px] text-muted-foreground">{reason}</p>
      </div>
    </div>
  );
}
