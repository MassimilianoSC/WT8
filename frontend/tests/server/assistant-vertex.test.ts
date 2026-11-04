// @vitest-environment node
/**
 * VertexProvider con un client @google/genai SIMULATO: nessuna chiamata a Google. Traduzione delle richieste,
 * lettura dello stream, thought signature rimandate intatte (Gemini 3), errori e configurazione (D-179).
 *   MONGO_RS_TEST_URL="mongodb://127.0.0.1:27021/?directConnection=true" yarn vitest run tests/server/assistant-vertex.test.ts
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { store } from "@/lib/store/db";
import { assistantConfig } from "@/services/assistant/config";
import { prepareQuestion, streamAnswer } from "@/services/assistant/orchestrator";
import { ProviderError, type ProviderChunk, type ProviderRequest } from "@/services/assistant/provider";
import { HOLD_CHARS, mapGenAIError, toContents, VertexProvider, type GenAIChunk, type GenAILike, type GenAIStreamParams } from "@/services/assistant/provider-vertex";
import { resetGate } from "@/services/assistant/quota";
import { toUserDTO } from "@/services/users-v2";
import { assertDisposableTarget } from "../../scripts/db/guard";
import { applyFixtureE, E_NOW, eIds, seedS0 } from "../fixtures/assistant-e";

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;

/** Client simulato: risponde con i turni dati e registra ogni richiesta. */
function fakeClient(turns: (GenAIChunk[] | Error)[]) {
  const calls: GenAIStreamParams[] = [];
  const client: GenAILike = {
    models: {
      async generateContentStream(params) {
        calls.push(structuredClone({ ...params, config: { ...params.config, abortSignal: undefined } }));
        const t = turns[calls.length - 1];
        if (t instanceof Error) throw t;
        return (async function* () {
          for (const c of t) yield c;
        })();
      },
    },
  };
  return { client, calls };
}
const req = (over: Partial<ProviderRequest> = {}): ProviderRequest => ({
  system: "SISTEMA",
  messages: [{ role: "user", text: "Domanda?" }],
  tools: [{ name: "get_practices", description: "d", parameters: { type: "object", additionalProperties: false, properties: {} } }],
  maxOutputTokens: 8192,
  signal: new AbortController().signal,
  ...over,
});
async function collect(it: AsyncIterable<ProviderChunk>) {
  const out: ProviderChunk[] = [];
  for await (const c of it) out.push(c);
  return out;
}
const textChunk = (text: string, finishReason?: string): GenAIChunk => ({ candidates: [{ content: { role: "model", parts: [{ text }] }, ...(finishReason ? { finishReason } : {}) }] });

describe("traduzione e stream (client simulato)", () => {
  it("richiesta: istruzioni, strumenti con parametersJsonSchema, ragionamento LOW sui 3.x, spento sui 2.5", async () => {
    const { client, calls } = fakeClient([[textChunk("ok", "STOP")], [textChunk("ok", "STOP")], [textChunk("ok", "STOP")]]);
    await collect(new VertexProvider(client, { model: "gemini-3.8-flash", region: "eu" }).generate(req()));
    expect(calls[0]).toMatchObject({
      model: "gemini-3.8-flash",
      contents: [{ role: "user", parts: [{ text: "Domanda?" }] }],
      config: {
        systemInstruction: "SISTEMA",
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingLevel: "LOW", includeThoughts: false },
        tools: [{ functionDeclarations: [{ name: "get_practices", parametersJsonSchema: { additionalProperties: false } }] }],
        toolConfig: { functionCallingConfig: { mode: "AUTO" } },
      },
    });
    await collect(new VertexProvider(client, { model: "gemini-2.5-flash", region: "eu" }).generate(req({ tools: [] })));
    expect(calls[1].config).toMatchObject({ thinkingConfig: { thinkingBudget: 0 } });
    await collect(new VertexProvider(client, { model: "gemini-3.5-flash-lite", region: "eu" }).generate(req()));
    expect(calls[2].config).toMatchObject({ thinkingConfig: { thinkingLevel: "MINIMAL" } });
    expect(calls[1].config).not.toHaveProperty("tools");
  });

  it("stream: pensieri mai inoltrati, testo trattenuto fino a 200 caratteri poi a pezzi, token del ragionamento come output", async () => {
    const long = "x".repeat(HOLD_CHARS);
    const { client } = fakeClient([
      [
        { candidates: [{ content: { parts: [{ text: "PENSIERO_SEGRETO", thought: true }] } }] },
        textChunk("Inizio "),
        textChunk(long),
        textChunk(" coda"),
        { candidates: [{ finishReason: "STOP" }], usageMetadata: { promptTokenCount: 100, toolUsePromptTokenCount: 5, candidatesTokenCount: 40, thoughtsTokenCount: 30 } },
      ],
    ]);
    const out = await collect(new VertexProvider(client, { model: "gemini-3.8-flash", region: "eu" }).generate(req()));
    expect(JSON.stringify(out)).not.toContain("PENSIERO_SEGRETO");
    expect(out.filter((c) => c.type === "text").map((c) => (c as { text: string }).text)).toEqual([`Inizio ${long}`, " coda"]);
    expect(out).toContainEqual({ type: "usage", inputTokens: 105, outputTokens: 70 });
    expect(out[out.length - 1]).toEqual({ type: "finish", reason: "STOP" });
  });

  it("frase prima di una chiamata: scartata; chiamate con le parti originali (thought signature) e id locali non rimandati", async () => {
    const parts = [
      { text: "Controllo subito." },
      { functionCall: { name: "get_practices", args: { selection: {} } }, thoughtSignature: "SIG-1" },
      { functionCall: { id: "g-2", name: "find_people", args: { templateId: "ILIAD", role: "UT" } } },
    ];
    const { client } = fakeClient([[{ candidates: [{ content: { role: "model", parts }, finishReason: "STOP" }] }]]);
    const out = await collect(new VertexProvider(client, { model: "gemini-3.8-flash", region: "eu" }).generate(req()));
    expect(out.some((c) => c.type === "text")).toBe(false);
    const tc = out.find((c) => c.type === "toolCalls") as Extract<ProviderChunk, { type: "toolCalls" }>;
    expect(tc.calls.map((c) => [c.id, c.name])).toEqual([["ph-1", "get_practices"], ["g-2", "find_people"]]);
    expect(tc.raw).toEqual({ vertexParts: parts });
    const contents = toContents([
      { role: "user", text: "Domanda?" },
      { role: "model", toolCalls: tc.calls, raw: tc.raw },
      { role: "tool", results: [{ id: "ph-1", name: "get_practices", output: { result: 1 } }, { id: "g-2", name: "find_people", output: { result: 2 } }] },
    ]);
    expect(contents[1]).toEqual({ role: "model", parts });
    expect(contents[2]).toEqual({ role: "user", parts: [{ functionResponse: { name: "get_practices", response: { result: 1 } } }, { functionResponse: { id: "g-2", name: "find_people", response: { result: 2 } } }] });
  });

  it("finishReason ed errori: MAX_TOKENS → LENGTH, filtri → BLOCKED, 429 → QUOTA transitoria, 5xx transitorio, 4xx definitivo", async () => {
    const fin = async (reason: string) => {
      const { client } = fakeClient([[textChunk("t", reason)]]);
      const out = await collect(new VertexProvider(client, { model: "gemini-3.8-flash", region: "eu" }).generate(req()));
      return (out[out.length - 1] as { reason: string }).reason;
    };
    expect(await fin("MAX_TOKENS")).toBe("LENGTH");
    expect(await fin("SAFETY")).toBe("BLOCKED");
    expect(await fin("PROHIBITED_CONTENT")).toBe("BLOCKED");
    expect(await fin("MALFORMED_FUNCTION_CALL")).toBe("STOP");
    expect(mapGenAIError(Object.assign(new Error("x"), { status: 429 }))).toMatchObject({ kind: "QUOTA", transient: true });
    expect(mapGenAIError(Object.assign(new Error("x"), { status: 503 }))).toMatchObject({ kind: "UNAVAILABLE", transient: true });
    expect(mapGenAIError(Object.assign(new Error("x"), { status: 403 }))).toMatchObject({ kind: "UNAVAILABLE", transient: false });
    const { client } = fakeClient([Object.assign(new Error("quota"), { status: 429 })]);
    await expect(collect(new VertexProvider(client, { model: "gemini-3.8-flash", region: "eu" }).generate(req()))).rejects.toBeInstanceOf(ProviderError);
  });

  it("configurazione (D-179): solo \"eu\"; niente chiavi API; credenziale obbligatoria; livello di ragionamento", () => {
    const base = { PH_AI_ENABLED: "true", PH_AI_PROVIDER: "vertex", GOOGLE_CLOUD_PROJECT: "p", PH_AI_MODEL: "gemini-3.8-flash", GOOGLE_APPLICATION_CREDENTIALS: "/run/secrets/x.json" };
    expect(assistantConfig(env({ ...base, PH_AI_LOCATION: "eu" })).problems).toEqual([]);
    for (const loc of ["europe-west8", "europe-west4", "global", "us"]) expect(assistantConfig(env({ ...base, PH_AI_LOCATION: loc })).problems.join()).toMatch(/non ammessa/);
    expect(assistantConfig(env({ ...base, PH_AI_LOCATION: "eu", GOOGLE_API_KEY: "k" })).problems.join()).toMatch(/non ammesse/);
    const { GOOGLE_APPLICATION_CREDENTIALS: _c, ...noCred } = base;
    expect(assistantConfig(env({ ...noCred, PH_AI_LOCATION: "eu" })).problems).toEqual(["GOOGLE_APPLICATION_CREDENTIALS mancante"]);
    expect(assistantConfig(env({ ...base, PH_AI_LOCATION: "eu", PH_AI_THINKING_LEVEL: "medium" })).thinkingLevel).toBe("MEDIUM");
  });
});

const URL_RS = process.env.MONGO_RS_TEST_URL;
describe.skipIf(!URL_RS)("orchestratore con VertexProvider simulato", () => {
  let client: MongoClient;
  let db: Db;
  const DB = `practicehub_test_ai_vertex_${Date.now()}`;

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    client = await new MongoClient(URL_RS!).connect();
    db = client.db(DB);
    await seedS0(db);
    await applyFixtureE(db);
  }, 240_000);
  afterAll(async () => {
    await client?.db(DB).dropDatabase();
    await client?.close();
  });

  it("due giri: la seconda chiamata riceve il contenuto del modello con la thought signature e il risultato dello strumento", async () => {
    resetGate();
    const sig = { functionCall: { name: "get_practices", args: { selection: { templateId: "ILIAD" } } }, thoughtSignature: "SIG-ORCH" };
    const { client: genai, calls } = fakeClient([
      [{ candidates: [{ content: { role: "model", parts: [sig] }, finishReason: "STOP" }] }],
      [textChunk("[[ANSWER]]Una pratica ILIAD [2].", "STOP")],
    ]);
    const provider = new VertexProvider(genai, { model: "gemini-3.8-flash", region: "eu" });
    const user = toUserDTO((await store.users(db).findOne({ _id: eIds.user("pm") }))!);
    const cfg = { ...assistantConfig(env({ PH_AI_ENABLED: "true", PH_AI_PROVIDER: "fake" })) };
    const p = await prepareQuestion({ deps: { client, db }, user, request: { requestId: randomUUID(), text: "Pratiche ILIAD?" }, now: E_NOW, cfg, provider });
    const events: { type: string }[] = [];
    await streamAnswer(p, (e) => events.push(e as { type: string }), new AbortController().signal);
    expect(events[events.length - 1]).toMatchObject({ type: "done", answerState: "ANSWER" });
    expect(calls).toHaveLength(2);
    expect(calls[1].contents[1]).toEqual({ role: "model", parts: [sig] });
    expect(calls[1].contents[2].role).toBe("user");
    expect(calls[1].contents[2].parts![0].functionResponse).toMatchObject({ name: "get_practices", response: { result: { total: 1 } } });
    expect(calls[1].contents[2].parts![0].functionResponse).not.toHaveProperty("id");
  });
});
