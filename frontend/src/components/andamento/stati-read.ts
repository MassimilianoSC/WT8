import { STATO_LABEL } from "@/components/pratiche/labels";
import { formatDecimal } from "@/components/scheda/fields/format";
import type { Confronto } from "@/components/andamento/andamento-url";
import type { AndamentoDurataDTO, AndamentoGruppoStato, AndamentoStatiDTO, AndamentoStatoRigaDTO } from "@/components/andamento/types";

/**
 * How the time-per-state block reads (contract §15.3–§15.4, D-194, UX note §5).
 * The server decides "pochi dati" (fewer than 5 concluded stays) and the
 * slowest states (ties included); this module only words them. Pure.
 */

/** Below this, values are faded: the server sets pochiDati with the same rule. */
export const MIN_PASSAGGI = 5;

/** Days with one decimal, "—" when there is no value. */
export function giorni(n: number | null | undefined, short = false): string {
  if (n === null || n === undefined) return "—";
  const text = formatDecimal(n);
  return short ? `${text} gg` : `${text} ${n === 1 ? "giorno" : "giorni"}`;
}

const list = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`);

/** Rows of one group, in the app's order (the server sends them in that order). */
export function rowsOf(data: AndamentoStatiDTO, gruppo: AndamentoGruppoStato): AndamentoStatoRigaDTO[] {
  return data.righe.filter((r) => r.gruppoStato === gruppo);
}

export function comparisonOf(r: AndamentoStatoRigaDTO, confronto: Confronto): (AndamentoDurataDTO & { passaggi: number }) | null {
  return confronto === "anno" ? r.annoPrecedente : r.precedente;
}

export const CONFRONTO_LABEL: Record<Confronto, string> = { precedente: "periodo precedente", anno: "stesso periodo dell'anno prima" };

/** "Le pratiche restano più a lungo in PROTOCOLLATO: mediana 24,5 giorni (periodo precedente 19 giorni)." Descriptive, no alarm. */
export function slowestSentence(data: AndamentoStatiDTO, confronto: Confronto): string | null {
  const top = data.righe.filter((r) => data.piuLenti.includes(r.stato));
  if (top.length === 0) return null;
  const prev = top.length === 1 ? comparisonOf(top[0], confronto)?.medianaGiorni ?? null : null;
  const tail = prev !== null ? ` (${CONFRONTO_LABEL[confronto]} ${giorni(prev)})` : "";
  return `Le pratiche restano più a lungo in ${list(top.map((r) => STATO_LABEL[r.stato]))}: mediana ${giorni(top[0].periodo.medianaGiorni)}${tail}.`;
}

/**
 * External waits and suspensions (D-194): DINIEGATO, TAR, STAND-BY with their
 * times, said plainly so a delay from the TAR is visible without weighing on
 * the operating phase.
 */
export function externalSentence(data: AndamentoStatiDTO): string | null {
  const ext = rowsOf(data, "ESTERNO").filter((r) => r.passaggi > 0 || r.periodo.inCorso > 0);
  if (ext.length === 0) return null;
  const parts = ext.map((r) => {
    const bits = [
      r.periodo.medianaGiorni !== null ? `mediana ${giorni(r.periodo.medianaGiorni)}` : null,
      r.periodo.inCorso > 0 ? `${r.periodo.inCorso} in corso` : null,
    ].filter(Boolean);
    return `${STATO_LABEL[r.stato]}${bits.length ? ` (${bits.join(", ")})` : ""}`;
  });
  return `Attese fuori dal lavoro operativo: ${list(parts)}. Non entrano nei tempi delle fasi operative.`;
}
