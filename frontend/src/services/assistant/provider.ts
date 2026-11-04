/**
 * Provider del modello (progetto §2.1, D-172). Interfaccia minima indipendente da Google: istruzioni di sistema,
 * messaggi, dichiarazioni degli strumenti; in uscita frammenti di testo, chiamate di strumenti e uso dei token.
 *
 * - FakeProvider: risposte prefissate per sviluppo e prove; registra OGNI richiesta (copia profonda) così le prove
 *   controllano il payload che uscirebbe verso Google (canarini, §13.5).
 * - VertexProvider (provider-vertex.ts): Gemini su Google Cloud, endpoint UE (D-168).
 */
import type { AssistantConfig } from "./config";
import { createVertexProvider } from "./provider-vertex";
import type { ToolDeclaration } from "./tools";

export interface ProviderToolCall {
  id: string;
  name: string;
  args: unknown;
}

export type ProviderMessage =
  | { role: "user"; text: string }
  /** raw: contenuto originale del provider da rimandare intatto (es. thought signature di Gemini 3). */
  | { role: "model"; text?: string; toolCalls?: ProviderToolCall[]; raw?: unknown }
  | { role: "tool"; results: { id: string; name: string; output: unknown }[] };

export interface ProviderRequest {
  system: string;
  messages: ProviderMessage[];
  /** Vuoto = risposta finale senza strumenti. */
  tools: ToolDeclaration[];
  maxOutputTokens: number;
  signal: AbortSignal;
}

export type ProviderChunk =
  | { type: "text"; text: string }
  | { type: "toolCalls"; calls: ProviderToolCall[]; raw?: unknown }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "finish"; reason: "STOP" | "LENGTH" | "BLOCKED" };

/** Errore tecnico del provider: QUOTA → PROVIDER_QUOTA, UNAVAILABLE, TIMEOUT; BLOCKED = filtro di sicurezza. */
export class ProviderError extends Error {
  constructor(
    readonly kind: "QUOTA" | "UNAVAILABLE" | "TIMEOUT" | "BLOCKED",
    message: string,
    readonly transient = false
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface AssistantProvider {
  readonly name: string;
  readonly model: string | null;
  readonly region: string | null;
  generate(req: ProviderRequest): AsyncIterable<ProviderChunk>;
}

/* ---------- provider finto ---------- */

export type FakeScript = (req: ProviderRequest, turn: number) => ProviderChunk[] | AsyncIterable<ProviderChunk> | Promise<ProviderChunk[]>;

export class FakeProvider implements AssistantProvider {
  readonly name = "fake";
  readonly model = "fake";
  readonly region = null;
  /** Richieste ricevute, come uscirebbero verso il provider vero. */
  readonly calls: ProviderRequest[] = [];
  constructor(private readonly script: FakeScript = defaultFakeScript) {}

  async *generate(req: ProviderRequest): AsyncIterable<ProviderChunk> {
    const { signal, ...rest } = req;
    this.calls.push({ ...structuredClone(rest), signal });
    const out = await this.script(req, this.calls.length);
    for await (const chunk of out as AsyncIterable<ProviderChunk>) {
      if (signal.aborted) return;
      yield chunk;
    }
  }
}

/**
 * Copione predefinito (anteprima e prove dell'interfaccia), secondo il contesto della pagina scritto dal server nelle
 * istruzioni: scheda → identità della pratica; statistiche → KPI degli ultimi 30 giorni; elenco o altro → elenco
 * delle pratiche visibili. Secondo giro: una frase dai dati letti con la fonte. Nessun dato inventato.
 */
export const defaultFakeScript: FakeScript = (req, turn) => {
  const last = req.messages[req.messages.length - 1];
  const finish: ProviderChunk = { type: "finish", reason: "STOP" };
  const say = (t: string): ProviderChunk[] => [...`${t} (Risposta di prova: modello finto.)`.match(/.{1,24}/gs)!.map((x) => ({ type: "text" as const, text: x })), finish];
  const sheet = /pratica id ([0-9a-f]{24}), [A-Z_]+, iterazione (\d+)/.exec(req.system);
  const stats = /- pagina: stats/.test(req.system);
  const today = /oggi a Roma: (\d{4}-\d{2}-\d{2})/.exec(req.system)?.[1];
  if (turn === 1 || last.role !== "tool") {
    if (sheet) return [{ type: "toolCalls", calls: [{ id: "c1", name: "get_practice", args: { practiceId: sheet[1], iteration: Number(sheet[2]), topics: ["identity"] } }] }, finish];
    if (stats && today) {
      const from = new Date(Date.parse(`${today}T00:00:00Z`) - 29 * 86400_000).toISOString().slice(0, 10);
      return [{ type: "toolCalls", calls: [{ id: "c1", name: "get_stats", args: { period: { from, to: today } } }] }, finish];
    }
    return [{ type: "toolCalls", calls: [{ id: "c1", name: "get_practices", args: { selection: {} } }] }, finish];
  }
  const r = last.results[0];
  const out = r?.output as { result?: { total?: number; items?: Record<string, unknown>[] }; error?: { code: string } } | undefined;
  if (!out?.result) return say(`[[INSUFFICIENT_EVIDENCE]]Non riesco a leggere questi dati (${out?.error?.code ?? "errore"}).`);
  const first = out.result.items?.[0] ?? {};
  const ref = typeof first.fonte === "number" ? ` [${first.fonte}]` : "";
  if (r.name === "get_practice") return say(`[[ANSWER]]La pratica ${String(first.codiceSito)} (${String(first.nomeSito)}) è in stato ${String(first.stato)}, iterazione ${String(first.iterazione)}${ref}.`);
  if (r.name === "get_stats") return say(`[[ANSWER]]Pratiche attive ora: ${String(first.attiveOra)}; alert aperti: ${String(first.alertAperti)}${ref}.`);
  const total = out.result.total ?? 0;
  return total > 0 ? say(`[[ANSWER]]Vedi ${total} pratiche con i filtri attuali${ref}.`) : say("[[NO_DATA]]Non trovo pratiche con i filtri attuali.");
};

/** Provider della configurazione; null se la configurazione ha problemi. */
export function createProvider(cfg: AssistantConfig): AssistantProvider | null {
  if (cfg.problems.length > 0) return null;
  if (cfg.provider === "fake") return new FakeProvider();
  if (cfg.provider === "vertex") return createVertexProvider(cfg);
  return null;
}
