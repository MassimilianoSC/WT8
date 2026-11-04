/**
 * Prototipo dell'assistente con il modello vero (A4b, progetto AI §12, D-179) — da frontend/:
 *
 *   GOOGLE_CLOUD_PROJECT=… PH_AI_LOCATION=eu GOOGLE_APPLICATION_CREDENTIALS=<file della chiave> \
 *   npx tsx scripts/assistant-prototype.ts --uri "mongodb://127.0.0.1:27021/?directConnection=true" \
 *     --model gemini-3.8-flash --thinking LOW --reps 3 --burst 0 --out <file.json> --budget <file del conteggio>
 *
 * - SOLO dati sintetici: seed S0 e fixture E su due database usa-e-getta nuovi (stesse protezioni dello script di
 *   azzeramento; mai 27017 né database di esercizio), cancellati alla fine.
 * - Tetto rigido di 150 domande in tutto il prototipo: il conteggio sta nel file --budget e lo script si ferma
 *   PRIMA di superarlo.
 * - La chiave dell'account di servizio la legge solo l'SDK (GOOGLE_APPLICATION_CREDENTIALS): lo script non la apre.
 * - Il file --out contiene le risposte (dati sintetici) per la valutazione della qualità; resta fuori dal repository.
 */
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { store } from "../src/lib/store/db";
import { assistantConfig } from "../src/services/assistant/config";
import { prepareQuestion, streamAnswer } from "../src/services/assistant/orchestrator";
import { createProvider } from "../src/services/assistant/provider";
import { resetGate } from "../src/services/assistant/quota";
import { toUserDTO } from "../src/services/users-v2";
import { applyFixtureE, E_NOW, eIds, seedS0 } from "../tests/fixtures/assistant-e";
import { parseArgs } from "./db/backup-db.mjs";
import { assertDisposableTarget } from "./db/guard";

const MAX_QUESTIONS = 150;

interface Q {
  id: string;
  dataset: "S0" | "E";
  user: string;
  text: string;
  oracle: string;
}

/** Le 10 domande del §12 (A04 sostituita da S25: la fixture A vive solo nella prova analytics, senza seed). */
const QUESTIONS: Q[] = [
  { id: "S01", dataset: "S0", user: "admin", text: "Quante pratiche attive abbiamo?", oracle: "7, KPI activeTotal, fonte STATS" },
  { id: "S07", dataset: "S0", user: "pm", text: "Qual è il tempo medio e mediano di chiusura dall'1 al 9 ottobre?", oracle: "non calcolabile: nessuna terminata, media e mediana assenti (non zero giorni)" },
  { id: "S15", dataset: "S0", user: "pm", text: "Apri la pratica con G7 1000002.", oracle: "due pratiche (Milano Bovisa e Milano Lambrate): chiedere quale, non sceglierne una" },
  { id: "S21", dataset: "S0", user: "pm", text: "Cosa è previsto la prossima settimana in ILIAD?", oracle: "periodo 12-18/10; Forecast Protocollo IL-TO-0001 il 15/10" },
  { id: "S25", dataset: "S0", user: "pm", text: "Quale forecast ARPA di TIM è in ritardo e non concluso?", oracle: "riga 2, forecast 20/09, parere vuoto; la riga 1 conclusa non va inclusa" },
  { id: "S29", dataset: "S0", user: "pm", text: "Quali erano le note della vecchia integrazione INWIT?", oracle: "iterazione 1: \"Documentazione integrativa richiesta\", richiesta 01/07, invio 20/07" },
  { id: "E01", dataset: "E", user: "pm", text: "Quali consegne UT sono previste dal 12 al 18 ottobre?", oracle: "IL-TO-0001, Forecast UT 14/10 (non PE)" },
  { id: "E03", dataset: "E", user: "pm", text: "Quali consegne PE sono state effettuate dall'1 al 9 ottobre?", oracle: "TN-MI-0001, Invio PE 08/10 (registrata, non il forecast del 15/10)" },
  { id: "E07", dataset: "E", user: "pm.leader", text: "Perché la pratica ILIAD IL-TO-0001 è ferma?", oracle: "nota PM: attesa documento del committente dal 07/10; nota UT: relazione strutturale da completare; nessuna causa unica certa; fonti delle due note" },
  { id: "E10", dataset: "E", user: "ut", text: "Trova le note che citano il documento del committente.", oracle: "nessun riscontro nelle note visibili (la nota PM non è visibile all'UT)" },
];

interface Result {
  id: string;
  rep: number;
  model: string;
  user: string;
  ok: boolean;
  answerState: string | null;
  errorCode: string | null;
  firstStatusMs: number | null;
  firstTextMs: number | null;
  doneMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  tools: string[];
  toolCalls?: unknown[];
  facts: unknown[];
  sources: number;
  answer: string;
  oracle: string;
  question: string;
}

async function ask(db: Db, client: MongoClient, q: { user: string; text: string }, cfg: ReturnType<typeof assistantConfig>): Promise<Omit<Result, "id" | "rep" | "model" | "oracle">> {
  await store.assistantUsage(db).deleteMany({}); // i limiti per persona non c'entrano con le misure
  const userDoc = (await store.users(db).findOne({ _id: eIds.user(q.user) })) ?? (await store.users(db).findOne({ email: `${q.user}@prova.local` }));
  const user = toUserDTO(userDoc!);
  const provider = createProvider(cfg);
  if (!provider) throw new Error(`configurazione non valida: ${cfg.problems.join("; ")}`);
  const requestId = randomUUID();
  const t0 = Date.now();
  const p = await prepareQuestion({ deps: { client, db }, user, request: { requestId, text: q.text }, now: E_NOW, cfg, provider });
  let firstStatus: number | null = null;
  let firstText: number | null = null;
  let answer = "";
  let terminal: { type: string; answerState?: string; code?: string } | null = null;
  let facts: unknown[] = [];
  let sources = 0;
  const toolCalls: unknown[] = [];
  await streamAnswer(
    p,
    (e) => {
      const ev = e as { type: string; text?: string; items?: unknown[]; answerState?: string; code?: string };
      if (ev.type === "status" && firstStatus === null) firstStatus = Date.now() - t0;
      if (ev.type === "delta") {
        if (firstText === null) firstText = Date.now() - t0;
        answer += ev.text ?? "";
      }
      if (ev.type === "facts") facts = ev.items ?? [];
      if (ev.type === "source") sources++;
      if (ev.type === "done" || ev.type === "error") terminal = ev;
    },
    new AbortController().signal,
    { onTool: (name, toolArgs, o) => toolCalls.push({ name, args: toolArgs, ...o }) }
  );
  const doneMs = Date.now() - t0;
  const log = await store.assistantLog(db).findOne({ requestId });
  const t = terminal as { type: string; answerState?: string; code?: string } | null;
  return {
    user: q.user,
    question: q.text,
    ok: t?.type === "done",
    answerState: t?.answerState ?? null,
    errorCode: t?.code ?? null,
    firstStatusMs: firstStatus,
    firstTextMs: firstText,
    doneMs,
    inputTokens: log?.inputTokens ?? null,
    outputTokens: log?.outputTokens ?? null,
    tools: (log?.tools ?? []).map((x) => `${x.name}:${x.ok ? x.rows : "ERR"}`),
    toolCalls,
    facts,
    sources,
    answer,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const uri = String(args.uri ?? "");
  const model = String(args.model ?? "");
  const thinking = String(args.thinking ?? "LOW");
  const reps = Number(args.reps ?? 3);
  const burst = Number(args.burst ?? 0);
  const out = String(args.out ?? "");
  const budgetFile = String(args.budget ?? "");
  const only = typeof args.only === "string" ? new Set(args.only.split(",")) : null;
  if (!uri || !model || !out || !budgetFile) throw new Error("servono --uri, --model, --out, --budget");

  const env = { ...process.env, PH_AI_ENABLED: "true", PH_AI_PROVIDER: "vertex", PH_AI_MODEL: model, PH_AI_THINKING_LEVEL: thinking, NEW_DB_NAME: "practicehub_test_ai_prototipo" };
  const cfg = assistantConfig(env);
  if (cfg.problems.length) throw new Error(`configurazione: ${cfg.problems.join("; ")}`);
  if (cfg.location !== "eu") throw new Error("D-179: solo la location eu");

  const questions = QUESTIONS.filter((q) => !only || only.has(q.id));
  const planned = questions.length * reps + burst;
  const used = fs.existsSync(budgetFile) ? Number(fs.readFileSync(budgetFile, "utf8").trim() || "0") : 0;
  if (used + planned > MAX_QUESTIONS) throw new Error(`tetto del prototipo: già ${used} domande, questo giro ne farebbe ${planned} (massimo ${MAX_QUESTIONS})`);

  const stamp = Date.now();
  const names = { S0: `practicehub_test_ai_proto_s0_${stamp}`, E: `practicehub_test_ai_proto_e_${stamp}` };
  for (const n of Object.values(names)) assertDisposableTarget(uri, n);
  const client = await new MongoClient(uri, { serverSelectionTimeoutMS: 5000 }).connect();
  const dbs = { S0: client.db(names.S0), E: client.db(names.E) };
  let asked = 0;
  const results: Result[] = [];
  const save = () => {
    fs.writeFileSync(budgetFile, String(used + asked));
    fs.writeFileSync(out, JSON.stringify({ model, thinking, location: cfg.location, at: new Date().toISOString(), asked, results }, null, 1));
  };
  try {
    await seedS0(dbs.S0);
    await seedS0(dbs.E);
    await applyFixtureE(dbs.E);
    for (const db of Object.values(dbs)) {
      await store.assistantSettings(db).insertOne({ _id: "global", enabled: true, dailyLimit: 100, perMinuteLimit: 10, revision: 1, updatedAt: new Date(), updatedBy: null, updatedByName: null });
    }
    for (let rep = 1; rep <= reps; rep++) {
      for (const q of questions) {
        resetGate();
        asked++;
        const r = await ask(dbs[q.dataset], client, q, cfg);
        results.push({ ...r, id: q.id, rep, model, oracle: q.oracle });
        save();
        console.log(`${q.id} r${rep} ${r.ok ? r.answerState : r.errorCode} prime parole ${r.firstTextMs ?? "-"} ms, fine ${r.doneMs} ms, token ${r.inputTokens}/${r.outputTokens}`);
      }
    }
    if (burst > 0) {
      // Raffica: `burst` persone diverse insieme (una domanda per persona), stessa domanda S01.
      const ids: string[] = [];
      for (let i = 1; i <= burst; i++) {
        const _id = new ObjectId();
        await store.users(dbs.S0).insertOne({ _id, email: `raffica${i}@prova.local`, name: `Raffica ${i}`, passwordHash: null, status: "active", isAdmin: true, memberships: [], authVersion: 1, createdAt: new Date(), updatedAt: new Date() });
        ids.push(`raffica${i}`);
      }
      resetGate();
      await store.assistantUsage(dbs.S0).deleteMany({});
      const t0 = Date.now();
      asked += burst;
      const rs = await Promise.all(ids.map((u) => ask(dbs.S0, client, { user: u, text: QUESTIONS[0].text }, cfg).catch((e) => ({ error: (e as { extra?: { code?: string } }).extra?.code ?? (e as Error).message }))));
      rs.forEach((r, i) => {
        if ("error" in r) results.push({ id: "BURST", rep: i + 1, model, user: ids[i], ok: false, answerState: null, errorCode: String(r.error), firstStatusMs: null, firstTextMs: null, doneMs: Date.now() - t0, inputTokens: null, outputTokens: null, tools: [], facts: [], sources: 0, answer: "", oracle: QUESTIONS[0].oracle, question: QUESTIONS[0].text });
        else results.push({ ...r, id: "BURST", rep: i + 1, model, oracle: QUESTIONS[0].oracle });
      });
      save();
      console.log(`raffica di ${burst}: ${Date.now() - t0} ms in tutto`);
    }
  } finally {
    save();
    for (const n of Object.values(names)) await client.db(n).dropDatabase();
    await client.close();
    console.log(`domande di questo giro: ${asked}; totale del prototipo: ${used + asked}/${MAX_QUESTIONS}`);
  }
}

main().catch((e) => {
  console.error(`ERRORE: ${(e as Error).message}`);
  process.exitCode = 1;
});
