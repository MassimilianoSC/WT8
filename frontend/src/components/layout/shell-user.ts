import type { MeDTO } from "@/lib/contract";
import type { ShellAssistant, ShellUser } from "@/components/layout/app-shell";
import { canSeeStats, isLeader, membershipSummary, visibleTemplates } from "@/components/me/me-derive";
import { canSeeAndamento, isDirezionePura } from "@/components/andamento/access";

/** What the AppShell shows of the user, from the session and the MeDTO (null: empty menus). */
export function shellUserOf(session: { name?: string | null; email?: string | null }, me: MeDTO | null): ShellUser {
  return {
    name: session.name,
    email: session.email,
    templateIds: me ? visibleTemplates(me) : [],
    isAdmin: me?.isAdmin ?? false,
    isLeader: isLeader(me),
    canStats: canSeeStats(me),
    canAndamento: canSeeAndamento(me),
    direzione: isDirezionePura(me),
    summary: membershipSummary(me),
  };
}

/** The assistant, only when the MeDTO carries it (contract §13.1): otherwise no "Chiedi". */
export function shellAssistantOf(me: MeDTO | null): ShellAssistant | undefined {
  const status = me?.assistant;
  // Direzione without memberships: no assistant (§15.2); with memberships it works as for the groups (D-193).
  return me && status && !isDirezionePura(me) ? { me, status } : undefined;
}
