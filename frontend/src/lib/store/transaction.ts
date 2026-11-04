/**
 * Operazioni atomiche del modello nuovo (D-90): transazione multi-documento su replica set, operationId
 * per rendere innocui i tentativi ripetuti, compare-and-swap della revisione della pratica.
 *
 * Id dell'operazione e orologio si creano FUORI dal callback: il driver può rieseguire il callback dopo un
 * errore transitorio e tutto deve restare uguale. Nel callback niente effetti esterni (mail, HTTP): le mail
 * passano dall'outbox (lib/store/outbox.ts), scritta nella stessa transazione.
 */
import { createHash, randomUUID } from "node:crypto";
import { MongoServerError, ObjectId, type ClientSession, type Db, type MongoClient } from "mongodb";
import { HttpError } from "@/lib/http-error";
import { ensureStoreBootstrapped, store } from "@/lib/store/db";

export interface OperationContext {
  db: Db;
  session: ClientSession;
  operationId: string;
  actorId: string;
  /** Chiave interna dell'operazione per gli effetti con unicità globale (storico, eventi): attore + operationId (M-06). */
  opKey: string;
  /** Istante dell'operazione, uguale in ogni tentativo del callback. */
  now: Date;
}

export interface RunOperationOptions {
  actorId: string;
  /** Facoltativa: se assente se ne genera una (nessuna deduplica tra richieste diverse). */
  operationId?: string;
  /** Corpo della richiesta: il suo hash distingue un tentativo ripetuto da un riuso improprio. */
  request: unknown;
  practiceId?: ObjectId | null;
  now?: Date;
  /** Prove: salta il bootstrap automatico (indici/snapshot già creati dallo script). */
  skipBootstrap?: boolean;
}

export interface OperationOutcome<T> {
  result: T;
  operationId: string;
  /** true = risposta di un'operazione già eseguita con la stessa operationId e lo stesso corpo. */
  replayed: boolean;
}

/** JSON con chiavi ordinate, per un hash stabile del corpo. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as object)
      .sort()
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** L'operationId è unico solo per attore (contratto §1): gli effetti con indici unici globali usano questa chiave. */
export const opKeyOf = (actorId: string, operationId: string) => `${actorId}|${operationId}`;

export const requestHash = (request: unknown) => createHash("sha256").update(canonical(request)).digest("hex");

export const reused = () =>
  new HttpError("Questa operazione è già stata usata con dati diversi", 409, { code: "OPERATION_REUSED" });

async function replayIfDone<T>(db: Db, actorId: string, operationId: string, hash: string, session?: ClientSession): Promise<OperationOutcome<T> | null> {
  const done = await store.operations(db).findOne({ actorId, operationId }, { session });
  if (!done) return null;
  if (done.requestHash !== hash) throw reused();
  return { result: done.result as T, operationId, replayed: true };
}

/** Segnale interno: la ricevuta è comparsa durante l'esecuzione (tentativo concorrente già commesso). */
class ReplayFound<T> {
  constructor(readonly outcome: OperationOutcome<T>) {}
}

/**
 * Esegue `fn` in una transazione e registra la ricevuta in `operations` nella STESSA transazione.
 * Stessa operationId e stesso corpo → risultato memorizzato, nessun effetto ripetuto; corpo diverso → 409.
 * D-126 M-05: la ricevuta si ricontrolla nella sessione all'inizio di OGNI esecuzione del callback (il driver lo
 * riesegue dopo un conflitto), prima di controlli ed effetti; e dopo un errore si verifica se nel frattempo un
 * tentativo concorrente l'ha commessa (replay, o OPERATION_REUSED se il corpo è diverso). Senza ricevuta l'errore
 * originale passa invariato. Il risultato di `fn` va memorizzato: deve essere piccolo e serializzabile.
 */
export async function runOperation<T>(
  client: MongoClient,
  db: Db,
  opts: RunOperationOptions,
  fn: (ctx: OperationContext) => Promise<T>
): Promise<OperationOutcome<T>> {
  const operationId = opts.operationId ?? randomUUID();
  const now = opts.now ?? new Date();
  const hash = requestHash(opts.request);
  if (!opts.skipBootstrap) await ensureStoreBootstrapped(db);

  if (opts.operationId) {
    const replay = await replayIfDone<T>(db, opts.actorId, operationId, hash);
    if (replay) return replay;
  }

  const session = client.startSession();
  try {
    let result!: T;
    await session.withTransaction(
      async () => {
        if (opts.operationId) {
          const replay = await replayIfDone<T>(db, opts.actorId, operationId, hash, session);
          if (replay) throw new ReplayFound(replay);
        }
        result = await fn({ db, session, operationId, actorId: opts.actorId, opKey: opKeyOf(opts.actorId, operationId), now });
        await store.operations(db).insertOne(
          {
            _id: new ObjectId(),
            actorId: opts.actorId,
            operationId,
            requestHash: hash,
            practiceId: opts.practiceId ?? null,
            status: "DONE",
            result,
            createdAt: now,
          },
          { session }
        );
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } }
    );
    return { result, operationId, replayed: false };
  } catch (e) {
    if (e instanceof ReplayFound) return e.outcome as OperationOutcome<T>;
    // Qualunque errore (409 di revisione, 11000 sulla ricevuta, conflitto): se un tentativo concorrente con la stessa
    // operationId ha già commesso, si risponde con la sua ricevuta.
    if (opts.operationId && !(e instanceof HttpError && e.extra?.code === "OPERATION_REUSED")) {
      const replay = await replayIfDone<T>(db, opts.actorId, operationId, hash);
      if (replay) return replay;
    }
    throw e;
  } finally {
    await session.endSession();
  }
}

/**
 * Compare-and-swap della revisione della pratica intera: incrementa se è ancora `expected`, altrimenti
 * 409 REVISION_CONFLICT con la revisione corrente (404 se la pratica non esiste). Da chiamare per prima
 * nella transazione, così due salvataggi concorrenti non possono passare entrambi.
 */
export async function bumpPracticeRevision(ctx: OperationContext, practiceId: ObjectId, expected: number): Promise<number> {
  const updated = await store.practices(ctx.db).findOneAndUpdate(
    { _id: practiceId, revision: expected },
    { $inc: { revision: 1 }, $set: { updatedAt: ctx.now } },
    { session: ctx.session, returnDocument: "after", projection: { revision: 1 } }
  );
  if (updated) return updated.revision;
  const current = await store.practices(ctx.db).findOne({ _id: practiceId }, { session: ctx.session, projection: { revision: 1 } });
  if (!current) throw new HttpError("Pratica non trovata", 404);
  throw new HttpError("La pratica è stata modificata nel frattempo: ricarica e riprova", 409, {
    code: "REVISION_CONFLICT",
    currentRevision: current.revision,
  });
}

/**
 * Scrive la guardia di un invariante (write_guards): due transazioni che controllano lo stesso invariante (es.
 * almeno un PM leader per gestore, D-101) la toccano entrambe e quindi entrano in conflitto (niente write skew).
 */
export async function touchWriteGuard(ctx: OperationContext, key: string): Promise<void> {
  await store.writeGuards(ctx.db).updateOne({ _id: key }, { $inc: { version: 1 }, $set: { updatedAt: ctx.now } }, { upsert: true, session: ctx.session });
}
