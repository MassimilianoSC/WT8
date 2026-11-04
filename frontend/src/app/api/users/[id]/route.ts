import { handle, json, parseBody } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { userUpdateRequestSchema } from "@/lib/validators";
import { storeDeps, updateUser } from "@/services/users-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/users/{id} (ADMIN) → UserDTO. memberships sostituisce l'elenco intero (§4).
export const PATCH = handle(async (req, { params }) => {
  const user = await requireCurrentUser();
  const body = await parseBody(req, userUpdateRequestSchema);
  return json(await updateUser(await storeDeps(), user, params.id, body));
});
