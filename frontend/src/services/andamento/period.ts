/**
 * Filtri, periodi e statistiche comuni ai blocchi di Andamento (contratto §15.3, §15.4). Giorni di calendario, ora di
 * Roma, settimana dal lunedì. Un periodo da–a comprende i due giorni: in istanti è [mezzanotte di da, mezzanotte del
 * giorno dopo a).
 */
import { TEMPLATE_IDS, type AndamentoDurataDTO, type AndamentoGranularity, type AndamentoGruppoStato, type AndamentoPeriodDTO, type AndamentoQueryDTO, type StatoAttivita, type TemplateId } from "@/lib/contract";
import { addCalendarDays, addMonths, dayOfWeek, diffCalendarDays, isValidIsoDate, romeDate, romeTime, type IsoDate } from "@/lib/calendario";
import { HttpError } from "@/lib/http-error";

export const DAY_MS = 86_400_000;
/** Oltre questa durata il periodo è rifiutato (400): 10 anni bastano per il lungo periodo. */
export const MAX_PERIOD_DAYS = 3660;
/** Sotto questa soglia di conclusi un valore è «poco indicativo» e non è candidato a «più lento» (§15.4). */
export const POCHI_DATI = 5;

/** D-194: attese esterne e sospensioni. */
export const ESTERNI: readonly StatoAttivita[] = ["DINIEGATO", "TAR", "STAND_BY"];
export const FINALI: readonly StatoAttivita[] = ["TERMINATO", "KO"];
export const gruppoStato = (s: StatoAttivita): AndamentoGruppoStato => (ESTERNI.includes(s) ? "ESTERNO" : "OPERATIVO");

/* ---------- filtri ---------- */

export function parseAndamentoQuery(params: URLSearchParams, now: Date = new Date()): AndamentoQueryDTO {
  const t = params.get("templateId");
  if (t !== null && t !== "" && !(TEMPLATE_IDS as readonly string[]).includes(t)) throw new HttpError("Parametro templateId non valido", 400);
  const g = params.get("granularity");
  if (g !== null && g !== "" && g !== "week" && g !== "month") throw new HttpError("Parametro granularity non valido (week o month)", 400);
  const date = (name: string): IsoDate | null => {
    const v = params.get(name);
    if (v === null || v === "") return null;
    if (!isValidIsoDate(v)) throw new HttpError(`Parametro ${name} non valido (AAAA-MM-GG)`, 400);
    return v;
  };
  const to = date("to") ?? romeDate(now);
  const from = date("from") ?? addCalendarDays(addMonths(to, -12), 1);
  if (from > to) throw new HttpError("Il periodo inizia dopo la fine", 400);
  if (diffCalendarDays(from, to) > MAX_PERIOD_DAYS) throw new HttpError("Periodo troppo lungo (al massimo 10 anni)", 400);
  return { templateId: t ? (t as TemplateId) : null, from, to, granularity: (g as AndamentoGranularity) || "month" };
}

/* ---------- periodi ---------- */

export interface Window {
  period: AndamentoPeriodDTO;
  start: number;
  /** Escluso. */
  end: number;
}

export function windowOf(p: AndamentoPeriodDTO): Window {
  return { period: p, start: romeTime(p.from, 0, 0).getTime(), end: romeTime(addCalendarDays(p.to, 1), 0, 0).getTime() };
}

/** Periodo precedente della stessa durata, che finisce il giorno prima di from. */
export function previousPeriod(p: AndamentoPeriodDTO): AndamentoPeriodDTO {
  const days = diffCalendarDays(p.from, p.to);
  const to = addCalendarDays(p.from, -1);
  return { from: addCalendarDays(to, -days), to };
}

export function yearBefore(p: AndamentoPeriodDTO): AndamentoPeriodDTO {
  return { from: addMonths(p.from, -12), to: addMonths(p.to, -12) };
}

/** Secchi del periodo: settimane dal lunedì o mesi di calendario, tagliati agli estremi. */
export function bucketsOf(p: AndamentoPeriodDTO, g: AndamentoGranularity): AndamentoPeriodDTO[] {
  const out: AndamentoPeriodDTO[] = [];
  let from = p.from;
  while (from <= p.to) {
    let end: IsoDate;
    if (g === "week") {
      const dow = dayOfWeek(from); // 0 = domenica
      end = addCalendarDays(from, dow === 0 ? 0 : 7 - dow);
    } else {
      end = addCalendarDays(`${addMonths(`${from.slice(0, 7)}-01`, 1)}`, -1);
    }
    const to = end < p.to ? end : p.to;
    out.push({ from, to });
    from = addCalendarDays(to, 1);
  }
  return out;
}

/* ---------- statistiche ---------- */

export const round1 = (x: number) => Math.round(x * 10) / 10;
export const days = (ms: number) => ms / DAY_MS;

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return round1(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
}

export function mean(xs: number[]): number | null {
  return xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
}

/** Durate in giorni delle permanenze concluse e età di quelle in corso. */
export function durata(conclusi: number[], inCorso: number[]): AndamentoDurataDTO {
  return { conclusi: conclusi.length, mediaGiorni: mean(conclusi), medianaGiorni: median(conclusi), inCorso: inCorso.length, etaMedianaInCorsoGiorni: median(inCorso) };
}

export const inWindow = (t: number, w: Window) => t >= w.start && t < w.end;
