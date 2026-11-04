import { handle, json, parseBody } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { archiveRequestSchema } from "@/lib/validators";
import { archivePractice } from "@/services/practices-v2/commands";
import { storeDeps } from "@/services/users-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/practices/{id}/archive { revision; operationId? } → PraticaDetailDTO (D-23, D-28).
export const POST = handle(async (req, { params }) => {
  const user = await requireCurrentUser();
  const body = await parseBody(req, archiveRequestSchema);
  return json(await archivePractice(await storeDeps(), user, params.id, body));
});
