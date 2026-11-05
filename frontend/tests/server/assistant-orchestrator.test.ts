// @vitest-environment node
/**
 * Orchestratore e stream NDJSON dell'assistente con il provider finto (D-172) sulla fixture E.
 *   MONGO_RS_TEST_URL="mongodb://127.0.0.1:27021/?directConnection=true" yarn vitest run tests/server/assistant-orchestrator.test.ts
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoClient, type Db } from "mongodb";
import type { UserDTO } from "@/lib/contract";
import { HttpError } from "@/lib/http-error";
import { store } from "@/lib/store/db";
import { resetCircuit } from "@/services/assistant/circuit";
import { assistantConfig } from "@/services/assistant/config";
import { resetConversations } from "@/services/assistant/conversation";
import { prepareQuestion } from "@/services/assistant/orchestrator";
import { defaultFakeScript, FakeProvider, ProviderError, type FakeScript, type ProviderChunk } from "@/services/assistant/provider";
import { resetGate } from "@/services/assistant/quota";
import { ndjsonStream } from "@/services/assistant/stream";
import type { AssistantEvent, AssistantMessageRequest } from "@/lib/contract";
import { toUserDTO } from "@/services/users-v2";
import { assertDisposableTarget } from "../../scripts/db/guard";
import { applyFixtureE, E_LEGACY_NOTE, E_NOTES, E_NOW, eIds, seedS0 } from "../fixtures/assistant-e";

// Registro rallentabile: riproduce una scrittura lenta dopo l'evento terminale (sotto carico).
const logState = { delayMs: 0 };
vi.mock("@/services/assistant/log", async (orig) => {
  const real = await orig<typeof import("@/services/assistant/log")>();
  return {
    ...real,
    writeAssistantLog: async (...args: Parameters<typeof real.writeAssistantLog>) => {
      if (logState.delayMs) await new Promise((r) => setTimeout(r, logState.delayMs));
      return real.writeAssistantLog(...args);
    },
  };
});

const URL_RS = process.env.MONGO_RS_TEST_URL;
const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;
const cfg = { ...assistantConfig(env({ PH_AI_ENABLED: "true", PH_AI_PROVIDER: "fake" })), timeoutMs: 20_000 };
const text = (t: string): ProviderChunk[] => [...t.match(/.{1,7}/gs)!.map((x) => ({ type: "text" as const, text: x })), { type: "finish", reason: "STOP" }];
const tool = (name: string, args: unknown, id = "t1"): ProviderChunk[] => [{ type: "toolCalls", calls: [{ id, name, args }] }, { type: "finish", reason: "STOP" }];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!URL_RS)("orchestratore dell'assistente (provider finto)", () => {
  let client: MongoClient;
  let db: Db;
  const DB = `practicehub_test_ai_orch_${Date.now()}`;

  async function user(key: string): Promise<UserDTO> {
    return toUserDTO((await store.users(db).findOne({ _id: eIds.user(key) }))!);
  }
  const req = (t: string, extra: Partial<AssistantMessageRequest> = {}): AssistantMessageRequest => ({ requestId: randomUUID(), text: t, ...extra });

  async function ask(key: string, request: AssistantMessageRequest, script: FakeScript, opts: { cancelAfter?: number; heartbeatMs?: number; timeoutMs?: number } = {}) {
    const provider = new FakeProvider(script);
    const prepared = await prepareQuestion({ deps: { client, db }, user: await user(key), request, now: E_NOW, cfg: { ...cfg, timeoutMs: opts.timeoutMs ?? cfg.timeoutMs }, provider });
    const reader = ndjsonStream(prepared, undefined, opts.heartbeatMs).getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const events: AssistantEvent[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        events.push(JSON.parse(buf.slice(0, i)));
        buf = buf.slice(i + 1);
      }
      if (opts.cancelAfter && events.length >= opts.cancelAfter) {
        await reader.cancel();
        break;
      }
    }
    const answer = events.filter((e) => e.type === "delta").map((e) => (e as { text: string }).text).join("");
    return { events, provider, prepared, answer, last: events[events.length - 1], payload: JSON.stringify(provider.calls) };
  }
  const code = async (p: Promise<unknown>) => {
    try {
      await p;
      return "OK";
    } catch (e) {
      return e instanceof HttpError ? `${e.status} ${e.extra?.code}` : String(e);
    }
  };
  const waitLog = async (requestId: string) => {
    for (let i = 0; i < 50; i++) {
      const l = await store.assistantLog(db).findOne({ requestId });
      if (l) return l;
      await sleep(20);
    }
    throw new Error("registro assente");
  };

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    client = await new MongoClient(URL_RS!).connect();
    db = client.db(DB);
    await seedS0(db);
    await applyFixtureE(db, { alerts: true, history: true, legacyHistory: true });
    // Orologio fisso: limiti larghi, così le domande ripetute delle prove non urtano il limite al minuto.
    await store.assistantSettings(db).insertOne({ _id: "global", enabled: true, dailyLimit: 100, perMinuteLimit: 10, revision: 1, updatedAt: E_NOW, updatedBy: null, updatedByName: null });
  }, 240_000);
  afterAll(async () => {
    await client?.db(DB).dropDatabase();
    await client?.close();
  });
  beforeEach(async () => {
    resetGate();
    resetCircuit();
    resetConversations();
    await store.assistantUsage(db).deleteMany({});
  });

  it("percorso normale: start, lettura, fonte prima del testo che la cita, done con l'uso; registro senza testo", async () => {
    const r = await ask("pm", req("Quante pratiche vedo?"), defaultFakeScript);
    expect(r.events.map((e) => e.seq)).toEqual(r.events.map((_, i) => i + 1));
    expect(r.events[0]).toMatchObject({ type: "start", todayRome: "2026-10-09", timezone: "Europe/Rome" });
    const types = r.events.map((e) => e.type);
    expect(types.filter((t) => t === "done" || t === "error")).toEqual(["done"]);
    expect(types[types.length - 1]).toBe("done");
    expect(types.indexOf("source")).toBeLessThan(types.indexOf("delta"));
    expect(r.last).toMatchObject({ type: "done", answerState: "ANSWER", finishReason: "STOP", usage: { usedToday: 1 } });
    expect(r.answer).toMatch(/^Vedi 7 pratiche con i filtri attuali \[2\]\./);
    const src2 = r.events.findIndex((e) => e.type === "source" && (e as { index: number }).index === 2);
    expect(r.events[src2]).toMatchObject({ source: { kind: "PRACTICE", codiceSito: expect.any(String) } });
    expect(src2).toBeLessThan(r.events.findIndex((e) => e.type === "delta" && (e as { text: string }).text.includes("[2]")));
    expect(r.events.find((e) => e.type === "facts")).toMatchObject({ items: [{ key: "practices.total", value: 7, sourceIndex: 1 }] });
    const log = await waitLog(r.prepared.request.requestId);
    expect(log).toMatchObject({ outcome: "DONE", answerState: "ANSWER", provider: "fake", tools: [{ name: "get_practices", ok: true }] });
    expect(JSON.stringify(log)).not.toMatch(/Quante pratiche|IL-TO-0001|Torino/);
  });

  it("citazioni: [n] inventata tolta (PARTIAL), citazione spezzata tra due frammenti ricomposta", async () => {
    const script: FakeScript = (_req, turn) =>
      turn === 1
        ? tool("get_practices", { selection: {} })
        : [{ type: "text", text: "[[ANSWER]]Pratica [1] e " }, { type: "text", text: "altro [9" }, { type: "text", text: "9]. Elenco [" }, { type: "text", text: "2]." }, { type: "finish", reason: "STOP" }];
    const r = await ask("ut", req("Le mie pratiche?"), script);
    expect(r.answer).toBe("Pratica [1] e altro . Elenco [2].");
    expect(r.events.filter((e) => e.type === "source").map((e) => (e as { index: number }).index)).toEqual([1, 2]);
    expect(r.last).toMatchObject({ type: "done", answerState: "PARTIAL" });
  });

  it("citazioni a lista o intervallo: valide se esistono tutte (riscritte [2][3]), altrimenti tolte e PARTIAL", async () => {
    const answer = (chunks: string[]): FakeScript => (_r, turn) =>
      turn === 1 ? tool("get_practices", { selection: { scope: "all" } }) : [...chunks.map((t) => ({ type: "text" as const, text: t })), { type: "finish", reason: "STOP" }];
    const ok = await ask("pm", req("Le pratiche?"), answer(["[[ANSWER]]Due [2,3], tre [2-4", "], una [5]."]));
    expect(ok.answer).toBe("Due [2][3], tre [2][3][4], una [5].");
    expect(ok.last).toMatchObject({ type: "done", answerState: "ANSWER" });
    // [1] è la fonte del totale (fatti), emessa comunque.
    expect(ok.events.filter((e) => e.type === "source").map((e) => (e as { index: number }).index).sort()).toEqual([1, 2, 3, 4, 5]);
    // Il caso visto con il modello vero: "[10-20]" con 9 fonti. Anche una lista con una sola fonte inesistente.
    const bad = await ask("pm", req("Le pratiche?"), answer(["[[ANSWER]]Vedi [10-20] e [2, 99] e [3]."]));
    expect(bad.answer).toBe("Vedi  e  e [3].");
    expect(bad.last).toMatchObject({ type: "done", answerState: "PARTIAL" });
    expect(bad.events.filter((e) => e.type === "source").map((e) => (e as { index: number }).index).sort()).toEqual([1, 3]);
    expect((await waitLog(bad.prepared.request.requestId)).limitsHit).toContain("INVALID_CITATION");
    // Intervallo rovesciato o lunghissimo: non è una citazione valida.
    const odd = await ask("pm", req("Le pratiche?"), answer(["[[ANSWER]]A [4-2] B [1-30]."]));
    expect(odd.answer).toBe("A  B .");
  });

  it("date ISO del modello mostrate come gg/mm/aaaa, anche spezzate fra frammenti; il resto invariato", async () => {
    const r = await ask("pm", req("Scadenze?"), () => text("[[ANSWER]]Scade il 2026-09-28, aggiornato 2026-10-09T08:00:00.000Z; codice 2026-13-40 e IL-TO-0001 restano; 7 pratiche."));
    expect(r.answer).toBe("Scade il 28/09/2026, aggiornato 09/10/2026; codice 2026-13-40 e IL-TO-0001 restano; 7 pratiche.");
    const split: FakeScript = () => [
      { type: "text", text: "[[ANSWER]]Dal 2026-" },
      { type: "text", text: "09-2" },
      { type: "text", text: "8 al 2026-10-1" },
      { type: "text", text: "5." },
      { type: "finish", reason: "STOP" },
    ];
    expect((await ask("pm", req("Periodo?"), split)).answer).toBe("Dal 28/09/2026 al 15/10/2026.");
    // In fondo alla risposta (trattenuta fino alla fine).
    expect((await ask("pm", req("Quando?"), () => text("[[ANSWER]]Il 2026-10-12"))).answer).toBe("Il 12/10/2026");
  });

  it("link Markdown verso indirizzi esterni tolti (testo conservato, anche spezzati); link interni e citazioni restano", async () => {
    const script: FakeScript = (_req, turn) =>
      turn === 1
        ? tool("get_practices", { selection: {} })
        : [
            { type: "text", text: "[[ANSWER]]Vedi [Roma " },
            { type: "text", text: "Ostiense](https://esterno.example/x?d=1) e ![logo](http" },
            { type: "text", text: "://x.example/y.png) e [scheda](/pratiche/abc) [2" },
            { type: "text", text: "]." },
            { type: "finish", reason: "STOP" },
          ];
    const r = await ask("pm", req("x"), script);
    expect(r.answer).toBe("Vedi Roma Ostiense e logo e [scheda](/pratiche/abc) [2].");
    expect(JSON.stringify(r.events)).not.toMatch(/esterno\.example|x\.example/);
    expect((await waitLog(r.prepared.request.requestId)).limitsHit).toContain("LINK_REMOVED");
  });

  it("provider finto secondo il contesto: scheda → la pratica, statistiche → KPI, elenco → pratiche", async () => {
    const id = eIds.practice("ILIAD-1").toHexString();
    const sheet = await ask("pm", req("Riassumi", { context: { page: "sheet", practiceId: id } }), defaultFakeScript);
    expect(sheet.provider.calls[0].messages).toBeDefined();
    expect(sheet.answer).toMatch(/La pratica IL-TO-0001 \(Torino Lingotto\) è in stato ASSEGNATO, iterazione 1 \[\d+\]/);
    const stats = await ask("pm", req("KPI", { context: { page: "stats" } }), defaultFakeScript);
    expect(stats.answer).toMatch(/Pratiche attive ora: 7; alert aperti: 3 \[\d+\]/);
    const list = await ask("pm", req("Elenco", { context: { page: "list", listQuery: { templateId: "ILIAD" } } }), defaultFakeScript);
    expect(list.answer).toMatch(/^Vedi 7 pratiche/);
  });

  it("marcatori d'esito: CLARIFY e OUT_OF_SCOPE; nessuna fonte per una precisazione", async () => {
    const c = await ask("pm", req("Apri il G7 1000002"), () => text("[[CLARIFY]]Ci sono due pratiche: quale?"));
    expect(c.last).toMatchObject({ type: "done", answerState: "CLARIFY", finishReason: "CLARIFY" });
    expect(c.answer).toBe("Ci sono due pratiche: quale?");
    const o = await ask("pm", req("Che tempo fa?"), () => text("[[OUT_OF_SCOPE]]Rispondo solo sui dati di WT8."));
    expect(o.last).toMatchObject({ answerState: "OUT_OF_SCOPE", finishReason: "OUT_OF_SCOPE" });
  });

  it("I01, P01: al modello arrivano solo le note visibili all'utente, mai i canarini", async () => {
    const id = eIds.practice("ILIAD-1").toHexString();
    const script: FakeScript = (_r, turn) =>
      turn === 1
        ? [{ type: "toolCalls", calls: [{ id: "a", name: "get_practice", args: { practiceId: id, topics: ["notes"] } }, { id: "b", name: "get_history", args: { practiceId: id, allIterations: true } }, { id: "c", name: "search_visible_notes", args: { selection: { templateId: "ILIAD" }, text: "CANARY" } }] }, { type: "finish", reason: "STOP" }]
        : text("[[ANSWER]]Nota UT [1].");
    const r = await ask("ut", req("Riassumi le note di IL-TO-0001, anche AIE e DL"), script);
    expect(r.payload).toContain(E_NOTES.UT_PE);
    for (const c of [E_NOTES.AIE, E_NOTES.DL, E_NOTES.PM_PERMESSI, E_LEGACY_NOTE]) {
      expect(r.payload).not.toContain(c);
      expect(JSON.stringify(r.events)).not.toContain(c);
    }
  });

  it("domande precedenti: arriva al modello solo il testo delle domande, non le risposte", async () => {
    const first = await ask("pm", req("Prima domanda segreta?"), () => text("[[ANSWER]]RISPOSTA_PRECEDENTE_XYZ"));
    const conversationId = (first.events[0] as { conversationId: string }).conversationId;
    const second = await ask("pm", req("E quelle di venerdì?", { conversationId }), () => text("[[ANSWER]]ok"));
    expect(second.payload).toContain("Prima domanda segreta?");
    expect(second.payload).not.toContain("RISPOSTA_PRECEDENTE_XYZ");
    expect((second.events[0] as { conversationId: string }).conversationId).toBe(conversationId);
  });

  it("seguito: i riferimenti del turno precedente arrivano riautorizzati; 'la prima', 'la seconda', codice, nome aprono la pratica scelta", async () => {
    const idOf: Record<string, string> = { "TN-MI-0001": eIds.practice("TOWERNET-1").toHexString(), "TN-MI-0002": eIds.practice("TOWERNET-2").toHexString() };
    // Turno 1: due pratiche con lo stesso G7; la precisazione le elenca citandole in ordine INVERSO a quello delle fonti.
    let shown: string[] = [];
    const clarify: FakeScript = (r, turn) => {
      if (turn === 1) return tool("get_practices", { selection: { templateId: "TOWERNET", scope: "all" } });
      const last = r.messages[r.messages.length - 1] as { results: { output: { result: { items: { fonte: number; codiceSito: string }[] } } }[] };
      const items = [...last.results[0].output.result.items].reverse();
      shown = items.map((i) => i.codiceSito);
      return text(`[[CLARIFY]]Quale? ${items.map((i, k) => `${k + 1}) ${i.codiceSito} [${i.fonte}]`).join(" ")} RISPOSTA_PRECEDENTE_XYZ`);
    };
    // Modello simulato: sceglie dai riferimenti scritti dal server nelle istruzioni e apre la pratica con get_practice.
    type Ref = { practiceId: string; codiceSito: string; nomeSito: string };
    const refsOf = (system: string) => [...system.matchAll(/^(\d+)\) (\{.*\})$/gm)].map((m) => JSON.parse(m[2]) as Ref);
    const choose =
      (pick: (refs: Ref[]) => string | undefined): FakeScript =>
      (r, turn) => {
        if (turn === 1) {
          const id = pick(refsOf(r.system));
          return id ? tool("get_practice", { practiceId: id, topics: ["identity"] }) : text("[[CLARIFY]]Quale pratica?");
        }
        return text("[[ANSWER]]Ecco la pratica [1].");
      };
    const followUps: [string, (refs: Ref[]) => string | undefined, () => string][] = [
      ["la prima", (refs) => refs[0]?.practiceId, () => idOf[shown[0]]],
      ["la seconda", (refs) => refs[1]?.practiceId, () => idOf[shown[1]]],
      ["TN-MI-0001", (refs) => refs.find((x) => x.codiceSito === "TN-MI-0001")?.practiceId, () => idOf["TN-MI-0001"]],
      ["quella di Milano Lambrate", (refs) => refs.find((x) => x.nomeSito === "Milano Lambrate")?.practiceId, () => idOf["TN-MI-0002"]],
    ];
    for (const [question, pick, expected] of followUps) {
      const first = await ask("multi", req("Apri la pratica con G7 1000002"), clarify);
      expect(first.last).toMatchObject({ type: "done", answerState: "CLARIFY" });
      expect(shown).toHaveLength(2);
      const conversationId = (first.events[0] as { conversationId: string }).conversationId;
      const second = await ask("multi", req(question, { conversationId }), choose(pick));
      const system = second.provider.calls[0].system;
      expect(refsOf(system).map((x) => x.codiceSito), question).toEqual(shown);
      expect(system).toContain('Selezione precedente: {"templateId":"TOWERNET","scope":"all","archived":false}');
      expect(second.last).toMatchObject({ type: "done", answerState: "ANSWER" });
      expect(second.events.find((e) => e.type === "source"), question).toMatchObject({ source: { kind: "PRACTICE", practiceId: expected() } });
      expect(second.payload).not.toContain("RISPOSTA_PRECEDENTE_XYZ");
    }
  });

  it("seguito: un riferimento non più visibile sparisce senza traccia; turno con errore o senza pratiche → nessun riferimento", async () => {
    const ilId = eIds.practice("ILIAD-1").toHexString();
    const both: FakeScript = (_r, turn) =>
      turn === 1
        ? [{ type: "toolCalls", calls: [{ id: "a", name: "get_practice", args: { practiceId: ilId, topics: ["identity"] } }, { id: "b", name: "get_practices", args: { selection: { templateId: "TOWERNET", scope: "all" } } }] }, { type: "finish", reason: "STOP" }]
        : text("[[ANSWER]]Una [1], poi [3].");
    const first = await ask("multi", req("ILIAD e TOWERNET?"), both);
    const conversationId = (first.events[0] as { conversationId: string }).conversationId;
    const before = (await store.users(db).findOne({ _id: eIds.user("multi") }))!;
    try {
      // Fra un turno e l'altro "multi" perde TOWERNET: la pratica e la selezione su TOWERNET non devono comparire.
      await store.users(db).updateOne({ _id: before._id }, { $set: { memberships: before.memberships.filter((m) => m.templateId !== "TOWERNET") }, $inc: { authVersion: 1 } });
      const second = await ask("multi", req("la seconda", { conversationId }), () => text("[[CLARIFY]]Quale?"));
      const system = second.provider.calls[0].system;
      expect(system).toMatch(/^1\) \{"practiceId":"[0-9a-f]{24}","codiceSito":"IL-TO-0001"/m);
      expect(system).not.toMatch(/TN-MI|Milano|TOWERNET"|^2\)/m);
      expect(system).not.toContain("Selezione precedente");
      // Il turno 2 non ha letto pratiche: al turno 3 nessun riferimento.
      const third = await ask("multi", req("e allora?", { conversationId }), () => text("[[ANSWER]]ok"));
      expect(third.provider.calls[0].system).not.toContain("Riferimenti del turno precedente");
    } finally {
      await store.users(db).updateOne({ _id: before._id }, { $set: { memberships: before.memberships } });
    }
    // Un turno finito con errore non lascia riferimenti.
    const ok = await ask("pm", req("ILIAD?"), (_r, turn) => (turn === 1 ? tool("get_practice", { practiceId: ilId, topics: ["identity"] }) : text("[[ANSWER]]Ecco [1].")));
    const cid = (ok.events[0] as { conversationId: string }).conversationId;
    const failed = await ask("pm", req("di nuovo", { conversationId: cid }), () => {
      throw new ProviderError("UNAVAILABLE", "giù");
    });
    expect(failed.provider.calls[0].system).toContain("IL-TO-0001");
    expect(failed.last).toMatchObject({ type: "error" });
    const after = await ask("pm", req("la prima", { conversationId: cid }), () => text("[[CLARIFY]]Quale?"));
    expect(after.provider.calls[0].system).not.toContain("Riferimenti del turno precedente");
  });

  it("P10, P09: conversazione di un altro utente 404; pratica di contesto non visibile 404 senza consumare domande", async () => {
    const mine = await ask("pm", req("ciao"), () => text("[[ANSWER]]ciao"));
    const conversationId = (mine.events[0] as { conversationId: string }).conversationId;
    const other = await user("pm.leader");
    expect(await code(prepareQuestion({ deps: { client, db }, user: other, request: req("x", { conversationId }), now: E_NOW, cfg, provider: new FakeProvider() }))).toBe("404 CONVERSATION_NOT_FOUND");
    const multi = await user("multi");
    expect(
      await code(prepareQuestion({ deps: { client, db }, user: multi, request: req("x", { context: { page: "sheet", practiceId: eIds.practice("TIM-1").toHexString() } }), now: E_NOW, cfg, provider: new FakeProvider() }))
    ).toBe("404 NOT_FOUND");
    expect(await store.assistantUsage(db).countDocuments({ userId: eIds.user("multi") })).toBe(0);
    const expiredAt = new Date(E_NOW.getTime() + 16 * 60_000);
    expect(await code(prepareQuestion({ deps: { client, db }, user: await user("pm"), request: req("x", { conversationId }), now: expiredAt, cfg, provider: new FakeProvider() }))).toBe("409 CONVERSATION_EXPIRED");
  });

  it("P11: permessi cambiati durante la domanda → AUTH_CHANGED, nessun altro invio al modello, conversazione cancellata", async () => {
    const script: FakeScript = async (_r, turn) => {
      if (turn === 1) await store.users(db).updateOne({ _id: eIds.user("ut") }, { $inc: { authVersion: 1 } });
      return turn === 1 ? tool("get_practice", { practiceId: eIds.practice("ILIAD-1").toHexString(), topics: ["notes"] }) : text("[[ANSWER]]non deve arrivare");
    };
    const r = await ask("ut", req("Note di ILIAD?"), script);
    expect(r.last).toMatchObject({ type: "error", code: "AUTH_CHANGED" });
    expect(r.provider.calls).toHaveLength(1);
    expect(r.payload).not.toContain(E_NOTES.UT_PE);
    const conversationId = (r.events[0] as { conversationId: string }).conversationId;
    expect(await code(prepareQuestion({ deps: { client, db }, user: await user("ut"), request: req("seguito", { conversationId }), now: E_NOW, cfg, provider: new FakeProvider() }))).toBe("404 CONVERSATION_NOT_FOUND");
  });

  it("P12: utente disattivato mentre scrive la risposta → stop con AUTH_CHANGED entro un secondo", async () => {
    await store.users(db).updateOne({ _id: eIds.user("pe") }, { $set: { status: "active" } });
    const script: FakeScript = () =>
      (async function* () {
        yield { type: "text", text: "[[ANSWER]]Inizio " } as ProviderChunk;
        await store.users(db).updateOne({ _id: eIds.user("pe") }, { $set: { status: "deactivated" } });
        await sleep(1100);
        yield { type: "text", text: "segreto dopo la revoca" } as ProviderChunk;
        yield { type: "text", text: " altro" } as ProviderChunk;
      })();
    const r = await ask("pe", req("Riassumi"), script);
    await store.users(db).updateOne({ _id: eIds.user("pe") }, { $set: { status: "active" } });
    expect(r.last).toMatchObject({ type: "error", code: "AUTH_CHANGED" });
    expect(r.answer).not.toContain("altro");
  });

  it("limiti: al massimo 6 strumenti e 2 giri; la terza chiamata non offre strumenti; senza risposta → QUERY_TOO_BROAD", async () => {
    const many = (turn: number): ProviderChunk[] => [{ type: "toolCalls", calls: Array.from({ length: 4 }, (_, i) => ({ id: `${turn}-${i}`, name: "find_people", args: { templateId: "ILIAD", role: "UT" } })) }, { type: "finish", reason: "STOP" }];
    const r = await ask("pm", req("Persone?"), (_req, turn) => many(turn));
    expect(r.provider.calls.map((c) => c.tools.length > 0)).toEqual([true, true, false]);
    const results = r.provider.calls[2].messages.filter((m) => m.role === "tool").flatMap((m) => (m.role === "tool" ? m.results : []));
    expect(results.filter((x) => (x.output as { error?: { code: string } }).error?.code === "LIMIT")).toHaveLength(2);
    expect(r.last).toMatchObject({ type: "error", code: "QUERY_TOO_BROAD" });
    expect((await waitLog(r.prepared.request.requestId)).limitsHit).toEqual(expect.arrayContaining(["TOOLS", "TOOLS_AFTER_LIMIT"]));
  });

  it("I06: strumento inesistente → risultato d'errore al modello, la risposta continua", async () => {
    const r = await ask("pm", req("x"), (_q, turn) => (turn === 1 ? tool("closeAlert", { id: "x" }) : text("[[INSUFFICIENT_EVIDENCE]]Non posso farlo.")));
    const toolMsg = r.provider.calls[1].messages.find((m) => m.role === "tool");
    expect(JSON.stringify(toolMsg)).toContain("TOOL_UNKNOWN");
    expect(r.last).toMatchObject({ type: "done", answerState: "INSUFFICIENT_EVIDENCE", finishReason: "NO_ANSWER" });
  });

  it("guasti del provider: transitorio ritentato una volta; non transitorio → UNAVAILABLE; 5 guasti aprono il circuito (503 prima dello stream)", async () => {
    let tries = 0;
    const flaky: FakeScript = () => {
      tries++;
      if (tries === 1) throw new ProviderError("UNAVAILABLE", "503", true);
      return text("[[ANSWER]]ok");
    };
    expect((await ask("pm", req("x"), flaky)).last).toMatchObject({ type: "done" });
    const down: FakeScript = () => {
      throw new ProviderError("QUOTA", "429");
    };
    expect((await ask("pm", req("x"), down)).last).toMatchObject({ type: "error", code: "PROVIDER_QUOTA" });
    for (let i = 0; i < 4; i++) await ask("pm", req("x"), down);
    expect(await code(prepareQuestion({ deps: { client, db }, user: await user("pm"), request: req("x"), now: E_NOW, cfg, provider: new FakeProvider() }))).toBe("503 UNAVAILABLE");
  });

  it("tempo massimo: provider muto → TIMEOUT; il posto della persona si libera", async () => {
    const mute: FakeScript = () =>
      (async function* () {
        await sleep(5000);
        yield { type: "text", text: "tardi" } as ProviderChunk;
      })();
    const r = await ask("pm", req("x"), mute, { timeoutMs: 1000 });
    expect(r.last).toMatchObject({ type: "error", code: "TIMEOUT" });
    expect((await ask("pm", req("y"), () => text("[[ANSWER]]ok"))).last).toMatchObject({ type: "done" });
  });

  it("Interrompi: lo stream chiuso dal client ferma la generazione, registro CANCELLED, persona libera", async () => {
    const slow: FakeScript = () =>
      (async function* () {
        for (let i = 0; i < 20; i++) {
          yield { type: "text", text: `[[ANSWER]]parte ${i} ` } as ProviderChunk;
          await sleep(50);
        }
      })();
    const r = await ask("pm", req("lunga"), slow, { cancelAfter: 4 });
    expect(r.events.some((e) => e.type === "done" || e.type === "error")).toBe(false);
    expect((await waitLog(r.prepared.request.requestId)).outcome).toBe("CANCELLED");
    expect((await ask("pm", req("dopo"), () => text("[[ANSWER]]ok"))).last).toMatchObject({ type: "done" });
  });

  it("nessun evento dopo il terminale, anche se il registro finisce tardi (niente heartbeat dopo done o error)", async () => {
    logState.delayMs = 700;
    try {
      const ok = await ask("pm", req("x"), () => text("[[ANSWER]]ok"), { heartbeatMs: 100 });
      expect(ok.last).toMatchObject({ type: "done" });
      const ko = await ask("pm", req("y"), () => {
        throw new ProviderError("UNAVAILABLE", "giù");
      }, { heartbeatMs: 100 });
      expect(ko.last).toMatchObject({ type: "error", code: "UNAVAILABLE" });
    } finally {
      logState.delayMs = 0;
    }
  });

  it("heartbeat durante il silenzio; una sola domanda alla volta per persona", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const waiting: FakeScript = () =>
      (async function* () {
        await gate;
        yield* text("[[ANSWER]]ok");
      })();
    const pending = ask("pm", req("attesa"), waiting, { heartbeatMs: 300 });
    await sleep(100);
    expect(await code(prepareQuestion({ deps: { client, db }, user: await user("pm"), request: req("seconda"), now: E_NOW, cfg, provider: new FakeProvider() }))).toBe("409 BUSY_USER");
    await sleep(800);
    release();
    const r = await pending;
    expect(r.events.some((e) => e.type === "heartbeat")).toBe(true);
    expect(r.last).toMatchObject({ type: "done" });
  });
});
