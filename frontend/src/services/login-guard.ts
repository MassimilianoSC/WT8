/**
 * Protezione del login (PR-22): limite ai tentativi falliti, per email e per indirizzo.
 *
 * - Più di `perEmail` fallimenti per la stessa email, o `perIp` per lo stesso indirizzo, negli ultimi `windowMs` →
 *   l'accesso è rifiutato (anche con la password giusta) finché la finestra non scorre.
 * - Limiti da deploy/.env: PH_LOGIN_LIMIT_PER_EMAIL (default 5) e PH_LOGIN_LIMIT_PER_IP (default 0 = spento). Il limite
 *   per indirizzo è SPENTO di default: con Docker Desktop su Windows tutte le connessioni dagli altri PC arrivano
 *   all'app con l'indirizzo del gateway di Docker (verificato: 172.17.0.1 anche entrando dall'IP della macchina), quindi
 *   sommerebbe gli errori di tutta l'azienda. Caddy sovrascrive un X-Forwarded-For inviato dal client (verificato):
 *   il limite, quando acceso, non si aggira.
 * - Un accesso riuscito azzera i fallimenti di quell'email (non quelli dell'indirizzo).
 * - I tentativi stanno in login_attempts con scadenza automatica (TTL): nessuna crescita senza limite.
 * Il controllo vale per qualunque verifica delle credenziali (oggi la beta, dal cutover gli utenti del modello nuovo).
 */
import { ObjectId, type Db } from "mongodb";
import { HttpError } from "@/lib/http-error";
import { store } from "@/lib/store/db";

export interface LoginLimits {
  perEmail: number;
  /** 0 = limite per indirizzo spento. */
  perIp: number;
  windowMs: number;
}

export const LOGIN_LIMITS: LoginLimits = { perEmail: 5, perIp: 0, windowMs: 15 * 60_000 };

export function loginLimitsFromEnv(env: NodeJS.ProcessEnv = process.env): LoginLimits {
  const int = (v: string | undefined, d: number) => (v !== undefined && /^\d+$/.test(v.trim()) ? Number(v.trim()) : d);
  return { ...LOGIN_LIMITS, perEmail: Math.max(1, int(env.PH_LOGIN_LIMIT_PER_EMAIL, LOGIN_LIMITS.perEmail)), perIp: int(env.PH_LOGIN_LIMIT_PER_IP, LOGIN_LIMITS.perIp) };
}

export class TooManyLoginAttempts extends Error {
  constructor(readonly retryAfterMs: number) {
    super("Troppi tentativi di accesso: riprova più tardi");
    this.name = "TooManyLoginAttempts";
  }
}

const emailKey = (email: string) => `email:${email.trim().toLowerCase()}`;
const ipKey = (ip: string) => `ip:${ip}`;

/** Indirizzo del client dietro il proxy (Caddy imposta X-Forwarded-For): il primo valore. */
export function clientIp(headers: Headers | null | undefined): string | null {
  const forwarded = headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers?.get("x-real-ip")?.trim() || null;
}

async function blockedFor(db: Db, key: string, limit: number, now: Date, windowMs: number): Promise<number> {
  const since = new Date(now.getTime() - windowMs);
  const recent = await store.loginAttempts(db).find({ key, at: { $gt: since } }, { projection: { at: 1 } }).sort({ at: 1 }).toArray();
  if (recent.length < limit) return 0;
  // Libero quando il più vecchio dei tentativi che superano il limite esce dalla finestra.
  const oldest = recent[recent.length - limit].at;
  return oldest.getTime() + windowMs - now.getTime();
}

/**
 * Verifica le credenziali con il limite ai tentativi. `verify` restituisce l'utente o null (credenziali errate).
 * TooManyLoginAttempts se l'email o l'indirizzo hanno superato il limite: in quel caso `verify` non viene chiamata.
 */
export async function guardedLogin<T>(
  ctx: { db: Db; email: string; ip: string | null; now?: Date; limits?: LoginLimits },
  verify: () => Promise<T | null>
): Promise<T | null> {
  const now = ctx.now ?? new Date();
  const limits = ctx.limits ?? loginLimitsFromEnv();
  const keys = [{ key: emailKey(ctx.email), limit: limits.perEmail }, ...(ctx.ip && limits.perIp > 0 ? [{ key: ipKey(ctx.ip), limit: limits.perIp }] : [])];
  for (const k of keys) {
    const wait = await blockedFor(ctx.db, k.key, k.limit, now, limits.windowMs);
    if (wait > 0) throw new TooManyLoginAttempts(wait);
  }
  const user = await verify();
  if (user) {
    await store.loginAttempts(ctx.db).deleteMany({ key: emailKey(ctx.email) });
    return user;
  }
  const expiresAt = new Date(now.getTime() + limits.windowMs);
  await store.loginAttempts(ctx.db).insertMany(keys.map((k) => ({ _id: new ObjectId(), key: k.key, at: now, expiresAt })));
  return null;
}

/**
 * Limite generico per le rotte di accesso (cutover 3.5): `key` es. "forgot:<email>" o "change:<userId>". HttpError 429
 * se negli ultimi `windowMs` ci sono già `limit` tentativi registrati per quella chiave.
 */
export async function assertAttemptsAllowed(db: Db, key: string, limit: number, now: Date = new Date(), windowMs = LOGIN_LIMITS.windowMs): Promise<void> {
  const wait = await blockedFor(db, key, limit, now, windowMs);
  if (wait > 0) throw new HttpError("Troppi tentativi: riprova tra qualche minuto", 429, { retryAfterSeconds: Math.ceil(wait / 1000) });
}

export async function recordAttempt(db: Db, key: string, now: Date = new Date(), windowMs = LOGIN_LIMITS.windowMs): Promise<void> {
  await store.loginAttempts(db).insertOne({ _id: new ObjectId(), key, at: now, expiresAt: new Date(now.getTime() + windowMs) });
}

export async function clearAttempts(db: Db, key: string): Promise<void> {
  await store.loginAttempts(db).deleteMany({ key });
}
