import { handle, json, parseBody } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { restoreRequestSchema } from "@/lib/validators";
import { restorePractice } from "@/services/practices-v2/commands";
import { storeDeps } from "@/services/users-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/practices/{id}/restore { revision; operationId? } → PraticaDetailDTO (D-23).
export const POST = handle(async (req, { params }) => {
  const user = await requireCurrentUser();
  const body = await parseBody(req, restoreRequestSchema);
  return json(await restorePractice(await storeDeps(), user, params.id, body));
});
