"use client";
import * as React from "react";
import { format } from "date-fns";
import { AlertTriangle, ArrowRight, PauseCircle } from "lucide-react";
import type { AlertDTO } from "@/lib/contract";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CommandDialogShell } from "@/components/scheda/command-dialog-shell";

/** FATTURABILE_KO never closes with "Chiudi": deciding Fatturabile closes it (D-137). */
export const FATTURABILE_KO_HINT = "Si chiude decidendo Fatturabile (SÌ o NO) in cima alla scheda";

/** Offerta → ODA closes by hand by rule (G §17.10); elsewhere it is the exception. */
function closeHint(alert: AlertDTO | null): string {
  if (alert?.rule === "OFFERTA_ODA") return "Chiudilo quando sono arrivati tutti gli ODA previsti.";
  return "La chiusura è manuale e resta nello storico con il tuo nome. Usala quando la condizione è risolta fuori dai campi della pratica.";
}

function dueText(dueAt: string | null): string {
  if (!dueAt) return "senza scadenza";
  return `scadenza ${format(new Date(dueAt.length === 10 ? `${dueAt}T09:00:00` : dueAt), "dd/MM/yyyy")}`;
}

/**
 * Open alerts of the shown iteration (D-44). "Vai al campo" opens the section
 * and highlights the field; "Chiudi" only where the backend allows a manual
 * close (leaders, ADMIN: D-46). SUSPENDED = archived practice: not a close.
 */
export function AlertsPanel({
  alerts,
  labelOf,
  onGoTo,
  onGoToFatturabile,
  onClose,
}: {
  alerts: AlertDTO[];
  /** Label of the field an alert points to. */
  labelOf: (alert: AlertDTO) => string | null;
  onGoTo: (alert: AlertDTO) => void;
  /** Brings the user to Fatturabile at the top of the sheet. */
  onGoToFatturabile?: () => void;
  onClose: (alert: AlertDTO, operationId: string) => Promise<void>;
}) {
  const [closing, setClosing] = React.useState<AlertDTO | null>(null);
  const open = alerts.filter((a) => a.status === "OPEN");
  if (open.length === 0) return null;

  return (
    <section className="border-2 border-status-error bg-card" data-testid="alerts-panel">
      <header className="flex items-center gap-2 border-b border-status-error px-4 py-2 font-mono text-xs uppercase tracking-wider text-status-error">
        <AlertTriangle className="h-4 w-4" /> {open.length} {open.length === 1 ? "alert aperto" : "alert aperti"}
      </header>
      <ul className="divide-y divide-border">
        {open.map((a) => {
          const suspended = a.executionStatus === "SUSPENDED";
          const field = labelOf(a);
          return (
            <li
              key={a.id}
              className={cn("flex flex-wrap items-center justify-between gap-3 px-4 py-2.5", suspended && "text-muted-foreground")}
              data-testid={`alert-${a.id}`}
            >
              <div className="min-w-0">
                <div className="text-sm font-medium">{a.label}</div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {field ? `${field} · ` : ""}
                  {dueText(a.dueAt)}
                  {suspended && (
                    <span className="ml-2 inline-flex items-center gap-1">
                      <PauseCircle className="h-3 w-3" /> sospeso: pratica archiviata
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {a.rule === "FATTURABILE_KO" && (
                  <button
                    type="button"
                    onClick={onGoToFatturabile}
                    className="text-left text-xs underline underline-offset-2 hover:text-foreground"
                    data-testid={`alert-fatturabile-${a.id}`}
                  >
                    {FATTURABILE_KO_HINT}
                  </button>
                )}
                {a.flowId && (
                  <Button variant="ghost" size="sm" onClick={() => onGoTo(a)} data-testid={`alert-goto-${a.id}`}>
                    Vai al campo <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                )}
                {a.canCloseManually && !suspended && a.rule !== "FATTURABILE_KO" && (
                  <Button variant="outline" size="sm" onClick={() => setClosing(a)} data-testid={`alert-close-${a.id}`}>
                    Chiudi
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <CommandDialogShell
        open={closing !== null}
        onOpenChange={(o) => !o && setClosing(null)}
        testId="alert-close-dialog"
        title="Chiudi l'alert"
        description={
          <div className="space-y-2">
            <p>{closing?.label}</p>
            <p>{closeHint(closing)}</p>
          </div>
        }
        submitLabel="Chiudi alert"
        onSubmit={async (op) => {
          if (closing) await onClose(closing, op);
        }}
      />
    </section>
  );
}
