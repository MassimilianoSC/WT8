/**
 * Utenti della prova di carico (scripts/db/test-users-core.ts). Nell'immagine di esercizio: node ops/utenti-prova.mjs
 * nel container "backup" (deploy/README.md). Da frontend/: yarn tsx scripts/test-users.ts …
 *
 *   --uri URI --db DB --file FILE [--n 20] [--sovrascrivi] [--consenti-esercizio]   crea o ricrea carico01…caricoNN
 *   --uri URI --db DB --disattiva-prova [--consenti-esercizio]                       li disattiva tutti
 *
 * Email e password vanno SOLO nel file indicato (permessi ristretti), mai a schermo né nei registri: a schermo solo
 * i conteggi. Il file si scrive prima del database; se esiste già si rifiuta, salvo --sovrascrivi.
 * Stesse protezioni dell'azzeramento: solo host locali, mai la beta, practicehub_prod solo con --consenti-esercizio.
 */
import fs from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";
import { parseArgs } from "./db/backup-db.mjs";
import { assertDisposableTarget } from "./db/guard";
import { createTestUsers, disableTestUsers, TEST_MAX } from "./db/test-users-core";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const uri = String(args.uri ?? process.env.MONGO_URL ?? "");
  const dbName = typeof args.db === "string" ? args.db : "";
  const disable = !!args["disattiva-prova"];
  const file = typeof args.file === "string" ? path.resolve(args.file) : "";
  const n = args.n === undefined ? 20 : Number(args.n);
  if (!disable && !file) throw new Error("Indica il file delle credenziali con --file (oppure --disattiva-prova).");
  if (!disable && (!Number.isInteger(n) || n < 1 || n > TEST_MAX)) throw new Error(`--n deve essere un intero da 1 a ${TEST_MAX}.`);
  assertDisposableTarget(uri, dbName, false, !!args["consenti-esercizio"]);
  if (!disable && fs.existsSync(file) && !args.sovrascrivi) throw new Error("Il file delle credenziali esiste già: scegline un altro o aggiungi --sovrascrivi.");

  const client = await new MongoClient(uri, { serverSelectionTimeoutMS: 5000 }).connect();
  try {
    const db = client.db(dbName);
    if (disable) {
      const r = await disableTestUsers(db);
      console.log(`Utenti di prova disattivati: ${r.disabled}.`);
      return;
    }
    const r = await createTestUsers(db, {
      n,
      beforeWrite: (credentials) => {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, `${JSON.stringify({ createdAt: new Date().toISOString(), db: dbName, users: credentials }, null, 2)}\n`, { mode: 0o600 });
      },
    });
    console.log(`Utenti di prova pronti: ${r.created} creati, ${r.updated} ricreati con password nuove.`);
    console.log(`Per ruolo: ${Object.entries(r.byRole).map(([k, v]) => `${k} ${v}`).join(", ")}.`);
    console.log(`Per cliente: ${Object.entries(r.byTemplate).map(([k, v]) => `${k} ${v}`).join(", ")}.`);
    console.log(`Credenziali nel file indicato (${path.basename(file)}): non condividerlo e cancellalo dopo la prova.`);
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(`ERRORE: ${(e as Error).message}`);
  process.exitCode = 1;
});
