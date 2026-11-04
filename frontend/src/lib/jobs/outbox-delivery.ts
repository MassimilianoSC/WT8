/**
 * Recapito delle mail dell'outbox (D-90, D-137; architettura §6.5). I comandi scrivono le intenzioni nella loro
 * transazione; qui un worker le prende in carico una alla volta e le invia. Nessuna mail parte da dentro una
 * transazione.
 *
 * Stati: PENDING → CLAIMED → SENDING → SENT.
 * - CLAIMED: presa in carico con lease e claimToken (claimNext). Una lease scaduta si riprende da un altro worker.
 * - SENDING = CONFINE DI EMISSIONE (D-137 A-04, A-07): si entra con una transazione che ricontrolla, subito prima
 *   dell'invio, titolarità del claim e lease (ora corrente), stato della mail, destinatario attivo e — per gli alert —
 *   alert ancora aperto e attivo. Chiusura, sospensione e sostituzione annullano nella loro transazione le mail non
 *   ancora SENDING (lib/store/outbox.ts): il conflitto di scrittura sullo stesso documento serializza le due cose.
 *   Dopo SENDING la mail non si ritira: se il worker muore dopo che SMTP l'ha accettata, alla scadenza della lease si
 *   ritenta con lo stesso Message-ID (doppione raro accettato, D-90).
 * - Mail degli alert solo nei giorni lavorativi dalle 09:00 di Roma, anche nei ritentativi (D-137 A-12): fuori orario
 *   la mail torna PENDING al primo istante utile (DEFERRED), non fallisce.
 * - Errori temporanei: si ritenta senza limite di numero, attesa crescente fino a un'ora, finché la mail è dovuta (per
 *   gli alert il controllo si rifà a ogni tentativo); dopo un'ora di errori, avviso in-app a tutti gli ADMIN attivi
 *   (D-137 A-05, D-139). Errori permanenti (risposta SMTP 5xx, destinatario rifiutato) → FAILED con avviso; si
 *   rimettono in coda solo con `yarn outbox:requeue`.
 * - Ogni passaggio lascia un evento in delivery_events, solo in aggiunta, senza contenuti della mail (D-137 A-14).
 */
import { randomUUID } from "node:crypto";
import { ObjectId, type ClientSession, type Db, type MongoClient } from "mongodb";
import { alertMailSlotFrom, formatRomeTimestamp } from "@/lib/calendario";
import { store } from "@/lib/store/db";
import type { DeliveryEventDoc, DeliveryOutboxDoc, NotificationDoc } from "@/lib/store/types";

export interface OutgoingMail {
  to: string;
  subject: string;
  html: string;
  actionLink?: string;
  messageId: string;
}
export type MailSender = (mail: OutgoingMail) => Promise<void>;

export interface DeliveryDeps {
  client: MongoClient;
  db: Db;
}

export interface DeliveryOptions {
  /** Identità del worker (per diagnostica). */
  owner: string;
  now?: () => Date;
  /** Durata della presa in carico: oltre, un altro worker può riprendere il messaggio. */
  leaseMs?: number;
  /** Massimo di messaggi per giro. */
  batchSize?: number;
  /** Attesa prima del tentativo successivo, dato il numero di tentativi già fatti. */
  backoffMs?: (attempts: number) => number;
  /** Controllo aggiuntivo DENTRO la transazione del passaggio a SENDING (es. alert aperto e attivo): motivo per non inviare, o null. */
  authorize?: (item: DeliveryOutboxDoc, session: ClientSession) => Promise<string | null>;
  /** Dopo quanto tempo di errori continui si avvisano gli ADMIN (default un'ora). */
  warnAfterMs?: number;
}

export const DEFAULT_LEASE_MS = 5 * 60_000;
export const MAX_BACKOFF_MS = 3_600_000;
export const DEFAULT_WARN_AFTER_MS = 3_600_000;
/** 1, 2, 4, 8… minuti, al massimo un'ora (D-137 A-05). */
export const defaultBackoffMs = (attempts: number) => Math.min(60_000 * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);

export interface DeliveryReport {
  sent: number;
  retried: number;
  failed: number;
  cancelled: number;
  /** Fuori dall'orario delle mail degli alert: rinviate al primo istante utile. */
  deferred: number;
  /** Claim superato da un altro worker: nessun invio. */
  lost: number;
  /** Avvisi agli ADMIN (errori da oltre un'ora o errori permanenti). */
  warned: number;
}

export const messageIdOf = (item: Pick<DeliveryOutboxDoc, "_id">) => `<outbox-${item._id.toHexString()}@practicehub>`;

/**
 * Prende in carico il prossimo messaggio dovuto, o uno con la lease scaduta; null se non ce ne sono. Una mail ripresa
 * in SENDING (worker morto dopo il confine di emissione) resta SENDING: si rimanda senza nuovi controlli.
 */
export async function claimNext(db: Db, now: Date, leaseMs = DEFAULT_LEASE_MS): Promise<DeliveryOutboxDoc | null> {
  return store.outbox(db).findOneAndUpdate(
    {
      $or: [
        { status: "PENDING", nextAttemptAt: { $lte: now } },
        { status: { $in: ["CLAIMED", "SENDING"] }, leaseUntil: { $lt: now } },
      ],
    },
    [
      {
        $set: {
          status: { $cond: [{ $eq: ["$status", "SENDING"] }, "SENDING", "CLAIMED"] },
          claimToken: randomUUID(),
          leaseUntil: new Date(now.getTime() + leaseMs),
          // Ripresa dopo il confine di emissione: è un nuovo tentativo di invio.
          attempts: { $cond: [{ $eq: ["$status", "SENDING"] }, { $add: ["$attempts", 1] }, "$attempts"] },
        },
      },
    ],
    { sort: { nextAttemptAt: 1, _id: 1 }, returnDocument: "after" }
  );
}

const reasonOf = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).slice(0, 500);

/** Errore permanente: risposta SMTP 5xx o destinatario rifiutato. Tutto il resto (rete, 4xx, timeout) è temporaneo. */
export function isPermanentSmtpError(e: unknown): boolean {
  const x = e as { responseCode?: number; code?: string } | null;
  if (x && typeof x.responseCode === "number") return x.responseCode >= 500 && x.responseCode < 600;
  return x?.code === "EENVELOPE";
}

async function inTransaction<T>(deps: DeliveryDeps, fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = deps.client.startSession();
  try {
    let result!: T;
    await session.withTransaction(
      async () => {
        result = await fn(session);
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } }
    );
    return result;
  } finally {
    await session.endSession();
  }
}

function deliveryEvent(item: DeliveryOutboxDoc, at: Date, outcome: DeliveryEventDoc["outcome"], by: string, reason?: string, attempt = item.attempts): DeliveryEventDoc {
  return {
    _id: new ObjectId(),
    outboxId: item._id,
    eventKey: item.eventKey,
    alertId: item.alertId ?? null,
    userId: item.userId,
    attempt,
    at,
    outcome,
    by,
    ...(reason ? { reason: reason.slice(0, 500) } : {}),
  };
}

/** Avviso in-app a tutti gli ADMIN attivi (D-139, fino al monitor esterno di PR-16). Idempotente per eventKey. */
export async function notifyAdmins(db: Db, eventKey: string, title: string, body: string, at: Date, session?: ClientSession): Promise<number> {
  const admins = await store.users(db).find({ isAdmin: true, status: "active" }, { session, projection: { _id: 1 } }).toArray();
  for (const a of admins) {
    const doc: Omit<NotificationDoc, "_id"> & { _id: ObjectId } = { _id: new ObjectId(), userId: a._id, kind: "SYSTEM", eventKey, title, body, link: null, createdAt: at, readAt: null };
    await store.notifications(db).updateOne({ userId: a._id, eventKey }, { $setOnInsert: doc }, { upsert: true, session });
  }
  return admins.length;
}

type Begin = { kind: "send"; item: DeliveryOutboxDoc } | { kind: "lost" } | { kind: "deferred" } | { kind: "cancelled" };

/**
 * Passaggio a SENDING (confine di emissione). Tutto nella stessa transazione: se nel frattempo una chiusura ha annullato
 * la mail o un altro worker l'ha ripresa, il conflitto di scrittura fa ripetere il callback, che vede il nuovo stato.
 */
async function beginSending(deps: DeliveryDeps, claimed: DeliveryOutboxDoc, opts: DeliveryOptions, now: () => Date): Promise<Begin> {
  const leaseMs = opts.leaseMs ?? DEFAULT_LEASE_MS;
  return inTransaction(deps, async (session) => {
    const outbox = store.outbox(deps.db);
    const t = now();
    const cur = await outbox.findOne({ _id: claimed._id }, { session });
    if (!cur || cur.status !== "CLAIMED" || cur.claimToken !== claimed.claimToken || !cur.leaseUntil || cur.leaseUntil.getTime() < t.getTime()) {
      await store.deliveryEvents(deps.db).insertOne(deliveryEvent(claimed, t, "LOST", opts.owner, `presa in carico superata (stato ${cur?.status ?? "assente"})`), { session });
      return { kind: "lost" };
    }
    if (cur.businessHoursOnly) {
      const slot = alertMailSlotFrom(t);
      if (slot.getTime() > t.getTime()) {
        await outbox.updateOne({ _id: cur._id }, { $set: { status: "PENDING", nextAttemptAt: slot, claimToken: null, leaseUntil: null } }, { session });
        await store.deliveryEvents(deps.db).insertOne(deliveryEvent(cur, t, "DEFERRED", opts.owner, `fuori orario: rinviata a ${slot.toISOString()}`), { session });
        return { kind: "deferred" };
      }
    }
    const recipient = await store.users(deps.db).findOne({ _id: cur.userId }, { session, projection: { status: 1 } });
    const blocked = !recipient || recipient.status === "deactivated" ? "Destinatario non più attivo: mail non inviata" : (await opts.authorize?.(cur, session)) ?? null;
    if (blocked) {
      await outbox.updateOne({ _id: cur._id }, { $set: { status: "CANCELLED", lastError: blocked, claimToken: null, leaseUntil: null } }, { session });
      await store.deliveryEvents(deps.db).insertOne(deliveryEvent(cur, t, "CANCELLED", opts.owner, blocked), { session });
      return { kind: "cancelled" };
    }
    const sending: DeliveryOutboxDoc = { ...cur, status: "SENDING", sendingAt: t, leaseUntil: new Date(t.getTime() + leaseMs), attempts: cur.attempts + 1 };
    await outbox.updateOne({ _id: cur._id }, { $set: { status: "SENDING", sendingAt: t, leaseUntil: sending.leaseUntil }, $inc: { attempts: 1 } }, { session });
    await store.deliveryEvents(deps.db).insertOne(deliveryEvent(sending, t, "SENDING", opts.owner), { session });
    return { kind: "send", item: sending };
  });
}

/** Invia un messaggio già preso in carico e ne registra l'esito. */
export async function deliverOne(deps: DeliveryDeps, claimed: DeliveryOutboxDoc, send: MailSender, opts: DeliveryOptions): Promise<keyof DeliveryReport> {
  const now = opts.now ?? (() => new Date());
  let item = claimed;
  if (claimed.status === "SENDING") {
    // Ripresa dopo il confine di emissione (worker morto durante l'invio): si rimanda, stesso Message-ID.
    await store.deliveryEvents(deps.db).insertOne(deliveryEvent(claimed, now(), "SENDING", opts.owner, "ripresa dopo un'interruzione: possibile doppione (D-90)"));
  } else {
    const begin = await beginSending(deps, claimed, opts, now);
    if (begin.kind !== "send") return begin.kind;
    item = begin.item;
  }

  try {
    await send({ ...item.payload, messageId: messageIdOf(item) });
  } catch (e) {
    return settleError(deps, item, e, opts, now);
  }
  // Solo se il claim è ancora nostro; altrimenti l'esito lo registra chi l'ha ripreso (stesso Message-ID).
  await inTransaction(deps, async (session) => {
    const t = now();
    const r = await store.outbox(deps.db).updateOne(
      { _id: item._id, claimToken: item.claimToken },
      { $set: { status: "SENT", sentAt: t, lastError: null, claimToken: null, leaseUntil: null } },
      { session }
    );
    await store.deliveryEvents(deps.db).insertOne(deliveryEvent(item, t, "SENT", opts.owner, r.matchedCount ? undefined : "esito registrato da un altro worker"), { session });
  });
  return "sent";
}

async function settleError(deps: DeliveryDeps, item: DeliveryOutboxDoc, e: unknown, opts: DeliveryOptions, now: () => Date): Promise<keyof DeliveryReport> {
  const reason = reasonOf(e);
  const permanent = isPermanentSmtpError(e);
  let warned = false;
  await inTransaction(deps, async (session) => {
    const t = now();
    const outbox = store.outbox(deps.db);
    const mine = { _id: item._id, claimToken: item.claimToken };
    if (permanent) {
      const r = await outbox.updateOne(mine, { $set: { status: "FAILED", lastError: reason, claimToken: null, leaseUntil: null } }, { session });
      if (!r.matchedCount) return;
      await store.deliveryEvents(deps.db).insertOne(deliveryEvent(item, t, "FAILED", opts.owner, reason), { session });
      await notifyAdmins(
        deps.db,
        `delivery-failed:${item._id.toHexString()}`,
        "Mail non recapitabile",
        `Il server di posta ha rifiutato in modo definitivo una mail (${item.eventKey}). Verifica il destinatario, poi rimettila in coda con "yarn outbox:requeue".`,
        t,
        session
      );
      warned = true;
      return;
    }
    const firstErrorAt = item.firstErrorAt ?? t;
    const wait = (opts.backoffMs ?? defaultBackoffMs)(item.attempts);
    const next = new Date(t.getTime() + wait);
    const set: Partial<DeliveryOutboxDoc> = {
      status: "PENDING",
      lastError: reason,
      nextAttemptAt: item.businessHoursOnly ? alertMailSlotFrom(next) : next,
      claimToken: null,
      leaseUntil: null,
      firstErrorAt,
    };
    // Avviso dopo un'ora di errori continui: uno per ora (chiave stabile), non a ogni tentativo (D-139).
    if (!item.warnedAt && t.getTime() - firstErrorAt.getTime() >= (opts.warnAfterMs ?? DEFAULT_WARN_AFTER_MS)) {
      set.warnedAt = t;
      warned = true;
    }
    const r = await outbox.updateOne(mine, { $set: set }, { session });
    if (!r.matchedCount) {
      warned = false;
      return;
    }
    await store.deliveryEvents(deps.db).insertOne(deliveryEvent(item, t, "RETRY", opts.owner, reason), { session });
    if (warned) {
      const hour = formatRomeTimestamp(t).slice(0, 13); // "2026-10-08T09": un avviso per ora di Roma
      await notifyAdmins(
        deps.db,
        `delivery-failing:${hour}`,
        "Mail in ritardo: server di posta non raggiungibile",
        `Da oltre un'ora l'invio delle mail non riesce (ultimo errore: ${reason}). Le mail restano in coda e partiranno appena il server di posta risponde.`,
        t,
        session
      );
    }
  });
  if (permanent) return "failed";
  return warned ? "warned" : "retried";
}

/** Un giro: prende e invia fino a batchSize messaggi dovuti. */
export async function deliverBatch(deps: DeliveryDeps, send: MailSender, opts: DeliveryOptions): Promise<DeliveryReport> {
  const now = opts.now ?? (() => new Date());
  const report: DeliveryReport = { sent: 0, retried: 0, failed: 0, cancelled: 0, deferred: 0, lost: 0, warned: 0 };
  for (let i = 0; i < (opts.batchSize ?? 50); i++) {
    const item = await claimNext(deps.db, now(), opts.leaseMs);
    if (!item) break;
    const outcome = await deliverOne(deps, item, send, opts);
    // Un avviso è comunque un ritentativo (o un fallimento già contato): si contano entrambi.
    if (outcome === "warned") report.retried++;
    if (outcome === "failed") report.warned++;
    report[outcome]++;
  }
  return report;
}
