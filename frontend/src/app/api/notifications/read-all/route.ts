import { handle, json } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { getStoreDb } from "@/lib/store/db";
import { markAllNotificationsRead } from "@/services/notifications-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/notifications/read-all (senza corpo) → NotificationListResponse con unread = 0 (contratto §8).
export const POST = handle(async () => {
  const user = await requireCurrentUser();
  return json(await markAllNotificationsRead(await getStoreDb(), user));
});
