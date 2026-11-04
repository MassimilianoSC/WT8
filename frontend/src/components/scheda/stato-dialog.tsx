"use client";
import * as React from "react";
import { STATI_ATTIVITA, type PraticaDetailDTO, type StatoAttivita } from "@/lib/contract";
import { cn } from "@/lib/utils";
import { StatoBadge } from "@/components/pratiche/stato-badge";
import { STATO_LABEL } from "@/components/pratiche/labels";
import { CommandDialogShell } from "@/components/scheda/command-dialog-shell";
import type { Command } from "@/components/scheda/commands";

/** Rule on manual states (D-115, confirmed by the collaborator). Kept here only. */
export const MANUAL_STATE_RULE =
  "Uno stato impostato a mano resta finché un nuovo evento automatico (per esempio la compilazione del Protocollo) non riprende il controllo.";

/** Manual Stato attività (PM, ADMIN: D-23). Completing = TERMINATO (D-28). */
export function StatoDialog({
  practice,
  open,
  onOpenChange,
  onRun,
}: {
  practice: PraticaDetailDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRun: (command: Command, operationId: string) => Promise<void>;
}) {
  const [stato, setStato] = React.useState<StatoAttivita>(practice.statoAttivita);

  React.useEffect(() => {
    if (open) setStato(practice.statoAttivita);
  }, [open, practice.statoAttivita]);

  return (
    <CommandDialogShell
      open={open}
      onOpenChange={onOpenChange}
      testId="stato-dialog"
      title="Stato attività"
      description={
        <>
          <p>
            Lo stato cambia da solo quando si compilano i campi che lo determinano (es. Data assegnazione →
            ASSEGNATO, Protocollo → PROTOCOLLATO). Qui lo imposti a mano; completare la pratica significa impostare
            TERMINATO.
          </p>
          <p className="mt-2">{MANUAL_STATE_RULE}</p>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Stato attuale {practice.statoSource === "MANUAL" ? "impostato a mano" : "automatico"}
          </p>
        </>
      }
      submitLabel={`Imposta ${STATO_LABEL[stato]}`}
      canSubmit={stato !== practice.statoAttivita}
      onSubmit={(op) => onRun({ kind: "stato", stato }, op)}
    >
      <div role="radiogroup" aria-label="Stato attività" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {STATI_ATTIVITA.map((s) => {
          const current = s === practice.statoAttivita;
          const selected = s === stato;
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setStato(s)}
              data-testid={`stato-option-${s}`}
              className={cn(
                "flex min-w-0 flex-col items-start gap-1 border px-2 py-2 text-left transition-colors hover:bg-accent",
                selected ? "border-foreground bg-accent" : "border-border"
              )}
            >
              <StatoBadge stato={s} wrap />
              {current && (
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">attuale</span>
              )}
            </button>
          );
        })}
      </div>
    </CommandDialogShell>
  );
}
