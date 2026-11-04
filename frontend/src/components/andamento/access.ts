import type { MeDTO, UserDTO } from "@/lib/contract";

/**
 * Andamento and the Direzione profile (contract v0.6.0 §15, D-191, D-192),
 * behind PH_ANDAMENTO. Off (the default) = MeDTO.features.andamento false (or
 * missing, as in old fixtures): no menu, no page, no Direzione box, and the app
 * is exactly as before.
 */

/** The switch, from GET /api/me. */
export function andamentoOn(me: MeDTO | null): boolean {
  return me?.features?.andamento === true;
}

/**
 * Direzione (§15.2, D-193): a permission ON TOP of the memberships (managers
 * work inside the groups): Andamento, and Statistiche and workload of every
 * client and group. Only with the switch on; ADMIN wins.
 */
export function isDirezione(me: MeDTO | null): boolean {
  return !!me && andamentoOn(me) && !me.isAdmin && me.direzione === true;
}

/** Direzione without memberships: the short menu (Andamento, Statistiche, Notifiche) and the start on /andamento. */
export function isDirezionePura(me: MeDTO | null): boolean {
  return isDirezione(me) && me!.memberships.length === 0;
}

/** Who opens Andamento: ADMIN or Direzione, switch on (§15.3). */
export function canSeeAndamento(me: MeDTO | null): boolean {
  return !!me && andamentoOn(me) && (me.isAdmin || isDirezione(me));
}

/** UserDTO.direzione (§15.2), false when missing. */
export function userDirezione(u: UserDTO): boolean {
  return u.direzione === true;
}
