/**
 * Motore dello Stato attività (B5a, D-41, D-115, architettura §4). PURO: niente database né orologio.
 *
 * - Trigger come DATI (src/data/state-rules.json, Guida §14 corretta): una regola dà uno stato fisso quando la sua
 *   data è valida (`status`), oppure lo stato che corrisponde al VALORE di un campo quando la data è valida
 *   (`valueFlowId` + `statusByValue`, es. Autorizzazione finale in TOWERNET e INWIT).
 * - Si usano TUTTE le date valide dell'iterazione corrente: vince la più recente; a parità decide il rango
 *   provvisorio (D-109); mai l'ultima modifica. Svuotare un trigger o togliere una riga fa tornare al massimo
 *   restante, oppure a CREATA.
 * - Manuale (D-115, D-119, D-126 M-01): uno stato impostato a mano resta finché non vince un evento automatico NUOVO,
 *   cioè STRETTAMENTE successivo, nell'ordine completo (data, rango, ordinal), all'evento vincente memorizzato al
 *   comando manuale. Svuotare un trigger non rilascia il manuale; una nuova data più recente sì, anche se lo stato
 *   calcolato resta uguale. Lo stato automatico e il suo evento si calcolano e si memorizzano sempre.
 */
import rulesData from "@/data/state-rules.json";
import { isValidIsoDate, type IsoDate } from "@/lib/calendario";
import type { FieldValue, SelectValue, StatoAttivita, TemplateId } from "@/lib/contract";
import type { AutoEventRef, StateMetaDoc } from "@/lib/store/types";

export interface StateRule {
  ruleId: string;
  templateId: TemplateId;
  /** Stato fisso prodotto dalla data. Assente nelle regole per valore. */
  status?: StatoAttivita;
  dateFlowId: string;
  /** Regola per valore: campo SELECT il cui codice decide lo stato (statusByValue). */
  valueFlowId?: string;
  statusByValue?: Partial<Record<string, StatoAttivita>>;
  /** Codici del campo valore ancora senza decisione (nessun evento), con il motivo. */
  pendingValues?: Record<string, string>;
  repeatGroup?: string;
  active: boolean;
  pending?: string;
  source: string;
}
interface StateRulesData {
  version: string;
  statusOrder: { ranks: Partial<Record<StatoAttivita, number>> };
  rules: StateRule[];
}
export const STATE_RULES = rulesData as unknown as StateRulesData;

export interface StateInput {
  templateId: TemplateId;
  values: Record<string, FieldValue | undefined>;
  /** Righe per gruppo ripetibile dell'iterazione corrente. */
  repeats: Record<string, ReadonlyArray<{ rowId: string; ordinal: number; values: Record<string, FieldValue | undefined> }>>;
}

export interface AutomaticState {
  stato: StatoAttivita;
  ruleId: string | null;
  date: IsoDate | null;
  rowId?: string;
  /** Rango dello stato vincente (statusOrder) e ordinal della riga (0 = campo non ripetibile): ordine completo, M-01. */
  rank: number;
  ordinal: number;
  diagnostics: string[];
}

const dateOf = (v: FieldValue | undefined): IsoDate | null => (typeof v === "string" && isValidIsoDate(v) ? v : null);
const codeOf = (v: FieldValue | undefined): string | null =>
  v && typeof v === "object" && !Array.isArray(v) && (v as SelectValue).code.trim() !== "" ? (v as SelectValue).code : null;

/** Stato prodotto da una regola sui valori dati (riga o pratica), oppure null. */
function statusFor(r: StateRule, values: Record<string, FieldValue | undefined>): StatoAttivita | null {
  if (!r.valueFlowId) return r.status ?? null;
  const code = codeOf(values[r.valueFlowId]);
  return code ? (r.statusByValue?.[code] ?? null) : null;
}

/** Stato automatico dalle regole attive del template (§4.3). */
export function deriveAutomaticState(input: StateInput, data: StateRulesData = STATE_RULES): AutomaticState {
  const rank = (s: StatoAttivita) => data.statusOrder.ranks[s] ?? 0;
  const events: Array<{ status: StatoAttivita; date: IsoDate; ruleId: string; rowId?: string; ordinal: number }> = [];
  for (const r of data.rules) {
    if (!r.active || r.templateId !== input.templateId) continue;
    if (r.repeatGroup) {
      for (const row of input.repeats[r.repeatGroup] ?? []) {
        const d = dateOf(row.values[r.dateFlowId]);
        const status = statusFor(r, row.values);
        if (d && status) events.push({ status, date: d, ruleId: r.ruleId, rowId: row.rowId, ordinal: row.ordinal });
      }
    } else {
      const d = dateOf(input.values[r.dateFlowId]);
      const status = statusFor(r, input.values);
      if (d && status) events.push({ status, date: d, ruleId: r.ruleId, ordinal: 0 });
    }
  }
  if (events.length === 0) return { stato: "CREATA", ruleId: null, date: null, rank: 0, ordinal: 0, diagnostics: [] };
  // Data più recente, poi rango dello stato; lo spareggio tecnico (ordinal) vale solo tra eventi dello STESSO stato.
  events.sort((a, b) => b.date.localeCompare(a.date) || rank(b.status) - rank(a.status) || b.ordinal - a.ordinal);
  const top = events[0];
  const diagnostics: string[] = [];
  const rivals = events.filter((e) => e.date === top.date && e.status !== top.status && rank(e.status) === rank(top.status));
  if (rivals.length) diagnostics.push(`TIE_UNRESOLVED: ${top.status} e ${rivals.map((r) => r.status).join(", ")} con la stessa data ${top.date} e lo stesso rango`);
  return { stato: top.status, ruleId: top.ruleId, date: top.date, ...(top.rowId ? { rowId: top.rowId } : {}), rank: rank(top.status), ordinal: top.ordinal, diagnostics };
}

/** Stato di una nuova iterazione (creazione, ripresentazione D-25): CREATA, nessun residuo manuale. */
export function newStateMeta(): StateMetaDoc {
  return { stato: "CREATA", source: "AUTO", autoStato: "CREATA", autoEvent: null, manualBaseline: null, manualAt: null, manualBy: null };
}

/** Evento vincente del calcolo automatico, oppure null se nessun trigger è valido. */
export function autoEventOf(auto: AutomaticState): AutoEventRef | null {
  if (!auto.ruleId || !auto.date) return null;
  return { ruleId: auto.ruleId, date: auto.date, stato: auto.stato, rank: auto.rank, ordinal: auto.ordinal, ...(auto.rowId ? { rowId: auto.rowId } : {}) };
}

/**
 * D-119, M-01 (D-126): l'evento `ev` è NUOVO rispetto a `base` (vincente al comando manuale) solo se lo supera
 * STRETTAMENTE nell'ordine completo con cui vince: data, poi rango dello stato, poi ordinal della riga. Un fallback
 * (trigger svuotato, riga tolta) fa vincere un evento già esistente di precedenza inferiore: non rilascia mai.
 * D-127: stessa regola, stessa riga e stessa data ma esito diverso (es. Autorizzazione finale AUTORIZZATO → DINIEGATO)
 * è un'informazione nuova scritta nel trigger: evento nuovo.
 */
export function isNewerEvent(ev: AutoEventRef | null, base: AutoEventRef | null | undefined): boolean {
  if (!ev) return false;
  if (!base) return true;
  if (ev.date !== base.date) return ev.date > base.date;
  if (ev.ruleId === base.ruleId && (ev.rowId ?? null) === (base.rowId ?? null)) return base.stato !== undefined && ev.stato !== base.stato;
  const r = (ev.rank ?? 0) - (base.rank ?? 0);
  if (r !== 0) return r > 0;
  return (ev.ordinal ?? 0) > (base.ordinal ?? 0);
}

export interface StateChange {
  next: StateMetaDoc;
  /** Lo stato mostrato è cambiato: va registrato un evento STATO. */
  changed: boolean;
  from: StatoAttivita;
  to: StatoAttivita;
  /** Il manuale è stato superato da un nuovo evento automatico (D-115, D-119). */
  manualReleased: boolean;
}

/**
 * Applica il risultato automatico ed eventualmente un comando manuale (PM/ADMIN, controllato dal servizio).
 * Senza comando, un manuale resta finché non vince un evento automatico più recente di quello memorizzato al
 * comando manuale (D-119); allora riprende il controllo l'automatico.
 */
/**
 * §15.4 (D-192): data del fatto che ha generato uno stato automatico, da scrivere nell'evento STATO
 * (structuredDetail.autoEventDate); niente per gli stati manuali o senza evento.
 */
export function autoEventDateOf(next: StateMetaDoc): { autoEventDate: IsoDate } | Record<string, never> {
  return next.source === "AUTO" && next.autoEvent?.date ? { autoEventDate: next.autoEvent.date } : {};
}

export function applyState(
  prev: StateMetaDoc,
  auto: AutomaticState,
  manual?: { stato: StatoAttivita; actorId: StateMetaDoc["manualBy"]; at: Date }
): StateChange {
  const ev = autoEventOf(auto);
  let next: StateMetaDoc;
  let manualReleased = false;
  if (manual) {
    next = { stato: manual.stato, source: "MANUAL", autoStato: auto.stato, autoEvent: ev, manualBaseline: ev, manualAt: manual.at, manualBy: manual.actorId };
  } else if (prev.source === "MANUAL" && !isNewerEvent(ev, prev.manualBaseline)) {
    next = { ...prev, autoStato: auto.stato, autoEvent: ev };
  } else {
    manualReleased = prev.source === "MANUAL";
    next = { stato: auto.stato, source: "AUTO", autoStato: auto.stato, autoEvent: ev, manualBaseline: null, manualAt: null, manualBy: null };
  }
  return { next, changed: next.stato !== prev.stato, from: prev.stato, to: next.stato, manualReleased };
}
