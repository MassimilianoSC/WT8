/**
 * getCurrentUser() del contratto §4 (D-4): pagine server, rotte e servizi lo usano per avere appartenenze e leader.
 * Dal cutover (3.5) la sessione NextAuth porta { id, name, email, isAdmin } degli utenti del modello nuovo e l'utente
 * si rilegge PER ID a ogni chiamata (D-94): disattivazione immediata (PR-22) e cambio password obbligatorio (D-173).
 */
import type { UserDTO } from "@/lib/contract";
import { auth } from "@/lib/auth";
import { HttpError } from "@/lib/http-error";
import { resolveUserById, type CurrentUser } from "@/lib/current-user";
import { getStoreDb } from "@/lib/store/db";

async function sessionUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id || null;
}

/** null se non c'è sessione o se l'utente non esiste più (o non è attivo). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const id = await sessionUserId();
  if (!id) return null;
  return resolveUserById(await getStoreDb(), id);
}

/** Email della sessione: distingue "non autenticato" da "utente non più attivo" nelle pagine (components/me). */
export async function getSessionEmail(): Promise<string | null> {
  const session = await auth();
  return session?.user?.email ?? null;
}

/**
 * Utente in sessione SENZA il controllo del cambio password: solo per GET /api/me e POST /api/auth/change-password.
 * 401 senza sessione o se l'utente non è più attivo (disattivato: fuori al primo clic, PR-22).
 */
export async function requireSessionUser(): Promise<CurrentUser> {
  const id = await sessionUserId();
  if (!id) throw new HttpError("Unauthenticated", 401);
  const user = await resolveUserById(await getStoreDb(), id);
  if (!user) throw new HttpError("Sessione non più valida: accedi di nuovo", 401);
  return user;
}

/** Utente in sessione per tutte le altre rotte: 401 come sopra, 403 CAMBIO_PASSWORD finché vale il flag (D-173). */
export async function requireCurrentUser(): Promise<UserDTO> {
  const user = await requireSessionUser();
  if (user.mustChangePassword) throw new HttpError("Cambia la password prima di continuare", 403, { code: "CAMBIO_PASSWORD" });
  return user;
}
