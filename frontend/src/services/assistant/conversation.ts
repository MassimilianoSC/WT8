/**
 * Conversazione SOLO in memoria del processo dell'app (contratto §13.2, D-170): nessun testo salvato nel database.
 * Scade dopo 15 minuti di inattività o 2 ore, massimo 8 domande e 6000 caratteri di domande precedenti; un riavvio
 * la fa scadere. Si conservano solo le domande dell'utente (testo dell'utente, non dati probanti): risposte, note e
 * risultati degli strumenti NON si reinviano al modello (progetto §2.3). Per il seguito ("la prima", "quella di …")
 * si conservano anche i RIFERIMENTI del turno precedente (solo id pratica e iterazione, nell'ordine della risposta) e
 * la selezione normalizzata: al turno dopo si riautorizzano con l'utente riletto (orchestrator). Il possesso dell'id
 * non autorizza: serve lo stesso utente (altrimenti 404 come inesistente).
 */
import { randomUUID } from "node:crypto";
import { assistantError } from "./quota";
import type { Selection } from "./tools/common";

export const CONVERSATION_IDLE_MS = 15 * 60_000;
export const CONVERSATION_MAX_MS = 2 * 3600_000;
export const CONVERSATION_MAX_QUESTIONS = 8;
export const CONVERSATION_MAX_CHARS = 6000;

export interface Conversation {
  id: string;
  userId: string;
  createdAt: number;
  lastAt: number;
  questions: string[];
  /** Pratiche del turno precedente, nell'ordine della risposta (solo id e iterazione: niente nomi né testo). */
  refs: ConversationRef[];
  /** Selezione normalizzata dell'ultimo strumento con selezione del turno precedente. */
  selection: Selection | null;
}

export interface ConversationRef {
  practiceId: string;
  iteration: number;
}

export const CONVERSATION_MAX_REFS = 10;

const g = global as unknown as { _assistantConversations?: Map<string, Conversation> };
const all = () => (g._assistantConversations ??= new Map());

const expired = (c: Conversation, now: number) => now - c.lastAt > CONVERSATION_IDLE_MS || now - c.createdAt > CONVERSATION_MAX_MS || c.questions.length >= CONVERSATION_MAX_QUESTIONS;

function sweep(now: number) {
  // Le scadute restano qualche ora per rispondere 409 invece di 404 al proprietario; poi si tolgono.
  for (const [id, c] of all()) if (now - c.lastAt > CONVERSATION_MAX_MS + CONVERSATION_IDLE_MS) all().delete(id);
}

/** Conversazione esistente dell'utente (404 se sconosciuta o di altri, 409 se scaduta) o una nuova. */
export function openConversation(userId: string, conversationId: string | undefined, now: Date): Conversation {
  const t = now.getTime();
  sweep(t);
  if (!conversationId) {
    const c: Conversation = { id: randomUUID(), userId, createdAt: t, lastAt: t, questions: [], refs: [], selection: null };
    all().set(c.id, c);
    return c;
  }
  const c = all().get(conversationId);
  if (!c || c.userId !== userId) throw assistantError("CONVERSATION_NOT_FOUND", 404, "Conversazione non trovata");
  if (expired(c, t)) throw assistantError("CONVERSATION_EXPIRED", 409, "La conversazione è scaduta: iniziane una nuova");
  return c;
}

/** Domande precedenti da dare come contesto, dalle più recenti, entro il limite di caratteri. */
export function previousQuestions(c: Conversation): string[] {
  const out: string[] = [];
  let chars = 0;
  for (const q of [...c.questions].reverse()) {
    if (chars + q.length > CONVERSATION_MAX_CHARS) break;
    chars += q.length;
    out.unshift(q);
  }
  return out;
}

export function recordQuestion(c: Conversation, text: string, now: Date): void {
  c.questions.push(text);
  c.lastAt = now.getTime();
}

/** Riferimenti dell'ultimo turno: sostituiscono i precedenti (un turno finito male li lascia vuoti). */
export function recordReferences(c: Conversation, refs: ConversationRef[], selection: Selection | null): void {
  c.refs = refs.slice(0, CONVERSATION_MAX_REFS);
  c.selection = selection;
}

/** Revoca dei permessi durante la domanda (AUTH_CHANGED): la conversazione si svuota e sparisce. */
export function dropConversation(id: string): void {
  all().delete(id);
}

/** Solo prove. */
export function resetConversations(): void {
  g._assistantConversations = new Map();
}
