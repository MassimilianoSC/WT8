// @vitest-environment node
/**
 * get_andamento (D-198) con il provider finto: compare solo ad ADMIN e Direzione a interruttore acceso; risultato
 * ridotto (ferme al massimo 20), mai persone; fonte ANDAMENTO con i filtri; una domanda completa che cita la fonte.
 *   MONGO_RS_TEST_URL="mongodb://127.0.0.1:27021/?directConnection=true" yarn vitest run tests/server/assistant-andamento.test.ts
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoClient, ObjectId, type Db } from "mongodb";
import type { AssistantEvent, UserDTO } from "@/lib/contract";
import { store } from "@/lib/store/db";
import { resetAndamentoCache } from "@/services/andamento/dataset";
import { resetCircuit } from "@/services/assistant/circuit";
import { assistantConfig } from "@/services/assistant/config";
import { resetConversations } from "@/services/assistant/conversation";
import { prepareQuestion } from "@/services/assistant/orchestrator";
import { PROMPT_VERSION } from "@/services/assistant/prompt";
import { FakeProvider, type FakeScript, type ProviderChunk } from "@/services/assistant/provider";
import { resetGate } from "@/services/assistant/quota";
import { ndjsonStream } from "@/services/assistant/stream";
import { FactRegistry, SourceRegistry, type ToolContext } from "@/services/assistant/tools/common";
import { runTool, toolDeclarations } from "@/services/assistant/tools";
import { toUserDTO } from "@/services/users-v2";
import { assertDisposableTarget } from "../../scripts/db/guard";
import { generateSynthetic } from "../../scripts/db/andamento-sintetico-core";
import { E_NOW, eIds, seedS0 } from "../fixtures/assistant-e";

const URL_RS = process.env.MONGO_RS_TEST_URL;
const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;
const cfg = { ...assistantConfig(env({ PH_AI_ENABLED: "true", PH_AI_PROVIDER: "fake" })), timeoutMs: 20_000 };
const text = (t: string): ProviderChunk[] => [{ type: "text", text: t }, { type: "finish", reason: "STOP" }];

describe.skipIf(!URL_RS)("assistente: get_andamento", () => {
  let client: MongoClient;
  let db: Db;
  const DB = `practicehub_test_ai_andamento_${Date.now()}`;
  const dto = async (id: ObjectId) => toUserDTO((await store.users(db).findOne({ _id: id }))!);
  const pmDir = new ObjectId();
  const ctx = async (id: ObjectId): Promise<ToolContext> => ({ db, user: await dto(id), now: E_NOW, todayRome: "2026-10-09", question: "x", signal: new AbortController().signal, sources: new SourceRegistry(), facts: new FactRegistry() });
  const names = async () => (await store.users(db).find({}, { projection: { name: 1, email: 1 } }).toArray()).flatMap((u) => [u.name, u.email]);

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    client = await new MongoClient(URL_RS!).connect();
    db = client.db(DB);
    await seedS0(db);
    await generateSynthetic(db, { practices: 120, years: 2, seed: 7, now: E_NOW });
    await store.users(db).insertOne({ _id: pmDir, email: "pm.dir@test.local", name: "Capo Direzione Prova", passwordHash: null, status: "active", isAdmin: false, memberships: [{ templateId: "INWIT", group: "PM_PERMESSI", role: "PM", leader: false }], authVersion: 1, createdAt: E_NOW, updatedAt: E_NOW, direzione: true });
    await store.assistantSettings(db).insertOne({ _id: "global", enabled: true, dailyLimit: 100, perMinuteLimit: 10, revision: 1, updatedAt: E_NOW, updatedBy: null, updatedByName: null });
  }, 240_000);
  beforeEach(() => {
    resetGate();
    resetCircuit();
    resetConversations();
    resetAndamentoCache();
  });
  afterEach(() => {
    delete process.env.PH_ANDAMENTO;
  });
  afterAll(async () => {
    delete process.env.PH_ANDAMENTO;
    await client?.db(DB).dropDatabase();
    await client?.close();
  });

  it("compare solo ad ADMIN e Direzione a interruttore acceso; chiamato da altri → FORBIDDEN", async () => {
    const has = async (id: ObjectId) => toolDeclarations(await ctx(id)).some((t) => t.name === "get_andamento");
    expect(await has(eIds.user("admin"))).toBe(false); // spento
    process.env.PH_ANDAMENTO = "true";
    expect(await has(eIds.user("admin"))).toBe(true);
    expect(await has(pmDir)).toBe(true);
    expect(await has(eIds.user("pm"))).toBe(false);
    expect(await runTool(await ctx(eIds.user("ut")), "get_andamento", { blocco: "stati" })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    delete process.env.PH_ANDAMENTO;
    expect(await runTool(await ctx(eIds.user("admin")), "get_andamento", { blocco: "stati" })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("risultato ridotto per ogni blocco, fonte ANDAMENTO con i filtri, nessuna persona; ferme al massimo 20", async () => {
    process.env.PH_ANDAMENTO = "true";
    const people = await names();
    for (const blocco of ["stati", "ferme", "flussi", "rilavorazioni", "scadenze", "gruppi"]) {
      const c = await ctx(eIds.user("admin"));
      const out = await runTool(c, "get_andamento", { blocco, templateId: "ILIAD", period: { from: "2025-10-10", to: "2026-10-09" }, granularity: "month" });
      expect(out.ok, blocco).toBe(true);
      const json = JSON.stringify(out);
      for (const p of people) expect(json, `${blocco}: ${p}`).not.toContain(p);
      expect(json).not.toMatch(/practiceId|userId|actor/);
      expect(c.sources.list).toEqual([
        expect.objectContaining({ kind: "ANDAMENTO", blocco, query: expect.objectContaining({ templateId: "ILIAD", ...(blocco === "ferme" ? {} : { from: "2025-10-10", to: "2026-10-09", granularity: "month" }) }) }),
      ]);
      if (blocco === "ferme" && out.ok) expect(out.result.items.length).toBeLessThanOrEqual(20);
      if (blocco === "stati" && out.ok) expect(out.result.selection).toHaveProperty("piuLenti");
    }
    // Filtri non validi del modello: errore tipizzato, non un'eccezione.
    expect(await runTool(await ctx(eIds.user("admin")), "get_andamento", { blocco: "stati", period: { from: "2026-10-09", to: "2025-01-01" } })).toMatchObject({ ok: false, error: { code: "INVALID" } });
  });

  it("istruzioni: il paragrafo su get_andamento solo se lo strumento è disponibile; spento identiche alla versione .2 (D-192)", async () => {
    const systemOf = async (id: ObjectId) => {
      const provider = new FakeProvider(() => text("[[ANSWER]]ok"));
      const prepared = await prepareQuestion({ deps: { client, db }, user: await dto(id), request: { requestId: randomUUID(), text: "ciao" }, now: E_NOW, cfg, provider });
      const reader = ndjsonStream(prepared).getReader();
      while (!(await reader.read()).done);
      resetGate();
      return provider.calls[0].system;
    };
    const RULES = "Per l'andamento (get_andamento)";
    // Spento: nemmeno l'ADMIN; il testo prosegue come nella .2 («…operatori.» seguito da «Per ogni fatto…»).
    const off = await systemOf(eIds.user("admin"));
    expect(off).not.toContain("get_andamento");
    expect(off).toContain("Non fare classifiche top/flop degli operatori.\n\nPer ogni fatto sulle pratiche");
    process.env.PH_ANDAMENTO = "true";
    expect(await systemOf(eIds.user("admin"))).toContain(`Non fare classifiche top/flop degli operatori.\n\n${RULES}`);
    expect(await systemOf(pmDir)).toContain(RULES);
    expect(await systemOf(eIds.user("ut"))).not.toContain("get_andamento");
  });

  it("domanda completa: «dove si fermano le pratiche ILIAD?» → get_andamento stati, risposta con la fonte ANDAMENTO; istruzioni con le regole", async () => {
    process.env.PH_ANDAMENTO = "true";
    const script: FakeScript = (_r, turn) =>
      turn === 1
        ? [{ type: "toolCalls", calls: [{ id: "a", name: "get_andamento", args: { blocco: "stati", templateId: "ILIAD" } }] }, { type: "finish", reason: "STOP" }]
        : text("[[ANSWER]]Le pratiche ILIAD restano più a lungo nello stato indicato come più lento [1].");
    const provider = new FakeProvider(script);
    const prepared = await prepareQuestion({ deps: { client, db }, user: await dto(eIds.user("admin")), request: { requestId: randomUUID(), text: "Dove si fermano le pratiche ILIAD?" }, now: E_NOW, cfg, provider });
    const reader = ndjsonStream(prepared).getReader();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += new TextDecoder().decode(value);
    }
    const events = buf.trim().split("\n").map((l) => JSON.parse(l) as AssistantEvent);
    expect(events[events.length - 1]).toMatchObject({ type: "done", answerState: "ANSWER" });
    expect(events.find((e) => e.type === "source")).toMatchObject({ source: { kind: "ANDAMENTO", blocco: "stati", query: { templateId: "ILIAD" } } });
    expect(provider.calls[0].system).toContain("Per l'andamento (get_andamento)");
    expect(PROMPT_VERSION).toBe("ph-assistente-2026-10-11.3");
    const payload = JSON.stringify(provider.calls);
    for (const p of await names()) expect(payload).not.toContain(p);
  });
});
