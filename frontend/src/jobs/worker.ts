/**
 * Worker dei job (B7, architettura §6.4): processo separato della stessa applicazione, mai un timer in un route
 * handler. A ogni giro: il job giornaliero degli alert (services/alerts-job.ts: alle 09:00 di Roma nei giorni
 * lavorativi, una volta per giorno, con lock e fencing) e il recapito delle mail dell'outbox. Più worker possono
 * girare insieme: il job ha un solo esecutore, ogni messaggio è preso in carico da uno solo.
 *
 *   yarn worker            (sviluppo: tsx; MONGO_URL, DB_NAME / NEW_DB_NAME, SMTP_* come l'app)
 *   WORKER_ONCE=1 yarn worker   (un solo giro, poi esce)
 *
 * Il pacchetto per Docker (bundle senza tsx né sorgenti) arriva con il packaging del worker (R-5).
 */
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { sendMail } from "@/lib/email";
import { deliverBatch, type MailSender } from "@/lib/jobs/outbox-delivery";
import { authorizeAlertMail, runAlertDaily } from "@/services/alerts-job";
import { runExportDaily } from "@/services/export-daily";
import { ensureStoreBootstrapped, getStoreDb, store, storeDbName } from "@/lib/store/db";
import type { Db } from "mongodb";
import { getClient } from "@/lib/db";

const POLL_MS = Number(process.env.WORKER_POLL_MS || 15_000);
const owner = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
const send: MailSender = async (m) => {
  await sendMail(m);
};

let stopping = false;
const startedAt = new Date();
/** Oltre questo scarto l'orologio del PC è sbagliato: alert alle 09:00 e giorni di Roma ne dipendono (PR-15). */
const CLOCK_SKEW_MAX_MS = 60_000;

/**
 * Battito del worker (K5): scarto dell'orologio rispetto al database (metà del tempo di andata e ritorno compensata)
 * e ora dell'ultimo giro. /api/health e il controllo esterno lo leggono.
 */
async function heartbeat(db: Db): Promise<number> {
  const sent = Date.now();
  const hello = (await db.command({ hello: 1 })) as { localTime?: Date };
  const received = Date.now();
  const dbTime = hello.localTime ? new Date(hello.localTime).getTime() : received;
  const skew = Math.round((sent + received) / 2 - dbTime);
  await store.heartbeats(db).updateOne(
    { _id: "worker" },
    { $set: { owner, at: new Date(received), startedAt, clockSkewMs: skew } },
    { upsert: true }
  );
  return skew;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function tick(): Promise<void> {
  const db = await getStoreDb();
  const client = await getClient();
  await heartbeat(db);
  const daily = await runAlertDaily({ client, db }, { owner });
  if (daily.status === "DONE" || daily.status === "FAILED") {
    console.log(`[worker ${owner}] alert_daily ${daily.localDate}: ${daily.status}, pratiche ${daily.processed}, aperti ${daily.opened}, chiusi ${daily.closed}, promemoria ${daily.reminded}${daily.error ? `, errore: ${daily.error}` : ""}`);
  }
  // PR-18: export CSV giornaliero per gestore (piano B se l'app è ferma), solo se la cartella è configurata.
  if (process.env.PH_EXPORT_DIR) {
    const exp = await runExportDaily({ client, db }, { owner, dir: process.env.PH_EXPORT_DIR, time: process.env.PH_EXPORT_TIME || "06:30" });
    if (exp.status === "DONE" || exp.status === "FAILED") {
      console.log(`[worker ${owner}] export_daily ${exp.localDate}: ${exp.status}, file ${exp.files.length}, cartelle vecchie tolte ${exp.removed.length}${exp.error ? `, errore: ${exp.error}` : ""}`);
    }
  }
  const report = await deliverBatch({ client, db }, send, { owner, authorize: (item, session) => authorizeAlertMail(db, item, session) });
  if (Object.values(report).some((n) => n > 0)) {
    console.log(
      `[worker ${owner}] outbox: inviate ${report.sent}, da ritentare ${report.retried}, fallite ${report.failed}, annullate ${report.cancelled}, rinviate all'orario lavorativo ${report.deferred}, riprese da altri ${report.lost}`
    );
  }
  // D-139: fino al monitor esterno (PR-16) l'avviso è in-app agli ADMIN più questa riga d'errore.
  if (report.warned > 0) console.error(`[worker ${owner}] ATTENZIONE: mail non recapitate (errori da oltre un'ora o rifiuti definitivi): avvisati gli ADMIN`);
}

async function main(): Promise<void> {
  const db = await getStoreDb();
  await ensureStoreBootstrapped(db);
  console.log(`[worker ${owner}] avviato su ${storeDbName()} (giro ogni ${POLL_MS} ms) alle ${startedAt.toISOString()}`);
  const skew = await heartbeat(db);
  if (Math.abs(skew) > CLOCK_SKEW_MAX_MS) {
    console.error(`[worker ${owner}] ATTENZIONE: orologio fuori di ${Math.round(skew / 1000)} s rispetto al database: verificare l'ora del PC (PR-15)`);
  } else console.log(`[worker ${owner}] orologio: scarto ${Math.round(skew / 1000)} s rispetto al database`);
  for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => (stopping = true));
  do {
    try {
      await tick();
    } catch (e) {
      // Un errore di un giro non ferma il worker: il giro dopo riprova (i messaggi presi restano in lease).
      console.error(`[worker ${owner}] errore:`, e instanceof Error ? e.message : e);
    }
    if (process.env.WORKER_ONCE) break;
    for (let waited = 0; waited < POLL_MS && !stopping; waited += 500) await sleep(500);
  } while (!stopping);
  await (await getClient()).close();
  console.log(`[worker ${owner}] fermato`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
