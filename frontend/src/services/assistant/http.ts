/**
 * Risposte HTTP delle rotte dell'assistente (contratto §13, §13.4): sempre "Cache-Control: no-store"; errori prima
 * dello stream come { error, code, requestId?, retryAfterSeconds?, resetAt? } con lo status del contratto e
 * Retry-After quando c'è un'attesa. Un 401 senza codice è UNAUTHENTICATED; il 403 CAMBIO_PASSWORD (D-173) resta tale.
 */
import { NextResponse } from "next/server";
import type { AssistantErrorCode } from "@/lib/contract";
import { HttpError } from "@/lib/http-error";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function assistantJson(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

const DEFAULT_CODE: Record<number, AssistantErrorCode> = {
  400: "INVALID_REQUEST",
  401: "UNAUTHENTICATED",
  403: "NOT_ENABLED",
  404: "NOT_FOUND",
  413: "BODY_TOO_LARGE",
  422: "INVALID_REQUEST",
  429: "BUSY",
  503: "UNAVAILABLE",
  504: "TIMEOUT",
};

export function assistantErrorResponse(e: unknown, requestId?: string): NextResponse {
  if (!(e instanceof HttpError)) {
    console.error(`[assistente] errore interno della rotta (${(e as Error)?.name ?? "errore"})`);
    return NextResponse.json({ error: "Errore interno dell'assistente", code: "INTERNAL", ...(requestId ? { requestId } : {}) }, { status: 500, headers: NO_STORE });
  }
  const extra = e.extra ?? {};
  const code = (extra.code as string | undefined) ?? DEFAULT_CODE[e.status] ?? "INTERNAL";
  const retry = typeof extra.retryAfterSeconds === "number" ? extra.retryAfterSeconds : undefined;
  return NextResponse.json(
    { ...extra, error: e.message, code, ...(requestId ? { requestId } : {}) },
    { status: e.status, headers: { ...NO_STORE, ...(retry ? { "Retry-After": String(retry) } : {}) } }
  );
}

/** Origine pubblica configurata (PH_PUBLIC_URL tramite APP_BASE_URL / AUTH_URL), oppure null se assente. */
export function allowedOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.APP_BASE_URL || env.AUTH_URL || env.NEXTAUTH_URL;
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export const MAX_BODY_BYTES = 16 * 1024;

/** Corpo come testo, rifiutando (413) oltre MAX_BODY_BYTES PRIMA di deserializzare. */
export async function readLimitedBody(req: Request): Promise<string> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new HttpError("Domanda troppo lunga", 413, { code: "BODY_TOO_LARGE" });
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new HttpError("Domanda troppo lunga", 413, { code: "BODY_TOO_LARGE" });
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(all);
  } catch {
    throw new HttpError("Corpo non in UTF-8", 422, { code: "INVALID_REQUEST" });
  }
}
