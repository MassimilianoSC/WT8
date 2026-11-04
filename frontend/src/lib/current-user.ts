/**
 * Utente corrente del modello nuovo, senza dipendenze da NextAuth (provabile in vitest).
 * Dal cutover (3.5, fine di D-105) l'utente si risolve per ID di sessione ed è riletto dal database a ogni chiamata
 * (D-94): una disattivazione o una revoca valgono subito, e così il flag mustChangePassword (D-173).
 */
import { features } from "@/lib/features";
import { ObjectId, type Db } from "mongodb";
import type { MeDTO, UserDTO } from "@/lib/contract";
import { canCreateIn } from "@/lib/engines/access";
import { store } from "@/lib/store/db";
import type { StoreUserDoc } from "@/lib/store/types";
import { toUserDTO } from "@/services/users-v2";

/** UserDTO più il flag del cambio password obbligatorio (D-173). */
export type CurrentUser = UserDTO & { mustChangePassword: boolean };

function toCurrentUser(u: StoreUserDoc): CurrentUser {
  return { ...toUserDTO(u), mustChangePassword: u.mustChangePassword === true };
}

/** Utente ATTIVO del database nuovo con quell'id di sessione, oppure null. */
export async function resolveUserById(db: Db, id: string | null | undefined): Promise<CurrentUser | null> {
  if (!id || !ObjectId.isValid(id)) return null;
  const u = await store.users(db).findOne({ _id: new ObjectId(id), status: "active" });
  return u ? toCurrentUser(u) : null;
}

export function toMeDTO(u: UserDTO & { mustChangePassword?: boolean }): MeDTO {
  return { ...u, canCreate: canCreateIn(u), mustChangePassword: u.mustChangePassword === true, features: features() };
}

/**
 * MeDTO completo (contratto §4 e §13.1), UNICA funzione per /api/me e per le pagine server (components/me): con
 * `assistant` se l'assistente è acceso tecnicamente; un errore nel suo calcolo non impedisce il MeDTO. Nessuna scrittura.
 */
export async function loadMeDTO(db: Db, user: UserDTO & { mustChangePassword?: boolean }, now: Date = new Date()): Promise<MeDTO> {
  const { assistantStatus } = await import("@/services/assistant/quota");
  const assistant = await assistantStatus(db, user, now).catch(() => null);
  return { ...toMeDTO(user), ...(assistant ? { assistant } : {}) };
}
