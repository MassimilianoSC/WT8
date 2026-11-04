/**
 * Formule di calendario dei campi calcolati (D-42). Funzioni PURE su date "YYYY-MM-DD": le formule
 * usano giorni di CALENDARIO (D-43); i giorni lavorativi servono solo alle soglie degli alert.
 * Restituiscono null se la data di partenza è vuota, così il campo calcolato resta vuoto.
 */
import { addCalendarDays, diffCalendarDays, type IsoDate } from "@/lib/calendario";
import type { SelectValue, TemplateId } from "@/lib/contract";

/** "YYYY-MM-DD" → "gg/mm/aaaa" per i testi mostrati all'utente (D-38). */
const it = (d: IsoDate) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

const orNull = (base: IsoDate | null | undefined, days: number): IsoDate | null =>
  base ? addCalendarDays(base, days) : null;

/** Forecast Geologica = Assegnazione Geologica + 15 giorni (D-34, tutti i gestori). */
export const FORECAST_GEOLOGICA_GIORNI = 15;
export function forecastGeologica(assegnazioneGeologica: IsoDate | null | undefined): IsoDate | null {
  return orNull(assegnazioneGeologica, FORECAST_GEOLOGICA_GIORNI);
}

/** Forecast Ottenimento Permessi base = Protocollo + 67 giorni, solo per questi gestori (D-42); altrove è manuale. */
export const FORECAST_OTTENIMENTO_PERMESSI_GIORNI = 67;
export const FORECAST_OTTENIMENTO_PERMESSI_TEMPLATES: readonly TemplateId[] = ["TOWERNET", "INWIT", "LEONARDO"];

export function forecastOttenimentoPermessiBase(
  templateId: TemplateId,
  protocollo: IsoDate | null | undefined
): IsoDate | null {
  if (!FORECAST_OTTENIMENTO_PERMESSI_TEMPLATES.includes(templateId)) return null;
  return orNull(protocollo, FORECAST_OTTENIMENTO_PERMESSI_GIORNI);
}

/** ILIAD: Forecast Protocollo = Data assegnazione + 30 giorni (D-42). */
export const FORECAST_PROTOCOLLO_ILIAD_GIORNI = 30;
export function forecastProtocolloIliad(dataAssegnazione: IsoDate | null | undefined): IsoDate | null {
  return orNull(dataAssegnazione, FORECAST_PROTOCOLLO_ILIAD_GIORNI);
}

/* ---------- spostamento del Forecast Ottenimento Permessi per integrazione (D-42) ---------- */

/** Soglia: lo spostamento si applica se mancano al massimo 15 giorni al forecast base. */
export const SOGLIA_SPOSTAMENTO_GIORNI = 15;

/** Esito del controllo, da memorizzare: si esegue UNA volta per integrazione e non si ripete. */
export interface ControlloSpostamento {
  /** Giorno (a Roma) del primo salvataggio di Invio integrazione. */
  eseguitoIl: IsoDate;
  /** Forecast base − giorno del controllo (negativo se il forecast base era già passato). */
  giorniMancanti: number;
  idoneo: boolean;
}

/**
 * Da chiamare al primo salvataggio di Invio integrazione: "in quel momento" = oggi a Roma, non la data
 * scritta nel campo. Senza forecast base non c'è nulla da spostare: restituisce null.
 */
export function verificaSpostamento(base: IsoDate | null | undefined, oggi: IsoDate): ControlloSpostamento | null {
  if (!base) return null;
  const giorniMancanti = diffCalendarDays(oggi, base);
  return { eseguitoIl: oggi, giorniMancanti, idoneo: giorniMancanti <= SOGLIA_SPOSTAMENTO_GIORNI };
}

export interface IntegrazioneDate {
  richiesta: IsoDate | null | undefined;
  invio: IsoDate | null | undefined;
  /** Esito memorizzato di verificaSpostamento; assente se il controllo non è ancora stato fatto. */
  controllo?: ControlloSpostamento | null;
}

export interface ForecastOttenimentoPermessi {
  forecast: IsoDate | null;
  /** Giorni aggiunti al forecast base (0 se nessuno spostamento). */
  spostamentoGiorni: number;
  /** Spiegazione leggibile, adatta a un toast (D-42). */
  motivazione: string;
  /** Situazione anomala da segnalare (es. date dell'integrazione incoerenti). */
  avviso?: string;
}

/**
 * Forecast Ottenimento Permessi = forecast base + (Invio − Richiesta) dell'ULTIMA integrazione compilata
 * (righe in ordine, con Richiesta e Invio valorizzate), solo se il controllo di quell'integrazione è idoneo.
 * Lo spostamento non si somma tra integrazioni. Il delta segue sempre le date correnti, il controllo no.
 * Il blocco per modifica manuale del campo spetta al motore, non a questa funzione.
 */
export function forecastOttenimentoPermessi(
  base: IsoDate | null | undefined,
  integrazioni: readonly IntegrazioneDate[]
): ForecastOttenimentoPermessi {
  if (!base) return { forecast: null, spostamentoGiorni: 0, motivazione: "Forecast base non disponibile (manca il Protocollo)." };
  const ultima = [...integrazioni].reverse().find((i) => i.richiesta && i.invio);
  if (!ultima) return { forecast: base, spostamentoGiorni: 0, motivazione: "Nessuna integrazione completata: vale il forecast base." };

  const richiesta = ultima.richiesta as IsoDate;
  const invio = ultima.invio as IsoDate;
  if (!ultima.controllo) {
    return { forecast: base, spostamentoGiorni: 0, motivazione: "Controllo dei 15 giorni non ancora eseguito per l'ultima integrazione." };
  }
  if (!ultima.controllo.idoneo) {
    const mancanti = ultima.controllo.giorniMancanti;
    return {
      forecast: base,
      spostamentoGiorni: 0,
      motivazione: Number.isFinite(mancanti)
        ? `Nessuno spostamento: al ${it(ultima.controllo.eseguitoIl)} mancavano ${mancanti} giorni al forecast (soglia ${SOGLIA_SPOSTAMENTO_GIORNI}).`
        : `Nessuno spostamento: al ${it(ultima.controllo.eseguitoIl)} il forecast base non era disponibile (manca il Protocollo).`,
    };
  }
  const delta = diffCalendarDays(richiesta, invio);
  if (delta < 0) {
    return {
      forecast: base,
      spostamentoGiorni: 0,
      motivazione: "Nessuno spostamento: Invio integrazione è precedente alla Richiesta.",
      avviso: `Date dell'integrazione incoerenti: richiesta ${it(richiesta)}, invio ${it(invio)}.`,
    };
  }
  const forecast = addCalendarDays(base, delta);
  return {
    forecast,
    spostamentoGiorni: delta,
    motivazione: `Forecast Ottenimento Permessi spostato di ${delta} giorni (integrazione dal ${it(richiesta)} al ${it(invio)}): nuovo forecast ${it(forecast)}.`,
  };
}

/* ---------- Fatturabile (D-37) ---------- */

export const FATTURABILE_GIORNI = 30;

/**
 * Data da cui Fatturabile può diventare SI in automatico: Ottenimento Permessi + 30 giorni di calendario.
 * Solo la data: esito ARPA, blocco manuale e ricalcoli li gestisce il motore.
 */
export function dataScattoFatturabile(ottenimentoPermessi: IsoDate | null | undefined): IsoDate | null {
  return orNull(ottenimentoPermessi, FATTURABILE_GIORNI);
}

/* ---------- Tipologia attività PE (D-32) ---------- */

const valorizzato = (v: SelectValue | null | undefined): v is SelectValue =>
  !!v && v.code.trim() !== "" && (v.code !== "ALTRO" || !!v.otherText?.trim());

/**
 * Tipologia attività PE, sempre automatica: = Progetto se il campo esiste nel template ed è valorizzato,
 * altrimenti = Incarico / Lavorazione. Il valore si copia così com'è: la lista di Tipologia attività PE è
 * l'unione dei valori di Progetto e di Incarico / Lavorazione del gestore (LISTE_VALORI_INIZIALI).
 */
export function tipologiaAttivitaPE(input: {
  templateHaProgetto: boolean;
  progetto?: SelectValue | null;
  incaricoLavorazione?: SelectValue | null;
}): SelectValue | null {
  if (input.templateHaProgetto && valorizzato(input.progetto)) return { ...input.progetto };
  if (valorizzato(input.incaricoLavorazione)) return { ...input.incaricoLavorazione };
  return null;
}
