import { apiFetch, goToPasswordChangeIfRequired } from "@/lib/client";
import type {
  AssistantErrorBody,
  AssistantErrorCode,
  AssistantEvent,
  AssistantMessageRequest,
  AssistantSettingsDTO,
  AssistantSettingsUpdateRequest,
  AssistantStatusDTO,
} from "@/components/assistente/types";

/**
 * Data access of the AI assistant (contract §13). The answer is NDJSON over a
 * POST fetch (not EventSource, which only sends GET), read incrementally:
 * apiFetch is for JSON and is used only by the status and settings routes.
 */

export const MESSAGES_URL = "/api/assistant/messages";
/** §13.2: at most 16 KiB per line. */
export const MAX_LINE_BYTES = 16 * 1024;
/** Heartbeat every 5 s of silence (§13.2): after this long without a byte the answer is given up as interrupted. */
export const STALL_MS = 30_000;

export class StreamProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StreamProtocolError";
  }
}

/**
 * Reads an NDJSON byte stream and calls `onValue` with each parsed line, in
 * order. UTF-8 sequences and lines split across chunks are joined; "\r\n" and
 * blank lines are tolerated. A line over 16 KiB or not JSON is a protocol error.
 * `onValue` returning false stops reading; the reader is then cancelled, as on any error.
 */
export async function readNdjson(
  body: ReadableStream<Uint8Array>,
  onValue: (value: unknown) => boolean | void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  const encoder = new TextEncoder();
  let buffer = "";
  // Anything but a natural end (stop, protocol error, abort) cancels the body, so the server stops generating.
  let finished = false;

  const flushLine = (raw: string): boolean => {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (line.trim() === "") return true;
    if (encoder.encode(line).length > MAX_LINE_BYTES) throw new StreamProtocolError("line too long");
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new StreamProtocolError("invalid JSON line");
    }
    return onValue(value) !== false;
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl = buffer.indexOf("\n");
      while (nl >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (!flushLine(line)) return;
        nl = buffer.indexOf("\n");
      }
      // Characters never exceed bytes: a partial line this long is already over the limit.
      if (buffer.length > MAX_LINE_BYTES) throw new StreamProtocolError("line too long");
    }
    buffer += decoder.decode();
    // A last line without "\n" still counts (the server always sends one, a proxy might drop it).
    finished = true;
    if (buffer !== "") flushLine(buffer);
  } finally {
    if (!finished) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export type AssistantDoneEvent = Extract<AssistantEvent, { type: "done" }>;

/** Client-side failures without a server code. */
export type AssistantClientCode = "NETWORK";

export type AskOutcome =
  | { kind: "done"; event: AssistantDoneEvent }
  | {
      kind: "error";
      code: AssistantErrorCode | AssistantClientCode;
      /** Server's Italian message, when there is one (shown only for codes without a fixed text). */
      message?: string;
      retryAfterSeconds?: number;
      resetAt?: string;
      /** HTTP status of an error before the stream; undefined for an `error` event. */
      status?: number;
    }
  /** Closed without a terminal event, broken line or stalled: "Risposta interrotta". */
  | { kind: "interrupted" }
  /** Stopped by the user (Interrompi, panel closed): the server stops generating. */
  | { kind: "aborted" };

const STATUS_CODE: Record<number, AssistantErrorCode> = {
  401: "UNAUTHENTICATED",
  403: "NOT_ENABLED",
  404: "NOT_FOUND",
  409: "BUSY_USER",
  413: "BODY_TOO_LARGE",
  422: "INVALID_REQUEST",
  429: "BUSY",
  503: "UNAVAILABLE",
  504: "TIMEOUT",
};

function isEvent(v: unknown): v is AssistantEvent {
  return !!v && typeof v === "object" && typeof (v as { type?: unknown }).type === "string" && typeof (v as { seq?: unknown }).seq === "number";
}

/**
 * Sends one question and streams its events to `onEvent` (every event but
 * the terminal one; heartbeats included). Never throws: the outcome says how
 * it ended. No retry here: "Riprova" is an explicit new question (§9).
 */
export async function askAssistant(
  request: AssistantMessageRequest,
  { signal, onEvent }: { signal: AbortSignal; onEvent: (event: AssistantEvent) => void }
): Promise<AskOutcome> {
  // One controller for the user's abort and the stall watchdog: both close the request.
  const controller = new AbortController();
  let stalled = false;
  const onAbort = () => controller.abort();
  if (signal.aborted) return { kind: "aborted" };
  signal.addEventListener("abort", onAbort);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      stalled = true;
      controller.abort();
    }, STALL_MS);
  };
  const ended = (): AskOutcome => (signal.aborted ? { kind: "aborted" } : { kind: "interrupted" });

  try {
    arm();
    let res: Response;
    try {
      res = await fetch(MESSAGES_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        credentials: "include",
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    } catch {
      if (signal.aborted) return { kind: "aborted" };
      return stalled ? { kind: "error", code: "TIMEOUT" } : { kind: "error", code: "NETWORK" };
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as Partial<AssistantErrorBody>;
      // D-173: the mandatory password change comes first (the page is left for /change-password).
      if (goToPasswordChangeIfRequired(res.status, body)) return { kind: "error", code: "AUTH_CHANGED", status: res.status };
      return {
        kind: "error",
        code: body.code ?? STATUS_CODE[res.status] ?? "INTERNAL",
        message: typeof body.error === "string" ? body.error : undefined,
        retryAfterSeconds: body.retryAfterSeconds,
        resetAt: body.resetAt,
        status: res.status,
      };
    }
    // A redirect to the login page answers 200 with HTML.
    if (res.redirected && new URL(res.url, "http://x").pathname.startsWith("/login")) {
      return { kind: "error", code: "UNAUTHENTICATED", status: 401 };
    }
    if (!res.body || !(res.headers.get("content-type") ?? "").includes("application/x-ndjson")) {
      return { kind: "error", code: "INTERNAL", status: res.status };
    }

    let outcome: AskOutcome | null = null;
    let lastSeq = 0;
    try {
      await readNdjson(res.body, (value) => {
        arm();
        if (!isEvent(value)) return true; // unknown shape: ignored
        if (value.seq <= lastSeq) return true; // repeated or out of order
        lastSeq = value.seq;
        if (value.type === "done") {
          outcome = { kind: "done", event: value };
          return false;
        }
        if (value.type === "error") {
          outcome = {
            kind: "error",
            code: value.code,
            message: value.message,
            retryAfterSeconds: value.retryAfterSeconds,
            resetAt: value.resetAt,
          };
          return false;
        }
        onEvent(value);
        return true;
      });
    } catch {
      // Aborted read, broken line or stall: whatever arrived stays, marked as interrupted.
      return outcome ?? ended();
    }
    return outcome ?? ended();
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

/** requestId of a new question: crypto.randomUUID needs a secure context, getRandomValues does not. */
export function newRequestId(): string {
  if (typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      /* not a secure context */
    }
  }
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** §13.1: no inference, no writes. */
export async function loadAssistantStatus(): Promise<AssistantStatusDTO> {
  return apiFetch<AssistantStatusDTO>("/api/assistant/status", { cache: "no-store" });
}

/** ADMIN only (403 otherwise). */
export async function loadAssistantSettings(): Promise<AssistantSettingsDTO> {
  return apiFetch<AssistantSettingsDTO>("/api/assistant/settings", { cache: "no-store" });
}

/** ADMIN only; out of range → 422. Effective immediately for everyone. */
export async function saveAssistantSettings(body: AssistantSettingsUpdateRequest): Promise<AssistantSettingsDTO> {
  return apiFetch<AssistantSettingsDTO>("/api/assistant/settings", { method: "PUT", body: JSON.stringify(body) });
}
