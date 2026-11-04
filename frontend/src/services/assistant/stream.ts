/**
 * Stream NDJSON della risposta (contratto §13.2): una riga JSON per evento con `\n`, UTF-8, `seq` da 1, heartbeat
 * dopo 5 s senza eventi, un solo evento terminale. La chiusura dal client (Interrompi, pannello chiuso) arriva come
 * annullamento del ReadableStream o del segnale della richiesta e ferma la generazione.
 */
import { streamAnswer, type PreparedQuestion } from "./orchestrator";
import type { AssistantEvent } from "@/lib/contract";

export const HEARTBEAT_MS = 5000;
export const NDJSON_HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-store, no-transform",
  "X-Content-Type-Options": "nosniff",
} as const;

export function ndjsonStream(p: PreparedQuestion, requestSignal?: AbortSignal, heartbeatMs = HEARTBEAT_MS): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const abort = new AbortController();
  const onRequestAbort = () => abort.abort();
  requestSignal?.addEventListener("abort", onRequestAbort);
  let seq = 0;
  let closed = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastEventAt = Date.now();

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let ended = false;
      const write = (e: Omit<AssistantEvent, "seq">) => {
        // Dopo l'evento terminale niente altro, nemmeno heartbeat (il registro può finire di scriversi più tardi).
        if (closed || ended) return;
        lastEventAt = Date.now();
        controller.enqueue(encoder.encode(JSON.stringify({ seq: ++seq, ...e }) + "\n"));
        if (e.type === "done" || e.type === "error") {
          ended = true;
          clearInterval(timer);
        }
      };
      timer = setInterval(() => {
        if (Date.now() - lastEventAt >= heartbeatMs) write({ type: "heartbeat" } as Omit<AssistantEvent, "seq">);
      }, Math.min(1000, heartbeatMs));
      void streamAnswer(p, write as Parameters<typeof streamAnswer>[1], abort.signal).finally(() => {
        clearInterval(timer);
        requestSignal?.removeEventListener("abort", onRequestAbort);
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            /* già chiuso dal client */
          }
        }
      });
    },
    cancel() {
      closed = true;
      clearInterval(timer);
      abort.abort();
    },
  });
}
