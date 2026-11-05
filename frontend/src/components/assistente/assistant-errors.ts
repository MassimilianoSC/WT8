import { SUPPORT_EMAIL } from "@/components/layout/support";
import type { AskOutcome } from "@/components/assistente/assistant-source";
import type { AssistantAnswerState, AssistantStatusDTO } from "@/components/assistente/types";

/**
 * Texts of the assistant's states and errors (contract §13.4, project §9).
 * Fixed Italian texts chosen by code; the server's message is used only where
 * it adds the detail (a too broad question). Colour is for errors and quota
 * only; "no data", clarifications and blocked answers are neutral.
 */

export const APP_WORKS = "L'app funziona normalmente.";
export const SUPPORT_HINT = `Se il problema continua scrivi a ${SUPPORT_EMAIL}.`;
export const DISCLAIMER = "Sola lettura. Le risposte possono contenere errori: verifica sulla scheda.";
export const DISABLED_TEXT = "Assistente disattivato dall'amministratore.";
export const UNAVAILABLE_TEXT = "L'assistente non è disponibile in questo momento.";

export type NoticeTone = "error" | "quota" | "neutral";
/** What the user can do next. */
export type NoticeAction = "retry" | "new-conversation" | "login" | "none";

export interface Notice {
  tone: NoticeTone;
  title: string;
  detail?: string;
  action: NoticeAction;
}

const TIME = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
const DAY = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric" });

/** "10:42", Rome time. */
export function romeTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : TIME.format(d);
}

/** "09/10/2026" from "YYYY-MM-DD" or an ISO timestamp, Rome day. */
export function romeDay(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  }
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : DAY.format(d);
}

export function periodText(p: { from: string; to: string }): string {
  return p.from === p.to ? romeDay(p.from) : `dal ${romeDay(p.from)} al ${romeDay(p.to)}`;
}

/** "Dati letti alle 10:42", or the interval when the reading spans minutes. */
export function readAtText(readStartedAt: string, asOf: string): string {
  const a = romeTime(readStartedAt);
  const b = romeTime(asOf);
  if (!b) return "";
  return a && a !== b ? `Dati letti tra le ${a} e le ${b}` : `Dati letti alle ${b}`;
}

function seconds(n: number | undefined): string {
  if (!n || n <= 0) return "tra qualche secondo";
  return n === 1 ? "tra 1 secondo" : `tra ${Math.ceil(n)} secondi`;
}

const technical = (title: string): Notice => ({ tone: "error", title, detail: `${APP_WORKS} ${SUPPORT_HINT}`, action: "retry" });

/** Notice for an outcome that is not a `done`. */
export function outcomeNotice(outcome: Exclude<AskOutcome, { kind: "done" }>, status?: AssistantStatusDTO | null): Notice {
  if (outcome.kind === "aborted") return { tone: "neutral", title: "Risposta interrotta da te.", action: "retry" };
  if (outcome.kind === "interrupted") {
    return { tone: "error", title: "Risposta interrotta.", detail: `Il testo arrivato resta qui sopra. ${APP_WORKS}`, action: "retry" };
  }
  switch (outcome.code) {
    case "UNAUTHENTICATED":
    case "AUTH_CHANGED":
      return { tone: "error", title: "Sessione scaduta: accedi di nuovo.", action: "login" };
    case "NOT_ENABLED":
      return { tone: "neutral", title: DISABLED_TEXT, action: "none" };
    case "ORIGIN_DENIED":
      return { tone: "error", title: "Richiesta non consentita: ricarica la pagina.", detail: APP_WORKS, action: "none" };
    case "NOT_FOUND":
      return { tone: "neutral", title: "La pratica del contesto non è disponibile: togli il contesto e riprova.", action: "none" };
    case "CONVERSATION_NOT_FOUND":
    case "CONVERSATION_EXPIRED":
      return { tone: "neutral", title: "La conversazione è scaduta.", detail: "Inizia una nuova conversazione: la domanda resta nel campo.", action: "new-conversation" };
    case "BUSY_USER":
      return { tone: "neutral", title: "Hai già una domanda in corso, anche in un'altra scheda del browser: attendi la risposta.", action: "retry" };
    case "DATA_CHANGED":
      return { tone: "neutral", title: "I dati sono cambiati durante la lettura.", action: "retry" };
    case "BODY_TOO_LARGE":
    case "INVALID_REQUEST":
      return { tone: "neutral", title: "Domanda non valida: scrivi da 1 a 2000 caratteri.", action: "none" };
    case "QUERY_TOO_BROAD":
      return {
        tone: "neutral",
        title: outcome.message || "La domanda riguarda troppe pratiche: restringi a un cliente, uno stato o un periodo.",
        action: "none",
      };
    case "QUOTA_USER_MINUTE": {
      const n = status?.perMinuteLimit;
      return {
        tone: "quota",
        title: n ? `Hai fatto ${n} domande nell'ultimo minuto.` : "Troppe domande in un minuto.",
        detail: `Riprova ${seconds(outcome.retryAfterSeconds)}.`,
        action: "none",
      };
    }
    case "QUOTA_USER_DAY": {
      const n = status?.dailyLimit;
      const reset = outcome.resetAt ?? status?.resetAt;
      return {
        tone: "quota",
        title: n ? `Hai usato ${n} domande su ${n} oggi.` : "Hai usato tutte le domande di oggi.",
        detail: reset ? `Il conteggio riparte domani (${romeDay(reset)}, ore ${romeTime(reset)}).` : "Il conteggio riparte domani.",
        action: "none",
      };
    }
    case "BUSY":
      return { tone: "neutral", title: `L'assistente è molto richiesto: riprova ${seconds(outcome.retryAfterSeconds ?? 2)}.`, action: "retry" };
    case "PROVIDER_QUOTA":
      return technical("Il servizio AI è al limite in questo momento: riprova più tardi.");
    case "UNAVAILABLE":
    case "NETWORK":
      return technical(UNAVAILABLE_TEXT);
    case "TIMEOUT":
      return technical("L'assistente non ha risposto in tempo.");
    case "BLOCKED":
      return { tone: "neutral", title: "Non posso rispondere a questa domanda.", action: "none" };
    case "INTERNAL":
    default:
      return technical("Errore dell'assistente.");
  }
}

/** Note shown under a concluded answer whose state is not a plain answer; null for ANSWER. */
export function answerStateNotice(state: AssistantAnswerState, truncated: boolean): Notice | null {
  switch (state) {
    case "NO_DATA":
      return { tone: "neutral", title: "Non trovo dati per rispondere.", detail: "Nessuna pratica visibile a te corrisponde alla richiesta.", action: "none" };
    case "INSUFFICIENT_EVIDENCE":
      return { tone: "neutral", title: "Le informazioni registrate non bastano per rispondere con certezza.", action: "none" };
    case "PARTIAL":
      return { tone: "neutral", title: "Risposta parziale: non tutti i dati richiesti sono stati letti.", action: "none" };
    case "CLARIFY":
      return { tone: "neutral", title: "Serve una precisazione: rispondi qui sotto.", action: "none" };
    case "OUT_OF_SCOPE":
      return { tone: "neutral", title: "Rispondo solo sui dati di WT8.", action: "none" };
    case "ANSWER":
    default:
      return truncated ? { tone: "neutral", title: "Risposta troncata: restringi la domanda per averla completa.", action: "none" } : null;
  }
}

/** "12/30 oggi", or null without a status. */
export function usageText(status: AssistantStatusDTO | null | undefined): string | null {
  if (!status) return null;
  return `${status.usedToday}/${status.dailyLimit} oggi`;
}
