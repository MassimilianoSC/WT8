/**
 * Outbox delle mail (D-90): le intenzioni di invio si scrivono nella stessa transazione del comando,
 * l'invio vero lo farà il worker (B7) con consegna "almeno una volta". Idempotente per
 * (eventKey, userId, channel): un tentativo ripetuto non crea una seconda intenzione.
 *
 * D-137 A-07: chiusura, sospensione e sostituzione di un alert annullano NELLA LORO transazione le mail di quell'alert
 * non ancora in invio (PENDING, CLAIMED). Il passaggio a SENDING del worker scrive lo stesso documento: le due
 * transazioni sono serializzate dal conflitto di scrittura, quindi una chiusura committata prima del confine di
 * emissione impedisce l'invio; una mail già SENDING non si ritira (D-90).
 *
 * Utenti della prova di carico (ops/utenti-prova, testAccount=true): nessuna mail in coda; per sicurezza anche nessuna
 * verso il dominio riservato prova.invalid. Le notifiche nell'app restano (le scrive il chiamante).
 */
import { ObjectId } from "mongodb";
import { alertMailSlotFrom } from "@/lib/calendario";
import { store } from "@/lib/store/db";
import type { OperationContext } from "@/lib/store/transaction";
import type { DeliveryOutboxDoc } from "@/lib/store/types";

export interface DeliveryIntent {
  /** Chiave stabile dell'evento che genera la mail (es. "assign:<practiceId>:<revision>"). */
  eventKey: string;
  userId: ObjectId;
  payload: DeliveryOutboxDoc["payload"];
  /** Mail di un alert: annullabile con l'alert e recapitata solo nei giorni lavorativi dalle 09:00 (D-137 A-12). */
  alertId?: ObjectId;
}

const NO_MAIL_DOMAIN = /@prova\.invalid$/i;

/** Restituisce quante intenzioni sono state create davvero (le altre esistevano già o sono per utenti di prova). */
export async function enqueueDeliveries(ctx: OperationContext, intents: DeliveryIntent[]): Promise<number> {
  if (intents.length === 0) return 0;
  const testUsers = new Set(
    (await store.users(ctx.db).find({ _id: { $in: intents.map((i) => i.userId) }, testAccount: true }, { projection: { _id: 1 }, session: ctx.session }).toArray()).map((u) => u._id.toHexString())
  );
  let created = 0;
  for (const i of intents) {
    if (testUsers.has(i.userId.toHexString()) || NO_MAIL_DOMAIN.test(i.payload.to)) continue;
    const r = await store.outbox(ctx.db).updateOne(
      { eventKey: i.eventKey, userId: i.userId, channel: "EMAIL" },
      {
        $setOnInsert: {
          eventKey: i.eventKey,
          userId: i.userId,
          channel: "EMAIL",
          payload: i.payload,
          status: "PENDING",
          attempts: 0,
          nextAttemptAt: i.alertId ? alertMailSlotFrom(ctx.now) : ctx.now,
          leaseUntil: null,
          claimToken: null,
          lastError: null,
          sentAt: null,
          createdAt: ctx.now,
          alertId: i.alertId ?? null,
          businessHoursOnly: !!i.alertId,
          firstErrorAt: null,
          warnedAt: null,
        },
      },
      { upsert: true, session: ctx.session }
    );
    created += r.upsertedCount;
  }
  return created;
}

/** Annulla le mail non ancora in invio degli alert indicati; restituisce quante. Da chiamare nella transazione del comando. */
export async function cancelAlertDeliveries(ctx: OperationContext, alertIds: ObjectId[], reason: string): Promise<number> {
  if (alertIds.length === 0) return 0;
  const filter = {
    status: { $in: ["PENDING", "CLAIMED"] as DeliveryOutboxDoc["status"][] },
    // Anche le intenzioni scritte prima del campo alertId: chiave "alert:<id>:…".
    $or: [{ alertId: { $in: alertIds } }, ...alertIds.map((id) => ({ eventKey: { $regex: `^alert:${id.toHexString()}:` } }))],
  };
  const docs = await store.outbox(ctx.db).find(filter, { session: ctx.session, projection: { _id: 1, eventKey: 1, userId: 1, attempts: 1, alertId: 1 } }).toArray();
  if (docs.length === 0) return 0;
  await store.outbox(ctx.db).updateMany(
    { _id: { $in: docs.map((d) => d._id) }, status: { $in: ["PENDING", "CLAIMED"] } },
    { $set: { status: "CANCELLED", lastError: reason, claimToken: null, leaseUntil: null } },
    { session: ctx.session }
  );
  await store.deliveryEvents(ctx.db).insertMany(
    docs.map((d) => ({
      _id: new ObjectId(),
      outboxId: d._id,
      eventKey: d.eventKey,
      alertId: d.alertId ?? null,
      userId: d.userId,
      attempt: d.attempts,
      at: ctx.now,
      outcome: "CANCELLED" as const,
      by: `operation:${ctx.operationId}`,
      reason,
    })),
    { session: ctx.session }
  );
  return docs.length;
}
