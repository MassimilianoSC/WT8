/**
 * Azzeramento del database del modello nuovo (D-14, D-69): backup → dry-run con conteggi → esecuzione.
 * Senza `yes` non scrive nulla. Utenti e token restano, salvo `includeUsers` (perimetro da confermare con
 * M, R-15). Dopo l'azzeramento: indici e snapshot dei template; seed demo solo se richiesto (SEED_DEMO).
 *
 * `practicesOnly` (D-178, giorno della partenza): toglie SOLO le pratiche di prova e ciò che ne dipende (vedi
 * PRACTICE_SCOPE) e tiene utenti, token, liste, soglie, impostazioni dell'assistente, audit, template e il resto
 * della configurazione. Stesse protezioni: dry-run senza `yes`, copia di sicurezza prima, --consenti-esercizio su
 * practicehub_prod (D-158). Le collezioni si svuotano, non si cancellano: indici e configurazioni restano.
 */
import type { Document, Filter, MongoClient } from "mongodb";
import { STORE_COLLECTIONS, STORE_USER_COLLECTIONS, bootstrapStore } from "../../src/lib/store/db";
import { seedDemo } from "../../src/lib/store/seed-demo";
import { backup } from "./backup-db.mjs";
import { assertDisposableTarget } from "./guard";

export interface ResetOptions {
  client: MongoClient;
  uri: string;
  dbName: string;
  yes?: boolean;
  includeUsers?: boolean;
  allowBeta?: boolean;
  /** D-158: database di esercizio del nuovo stack (practicehub_prod). */
  allowProduction?: boolean;
  backupDir?: string;
  /** D-178: solo pratiche e dati collegati; utenti e configurazioni restano. */
  practicesOnly?: boolean;
  /** Password del seed demo: se presente si esegue il seed dopo l'azzeramento. */
  seedPassword?: string | null;
  log?: (msg: string) => void;
}

export interface ResetReport {
  executed: boolean;
  scope: string[];
  before: Record<string, number>;
  backupFolder: string | null;
  after?: Record<string, number>;
}

/** Mail che non riguardano le pratiche (inviti, benvenuto, reset della password): restano nell'outbox. */
const ACCOUNT_MAIL = /^(invite|welcome|reset):/;

/**
 * Perimetro di "solo pratiche" (D-178): collezione → filtro dei documenti da togliere ({} = tutti). Gli eventi di
 * recapito si tolgono dopo l'outbox, se la loro voce non c'è più (filtro calcolato al momento).
 */
export const PRACTICE_SCOPE: ReadonlyArray<[collection: string, filter: Filter<Document>]> = [
  ["practices", {}],
  ["practice_iterations", {}],
  ["repeat_rows", {}],
  ["value_history", {}],
  ["practice_events", {}],
  ["alerts", {}],
  ["alert_events", {}],
  ["notifications", {}],
  ["import_previews", {}],
  ["practice_comments", {}],
  // Mail degli alert e delle notifiche (non quelle degli account).
  ["delivery_outbox", { $or: [{ alertId: { $ne: null } }, { eventKey: { $not: ACCOUNT_MAIL } }] }],
  // Ricevute delle operazioni sulle pratiche e delle conferme di import (risultato con "reworks").
  ["operations", { $or: [{ practiceId: { $ne: null } }, { "result.reworks": { $exists: true } }] }],
];

async function deliveryEventsFilter(client: MongoClient, dbName: string): Promise<Filter<Document>> {
  const kept = await client.db(dbName).collection("delivery_outbox").find({ $nor: [PRACTICE_SCOPE.find(([c]) => c === "delivery_outbox")![1]] }, { projection: { _id: 1 } }).toArray();
  return { outboxId: { $nin: kept.map((d) => d._id) } };
}

async function scopedCounts(client: MongoClient, dbName: string): Promise<Record<string, number>> {
  const db = client.db(dbName);
  const out: Record<string, number> = {};
  for (const [name, filter] of PRACTICE_SCOPE) out[name] = await db.collection(name).countDocuments(filter);
  out.delivery_events = await db.collection("delivery_events").countDocuments(await deliveryEventsFilter(client, dbName));
  return out;
}

/** Solo pratiche (D-178): conteggi di ciò che si toglie, copia di sicurezza, svuotamento con filtro. */
async function resetPracticesOnly(o: ResetOptions, log: (m: string) => void): Promise<ResetReport> {
  const before = await scopedCounts(o.client, o.dbName);
  const kept = await counts(o.client, o.dbName, ["users", "auth_tokens", "lists", "rule_config", "assistant_settings", "templates", "audit_log"]);
  log(`Azzeramento delle SOLE pratiche di ${o.dbName} (D-178). Da togliere:`);
  for (const [name, n] of Object.entries(before)) log(`  ${name}: ${n} documenti`);
  log("Restano (per esempio):");
  for (const [name, n] of Object.entries(kept)) log(`  ${name}: ${n} documenti`);
  log("Prima di eseguire fermare app e worker, così nessuno scrive durante l'operazione.");
  const scope = Object.keys(before);
  if (!o.yes) {
    log("Dry-run: nessuna modifica. Aggiungi --yes per eseguire.");
    return { executed: false, scope, before, backupFolder: null };
  }
  const backupFolder = await backup({ uri: o.uri, db: o.dbName, dir: o.backupDir, log: () => {} });
  log(`Copia di sicurezza salvata in ${backupFolder}`);
  const db = o.client.db(o.dbName);
  const eventsFilter = await deliveryEventsFilter(o.client, o.dbName); // prima di toccare l'outbox
  for (const [name, filter] of PRACTICE_SCOPE) await db.collection(name).deleteMany(filter);
  await db.collection("delivery_events").deleteMany(eventsFilter);
  const after = await scopedCounts(o.client, o.dbName);
  log("Azzeramento delle pratiche completato.");
  return { executed: true, scope, before, backupFolder, after };
}

async function counts(client: MongoClient, dbName: string, scope: readonly string[]): Promise<Record<string, number>> {
  const db = client.db(dbName);
  const present = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  const out: Record<string, number> = {};
  for (const name of scope) out[name] = present.has(name) ? await db.collection(name).countDocuments() : 0;
  return out;
}

export async function resetDatabase(o: ResetOptions): Promise<ResetReport> {
  const log = o.log ?? console.log;
  assertDisposableTarget(o.uri, o.dbName, o.allowBeta, o.allowProduction);
  if (o.practicesOnly) {
    if (o.includeUsers || o.seedPassword) throw new Error("--solo-pratiche non si combina con --include-utenti né con il seed demo");
    return resetPracticesOnly(o, log);
  }
  const scope = [...STORE_COLLECTIONS, ...(o.includeUsers ? STORE_USER_COLLECTIONS : [])];
  const before = await counts(o.client, o.dbName, scope);

  log(`Azzeramento di ${o.dbName}${o.includeUsers ? " (utenti compresi)" : " (utenti e token conservati)"}`);
  for (const [name, n] of Object.entries(before)) log(`  ${name}: ${n} documenti`);
  if (!o.yes) {
    log("Dry-run: nessuna modifica. Aggiungi --yes per eseguire.");
    return { executed: false, scope, before, backupFolder: null };
  }

  let backupFolder: string | null = null;
  const total = Object.values(before).reduce((a, b) => a + b, 0);
  if (total > 0) {
    backupFolder = await backup({ uri: o.uri, db: o.dbName, dir: o.backupDir, log: () => {} });
    log(`Backup salvato in ${backupFolder}`);
  }
  const db = o.client.db(o.dbName);
  const present = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const name of scope) if (present.has(name)) await db.collection(name).drop();
  await bootstrapStore(db);
  if (o.seedPassword) {
    const r = await seedDemo(db, { password: o.seedPassword });
    log(`Seed demo: ${r.users} utenti, ${r.practices} pratiche`);
  }
  const after = await counts(o.client, o.dbName, scope);
  log("Azzeramento completato.");
  return { executed: true, scope, before, backupFolder, after };
}
