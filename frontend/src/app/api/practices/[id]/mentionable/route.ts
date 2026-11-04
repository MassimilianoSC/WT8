import { handle, json } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { getStoreDb } from "@/lib/store/db";
import { mentionable } from "@/services/comments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/practices/{id}/mentionable → MentionableDTO (§14): candidati per il menu "@", senza email.
export const GET = handle(async (_req, { params }) => {
  const user = await requireCurrentUser();
  return json(await mentionable(await getStoreDb(), user, params.id));
});
