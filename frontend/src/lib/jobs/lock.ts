/**
 * Lock dei job con lease e fencing token (architettura §6.4, D-90). Un solo proprietario per chiave finché la
 * lease è valida; chi la riprende dopo la scadenza ottiene un token più alto. Ogni commit di un job verifica il
 * proprio token NELLA STESSA transazione (assertFence): un worker che ha perso la lease non può più scrivere.
 */
import { MongoServerError, type ClientSession, type Db, type MongoClient } from "mongodb";
import { store } from "@/lib/store/db";

export interface LockHandle {
  key: string;
  owner: string;
  fencingToken: number;
  leaseUntil: Date;
}

export class LockLostError extends Error {
  constructor(key: string) {
    super(`Lock ${key} perso: un altro worker ha ripreso il lavoro`);
    this.name = "LockLostError";
  }
}

/** Prende il lock se libero, scaduto o già nostro; null se lo tiene un altro con lease valida. */
export async function acquireLock(db: Db, key: string, owner: string, leaseMs: number, now: Date = new Date()): Promise<LockHandle | null> {
  try {
    const doc = await store.jobLocks(db).findOneAndUpdate(
      { _id: key, $or: [{ leaseUntil: { $lt: now } }, { owner }] },
      { $set: { owner, leaseUntil: new Date(now.getTime() + leaseMs) }, $inc: { fencingToken: 1 } },
      { upsert: true, returnDocument: "after" }
    );
    return doc ? { key, owner, fencingToken: doc.fencingToken, leaseUntil: doc.leaseUntil } : null;
  } catch (e) {
    // Il documento esiste ed è di un altro con lease valida: l'upsert prova a inserirlo e trova la chiave.
    if (e instanceof MongoServerError && e.code === 11000) return null;
    throw e;
  }
}

/** Rinnova la lease (heartbeat) senza cambiare token; false se il lock non è più nostro. */
export async function renewLock(db: Db, h: LockHandle, leaseMs: number, now: Date = new Date()): Promise<boolean> {
  const leaseUntil = new Date(now.getTime() + leaseMs);
  const r = await store.jobLocks(db).updateOne(
    { _id: h.key, owner: h.owner, fencingToken: h.fencingToken, leaseUntil: { $gte: now } },
    { $set: { leaseUntil } }
  );
  // matchedCount, non modifiedCount: una lease rinnovata allo stesso istante resta valida anche se il valore non cambia.
  if (r.matchedCount === 1) h.leaseUntil = leaseUntil;
  return r.matchedCount === 1;
}

/** Rilascia subito il lock (lease scaduta), se è ancora nostro. */
export async function releaseLock(db: Db, h: LockHandle): Promise<void> {
  await store.jobLocks(db).updateOne({ _id: h.key, owner: h.owner, fencingToken: h.fencingToken }, { $set: { leaseUntil: new Date(0) } });
}

/**
 * D-137 A-06: `now` deve essere l'ora CORRENTE del tentativo (mai l'ora funzionale congelata dell'operazione): una
 * lease scaduta non autorizza la scrittura anche se nessuno l'ha ancora ripresa.
 * Da chiamare dentro la transazione del commit: SCRIVE sul documento del lock (non si limita a leggerlo), così
 * una ripresa concorrente da parte di un altro worker entra in conflitto con questa transazione invece di
 * passare entrambe. LockLostError se il token non è più quello corrente o la lease è scaduta.
 */
export async function assertFence(ctx: { db: Db; session: ClientSession }, h: LockHandle, now: Date = new Date()): Promise<void> {
  const r = await store.jobLocks(ctx.db).updateOne(
    { _id: h.key, owner: h.owner, fencingToken: h.fencingToken, leaseUntil: { $gte: now } },
    { $set: { lastFenceAt: now } },
    { session: ctx.session }
  );
  if (r.matchedCount !== 1) throw new LockLostError(h.key);
}

/**
 * Transazione breve protetta dal fencing (D-137 A-08): assertFence con l'ora corrente a ogni tentativo, poi fn nella
 * stessa sessione. Per le scritture di servizio del job (esecuzione, cursore, esito) che non hanno una ricevuta.
 */
export async function withFence<T>(
  job: { client: MongoClient; db: Db; lock: LockHandle; clock: () => Date },
  fn: (session: ClientSession) => Promise<T>
): Promise<T> {
  const session = job.client.startSession();
  try {
    let result!: T;
    await session.withTransaction(
      async () => {
        await assertFence({ db: job.db, session }, job.lock, job.clock());
        result = await fn(session);
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } }
    );
    return result;
  } finally {
    await session.endSession();
  }
}
