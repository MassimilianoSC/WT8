import { handle, json, parseBody } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { getStoreDb } from "@/lib/store/db";
import { notificationUpdateRequestSchema } from "@/lib/validators";
import { markNotificationRead } from "@/services/notifications-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/notifications/{id} { read: true } → NotificationDTO (404 se non è dell'utente) (§8).
export const PATCH = handle(async (req, { params }) => {
  const user = await requireCurrentUser();
  await parseBody(req, notificationUpdateRequestSchema);
  return json(await markNotificationRead(await getStoreDb(), user, params.id));
});
