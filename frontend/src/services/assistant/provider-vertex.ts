/**
 * Provider Gemini su Google Cloud ("Gemini Enterprise Agent Platform", ex Vertex AI) con l'SDK @google/genai
 * (D-168, D-172, A4b). Server-only: credenziali dell'account di servizio da GOOGLE_APPLICATION_CREDENTIALS (file
 * montato solo nel servizio app), mai chiavi API. Location SEMPRE esplicita: senza, l'SDK userebbe "global".
 *
 * - Traduzione verso l'API: istruzioni in systemInstruction, strumenti con parametersJsonSchema (JSON Schema strict),
 *   risultati degli strumenti come functionResponse in un turno "user".
 * - Modelli 3.x: il contenuto COMPLETO del modello (con le thought signature) va rimandato tale e quale nella storia,
 *   altrimenti 400; per questo il blocco di chiamate porta con sé le parti originali (`raw`).
 * - I pensieri del modello (part.thought) non escono mai verso l'utente; i loro token contano come output.
 * - Annullare la richiesta ferma la lettura ma non garantisce che Google smetta di fatturare (documentazione SDK).
 */
import { GoogleGenAI } from "@google/genai";
import type { AssistantConfig } from "./config";
import { ProviderError, type AssistantProvider, type ProviderChunk, type ProviderMessage, type ProviderRequest, type ProviderToolCall } from "./provider";

/* Forme minime dell'SDK usate qui (così le prove possono passare un client simulato). */
export interface GenAIPart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { id?: string; name?: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name?: string; response?: Record<string, unknown> };
}
export interface GenAIContent {
  role?: string;
  parts?: GenAIPart[];
}
export interface GenAIChunk {
  candidates?: { content?: GenAIContent; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; toolUsePromptTokenCount?: number };
}
export interface GenAIStreamParams {
  model: string;
  contents: GenAIContent[];
  config: Record<string, unknown>;
}
export interface GenAILike {
  models: { generateContentStream(params: GenAIStreamParams): Promise<AsyncIterable<GenAIChunk>> };
}

/** Id che il provider non ha dato: lo creiamo noi e NON lo rimandiamo a Google. */
const LOCAL_ID = "ph-";
/** Caratteri di testo trattenuti all'inizio di un turno prima di iniziare a mostrarli. */
export const HOLD_CHARS = 200;

/** Blocco di chiamate con le parti originali del modello, da rimandare intatte (thought signature). */
interface RawModelTurn {
  vertexParts: GenAIPart[];
}

export function toContents(messages: ProviderMessage[]): GenAIContent[] {
  return messages.map((m): GenAIContent => {
    if (m.role === "user") return { role: "user", parts: [{ text: m.text }] };
    if (m.role === "model") {
      const raw = (m as { raw?: RawModelTurn }).raw;
      if (raw?.vertexParts?.length) return { role: "model", parts: raw.vertexParts };
      const parts: GenAIPart[] = [];
      if (m.text) parts.push({ text: m.text });
      for (const c of m.toolCalls ?? []) parts.push({ functionCall: { ...(c.id.startsWith(LOCAL_ID) ? {} : { id: c.id }), name: c.name, args: (c.args ?? {}) as Record<string, unknown> } });
      return { role: "model", parts };
    }
    return {
      role: "user",
      parts: m.results.map((r) => ({
        functionResponse: { ...(r.id.startsWith(LOCAL_ID) ? {} : { id: r.id }), name: r.name, response: (r.output ?? {}) as Record<string, unknown> },
      })),
    };
  });
}

const BLOCKED = new Set(["SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "RECITATION", "IMAGE_SAFETY"]);

/** Errore dell'SDK → errore del provider, senza testo della richiesta né dettagli grezzi. */
export function mapGenAIError(e: unknown): unknown {
  if (e instanceof ProviderError) return e;
  const err = e as { name?: string; status?: number; code?: number };
  if (err?.name === "AbortError") return e;
  const status = typeof err?.status === "number" ? err.status : typeof err?.code === "number" ? err.code : 0;
  if (status === 429) return new ProviderError("QUOTA", "Quota del servizio AI esaurita", true);
  if (status >= 500 || status === 0) return new ProviderError("UNAVAILABLE", `Servizio AI non disponibile (${status || "rete"})`, true);
  return new ProviderError("UNAVAILABLE", `Richiesta rifiutata dal servizio AI (${status})`, false);
}

export interface VertexOptions {
  model: string;
  region: string;
  /** Modelli 3.x: livello di ragionamento; 2.5: budget (0 = spento). */
  thinkingLevel?: "MINIMAL" | "LOW" | "MEDIUM" | "HIGH";
}

export class VertexProvider implements AssistantProvider {
  readonly name = "vertex";
  readonly model: string;
  readonly region: string;
  constructor(
    private readonly client: GenAILike,
    private readonly opts: VertexOptions
  ) {
    this.model = opts.model;
    this.region = opts.region;
  }

  private thinkingConfig(): Record<string, unknown> {
    if (/^gemini-2\./.test(this.model)) return { thinkingBudget: 0 };
    // Predefinito per modello: i Flash-Lite partono da MINIMAL (LOW non è tra i loro livelli), gli altri 3.x da LOW.
    return { thinkingLevel: this.opts.thinkingLevel ?? (/flash-lite/.test(this.model) ? "MINIMAL" : "LOW"), includeThoughts: false };
  }

  async *generate(req: ProviderRequest): AsyncIterable<ProviderChunk> {
    const config: Record<string, unknown> = {
      systemInstruction: req.system,
      maxOutputTokens: req.maxOutputTokens,
      abortSignal: req.signal,
      thinkingConfig: this.thinkingConfig(),
      ...(req.tools.length
        ? {
            tools: [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters })) }],
            toolConfig: { functionCallingConfig: { mode: "AUTO" } },
          }
        : {}),
    };
    let stream: AsyncIterable<GenAIChunk>;
    try {
      stream = await this.client.models.generateContentStream({ model: this.model, contents: toContents(req.messages), config });
    } catch (e) {
      throw mapGenAIError(e);
    }
    const modelParts: GenAIPart[] = [];
    const calls: ProviderToolCall[] = [];
    // Testo trattenuto finché non è chiaro che il turno non chiama strumenti (una frase prima di una chiamata si scarta).
    let held = "";
    let streaming = false;
    let usage: GenAIChunk["usageMetadata"] | undefined;
    let finish: string | undefined;
    try {
      for await (const chunk of stream) {
        const cand = chunk.candidates?.[0];
        for (const part of cand?.content?.parts ?? []) {
          modelParts.push(part);
          if (part.thought) continue; // mai i pensieri verso l'utente
          if (part.functionCall?.name) {
            calls.push({ id: part.functionCall.id || `${LOCAL_ID}${calls.length + 1}`, name: part.functionCall.name, args: part.functionCall.args ?? {} });
          } else if (typeof part.text === "string" && part.text && calls.length === 0) {
            if (streaming) yield { type: "text", text: part.text };
            else {
              held += part.text;
              if (held.length >= HOLD_CHARS) {
                streaming = true;
                yield { type: "text", text: held };
                held = "";
              }
            }
          }
        }
        if (chunk.usageMetadata) usage = chunk.usageMetadata; // l'ultimo è cumulativo
        if (cand?.finishReason) finish = cand.finishReason;
      }
    } catch (e) {
      throw mapGenAIError(e);
    }
    if (calls.length) yield { type: "toolCalls", calls, raw: { vertexParts: modelParts } satisfies RawModelTurn };
    else if (held) yield { type: "text", text: held };
    if (usage) {
      yield {
        type: "usage",
        inputTokens: (usage.promptTokenCount ?? 0) + (usage.toolUsePromptTokenCount ?? 0),
        outputTokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
      };
    }
    yield { type: "finish", reason: finish === "MAX_TOKENS" ? "LENGTH" : finish && BLOCKED.has(finish) ? "BLOCKED" : "STOP" };
  }
}

/** Client vero: Agent Platform con progetto e location espliciti, API v1, credenziali dell'account di servizio. */
export function createVertexProvider(cfg: AssistantConfig): VertexProvider {
  const client = new GoogleGenAI({ enterprise: true, project: cfg.project!, location: cfg.location!, apiVersion: "v1" }) as unknown as GenAILike;
  return new VertexProvider(client, { model: cfg.model!, region: cfg.location!, thinkingLevel: cfg.thinkingLevel ?? undefined });
}
