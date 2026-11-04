"use client";
import * as React from "react";
import type { GroupId, PraticaDetailDTO } from "@/lib/contract";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { GROUP_LABEL, GROUP_ORDER } from "@/components/pratiche/labels";
import { CommandDialogShell } from "@/components/scheda/command-dialog-shell";
import type { Command } from "@/components/scheda/commands";

/**
 * Assegna (D-21): one or more groups among actions.assignableGroups, plus a
 * note that goes into the mail. Date, forecast and assignment notes are PM
 * fields: they must be saved before (contract §5.3).
 */
export function AssignDialog({
  practice,
  open,
  onOpenChange,
  hasPending,
  onRun,
}: {
  practice: PraticaDetailDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Unsaved edits in the sheet: they must be saved first. */
  hasPending: boolean;
  onRun: (command: Command, operationId: string) => Promise<void>;
}) {
  const [groups, setGroups] = React.useState<GroupId[]>([]);
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setGroups([]);
      setNote("");
    }
  }, [open]);

  const assignable = GROUP_ORDER.filter((g) => practice.actions.assignableGroups.includes(g));

  function toggle(g: GroupId) {
    setGroups((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }

  return (
    <CommandDialogShell
      open={open}
      onOpenChange={onOpenChange}
      testId="assign-dialog"
      title="Assegna"
      description="La pratica diventa raggiungibile per i gruppi scelti; tu continui a lavorarci. Tutti gli utenti del gruppo associati al gestore ricevono una notifica e una mail."
      submitLabel={groups.length > 1 ? `Assegna a ${groups.length} gruppi` : "Assegna"}
      canSubmit={groups.length > 0 && !hasPending}
      onSubmit={(op) => onRun({ kind: "assign", groups, note: note.trim() || undefined }, op)}
    >
      {hasPending && (
        <p className="border border-status-progress px-3 py-2 text-sm" role="status">
          Hai modifiche non salvate nella scheda: salvale prima di assegnare.
        </p>
      )}
      <fieldset className="space-y-2">
        <legend className="mb-1 font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground">Gruppi destinatari</legend>
        {assignable.length === 0 && <p className="text-sm text-muted-foreground">Nessun gruppo disponibile.</p>}
        {assignable.map((g) => {
          const checked = groups.includes(g);
          const already = practice.enabledGroups.includes(g);
          return (
            <label
              key={g}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 border px-3 py-2.5",
                checked ? "border-foreground bg-accent" : "border-border"
              )}
            >
              <span className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(g)}
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                  data-testid={`assign-group-${g}`}
                />
                <span className="font-mono text-sm uppercase tracking-wider">{GROUP_LABEL[g]}</span>
              </span>
              {already && (
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  già assegnato · nuova notifica
                </span>
              )}
            </label>
          );
        })}
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="assign-note">Nota per la mail (facoltativa)</Label>
        <Textarea id="assign-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        <p className="text-xs text-muted-foreground">
          Data, forecast e note di assegnazione si compilano nella sezione PM e vanno salvati prima di assegnare.
        </p>
      </div>
    </CommandDialogShell>
  );
}
