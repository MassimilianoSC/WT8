/**
 * Stato dell'assistente per l'utente e ammissione di una domanda (contratto §13.1, §13.4; D-166, D-169, D-171).
 *
 * - Una sola domanda in corso per persona (409 BUSY_USER) e al massimo `concurrency` sullo stack (429 BUSY): in
 *   memoria del processo dell'app, liberate sempre a fine domanda (anche con errore o annullamento).
 * - Limiti personali al minuto (finestra mobile di 60 s) e al giorno civile di Roma (D-171), dalle impostazioni
 *   correnti. Il contatore del giorno cresce in modo atomico solo sotto il limite; conta ogni domanda AMMESSA, anche
 *   se poi fallisce o viene interrotta (nessun rimborso che permetta ripetizioni illimitate).
 * - Lo stato non scrive niente (GET /api/assistant/status, /api/me).
 */
import { ObjectId, type Db } from "mongodb";
import type { UserDTO } from "@/lib/contract";
import { addCalendarDays, romeDate, romeTime } from "@/lib/calendario";
import { HttpError } from "@/lib/http-error";
import { store } from "@/lib/store/db";
import { circuitOpen } from "./circuit";
import { assistantConfig, type AssistantConfig } from "./config";
import { readSettings, type EffectiveSettings } from "./settings";
import type { AssistantErrorCode, AssistantStatusDTO } from "@/lib/contract";

const MINUTE_MS = 60_000;
const RECENT_KEPT = 10;

/** Errore dell'assistente prima dello stream: `{ error, code, retryAfterSeconds?, resetAt? }` (§13.4). */
export function assistantError(code: AssistantErrorCode, status: number, message: string, extra: { retryAfterSeconds?: number; resetAt?: string } = {}): HttpError {
  return new HttpError(message, status, { code, ...extra });
}

/** Mezzanotte successiva a Roma (ora legale e solare corrette). */
export function nextRomeMidnight(now: Date): Date {
  return romeTime(addCalendarDays(romeDate(now), 1), 0, 0);
}

const usageId = (userId: string, day: string) => `${userId}:${day}`;

function statusOf(cfg: AssistantConfig, s: EffectiveSettings, used: number, now: Date): AssistantStatusDTO {
  const availability = !s.enabled || !cfg.technicalEnabled ? "DISABLED" : cfg.problems.length > 0 || circuitOpen(now) ? "UNAVAILABLE" : "READY";
  return {
    enabled: cfg.technicalEnabled && s.enabled,
    availability,
    dailyLimit: s.dailyLimit,
    usedToday: used,
    remainingToday: Math.max(0, s.dailyLimit - used),
    resetAt: nextRomeMidnight(now).toISOString(),
    perMinuteLimit: s.perMinuteLimit,
  };
}

/**
 * Stato per l'utente in sessione; null se l'assistente è spento tecnicamente (PH_AI_ENABLED falso): allora
 * MeDTO.assistant è assente e il client nasconde "Chiedi". Spento dall'ADMIN: presente con enabled false.
 */
export async function assistantStatus(db: Db, user: UserDTO, now?: Date, cfg?: AssistantConfig): Promise<AssistantStatusDTO | null>;
export async function assistantStatus(db: Db, user: UserDTO, now: Date | undefined, cfg: AssistantConfig | undefined, opts: { always: true }): Promise<AssistantStatusDTO>;
/** Con `always` (GET /api/assistant/status) risponde anche da spento tecnicamente: enabled false, DISABLED. */
export async function assistantStatus(db: Db, user: UserDTO, now: Date = new Date(), cfg: AssistantConfig = assistantConfig(), opts: { always?: boolean } = {}): Promise<AssistantStatusDTO | null> {
  if (!cfg.technicalEnabled && !opts.always) return null;
  if (direzionePura(user) && !opts.always) return null;
  const s = await readSettings(db, cfg);
  const usage = await store.assistantUsage(db).findOne({ _id: usageId(user.id, romeDate(now)) }, { projection: { count: 1 } });
  return statusOf(cfg, s, usage?.count ?? 0, now);
}

/**
 * §15.2 (D-193): chi non ha appartenenze e non è ADMIN (la Direzione «pura», anche a interruttore spento) non ha
 * l'assistente: non vede pratiche. Con appartenenze l'utente conserva l'assistente delle sue appartenenze.
 */
const direzionePura = (u: UserDTO) => !u.isAdmin && u.memberships.length === 0;

/* ---------- ammissione ---------- */

interface Gate {
  users: Set<string>;
  active: number;
}
const g = global as unknown as { _assistantGate?: Gate };
const gate = (): Gate => (g._assistantGate ??= { users: new Set(), active: 0 });

export interface Admission {
  settings: EffectiveSettings;
  /** Stato dopo l'ammissione (per l'evento done). */
  status: AssistantStatusDTO;
  /** Libera la persona e il posto sullo stack; idempotente. */
  release(): void;
}

/**
 * Ammette una domanda o lancia l'errore del contratto. Ordine: spento (403) → non disponibile (503) → già in corso
 * (409) → stack pieno (429 BUSY) → limite al minuto → limite del giorno (429). Solo l'ultimo passo scrive.
 */
export async function admit(db: Db, user: UserDTO, now: Date = new Date(), cfg: AssistantConfig = assistantConfig()): Promise<Admission> {
  if (!cfg.technicalEnabled) throw assistantError("NOT_ENABLED", 403, "L'assistente non è attivo");
  if (direzionePura(user)) throw assistantError("NOT_ENABLED", 403, "L'assistente non è disponibile per il solo permesso Direzione");
  const settings = await readSettings(db, cfg);
  if (!settings.enabled) throw assistantError("NOT_ENABLED", 403, "Assistente disattivato dall'amministratore");
  if (cfg.problems.length > 0 || circuitOpen(now)) throw assistantError("UNAVAILABLE", 503, "Assistente non disponibile in questo momento. L'app funziona normalmente.");

  const gt = gate();
  if (gt.users.has(user.id)) throw assistantError("BUSY_USER", 409, "C'è già una tua domanda in corso");
  if (gt.active >= cfg.concurrency) throw assistantError("BUSY", 429, "Troppe domande in corso: riprova tra poco", { retryAfterSeconds: 2 });
  gt.users.add(user.id);
  gt.active++;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    gt.users.delete(user.id);
    gt.active--;
  };

  try {
    const day = romeDate(now);
    const id = usageId(user.id, day);
    const resetAt = nextRomeMidnight(now);
    const current = await store.assistantUsage(db).findOne({ _id: id });
    const recent = (current?.recent ?? []).filter((t) => now.getTime() - t.getTime() < MINUTE_MS).sort((a, b) => a.getTime() - b.getTime());
    if (recent.length >= settings.perMinuteLimit) {
      const wait = recent[recent.length - settings.perMinuteLimit].getTime() + MINUTE_MS - now.getTime();
      throw assistantError("QUOTA_USER_MINUTE", 429, "Hai fatto molte domande in poco tempo: riprova tra qualche secondo", {
        retryAfterSeconds: Math.max(1, Math.ceil(wait / 1000)),
        resetAt: new Date(now.getTime() + wait).toISOString(),
      });
    }
    const dayFull = () =>
      assistantError("QUOTA_USER_DAY", 429, "Hai raggiunto il limite di domande di oggi", {
        retryAfterSeconds: Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000)),
        resetAt: resetAt.toISOString(),
      });
    let after: number;
    try {
      const r = await store.assistantUsage(db).findOneAndUpdate(
        { _id: id, count: { $lt: settings.dailyLimit } },
        {
          $inc: { count: 1 },
          $push: { recent: { $each: [now], $slice: -RECENT_KEPT } },
          $setOnInsert: { userId: new ObjectId(user.id), day, expiresAt: new Date(resetAt.getTime() + 24 * 3600_000) },
        },
        { upsert: true, returnDocument: "after" }
      );
      after = r!.count;
    } catch (e) {
      // Documento del giorno già al limite: il filtro non trova niente e l'upsert urta l'_id esistente.
      if ((e as { code?: number }).code === 11000) throw dayFull();
      throw e;
    }
    return { settings, status: statusOf(cfg, settings, after, now), release };
  } catch (e) {
    release();
    throw e;
  }
}

/** Solo prove: azzera persone in corso e posti occupati del processo. */
export function resetGate(): void {
  g._assistantGate = { users: new Set(), active: 0 };
}
