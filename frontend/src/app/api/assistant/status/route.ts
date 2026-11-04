import { requireCurrentUser } from "@/lib/auth-v2";
import { getStoreDb } from "@/lib/store/db";
import { assistantErrorResponse, assistantJson } from "@/services/assistant/http";
import { assistantStatus } from "@/services/assistant/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/assistant/status -> AssistantStatusDTO dell'utente in sessione (§13.1). Nessuna inferenza, nessuna scrittura.
export async function GET() {
  try {
    const user = await requireCurrentUser();
    return assistantJson(await assistantStatus(await getStoreDb(), user, new Date(), undefined, { always: true }));
  } catch (e) {
    return assistantErrorResponse(e);
  }
}
