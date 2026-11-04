import { TEMPLATE_IDS, type GroupId, type MeDTO, type TemplateId } from "@/lib/contract";
import { isDirezione } from "@/components/andamento/access";

/**
 * Pure derivations from the current user (MeDTO, contract §4): what the
 * interface shows and opens for them. Permissions stay with the backend
 * (access, actions, editable): these only shape navigation and defaults.
 */

/** Where the user's identity stands in the new model (D-105, transitional). */
export type MeState =
  | { status: "ok"; me: MeDTO }
  | { status: "missing"; email: string }
  | { status: "anonymous" }
  | { status: "error" };

/** Templates of the user's memberships; null = all (ADMIN). */
export function visibleTemplates(me: MeDTO): TemplateId[] | null {
  if (me.isAdmin) return null;
  const set = new Set(me.memberships.map((m) => m.templateId));
  return TEMPLATE_IDS.filter((t) => set.has(t));
}

/** Groups of the user in one template, in display order. ADMIN: PM/Permessi
 *  as the starting point (they can open everything). */
export function groupsIn(me: MeDTO | null, templateId: TemplateId): GroupId[] {
  if (!me) return [];
  const own = Array.from(new Set(me.memberships.filter((m) => m.templateId === templateId).map((m) => m.group)));
  if (own.length > 0) return own;
  return me.isAdmin ? ["PM_PERMESSI"] : [];
}

export function canCreateIn(me: MeDTO | null, templateId: TemplateId): boolean {
  return !!me && me.canCreate.includes(templateId);
}

/** Team leader in at least one membership (Configurazione > Liste). */
export function isLeader(me: MeDTO | null): boolean {
  return !!me && me.memberships.some((m) => m.leader);
}

/** Templates whose statistics and export the user sees (PM of the template, ADMIN: D-23); null = all. */
export function statsTemplates(me: MeDTO): TemplateId[] | null {
  if (me.isAdmin || isDirezione(me)) return null; // Direzione: every client (§15.2)
  const set = new Set(me.memberships.filter((m) => m.role === "PM").map((m) => m.templateId));
  return TEMPLATE_IDS.filter((t) => set.has(t));
}

/**
 * Workload the user may see (D-23): per template, every group as PM, their own
 * group as team leader. null = every template and group (ADMIN).
 */
export function workloadScope(me: MeDTO): Partial<Record<TemplateId, GroupId[] | "all">> | null {
  if (me.isAdmin || isDirezione(me)) return null; // Direzione: every client and group (D-193)
  const scope: Partial<Record<TemplateId, GroupId[] | "all">> = {};
  for (const m of me.memberships) {
    if (m.role === "PM") scope[m.templateId] = "all";
    else if (m.leader && scope[m.templateId] !== "all") {
      const groups = (scope[m.templateId] as GroupId[] | undefined) ?? [];
      if (!groups.includes(m.group)) scope[m.templateId] = [...groups, m.group];
    }
  }
  return scope;
}

/** Can open Statistiche / Carichi di lavoro: ADMIN, PM of a template or team leader (D-23). */
export function canSeeStats(me: MeDTO | null): boolean {
  return !!me && (me.isAdmin || isDirezione(me) || (statsTemplates(me)?.length ?? 0) > 0 || isLeader(me));
}

/** Footer of the sidebar: "Amministratore", or the memberships as "PM leader · ILIAD, TOWERNET". */
export function membershipSummary(me: MeDTO | null): string {
  if (!me) return "";
  const parts: string[] = me.isAdmin ? ["Amministratore"] : isDirezione(me) ? ["Direzione"] : [];
  // Direzione is on top of the memberships (D-193): both are listed.
  const byRole = new Map<string, TemplateId[]>();
  for (const m of me.memberships) {
    const key = m.role + (m.leader ? " leader" : "");
    byRole.set(key, [...(byRole.get(key) ?? []), m.templateId]);
  }
  byRole.forEach((templates, role) => parts.push(role + " · " + templates.map((t) => t.replace(/_/g, " / ")).join(", ")));
  return parts.join(" — ");
}
