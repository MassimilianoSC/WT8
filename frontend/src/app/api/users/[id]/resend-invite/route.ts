import { handle, json } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { resendInvite, storeDeps } from "@/services/users-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/users/{id}/resend-invite (ADMIN) → UserDTO: solo utenti "invited" (altrimenti 409); annulla il token
// precedente e rimanda la mail d'invito (§4, v0.1.11, D-108).
export const POST = handle(async (_req, { params }) => {
  const user = await requireCurrentUser();
  return json(await resendInvite(await storeDeps(), user, params.id));
});
