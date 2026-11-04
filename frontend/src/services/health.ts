/**
 * Stato di salute dello stack (K5, PR-15, PR-16, PR-17; D-162, D-163). Lo legge GET /api/health, che il controllo
 * esterno (deploy/watchdog/controllo.ps1) interroga ogni 10 minuti per mandare gli avvisi.
 *
 * Controlli (ognuno ok / non ok, con un motivo leggibile e senza dati riservati):
 * - database: risponde (se no, la rotta risponde 503);
 * - dati: versione dei dati compatibile con il programma (PR-27);
 * - worker: battito recente (job degli alert e recapito delle mail);
 * - orologio: scarto del worker rispetto al database entro la soglia (gli alert partono alle 09:00 di Roma);
 * - copie: l'ultimo giro riuscito ha meno di 26 ore e l'ultimo giro non è fallito;
 * - disco: spazio libero della cartella delle copie (su D:) sopra la soglia;
 * - assistente (progetto AI §11.2): ok se spento, pronto o mai provato; non ok solo se è acceso con una configurazione
 *   errata o con il circuito del provider aperto. Mai una chiamata a Google da qui; l'AI guasta rende lo stato
 *   "degraded", mai "down": l'app continua.
 */
import type { Db } from "mongodb";
import { dataVersionProblem, store } from "@/lib/store/db";
import { circuitSnapshot } from "@/services/assistant/circuit";
import { assistantConfig, type AssistantConfig } from "@/services/assistant/config";
import { readSettings } from "@/services/assistant/settings";

export interface HealthThresholds {
  workerStaleMs: number;
  backupMaxAgeMs: number;
  clockSkewMaxMs: number;
  diskMinFreeBytes: number;
  diskMinFreeRatio: number;
}

export const DEFAULT_THRESHOLDS: HealthThresholds = {
  workerStaleMs: 5 * 60_000,
  backupMaxAgeMs: 26 * 3_600_000,
  clockSkewMaxMs: 60_000,
  diskMinFreeBytes: 20 * 1024 ** 3,
  diskMinFreeRatio: 0.1,
};

export function thresholdsFromEnv(env: NodeJS.ProcessEnv = process.env): HealthThresholds {
  const gb = Number(env.PH_DISK_MIN_FREE_GB);
  return { ...DEFAULT_THRESHOLDS, ...(Number.isFinite(gb) && gb > 0 ? { diskMinFreeBytes: gb * 1024 ** 3 } : {}) };
}

export type CheckName = "database" | "dati" | "worker" | "orologio" | "copie" | "disco" | "assistente";

export interface HealthCheck {
  ok: boolean;
  detail: string;
}

export interface HealthReport {
  status: "ok" | "degraded" | "down";
  at: string;
  checks: Record<CheckName, HealthCheck>;
}

const minutes = (ms: number) => `${Math.round(ms / 60_000)} min`;
const hours = (ms: number) => `${Math.round(ms / 3_600_000)} h`;
const gib = (b: number) => `${(b / 1024 ** 3).toFixed(1)} GB`;

export async function getHealth(db: Db, now: Date = new Date(), t: HealthThresholds = DEFAULT_THRESHOLDS, ai: AssistantConfig = assistantConfig()): Promise<HealthReport> {
  const checks = {} as Record<CheckName, HealthCheck>;
  try {
    await db.command({ ping: 1 });
    checks.database = { ok: true, detail: "risponde" };
  } catch {
    const down: HealthCheck = { ok: false, detail: "non risponde" };
    return {
      status: "down",
      at: now.toISOString(),
      checks: { database: down, dati: down, worker: down, orologio: down, copie: down, disco: down, assistente: down },
    };
  }

  const [version, worker, backupBeat, lastRun, lastOk] = await Promise.all([
    store.meta(db).findOne({ _id: "data_version" }),
    store.heartbeats(db).findOne({ _id: "worker" }),
    store.heartbeats(db).findOne({ _id: "backup" }),
    store.backupRuns(db).find().sort({ startedAt: -1 }).limit(1).next(),
    store.backupRuns(db).find({ ok: true }).sort({ startedAt: -1 }).limit(1).next(),
  ]);

  // K6, PR-27: versione dei dati compatibile con il programma in esecuzione.
  const problem = version ? dataVersionProblem(version.version) : null;
  checks.dati = !version
    ? { ok: true, detail: "versione non ancora registrata (database nuovo)" }
    : problem
      ? { ok: false, detail: problem }
      : { ok: true, detail: `versione ${version.version}` };

  const workerAge = worker ? now.getTime() - worker.at.getTime() : null;
  checks.worker =
    workerAge === null
      ? { ok: false, detail: "nessun battito registrato" }
      : workerAge > t.workerStaleMs
        ? { ok: false, detail: `ultimo battito ${minutes(workerAge)} fa` }
        : { ok: true, detail: `ultimo battito ${minutes(workerAge)} fa` };

  const skew = worker?.clockSkewMs;
  checks.orologio =
    skew === undefined
      ? { ok: false, detail: "scarto non misurato" }
      : Math.abs(skew) > t.clockSkewMaxMs
        ? { ok: false, detail: `orologio del worker fuori di ${Math.round(skew / 1000)} s rispetto al database` }
        : { ok: true, detail: `scarto ${Math.round(skew / 1000)} s` };

  if (!lastOk) checks.copie = { ok: false, detail: lastRun ? "nessuna copia riuscita; l'ultimo giro è fallito" : "nessuna copia ancora fatta" };
  else {
    const age = now.getTime() - lastOk.startedAt.getTime();
    const lastFailed = lastRun && !lastRun.ok && lastRun.startedAt.getTime() > lastOk.startedAt.getTime();
    checks.copie =
      age > t.backupMaxAgeMs
        ? { ok: false, detail: `ultima copia riuscita ${hours(age)} fa` }
        : lastFailed
          ? { ok: false, detail: `ultimo giro fallito (${lastRun.databases.filter((d) => !d.ok).map((d) => d.db).join(", ")}); ultima copia riuscita ${hours(age)} fa` }
          : { ok: true, detail: `ultima copia riuscita ${hours(age)} fa` };
  }

  const disk = backupBeat?.disk;
  if (!disk) checks.disco = { ok: false, detail: "spazio non misurato (servizio backup senza battito)" };
  else {
    const low = disk.freeBytes < t.diskMinFreeBytes || disk.freeBytes < disk.totalBytes * t.diskMinFreeRatio;
    checks.disco = { ok: !low, detail: `${gib(disk.freeBytes)} liberi su ${gib(disk.totalBytes)} nella cartella delle copie` };
  }

  checks.assistente = await assistantCheck(db, now, ai);

  const ok = Object.values(checks).every((c) => c.ok);
  return { status: ok ? "ok" : "degraded", at: now.toISOString(), checks };
}

/** Stato passivo dell'assistente: nessuna inferenza, nessun dato di utenti o costi. */
async function assistantCheck(db: Db, now: Date, cfg: AssistantConfig): Promise<HealthCheck> {
  if (!cfg.technicalEnabled) return { ok: true, detail: "spento (PH_AI_ENABLED)" };
  if (cfg.problems.length > 0) return { ok: false, detail: `configurazione non valida: ${cfg.problems.join("; ")}` };
  const settings = await readSettings(db, cfg);
  if (!settings.enabled) return { ok: true, detail: "spento dall'amministratore" };
  const c = circuitSnapshot(now);
  if (c.open) return { ok: false, detail: `servizio AI non disponibile (guasti ripetuti${c.lastFailureAt ? `, ultimo ${c.lastFailureAt}` : ""}); l'app funziona` };
  return { ok: true, detail: c.lastSuccessAt ? `pronto (ultima risposta riuscita ${c.lastSuccessAt})` : "pronto (nessuna domanda ancora in questo avvio)" };
}
