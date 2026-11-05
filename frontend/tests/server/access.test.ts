// @vitest-environment node
/**
 * Prove a matrice del motore dei permessi (B4). L'ORACOLO qui sotto è scritto a mano dalle fonti — tabella
 * §3.2 e §3.3 dell'architettura, D-17…D-23, D-25…D-28, D-31, D-94, D-100, D-101 — e NON importa nulla dal
 * motore né dalla policy: gruppi dei ruoli, regole e ordine dei motivi sono ricopiati dal registro.
 */
import { describe, expect, it } from "vitest";
import type { GroupId, MembershipDTO, RoleId, StatoAttivita, TemplateDTO, TemplateId } from "@/lib/contract";
import {
  accessMap,
  canCloseAlert,
  canCreateIn,
  canSeePractice,
  isInScope,
  listEditable,
  occurrenceAccess,
  practiceActions,
  repeatAccess,
  transversalAccess,
  type AccessPractice,
  type AccessUser,
} from "@/lib/engines/access";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";

/* ---------- oracolo dalle fonti ---------- */

// D-17: PM, Permessi → PM/Permessi; UT, PE → UT/PE; AIE → AIE; DL → DL.
const ORACLE_GROUP: Record<RoleId, GroupId> = { PM: "PM_PERMESSI", PERMESSI: "PM_PERMESSI", UT: "UT_PE", PE: "UT_PE", AIE: "AIE", DL: "DL" };
const TEMPLATES: TemplateId[] = ["ILIAD", "TOWERNET", "TIM_FIBERCOP", "INWIT", "FASTWEB_VODAFONE", "LEONARDO"];
const ROLES: RoleId[] = ["PM", "PERMESSI", "UT", "PE", "AIE", "DL"];
const GROUPS: GroupId[] = ["PM_PERMESSI", "UT_PE", "AIE", "DL"];
const STATI: StatoAttivita[] = ["CREATA", "ASSEGNATO", "IN_APPROVAZIONE", "PROTOCOLLATO", "INTEGRAZIONE_RICHIESTA", "AUTORIZZATO", "DINIEGATO", "TAR", "REALIZZATO", "TERMINATO", "STAND_BY", "KO"];

interface Who {
  admin: boolean;
  /** Ruolo sul template della pratica (null = nessuna appartenenza lì). */
  role: RoleId | null;
  leader: boolean;
  /** Appartenenza "esca" su un ALTRO template con ruolo PM leader: non deve mai contare (§3.1). */
  decoy: boolean;
  active: boolean;
}

function userOf(w: Who, t: TemplateId): AccessUser {
  const memberships: MembershipDTO[] = [];
  if (w.role) memberships.push({ templateId: t, group: ORACLE_GROUP[w.role], role: w.role, leader: w.leader });
  if (w.decoy) {
    const other = TEMPLATES.find((x) => x !== t)!;
    memberships.push({ templateId: other, group: "PM_PERMESSI", role: "PM", leader: true });
  }
  return { id: "u", isAdmin: w.admin, status: w.active ? "active" : "deactivated", memberships };
}

/** §3.2: il primo vincolo che si applica dà il motivo; l'ADMIN supera solo appartenenza e Assegna. */
function oracleOccurrence(
  w: Who,
  c: { archived: boolean; past: boolean; mirror: boolean; computed: "none" | "manual" | "locked"; owner: GroupId; enabled: boolean }
) {
  const admin = w.active && w.admin;
  const member = w.active && w.role !== null && ORACLE_GROUP[w.role] === c.owner;
  if (!w.active || (!admin && w.role === null)) return { editable: false }; // non visibile (404 nel servizio)
  if (c.archived) return { editable: false, reason: "ARCHIVED" };
  if (c.past) return { editable: false, reason: "PAST_ITERATION" };
  if (c.mirror) return { editable: false, reason: "MIRROR" };
  if (c.computed === "locked") return { editable: false, reason: "COMPUTED" }; // Forecast Permessi (manuale) resta modificabile
  if (admin) return { editable: true };
  if (!member) return { editable: false, reason: "NOT_MY_GROUP" };
  if (!c.enabled) return { editable: false, reason: "NOT_ASSIGNED" };
  return { editable: true };
}

/** §3.3 e registro, comando per comando. */
function oracleActions(w: Who, p: { archived: boolean; stato: StatoAttivita; iterations: number; past: boolean }) {
  const visible = w.active && (w.admin || w.role !== null);
  const ok = visible && !p.past;
  const admin = w.active && w.admin;
  const is = (...roles: RoleId[]) => w.active && w.role !== null && roles.includes(w.role);
  const assign = ok && !p.archived && (admin || is("PM", "PERMESSI")); // D-21, D-94; D-204: anche Permessi
  return {
    assignableGroups: assign ? ["AIE", "UT_PE", "DL"] : [],
    canAssign: assign,
    canChangeStato: ok && !p.archived && (admin || is("PM")), // D-23
    canArchive: ok && !p.archived && (p.stato === "TERMINATO" || p.stato === "KO") && (admin || is("PM", "DL")), // D-23, D-28
    canRestore: ok && p.archived && (admin || is("PM")), // D-23
    canDelete: ok && !p.archived && p.stato === "CREATA" && p.iterations === 1 && (admin || is("PM")), // D-27, D-100
    canRework: ok && (admin || is("PM")), // D-26, D-94: anche da archiviata
    canResubmit: ok && !p.archived && (admin || (is("PM") && w.leader)), // D-25: PM leader
  };
}

/* ---------- generazione dei casi ---------- */

function* whos(): Generator<Who> {
  for (const active of [true, false])
    for (const admin of [false, true])
      for (const role of [null, ...ROLES] as (RoleId | null)[])
        for (const leader of [false, true])
          for (const decoy of [false, true]) {
            if (role === null && leader) continue;
            yield { admin, role, leader, decoy, active };
          }
}
const practiceOf = (t: TemplateId, o: Partial<AccessPractice> = {}): AccessPractice => ({
  templateId: t,
  archived: false,
  enabledGroups: ["PM_PERMESSI"],
  statoAttivita: "CREATA",
  iterationCount: 1,
  ...o,
});

describe("matrice: occorrenze (§3.2)", () => {
  it("template × utente × archiviata × iterazione × mirror × calcolato × gruppo owner × Assegna", () => {
    let n = 0;
    for (const t of TEMPLATES)
      for (const w of whos())
        for (const archived of [false, true])
          for (const past of [false, true])
            for (const mirror of [false, true])
              for (const computed of ["none", "manual", "locked"] as const)
                for (const owner of GROUPS)
                  for (const enabled of [false, true]) {
                    const p = practiceOf(t, { archived, enabledGroups: enabled ? ["PM_PERMESSI", owner] : owner === "PM_PERMESSI" ? [] : ["PM_PERMESSI"] });
                    const occ = {
                      kind: mirror ? ("MIRROR" as const) : ("MASTER" as const),
                      ownerGroup: owner,
                      computed: computed === "none" ? null : { formula: "X", description: "", manualOverride: computed === "manual" },
                    };
                    const got = occurrenceAccess(userOf(w, t), p, occ, { isCurrentIteration: !past });
                    const want = oracleOccurrence(w, { archived, past, mirror, computed, owner, enabled });
                    if (want.reason === undefined && !want.editable) expect(got.editable).toBe(false);
                    else expect(got, JSON.stringify({ t, w, archived, past, mirror, computed, owner, enabled })).toEqual(want);
                    n++;
                  }
    expect(n).toBeGreaterThan(50_000);
  });
});

describe("matrice: azioni (§3.3)", () => {
  it("template × utente × archiviata × stato × iterazioni × iterazione passata", () => {
    for (const t of TEMPLATES)
      for (const w of whos())
        for (const archived of [false, true])
          for (const stato of STATI)
            for (const iterations of [1, 2])
              for (const past of [false, true]) {
                const got = practiceActions(userOf(w, t), practiceOf(t, { archived, statoAttivita: stato, iterationCount: iterations }), { isCurrentIteration: !past });
                expect(got, JSON.stringify({ t, w, archived, stato, iterations, past })).toEqual(oracleActions(w, { archived, stato, iterations, past }));
              }
  });
});

describe("trasversali (D-120, D-121)", () => {
  it("Fatturabile e Fatturato: PM e ADMIN", () => {
    for (const w of whos()) {
      const u = userOf(w, "INWIT");
      const p = practiceOf("INWIT");
      const admin = w.active && w.admin;
      const view = { isCurrentIteration: true };
      expect(transversalAccess(u, p, "TRASV.FATTURATO", view).editable, JSON.stringify(w)).toBe(admin || (w.active && w.role === "PM"));
      expect(transversalAccess(u, p, "TRASV.FATTURABILE", view).editable).toBe(admin || (w.active && w.role === "PM"));
    }
  });

  it("Note Operative per gruppo: come un MASTER del gruppo (membro, Assegna, archivio, iterazione passata; ADMIN)", () => {
    for (const w of whos())
      for (const g of GROUPS)
        for (const enabled of [true, false])
          for (const archived of [false, true])
            for (const past of [false, true]) {
              const p = practiceOf("INWIT", { archived, enabledGroups: enabled ? ["PM_PERMESSI", g] : g === "PM_PERMESSI" ? [] : ["PM_PERMESSI"] });
              const got = transversalAccess(userOf(w, "INWIT"), p, `TRASV.NOTE_OPERATIVE.${g}`, { isCurrentIteration: !past });
              const want = oracleOccurrence(w, { archived, past, mirror: false, computed: "none", owner: g, enabled });
              expect(got.editable, JSON.stringify({ w, g, enabled, archived, past })).toBe(want.editable);
              if (want.reason) expect(got.reason).toBe(want.reason);
            }
  });
});

describe("casi nominati", () => {
  const T: TemplateDTO = COMPILED_TEMPLATES.TIM_FIBERCOP.template;
  const pm = userOf({ admin: false, role: "PM", leader: false, decoy: false, active: true }, "TIM_FIBERCOP");
  const pmLeader = userOf({ admin: false, role: "PM", leader: true, decoy: false, active: true }, "TIM_FIBERCOP");
  const ut = userOf({ admin: false, role: "UT", leader: false, decoy: false, active: true }, "TIM_FIBERCOP");
  const admin: AccessUser = { id: "a", isAdmin: true, status: "active", memberships: [] };

  it("UT modifica anche i master PE (stesso gruppo UT_PE, D-18) solo dopo l'Assegna (D-22)", () => {
    const pe = T.occurrences.find((o) => o.kind === "MASTER" && o.ownerGroup === "UT_PE" && o.sectionKey === "UT_PE.PE" && !o.computed)!;
    expect(occurrenceAccess(ut, practiceOf("TIM_FIBERCOP"), pe, { isCurrentIteration: true })).toEqual({ editable: false, reason: "NOT_ASSIGNED" });
    expect(occurrenceAccess(ut, practiceOf("TIM_FIBERCOP", { enabledGroups: ["PM_PERMESSI", "UT_PE"] }), pe, { isCurrentIteration: true })).toEqual({ editable: true });
  });

  it("calcolati sul template vero: Forecast Ottenimento Permessi modificabile, Tipologia attività PE no", () => {
    const inwit = COMPILED_TEMPLATES.INWIT.template;
    const u = userOf({ admin: false, role: "PM", leader: false, decoy: false, active: true }, "INWIT");
    const map = accessMap(u, practiceOf("INWIT", { enabledGroups: ["PM_PERMESSI", "UT_PE"] }), inwit, { isCurrentIteration: true });
    expect(map["F052@PM_PERMESSI.ITER_AUTORIZZATIVO"]).toEqual({ editable: true });
    const tipoPE = inwit.occurrences.find((o) => o.flowId === "F108" && o.kind === "MASTER")!;
    expect(map[tipoPE.occurrenceKey]).toEqual({ editable: false, reason: "COMPUTED" });
    expect(Object.keys(map)).toContain("TRASV.FATTURABILE");
  });

  it("ripresentazione solo PM leader o ADMIN; rilavorazione anche da archiviata; cancellazione con 2 iterazioni no", () => {
    expect(practiceActions(pm, practiceOf("TIM_FIBERCOP")).canResubmit).toBe(false);
    expect(practiceActions(pmLeader, practiceOf("TIM_FIBERCOP")).canResubmit).toBe(true);
    expect(practiceActions(admin, practiceOf("TIM_FIBERCOP")).canResubmit).toBe(true);
    expect(practiceActions(pm, practiceOf("TIM_FIBERCOP", { archived: true, statoAttivita: "TERMINATO" })).canRework).toBe(true);
    expect(practiceActions(admin, practiceOf("TIM_FIBERCOP", { iterationCount: 2 })).canDelete).toBe(false);
    expect(practiceActions(admin, practiceOf("TIM_FIBERCOP", { archived: true, statoAttivita: "KO" })).canRestore).toBe(true);
  });

  it("repeatAccess: VINCOLI sempre a righe fisse; gli altri gruppi seguono l'accesso ai master", () => {
    const ra = repeatAccess(pm, practiceOf("TIM_FIBERCOP"), T, { isCurrentIteration: true });
    expect(ra.VINCOLI).toEqual({ canAddRows: false, canRemoveRows: false });
    expect(ra.TENANT).toEqual({ canAddRows: true, canRemoveRows: true });
    expect(repeatAccess(ut, practiceOf("TIM_FIBERCOP"), T, { isCurrentIteration: true }).TENANT).toEqual({ canAddRows: false, canRemoveRows: false });
    expect(repeatAccess(admin, practiceOf("TIM_FIBERCOP", { archived: true }), T, { isCurrentIteration: true }).ARPA).toEqual({ canAddRows: false, canRemoveRows: false });
  });

  it("visibilità ed elenco: stessa appartenenza, scope assigned/all, ADMIN tutto", () => {
    const dl = userOf({ admin: false, role: "DL", leader: false, decoy: true, active: true }, "LEONARDO");
    expect(canSeePractice(dl, { templateId: "LEONARDO" })).toBe(true);
    const otherTemplate = TEMPLATES.find((x) => x !== "LEONARDO")!;
    // L'esca PM leader su un altro template rende visibile quel template, ma non dà ruoli sul LEONARDO.
    expect(isInScope(dl, { templateId: "LEONARDO", enabledGroups: ["PM_PERMESSI"] }, "assigned")).toBe(false);
    expect(isInScope(dl, { templateId: "LEONARDO", enabledGroups: ["PM_PERMESSI", "DL"] }, "assigned")).toBe(true);
    expect(isInScope(dl, { templateId: "LEONARDO", enabledGroups: ["PM_PERMESSI"] }, "all")).toBe(true);
    expect(isInScope(pm, { templateId: "TIM_FIBERCOP", enabledGroups: [] }, "assigned")).toBe(true);
    expect(canSeePractice(pm, { templateId: otherTemplate === "TIM_FIBERCOP" ? "ILIAD" : otherTemplate })).toBe(false);
    expect(canCreateIn(dl)).toEqual([TEMPLATES.find((x) => x !== "LEONARDO")]); // solo dall'esca PM
    expect(canCreateIn(admin)).toHaveLength(6);
  });

  it("liste e chiusura degli alert", () => {
    const utLeader = userOf({ admin: false, role: "UT", leader: true, decoy: false, active: true }, "ILIAD");
    expect(listEditable(utLeader, { kind: "CONFIGURABLE", templateId: "ILIAD", group: "UT_PE" })).toBe(true);
    expect(listEditable(utLeader, { kind: "CONFIGURABLE", templateId: "INWIT", group: "UT_PE" })).toBe(false);
    expect(listEditable(utLeader, { kind: "CONTROLLED", templateId: "ILIAD", group: "UT_PE" })).toBe(false);
    expect(listEditable(admin, { kind: "CONTROLLED", templateId: null, group: null })).toBe(true);
    expect(canCloseAlert(utLeader, { templateId: "ILIAD", ruleId: "FORECAST_UT", ownerGroup: "UT_PE" })).toBe(true);
    expect(canCloseAlert(utLeader, { templateId: "ILIAD", ruleId: "OFFERTA_ODA", ownerGroup: "UT_PE" })).toBe(false);
    expect(canCloseAlert(pmLeader, { templateId: "TIM_FIBERCOP", ruleId: "OFFERTA_ODA", ownerGroup: "PM_PERMESSI" })).toBe(true);
    expect(canCloseAlert(pm, { templateId: "TIM_FIBERCOP", ruleId: "FORECAST_UT", ownerGroup: "PM_PERMESSI" })).toBe(false);
  });
});
