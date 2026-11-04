/**
 * Aggancio degli alert nel salvataggio dei campi (D-97, D-132 P-10): chiamata OBBLIGATORIA dentro la transazione del
 * PATCH, dopo stato e formule e prima delle scritture del riepilogo e della ricevuta, con lo snapshot definitivo.
 * Il suo esito decide openAlerts del riepilogo; un errore qui annulla l'intero salvataggio.
 *
 * Implementazione: la riconciliazione completa del motore degli alert (B7): chiusure da compilazione nello stesso
 * salvataggio, aperture a scadenza raggiunta, Fatturabile KO (D-131); gli eventi di timeline condividono il registro
 * dell'operazione.
 */
import type { TemplateDTO, UserDTO } from "@/lib/contract";
import type { OpLog } from "@/lib/store/oplog";
import type { OperationContext } from "@/lib/store/transaction";
import type { IterationDoc, PracticeDoc, RepeatRowDoc } from "@/lib/store/types";
import { reconcilePracticeAlerts } from "@/services/alerts-engine";

export interface SaveAlertInput {
  ctx: OperationContext;
  practice: PracticeDoc;
  /** Iterazione con valori, trasversali e stato già definitivi. */
  iteration: IterationDoc;
  /** Righe definitive (senza le tolte). */
  rows: RepeatRowDoc[];
  template: TemplateDTO;
  actor: UserDTO;
  /** Decisione manuale su Fatturabile in questo salvataggio (chiude FATTURABILE_KO, D-131). */
  fatturabileWritten: boolean;
  /** Registro della stessa operazione: gli eventi ALERT_OPEN / ALERT_CLOSE li scrive il PATCH con i suoi. */
  log: OpLog;
}

export interface SaveAlertResult {
  openAlerts: number;
}

export async function reconcileAlertsOnSave(input: SaveAlertInput): Promise<SaveAlertResult> {
  const r = await reconcilePracticeAlerts({ ...input, actor: input.actor });
  return { openAlerts: r.openAlerts };
}
