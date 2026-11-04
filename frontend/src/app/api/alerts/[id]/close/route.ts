import { handle, json, parseBody } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { alertCloseRequestSchema } from "@/lib/validators";
import { closeAlert } from "@/services/alerts";
import { storeDeps } from "@/services/users-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/alerts/{id}/close { operationId? } → AlertDTO; idempotente (contratto §8, D-46).
export const POST = handle(async (req, { params }) => {
  const user = await requireCurrentUser();
  const body = await parseBody(req, alertCloseRequestSchema);
  return json(await closeAlert(await storeDeps(), user, params.id, body.operationId));
});
