/**
 * Destinatari di un alert (D-45, architettura §6.1). PURO. "PM" = PM leader del gestore; in più i leader dei gruppi della
 * regola sullo STESSO gestore. Una persona riceve una sola notifica anche con più appartenenze; l'eventuale autore della
 * modifica è incluso. Se manca un leader richiesto non si sceglie un sostituto: la quota mancante si registra nel log.
 */
import type { GroupId, MembershipDTO, TemplateId, UserStatus } from "@/lib/contract";
import type { AlertRuleSpec } from "@/lib/alerts/engine";

export interface RecipientCandidate {
  id: string;
  status: UserStatus;
  memberships: MembershipDTO[];
}

export interface Recipients {
  userIds: string[];
  /** Quote senza nessun destinatario: "PM" (nessun PM leader) o il gruppo senza leader. */
  missing: Array<"PM" | GroupId>;
}

export function alertRecipients(users: RecipientCandidate[], templateId: TemplateId, spec: Pick<AlertRuleSpec, "leaderGroups" | "extraLeaderGroups">): Recipients {
  const active = users.filter((u) => u.status === "active");
  const ids = new Set<string>();
  const missing: Recipients["missing"] = [];
  const pm = active.filter((u) => u.memberships.some((m) => m.templateId === templateId && m.role === "PM" && m.leader));
  if (pm.length === 0) missing.push("PM");
  for (const u of pm) ids.add(u.id);
  const groups = [...new Set([...spec.leaderGroups, ...(spec.extraLeaderGroups?.[templateId] ?? [])])];
  for (const g of groups) {
    const leaders = active.filter((u) => u.memberships.some((m) => m.templateId === templateId && m.group === g && m.leader));
    if (leaders.length === 0) missing.push(g);
    for (const u of leaders) ids.add(u.id);
  }
  return { userIds: [...ids].sort(), missing };
}
