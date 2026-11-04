import { handle, json, parseBody } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { listUpdateRequestSchema } from "@/lib/validators";
import { storeDeps } from "@/services/users-v2";
import { updateList } from "@/services/lists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PUT /api/lists/{listId}?templateId= { items; revision } → ListDTO (contratto §6, D-106).
export const PUT = handle(async (req, { params }) => {
  const user = await requireCurrentUser();
  const body = await parseBody(req, listUpdateRequestSchema);
  const templateId = new URL(req.url).searchParams.get("templateId");
  return json(await updateList(await storeDeps(), user, params.listId, templateId, body));
});
