/**
 * Esecuzioni giornaliere dei job (job_runs, architettura §6.4): una per (jobKey, giorno di Roma). RUNNING non
 * significa "già fatto": dopo un crash un altro worker la riprende dal cursore. DONE non si ripete.
 *
 * D-137 A-08: ogni scrittura (avvio o ripresa, cursore, esito) avviene in una transazione con assertFence all'ora
 * corrente e porta il fencing token del titolare: un worker che ha perso la lease non sposta il cursore e non decide
 * l'esito. Il cursore va solo in avanti; DONE solo da RUNNING; FAILED mai sopra DONE.
 */
import { MongoServerError, ObjectId, type ClientSession, type Db, type MongoClient } from "mongodb";
import { LockLostError, withFence, type LockHandle } from "@/lib/jobs/lock";
import { store } from "@/lib/store/db";
import type { JobRunDoc } from "@/lib/store/types";

/** Il job e il lock che lo autorizza; clock = ora corrente (iniettabile nelle prove). */
export interface FencedJob {
  client: MongoClient;
  db: Db;
  lock: LockHandle;
  clock: () => Date;
}

export interface RunCursor {
  /** Ultimo _id (esadecimale) trattato: si riparte dal successivo. */
  after: string;
}

/** Avvia o riprende l'esecuzione del giorno a nome del titolare del lock; null se è già DONE. */
export async function startRun(job: FencedJob, jobKey: string, localDate: string): Promise<JobRunDoc | null> {
  try {
    return await withFence(job, (session) =>
      store.jobRuns(job.db).findOneAndUpdate(
        { jobKey, localDate, status: { $ne: "DONE" } },
        {
          $setOnInsert: { _id: new ObjectId(), jobKey, localDate, cursor: null, startedAt: job.clock() },
          $set: { status: "RUNNING", endedAt: null, error: null, fencingToken: job.lock.fencingToken },
          $inc: { attempts: 1 },
        },
        { upsert: true, returnDocument: "after", session }
      )
    );
  } catch (e) {
    // Esiste già ed è DONE: l'upsert prova a inserirne un secondo e trova l'indice unico (jobKey, localDate).
    if (e instanceof MongoServerError && e.code === 11000) return null;
    throw e;
  }
}

const mine = (job: FencedJob, run: Pick<JobRunDoc, "_id">) => ({ _id: run._id, fencingToken: job.lock.fencingToken });

async function update(job: FencedJob, filter: object, set: Partial<JobRunDoc>, session: ClientSession): Promise<boolean> {
  const r = await store.jobRuns(job.db).updateOne(filter, { $set: set }, { session });
  return r.matchedCount === 1;
}

/** Salva il punto raggiunto (per riprendere dopo un crash): solo in avanti, solo dal titolare. */
export async function saveCursor(job: FencedJob, run: Pick<JobRunDoc, "_id">, cursor: RunCursor): Promise<void> {
  const ok = await withFence(job, (session) =>
    update(job, { ...mine(job, run), status: "RUNNING", $or: [{ cursor: null }, { "cursor.after": { $lt: cursor.after } }] }, { cursor }, session)
  );
  if (!ok) {
    const cur = await store.jobRuns(job.db).findOne({ _id: run._id });
    // Stesso cursore già salvato (ritentativo): va bene; altrimenti l'esecuzione non è più nostra.
    if ((cur?.cursor as RunCursor | null)?.after !== cursor.after || cur?.fencingToken !== job.lock.fencingToken) throw new LockLostError(job.lock.key);
  }
}

/** DONE: solo da RUNNING e solo dal titolare. */
export async function completeRun(job: FencedJob, run: Pick<JobRunDoc, "_id">): Promise<void> {
  const ok = await withFence(job, (session) => update(job, { ...mine(job, run), status: "RUNNING" }, { status: "DONE", endedAt: job.clock(), error: null }, session));
  if (!ok) throw new LockLostError(job.lock.key);
}

/**
 * Errore: resta riprendibile (FAILED non è DONE), con il cursore salvato. Solo dal titolare e mai sopra DONE; se il lock
 * non è più nostro non si scrive nulla (decide il nuovo titolare). true = registrato.
 */
export async function failRun(job: FencedJob, run: Pick<JobRunDoc, "_id">, error: unknown): Promise<boolean> {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
  try {
    return await withFence(job, (session) => update(job, { ...mine(job, run), status: "RUNNING" }, { status: "FAILED", endedAt: job.clock(), error: message }, session));
  } catch (e) {
    if (e instanceof LockLostError) return false;
    throw e;
  }
}
