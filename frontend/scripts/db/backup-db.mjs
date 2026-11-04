#!/usr/bin/env node
/**
 * Backup, verifica e ripristino di un database MongoDB LOCALE di PracticeHub.
 *
 *   yarn db:backup  [--uri U] [--db D] [--dir CARTELLA]
 *   yarn db:verify  --from CARTELLA_BACKUP [--confronta-db] [--uri U] [--db D]
 *   yarn db:restore --from CARTELLA_BACKUP --db D [--uri U] [--drop] [--yes]
 *
 * Formato: una cartella <db>_<AAAA-MM-GG_hh-mm-ss> (ora di Roma) con un file <collezione>.ndjson per
 * collezione (un documento per riga in EJSON canonico: ObjectId, Date, ecc. conservano il tipo) e un
 * manifest.json con conteggi, SHA-256 dei file, opzioni delle collezioni e definizioni degli indici.
 *
 * Protezioni (D-9): sono ammessi SOLO host locali (localhost, 127.0.0.1, ::1, "mongo" del compose);
 * mongodb+srv e ogni altro host sono rifiutati, senza eccezioni. Il ripristino senza --yes è solo
 * un'anteprima; su un database non vuoto serve --drop, e prima di cancellare si fa un backup di sicurezza.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BSON, MongoClient } from "mongodb";

const { EJSON } = BSON;
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "../../..");
export const DEFAULT_BACKUP_DIR = path.join(REPO_ROOT, "backups");
export const FORMAT_VERSION = 1;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "mongo"]);
/**
 * Database di ESERCIZIO del nuovo stack (D-158): reset e ripristino solo con --consenti-esercizio (diverso dal flag
 * della beta), il ripristino sempre con backup di sicurezza e conferma; il seed demo mai. Stessa lista in
 * src/lib/store/db.ts (PRODUCTION_DB_NAMES), verificata dalle prove.
 */
export const PRODUCTION_DB_NAMES = ["practicehub_prod", "practicehub_prod_legacy"];
export const isProductionDb = (name) => PRODUCTION_DB_NAMES.includes(String(name));
const BATCH = 1000;

/* ---------- funzioni pure (provate in tests/server/backup-db.test.ts) ---------- */

/** Host di una stringa di connessione mongodb:// (senza credenziali né porte). */
export function hostsOf(uri) {
  const m = /^mongodb:\/\/(?:[^@/]*@)?([^/?]+)/i.exec(String(uri));
  if (!m) return null;
  return m[1].split(",").map((h) => {
    const v6 = /^\[([^\]]+)\]/.exec(h);
    return (v6 ? v6[1] : h.replace(/:\d+$/, "")).toLowerCase();
  });
}

/** Lancia un errore se la stringa di connessione non punta esclusivamente a host locali. */
export function assertLocalUri(uri) {
  if (/^mongodb\+srv:/i.test(String(uri))) throw new Error("Rifiutato: mongodb+srv è un database remoto (D-9).");
  const hosts = hostsOf(uri);
  if (!hosts || hosts.length === 0) throw new Error(`Stringa di connessione non valida: ${redactUri(uri)}`);
  const remoti = hosts.filter((h) => !LOCAL_HOSTS.has(h));
  if (remoti.length) throw new Error(`Rifiutato: host non locale (${remoti.join(", ")}). Solo database locali (D-9).`);
  return hosts;
}

/** Toglie le credenziali da una stringa di connessione, per log e manifest. */
export function redactUri(uri) {
  return String(uri).replace(/^(mongodb(?:\+srv)?:\/\/)[^@/]*@/i, "$1***@");
}

/** Nome della cartella di backup: <db>_<AAAA-MM-GG_hh-mm-ss> in ora di Roma. */
export function backupFolderName(db, instant = new Date()) {
  if (!/^[A-Za-z0-9_-]+$/.test(db)) throw new Error(`Nome di database non ammesso: ${db}`);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(instant).map((x) => [x.type, x.value])
  );
  return `${db}_${p.year}-${p.month}-${p.day}_${p.hour}-${p.minute}-${p.second}`;
}

/**
 * @param {string[]} argv
 * @returns {Record<string, any>} `_` = argomenti posizionali; `--chiave valore` → stringa, `--flag` → true
 */
export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { out._.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

/* ---------- file ---------- */

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha256");
    fs.createReadStream(file).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });
}

async function* readNdjson(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file, "utf8"), crlfDelay: Infinity });
  for await (const line of rl) if (line.trim() !== "") yield line;
}

const fileOf = (dir, name) => path.join(dir, `${encodeURIComponent(name)}.ndjson`);

/* ---------- comandi ---------- */

async function connect(uri) {
  assertLocalUri(uri);
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  return client;
}

async function userCollections(db) {
  return (await db.listCollections({}, { nameOnly: false }).toArray())
    .filter((c) => c.type === "collection" && !c.name.startsWith("system."))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Esporta tutte le collezioni del database in una nuova cartella. Restituisce il percorso. */
export async function backup({ uri, db: dbName, dir = DEFAULT_BACKUP_DIR, log = console.log }) {
  const client = await connect(uri);
  try {
    const db = client.db(dbName);
    const target = path.join(dir, backupFolderName(dbName));
    if (fs.existsSync(target)) throw new Error(`La cartella esiste già: ${target}`);
    fs.mkdirSync(target, { recursive: true });
    const manifest = {
      formatVersion: FORMAT_VERSION, tool: "frontend/scripts/db/backup-db.mjs",
      database: dbName, source: redactUri(uri), createdAt: new Date().toISOString(), collections: {},
    };
    // Copia coerente nel tempo (K4): sul replica set tutte le collezioni si leggono allo stesso istante (sessione
    // snapshot), anche se app e worker scrivono durante la copia. Su un Mongo senza replica set (beta) lettura normale.
    const hello = await db.admin().command({ hello: 1 });
    const session = hello.setName ? client.startSession({ snapshot: true }) : undefined;
    manifest.snapshot = !!session;
    try {
    for (const info of await userCollections(db)) {
      const file = fileOf(target, info.name);
      const out = fs.createWriteStream(file, "utf8");
      let count = 0;
      for await (const doc of db.collection(info.name).find({}, { sort: { _id: 1 }, session })) {
        if (!out.write(EJSON.stringify(doc, { relaxed: false }) + "\n")) await new Promise((r) => out.once("drain", r));
        count++;
      }
      await new Promise((resolve, reject) => out.end((e) => (e ? reject(e) : resolve())));
      const indexes = (await db.collection(info.name).indexes()).filter((i) => i.name !== "_id_");
      manifest.collections[info.name] = {
        file: path.basename(file), count, sha256: await sha256File(file),
        options: info.options ?? {}, indexes,
      };
      log(`  ${info.name}: ${count} documenti`);
    }
    } finally {
      await session?.endSession();
    }
    fs.writeFileSync(path.join(target, "manifest.json"), JSON.stringify(manifest, null, 2));
    log(`Backup completato: ${target}`);
    return target;
  } finally {
    await client.close();
  }
}

/**
 * Controlla un backup senza scrivere nulla: manifest, SHA-256, leggibilità di ogni riga, conteggi,
 * _id duplicati. Con `compare` confronta anche i conteggi con un database (sola lettura).
 * @param {{ from: string, compare?: { uri: string, db: string } | null, log?: (msg: string) => void }} opts
 */
export async function verify({ from, compare = null, log = console.log }) {
  const problemi = [];
  const manifestPath = path.join(from, "manifest.json");
  if (!fs.existsSync(manifestPath)) return { ok: false, problemi: [`manifest.json assente in ${from}`] };
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.formatVersion !== FORMAT_VERSION) problemi.push(`formatVersion ${manifest.formatVersion} non supportata`);

  for (const [name, c] of Object.entries(manifest.collections ?? {})) {
    const file = path.join(from, c.file);
    if (!fs.existsSync(file)) { problemi.push(`${name}: file ${c.file} assente`); continue; }
    if ((await sha256File(file)) !== c.sha256) problemi.push(`${name}: SHA-256 diverso (file modificato o danneggiato)`);
    let righe = 0;
    const ids = new Set();
    try {
      for await (const line of readNdjson(file)) {
        const doc = EJSON.parse(line, { relaxed: false });
        const id = EJSON.stringify(doc._id);
        if (ids.has(id)) problemi.push(`${name}: _id duplicato ${id}`);
        ids.add(id);
        righe++;
      }
    } catch (e) {
      problemi.push(`${name}: riga ${righe + 1} non leggibile (${e.message})`);
    }
    if (righe !== c.count) problemi.push(`${name}: ${righe} documenti nel file, ${c.count} nel manifest`);
    log(`  ${name}: ${righe} documenti`);
  }

  if (compare) {
    const client = await connect(compare.uri);
    try {
      const db = client.db(compare.db);
      const live = new Map();
      for (const info of await userCollections(db)) live.set(info.name, await db.collection(info.name).estimatedDocumentCount());
      for (const [name, c] of Object.entries(manifest.collections ?? {})) {
        if (!live.has(name)) problemi.push(`confronto: ${name} assente nel database ${compare.db}`);
        else if (live.get(name) !== c.count) problemi.push(`confronto: ${name} ha ${live.get(name)} documenti nel database, ${c.count} nel backup`);
      }
      for (const name of live.keys()) if (!(name in (manifest.collections ?? {}))) problemi.push(`confronto: ${name} presente nel database ma non nel backup`);
    } finally {
      await client.close();
    }
  }
  return { ok: problemi.length === 0, problemi, manifest };
}

/**
 * Ripristina un backup in un database locale. Senza `yes` mostra solo cosa farebbe. Un database di
 * destinazione non vuoto richiede `drop`; in quel caso prima si salva un backup di sicurezza.
 */
export async function restore({ from, uri, db: dbName, drop = false, yes = false, allowProduction = false, dir = DEFAULT_BACKUP_DIR, log = console.log }) {
  if (!dbName) throw new Error("Indica il database di destinazione con --db (nessun valore predefinito per il ripristino).");
  const production = isProductionDb(dbName);
  if (production && !allowProduction) {
    throw new Error(`Rifiutato: "${dbName}" è il database di esercizio (D-158). Serve --consenti-esercizio.`);
  }
  const check = await verify({ from, log: () => {} });
  if (!check.ok) throw new Error(`Backup non integro, ripristino annullato:\n  - ${check.problemi.join("\n  - ")}`);
  const { manifest } = check;

  const client = await connect(uri);
  try {
    const db = client.db(dbName);
    const esistenti = await userCollections(db);
    const nonVuote = [];
    for (const c of esistenti) if ((await db.collection(c.name).estimatedDocumentCount()) > 0) nonVuote.push(c.name);

    log(`Ripristino di ${from}`);
    log(`  verso ${redactUri(uri)} / ${dbName}`);
    for (const [name, c] of Object.entries(manifest.collections)) log(`  ${name}: ${c.count} documenti, ${c.indexes.length} indici`);
    if (esistenti.length) {
      log(`  il database contiene già ${esistenti.length} collezioni${nonVuote.length ? ` (${nonVuote.length} non vuote)` : ""}`);
      if (nonVuote.length && !drop) throw new Error("Database di destinazione non vuoto: usa --drop per sostituirlo (verrà salvato prima un backup di sicurezza).");
    }
    if (!yes) {
      log("Anteprima: nessuna modifica fatta. Aggiungi --yes per eseguire.");
      return { eseguito: false };
    }

    let sicurezza = null;
    if (esistenti.length) {
      // Esercizio: copia di sicurezza SEMPRE, anche se le collezioni sono vuote (D-158).
      if (nonVuote.length || production) {
        log("Backup di sicurezza del database di destinazione…");
        // In una sottocartella: la conservazione delle copie notturne non la tocca (K4).
        sicurezza = await backup({ uri, db: dbName, dir: path.join(dir, "sicurezza"), log: () => {} });
        log(`  salvato in ${sicurezza}`);
      }
      for (const c of esistenti) await db.collection(c.name).drop();
    }

    for (const [name, c] of Object.entries(manifest.collections)) {
      const { autoIndexId: _ignore, ...options } = c.options ?? {};
      await db.createCollection(name, options);
      const col = db.collection(name);
      let batch = [];
      for await (const line of readNdjson(path.join(from, c.file))) {
        batch.push(EJSON.parse(line, { relaxed: false }));
        if (batch.length >= BATCH) { await col.insertMany(batch, { ordered: true }); batch = []; }
      }
      if (batch.length) await col.insertMany(batch, { ordered: true });
      for (const { v: _v, ns: _ns, ...idx } of c.indexes) {
        const { key, ...opts } = idx;
        await col.createIndex(key, opts);
      }
      const n = await col.countDocuments();
      if (n !== c.count) throw new Error(`${name}: ripristinati ${n} documenti invece di ${c.count}`);
      log(`  ${name}: ${n} documenti ripristinati`);
    }
    log("Ripristino completato.");
    return { eseguito: true, sicurezza };
  } finally {
    await client.close();
  }
}

/* ---------- riga di comando ---------- */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  const uri = args.uri ?? process.env.MONGO_URL ?? "mongodb://127.0.0.1:27017";
  const db = args.db ?? (cmd === "restore" ? undefined : process.env.DB_NAME ?? "practicehub");
  const dir = args.dir ? path.resolve(args.dir) : DEFAULT_BACKUP_DIR;

  if (cmd === "backup") {
    await backup({ uri, db, dir });
  } else if (cmd === "verify") {
    if (!args.from) throw new Error("Indica la cartella del backup con --from");
    const r = await verify({ from: path.resolve(args.from), compare: args["confronta-db"] ? { uri, db } : null });
    if (r.ok) console.log("Verifica superata: backup integro.");
    else { console.error(`Verifica NON superata:\n  - ${r.problemi.join("\n  - ")}`); process.exitCode = 2; }
  } else if (cmd === "restore") {
    if (!args.from) throw new Error("Indica la cartella del backup con --from");
    await restore({ from: path.resolve(args.from), uri, db, drop: !!args.drop, yes: !!args.yes, allowProduction: !!args["consenti-esercizio"], dir });
  } else {
    console.log("Uso: backup-db.mjs backup|verify|restore [opzioni] — vedi l'intestazione del file.");
    process.exitCode = 1;
  }
}

// Avvio diretto solo se il file lanciato è backup-db: dentro un bundle (dist/ops, K1) import.meta.url è quello del file
// d'ingresso, e senza il controllo sul nome partirebbe anche dai bundle che includono questo modulo (es. seed-demo).
const SELF_NAME = /^backup-db\.(mjs|js)$/;
const launchedDirectly = Boolean(process.argv[1]) && SELF_NAME.test(path.basename(process.argv[1]));
if (launchedDirectly && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => {
    console.error(`ERRORE: ${e.message}`);
    process.exitCode = 1;
  });
}
