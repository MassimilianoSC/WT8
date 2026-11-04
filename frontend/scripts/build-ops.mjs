#!/usr/bin/env node
/**
 * Compila worker e strumenti operativi in JavaScript autonomo per l'immagine di esercizio (K1, D-156): `yarn build:ops`.
 * In esercizio non servono tsx, TypeScript né le devDependencies: ogni file in dist/ops/ contiene già le sue
 * dipendenze (mongodb, nodemailer, bcryptjs, dati JSON) e gira con il solo `node`.
 *
 *   dist/ops/worker.mjs           job degli alert e recapito delle mail (servizio "worker")
 *   dist/ops/backup-db.mjs        copia, verifica e ripristino (comandi a mano)
 *   dist/ops/backup-service.mjs   copie notturne con verifica e conservazione (servizio "backup", K4)
 *   dist/ops/outbox-requeue.mjs   rimette in coda le mail FAILED
 *   dist/ops/seed-demo.mjs        dati demo per lo stack di prova (mai in uso reale, D-152)
 *   dist/ops/reset-db.mjs         azzeramento (anche "solo pratiche", D-178)
 *   dist/ops/utenti-prova.mjs     utenti della prova di carico e loro disattivazione
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const ENTRIES = {
  worker: "src/jobs/worker.ts",
  "backup-db": "scripts/db/backup-db.mjs",
  "backup-service": "scripts/db/backup-service.mjs",
  "outbox-requeue": "scripts/db/outbox-requeue.ts",
  "seed-demo": "scripts/seed-demo.ts",
  // D-178: azzeramento delle sole pratiche il giorno della partenza (con dry-run, copia e --consenti-esercizio).
  "reset-db": "scripts/reset-local.ts",
  // Utenti della prova di carico (carico01@prova.invalid…): crea con credenziali su file, --disattiva-prova.
  "utenti-prova": "scripts/test-users.ts",
};

// Dipendenze facoltative del driver MongoDB (Kerberos, compressioni, cifratura, AWS…): non usate, restano fuori.
const OPTIONAL = ["kerberos", "@mongodb-js/zstd", "snappy", "mongodb-client-encryption", "@aws-sdk/credential-providers", "gcp-metadata", "socks", "aws4"];

export async function buildOps({ outdir = path.join(ROOT, "dist/ops"), log = console.log } = {}) {
  const result = await build({
    absWorkingDir: ROOT,
    entryPoints: Object.fromEntries(Object.entries(ENTRIES).map(([name, file]) => [name, path.join(ROOT, file)])),
    outdir,
    outExtension: { ".js": ".mjs" },
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    // Le librerie CommonJS dentro un bundle ESM usano ancora require().
    banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
    tsconfig: path.join(ROOT, "tsconfig.json"),
    external: OPTIONAL,
    legalComments: "none",
    logLevel: "warning",
    metafile: true,
  });
  for (const [file, info] of Object.entries(result.metafile.outputs)) {
    if (file.endsWith(".mjs")) log(`  ${path.relative(ROOT, path.join(ROOT, file))}  ${(info.bytes / 1024).toFixed(0)} kB`);
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildOps().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
