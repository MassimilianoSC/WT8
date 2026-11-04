import { handle, json, parseBody } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { assignRequestSchema } from "@/lib/validators";
import { assignPractice } from "@/services/practices-v2/commands";
import { storeDeps } from "@/services/users-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/practices/{id}/assign { groups; note?; revision; operationId? } → PraticaDetailDTO (D-21).
export const POST = handle(async (req, { params }) => {
  const user = await requireCurrentUser();
  const body = await parseBody(req, assignRequestSchema);
  return json(await assignPractice(await storeDeps(), user, params.id, body));
});
