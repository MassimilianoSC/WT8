/**
 * Dati SINTETICI per Andamento (contratto §15): pratiche con una storia plausibile di stati, Assegna, import,
 * rilavorazioni, ripresentazioni, archivio, forecast e completamenti, modifiche dei gruppi e alert. Servono alla prova
 * di prestazioni (migliaia di pratiche) e all'anteprima usa e getta di o3 (qualche decina). Deterministico a parità di
 * seme. Scrive direttamente le collezioni (nessun comando, nessuna mail, nessuna notifica): mai su un database vero.
 */
import { ObjectId, type Db } from "mongodb";
import { TEMPLATE_IDS, type FieldValue, type GroupId, type StatoAttivita, type TemplateId } from "@/lib/contract";
import { romeDate } from "@/lib/calendario";
import { PRODUCTION_DB_NAMES, bootstrapStore, store } from "../../src/lib/store/db";
import { buildNewPractice, summaryOf } from "../../src/lib/store/practice-factory";
import type { AlertDoc, PracticeEventDoc, ValueHistoryDoc } from "../../src/lib/store/types";
import { COMPILED_TEMPLATES } from "../../src/lib/templates/compiled";
import { milestonePairs, ownerOf } from "../../src/services/andamento/extra";

const DAY = 86_400_000;

export interface SyntheticOptions {
  practices: number;
  years: number;
  seed?: number;
  now?: Date;
  /** Eventi e modifiche «di contorno» (commenti, alert, campi PM) per arrivare a volumi realistici. */
  filler?: boolean;
  log?: (m: string) => void;
}

export interface SyntheticReport {
  practices: number;
  events: number;
  history: number;
  alerts: number;
  rows: number;
}

/** PRNG deterministico (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, chance: (p: number) => next() < p, int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)), pick: <T>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)] };
}

/** Durata media (giorni) della permanenza in ogni stato: i colli di bottiglia sintetici sono PROTOCOLLATO e AUTORIZZATO. */
const MEAN_DAYS: Partial<Record<StatoAttivita, number>> = { CREATA: 3, ASSEGNATO: 8, IN_APPROVAZIONE: 12, PROTOCOLLATO: 35, INTEGRAZIONE_RICHIESTA: 20, AUTORIZZATO: 40, DINIEGATO: 25, TAR: 60, REALIZZATO: 18, STAND_BY: 45 };

/** Percorso degli stati: lineare con varianti (integrazione, diniego e TAR, stand-by, KO). */
function path(r: ReturnType<typeof rng>): StatoAttivita[] {
  const p: StatoAttivita[] = ["ASSEGNATO"];
  if (r.chance(0.4)) p.push("IN_APPROVAZIONE");
  p.push("PROTOCOLLATO");
  if (r.chance(0.3)) p.push("INTEGRAZIONE_RICHIESTA", "PROTOCOLLATO");
  if (r.chance(0.08)) {
    p.push("DINIEGATO");
    if (r.chance(0.4)) p.push("TAR");
    p.push(r.chance(0.5) ? "KO" : "AUTORIZZATO");
    if (p[p.length - 1] === "KO") return p;
  } else p.push("AUTORIZZATO");
  if (r.chance(0.1)) p.push("STAND_BY", "AUTORIZZATO");
  if (r.chance(0.04)) return [...p, "KO"];
  p.push("REALIZZATO", "TERMINATO");
  return p;
}

export async function generateSynthetic(db: Db, o: SyntheticOptions): Promise<SyntheticReport> {
  if (PRODUCTION_DB_NAMES.includes(db.databaseName)) throw new Error(`Rifiutato: "${db.databaseName}" è il database di esercizio (dati sintetici solo su database usa e getta)`);
  const r = rng(o.seed ?? 1);
  const now = (o.now ?? new Date()).getTime();
  const start0 = now - o.years * 365 * DAY;
  const log = o.log ?? (() => {});
  await bootstrapStore(db, new Date(start0));

  const report: SyntheticReport = { practices: 0, events: 0, history: 0, alerts: 0, rows: 0 };
  let batch = { practices: [] as unknown[], iterations: [] as unknown[], rows: [] as unknown[], events: [] as PracticeEventDoc[], history: [] as ValueHistoryDoc[], alerts: [] as AlertDoc[] };
  const flush = async () => {
    if (batch.practices.length) await store.practices(db).insertMany(batch.practices as never[], { ordered: false });
    if (batch.iterations.length) await store.iterations(db).insertMany(batch.iterations as never[], { ordered: false });
    if (batch.rows.length) await store.repeatRows(db).insertMany(batch.rows as never[], { ordered: false });
    if (batch.events.length) await store.events(db).insertMany(batch.events, { ordered: false });
    if (batch.history.length) await store.valueHistory(db).insertMany(batch.history, { ordered: false });
    if (batch.alerts.length) await store.alerts(db).insertMany(batch.alerts, { ordered: false });
    report.events += batch.events.length;
    report.history += batch.history.length;
    report.alerts += batch.alerts.length;
    report.rows += batch.rows.length;
    batch = { practices: [], iterations: [], rows: [], events: [], history: [], alerts: [] };
  };

  let seq = 0;
  const makePractice = (i: number, templateId: TemplateId, createdAt: number, origin: { id: ObjectId; codiceSito: string } | null) => {
    const template = COMPILED_TEMPLATES[templateId].template;
    const practiceId = new ObjectId();
    const iterationId = new ObjectId();
    const code = `SY-${templateId.slice(0, 3)}-${String(i).padStart(5, "0")}${origin ? "R" : ""}`;
    const built = buildNewPractice({
      practiceId,
      iterationId,
      templateId,
      template,
      identity: { codiceG7: String(9_000_000 + i), codiceSito: code, nomeSito: `Sito sintetico ${i}${origin ? " (rilavorazione)" : ""}`, committente: { code: templateId }, clienteFinale: { code: templateId } },
      createdBy: null,
      originPracticeId: origin?.id ?? null,
      now: new Date(createdAt),
    });
    const owner = ownerOf(templateId);
    const pairs = milestonePairs(templateId).filter((e) => !e.repeatGroup);
    const groupField = (g: GroupId) => [...owner].find(([f, og]) => og === g && !pairs.some((p) => p.flowId === f || p.completionFlowId === f))?.[0];
    const ref = { practiceId, iterationId, n: 1 };

    const events: PracticeEventDoc[] = [];
    const history: ValueHistoryDoc[] = [];
    let evIndex = 0;
    const op = () => `sintetico-${seq++}`;
    const event = (kind: PracticeEventDoc["kind"], at: number, opId: string, extra: Partial<PracticeEventDoc> = {}) =>
      events.push({ _id: new ObjectId(), operationId: opId, opKey: `sintetico:${opId}`, eventIndex: evIndex++, ...ref, kind, actorId: null, actorName: null, source: "USER", timestamp: new Date(at), detail: kind, ...extra });
    let chIndex = 0;
    const change = (flowId: string, at: number, oldValue: FieldValue, newValue: FieldValue, source: ValueHistoryDoc["source"] = "USER") =>
      history.push({ _id: new ObjectId(), operationId: op(), opKey: `sintetico:h${seq}`, changeIndex: chIndex++, ...ref, templateVersion: template.version, kind: "FIELD", target: { flowId }, oldValue, newValue, actorId: null, actorName: null, source, timestamp: new Date(at), revision: 1 });

    // Storia degli stati.
    const steps = path(r);
    const fromImport = !origin && r.chance(0.15);
    const importAt = fromImport ? r.int(1, steps.length - 1) : -1;
    let t = createdAt;
    let current: StatoAttivita = "CREATA";
    const enabled = new Set<GroupId>(["PM_PERMESSI"]);
    const firstOp = op();
    if (origin) event("REWORK", t, firstOp, { structuredDetail: { originPracticeId: origin.id.toHexString(), originIteration: 1 } });
    else event("CREATE", t, firstOp, fromImport ? { source: "IMPORT" } : {});
    if (fromImport) event("IMPORT", t, firstOp, { source: "IMPORT" });
    const values: Record<string, FieldValue> = {};
    const assign = (g: GroupId, at: number, opId: string) => {
      const added = enabled.has(g) ? [] : [g];
      enabled.add(g);
      event("ASSIGN", at, opId, { structuredDetail: { groups: [g], added } });
      if (!added.length || opId === firstOp) return;
      const f = groupField(g);
      const startAt = at + r.int(2, 120) * 3_600_000;
      if (f && startAt < now) change(f, startAt, null, "lavoro avviato");
      // Milestone del gruppo: forecast a 15–30 giorni; completamento se il tempo è passato (entro o oltre).
      for (const p of pairs.filter((x) => x.ownerGroup === g)) {
        const fc = at + r.int(15, 30) * DAY;
        values[p.flowId] = romeDate(new Date(fc));
        if (r.chance(0.25)) change(p.flowId, at + DAY, romeDate(new Date(fc - 7 * DAY)), values[p.flowId]);
        const done = fc + r.int(-10, 15) * DAY;
        if (done < now) values[p.completionFlowId] = romeDate(new Date(done));
      }
    };
    for (let k = 0; k < steps.length; k++) {
      const mean = MEAN_DAYS[current] ?? 10;
      const next = t + Math.max(0.2, -Math.log(1 - r.next()) * mean) * DAY;
      if (next >= now) break;
      const inImport = k < importAt;
      t = inImport ? createdAt : next;
      const opId = inImport ? firstOp : op();
      const to = steps[k];
      event("STATO", t, opId, { source: "SYSTEM", structuredDetail: { from: current, to, manualReleased: false, autoEventDate: romeDate(new Date(t - r.int(0, 3) * DAY)) } });
      if (to === "ASSEGNATO") assign("UT_PE", t, opId);
      if (to === "PROTOCOLLATO" && r.chance(0.5)) assign("AIE", t, opId);
      if (to === "AUTORIZZATO" && r.chance(0.7)) assign("DL", t, opId);
      if (to === "DINIEGATO" && r.chance(0.3) && !origin) {
        // Ripresentazione: nuova iterazione da CREATA (solo eventi: la scheda resta sull'iterazione 1).
        t += r.int(5, 20) * DAY;
        if (t >= now) break;
        event("RESUBMIT", t, op(), { structuredDetail: { fromIteration: 1, toIteration: 2 } });
        current = "CREATA";
        continue;
      }
      current = to;
    }
    // Archivio: metà delle chiuse da più di due mesi.
    let archived = false;
    if ((current === "TERMINATO" || current === "KO") && t < now - 60 * DAY && r.chance(0.5)) {
      archived = true;
      event("ARCHIVE", t + 30 * DAY, op());
    }
    // Contorno: commenti e modifiche PM, per volumi realistici (non entrano nei calcoli).
    if (o.filler) {
      const pmField = groupField("PM_PERMESSI");
      for (let k = 0; k < 40; k++) {
        const at = createdAt + r.next() * (Math.max(t, createdAt + DAY) - createdAt);
        event(r.chance(0.5) ? "COMMENT_ADD" : "ALERT_OPEN", at, op());
        if (pmField) change(pmField, at, `v${k}`, `v${k + 1}`);
      }
    }
    // Alert: uno per milestone con forecast, chiuso se completata; qualcuno ripetuto o sostituito.
    const alerts: AlertDoc[] = [];
    for (const p of pairs) {
      const fc = values[p.flowId];
      if (typeof fc !== "string" || !r.chance(0.6)) continue;
      const due = new Date(`${fc}T07:00:00Z`).getTime();
      const openedAt = due - 7 * DAY;
      if (openedAt >= now) continue;
      const done = values[p.completionFlowId];
      const closedAt = typeof done === "string" ? Math.max(openedAt + 3_600_000, new Date(`${done}T08:00:00Z`).getTime()) : null;
      const superseded = r.chance(0.05);
      alerts.push({
        _id: new ObjectId(),
        practiceId,
        iterationId,
        ruleId: `FORECAST_${p.semanticId}`,
        subject: { flowId: p.flowId },
        episodeKey: `sintetico:${practiceId.toHexString()}:${p.flowId}`,
        generation: r.chance(0.1) ? 2 : 1,
        sourceFingerprint: "sintetico",
        ruleVersion: 1,
        calendarVersion: "sintetico",
        dueLocalDate: fc,
        dueAt: new Date(due),
        status: closedAt && closedAt < now ? "CLOSED" : superseded ? "CLOSED" : "OPEN",
        executionStatus: superseded ? "SUPERSEDED" : "ACTIVE",
        openedAt: new Date(openedAt),
        closedAt: closedAt && closedAt < now ? new Date(closedAt) : superseded ? new Date(openedAt + DAY) : null,
        closeMode: closedAt ? "AUTO" : null,
        closedBy: null,
        closeReason: null,
        recipientsSnapshot: [],
        nextReminderAt: null,
        reminderCount: r.int(0, 2),
      } as AlertDoc);
    }

    built.iteration.values = { ...built.iteration.values, ...values };
    built.iteration.stateMeta = { ...built.iteration.stateMeta, stato: current, autoStato: current };
    built.practice.enabledGroups = [...enabled];
    built.practice.archived = archived;
    built.practice.archivedAt = archived ? new Date(t + 30 * DAY) : null;
    const open = alerts.filter((a) => a.status === "OPEN" && a.executionStatus === "ACTIVE").length;
    built.practice.currentSummary = summaryOf(built.iteration, open);
    batch.practices.push(built.practice);
    batch.iterations.push(built.iteration);
    batch.rows.push(...built.rows);
    batch.events.push(...events);
    batch.history.push(...history);
    batch.alerts.push(...alerts);
    report.practices++;
    return { id: practiceId, codiceSito: code, current, endedAt: t };
  };

  for (let i = 0; i < o.practices; i++) {
    const templateId = TEMPLATE_IDS[i % TEMPLATE_IDS.length];
    const createdAt = start0 + r.next() * (now - start0 - DAY);
    const p = makePractice(i, templateId, createdAt, null);
    // Rilavorazione: per una chiusa su dieci.
    if ((p.current === "TERMINATO" || p.current === "KO") && r.chance(0.1)) {
      const at = p.endedAt + r.int(3, 30) * DAY;
      if (at < now) makePractice(i, templateId, at, { id: p.id, codiceSito: p.codiceSito });
    }
    if (batch.events.length > 20_000) {
      await flush();
      log(`  ${report.practices} pratiche…`);
    }
  }
  await flush();
  return report;
}
