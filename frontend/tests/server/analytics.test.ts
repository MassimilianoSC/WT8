// @vitest-environment node
/**
 * B8: statistiche (§9), carichi di lavoro (§10), export CSV (§11). Parte su database con il replica set usa-e-getta:
 *   MONGO_RS_TEST_URL="mongodb://127.0.0.1:27021/?directConnection=true" yarn vitest run tests/server/analytics.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, ObjectId, type Db } from "mongodb";
import type { MembershipDTO, StatoAttivita, TemplateId, UserDTO } from "@/lib/contract";
import { assigneesOf } from "@/lib/practice/assignees";
import { cellText, csvCell, csvLine, itDate, safeText, statoLabel, type CsvLookup } from "@/lib/practice/csv";
import { bootstrapStore, store } from "@/lib/store/db";
import { buildNewPractice } from "@/lib/store/practice-factory";
import type { AlertDoc, StoreUserDoc } from "@/lib/store/types";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";
import { getStats, getWorkload, parseStatsQuery, parseWorkloadQuery, pmTemplates, workloadGroups } from "@/services/practices-v2/analytics";
import { exportPractices, parseExportQuery } from "@/services/practices-v2/export";
import { toUserDTO } from "@/services/users-v2";
import { assertDisposableTarget } from "../../scripts/db/guard";

/** Parser minimo di una riga CSV con virgolette (per le prove). */
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q && ch === '"' && line[i + 1] === '"') {
      cur += '"';
      i++;
    } else if (ch === '"') q = !q;
    else if (ch === ";" && !q) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const lookup: CsvLookup = { listLabel: (l, c) => (l === "L" && c === "A" ? "Etichetta A" : null), userName: (id) => (id === "0123456789abcdef01234567" ? "Mario Rossi" : null) };
const dto = (memberships: MembershipDTO[], extra: Partial<UserDTO> = {}): UserDTO => ({ id: new ObjectId().toHexString(), name: "u", email: "u@x", status: "active", isAdmin: false, memberships, createdAt: "", updatedAt: "", ...extra });
const m = (group: MembershipDTO["group"], role: MembershipDTO["role"], leader = false, templateId: TemplateId = "INWIT"): MembershipDTO => ({ templateId, group, role, leader });

describe("CSV (§11)", () => {
  it("date, decimali, etichette, Altro, utenti e Nessuno", () => {
    const sel = { dataType: "SELECT" as const, list: { listId: "L", kind: "CONFIGURABLE" as const, allowOther: true } };
    const usr = { dataType: "USERS" as const, list: { listId: "USERS", kind: "USERS" as const, allowOther: false } };
    expect(cellText({ dataType: "DATE" }, "2026-03-01", lookup)).toBe("01/03/2026");
    expect(cellText({ dataType: "NUMBER" }, 45.5, lookup)).toBe("45,5");
    expect(cellText({ dataType: "NUMBER" }, -3, lookup)).toBe("-3");
    expect(cellText(sel, { code: "A" }, lookup)).toBe("Etichetta A");
    expect(cellText(sel, { code: "B" }, lookup)).toBe("B");
    expect(cellText(sel, { code: "ALTRO", otherText: "Impresa X" }, lookup)).toBe("Impresa X");
    expect(cellText(usr, [{ code: "0123456789abcdef01234567" }, { code: "NESSUNO" }], lookup)).toBe("Mario Rossi, Nessuno");
    expect(cellText({ dataType: "TEXT" }, null, lookup)).toBe("");
    expect(itDate("2026-12-31")).toBe("31/12/2026");
    expect(statoLabel("INTEGRAZIONE_RICHIESTA")).toBe("INTEGRAZIONE RICHIESTA");
    expect(statoLabel("STAND_BY")).toBe("STAND-BY");
  });

  it("escape e protezione dalle formule", () => {
    expect(safeText("=SOMMA(A1)")).toBe("'=SOMMA(A1)");
    expect(safeText("+39 333")).toBe("'+39 333");
    expect(safeText("testo")).toBe("testo");
    expect(csvCell('a;b "c"')).toBe('"a;b ""c"""');
    expect(csvCell("riga1\nriga2")).toBe('"riga1\nriga2"');
    expect(csvLine(["a", "b;c", ""])).toBe('a;"b;c";');
  });
});

describe("persone nei campi utente e permessi", () => {
  it("assigneesOf: campi USER/USERS anche nelle righe, Nessuno escluso, con il ruolo del campo", () => {
    const t = COMPILED_TEMPLATES.INWIT.template;
    const a = assigneesOf(t, { F095: { code: "u1" }, F110: [{ code: "u2" }, { code: "u1" }], F036: { code: "NESSUNO" } }, []);
    expect([...a.keys()].sort()).toEqual(["u1", "u2"]);
    expect([...a.get("u1")!].sort()).toEqual(["PE", "UT"]);
  });

  it("chi vede statistiche e carichi (D-23)", () => {
    expect(pmTemplates(dto([m("PM_PERMESSI", "PM")]))).toEqual(["INWIT"]);
    expect(pmTemplates(dto([m("PM_PERMESSI", "PERMESSI", true)]))).toEqual([]);
    expect(pmTemplates(dto([], { isAdmin: true }))).toHaveLength(6);
    expect(workloadGroups(dto([m("PM_PERMESSI", "PM")]), "INWIT")).toEqual(["PM_PERMESSI", "UT_PE", "AIE", "DL"]);
    expect(workloadGroups(dto([m("UT_PE", "UT", true)]), "INWIT")).toEqual(["UT_PE"]);
    expect(workloadGroups(dto([m("UT_PE", "UT")]), "INWIT")).toEqual([]);
  });

  it("parametri", () => {
    const now = new Date("2026-10-08T07:00:00Z");
    expect(parseStatsQuery(new URLSearchParams(""), now)).toEqual({ templateId: undefined, from: "2026-09-08", to: "2026-10-08" });
    expect(() => parseStatsQuery(new URLSearchParams("from=2026-10-09&to=2026-10-01"), now)).toThrow(/periodo/);
    expect(() => parseStatsQuery(new URLSearchParams("from=08/10/2026"), now)).toThrow(/from/);
    expect(() => parseWorkloadQuery(new URLSearchParams(""))).toThrow(/obbligatorio/);
    expect(() => parseWorkloadQuery(new URLSearchParams("templateId=INWIT&group=X"))).toThrow(/group/);
    expect(() => parseExportQuery(new URLSearchParams("stato=KO"))).toThrow(expect.objectContaining({ status: 400 }));
    expect(parseExportQuery(new URLSearchParams("templateId=INWIT"))).toEqual({ templateId: "INWIT", archived: false });
  });
});

const URL_RS = process.env.MONGO_RS_TEST_URL;
describe.skipIf(!URL_RS)("B8 sul replica set usa-e-getta", () => {
  let client: MongoClient;
  let db: Db;
  const DB = `practicehub_test_b8_${Date.now()}`;
  const now = new Date("2026-10-08T07:00:00Z");
  const u: Record<string, UserDTO> = {};
  const ids: Record<string, ObjectId> = {};

  async function user(key: string, name: string, memberships: MembershipDTO[], extra: Partial<StoreUserDoc> = {}) {
    const doc: StoreUserDoc = { _id: new ObjectId(), email: `${key}@test.local`, name, passwordHash: null, status: "active", isAdmin: false, memberships, authVersion: 1, createdAt: now, updatedAt: now, ...extra };
    await store.users(db).insertOne(doc);
    u[key] = toUserDTO(doc);
  }
  async function practice(key: string, templateId: TemplateId, stato: StatoAttivita, values: Record<string, unknown>, opts: { archived?: boolean; groups?: MembershipDTO["group"][] } = {}) {
    const b = buildNewPractice({
      practiceId: new ObjectId(),
      iterationId: new ObjectId(),
      templateId,
      template: COMPILED_TEMPLATES[templateId].template,
      identity: { codiceG7: "100", codiceSito: key, nomeSito: `Sito ${key}`, committente: { code: "TODOS" }, clienteFinale: { code: "INWIT" } },
      values: values as never,
      enabledGroups: opts.groups,
      createdBy: null,
      now,
    });
    b.iteration.stateMeta.stato = stato;
    b.practice.currentSummary.statoAttivita = stato;
    b.iteration.transversal.noteOperative = { PM_PERMESSI: "nota pm", UT_PE: "nota ut", AIE: "", DL: "" };
    await store.practices(db).insertOne({ ...b.practice, archived: !!opts.archived, archivedAt: opts.archived ? now : null });
    await store.iterations(db).insertOne(b.iteration);
    await store.repeatRows(db).insertMany(b.rows);
    ids[key] = b.practice._id;
    return b;
  }
  const stato = (practiceId: ObjectId, iterationId: ObjectId, to: StatoAttivita, at: string) =>
    store.events(db).insertOne({ _id: new ObjectId(), operationId: new ObjectId().toHexString(), opKey: new ObjectId().toHexString(), eventIndex: 0, practiceId, iterationId, n: 1, kind: "STATO", actorId: null, actorName: null, source: "USER", timestamp: new Date(at), detail: "x", structuredDetail: { from: "ASSEGNATO", to } });
  const alert = (b: { practice: { _id: ObjectId }; iteration: { _id: ObjectId } }, dueAt: Date, ruleId = "SOPRALLUOGO"): AlertDoc => ({
    _id: new ObjectId(), practiceId: b.practice._id, iterationId: b.iteration._id, ruleId, subject: {}, episodeKey: new ObjectId().toHexString(), generation: 1, sourceFingerprint: "x", ruleVersion: 1, calendarVersion: "1",
    dueLocalDate: null, dueAt, status: "OPEN", executionStatus: "ACTIVE", openedAt: now, closedAt: null, closeMode: null, closedBy: null, closeReason: null, recipientsSnapshot: [], nextReminderAt: null,
  });

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    client = await new MongoClient(URL_RS!).connect();
    db = client.db(DB);
    await bootstrapStore(db);
    await user("admin", "Admin", [], { isAdmin: true });
    await user("pm", "Paola PM", [m("PM_PERMESSI", "PM")]);
    await user("leaderUt", "Luca Leader UT", [m("UT_PE", "UT", true)]);
    await user("ut1", "Ugo UT", [m("UT_PE", "UT")]);
    await user("pe1", "Pia PE", [m("UT_PE", "PE")]);
    await user("aie", "Aldo AIE", [m("AIE", "AIE")]);
    const p1 = await practice("P1", "INWIT", "ASSEGNATO", { F023: "2026-09-01", F095: { code: u.ut1.id }, F110: [{ code: u.pe1.id }], F016: "=SOMMA(1;2)", F021: 45.46 }, { groups: ["UT_PE"] });
    await practice("P2", "INWIT", "CREATA", { F095: { code: u.ut1.id } });
    const p3 = await practice("P3", "INWIT", "TERMINATO", { F023: "2026-09-05" });
    const p4 = await practice("P4", "INWIT", "KO", {}, { archived: true });
    await practice("P5", "ILIAD", "ASSEGNATO", {});
    await stato(p3.practice._id, p3.iteration._id, "TERMINATO", "2026-10-05T10:00:00Z");
    await stato(p4.practice._id, p4.iteration._id, "KO", "2026-10-06T10:00:00Z");
    await stato(p4.practice._id, p4.iteration._id, "KO", "2026-08-01T10:00:00Z"); // fuori periodo
    await store.alerts(db).insertMany([alert(p1, new Date(now.getTime() + 2 * 86_400_000)), alert(p1, new Date(now.getTime() - 86_400_000), "VERBALE"), alert(p4, new Date(now.getTime() + 86_400_000))]);
    await store.repeatRows(db).updateOne({ iterationId: p1.iteration._id, groupKey: "VINCOLI", "constraint.code": "MONUMENTALE" }, { $set: { "constraint.stato": { code: "PRESENTE" } } });
  });
  afterAll(async () => {
    await client?.db(DB).dropDatabase();
    await client?.close();
  });

  const period = { from: "2026-09-08", to: "2026-10-08" };

  it("statistiche del gestore: attive, stati, gruppi, persone (per nome), alert, chiusure, lead time", async () => {
    const s = await getStats(db, u.pm, { ...period, templateId: "INWIT" }, now);
    expect(s).toMatchObject({ period, activeTotal: 2, byTemplate: { INWIT: 2 }, alertsOpen: 2, alertsOverdue: 1, closedInPeriod: { terminato: 1, ko: 1 } });
    expect(s.byStato).toMatchObject({ ASSEGNATO: 1, CREATA: 1, TERMINATO: 1, KO: 0 });
    expect(s.byGroup).toEqual({ PM_PERMESSI: 2, UT_PE: 1, AIE: 0, DL: 0 });
    expect(s.byAssignee).toEqual([
      { userId: u.pe1.id, name: "Pia PE", count: 1 },
      { userId: u.ut1.id, name: "Ugo UT", count: 2 },
    ]);
    expect(s.upcoming).toMatchObject({ count: 1, items: [{ codiceSito: "P1", rule: "SOPRALLUOGO", templateId: "INWIT" }] });
    expect(s.leadTime).toEqual({ count: 1, meanDays: 30, medianDays: 30 });
  });

  it("statistiche: senza gestore = i gestori in cui si è PM; ADMIN vede anche ILIAD; altri 403", async () => {
    expect((await getStats(db, u.pm, period, now)).byTemplate).toEqual({ INWIT: 2 });
    expect((await getStats(db, u.admin, period, now)).byTemplate).toEqual({ INWIT: 2, ILIAD: 1 });
    await expect(getStats(db, u.ut1, period, now)).rejects.toMatchObject({ status: 403 });
    await expect(getStats(db, u.pm, { ...period, templateId: "ILIAD" }, now)).rejects.toMatchObject({ status: 403 });
  });

  it("carichi di lavoro: per appartenenza e ruolo del campo, ordinati per nome; team leader solo il proprio gruppo", async () => {
    const all = (await getWorkload(db, u.pm, { templateId: "INWIT" })).items;
    expect(all.map((i) => [i.name, i.group, i.role, i.activePractices])).toEqual([
      ["Aldo AIE", "AIE", "AIE", 0],
      ["Luca Leader UT", "UT_PE", "UT", 0],
      ["Paola PM", "PM_PERMESSI", "PM", 0],
      ["Pia PE", "UT_PE", "PE", 1],
      ["Ugo UT", "UT_PE", "UT", 2],
    ]);
    expect(all.find((i) => i.name === "Ugo UT")!.byStato).toEqual({ ASSEGNATO: 1, CREATA: 1 });
    expect((await getWorkload(db, u.leaderUt, { templateId: "INWIT" })).items.map((i) => i.group)).toEqual(["UT_PE", "UT_PE", "UT_PE"]);
    await expect(getWorkload(db, u.leaderUt, { templateId: "INWIT", group: "AIE" })).rejects.toMatchObject({ status: 403 });
    await expect(getWorkload(db, u.ut1, { templateId: "INWIT" })).rejects.toMatchObject({ status: 403 });
  });

  it("export: intestazione, formati, note visibili, vincoli, protezione formule; aperto a chi ha un'appartenenza (D-128)", async () => {
    const f = await exportPractices(db, u.pm, { templateId: "INWIT", archived: false }, now);
    expect(f.filename).toBe("WT8_INWIT_2026-10-08.csv");
    expect(f.body.startsWith("﻿")).toBe(true);
    const lines = f.body.slice(1).trimEnd().split("\r\n");
    const header = cells(lines[0]);
    expect(header.slice(0, 4)).toEqual(["ID pratica", "Iterazione", "Stato attività", "Archiviata"]);
    expect(header).toContain("F095 Tecnico UT");
    expect(header.filter((h) => h.startsWith("Note Operative"))).toEqual(["Note Operative PM/Permessi"]);
    // D-143: undici vincoli; quello che si chiama già "Vincoli …" non ripete il prefisso.
    expect(header.filter((h) => h.startsWith("Vincolo "))).toHaveLength(10);
    expect(header).toContain("Vincoli Ambientali Naturalistici");
    expect(header).not.toContain("Vincolo Vincoli Ambientali Naturalistici");
    expect(lines).toHaveLength(4); // intestazione + P1, P2, P3 (P4 archiviata)
    const p1 = lines.find((l) => l.startsWith(ids.P1.toHexString()))!;
    const cell = (name: string) => {
      const i = header.indexOf(name);
      return cells(p1)[i];
    };
    expect(cell("Stato attività")).toBe("ASSEGNATO");
    expect(cell("F023 Data assegnazione")).toBe("01/09/2026");
    expect(cell("F095 Tecnico UT")).toBe("Ugo UT");
    expect(cell("F021 Latitudine")).toBe("45,46");
    expect(cell("Note Operative PM/Permessi")).toBe("nota pm");
    expect(cell("Vincolo Monumentale")).toBe("Presente (Soprintendenza)");
    expect(cell("F016 SR INWIT")).toBe("'=SOMMA(1;2)");
    expect(cells(p1)).toHaveLength(header.length);
    expect(f.body).not.toContain("nota ut");
    const leader = await exportPractices(db, u.admin, { templateId: "INWIT", archived: true }, now);
    expect(leader.body.split("\r\n")[0].split(";").filter((h) => h.startsWith("Note Operative"))).toHaveLength(4);
    expect(leader.body.trimEnd().split("\r\n")).toHaveLength(2); // solo P4
    // D-128: un UT del gestore esporta le pratiche che vede, con la sola nota del proprio gruppo; senza appartenenza 403.
    const ut = await exportPractices(db, u.ut1, { templateId: "INWIT", archived: false }, now);
    expect(cells(ut.body.slice(1).split("\r\n")[0]).filter((h) => h.startsWith("Note Operative"))).toEqual(["Note Operative UT/PE"]);
    expect(ut.body).toContain("nota ut");
    expect(ut.body).not.toContain("nota pm");
    expect(ut.body.trimEnd().split("\r\n")).toHaveLength(2); // scope "assigned" (default, v0.3.4): solo P1, dove UT+PE è abilitato
    const utAll = await exportPractices(db, u.ut1, { templateId: "INWIT", archived: false, scope: "all" }, now);
    expect(utAll.body.trimEnd().split("\r\n")).toHaveLength(4);
    await expect(exportPractices(db, u.ut1, { templateId: "ILIAD" }, now)).rejects.toMatchObject({ status: 403 });
    // D-129: from/to sulla data di creazione (tutte create l'08/10).
    expect((await exportPractices(db, u.pm, { templateId: "INWIT", from: "2026-10-09" }, now)).body.trimEnd().split("\r\n")).toHaveLength(1);
    expect((await exportPractices(db, u.pm, { templateId: "INWIT", from: "2026-10-08", to: "2026-10-08" }, now)).body.trimEnd().split("\r\n")).toHaveLength(4);
  });
});
