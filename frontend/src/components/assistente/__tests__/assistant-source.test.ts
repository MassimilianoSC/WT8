import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_LINE_BYTES,
  STALL_MS,
  StreamProtocolError,
  askAssistant,
  newRequestId,
  readNdjson,
} from "@/components/assistente/assistant-source";
import type { AssistantEvent } from "@/components/assistente/types";
import { browserNav } from "@/lib/client";
import {
  answerEvents,
  chunked,
  controlledStream,
  doneEvent,
  errorResponse,
  fetchStream,
  ndjson,
  ndjsonResponse,
  startEvent,
  streamOf,
  withSeq,
} from "@/components/__fixtures__/demo-assistant";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const REQUEST = { requestId: "r-1", text: "Quante pratiche?" };

async function collect(text: string, size: number): Promise<unknown[]> {
  const out: unknown[] = [];
  await readNdjson(streamOf(chunked(text, size)), (v) => {
    out.push(v);
  });
  return out;
}

describe("readNdjson", () => {
  it("joins lines and UTF-8 sequences split at every byte position", async () => {
    const text = ndjson(answerEvents());
    const whole = await collect(text, text.length * 4);
    expect(whole).toHaveLength(answerEvents().length);
    for (const size of [1, 2, 3, 5, 64]) {
      expect(await collect(text, size)).toEqual(whole);
    }
    // "è", "…" and an emoji survive a 1-byte split.
    const accents = JSON.stringify({ t: "già è … 📡" }) + "\n";
    expect(await collect(accents, 1)).toEqual([{ t: "già è … 📡" }]);
  });

  it("tolerates CRLF, blank lines and a last line without newline", async () => {
    expect(await collect('{"a":1}\r\n\n{"a":2}\n{"a":3}', 4)).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
  });

  it("a line over 16 KiB or not JSON is a protocol error", async () => {
    const long = JSON.stringify({ t: "x".repeat(MAX_LINE_BYTES) }) + "\n";
    await expect(collect(long, 1000)).rejects.toBeInstanceOf(StreamProtocolError);
    // Over the limit in bytes, not in characters.
    const multibyte = JSON.stringify({ t: "è".repeat(MAX_LINE_BYTES / 2) }) + "\n";
    await expect(collect(multibyte, 4096)).rejects.toBeInstanceOf(StreamProtocolError);
    await expect(collect("{not json}\n", 3)).rejects.toBeInstanceOf(StreamProtocolError);
  });

  it("stopping early cancels the body", async () => {
    const onCancel = vi.fn();
    const seen: unknown[] = [];
    await readNdjson(streamOf(chunked('{"a":1}\n{"a":2}\n', 3), { hold: true, onCancel }), (v) => {
      seen.push(v);
      return false;
    });
    expect(seen).toEqual([{ a: 1 }]);
    expect(onCancel).toHaveBeenCalled();
  });
});

function stubFetch(...responses: Response[]) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
    const r = responses.shift();
    if (!r) throw new Error("unexpected fetch");
    return r;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("askAssistant", () => {
  it("streams every event but the terminal one, in order, and ends with done", async () => {
    const fetchMock = stubFetch(ndjsonResponse(ndjson(answerEvents())));
    const events: AssistantEvent[] = [];
    const out = await askAssistant(REQUEST, { signal: new AbortController().signal, onEvent: (e) => events.push(e) });
    expect(out.kind).toBe("done");
    expect(events.map((e) => e.type)).toEqual(["start", "status", "source", "source", "facts", "status", "delta", "heartbeat", "delta"]);
    // Sources come before the text that cites them.
    expect(events.findIndex((e) => e.type === "source")).toBeLessThan(events.findIndex((e) => e.type === "delta"));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/assistant/messages");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
    expect(JSON.parse(String(init?.body))).toEqual(REQUEST);
  });

  it("an error event after some text ends the answer with that code", async () => {
    stubFetch(
      ndjsonResponse(
        ndjson(
          withSeq([
            startEvent(),
            { type: "delta", text: "Sono 7" },
            { type: "error", code: "TIMEOUT", message: "Tempo scaduto", requestId: "r-1" },
            { type: "delta", text: "ignorato" },
          ])
        )
      )
    );
    const events: AssistantEvent[] = [];
    const out = await askAssistant(REQUEST, { signal: new AbortController().signal, onEvent: (e) => events.push(e) });
    expect(out).toMatchObject({ kind: "error", code: "TIMEOUT", message: "Tempo scaduto" });
    expect(events.map((e) => e.type)).toEqual(["start", "delta"]);
  });

  it("a close without done or error is an interrupted answer", async () => {
    stubFetch(ndjsonResponse(ndjson(withSeq([startEvent(), { type: "delta", text: "Sono" }]))));
    const out = await askAssistant(REQUEST, { signal: new AbortController().signal, onEvent: () => undefined });
    expect(out).toEqual({ kind: "interrupted" });
  });

  it("a broken line is an interrupted answer, not a crash", async () => {
    stubFetch(ndjsonResponse(ndjson(withSeq([startEvent()])) + "{broken\n"));
    const out = await askAssistant(REQUEST, { signal: new AbortController().signal, onEvent: () => undefined });
    expect(out).toEqual({ kind: "interrupted" });
  });

  it("repeated seq and unknown shapes are ignored; nothing after the terminal event", async () => {
    const [start, delta] = withSeq([startEvent(), { type: "delta", text: "uno" }]);
    const text = ndjson([start, delta, delta]) + '{"hello":1}\n' + JSON.stringify({ ...doneEvent(), seq: 3 }) + "\n" + JSON.stringify({ type: "delta", text: "dopo", seq: 4 }) + "\n";
    stubFetch(ndjsonResponse(text));
    const events: AssistantEvent[] = [];
    const out = await askAssistant(REQUEST, { signal: new AbortController().signal, onEvent: (e) => events.push(e) });
    expect(out.kind).toBe("done");
    expect(events.map((e) => e.type)).toEqual(["start", "delta"]);
  });

  it("Interrompi aborts the request for real: the fetch signal is aborted and the outcome is aborted", async () => {
    const s = controlledStream();
    const fetchMock = vi.fn(fetchStream(s));
    vi.stubGlobal("fetch", fetchMock);
    const ctrl = new AbortController();
    const events: AssistantEvent[] = [];
    const pending = askAssistant(REQUEST, {
      signal: ctrl.signal,
      onEvent: (e) => {
        events.push(e);
        if (e.type === "delta") ctrl.abort();
      },
    });
    s.push(startEvent(), { type: "delta", text: "Sono 7" }, { type: "delta", text: "mai letto" });
    expect(await pending).toEqual({ kind: "aborted" });
    expect(events.map((e) => e.type)).toEqual(["start", "delta"]);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it("an already aborted signal sends nothing", async () => {
    const fetchMock = stubFetch();
    const ctrl = new AbortController();
    ctrl.abort();
    expect(await askAssistant(REQUEST, { signal: ctrl.signal, onEvent: () => undefined })).toEqual({ kind: "aborted" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("errors before the stream keep code, retry and reset; status alone gives a code", async () => {
    stubFetch(
      errorResponse(429, { error: "Limite", code: "QUOTA_USER_DAY", resetAt: "2026-10-10T00:00:00+02:00" }),
      errorResponse(409, { error: "Scaduta", code: "CONVERSATION_EXPIRED" }),
      new Response("<html>", { status: 503 }),
      new Response("<html>", { status: 502 })
    );
    const signal = new AbortController().signal;
    const onEvent = () => undefined;
    expect(await askAssistant(REQUEST, { signal, onEvent })).toEqual({
      kind: "error",
      code: "QUOTA_USER_DAY",
      message: "Limite",
      resetAt: "2026-10-10T00:00:00+02:00",
      retryAfterSeconds: undefined,
      status: 429,
    });
    expect(await askAssistant(REQUEST, { signal, onEvent })).toMatchObject({ code: "CONVERSATION_EXPIRED", status: 409 });
    expect(await askAssistant(REQUEST, { signal, onEvent })).toMatchObject({ code: "UNAVAILABLE", status: 503 });
    expect(await askAssistant(REQUEST, { signal, onEvent })).toMatchObject({ code: "INTERNAL", status: 502 });
  });

  it("a 403 CAMBIO_PASSWORD (D-173) sends to the password change", async () => {
    const assign = vi.spyOn(browserNav, "assign").mockImplementation(() => undefined);
    stubFetch(errorResponse(403, { error: "Cambia la password prima di continuare", code: "CAMBIO_PASSWORD" }));
    expect(await askAssistant(REQUEST, { signal: new AbortController().signal, onEvent: () => undefined })).toMatchObject({ kind: "error", code: "AUTH_CHANGED", status: 403 });
    expect(assign).toHaveBeenCalledWith("/change-password");
    assign.mockRestore();
  });

  it("a network failure is NETWORK, and there is no implicit retry", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await askAssistant(REQUEST, { signal: new AbortController().signal, onEvent: () => undefined })).toEqual({ kind: "error", code: "NETWORK" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a 200 that is not NDJSON (login page) is not read as an answer", async () => {
    stubFetch(new Response("<html>login</html>", { status: 200, headers: { "Content-Type": "text/html" } }));
    expect(await askAssistant(REQUEST, { signal: new AbortController().signal, onEvent: () => undefined })).toMatchObject({ kind: "error", code: "INTERNAL" });
  });

  it("a stream silent for longer than the watchdog is given up as interrupted", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const s = controlledStream();
    const fetchMock = vi.fn(fetchStream(s));
    vi.stubGlobal("fetch", fetchMock);
    const pending = askAssistant(REQUEST, { signal: new AbortController().signal, onEvent: () => undefined });
    s.push(startEvent());
    await vi.advanceTimersByTimeAsync(STALL_MS - 1000);
    s.push({ type: "heartbeat" });
    await vi.advanceTimersByTimeAsync(STALL_MS - 1000);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(await pending).toEqual({ kind: "interrupted" });
  });
});

describe("newRequestId", () => {
  it("is a v4 UUID, also without crypto.randomUUID", () => {
    const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(newRequestId()).toMatch(re);
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
    try {
      expect(newRequestId()).toMatch(re);
    } finally {
      Object.defineProperty(crypto, "randomUUID", { value: original, configurable: true });
    }
  });
});
