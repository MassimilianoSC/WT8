/**
 * Motore degli alert WT8 (B7, D-44–D-46, D-97, D-116, D-131; architettura §6). PURO: niente database né orologio.
 *
 * 1. evaluateTargets: dall'iterazione corrente, per ogni regola del gestore (src/data/alert-bindings.json), il
 *    "bersaglio" dell'episodio: è da segnalare (pending) se il trigger è una data valida, il campo di chiusura è vuoto
 *    e le condizioni di ambito o di codice valgono; la scadenza si calcola dalle soglie versionate (giorni lavorativi
 *    o di calendario, PRIMA o DOPO, rinvio al primo giorno lavorativo alle 09:00 di Roma, D-43).
 *    FATTURABILE_KO: pending con Stato attività = KO, qualunque origine (D-131).
 *    D-207 (Q10): con `isVisible` un alert il cui campo di chiusura o di trigger è nascosto da una condizione non è da
 *    segnalare (`hidden`): non si apre, non notifica e, se aperto, si chiude anche nelle regole a chiusura manuale; se il
 *    campo torna visibile si apre un nuovo episodio. Le formule continuano a calcolare anche sui campi nascosti.
 * 2. reconcileAlerts: confronta i bersagli con gli episodi esistenti dell'iterazione e restituisce le azioni.
 *    - Un episodio si apre solo a scadenza raggiunta (prima non esiste); finché è aperto, un trigger cambiato sposta
 *      la scadenza (nessun doppione).
 *    - Risolto (chiusura compilata, trigger tolto, codice cambiato, riga tolta) → chiusura AUTO, salvo le regole a
 *      chiusura manuale (OFFERTA_ODA, FATTURABILE_KO).
 *    - Chiuso a mano: definitivo per quell'episodio; un nuovo episodio (generazione + 1) solo dopo che la situazione
 *      si è risolta (resolvedAt) e torna da segnalare: campo di chiusura svuotato col trigger valido, nuovo KO (D-97).
 *      La risoluzione si registra appena avviene, anche con l'episodio ancora aperto a chiusura manuale; se la
 *      situazione torna da segnalare prima della chiusura, la risoluzione si annulla (D-137 A-01).
 *    - Promemoria settimanali (solo CDMS_EM e OFFERTA_ODA): ancore = scadenza + 7k giorni di calendario, ciascuna
 *      rinviata al primo lavorativo alle 09:00; dopo un fermo si manda UN solo promemoria, l'ultimo dovuto. Un'apertura
 *      in ritardo assorbe i turni già trascorsi; un trigger cambiato ricalcola scadenza (con la soglia della versione
 *      dell'episodio) e ricorrenza dalla nuova ancora; un episodio a chiusura manuale col trigger svuotato continua
 *      dall'ancora memorizzata (D-137 A-09, A-10, A-11, A-13).
 */
import bindingsData from "@/data/alert-bindings.json";
import { addBusinessDays, addCalendarDays, isValidIsoDate, nineAmRome, rollForwardToBusinessDay, type IsoDate } from "@/lib/calendario";
import type { FieldValue, GroupId, SelectValue, StatoAttivita, TemplateId } from "@/lib/contract";
import { isEmpty } from "@/lib/engines/conditions";

/* ---------- regole ---------- */

export interface AlertRuleSpec {
  ruleId: string;
  kind: "FIELD" | "STATO_KO";
  direction?: "AFTER" | "BEFORE";
  repeatGroup?: string;
  /** Gruppo competente: chiusura manuale (leader) e campo da evidenziare. */
  ownerGroup: GroupId;
  /** Leader destinatari oltre ai PM leader del gestore (D-45). */
  leaderGroups: GroupId[];
  extraLeaderGroups?: Partial<Record<TemplateId, GroupId[]>>;
  email: boolean;
  weeklyReminder?: boolean;
  manualClose?: boolean;
  scope?: { flowId: string; codes: string[] };
  /** emptyMatches: un campo vuoto vale come uno dei codici (D-133: Stato ODA vuoto = DA_RICHIEDERE). */
  openWhen?: { flowId: string; codes: string[]; emptyMatches?: boolean };
  templates: Partial<Record<TemplateId, { trigger?: string; close?: string }>>;
}
export const ALERT_SPECS = (bindingsData as unknown as { rules: AlertRuleSpec[] }).rules;
export const alertSpec = (ruleId: string) => ALERT_SPECS.find((r) => r.ruleId === ruleId);

export interface Threshold {
  days: number;
  unit: "WORKING_DAYS" | "CALENDAR_DAYS";
  /** Versione della soglia in rule_config (D-97: vale per gli alert non ancora emessi). */
  version: number;
}

/* ---------- scadenze ---------- */

export interface Due {
  dueLocalDate: IsoDate;
  dueAt: Date;
}

/** Scadenza dal trigger: ± giorni lavorativi o di calendario, poi primo giorno lavorativo alle 09:00 di Roma. */
export function dueOf(trigger: IsoDate, direction: "AFTER" | "BEFORE", t: Pick<Threshold, "days" | "unit">): Due {
  const n = direction === "BEFORE" ? -t.days : t.days;
  const raw = t.unit === "WORKING_DAYS" ? addBusinessDays(trigger, n) : addCalendarDays(trigger, n);
  const dueLocalDate = rollForwardToBusinessDay(raw);
  return { dueLocalDate, dueAt: nineAmRome(dueLocalDate) };
}

/** k-esimo promemoria settimanale (k ≥ 1): ancora = scadenza + 7k giorni di calendario, rinviata al lavorativo. */
export function reminderAt(dueLocalDate: IsoDate, k: number): Due {
  const local = rollForwardToBusinessDay(addCalendarDays(dueLocalDate, 7 * k));
  return { dueLocalDate: local, dueAt: nineAmRome(local) };
}

/* ---------- bersagli ---------- */

export interface AlertTarget {
  ruleId: string;
  /** Riga del gruppo ripetibile (ARPA), null per le regole sulla pratica. */
  rowId: string | null;
  subject: { flowId?: string; groupKey?: string; rowId?: string };
  pending: boolean;
  /** Scadenza; null = subito (FATTURABILE_KO). */
  due: Due | null;
  ruleVersion: number;
  /** Impronta del trigger: cambia → si ripianifica un episodio aperto. */
  sourceFingerprint: string;
  /** Data del trigger (null per FATTURABILE_KO o trigger vuoto): serve a ricalcolare con la soglia di un'altra versione. */
  trigger?: IsoDate | null;
  /** D-207 (Q10): campo di chiusura o di trigger nascosto da una condizione. */
  hidden?: boolean;
}

export interface TargetInput {
  templateId: TemplateId;
  values: Record<string, FieldValue | undefined>;
  repeats: Record<string, ReadonlyArray<{ rowId: string; values: Record<string, FieldValue | undefined> }>>;
  stato: StatoAttivita;
  thresholds: Partial<Record<string, Threshold>>;
  /**
   * D-207 (Q10): visibilità di un campo (flowId) per le condizioni del template, sulla riga del gruppo ripetibile se
   * l'alert è di riga. Assente = tutto visibile.
   */
  isVisible?: (flowId: string, row: Record<string, FieldValue | undefined> | null) => boolean;
}

const dateIn = (v: FieldValue | undefined): IsoDate | null => (typeof v === "string" && isValidIsoDate(v) ? v : null);
const codeIn = (v: FieldValue | undefined): string | null =>
  v && typeof v === "object" && !Array.isArray(v) && (v as SelectValue).code.trim() !== "" ? (v as SelectValue).code : null;
const codeMatches = (v: FieldValue | undefined, codes: string[]) => {
  const c = codeIn(v);
  return c !== null && codes.includes(c);
};

export function evaluateTargets(input: TargetInput, specs: AlertRuleSpec[] = ALERT_SPECS): AlertTarget[] {
  const out: AlertTarget[] = [];
  for (const spec of specs) {
    const binding = spec.templates[input.templateId];
    if (!binding) continue;
    const th = input.thresholds[spec.ruleId];
    if (spec.kind === "STATO_KO") {
      out.push({ ruleId: spec.ruleId, rowId: null, subject: {}, pending: input.stato === "KO", due: null, ruleVersion: th?.version ?? 0, sourceFingerprint: "KO" });
      continue;
    }
    if (!th || !binding.trigger) continue; // regola senza soglia per questo gestore: nessun alert inventato
    const evalOn = (vals: Record<string, FieldValue | undefined>, rowId: string | null) => {
      const trigger = dateIn(vals[binding.trigger!]);
      const scopeOk = !spec.scope || codeMatches(input.values[spec.scope.flowId], spec.scope.codes);
      const openOk =
        !spec.openWhen ||
        codeMatches(input.values[spec.openWhen.flowId], spec.openWhen.codes) ||
        (!!spec.openWhen.emptyMatches && codeIn(input.values[spec.openWhen.flowId]) === null);
      const closeEmpty = !binding.close || isEmpty(vals[binding.close]);
      const row = rowId ? vals : null;
      const hidden =
        !!input.isVisible &&
        [binding.close, binding.trigger].some((f) => !!f && !input.isVisible!(f, row));
      const pending = !hidden && !!trigger && scopeOk && openOk && closeEmpty;
      out.push({
        ruleId: spec.ruleId,
        rowId,
        subject: { flowId: binding.close ?? binding.trigger, ...(rowId ? { groupKey: spec.repeatGroup, rowId } : {}) },
        pending,
        due: trigger ? dueOf(trigger, spec.direction ?? "AFTER", th) : null,
        ruleVersion: th.version,
        // Solo il trigger: una soglia cambiata vale per gli alert non ancora emessi (D-97), non sposta quelli aperti.
        sourceFingerprint: trigger ?? "-",
        trigger,
        ...(hidden ? { hidden: true } : {}),
      });
    };
    if (spec.repeatGroup) for (const row of input.repeats[spec.repeatGroup] ?? []) evalOn(row.values, row.rowId);
    else evalOn(input.values, null);
  }
  return out;
}

/* ---------- riconciliazione ---------- */

export interface ExistingAlert {
  id: string;
  ruleId: string;
  rowId: string | null;
  generation: number;
  status: "OPEN" | "CLOSED";
  closeMode: "AUTO" | "MANUAL" | null;
  dueAt: Date | null;
  dueLocalDate: string | null;
  sourceFingerprint: string;
  /** Situazione risolta dopo (o con) la chiusura: abilita un nuovo episodio (D-97). */
  resolvedAt: Date | null;
  /** Promemoria già contati sull'ancora corrente (dueLocalDate). */
  reminderCount: number;
  /** Versione della soglia con cui l'episodio è stato emesso (D-97: resta la sua). */
  ruleVersion?: number;
  openedAt?: Date;
  /** Ultima emissione (apertura o promemoria): i turni dell'ancora già trascorsi a quell'istante sono consumati. */
  lastReminderAt?: Date | null;
}

export type AlertAction =
  | {
      type: "OPEN";
      ruleId: string;
      rowId: string | null;
      generation: number;
      subject: AlertTarget["subject"];
      due: Due | null;
      ruleVersion: number;
      sourceFingerprint: string;
      /** Turni settimanali già trascorsi all'apertura (apertura in ritardo, D-137 A-11): non si mandano. */
      reminderCount: number;
      nextReminder: Due | null;
    }
  | { type: "CLOSE"; alertId: string; reason: string }
  | {
      type: "RESCHEDULE";
      alertId: string;
      due: Due | null;
      sourceFingerprint: string;
      /** Versione della soglia usata per la nuova scadenza: quella dell'episodio (D-137 A-13). */
      ruleVersion: number;
      threshold: Pick<Threshold, "days" | "unit"> | null;
      /** Posizione nella ricorrenza della NUOVA ancora (D-137 A-10). */
      reminderCount: number;
      nextReminder: Due | null;
    }
  | { type: "MARK_RESOLVED"; alertId: string }
  /** Episodio aperto a chiusura manuale tornato da segnalare dopo un'uscita: la risoluzione registrata non vale più. */
  | { type: "MARK_UNRESOLVED"; alertId: string }
  | { type: "REMIND"; alertId: string; reminderCount: number; slot: IsoDate; nextReminder: Due };

const keyOf = (ruleId: string, rowId: string | null) => `${ruleId}|${rowId ?? "-"}`;

/** Turni settimanali dell'ancora già trascorsi all'istante `at` (0 se nessuno): contano come consumati. */
export function slotsElapsed(dueLocalDate: IsoDate, at: Date): number {
  let k = 0;
  while (reminderAt(dueLocalDate, k + 1).dueAt.getTime() <= at.getTime()) k++;
  return k;
}

/** Soglia di una versione precisa della regola (registro versionato), per gli episodi già emessi. */
export type ThresholdAt = (ruleId: string, version: number) => Pick<Threshold, "days" | "unit"> | undefined;

export function reconcileAlerts(
  targets: AlertTarget[],
  existing: ExistingAlert[],
  now: Date,
  specs: AlertRuleSpec[] = ALERT_SPECS,
  thresholdAt: ThresholdAt = () => undefined
): AlertAction[] {
  const actions: AlertAction[] = [];
  const latest = new Map<string, ExistingAlert>();
  for (const a of existing) {
    const k = keyOf(a.ruleId, a.rowId);
    const cur = latest.get(k);
    if (!cur || a.generation > cur.generation) latest.set(k, a);
  }
  const seen = new Set<string>();
  const due = (t: AlertTarget) => !t.due || t.due.dueAt.getTime() <= now.getTime();

  /** L'ultimo promemoria dovuto non ancora inviato, dall'ancora memorizzata (uno solo anche dopo un fermo). */
  const remind = (spec: AlertRuleSpec, last: ExistingAlert) => {
    if (!spec.weeklyReminder || !last.dueLocalDate) return;
    let k = last.reminderCount + 1;
    if (reminderAt(last.dueLocalDate, k).dueAt.getTime() > now.getTime()) return;
    while (reminderAt(last.dueLocalDate, k + 1).dueAt.getTime() <= now.getTime()) k++;
    actions.push({ type: "REMIND", alertId: last.id, reminderCount: k, slot: reminderAt(last.dueLocalDate, k).dueLocalDate, nextReminder: reminderAt(last.dueLocalDate, k + 1) });
  };

  for (const t of targets) {
    const k = keyOf(t.ruleId, t.rowId);
    seen.add(k);
    const spec = specs.find((s) => s.ruleId === t.ruleId)!;
    const last = latest.get(k);
    const open = (generation: number) => {
      // Apertura (anche in ritardo, dopo un fermo): i turni già trascorsi sono assorbiti dall'apertura stessa.
      const consumed = spec.weeklyReminder && t.due ? slotsElapsed(t.due.dueLocalDate, now) : 0;
      actions.push({
        type: "OPEN",
        ruleId: t.ruleId,
        rowId: t.rowId,
        generation,
        subject: t.subject,
        due: t.due,
        ruleVersion: t.ruleVersion,
        sourceFingerprint: t.sourceFingerprint,
        reminderCount: consumed,
        nextReminder: spec.weeklyReminder && t.due ? reminderAt(t.due.dueLocalDate, consumed + 1) : null,
      });
    };

    if (t.pending) {
      if (!last) {
        if (due(t)) open(1);
      } else if (last.status === "OPEN") {
        if (last.resolvedAt) actions.push({ type: "MARK_UNRESOLVED", alertId: last.id });
        if (last.sourceFingerprint !== t.sourceFingerprint) actions.push(reschedule(spec, t, last, thresholdAt));
        else remind(spec, last);
      } else if (last.resolvedAt && due(t)) {
        open(last.generation + 1);
      }
      continue;
    }

    // Non da segnalare. Campo nascosto (D-207, Q10): si chiude anche a chiusura manuale e non si ricorda più.
    if (last?.status === "OPEN" && t.hidden) {
      actions.push({ type: "CLOSE", alertId: last.id, reason: "Campo nascosto da una condizione: l'alert non si applica" });
      continue;
    }
    if (last?.status === "OPEN" && !spec.manualClose) actions.push({ type: "CLOSE", alertId: last.id, reason: closeReason(t) });
    // Risoluzione registrata subito, anche se l'episodio a chiusura manuale resta aperto (D-137 A-01: uscita da KO
    // prima della decisione su Fatturabile): dopo la chiusura un nuovo ingresso apre la generazione successiva.
    else if (last && !last.resolvedAt) actions.push({ type: "MARK_RESOLVED", alertId: last.id });
    // A chiusura manuale e ancora aperto (es. Offerta svuotata, D-133): i promemoria continuano dall'ancora memorizzata
    // finché qualcuno non lo chiude (D-137 A-09).
    if (last?.status === "OPEN" && spec.manualClose) remind(spec, last);
  }

  // Episodi aperti senza più un bersaglio (riga tolta): chiusi.
  for (const [k, last] of latest) {
    if (seen.has(k) || last.status !== "OPEN") continue;
    actions.push({ type: "CLOSE", alertId: last.id, reason: "Riga tolta: l'alert non si applica più" });
  }
  return actions;
}

/**
 * Trigger cambiato su un episodio aperto: stessa soglia con cui è stato emesso (D-97, D-137 A-13) e ricorrenza dalla
 * nuova ancora; i turni della nuova ancora già trascorsi all'ultima emissione sono consumati (A-10), quelli successivi
 * restano dovuti e partono al prossimo giro (uno solo).
 */
function reschedule(spec: AlertRuleSpec, t: AlertTarget, last: ExistingAlert, thresholdAt: ThresholdAt): AlertAction {
  const own = last.ruleVersion !== undefined ? thresholdAt(t.ruleId, last.ruleVersion) : undefined;
  const newDue = t.trigger && own ? dueOf(t.trigger, spec.direction ?? "AFTER", own) : t.due;
  const lastEmission = last.lastReminderAt ?? last.openedAt ?? null;
  const consumed = spec.weeklyReminder && newDue && lastEmission ? slotsElapsed(newDue.dueLocalDate, lastEmission) : 0;
  return {
    type: "RESCHEDULE",
    alertId: last.id,
    due: newDue,
    sourceFingerprint: t.sourceFingerprint,
    // Senza la soglia della sua versione (registro incompleto) si usa la corrente e la si dichiara: mai v2 spacciata per v1.
    ruleVersion: own ? last.ruleVersion! : t.ruleVersion,
    threshold: own ?? null,
    reminderCount: consumed,
    nextReminder: spec.weeklyReminder && newDue ? reminderAt(newDue.dueLocalDate, consumed + 1) : null,
  };
}

function closeReason(t: AlertTarget): string {
  return t.due ? "Situazione risolta: campo di chiusura compilato o condizione non più valida" : "Condizione non più valida";
}
