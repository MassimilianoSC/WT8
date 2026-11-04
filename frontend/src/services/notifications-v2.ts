/**
 * Notifiche in-app del modello nuovo (contratto §8) sul database _v2. GET /api/notifications e
 * PATCH /api/notifications/{id} sono in collisione con la beta ed entrano al cutover (D-68);
 * POST /api/notifications/read-all è nuova e già pubblicata. Ognuno vede e modifica solo le proprie.
 * Leggere una notifica non chiude l'alert collegato.
 */
import { ObjectId, type Db } from "mongodb";
import type { NotificationDTO, NotificationListResponse, UserDTO } from "@/lib/contract";
import { HttpError } from "@/lib/http-error";
import { store } from "@/lib/store/db";
import type { NotificationDoc } from "@/lib/store/types";

export const NOTIFICATION_LIMIT_DEFAULT = 50;
export const NOTIFICATION_LIMIT_MAX = 200;

export function toNotificationDTO(n: NotificationDoc): NotificationDTO {
  const l = n.link;
  return {
    id: n._id.toHexString(),
    createdAt: n.createdAt.toISOString(),
    read: n.readAt !== null,
    kind: n.kind,
    title: n.title,
    body: n.body,
    link: l
      ? {
          practiceId: l.practiceId.toHexString(),
          ...(l.iteration !== undefined ? { iteration: l.iteration } : {}),
          ...(l.flowId ? { flowId: l.flowId } : {}),
          ...(l.occurrenceKey ? { occurrenceKey: l.occurrenceKey } : {}),
          ...(l.sectionKey ? { sectionKey: l.sectionKey } : {}),
          ...(l.repeat ? { repeat: l.repeat } : {}),
          ...(l.rowId ? { rowId: l.rowId.toHexString() } : {}),
          ...(l.commentId ? { commentId: l.commentId.toHexString() } : {}),
        }
      : null,
  };
}

export interface NotificationQuery {
  unread?: boolean;
  limit?: number;
}

/** ?unread=true|false&limit=1..200 (400 se non validi). */
export function parseNotificationQuery(params: URLSearchParams): NotificationQuery {
  const unread = params.get("unread");
  if (unread !== null && unread !== "" && unread !== "true" && unread !== "false") throw new HttpError("Parametro unread non valido", 400);
  const rawLimit = params.get("limit");
  const limit = rawLimit === null || rawLimit === "" ? undefined : Number(rawLimit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > NOTIFICATION_LIMIT_MAX)) throw new HttpError("Parametro limit non valido", 400);
  return { unread: unread === "true" ? true : unread === "false" ? false : undefined, limit };
}

const me = (user: UserDTO) => new ObjectId(user.id);

/** Le notifiche dell'utente, dalla più recente; `unread` = quante non lette in tutto. */
export async function listNotifications(db: Db, user: UserDTO, q: NotificationQuery = {}): Promise<NotificationListResponse> {
  const userId = me(user);
  const filter = { userId, ...(q.unread === true ? { readAt: null } : q.unread === false ? { readAt: { $ne: null } } : {}) };
  const [docs, unread] = await Promise.all([
    store.notifications(db).find(filter).sort({ createdAt: -1, _id: -1 }).limit(q.limit ?? NOTIFICATION_LIMIT_DEFAULT).toArray(),
    store.notifications(db).countDocuments({ userId, readAt: null }),
  ]);
  return { items: docs.map(toNotificationDTO), unread };
}

/** PATCH { read: true }: idempotente; 404 se la notifica non esiste o non è dell'utente. */
export async function markNotificationRead(db: Db, user: UserDTO, id: string, now: Date = new Date()): Promise<NotificationDTO> {
  if (!/^[0-9a-f]{24}$/i.test(id)) throw new HttpError("Notifica non trovata", 404);
  const _id = new ObjectId(id);
  const userId = me(user);
  await store.notifications(db).updateOne({ _id, userId, readAt: null }, { $set: { readAt: now } });
  const doc = await store.notifications(db).findOne({ _id, userId });
  if (!doc) throw new HttpError("Notifica non trovata", 404);
  return toNotificationDTO(doc);
}

/** POST read-all: segna lette tutte le notifiche dell'utente; restituisce l'elenco aggiornato (unread = 0). */
export async function markAllNotificationsRead(db: Db, user: UserDTO, now: Date = new Date()): Promise<NotificationListResponse> {
  await store.notifications(db).updateMany({ userId: me(user), readAt: null }, { $set: { readAt: now } });
  return listNotifications(db, user);
}
