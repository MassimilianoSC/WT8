import { handle, json, parseBody } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { changeStatoRequestSchema } from "@/lib/validators";
import { changeStato } from "@/services/practices-v2/commands";
import { storeDeps } from "@/services/users-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/practices/{id}/stato { stato; revision; operationId? } → PraticaDetailDTO (D-23, D-95).
export const POST = handle(async (req, { params }) => {
  const user = await requireCurrentUser();
  const body = await parseBody(req, changeStatoRequestSchema);
  return json(await changeStato(await storeDeps(), user, params.id, body));
});
