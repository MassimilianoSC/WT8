/**
 * Seed demo del modello nuovo (D-69) — da frontend/:
 *   SEED_DEMO=true SEED_DEMO_PASSWORD=… yarn db:seed --uri mongodb://127.0.0.1:27018/?directConnection=true --db practicehub_test_v2
 * Ripetibile: inserisce solo ciò che manca. Stesse protezioni dell'azzeramento.
 * SEED_DEMO_ADMIN_EMAIL (facoltativa): email dell'ADMIN demo, es. l'admin della beta nell'anteprima (D-105).
 */
import { MongoClient } from "mongodb";
import { seedDemo } from "../src/lib/store/seed-demo";
import { parseArgs } from "./db/backup-db.mjs";
import { assertDisposableTarget } from "./db/guard";

async function main() {
  if (process.env.SEED_DEMO !== "true") throw new Error("Il seed demo parte solo con SEED_DEMO=true");
  const password = process.env.SEED_DEMO_PASSWORD ?? "";
  const args = parseArgs(process.argv.slice(2));
  const uri = String(args.uri ?? process.env.MONGO_URL ?? "");
  const dbName = typeof args.db === "string" ? args.db : "";
  assertDisposableTarget(uri, dbName, !!args["consenti-beta"]);
  const client = await new MongoClient(uri, { serverSelectionTimeoutMS: 5000 }).connect();
  try {
    const r = await seedDemo(client.db(dbName), { password, adminEmail: process.env.SEED_DEMO_ADMIN_EMAIL || undefined });
    console.log(`Seed demo su ${dbName}: ${r.users} utenti, ${r.practices} pratiche; inseriti ${JSON.stringify(r.inserted)}`);
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(`ERRORE: ${(e as Error).message}`);
  process.exitCode = 1;
});
