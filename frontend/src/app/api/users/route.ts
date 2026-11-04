import { handle, HttpError, json, parseBody } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { getStoreDb } from "@/lib/store/db";
import { userInviteRequestSchema } from "@/lib/validators";
import { inviteUser, listUsers, storeDeps } from "@/services/users-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/users (ADMIN) → UserListResponse (§4).
export const GET = handle(async () => {
  const user = await requireCurrentUser();
  if (!user.isAdmin) throw new HttpError("Solo l'ADMIN gestisce gli utenti", 403);
  return json(await listUsers(await getStoreDb()));
});

// POST /api/users (ADMIN, invito) → UserDTO (201). Almeno un'appartenenza se isAdmin è falso.
export const POST = handle(async (req) => {
  const user = await requireCurrentUser();
  const body = await parseBody(req, userInviteRequestSchema);
  return json(await inviteUser(await storeDeps(), user, body), 201);
});
