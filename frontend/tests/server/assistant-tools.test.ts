// @vitest-environment node
/**
 * Strumenti di sola lettura dell'assistente sugli oracoli del progetto (§13.2 S0, §13.3 E, §13.5 permessi).
 * Due database usa-e-getta: S0 puro e S0 + fixture E. Orologio della domanda fisso (09/10/2026 10:00 Roma).
 *   MONGO_RS_TEST_URL="mongodb://127.0.0.1:27021/?directConnection=true" yarn vitest run tests/server/assistant-tools.test.ts
 */
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, type Db } from "mongodb";
import type { UserDTO } from "@/lib/contract";
import { store } from "@/lib/store/db";
import { FactRegistry, SourceRegistry, type ToolContext } from "@/services/assistant/tools/common";
import { runTool, toolDeclarations, type ToolOutcome } from "@/services/assistant/tools";
import { toUserDTO } from "@/services/users-v2";
import { assertDisposableTarget } from "../../scripts/db/guard";
import { applyFixtureE, E_LEGACY_NOTE, E_NOTES, E_NOW, eIds, seedS0 } from "../fixtures/assistant-e";

const URL_RS = process.env.MONGO_RS_TEST_URL;
const OPERATIONAL = ["practices", "practice_iterations", "repeat_rows", "value_history", "practice_events", "alerts", "notifications", "delivery_outbox", "users"];
const CANARIES = [E_NOTES.AIE, E_NOTES.DL, E_LEGACY_NOTE];

describe.skipIf(!URL_RS)("strumenti dell'assistente", () => {
  let client: MongoClient;
  let s0: Db;
  let e: Db;
  const STAMP = Date.now();
  const DB_S0 = `practicehub_test_ai_s0_${STAMP}`;
  const DB_E = `practicehub_test_ai_tools_e_${STAMP}`;

  async function user(db: Db, key: string): Promise<UserDTO> {
    return toUserDTO((await store.users(db).findOne({ _id: eIds.user(key) }))!);
  }
  function ctxFor(db: Db, u: UserDTO): ToolContext {
    return { db, user: u, now: E_NOW, todayRome: "2026-10-09", question: "domanda di prova", signal: new AbortController().signal, sources: new SourceRegistry(), facts: new FactRegistry() };
  }
  async function run(db: Db, key: string, tool: string, args: unknown) {
    const ctx = ctxFor(db, await user(db, key));
    const out = await runTool(ctx, tool, args);
    return { out, ctx, json: JSON.stringify({ out, sources: ctx.sources.list, facts: ctx.facts.list }) };
  }
  const ok = (o: ToolOutcome) => {
    if (!o.ok) throw new Error(`strumento fallito: ${o.error.code} ${o.error.message}`);
    return o.result;
  };
  const fact = (ctx: ToolContext, key: string) => ctx.facts.list.find((f) => f.key === key)?.value;
  const sites = (o: ToolOutcome) => (ok(o).items as { codiceSito: string }[]).map((i) => i.codiceSito).sort();
  const period = { from: "2026-10-01", to: "2026-10-09" };

  async function fingerprint(db: Db): Promise<string> {
    const h = createHash("sha256");
    for (const c of OPERATIONAL) h.update(c + JSON.stringify(await db.collection(c).find({}).sort({ _id: 1 }).toArray()));
    return h.digest("hex");
  }

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB_S0);
    assertDisposableTarget(URL_RS!, DB_E);
    client = await new MongoClient(URL_RS!).connect();
    s0 = client.db(DB_S0);
    e = client.db(DB_E);
    await seedS0(s0);
    await seedS0(e);
    await applyFixtureE(e, { alerts: true, history: true, legacyHistory: true });
  }, 240_000);
  afterAll(async () => {
    for (const d of [DB_S0, DB_E]) await client?.db(d).dropDatabase();
    await client?.close();
  });

  describe("S0 (§13.2)", () => {
    it("S01–S04, S07: KPI dal servizio, FASTWEB esplicito a zero, fonte STATS", async () => {
      const a = await run(s0, "admin", "get_stats", { period });
      expect(fact(a.ctx, "stats.activeTotal")).toBe(7);
      expect(a.ctx.sources.list[0]).toMatchObject({ kind: "STATS", query: { from: "2026-10-01", to: "2026-10-09" } });
      const p = await run(s0, "pm", "get_stats", { period });
      const item = ok(p.out).items[0] as Record<string, Record<string, number>>;
      expect(item.attivePerCliente).toEqual({ ILIAD: 1, TOWERNET: 2, TIM_FIBERCOP: 1, INWIT: 1, FASTWEB_VODAFONE: 0, LEONARDO: 2 });
      expect(item.perStatoOra).toMatchObject({ ASSEGNATO: 3, CREATA: 3, PROTOCOLLATO: 1 });
      expect(item.attivePerGruppoAbilitato.UT_PE).toBe(1);
      expect(fact(p.ctx, "stats.leadTime.mean")).toBeNull();
      expect(fact(p.ctx, "stats.alertsOpen")).toBe(0);
    });

    it("S11, S13, S14, S33: elenco per ruolo e scope", async () => {
      expect(sites((await run(s0, "ut", "get_practices", { selection: {} })).out)).toEqual(["IL-TO-0001"]);
      expect(ok((await run(s0, "aie", "get_practices", { selection: {} })).out).total).toBe(0);
      expect(ok((await run(s0, "dl", "get_practices", { selection: { scope: "all" } })).out).total).toBe(7);
      const m = await run(s0, "multi", "get_practices", { selection: {} });
      expect(sites(m.out)).toEqual(["IL-TO-0001", "TN-MI-0001", "TN-MI-0002"]);
      expect(m.ctx.sources.list.find((s) => s.kind === "LIST")).toMatchObject({ query: { scope: "assigned", archived: false } });
    });

    it("S15, S16, S19, S20: G7 duplicato, stesso sito, archivio solo se chiesto", async () => {
      expect(sites((await run(s0, "pm", "get_practices", { selection: { q: "1000002" } })).out)).toEqual(["TN-MI-0001", "TN-MI-0002"]);
      expect(ok((await run(s0, "admin", "get_practices", { selection: { q: "Genova Sestri" } })).out).total).toBe(2);
      expect(ok((await run(s0, "pm", "get_practices", { selection: { templateId: "FASTWEB_VODAFONE" } })).out).total).toBe(0);
      expect(sites((await run(s0, "pm", "get_practices", { selection: { templateId: "FASTWEB_VODAFONE", archived: true } })).out)).toEqual(["FV-BO-0001"]);
    });

    it("S21, S23: forecast della settimana per milestone del catalogo", async () => {
      const r = await run(s0, "pm", "get_calendar", { selection: { templateId: "ILIAD" }, period: { from: "2026-10-12", to: "2026-10-18" }, dateKind: "FORECAST" });
      expect(ok(r.out).items).toMatchObject([{ milestone: "PROTOCOLLO", data: "2026-10-15", pratica: { codiceSito: "IL-TO-0001" } }]);
      expect(r.ctx.sources.list.find((s) => s.kind === "PRACTICE")).toMatchObject({ flowId: "F028", codiceSito: "IL-TO-0001" });
      const ut = await run(s0, "pm", "get_calendar", { selection: { templateId: "ILIAD" }, period: { from: "2026-10-12", to: "2026-10-18" }, dateKind: "FORECAST", milestones: ["UT"] });
      expect(ok(ut.out).total).toBe(0);
    });

    it("S25, S26: forecast ARPA scaduto solo sulla riga non conclusa; nessun alert prima del worker", async () => {
      const r = await run(s0, "pm", "get_issues", { selection: { templateId: "TIM_FIBERCOP" }, kinds: ["OVERDUE_FORECAST", "OVERDUE_ALERT"] });
      const items = ok(r.out).items as { milestone: string; data: string; riga?: string }[];
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ tipo: "OVERDUE_FORECAST", milestone: "ARPA", data: "2026-09-20", riga: eIds.row("TIM-1", 1, "ARPA", 2).toHexString() });
      expect(fact(r.ctx, "issues.OVERDUE_ALERT")).toBe(0);
    });

    it("S29, S30: integrazione dell'iterazione 1 e stato corrente INWIT", async () => {
      const id = eIds.practice("INWIT-1").toHexString();
      const old = await run(s0, "pm", "get_practice", { practiceId: id, iteration: 1, topics: ["notes", "identity"] });
      const items = ok(old.out).items as Record<string, unknown>[];
      expect(items.find((i) => i.campo === "Note integrazione")).toMatchObject({ nota: { text: "Documentazione integrativa richiesta" }, dateDellaRiga: { "Richiesta integrazione": "2026-07-01", "Invio integrazione": "2026-07-20" } });
      expect(items.find((i) => i.argomento === "identity")).toMatchObject({ stato: "KO", iterazione: 1, iterazioneCorrente: false });
      const cur = await run(s0, "pm", "get_practice", { practiceId: id, topics: ["identity"] });
      expect(ok(cur.out).items[0]).toMatchObject({ stato: "ASSEGNATO", iterazione: 2, iterazioni: [1, 2] });
    });

    it("S32, P03, P04, P06, P07: capacità per template e ruolo; pratica non visibile come inesistente", async () => {
      expect(fact((await run(s0, "multi", "get_stats", { templateId: "TOWERNET", period })).ctx, "stats.activeTotal")).toBe(2);
      expect((await run(s0, "multi", "get_stats", { templateId: "ILIAD", period })).out).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
      const p04 = await run(s0, "multi", "get_practice", { practiceId: eIds.practice("TIM-1").toHexString(), topics: ["identity"] });
      expect(p04.out).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      expect(p04.json).not.toMatch(/TF-RM-0001|Roma Ostiense/);
      expect((await run(s0, "ut", "get_workload", { templateId: "ILIAD" })).out).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
      expect((await run(s0, "ut.leader", "get_workload", { templateId: "ILIAD", group: "AIE" })).out).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
      // Il modello di un tecnico non vede proprio get_stats né get_workload; il leader vede i carichi.
      const names = async (k: string) => toolDeclarations({ user: await user(s0, k) }).map((t) => t.name);
      expect(await names("ut")).not.toContain("get_stats");
      expect(await names("ut")).not.toContain("get_workload");
      expect(await names("ut.leader")).toContain("get_workload");
      expect(await names("permessi")).not.toContain("get_stats");
      expect(await names("pm")).toEqual(expect.arrayContaining(["get_stats", "get_workload"]));
    });

    it("I06: strumento sconosciuto, campi in più, regex o date impossibili → errore neutro", async () => {
      expect((await run(s0, "pm", "drop_database", {})).out).toMatchObject({ ok: false, error: { code: "TOOL_UNKNOWN" } });
      expect((await run(s0, "pm", "get_practices", { selection: { $where: "1" } })).out).toMatchObject({ ok: false, error: { code: "INVALID" } });
      expect((await run(s0, "pm", "get_practices", { selection: {}, filter: { archived: true } })).out).toMatchObject({ ok: false, error: { code: "INVALID" } });
      expect((await run(s0, "pm", "get_calendar", { selection: {}, period: { from: "2026-02-30", to: "2026-03-01" }, dateKind: "FORECAST" })).out).toMatchObject({ ok: false, error: { code: "INVALID" } });
      expect((await run(s0, "pm", "get_calendar", { selection: {}, period: { from: "2026-01-01", to: "2027-06-01" }, dateKind: "FORECAST" })).out).toMatchObject({ ok: false, error: { code: "INVALID" } });
      expect((await run(s0, "pm", "search_visible_notes", { selection: { templateId: "ILIAD" }, text: ".*" })).out.ok).toBe(true); // letterale, non regex
    });
  });

  describe("fixture E (§13.3) e divieti (§13.5)", () => {
    it("E01–E03: consegne previste e effettuate", async () => {
      const ut = await run(e, "pm", "get_calendar", { selection: {}, period: { from: "2026-10-12", to: "2026-10-18" }, dateKind: "FORECAST", milestones: ["UT"] });
      expect(ok(ut.out).items).toMatchObject([{ milestone: "UT", data: "2026-10-14", pratica: { codiceSito: "IL-TO-0001" } }]);
      const pe = await run(e, "pm", "get_calendar", { selection: {}, period: { from: "2026-10-01", to: "2026-10-16" }, dateKind: "FORECAST", milestones: ["PE"] });
      expect((ok(pe.out).items as { pratica: { codiceSito: string }; data: string }[]).map((i) => [i.pratica.codiceSito, i.data])).toEqual([
        ["TF-RM-0001", "2026-10-08"],
        ["IL-TO-0001", "2026-10-16"],
      ]);
      const done = await run(e, "pm", "get_calendar", { selection: {}, period, dateKind: "RECORDED", milestones: ["CONSEGNA_PE"] });
      expect(ok(done.out).items).toMatchObject([{ milestone: "CONSEGNA_PE", data: "2026-10-08", pratica: { codiceSito: "TN-MI-0001" } }]);
    });

    it("robustezza: milestone del tipo opposto (CONSEGNA_UT con FORECAST, PE con RECORDED), minuscole, id inesistenti", async () => {
      const prev = await run(e, "pm", "get_calendar", { selection: {}, period: { from: "2026-10-12", to: "2026-10-18" }, dateKind: "FORECAST", milestones: ["CONSEGNA_UT"] });
      expect(ok(prev.out).items).toMatchObject([{ milestone: "UT", data: "2026-10-14" }]);
      const done = await run(e, "pm", "get_calendar", { selection: {}, period, dateKind: "RECORDED", milestones: ["pe"] });
      expect(ok(done.out).items).toMatchObject([{ milestone: "CONSEGNA_PE", data: "2026-10-08", pratica: { codiceSito: "TN-MI-0001" } }]);
      const none = await run(e, "pm", "get_calendar", { selection: { templateId: "ILIAD" }, period, dateKind: "FORECAST", milestones: ["INESISTENTE"] });
      expect(ok(none.out).note).toMatch(/id validi .*PROTOCOLLO/);
    });

    it("robustezza: ricerca nelle note senza cliente; avviso sulle altre iterazioni", async () => {
      const r = await run(e, "pm.leader", "search_visible_notes", { selection: {}, text: "documento del committente" });
      expect(ok(r.out).items).toMatchObject([{ pratica: { codiceSito: "IL-TO-0001" } }]);
      expect(ok((await run(e, "ut", "search_visible_notes", { selection: {}, text: "documento del committente" })).out).total).toBe(0);
      const inwit = await run(s0, "pm", "get_practice", { practiceId: eIds.practice("INWIT-1").toHexString(), topics: ["notes"] });
      expect(ok(inwit.out).note).toMatch(/Niente .*iterazione 2\. La pratica ha anche le iterazioni 1: .*iteration/);
    });

    it("E04–E06: pratiche per tecnico e carichi", async () => {
      expect(sites((await run(e, "ut", "get_practices", { selection: { assignee: "me" } })).out)).toEqual(["IL-TO-0001"]);
      const pe = eIds.user("pe").toHexString();
      expect(sites((await run(e, "pm", "get_practices", { selection: { assignee: pe, scope: "all" }, activeOnly: true })).out)).toEqual(["IL-TO-0001", "TN-MI-0001"]);
      const w = await run(e, "ut.leader", "get_workload", { templateId: "TOWERNET", group: "UT_PE" });
      const rows = ok(w.out).items as { nome: string; ruolo: string; praticheAttive: number }[];
      expect(rows.find((r) => r.nome === "Demo PE" && r.ruolo === "PE")?.praticheAttive).toBe(1);
      expect(rows.filter((r) => r.nome !== "Demo PE").every((r) => r.praticheAttive === 0)).toBe(true);
    });

    it("E07–E09, P01, P02: note per gruppo visibile, mai i canarini", async () => {
      const id = eIds.practice("ILIAD-1").toHexString();
      const notes = async (k: string) => {
        const r = await run(e, k, "get_practice", { practiceId: id, topics: ["notes"] });
        return { r, groups: (ok(r.out).items as { gruppo?: string }[]).map((i) => i.gruppo).filter(Boolean) };
      };
      const leader = await notes("pm.leader");
      expect(leader.groups).toEqual(["PM_PERMESSI", "UT_PE", "AIE", "DL"]);
      const pm = await notes("pm");
      expect(pm.groups).toEqual(["PM_PERMESSI"]);
      const ut = await notes("ut");
      expect(ut.groups).toEqual(["UT_PE"]);
      for (const x of [pm, ut]) for (const c of CANARIES) expect(x.r.json).not.toContain(c);
      expect(ut.r.json).not.toContain(E_NOTES.PM_PERMESSI);
      expect(pm.r.json).not.toContain(E_NOTES.UT_PE);
    });

    it("E10, E11, P13: ricerca letterale solo nelle note visibili, niente conteggio di quelle nascoste", async () => {
      const ut = await run(e, "ut", "search_visible_notes", { selection: { templateId: "ILIAD" }, text: "documento del committente" });
      expect(ok(ut.out)).toMatchObject({ total: 0, items: [] });
      expect(ut.json).not.toContain("committente dal 07/10");
      const canary = await run(e, "ut", "search_visible_notes", { selection: { templateId: "ILIAD" }, text: "CANARY_AIE" });
      expect(ok(canary.out).total).toBe(0);
      const leader = await run(e, "pm.leader", "search_visible_notes", { selection: { templateId: "ILIAD" }, text: "documento del committente" });
      expect(ok(leader.out).items).toMatchObject([{ dove: "Note Operative PM_PERMESSI", pratica: { codiceSito: "IL-TO-0001" } }]);
    });

    it("E12, P08: storico delle note filtrato prima del conteggio, voce legacy = PM_PERMESSI", async () => {
      const id = eIds.practice("ILIAD-1").toHexString();
      const day = { from: "2026-10-07", to: "2026-10-07" };
      const ut = await run(e, "ut", "get_history", { practiceId: id, period: day, view: "fields" });
      expect(ok(ut.out).total).toBe(1);
      expect(ok(ut.out).items).toMatchObject([{ campo: "Note Operative UT_PE", dopo: { text: E_NOTES.UT_PE } }]);
      for (const c of [...CANARIES, E_NOTES.PM_PERMESSI]) expect(ut.json).not.toContain(c);
      const pm = await run(e, "pm", "get_history", { practiceId: id, period: day, view: "fields" });
      expect(ok(pm.out).total).toBe(2);
      expect(pm.json).toContain(E_LEGACY_NOTE);
      expect(pm.json).not.toContain(E_NOTES.UT_PE);
    });

    it("E13–E15: alert aperti e scaduti, scadenze della settimana, ritardi PE TIM", async () => {
      const s = await run(e, "pm.leader", "get_stats", { period });
      expect([fact(s.ctx, "stats.alertsOpen"), fact(s.ctx, "stats.alertsOverdue")]).toEqual([3, 1]);
      const d = await run(e, "pm", "get_calendar", { selection: {}, period: { from: "2026-10-12", to: "2026-10-18" }, dateKind: "DEADLINE" });
      expect((ok(d.out).items as { tipo: string; alert: string }[]).map((i) => [i.tipo, i.alert]).sort()).toEqual([["ALERT", "FORECAST_PE"], ["ALERT", "FORECAST_UT"]]);
      expect(fact(d.ctx, "calendar.practices")).toBe(1);
      const tim = await run(e, "dl", "get_issues", { selection: { templateId: "TIM_FIBERCOP", scope: "all" }, kinds: ["OVERDUE_FORECAST"] });
      expect((ok(tim.out).items as { milestone: string; data: string }[]).map((i) => [i.milestone, i.data])).toEqual([["ARPA", "2026-09-20"], ["PE", "2026-10-08"]]);
    });

    it("E16: scope assigned predefinito per il PE; con all esplicito anche TOWERNET concluso", async () => {
      const args = (scope?: "all") => ({ selection: scope ? { scope } : {}, period: { from: "2026-10-12", to: "2026-10-18" }, dateKind: "FORECAST", milestones: ["PE"], pendingOnly: false });
      expect((ok((await run(e, "pe", "get_calendar", args())).out).items as { pratica: { codiceSito: string } }[]).map((i) => i.pratica.codiceSito)).toEqual(["IL-TO-0001"]);
      const all = ok((await run(e, "pe", "get_calendar", args("all"))).out).items as { pratica: { codiceSito: string }; conclusa: boolean }[];
      expect(all.map((i) => [i.pratica.codiceSito, i.conclusa])).toEqual([["TN-MI-0001", true], ["IL-TO-0001", false]]);
    });

    it("canarini: nessuno strumento li restituisce a UT o PM non leader; nessuna scrittura operativa", async () => {
      const before = await fingerprint(e);
      const id = eIds.practice("ILIAD-1").toHexString();
      const calls: [string, unknown][] = [
        ["get_practices", { selection: { templateId: "ILIAD", scope: "all" } }],
        ["get_practice", { practiceId: id, topics: ["identity", "milestones", "notes", "assignments", "constraints"] }],
        ["get_calendar", { selection: { scope: "all" }, period: { from: "2026-09-01", to: "2026-10-31" }, dateKind: "FORECAST", pendingOnly: false }],
        ["get_issues", { selection: { scope: "all" }, kinds: ["OPEN_ALERT", "OVERDUE_ALERT", "OVERDUE_FORECAST", "KO", "STAND_BY"] }],
        ["get_history", { practiceId: id, allIterations: true }],
        ["search_visible_notes", { selection: { templateId: "ILIAD", scope: "all" }, text: "CANARY", targets: ["OPERATIVE", "FIELD_NOTES"] }],
        ["find_people", { templateId: "ILIAD", role: "UT" }],
      ];
      // UT e PE non vedono le note di PM/Permessi (compresa la voce legacy); PM non leader e Permessi sì.
      const hidden: Record<string, string[]> = {
        ut: [...CANARIES, E_NOTES.PM_PERMESSI],
        pe: [...CANARIES, E_NOTES.PM_PERMESSI],
        pm: [E_NOTES.AIE, E_NOTES.DL, E_NOTES.UT_PE],
        permessi: [E_NOTES.AIE, E_NOTES.DL, E_NOTES.UT_PE],
      };
      for (const [k, banned] of Object.entries(hidden)) {
        for (const [tool, args] of calls) {
          const r = await run(e, k, tool, args);
          for (const c of banned) expect(r.json, `${k} ${tool}`).not.toContain(c);
        }
      }
      expect(await fingerprint(e)).toBe(before);
    });
  });
});
