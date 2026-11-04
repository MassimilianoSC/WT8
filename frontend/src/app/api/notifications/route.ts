import { handle, json } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { getStoreDb } from "@/lib/store/db";
import { listNotifications, parseNotificationQuery } from "@/services/notifications-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/notifications?unread=&limit= → NotificationListResponse (§8), dalla più recente.
export const GET = handle(async (req) => {
  const user = await requireCurrentUser();
  return json(await listNotifications(await getStoreDb(), user, parseNotificationQuery(new URL(req.url).searchParams)));
});
