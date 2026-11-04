/**
 * Motore dei permessi (B4, D-94, architettura §3). PURO: niente database, sessione o orologio.
 * Una sola origine per pulsanti (DTO) e rifiuti del server: i servizi chiamano queste stesse funzioni.
 *
 * Regola di fondo (§3.1): ogni controllo usa LA STESSA appartenenza (template + gruppo/ruolo); non si
 * combina il cliente di un'appartenenza con il ruolo di un'altra. ADMIN è un flag globale; leader è locale.
 * Le regole d'azione e i provvisori di R-16 sono dati: src/data/access-policy.json.
 */
import policyData from "@/data/access-policy.json";
import {
  TEMPLATE_IDS,
  type AccessDeniedReason,
  type FieldOccurrenceDTO,
  type GroupId,
  type MembershipDTO,
  type OccurrenceAccessDTO,
  type PraticaActionsDTO,
  type RepeatAccessDTO,
  type RoleId,
  type StatoAttivita,
  type TemplateDTO,
  type TemplateId,
  type TransversalOccurrenceKey,
  type UserStatus,
} from "@/lib/contract";

/* ---------- ingressi ---------- */

export interface AccessUser {
  id: string;
  isAdmin: boolean;
  status: UserStatus;
  memberships: MembershipDTO[];
}

/** Stato della pratica rilevante per i permessi. */
export interface AccessPractice {
  templateId: TemplateId;
  archived: boolean;
  enabledGroups: GroupId[];
  statoAttivita: StatoAttivita;
  /** Numero di iterazioni della pratica. */
  iterationCount: number;
}

/** L'iterazione mostrata è quella corrente? (false = iterazione passata, sola lettura). */
export interface AccessView {
  isCurrentIteration: boolean;
}

/* ---------- policy ---------- */

interface ActionRule {
  roles: RoleId[];
  admin: boolean;
  leader?: boolean;
  notArchived?: boolean;
  archivedOnly?: boolean;
  allowArchived?: boolean;
  states?: StatoAttivita[];
  maxIterations?: number;
  targets?: GroupId[];
}
interface TransversalRule {
  groups: GroupId[];
  roles: RoleId[];
  admin: boolean;
}
export interface AccessPolicy {
  version: string;
  transversal: Record<"fatturato" | "fatturabile", TransversalRule>;
  actions: Record<"create" | "assign" | "changeStato" | "archive" | "restore" | "delete" | "rework" | "resubmit", ActionRule>;
  alertClose: { byRule: Record<string, { groups: GroupId[]; manualClose?: boolean }> };
  assignNotifications: { extraRecipients: Array<{ whenTargetsInclude: GroupId; notify: GroupId[] }> };
}
export const ACCESS_POLICY = policyData as unknown as AccessPolicy;

/* ---------- appartenenze ---------- */

const active = (u: AccessUser) => u.status === "active";

export function membershipsIn(u: AccessUser, templateId: TemplateId): MembershipDTO[] {
  return active(u) ? u.memberships.filter((m) => m.templateId === templateId) : [];
}
/** Una stessa appartenenza con template e ruolo richiesti (e leader, se chiesto). */
export function hasRole(u: AccessUser, templateId: TemplateId, roles: readonly RoleId[], leader = false): boolean {
  return membershipsIn(u, templateId).some((m) => roles.includes(m.role) && (!leader || m.leader));
}
export function inGroup(u: AccessUser, templateId: TemplateId, group: GroupId, leader = false): boolean {
  return membershipsIn(u, templateId).some((m) => m.group === group && (!leader || m.leader));
}
const isAdmin = (u: AccessUser) => active(u) && u.isAdmin;

/* ---------- visibilità (§3.1) ---------- */

/** Pratica visibile: ADMIN sempre, gli altri se hanno un'appartenenza sul template. Non visibile → 404. */
export function canSeePractice(u: AccessUser, p: Pick<AccessPractice, "templateId">): boolean {
  return isAdmin(u) || membershipsIn(u, p.templateId).length > 0;
}

/**
 * scope=assigned: PM/Permessi vedono tutte le pratiche del template, gli altri quelle in cui il loro gruppo è
 * abilitato; scope=all: tutte quelle dei propri template. ADMIN: tutte.
 */
export function isInScope(u: AccessUser, p: Pick<AccessPractice, "templateId" | "enabledGroups">, scope: "assigned" | "all"): boolean {
  if (isAdmin(u)) return true;
  const mine = membershipsIn(u, p.templateId);
  if (mine.length === 0) return false;
  if (scope === "all") return true;
  return mine.some((m) => m.group === "PM_PERMESSI" || p.enabledGroups.includes(m.group));
}

/** Template in cui l'utente vede pratiche (per il filtro dell'elenco). */
export function visibleTemplates(u: AccessUser): TemplateId[] {
  if (isAdmin(u)) return [...TEMPLATE_IDS];
  return TEMPLATE_IDS.filter((t) => membershipsIn(u, t).length > 0);
}

/* ---------- occorrenze (§3.2) ---------- */

/** Accesso a un'occorrenza; il motivo è il PRIMO dell'ordine ACCESS_DENIED_REASONS. La condizione non conta (D-31). */
export function occurrenceAccess(
  u: AccessUser,
  p: AccessPractice,
  occ: Pick<FieldOccurrenceDTO, "kind" | "ownerGroup" | "computed">,
  view: AccessView
): OccurrenceAccessDTO {
  const deny = (reason: AccessDeniedReason): OccurrenceAccessDTO => ({ editable: false, reason });
  if (!canSeePractice(u, p)) return deny("NOT_MY_GROUP");
  if (p.archived) return deny("ARCHIVED");
  if (!view.isCurrentIteration) return deny("PAST_ITERATION");
  if (occ.kind === "MIRROR") return deny("MIRROR");
  if (occ.computed && !occ.computed.manualOverride) return deny("COMPUTED");
  if (isAdmin(u)) return { editable: true };
  if (!inGroup(u, p.templateId, occ.ownerGroup)) return deny("NOT_MY_GROUP");
  if (!p.enabledGroups.includes(occ.ownerGroup)) return deny("NOT_ASSIGNED");
  return { editable: true };
}

const TRANSVERSAL_KEY: Record<"TRASV.FATTURABILE" | "TRASV.FATTURATO", keyof AccessPolicy["transversal"]> = {
  "TRASV.FATTURABILE": "fatturabile",
  "TRASV.FATTURATO": "fatturato",
};
const NOTE_PREFIX = "TRASV.NOTE_OPERATIVE.";

/**
 * Accesso ai campi trasversali. Note Operative (D-121): la nota di un gruppo segue la regola delle occorrenze con
 * ownerGroup = quel gruppo (membro del gruppo sul gestore, gruppo abilitato dall'Assegna, mai su archiviata o
 * iterazione passata; ADMIN). Chi le VEDE lo decide lib/practice/notes.ts. Fatturabile e Fatturato: policy (D-120,
 * D-121: PM e ADMIN).
 */
export function transversalAccess(u: AccessUser, p: AccessPractice, key: TransversalOccurrenceKey, view: AccessView): OccurrenceAccessDTO {
  if (key.startsWith(NOTE_PREFIX)) {
    return occurrenceAccess(u, p, { kind: "MASTER", ownerGroup: key.slice(NOTE_PREFIX.length) as GroupId, computed: null }, view);
  }
  if (!canSeePractice(u, p)) return { editable: false, reason: "NOT_MY_GROUP" };
  if (p.archived) return { editable: false, reason: "ARCHIVED" };
  if (!view.isCurrentIteration) return { editable: false, reason: "PAST_ITERATION" };
  const rule = ACCESS_POLICY.transversal[TRANSVERSAL_KEY[key as keyof typeof TRANSVERSAL_KEY]];
  if (rule.admin && isAdmin(u)) return { editable: true };
  const ok = membershipsIn(u, p.templateId).some((m) => rule.groups.includes(m.group) || rule.roles.includes(m.role));
  return ok ? { editable: true } : { editable: false, reason: "NOT_MY_GROUP" };
}

/** Mappa occurrenceKey → accesso per tutte le occorrenze e i trasversali del template. */
export function accessMap(u: AccessUser, p: AccessPractice, t: TemplateDTO, view: AccessView): Record<string, OccurrenceAccessDTO> {
  const out: Record<string, OccurrenceAccessDTO> = {};
  for (const o of t.occurrences) out[o.occurrenceKey] = occurrenceAccess(u, p, o, view);
  for (const o of t.transversal) out[o.occurrenceKey] = transversalAccess(u, p, o.occurrenceKey as TransversalOccurrenceKey, view);
  return out;
}

/**
 * Aggiungere/rimuovere righe di un gruppo ripetibile = poterne modificare i master (stesso gruppo owner).
 * VINCOLI ha righe fisse: sempre false. Le righe `locked` le rifiuta comunque la scrittura.
 */
export function repeatAccess(u: AccessUser, p: AccessPractice, t: TemplateDTO, view: AccessView): Record<string, RepeatAccessDTO> {
  const out: Record<string, RepeatAccessDTO> = {};
  for (const g of t.repeatGroups) {
    if (g.rowPolicy === "FIXED") {
      out[g.key] = { canAddRows: false, canRemoveRows: false };
      continue;
    }
    const masters = t.occurrences.filter((o) => o.kind === "MASTER" && o.flowId && g.flowIds.includes(o.flowId));
    const ok = masters.some((o) => occurrenceAccess(u, p, { ...o, computed: null }, view).editable);
    out[g.key] = { canAddRows: ok, canRemoveRows: ok };
  }
  return out;
}

/* ---------- azioni (§3.3) ---------- */

export type ActionName = keyof AccessPolicy["actions"];

/** Regola d'azione della policy: prima i vincoli di stato (valgono anche per l'ADMIN), poi ruolo e leader. */
export function actionAllowed(u: AccessUser, p: AccessPractice, action: ActionName, view: AccessView = { isCurrentIteration: true }): boolean {
  if (!canSeePractice(u, p) || !view.isCurrentIteration) return false;
  const r = ACCESS_POLICY.actions[action];
  if (r.archivedOnly && !p.archived) return false;
  if (r.notArchived && p.archived) return false;
  if (!r.archivedOnly && !r.notArchived && !r.allowArchived && p.archived) return false;
  if (r.states && !r.states.includes(p.statoAttivita)) return false;
  if (r.maxIterations !== undefined && p.iterationCount > r.maxIterations) return false;
  if (r.admin && isAdmin(u)) return true;
  return hasRole(u, p.templateId, r.roles, !!r.leader);
}

export function practiceActions(u: AccessUser, p: AccessPractice, view: AccessView = { isCurrentIteration: true }): PraticaActionsDTO {
  const assign = actionAllowed(u, p, "assign", view);
  const assignableGroups = assign ? [...(ACCESS_POLICY.actions.assign.targets ?? [])] : [];
  return {
    assignableGroups,
    canAssign: assignableGroups.length > 0,
    canChangeStato: actionAllowed(u, p, "changeStato", view),
    canArchive: actionAllowed(u, p, "archive", view),
    canRestore: actionAllowed(u, p, "restore", view),
    canDelete: actionAllowed(u, p, "delete", view),
    canRework: actionAllowed(u, p, "rework", view),
    canResubmit: actionAllowed(u, p, "resubmit", view),
  };
}

/** Template in cui l'utente può creare pratiche (MeDTO.canCreate, D-20). */
export function canCreateIn(u: AccessUser): TemplateId[] {
  const r = ACCESS_POLICY.actions.create;
  if (r.admin && isAdmin(u)) return [...TEMPLATE_IDS];
  return TEMPLATE_IDS.filter((t) => hasRole(u, t, r.roles, !!r.leader));
}

/**
 * Gruppi da avvisare per un'Assegna (D-21, D-116): i destinatari più quelli aggiunti dalla policy (es. DL quando
 * la destinazione comprende UT_PE, provvisorio R-16 B1). Un solo punto, come dato.
 */
export function assignNotifiedGroups(targets: readonly GroupId[]): { targets: GroupId[]; extra: GroupId[] } {
  const extra = new Set<GroupId>();
  for (const r of ACCESS_POLICY.assignNotifications.extraRecipients) {
    if (targets.includes(r.whenTargetsInclude)) for (const g of r.notify) if (!targets.includes(g)) extra.add(g);
  }
  return { targets: [...targets], extra: [...extra] };
}

/* ---------- liste e alert ---------- */

/** ListDTO.editable: CONFIGURABLE → leader del gruppo della lista per quel gestore e ADMIN; il resto solo ADMIN. */
export function listEditable(u: AccessUser, list: { kind: "CONTROLLED" | "CONFIGURABLE"; templateId: TemplateId | null; group: GroupId | null }): boolean {
  if (isAdmin(u)) return true;
  if (list.kind !== "CONFIGURABLE" || !list.templateId || !list.group) return false;
  return inGroup(u, list.templateId, list.group, true);
}

/**
 * Chiusura manuale di un alert (D-46): leader del gruppo competente e ADMIN; alcune regole restringono i gruppi.
 * manualClose = false: nessuno, ADMIN compreso (FATTURABILE_KO si chiude solo con la decisione su Fatturabile, D-137 A-02).
 */
export function canCloseAlert(u: AccessUser, alert: { templateId: TemplateId; ruleId: string; ownerGroup: GroupId }): boolean {
  if (ACCESS_POLICY.alertClose.byRule[alert.ruleId]?.manualClose === false) return false;
  if (isAdmin(u)) return true;
  const groups = ACCESS_POLICY.alertClose.byRule[alert.ruleId]?.groups ?? [alert.ownerGroup];
  return groups.some((g) => inGroup(u, alert.templateId, g, true));
}
