#!/usr/bin/env node
/**
 * Anteprima isolata di PracticeHub: `yarn dev:anteprima` (da frontend/).
 *
 * - Avvia un MongoDB usa-e-getta in replica set (mongo:7, transazioni D-90) su una porta libera, mai la 27017
 *   della beta (dati veri, R-15); i dati vivono solo nel container e spariscono alla chiusura.
 * - Avvia `next dev` su una porta libera (mai 3000 né 3100), raggiungibile solo da questo PC (127.0.0.1),
 *   con build in una cartella separata (.next-anteprima) per non toccare la .next delle altre sessioni.
 * - Il seed demo del modello nuovo gira solo sul database temporaneo. Mail sempre in console (SMTP disattivato).
 * - Avvia anche il worker (alert delle 09:00 e recapito delle mail, in console) sullo stesso database.
 * - Ctrl+C ferma Next e rimuove il container. Se la finestra viene chiusa di colpo:
 *   `yarn anteprima:stop` (oppure il prossimo avvio) rimuove il container rimasto.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startReplicaSet } from "./db/mongo-rs.mjs";

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = "practicehub-anteprima";
const VIETATE = new Set([3000, 3100, 27017]); // altro progetto, beta, Mongo della beta
const ADMIN_EMAIL = "admin@anteprima.local";
const ADMIN_PASSWORD = "Anteprima@2026";
const DB_NAME = "practicehub_anteprima";

// Fuori da .next-anteprima: next dev ripulisce la propria cartella all'avvio.
const PID_FILE = path.join(os.tmpdir(), "practicehub-anteprima-pid.json");
const log = (msg) => console.log(`[anteprima] ${msg}`);

function uccidiAlbero(pid) {
  if (!pid) return;
  try {
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(pid, "SIGTERM");
  } catch {
    /* processo già terminato */
  }
}

function rispondeQualcuno(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: "127.0.0.1", port });
    s.setTimeout(500);
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("timeout", () => { s.destroy(); resolve(false); });
    s.once("error", () => resolve(false));
  });
}
function siPuoAscoltare(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => s.close(() => resolve(true)));
    s.listen(port, "0.0.0.0");
  });
}
async function portaLibera(da) {
  for (let p = da; p < da + 50; p++) {
    if (VIETATE.has(p)) continue;
    if (!(await rispondeQualcuno(p)) && (await siPuoAscoltare(p))) return p;
  }
  throw new Error(`nessuna porta libera a partire da ${da}`);
}

function docker(args, opts = {}) {
  return spawnSync("docker", args, { encoding: "utf8", ...opts });
}

let next = null;
let worker = null;
let chiuso = false;
function fermaNext() {
  // Su Windows kill() non raggiunge i processi figli di next (start-server): si chiude l'intero albero.
  if (next && next.exitCode === null) uccidiAlbero(next.pid);
  if (worker && worker.exitCode === null) uccidiAlbero(worker.pid);
  fs.rmSync(PID_FILE, { force: true });
}
function chiudi(code = 0) {
  if (chiuso) return;
  chiuso = true;
  fermaNext();
  log("rimuovo il container del database temporaneo…");
  docker(["rm", "-f", CONTAINER]);
  log("anteprima chiusa.");
  process.exit(code);
}

/** Chiude processi e container di un'anteprima precedente chiusa di colpo (finestra chiusa, processo ucciso). */
function chiudiOrfani() {
  try {
    const { next: nextPid, worker: workerPid, main: mainPid } = JSON.parse(fs.readFileSync(PID_FILE, "utf8"));
    uccidiAlbero(nextPid);
    if (workerPid) uccidiAlbero(workerPid);
    if (mainPid !== process.pid) uccidiAlbero(mainPid);
    log("processi dell'anteprima precedente chiusi.");
  } catch {
    /* nessun file dei PID: niente da chiudere */
  }
  fs.rmSync(PID_FILE, { force: true });
  const esiste = docker(["ps", "-a", "-q", "--filter", `name=^/${CONTAINER}$`]).stdout.trim() !== "";
  if (esiste) docker(["rm", "-f", CONTAINER]); // il nome è solo nostro
  return esiste;
}

async function main() {
  if (docker(["version", "--format", "{{.Server.Version}}"]).status !== 0) {
    throw new Error("Docker non risponde: avvia Docker Desktop e riprova.");
  }
  if (process.argv[2] === "stop") {
    log(chiudiOrfani() ? "container dell'anteprima rimosso." : "nessun container dell'anteprima da rimuovere.");
    chiuso = true;
    return;
  }
  chiudiOrfani();

  const mongoPort = await portaLibera(27018);
  const appPort = await portaLibera(3200);
  if (VIETATE.has(mongoPort) || VIETATE.has(appPort)) throw new Error("porta vietata: mi fermo");

  // Replica set a un nodo: il modello nuovo usa le transazioni (D-90).
  log(`avvio MongoDB temporaneo (replica set) su 127.0.0.1:${mongoPort}…`);
  process.on("SIGINT", () => chiudi(0));
  process.on("SIGTERM", () => chiudi(0));
  const mongoUrl = await startReplicaSet({ name: CONTAINER, port: mongoPort });

  // Seed demo del modello nuovo nel database _v2. Dal cutover (3.5) il login usa questi utenti: l'ADMIN demo ha
  // email e password dell'anteprima (stessa password per tutti gli utenti demo, solo su questo database usa-e-getta).
  log("seed demo del modello nuovo…");
  const seed = spawnSync(
    process.execPath,
    [path.join(FRONTEND, "node_modules/tsx/dist/cli.mjs"), "scripts/seed-demo.ts", "--uri", mongoUrl, "--db", `${DB_NAME}_v2`],
    {
      cwd: FRONTEND,
      encoding: "utf8",
      env: { ...process.env, SEED_DEMO: "true", SEED_DEMO_PASSWORD: ADMIN_PASSWORD, SEED_DEMO_ADMIN_EMAIL: ADMIN_EMAIL },
    }
  );
  if (seed.status !== 0) throw new Error(`seed demo fallito: ${(seed.stderr || seed.stdout).trim()}`);
  log(seed.stdout.trim());

  const url = `http://127.0.0.1:${appPort}`;
  log(`avvio Next su ${url} (database ${DB_NAME} nel container)…`);
  next = spawn(process.execPath, [path.join(FRONTEND, "node_modules/next/dist/bin/next"), "dev", "-H", "127.0.0.1", "-p", String(appPort)], {
    cwd: FRONTEND,
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_DIST_DIR: ".next-anteprima",
      MONGO_URL: mongoUrl,
      DB_NAME,
      AUTH_SECRET: randomBytes(32).toString("hex"),
      NEXTAUTH_SECRET: undefined,
      AUTH_URL: url,
      NEXTAUTH_URL: url,
      APP_BASE_URL: url,
      AUTH_TRUST_HOST: "true",
      SMTP_HOST: "",
    },
  });
  next.on("exit", (code) => chiudi(code ?? 0));

  // Worker (alert e mail) sullo stesso database usa-e-getta; le mail finiscono in console come quelle dell'app.
  log("avvio il worker (alert e mail in console)…");
  worker = spawn(process.execPath, [path.join(FRONTEND, "node_modules/tsx/dist/cli.mjs"), "src/jobs/worker.ts"], {
    cwd: FRONTEND,
    stdio: "inherit",
    env: { ...process.env, MONGO_URL: mongoUrl, DB_NAME, APP_BASE_URL: url, SMTP_HOST: "", PH_EXPORT_DIR: "" },
  });
  worker.on("exit", (code) => {
    if (!chiuso) log(`worker terminato (codice ${code ?? "?"}): l'app resta aperta, alert e mail fermi.`);
  });
  fs.writeFileSync(PID_FILE, JSON.stringify({ main: process.pid, next: next.pid, worker: worker.pid }));

  console.log(`
  ┌──────────────────────────────────────────────────────────────┐
    Anteprima PracticeHub (dati finti, database usa-e-getta)
    Indirizzo:  ${url}/login   (solo da questo PC)
    Accesso:    ${ADMIN_EMAIL}  /  ${ADMIN_PASSWORD}
    Per fermare: Ctrl+C in questa finestra
  └──────────────────────────────────────────────────────────────┘
`);
}

main().catch((e) => {
  console.error(`[anteprima] ERRORE: ${e.message}`);
  chiudi(1);
});
