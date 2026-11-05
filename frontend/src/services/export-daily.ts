/**
 * Export CSV periodico (PR-18): piano B leggibile se l'app è ferma. Lo esegue il worker.
 *
 * - Ogni giorno, dalle PH_EXPORT_TIME di Roma (default 06:30, prima dell'inizio del lavoro): per ogni gestore un CSV
 *   per Excel italiano (stesso formato dell'export dell'app) con TUTTE le pratiche non archiviate e tutte le Note
 *   Operative, in <dir>/<AAAA-MM-GG>/WT8_<gestore>_<AAAA-MM-GG>.csv.
 * - Un solo esecutore (lock "export_daily") e un'esecuzione per giorno (job_runs): un secondo worker o un riavvio
 *   non rifanno il lavoro; un giro fallito si riprende al giro successivo.
 * - File scritti prima con un nome temporaneo e poi rinominati: chi apre la cartella non vede mai un file a metà.
 * - Conservazione: si tengono le cartelle degli ultimi `keepDays` giorni (default 7); si cancellano solo cartelle
 *   con il nome di una data, mai altri file.
 */
import fs from "node:fs";
import path from "node:path";
import type { UserDTO } from "@/lib/contract";
import { TEMPLATE_IDS } from "@/lib/contract";
import { romeDate, romeTime } from "@/lib/calendario";
import { acquireLock, releaseLock } from "@/lib/jobs/lock";
import { completeRun, failRun, startRun } from "@/lib/jobs/runs";
import { exportPractices } from "@/services/practices-v2/export";
import type { StoreDeps } from "@/services/users-v2";

export const EXPORT_JOB_KEY = "export_daily";

/** Amministratore di sistema per l'export: vede tutte le pratiche e tutte le note. */
const SYSTEM_EXPORTER: UserDTO = {
  id: "000000000000000000000000",
  name: "Export automatico",
  email: "export@practicehub.local",
  status: "active",
  isAdmin: true,
  memberships: [],
  createdAt: "",
  updatedAt: "",
};

export interface ExportDailyOptions {
  owner: string;
  dir: string;
  now?: () => Date;
  /** Ora di Roma "hh:mm" da cui si esporta. */
  time?: string;
  keepDays?: number;
}

export interface ExportDailyReport {
  status: "NOT_DUE" | "LOCKED" | "ALREADY_DONE" | "DONE" | "FAILED";
  localDate: string;
  files: string[];
  removed: string[];
  error?: string;
}

const DATE_DIR = /^\d{4}-\d{2}-\d{2}$/;

/** Cartelle-data più vecchie degli ultimi `keepDays` giorni (oggi compreso); nient'altro. */
export function exportFoldersToRemove(names: string[], today: string, keepDays: number): string[] {
  const keep = new Set<string>();
  const t = new Date(`${today}T12:00:00Z`);
  for (let i = 0; i < keepDays; i++) keep.add(new Date(t.getTime() - i * 86_400_000).toISOString().slice(0, 10));
  return names.filter((n) => DATE_DIR.test(n) && n < today && !keep.has(n)).sort();
}

export async function runExportDaily(deps: StoreDeps, opts: ExportDailyOptions): Promise<ExportDailyReport> {
  const clock = opts.now ?? (() => new Date());
  const now = clock();
  const localDate = romeDate(now);
  const report: ExportDailyReport = { status: "NOT_DUE", localDate, files: [], removed: [] };
  const [h, m] = (opts.time ?? "06:30").split(":").map(Number);
  if (now.getTime() < romeTime(localDate, h, m).getTime()) return report;

  const lock = await acquireLock(deps.db, EXPORT_JOB_KEY, opts.owner, 10 * 60_000, now);
  if (!lock) return { ...report, status: "LOCKED" };
  const job = { client: deps.client, db: deps.db, lock, clock };
  try {
    const run = await startRun(job, EXPORT_JOB_KEY, localDate);
    if (!run) return { ...report, status: "ALREADY_DONE" };
    try {
      const target = path.join(opts.dir, localDate);
      fs.mkdirSync(target, { recursive: true });
      for (const templateId of TEMPLATE_IDS) {
        const csv = await exportPractices(deps.db, SYSTEM_EXPORTER, { templateId, archived: false, scope: "all" }, now);
        const file = path.join(target, csv.filename);
        fs.writeFileSync(`${file}.tmp`, csv.body, "utf8");
        fs.renameSync(`${file}.tmp`, file);
        report.files.push(path.relative(opts.dir, file));
      }
      const old = exportFoldersToRemove(fs.readdirSync(opts.dir), localDate, opts.keepDays ?? 7);
      for (const name of old) fs.rmSync(path.join(opts.dir, name), { recursive: true, force: true });
      report.removed = old;
      await completeRun(job, run);
      return { ...report, status: "DONE" };
    } catch (e) {
      await failRun(job, run, e);
      return { ...report, status: "FAILED", error: e instanceof Error ? e.message : String(e) };
    }
  } finally {
    await releaseLock(deps.db, lock);
  }
}
