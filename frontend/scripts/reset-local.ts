/**
 * Azzeramento del database del modello nuovo (D-69) — da frontend/:
 *   yarn db:reset --uri mongodb://127.0.0.1:27018/?directConnection=true --db practicehub_test_v2         (dry-run)
 *   yarn db:reset --uri … --db … --yes [--include-utenti] [--dir CARTELLA_BACKUP]
 *   yarn db:reset --uri … --db … --solo-pratiche [--yes]   (D-178: toglie solo le pratiche di prova)
 * Nell'immagine di esercizio (deploy/README.md): node ops/reset-db.mjs … nel container "backup".
 * Con SEED_DEMO=true e SEED_DEMO_PASSWORD esegue anche il seed demo. Rifiuta host non locali, la porta
 * 27017 e i database della beta senza --consenti-beta (che richiede il via di Massimiliano, R-15).
 */
import path from "node:path";
import { MongoClient } from "mongodb";
import { parseArgs } from "./db/backup-db.mjs";
import { assertDisposableTarget } from "./db/guard";
import { resetDatabase } from "./db/reset-core";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const uri = String(args.uri ?? process.env.MONGO_URL ?? "");
  const dbName = typeof args.db === "string" ? args.db : "";
  assertDisposableTarget(uri, dbName, !!args["consenti-beta"], !!args["consenti-esercizio"]);
  const seed = process.env.SEED_DEMO === "true";
  if (seed && !process.env.SEED_DEMO_PASSWORD) throw new Error("SEED_DEMO=true richiede SEED_DEMO_PASSWORD");
  const client = await new MongoClient(uri, { serverSelectionTimeoutMS: 5000 }).connect();
  try {
    await resetDatabase({
      client,
      uri,
      dbName,
      yes: !!args.yes,
      includeUsers: !!args["include-utenti"],
      practicesOnly: !!args["solo-pratiche"],
      allowBeta: !!args["consenti-beta"],
      allowProduction: !!args["consenti-esercizio"],
      backupDir: typeof args.dir === "string" ? path.resolve(args.dir) : undefined,
      seedPassword: seed ? process.env.SEED_DEMO_PASSWORD : null,
    });
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(`ERRORE: ${(e as Error).message}`);
  process.exitCode = 1;
});
