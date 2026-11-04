#!/usr/bin/env node
/**
 * Copie notturne (K4, PR-01, D-144): servizio "backup" dello stack di esercizio. `node ops/backup-service.mjs`.
 *
 * - Ogni notte all'ora PH_BACKUP_TIME di Roma (default 01:30, ora legale compresa): per ogni database di
 *   PH_BACKUP_DBS copia (backup-db, coerente nel tempo sul replica set) → verifica (SHA-256, righe, conteggi) →
 *   conservazione (14 giorni / 13 settimane / 12 mesi, backup-retention). Una copia che non supera la verifica viene
 *   rinominata "<cartella>_NON_VALIDA" e non conta per la conservazione.
 * - All'avvio, se l'ultima copia riuscita ha più di PH_BACKUP_MAX_AGE_HOURS ore (default 26: PC spento di notte) o non
 *   esiste, la copia si fa subito.
 * - Esito di ogni giro in backup_runs (database PH_DB): lo legge il controllo di salute e l'avviso (K5).
 *
 * Variabili: MONGO_URL, PH_BACKUP_DBS (elenco separato da virgole), PH_DB (dove registrare l'esito), PH_BACKUP_DIR
 * (default /backups), PH_BACKUP_TIME, PH_BACKUP_MAX_AGE_HOURS. BACKUP_ONCE=1: un giro e poi esce.
 */
import fs from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";
import { backup, verify } from "./backup-db.mjs";
import { applyRetention, DEFAULT_POLICY } from "./backup-retention.mjs";

const ROME_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function romeParts(instant) {
  const p = Object.fromEntries(ROME_PARTS.formatToParts(instant).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) };
}

/** Istante UTC dell'ora "hh:mm" di Roma nel giorno `day` (gestisce ora legale e solare). */
export function romeLocalToInstant(day, hour, minute) {
  for (const offsetHours of [2, 1]) {
    const guess = new Date(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
    guess.setUTCHours(guess.getUTCHours() - offsetHours);
    const back = romeParts(guess);
    if (back.day === day && back.hour === hour && back.minute === minute) return guess;
  }
  // Ora inesistente (cambio all'ora legale, es. 02:30): l'istante dopo il salto.
  const t = new Date(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
  t.setUTCHours(t.getUTCHours() - 1);
  return t;
}

/** Prossima esecuzione strettamente dopo `now` all'ora "hh:mm" di Roma. */
export function nextRunAt(now, time = "01:30") {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) throw new Error(`PH_BACKUP_TIME non valida: ${time} (atteso hh:mm)`);
  const [hour, minute] = [Number(m[1]), Number(m[2])];
  let day = romeParts(now).day;
  for (let i = 0; i < 3; i++) {
    const at = romeLocalToInstant(day, hour, minute);
    if (at.getTime() > now.getTime()) return at;
    const t = new Date(`${day}T12:00:00Z`);
    t.setUTCDate(t.getUTCDate() + 1);
    day = t.toISOString().slice(0, 10);
  }
  throw new Error("nextRunAt: nessun istante trovato");
}

export const RUNS_COLLECTION = "backup_runs";
export const HEARTBEATS_COLLECTION = "service_heartbeats";

/** Spazio della cartella (fs.statfs): libero per l'utente e totale, in byte. */
export function diskOf(dir) {
  const s = fs.statfsSync(dir);
  return { path: dir, freeBytes: Number(s.bavail) * Number(s.bsize), totalBytes: Number(s.blocks) * Number(s.bsize) };
}

/** Battito del servizio di copia con lo spazio della cartella delle copie (K5, PR-17). */
export async function backupHeartbeat({ client, statusDb, dir, owner, startedAt, now = new Date() }) {
  await client
    .db(statusDb)
    .collection(HEARTBEATS_COLLECTION)
    .updateOne({ _id: "backup" }, { $set: { owner, at: now, startedAt, disk: diskOf(dir) } }, { upsert: true });
}

/** Un giro completo: copia, verifica e conservazione di ogni database; esito registrato. */
export async function runBackupOnce({ uri, dbs, statusDb, dir, now = () => new Date(), policy = DEFAULT_POLICY, log = console.log }) {
  const startedAt = now();
  const results = [];
  let ok = true;
  for (const db of dbs) {
    try {
      const folder = await backup({ uri, db, dir, log: () => {} });
      const check = await verify({ from: folder, log: () => {} });
      if (!check.ok) {
        const bad = `${folder}_NON_VALIDA`;
        fs.renameSync(folder, bad);
        throw new Error(`verifica non superata (${check.problemi.join("; ")}): copia spostata in ${path.basename(bad)}`);
      }
      const manifest = JSON.parse(fs.readFileSync(path.join(folder, "manifest.json"), "utf8"));
      const documents = Object.values(manifest.collections).reduce((n, c) => n + c.count, 0);
      const retention = applyRetention({ dir, db, now: now(), policy, log });
      results.push({ db, ok: true, folder: path.basename(folder), documents, removed: retention.removed.length });
      log(`[backup] ${db}: copia verificata ${path.basename(folder)} (${documents} documenti); conservazione: tolte ${retention.removed.length}`);
    } catch (e) {
      ok = false;
      const error = (e instanceof Error ? e.message : String(e)).slice(0, 1000);
      results.push({ db, ok: false, error });
      log(`[backup] ERRORE ${db}: ${error}`);
    }
  }
  const run = { startedAt, endedAt: now(), ok, databases: results };
  const client = await new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 }).connect();
  try {
    await client.db(statusDb).collection(RUNS_COLLECTION).insertOne(run);
  } finally {
    await client.close();
  }
  return run;
}

/** Ultimo giro riuscito (o null). */
export async function lastSuccessfulRun({ uri, statusDb }) {
  const client = await new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 }).connect();
  try {
    return await client.db(statusDb).collection(RUNS_COLLECTION).find({ ok: true }).sort({ startedAt: -1 }).limit(1).next();
  } finally {
    await client.close();
  }
}

async function main() {
  const uri = process.env.MONGO_URL;
  const statusDb = process.env.PH_DB;
  const dbs = (process.env.PH_BACKUP_DBS ?? statusDb ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const dir = path.resolve(process.env.PH_BACKUP_DIR || "/backups");
  const time = process.env.PH_BACKUP_TIME || "01:30";
  const maxAgeMs = Number(process.env.PH_BACKUP_MAX_AGE_HOURS || 26) * 3_600_000;
  if (!uri || !statusDb || dbs.length === 0) throw new Error("Servono MONGO_URL, PH_DB e PH_BACKUP_DBS");
  fs.mkdirSync(dir, { recursive: true });
  nextRunAt(new Date(), time); // convalida l'orario all'avvio

  let stopping = false;
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => (stopping = true));
  const owner = `${process.env.HOSTNAME ?? "backup"}:${process.pid}`;
  const startedAt = new Date();
  const beatClient = await new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 }).connect();
  const beat = () => backupHeartbeat({ client: beatClient, statusDb, dir, owner, startedAt }).catch((e) => console.error(`[backup] battito non registrato: ${e.message}`));
  await beat();
  // Attesa a passi di 30 s con un battito al minuto (spazio su disco compreso).
  const sleepUntil = async (at) => {
    let lastBeat = Date.now();
    while (!stopping && Date.now() < at.getTime()) {
      await new Promise((r) => setTimeout(r, Math.min(30_000, at.getTime() - Date.now())));
      if (Date.now() - lastBeat >= 60_000) {
        await beat();
        lastBeat = Date.now();
      }
    }
  };

  console.log(`[backup] avviato: ${dbs.join(", ")} → ${dir}, ogni notte alle ${time} (Europe/Rome)`);
  const last = await lastSuccessfulRun({ uri, statusDb }).catch(() => null);
  if (process.env.BACKUP_ONCE || !last || Date.now() - new Date(last.startedAt).getTime() > maxAgeMs) {
    console.log(`[backup] ${last ? "ultima copia riuscita troppo vecchia" : "nessuna copia riuscita registrata"}: copia subito`);
    await runBackupOnce({ uri, dbs, statusDb, dir }).catch((e) => console.error(`[backup] ERRORE: ${e.message}`));
  }
  while (!stopping && !process.env.BACKUP_ONCE) {
    const at = nextRunAt(new Date(), time);
    console.log(`[backup] prossima copia: ${at.toISOString()}`);
    await sleepUntil(at);
    if (stopping) break;
    await runBackupOnce({ uri, dbs, statusDb, dir }).catch((e) => console.error(`[backup] ERRORE: ${e.message}`));
    await beat();
  }
  await beatClient.close();
  console.log("[backup] fermato");
}

const SELF_NAME = /^backup-service\.(mjs|js)$/;
if (process.argv[1] && SELF_NAME.test(path.basename(process.argv[1]))) {
  main().catch((e) => {
    console.error(`[backup] ERRORE: ${e.message}`);
    process.exit(1);
  });
}
