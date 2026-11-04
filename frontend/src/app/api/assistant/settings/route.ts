import { requireCurrentUser } from "@/lib/auth-v2";
import { HttpError } from "@/lib/http-error";
import { getStoreDb } from "@/lib/store/db";
import { assistantErrorResponse, assistantJson } from "@/services/assistant/http";
import { getSettings, updateSettings } from "@/services/assistant/settings";
import { storeDeps } from "@/services/users-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/assistant/settings (ADMIN) -> AssistantSettingsDTO (§13.1, D-169, D-171).
export async function GET() {
  try {
    const user = await requireCurrentUser();
    return assistantJson(await getSettings(await getStoreDb(), user));
  } catch (e) {
    return assistantErrorResponse(e);
  }
}

// PUT /api/assistant/settings (ADMIN) { enabled?, dailyLimit?, perMinuteLimit? } -> AssistantSettingsDTO. 422 fuori
// intervallo, 403 non ADMIN; effetto immediato e audit con i valori vecchi e nuovi.
export async function PUT(req: Request) {
  try {
    const user = await requireCurrentUser();
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new HttpError("Corpo JSON non valido", 422, { code: "INVALID_REQUEST" });
    }
    return assistantJson(await updateSettings(await storeDeps(), user, body as never));
  } catch (e) {
    return assistantErrorResponse(e);
  }
}
