import { handle, json, parseBody } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { resubmitRequestSchema } from "@/lib/validators";
import { resubmitPractice } from "@/services/practices-v2/commands";
import { storeDeps } from "@/services/users-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/practices/{id}/resubmit { codiceG7?; revision; operationId? } → PraticaDetailDTO (D-25).
export const POST = handle(async (req, { params }) => {
  const user = await requireCurrentUser();
  const body = await parseBody(req, resubmitRequestSchema);
  return json(await resubmitPractice(await storeDeps(), user, params.id, body));
});
