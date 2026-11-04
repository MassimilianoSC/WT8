/**
 * Job giornaliero degli alert, "alert_daily" (B7, D-43, D-97; architettura §6.4). Lo esegue il worker.
 *
 * FLUSSO (riepilogo per la revisione):
 * 1. Quando: giorno di Roma lavorativo e ora ≥ 09:00 di Roma (D-43). Nei giorni non lavorativi non si invia nulla: le
 *    scadenze sono già rinviate al primo lavorativo. Se il worker parte dopo le 09:00 il giro del giorno si fa subito.
 * 2. Un solo esecutore: lock "alert_daily" con lease e fencing token (lib/jobs/lock.ts). Chi non lo ottiene esce
 *    (LOCKED). Il lock si rinnova prima che la lease arrivi a metà; se è perso il giro si ferma senza decidere l'esito
 *    (lo decide il nuovo titolare). Ogni scrittura (pratica, esecuzione, cursore, esito) verifica il token con l'ora
 *    CORRENTE nella propria transazione (D-137 A-06, A-08).
 * 3. Una esecuzione per giorno: job_runs (jobKey, giorno di Roma). DONE non si ripete (ALREADY_DONE); RUNNING o FAILED
 *    si riprendono dal cursore (ultimo _id di pratica concluso), così un crash non rifà le pratiche già trattate.
 * 4. Per ogni pratica non archiviata, in ordine di _id, UNA transazione (runOperation) con operationId deterministica
 *    "alert_daily:<giorno>:<pratica>": un ritentativo dello stesso giorno è un replay, senza doppi effetti. Dentro:
 *    - assertFence: un worker che ha perso la lease non può scrivere (la scrittura sul lock entra in conflitto);
 *    - Fatturabile temporale: lo stesso motore delle formule (prima = dopo, giorno di Roma) → se cambia, revisione della
 *      pratica (CAS), iterazione, storico SYSTEM con il motivo;
 *    - riconciliazione degli alert (services/alerts-engine.ts): aperture a scadenza raggiunta, chiusure, ripianificazioni,
 *      un solo promemoria per episodio anche dopo un fermo di più giorni (le ancore non si accumulano);
 *    - riepilogo (openAlerts, progress).
 * 5. Dopo un fermo: al primo giro utile si valuta lo stato CORRENTE di ogni pratica: un alert scaduto si apre una volta
 *    sola, i promemoria saltati diventano uno solo. L'istante reale del recupero resta negli eventi.
 * Le mail partono dall'outbox (worker), che nella transazione del passaggio a SENDING controlla che l'alert sia ancora
 * aperto e attivo, solo nei giorni lavorativi dalle 09:00 di Roma (D-137 A-07, A-12).
 */
import { ObjectId, type ClientSession } from "mongodb";
import { isBusinessDay, nineAmRome, romeDate } from "@/lib/calendario";
import { computeFormulas } from "@/lib/engines/formulas";
import { assertFence, acquireLock, LockLostError, releaseLock, renewLock, type LockHandle } from "@/lib/jobs/lock";
import { completeRun, failRun, saveCursor, startRun, type FencedJob } from "@/lib/jobs/runs";
import { engineSnapshot, progressOf } from "@/lib/practice/detail";
import { store } from "@/lib/store/db";
import { OpLog } from "@/lib/store/oplog";
import { summaryOf } from "@/lib/store/practice-factory";
import { bumpPracticeRevision, runOperation } from "@/lib/store/transaction";
import type { DeliveryOutboxDoc, IterationDoc } from "@/lib/store/types";
import { reconcilePracticeAlerts } from "@/services/alerts-engine";
import { getCompiledVersion } from "@/services/templates";
import type { StoreDeps } from "@/services/users-v2";

export const ALERT_JOB_KEY = "alert_daily";
export const ALERT_JOB_ACTOR = "system:alert_daily";

export interface AlertJobOptions {
  owner: string;
  now?: () => Date;
  leaseMs?: number;
  /** Pratiche per blocco (tra un salvataggio del cursore e il successivo). */
  chunk?: number;
}

export type AlertJobStatus = "NOT_DUE" | "LOCKED" | "ALREADY_DONE" | "DONE" | "FAILED";

export interface AlertJobReport {
  status: AlertJobStatus;
  localDate: string;
  processed: number;
  opened: number;
  closed: number;
  reminded: number;
  fatturabileChanged: number;
  error?: string;
}

interface PracticeOutcome {
  opened: number;
  closed: number;
  reminded: number;
  fatturabileChanged: boolean;
}

export async function runAlertDaily(deps: StoreDeps, opts: AlertJobOptions): Promise<AlertJobReport> {
  const clock = opts.now ?? (() => new Date());
  const now = clock();
  const localDate = romeDate(now);
  const report: AlertJobReport = { status: "NOT_DUE", localDate, processed: 0, opened: 0, closed: 0, reminded: 0, fatturabileChanged: 0 };
  if (!isBusinessDay(localDate) || now.getTime() < nineAmRome(localDate).getTime()) return report;

  const leaseMs = opts.leaseMs ?? 10 * 60_000;
  const lock = await acquireLock(deps.db, ALERT_JOB_KEY, opts.owner, leaseMs, now);
  if (!lock) return { ...report, status: "LOCKED" };
  const job: FencedJob = { client: deps.client, db: deps.db, lock, clock };
  // Rinnovo prima che la lease sia a metà: una scrittura dopo la scadenza viene comunque rifiutata dal fencing.
  const keepLease = async () => {
    if (lock.leaseUntil.getTime() - clock().getTime() > leaseMs / 2) return;
    if (!(await renewLock(deps.db, lock, leaseMs, clock()))) throw new LockLostError(ALERT_JOB_KEY);
  };
  try {
    const run = await startRun(job, ALERT_JOB_KEY, localDate);
    if (!run) return { ...report, status: "ALREADY_DONE" };
    let cursor = (run.cursor as { after?: string } | null)?.after ? new ObjectId((run.cursor as { after: string }).after) : null;
    try {
      for (;;) {
        const batch = await store.practices(deps.db)
          .find({ archived: false, ...(cursor ? { _id: { $gt: cursor } } : {}) }, { projection: { _id: 1 } })
          .sort({ _id: 1 })
          .limit(opts.chunk ?? 50)
          .toArray();
        if (batch.length === 0) break;
        for (const p of batch) {
          await keepLease();
          const out = await processPractice(deps, lock, p._id, localDate, clock(), clock);
          report.processed++;
          report.opened += out.opened;
          report.closed += out.closed;
          report.reminded += out.reminded;
          if (out.fatturabileChanged) report.fatturabileChanged++;
          cursor = p._id;
        }
        await saveCursor(job, run, { after: cursor!.toHexString() });
        await keepLease();
      }
      await completeRun(job, run);
      return { ...report, status: "DONE" };
    } catch (e) {
      // Con il lock perso l'esito lo decide il nuovo titolare: failRun non scrive nulla.
      await failRun(job, run, e);
      return { ...report, status: "FAILED", error: e instanceof Error ? e.message : String(e) };
    }
  } finally {
    await releaseLock(deps.db, lock);
  }
}

/**
 * Una pratica, una transazione (operationId deterministica per giorno: un ritentativo è un replay). `now` è l'ora
 * funzionale dell'operazione (aperture, storico), stabile nei ritentativi; `fenceClock` l'ora CORRENTE con cui ogni
 * tentativo verifica la lease (D-137 A-06).
 */
export async function processPractice(
  deps: StoreDeps,
  lock: LockHandle,
  practiceId: ObjectId,
  localDate: string,
  now: Date,
  fenceClock: () => Date = () => new Date()
): Promise<PracticeOutcome> {
  const { result } = await runOperation<PracticeOutcome>(
    deps.client,
    deps.db,
    { actorId: ALERT_JOB_ACTOR, operationId: `${ALERT_JOB_KEY}:${localDate}:${practiceId.toHexString()}`, request: { alertDaily: localDate }, practiceId, now },
    async (ctx) => {
      await assertFence(ctx, lock, fenceClock());
      const { db, session } = ctx;
      const none: PracticeOutcome = { opened: 0, closed: 0, reminded: 0, fatturabileChanged: false };
      const practice = await store.practices(db).findOne({ _id: practiceId }, { session });
      if (!practice || practice.archived) return none;
      const iteration = await store.iterations(db).findOne({ _id: practice.currentIterationId }, { session });
      if (!iteration) return none;
      const rows = await store.repeatRows(db).find({ iterationId: iteration._id }, { session }).toArray();
      const compiled = await getCompiledVersion(practice.templateId, iteration.templateVersion, async () => db);
      const log = new OpLog(ctx, { id: null, name: null });
      const ref = { practiceId, iterationId: iteration._id, n: iteration.n, templateVersion: iteration.templateVersion };

      // Fatturabile temporale (D-37): stesso motore, nessuna scrittura manuale, giorno di Roma.
      const snap = engineSnapshot(iteration, rows);
      const formulas = computeFormulas({
        templateId: practice.templateId,
        template: compiled.template,
        bindings: compiled.bindings,
        before: snap,
        after: snap,
        today: localDate,
        now: ctx.now,
        operationId: ctx.operationId,
        actorId: null,
        manualWrites: new Set(),
        fatturabileWritten: false,
      });
      let next: IterationDoc = iteration;
      const fatturabileChanged = formulas.transversal.fatturabile !== undefined && formulas.transversal.fatturabile !== iteration.transversal.fatturabile;
      if (formulas.systemChanges.length) {
        const revision = await bumpPracticeRevision(ctx, practiceId, practice.revision);
        next = {
          ...iteration,
          values: { ...iteration.values, ...formulas.values },
          transversal: { ...iteration.transversal, ...formulas.transversal },
          formulaMeta: { ...iteration.formulaMeta, ...formulas.formulaMeta },
        };
        await store.iterations(db).updateOne({ _id: iteration._id }, { $set: { values: next.values, transversal: next.transversal, formulaMeta: next.formulaMeta } }, { session });
        for (const c of formulas.systemChanges) log.field(ref, revision, { kind: "FIELD", target: c.target, oldValue: c.oldValue, newValue: c.newValue, detail: `${c.reason} (controllo giornaliero)`, source: "SYSTEM" });
      }

      const alerts = await reconcilePracticeAlerts({ ctx, practice, iteration: next, rows, template: compiled.template, actor: null, log });
      await store.practices(db).updateOne(
        { _id: practiceId },
        { $set: { currentSummary: summaryOf(next, alerts.openAlerts, progressOf(compiled.template, next, rows)) } },
        { session }
      );
      await log.flush();
      return { opened: alerts.opened, closed: alerts.closed, reminded: alerts.reminded, fatturabileChanged };
    }
  );
  return result;
}

/**
 * Autorizzazione dell'outbox per le mail degli alert (architettura §6.5, D-137 A-07): letta DENTRO la transazione del
 * passaggio a SENDING, l'alert deve essere ancora aperto e attivo (non chiuso, sospeso per archivio o sostituito da una
 * ripresentazione). null = si può inviare.
 */
export async function authorizeAlertMail(
  db: StoreDeps["db"],
  item: Pick<DeliveryOutboxDoc, "eventKey" | "alertId">,
  session?: ClientSession
): Promise<string | null> {
  const m = /^alert:([0-9a-f]{24}):/.exec(item.eventKey);
  const alertId = item.alertId ?? (m ? new ObjectId(m[1]) : null);
  if (!alertId) return null;
  const a = await store.alerts(db).findOne({ _id: alertId }, { session, projection: { status: 1, executionStatus: 1 } });
  if (!a) return "Alert non più presente: mail non inviata";
  if (a.status !== "OPEN") return "Alert già chiuso: mail non inviata";
  if (a.executionStatus !== "ACTIVE") return `Alert ${a.executionStatus === "SUSPENDED" ? "sospeso (pratica archiviata)" : "sostituito da una ripresentazione"}: mail non inviata`;
  return null;
}
