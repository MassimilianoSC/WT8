import { apiFetch } from "@/lib/client";
import type {
  AlertCloseRequest,
  AlertDTO,
  NotificationLinkDTO,
  NotificationListResponse,
  NotificationUpdateRequest,
} from "@/lib/contract";
/** Notifications and alerts (§8). */

/** Path of the sheet for a notification link: practice, iteration, section, field, row. */
export function linkHref(link: NotificationLinkDTO): string {
  const params = new URLSearchParams();
  if (link.iteration) params.set("iterazione", String(link.iteration));
  if (link.sectionKey) params.set("sezione", link.sectionKey);
  if (link.occurrenceKey) params.set("campo", link.occurrenceKey);
  else if (link.flowId) params.set("campo", link.flowId);
  if (link.rowId) params.set("riga", link.rowId);
  if (link.commentId) params.set("commento", link.commentId);
  const qs = params.toString();
  return `/pratiche/${encodeURIComponent(link.practiceId)}${qs ? `?${qs}` : ""}`;
}

export async function loadNotifications(opts: { unread?: boolean; limit?: number } = {}): Promise<NotificationListResponse> {
  // "unread" only when true: the service reads unread:false as "read only".
  const params = new URLSearchParams();
  if (opts.unread) params.set("unread", "true");
  if (opts.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return apiFetch<NotificationListResponse>(`/api/notifications${qs ? `?${qs}` : ""}`);
}

/** Reading a notification does NOT close its alert (§8). */
export async function markRead(id: string): Promise<void> {
  const body: NotificationUpdateRequest = { read: true };
  await apiFetch(`/api/notifications/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
}

export async function markAllRead(): Promise<void> {
  await apiFetch("/api/notifications/read-all", { method: "POST" });
}

/** Manual close (leaders, ADMIN: D-46). Idempotent: an already closed alert comes back unchanged. */
export async function closeAlert(alert: AlertDTO, operationId: string): Promise<AlertDTO> {
  const body: AlertCloseRequest = { operationId };
  return apiFetch<AlertDTO>(`/api/alerts/${encodeURIComponent(alert.id)}/close`, { method: "POST", body: JSON.stringify(body) });
}
