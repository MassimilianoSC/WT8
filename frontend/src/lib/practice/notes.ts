/**
 * Note Operative per gruppo (D-121). PURO. Chi VEDE le note di un gruppo: chi ha un'appartenenza a quel gruppo sullo
 * stesso gestore; tutte per i PM leader del gestore e per l'ADMIN. La stessa regola vale per scheda, storico e
 * export: le note di un gruppo non visibile non escono mai.
 * Chi le SCRIVE segue la regola delle occorrenze (ownerGroup = gruppo della nota: membro del gruppo, gruppo
 * abilitato dall'Assegna, mai su archiviata o iterazione passata; ADMIN) ed è nel motore dei permessi.
 */
import { GROUP_IDS, type GroupId, type MembershipDTO, type TemplateId, type UserStatus } from "@/lib/contract";
import type { TransversalDoc } from "@/lib/store/types";

export interface NoteViewer {
  isAdmin: boolean;
  status: UserStatus;
  memberships: MembershipDTO[];
}

/** Gruppi di cui l'utente vede le note sul gestore, nell'ordine di GROUP_IDS. */
export function visibleNoteGroups(u: NoteViewer, templateId: TemplateId): GroupId[] {
  if (u.status !== "active") return [];
  const mine = u.memberships.filter((m) => m.templateId === templateId);
  if (u.isAdmin || mine.some((m) => m.role === "PM" && m.leader)) return [...GROUP_IDS];
  return GROUP_IDS.filter((g) => mine.some((m) => m.group === g));
}

export const canSeeNote = (u: NoteViewer, templateId: TemplateId, group: GroupId) => visibleNoteGroups(u, templateId).includes(group);

/**
 * Le quattro note di un'iterazione. Documenti scritti prima di D-121 hanno una nota unica (stringa): era la nota
 * del gruppo PM/Permessi, l'unico che poteva scriverla.
 */
export function notesOf(t: Pick<TransversalDoc, "noteOperative"> | { noteOperative: unknown }): Record<GroupId, string> {
  const raw = t.noteOperative;
  const out = Object.fromEntries(GROUP_IDS.map((g) => [g, ""])) as Record<GroupId, string>;
  if (typeof raw === "string") out.PM_PERMESSI = raw;
  else if (raw && typeof raw === "object") for (const g of GROUP_IDS) out[g] = String((raw as Record<string, unknown>)[g] ?? "");
  return out;
}

/** Solo le note visibili (chiave assente = non visibile; "" = visibile ma vuota), come nel contratto v0.3.0. */
export function visibleNotes(notes: Record<GroupId, string>, groups: readonly GroupId[]): Partial<Record<GroupId, string>> {
  return Object.fromEntries(groups.map((g) => [g, notes[g] ?? ""]));
}
