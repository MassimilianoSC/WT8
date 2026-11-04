import { handle, json, parseBody } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { reworkRequestSchema } from "@/lib/validators";
import { reworkPractice } from "@/services/practices-v2/commands";
import { storeDeps } from "@/services/users-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/practices/{id}/rework { codiceG7?; operationId? } → PraticaDetailDTO della nuova pratica (D-26).
export const POST = handle(async (req, { params }) => {
  const user = await requireCurrentUser();
  const body = await parseBody(req, reworkRequestSchema);
  return json(await reworkPractice(await storeDeps(), user, params.id, body));
});
