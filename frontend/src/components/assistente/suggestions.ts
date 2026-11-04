import type { MeDTO, MembershipDTO, TemplateId } from "@/lib/contract";
import type { AssistantRequestContext } from "@/components/assistente/types";

/**
 * Suggested questions (project §9): by what the user can do in the CURRENT
 * template, not by a global role. They only fill the composer, never send.
 * Nothing here grants access: the server answers with the user's permissions.
 */

export const MAX_SUGGESTIONS = 4;

const tplName = (t: TemplateId) => t.replace(/_/g, " / ");

/** Template the next question is about: the page's, or the only one of the user. */
export function contextTemplate(me: MeDTO, context: AssistantRequestContext | null): TemplateId | null {
  if (context?.templateId) return context.templateId;
  const own = Array.from(new Set(me.memberships.map((m) => m.templateId)));
  return own.length === 1 ? own[0] : null;
}

type Profile = "pm" | "permessi" | "leader" | "tecnico";

function profiles(me: MeDTO, template: TemplateId | null): Set<Profile> {
  const out = new Set<Profile>();
  if (me.isAdmin) out.add("pm");
  const ms: MembershipDTO[] = me.memberships.filter((m) => !template || m.templateId === template);
  for (const m of ms) {
    if (m.role === "PM") out.add("pm");
    else if (m.role === "PERMESSI") out.add("permessi");
    else if (m.leader) out.add("leader");
    else out.add("tecnico");
  }
  return out;
}

export function suggestionsFor(me: MeDTO, context: AssistantRequestContext | null): string[] {
  const template = contextTemplate(me, context);
  const inT = template ? ` ${tplName(template)}` : "";
  const onT = template ? ` su ${tplName(template)}` : " per cliente";
  const p = profiles(me, template);
  const out: string[] = [];

  if (context?.page === "sheet") {
    out.push(
      "Riassumi questa pratica.",
      "Perché non è avanzata, dalle note visibili?",
      "Cosa è cambiato nell'ultima settimana?",
      "Forecast e stato dell'iterazione che sto vedendo."
    );
    return out.slice(0, MAX_SUGGESTIONS);
  }

  if (p.has("pm")) {
    out.push(
      `Quali pratiche${inT} hanno il Forecast Ottenimento Permessi entro fine mese?`,
      `Quante pratiche${inT} ci sono per stato?`,
      `Quali sono le criticità della settimana${onT}?`,
      `Carichi di lavoro per gruppo${onT}.`
    );
  }
  if (p.has("permessi")) {
    out.push(
      `Forecast e scadenze delle pratiche${inT}.`,
      `Quali sopralluoghi${inT} hanno alert scaduti?`
    );
  }
  if (p.has("leader")) {
    out.push(
      `Carico del mio gruppo${onT}.`,
      "Consegne previste nei prossimi 7 giorni.",
      "Forecast scaduti su pratiche non concluse."
    );
  }
  if (p.has("tecnico")) {
    out.push("Le pratiche in cui sono indicato come tecnico.", "Le mie consegne previste entro venerdì.");
  }
  return Array.from(new Set(out)).slice(0, MAX_SUGGESTIONS);
}
