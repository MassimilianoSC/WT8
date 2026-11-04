"use client";
import * as React from "react";
import type { PraticaDetailDTO } from "@/lib/contract";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CommandDialogShell } from "@/components/scheda/command-dialog-shell";
import type { Command } from "@/components/scheda/commands";

export type ConfirmKind = "archive" | "restore" | "delete" | "rework" | "resubmit";

/** Texts from D-25..D-28 (to be checked by the coordination before release). */
function texts(kind: ConfirmKind, p: PraticaDetailDTO): { title: string; body: string[]; submit: string } {
  switch (kind) {
    case "archive":
      return {
        title: "Archivia la pratica",
        body: [
          "La pratica diventa di sola lettura fino al ripristino e i suoi alert si fermano.",
          "Si archiviano solo pratiche con Stato attività TERMINATO o KO.",
        ],
        submit: "Archivia",
      };
    case "restore":
      return {
        title: "Ripristina la pratica",
        body: [
          "La pratica torna modificabile secondo i permessi di ciascun gruppo e i suoi alert riprendono.",
          "Lo Stato attività non cambia.",
        ],
        submit: "Ripristina",
      };
    case "delete":
      return {
        title: "Cancella la pratica",
        body: [
          "Si cancellano solo pratiche in CREATA, mai ripresentate.",
          "La cancellazione è definitiva: la pratica sparisce dall'elenco e non ha storico consultabile.",
        ],
        submit: "Cancella definitivamente",
      };
    case "rework":
      return {
        title: "Rilavorazione",
        body: [
          "Crea una NUOVA pratica collegata a questa, che resta com'è, anche se ancora aperta.",
          "Nella nuova pratica il Core viene copiato senza ODA, Note ODA e Stato ODA; lo Stato attività parte da CREATA.",
        ],
        submit: "Crea la rilavorazione",
      };
    case "resubmit":
      return {
        title: "Ripresentazione totale",
        body: [
          `Apre l'iterazione ${p.iteration + 1} della stessa pratica. L'iterazione ${p.iteration} resta consultabile in sola lettura.`,
          "Le sezioni operative ripartono vuote. Core e Dati Secondari restano, tranne Codice G7, ODA, Note ODA e Stato ODA.",
          "Note Operative resta; Fatturabile torna NO e Fatturato si azzera. Lo Stato attività riparte da CREATA e i gruppi già abilitati restano abilitati.",
        ],
        submit: "Avvia la ripresentazione",
      };
  }
}

/** Confirmation of the commands that need one (archive, restore, delete,
 *  rework, resubmit). Delete asks to type the Codice Sito. */
export function ConfirmCommandDialog({
  kind,
  practice,
  onOpenChange,
  onRun,
}: {
  kind: ConfirmKind | null;
  practice: PraticaDetailDTO;
  onOpenChange: (open: boolean) => void;
  onRun: (command: Command, operationId: string) => Promise<void>;
}) {
  const [g7, setG7] = React.useState("");
  const [typed, setTyped] = React.useState("");

  React.useEffect(() => {
    setG7("");
    setTyped("");
  }, [kind]);

  if (!kind) return null;
  const t = texts(kind, practice);
  const withG7 = kind === "rework" || kind === "resubmit";
  const canSubmit = kind !== "delete" || typed.trim() === practice.codiceSito;

  function command(): Command {
    if (kind === "rework" || kind === "resubmit") return { kind, codiceG7: g7.trim() || undefined };
    return { kind: kind as "archive" | "restore" | "delete" };
  }

  return (
    <CommandDialogShell
      open
      onOpenChange={onOpenChange}
      testId={`confirm-${kind}`}
      title={t.title}
      description={
        <div className="space-y-2">
          {t.body.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      }
      submitLabel={t.submit}
      submitVariant={kind === "delete" ? "destructive" : "default"}
      canSubmit={canSubmit}
      onSubmit={(op) => onRun(command(), op)}
    >
      {withG7 && (
        <div className="space-y-1.5">
          <Label htmlFor="confirm-g7">
            {kind === "rework" ? "Codice G7 della nuova pratica" : "Codice G7 della nuova iterazione"} (facoltativo)
          </Label>
          <Input
            id="confirm-g7"
            value={g7}
            onChange={(e) => setG7(e.target.value)}
            placeholder={kind === "rework" ? `Se vuoto resta ${practice.codiceG7 ?? "vuoto"}` : "Se vuoto resta vuoto"}
          />
        </div>
      )}
      {kind === "delete" && (
        <div className="space-y-1.5">
          <Label htmlFor="confirm-delete">
            Per confermare scrivi il Codice Sito <span className="font-mono normal-case text-foreground">{practice.codiceSito}</span>
          </Label>
          <Input id="confirm-delete" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </div>
      )}
    </CommandDialogShell>
  );
}
