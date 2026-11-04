import { requireCurrentUser } from "@/lib/auth-v2";
import { HttpError } from "@/lib/http-error";
import { assistantMessageRequestSchema } from "@/lib/validators";
import { allowedOrigin, assistantErrorResponse, readLimitedBody } from "@/services/assistant/http";
import { prepareQuestion } from "@/services/assistant/orchestrator";
import { NDJSON_HEADERS, ndjsonStream } from "@/services/assistant/stream";
import { storeDeps } from "@/services/users-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/assistant/messages (§13.2): risposta in NDJSON senza compressione. Prima dello stream, nell'ordine:
 * sessione (401; 403 CAMBIO_PASSWORD, D-173), Origin uguale all'origine pubblica (403 ORIGIN_DENIED), corpo JSON di
 * al massimo 16 KiB letto prima del parse (413), schema (422), poi contesto, conversazione e ammissione
 * (404/409/403/503/429). Dopo l'apertura gli errori arrivano come evento e l'HTTP resta 200.
 */
export async function POST(req: Request) {
  let requestId: string | undefined;
  try {
    const user = await requireCurrentUser();
    const origin = req.headers.get("origin");
    const allowed = allowedOrigin();
    if (!origin || !allowed || origin !== allowed) throw new HttpError("Origine della richiesta non consentita", 403, { code: "ORIGIN_DENIED" });
    if (!(req.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) throw new HttpError("Serve un corpo JSON", 422, { code: "INVALID_REQUEST" });
    const raw = await readLimitedBody(req);
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new HttpError("Corpo JSON non valido", 422, { code: "INVALID_REQUEST" });
    }
    const maybeId = (json as { requestId?: unknown } | null)?.requestId;
    if (typeof maybeId === "string" && /^[0-9a-f-]{36}$/i.test(maybeId)) requestId = maybeId;
    const parsed = assistantMessageRequestSchema.safeParse(json);
    if (!parsed.success) throw new HttpError(parsed.error.issues.map((i) => i.message).join(", ").slice(0, 500), 422, { code: "INVALID_REQUEST" });
    const prepared = await prepareQuestion({ deps: await storeDeps(), user, request: parsed.data });
    return new Response(ndjsonStream(prepared, req.signal), { status: 200, headers: NDJSON_HEADERS });
  } catch (e) {
    return assistantErrorResponse(e, requestId);
  }
}
