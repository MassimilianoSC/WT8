import type {
  AssistantEvent,
  AssistantFactDTO,
  AssistantSettingsDTO,
  AssistantSourceDTO,
  AssistantStatusDTO,
} from "@/components/assistente/types";

/**
 * Simulated AI assistant (contract §13) for the tests, until o2's real route
 * exists: NDJSON responses split at any byte, a stream the test drives line by
 * line, and ready-made answers. Never imported by the app.
 */

type EventBody = AssistantEvent extends infer E ? (E extends AssistantEvent ? Omit<E, "seq"> : never) : never;

const enc = new TextEncoder();

export function demoStatus(over: Partial<AssistantStatusDTO> = {}): AssistantStatusDTO {
  return {
    enabled: true,
    availability: "READY",
    dailyLimit: 30,
    usedToday: 12,
    remainingToday: 18,
    resetAt: "2026-10-10T00:00:00+02:00",
    perMinuteLimit: 4,
    ...over,
  };
}

export function demoSettings(over: Partial<AssistantSettingsDTO> = {}): AssistantSettingsDTO {
  return {
    enabled: true,
    dailyLimit: 30,
    perMinuteLimit: 4,
    technicalEnabled: true,
    updatedAt: "2026-10-09T10:00:00+02:00",
    updatedBy: "Amministratore",
    ...over,
  };
}

/** Numbers each event with seq 1, 2, … */
export function withSeq(events: EventBody[]): AssistantEvent[] {
  return events.map((e, i) => ({ ...e, seq: i + 1 }) as AssistantEvent);
}

/** NDJSON text of the events, one line each with the final "\n". */
export function ndjson(events: AssistantEvent[]): string {
  return events.map((e) => JSON.stringify(e) + "\n").join("");
}

/** Bytes cut every `size` bytes: splits lines and multi-byte UTF-8 sequences alike. */
export function chunked(text: string, size: number): Uint8Array[] {
  const bytes = enc.encode(text);
  const out: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) out.push(bytes.slice(i, i + size));
  return out;
}

/** A stream that serves the chunks and then closes (or stays open with `hold`). */
export function streamOf(chunks: Uint8Array[], opts: { hold?: boolean; onCancel?: () => void } = {}): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]);
      else if (!opts.hold) controller.close();
      else return new Promise<void>(() => undefined);
    },
    cancel() {
      opts.onCancel?.();
    },
  });
}

export function ndjsonResponse(body: ReadableStream<Uint8Array> | string, init: { status?: number } = {}): Response {
  const stream = typeof body === "string" ? streamOf(chunked(body, 7)) : body;
  return new Response(stream, {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}

export function errorResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * A stream the test writes to: `push` sends events (seq added in order),
 * `raw` sends text as is, `close` ends it. `cancelled` tells whether the
 * client gave up the body (Interrompi, panel closed).
 */
export function controlledStream() {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  let seq = 0;
  const state = { cancelled: false };
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
    },
    cancel() {
      state.cancelled = true;
    },
  });
  return {
    stream,
    state,
    push(...events: EventBody[]) {
      for (const e of events) ctrl.enqueue(enc.encode(JSON.stringify({ ...e, seq: ++seq }) + "\n"));
    },
    raw(text: string) {
      ctrl.enqueue(enc.encode(text));
    },
    /** No-op if the client already cancelled the body. */
    close() {
      if (!state.cancelled) ctrl.close();
    },
    /** What a real fetch does to the body when its signal aborts. */
    fail(reason: unknown = new DOMException("Aborted", "AbortError")) {
      if (!state.cancelled) ctrl.error(reason);
    },
  };
}

/** fetch stub serving a controlled stream; like the real fetch, aborting the signal errors the body. */
export function fetchStream(s: ReturnType<typeof controlledStream>) {
  return async (_url: string, init?: RequestInit) => {
    init?.signal?.addEventListener("abort", () => s.fail());
    return ndjsonResponse(s.stream);
  };
}

// ─── Ready-made answers ─────────────────────────────────────────────────────

export const READ_AT = "2026-10-09T10:42:00+02:00";

export const PRACTICE_SOURCE: AssistantSourceDTO = {
  kind: "PRACTICE",
  practiceId: "p-iliad-1",
  codiceSito: "IL-TO-0001",
  nomeSito: "Torino Lingotto",
  templateId: "ILIAD",
  iteration: 2,
  sectionKey: "PERMESSI",
  occurrenceKey: "forecast_ottenimento_permessi",
  label: "Forecast Ottenimento Permessi",
  readAt: READ_AT,
};

export const LIST_SOURCE: AssistantSourceDTO = {
  kind: "LIST",
  label: "Pratiche ILIAD in ASSEGNATO",
  query: { templateId: "ILIAD", stato: "ASSEGNATO" },
  readAt: READ_AT,
};

export const FACT: AssistantFactDTO = {
  key: "forecast_permessi_mese",
  label: "Forecast Ottenimento Permessi entro fine mese",
  value: 7,
  scopeLabel: "ILIAD",
  period: { from: "2026-10-09", to: "2026-10-31" },
  sourceIndex: 2,
};

export function startEvent(conversationId = "c-1"): EventBody {
  return {
    type: "start",
    requestId: "r-1",
    conversationId,
    messageId: "m-1",
    serverNow: READ_AT,
    todayRome: "2026-10-09",
    timezone: "Europe/Rome",
  };
}

export function doneEvent(over: Partial<Extract<EventBody, { type: "done" }>> = {}): EventBody {
  return {
    type: "done",
    finishReason: "STOP",
    answerState: "ANSWER",
    asOf: READ_AT,
    readStartedAt: "2026-10-09T10:41:58+02:00",
    truncated: false,
    usage: demoStatus({ usedToday: 13, remainingToday: 17 }),
    ...over,
  };
}

/** A full answer: status, two sources before the text that cites them, facts, text, done. */
export function answerEvents(): AssistantEvent[] {
  return withSeq([
    startEvent(),
    { type: "status", phase: "READING", text: "Cerco le pratiche ILIAD con forecast entro il 31/10…" },
    { type: "source", index: 1, source: PRACTICE_SOURCE },
    { type: "source", index: 2, source: LIST_SOURCE },
    { type: "facts", items: [FACT] },
    { type: "status", phase: "ANSWERING", text: "Scrivo la risposta…" },
    { type: "delta", text: "Sono 7 le pratiche ILIAD con forecast entro fine mese [2]. " },
    { type: "heartbeat" },
    { type: "delta", text: "La prima è IL-TO-0001 [1], già in INTEGRAZIONE RICHIESTA." },
    doneEvent(),
  ]);
}
