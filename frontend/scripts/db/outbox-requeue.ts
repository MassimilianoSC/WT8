/**
 * Rimette in coda le mail FAILED (errore permanente del server di posta, D-137 A-05): `yarn outbox:requeue`.
 *
 *   yarn outbox:requeue --failed [--since AAAA-MM-GG]     tutte le FAILED (dalla data indicata)
 *   yarn outbox:requeue --id <id> [--id <id> …]           solo quelle indicate (devono essere FAILED)
 *   … --yes                                               esegue davvero (senza: dry-run con l'elenco)
 *
 * Usa MONGO_URL e DB_NAME / NEW_DB_NAME come l'app e il worker. Le mail tornano PENDING con un nuovo inizio della serie
 * di errori; per gli alert il worker ricontrolla comunque, prima dell'invio, che l'alert sia ancora aperto e attivo e
 * rispetta l'orario lavorativo. Ogni mail rimessa in coda lascia un evento REQUEUED in delivery_events.
 */
import { ObjectId, type Db } from "mongodb";
import { isValidIsoDate, romeTime } from "../../src/lib/calendario";
import { store } from "../../src/lib/store/db";

export interface RequeueOptions {
  ids?: string[];
  failed?: boolean;
  since?: string | null;
  yes?: boolean;
  now?: Date;
  by?: string;
  log?: (msg: string) => void;
}

export interface RequeueReport {
  executed: boolean;
  matched: Array<{ id: string; eventKey: string; to: string; lastError: string | null }>;
  requeued: number;
}

export async function requeueOutbox(db: Db, o: RequeueOptions): Promise<RequeueReport> {
  const log = o.log ?? console.log;
  if (!o.failed && !o.ids?.length) throw new Error("Indica --failed oppure almeno un --id");
  if (o.since && !isValidIsoDate(o.since)) throw new Error("--since vuole una data AAAA-MM-GG");
  for (const id of o.ids ?? []) if (!/^[0-9a-f]{24}$/i.test(id)) throw new Error(`Id non valido: ${id}`);

  const filter = {
    status: "FAILED" as const,
    ...(o.ids?.length ? { _id: { $in: o.ids.map((id) => new ObjectId(id)) } } : {}),
    ...(o.since ? { createdAt: { $gte: romeTime(o.since, 0, 0) } } : {}),
  };
  const docs = await store.outbox(db).find(filter).sort({ createdAt: 1 }).toArray();
  const matched = docs.map((d) => ({ id: d._id.toHexString(), eventKey: d.eventKey, to: d.payload.to, lastError: d.lastError }));
  log(`Mail FAILED trovate: ${matched.length}`);
  for (const m of matched) log(`  ${m.id}  ${m.eventKey}  → ${m.to}  (${m.lastError ?? "nessun motivo"})`);
  if (!o.yes) {
    log("Dry-run: nessuna modifica. Aggiungi --yes per rimetterle in coda.");
    return { executed: false, matched, requeued: 0 };
  }

  const now = o.now ?? new Date();
  let requeued = 0;
  for (const d of docs) {
    const r = await store.outbox(db).updateOne(
      { _id: d._id, status: "FAILED" },
      { $set: { status: "PENDING", nextAttemptAt: now, claimToken: null, leaseUntil: null, firstErrorAt: null, warnedAt: null } }
    );
    if (!r.modifiedCount) continue;
    requeued++;
    await store.deliveryEvents(db).insertOne({
      _id: new ObjectId(),
      outboxId: d._id,
      eventKey: d.eventKey,
      alertId: d.alertId ?? null,
      userId: d.userId,
      attempt: d.attempts,
      at: now,
      outcome: "REQUEUED",
      by: o.by ?? "outbox:requeue",
      ...(d.lastError ? { reason: `prima: ${d.lastError}`.slice(0, 500) } : {}),
    });
  }
  log(`Rimesse in coda: ${requeued}`);
  return { executed: true, matched, requeued };
}

function parseArgs(argv: string[]): RequeueOptions {
  const o: RequeueOptions = { ids: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--failed") o.failed = true;
    else if (a === "--yes") o.yes = true;
    else if (a === "--id") o.ids!.push(argv[++i] ?? "");
    else if (a === "--since") o.since = argv[++i] ?? "";
    else throw new Error(`Argomento sconosciuto: ${a}`);
  }
  return o;
}

async function main() {
  const { getStoreDb, storeDbName } = await import("../../src/lib/store/db");
  const { getClient } = await import("../../src/lib/db");
  const opts = parseArgs(process.argv.slice(2));
  console.log(`Database: ${storeDbName()}`);
  try {
    await requeueOutbox(await getStoreDb(), { ...opts, by: `outbox:requeue (${process.env.USERNAME ?? process.env.USER ?? "?"})` });
  } finally {
    await (await getClient()).close();
  }
}

if (process.argv[1] && /outbox-requeue\.(ts|mjs)$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
