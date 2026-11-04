/**
 * TEST FIXTURE (cutover D-161): demo thresholds and users of Configurazione, moved out of the app code.
 * Tests plug it in with vi.mock(<source>, ...) in place of the real API calls.
 */
import { ApiError } from "@/lib/client";
import type { AlertRuleConfigDTO, MembershipDTO, TemplateId, UserDTO, UserInviteRequest, UserListResponse, UserUpdateRequest } from "@/lib/contract";

const now = () => new Date().toISOString();

const rules = new Map<string, AlertRuleConfigDTO[]>();

function mockRules(templateId: TemplateId): AlertRuleConfigDTO[] {
  if (!rules.has(templateId)) {
    const base: Array<[string, string, number, AlertRuleConfigDTO["unit"]]> = [
      ["SOPRALLUOGO", "Data sopralluogo dopo la Data assegnazione", 7, "WORKING_DAYS"],
      ["VERBALE_SOPRALLUOGO", "Invio verbale dopo la Data sopralluogo", 3, "WORKING_DAYS"],
      ["FORECAST_UT", "Forecast UT: preavviso", 2, "WORKING_DAYS"],
      ["FORECAST_PE", "Forecast PE: preavviso", 4, "WORKING_DAYS"],
      ["FORECAST_AIE", "Forecast AIE: preavviso", 2, "WORKING_DAYS"],
      ["OTTENIMENTO_PERMESSI", "Ottenimento Permessi dopo il forecast", 3, "WORKING_DAYS"],
      ["FINE_LAVORI_DL", "Fine lavori: Forecast CIL +", 20, "CALENDAR_DAYS"],
    ];
    rules.set(
      templateId,
      base.map(([ruleId, label, days, unit]) => ({ templateId, ruleId, label, days, unit, revision: 1 }))
    );
  }
  return rules.get(templateId)!;
}

function mockSaveRule(rule: AlertRuleConfigDTO, days: number): AlertRuleConfigDTO {
  const list = mockRules(rule.templateId);
  const current = list.find((r) => r.ruleId === rule.ruleId)!;
  if (current.revision !== rule.revision) {
    throw new ApiError("La soglia è stata modificata da un altro utente", 409, {
      error: "La soglia è stata modificata da un altro utente",
      code: "REVISION_CONFLICT",
    });
  }
  const saved = { ...current, days, revision: current.revision + 1 };
  rules.set(rule.templateId, list.map((r) => (r === current ? saved : r)));
  return saved;
}

let users: UserDTO[] | null = null;
let userSeq = 0;

function user(id: string, name: string, email: string, memberships: MembershipDTO[], extra: Partial<UserDTO> = {}): UserDTO {
  return { id, name, email, status: "active", isAdmin: false, memberships, createdAt: "2026-09-01T09:00:00+02:00", updatedAt: "2026-09-01T09:00:00+02:00", ...extra };
}

function mockUsers(): UserDTO[] {
  if (!users) {
    users = [
      user("u-admin", "Amministratore", "admin@practicehub.local", [], { isAdmin: true }),
      user("u-pm-1", "Laura Verdi", "laura.verdi@example.it", [
        { templateId: "INWIT", group: "PM_PERMESSI", role: "PM", leader: true },
        { templateId: "ILIAD", group: "PM_PERMESSI", role: "PM", leader: true },
      ]),
      user("u-pp-1", "Giulia Rossi", "giulia.rossi@example.it", [{ templateId: "INWIT", group: "PM_PERMESSI", role: "PERMESSI", leader: false }]),
      user("u-ut-1", "Marco Bianchi", "marco.bianchi@example.it", [{ templateId: "INWIT", group: "UT_PE", role: "UT", leader: true }]),
      user("u-dl-1", "Paolo Neri", "paolo.neri@example.it", [{ templateId: "TOWERNET", group: "DL", role: "DL", leader: false }], { status: "invited" }),
    ];
  }
  return users;
}

function withoutPmLeader(list: UserDTO[]): TemplateId[] {
  const all: TemplateId[] = ["ILIAD", "TOWERNET", "TIM_FIBERCOP", "INWIT", "FASTWEB_VODAFONE", "LEONARDO"];
  return all.filter(
    (t) => !list.some((u) => u.status === "active" && u.memberships.some((m) => m.templateId === t && m.role === "PM" && m.leader))
  );
}

function mockUsersPage(): UserListResponse {
  const items = mockUsers();
  return { items, templatesWithoutPmLeader: withoutPmLeader(items) };
}

const ROLE_OF_GROUP: Record<string, string[]> = { PM_PERMESSI: ["PM", "PERMESSI"], UT_PE: ["UT", "PE"], AIE: ["AIE"], DL: ["DL"] };

function validate(isAdmin: boolean, memberships: MembershipDTO[]) {
  const bad = memberships.find((m) => !ROLE_OF_GROUP[m.group]?.includes(m.role));
  if (bad) throw new ApiError(`Ruolo ${bad.role} incoerente con il gruppo ${bad.group}`, 422, { error: "Appartenenza incoerente" });
  if (!isAdmin && memberships.length === 0) {
    throw new ApiError("Serve almeno un'appartenenza per un utente non ADMIN", 422, { error: "Appartenenze mancanti" });
  }
}

/** D-101 demo: INWIT has open practices, so it must keep an active PM leader. */
function checkPmLeader(next: UserDTO[]) {
  if (withoutPmLeader(next).includes("INWIT") && !withoutPmLeader(mockUsers()).includes("INWIT")) {
    const msg = "INWIT resterebbe senza PM leader attivo con pratiche aperte: nomina prima un altro PM leader";
    throw new ApiError(msg, 422, { error: msg });
  }
}

function mockInvite(req: UserInviteRequest): UserDTO {
  validate(req.isAdmin ?? false, req.memberships);
  if (mockUsers().some((u) => u.email.toLowerCase() === req.email.toLowerCase())) {
    throw new ApiError("Esiste già un utente con questa email", 409, { error: "Esiste già un utente con questa email" });
  }
  const created = user(`u-new-${++userSeq}`, req.name, req.email, req.memberships, {
    isAdmin: req.isAdmin ?? false,
    status: "invited",
    createdAt: now(),
    updatedAt: now(),
  });
  users = [...mockUsers(), created];
  return created;
}

function mockResend(id: string): UserDTO {
  const current = mockUsers().find((u) => u.id === id);
  if (!current) throw new ApiError("Utente non trovato", 404, { error: "Utente non trovato" });
  if (current.status !== "invited") {
    throw new ApiError("L'utente ha già accettato l'invito", 409, { error: "L'utente ha già accettato l'invito" });
  }
  const next = { ...current, updatedAt: now() };
  users = mockUsers().map((u) => (u.id === id ? next : u));
  return next;
}

function mockUpdate(id: string, req: UserUpdateRequest): UserDTO {
  const current = mockUsers().find((u) => u.id === id);
  if (!current) throw new ApiError("Utente non trovato", 404, { error: "Utente non trovato" });
  const next: UserDTO = { ...current, ...req, updatedAt: now() };
  validate(next.isAdmin, next.memberships);
  const list = mockUsers().map((u) => (u.id === id ? next : u));
  checkPmLeader(list);
  users = list;
  return next;
}

/** Same signatures as config-source. */
export const demoConfig = {
  loadAlertRules: async (templateId: TemplateId) => mockRules(templateId),
  saveAlertRule: async (rule: AlertRuleConfigDTO, days: number) => mockSaveRule(rule, days),
  loadUsers: async () => mockUsersPage(),
  inviteUser: async (req: UserInviteRequest) => mockInvite(req),
  resendInvite: async (id: string) => mockResend(id),
  updateUser: async (id: string, req: UserUpdateRequest) => mockUpdate(id, req),
};
