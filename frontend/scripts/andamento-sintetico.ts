/**
 * Dati sintetici per Andamento (scripts/db/andamento-sintetico-core.ts) — da frontend/, SOLO su database usa e getta:
 *
 *   PH_ANDAMENTO=true yarn tsx scripts/andamento-sintetico.ts --uri "mongodb://127.0.0.1:27021/?directConnection=true" \
 *     --db practicehub_test_andamento --pratiche 40 --anni 1 [--seme 1] [--contorno] [--seed-demo] [--misura] [--senza-dati]
 *
 * --seed-demo   prima i dati demo (utenti di prova per l'anteprima; serve SEED_DEMO_PASSWORD)
 * --contorno    commenti, alert e modifiche PM in più, per i volumi della prova di prestazioni
 * --misura      tempi dei sei blocchi (prima chiamata e dalla cache) con un ADMIN di prova
 * --senza-dati  solo la misura, sui dati già presenti
 * Rifiuta host non locali, la porta e i database della beta e il database di esercizio (nessun flag lo permette).
 */
import { MongoClient } from "mongodb";
import { TEMPLATE_IDS, type UserDTO } from "../src/lib/contract";
import { seedDemo } from "../src/lib/store/seed-demo";
import { getBlocco } from "../src/services/andamento";
import { loadDataset, resetAndamentoCache } from "../src/services/andamento/dataset";
import { resetExtraCache } from "../src/services/andamento/extra";
import { parseArgs } from "./db/backup-db.mjs";
import { generateSynthetic } from "./db/andamento-sintetico-core";
import { assertDisposableTarget } from "./db/guard";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const uri = String(args.uri ?? "");
  const dbName = typeof args.db === "string" ? args.db : "";
  assertDisposableTarget(uri, dbName);
  const client = await new MongoClient(uri, { serverSelectionTimeoutMS: 5000 }).connect();
  try {
    const db = client.db(dbName);
    if (args["seed-demo"]) {
      const password = process.env.SEED_DEMO_PASSWORD;
      if (!password) throw new Error("--seed-demo richiede SEED_DEMO_PASSWORD");
      await seedDemo(db, { password });
      console.log("Dati demo pronti.");
    }
    if (!args["senza-dati"]) {
      const t0 = Date.now();
      const r = await generateSynthetic(db, {
        practices: Number(args.pratiche ?? 40),
        years: Number(args.anni ?? 1),
        seed: Number(args.seme ?? 1),
        filler: !!args.contorno,
        log: console.log,
      });
      console.log(`Dati sintetici: ${r.practices} pratiche, ${r.events} eventi, ${r.history} modifiche, ${r.alerts} alert, ${r.rows} righe (${((Date.now() - t0) / 1000).toFixed(1)} s).`);
    }
    if (args.misura) {
      if (process.env.PH_ANDAMENTO !== "true") throw new Error("--misura richiede PH_ANDAMENTO=true");
      const admin: UserDTO = { id: "000000000000000000000000", name: "misura", email: "misura@prova.invalid", status: "active", isAdmin: true, memberships: [], createdAt: "", updatedAt: "" };
      const params = new URLSearchParams(String(args.periodo ?? "granularity=month"));
      resetAndamentoCache();
      resetExtraCache();
      const mem0 = process.memoryUsage().heapUsed;
      let t = Date.now();
      await loadDataset(db, TEMPLATE_IDS);
      console.log(`Caricamento eventi: ${Date.now() - t} ms (memoria +${Math.round((process.memoryUsage().heapUsed - mem0) / 1e6)} MB)`);
      for (const giro of ["prima chiamata", "dalla cache"]) {
        for (const b of ["stati", "flussi", "rilavorazioni", "ferme", "scadenze", "gruppi"]) {
          t = Date.now();
          await getBlocco(db, admin, b, b === "ferme" ? new URLSearchParams() : params);
          console.log(`  ${giro.padEnd(15)} ${b.padEnd(14)} ${String(Date.now() - t).padStart(6)} ms`);
        }
      }
      console.log(`Memoria del processo: ${Math.round(process.memoryUsage().rss / 1e6)} MB`);
    }
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(`ERRORE: ${(e as Error).message}`);
  process.exitCode = 1;
});
