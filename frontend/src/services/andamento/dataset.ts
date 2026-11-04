/**
 * Dati di Andamento (contratto §15.4) ricostruiti dagli eventi, in sola lettura. Per ogni pratica: le permanenze negli
 * stati (da un passaggio al successivo), le entrate, le rilavorazioni e ripresentazioni, le Assegna e i periodi in
 * archivio. Gli eventi restano la fonte: niente riepiloghi salvati. Cache di processo di 5 minuti per insieme di
 * template (D-192); tutti i blocchi della stessa pagina leggono lo stesso insieme.
 *
 * Regole: ogni nuova iterazione parte da CREATA (creazione, rilavorazione, ripresentazione); i passaggi dentro
 * un'operazione di import (stesso operationId dell'evento IMPORT o della creazione da import) segnano la permanenza
 * come «da import» in entrata o in uscita, e una permanenza conta nei tempi solo se nessuna delle due lo è.
 */
import type { Db, ObjectId } from "mongodb";
import { TEMPLATE_IDS, type GroupId, type StatoAttivita, type TemplateId } from "@/lib/contract";
import { store } from "@/lib/store/db";
import type { PracticeEventDoc } from "@/lib/store/types";

export const CACHE_MS = 5 * 60_000;
const QUERY_MS = 60_000;

export interface Segment {
  stato: StatoAttivita;
  n: number;
  start: number;
  /** null = ancora in corso. */
  end: number | null;
  startImport: boolean;
  endImport: boolean;
  /** Data del fatto all'ingresso e all'uscita (autoEventDate), se nota. */
  startFact: string | null;
  endFact: string | null;
}

export interface PracticeTimeline {
  id: string;
  templateId: TemplateId;
  codiceSito: string;
  nomeSito: string;
  archived: boolean;
  enabledGroups: GroupId[];
  currentStato: StatoAttivita;
  currentN: number;
  segments: Segment[];
  /** Creazione (a mano, da rilavorazione o da import). */
  created: { at: number; fromImport: boolean; rework: boolean } | null;
  archive: { at: number; archived: boolean }[];
  reworkOf: { at: number; originId: string } | null;
  resubmits: { at: number; fromStato: StatoAttivita | null }[];
  assigns: { at: number; n: number; iterationId: string; added: GroupId[]; fromImport: boolean }[];
}

export interface Dataset {
  builtAt: number;
  templates: TemplateId[];
  practices: PracticeTimeline[];
  byId: Map<string, PracticeTimeline>;
  /** Primo evento utile (ms) o null. */
  firstEventAt: number | null;
}

const KINDS: PracticeEventDoc["kind"][] = ["CREATE", "REWORK", "RESUBMIT", "STATO", "IMPORT", "ARCHIVE", "RESTORE", "ASSIGN"];
/** Ordine dentro la stessa operazione: prima la nascita dell'iterazione, poi gli stati, poi il resto. */
const PRIORITY: Partial<Record<PracticeEventDoc["kind"], number>> = { CREATE: 0, REWORK: 0, RESUBMIT: 1, STATO: 2 };

type EventRow = Pick<PracticeEventDoc, "practiceId" | "iterationId" | "n" | "kind" | "source" | "timestamp" | "operationId" | "eventIndex" | "structuredDetail">;

/** Ricostruzione di una pratica dai suoi eventi (già ordinati). Pura: le prove la usano direttamente. */
export function buildTimeline(base: Omit<PracticeTimeline, "segments" | "created" | "archive" | "reworkOf" | "resubmits" | "assigns">, events: EventRow[]): PracticeTimeline {
  const importOps = new Set(events.filter((e) => e.kind === "IMPORT" || ((e.kind === "CREATE" || e.kind === "REWORK") && e.source === "IMPORT")).map((e) => e.operationId));
  const t: PracticeTimeline = { ...base, segments: [], created: null, archive: [], reworkOf: null, resubmits: [], assigns: [] };
  let cur: Segment | null = null;
  const close = (at: number, fromImport: boolean, fact: string | null) => {
    if (!cur) return;
    cur.end = at;
    cur.endImport = fromImport;
    cur.endFact = fact;
    cur = null;
  };
  const open = (stato: StatoAttivita, n: number, at: number, fromImport: boolean, fact: string | null) => {
    cur = { stato, n, start: at, end: null, startImport: fromImport, endImport: false, startFact: fact, endFact: null };
    t.segments.push(cur);
  };
  for (const e of events) {
    const at = e.timestamp.getTime();
    const imp = importOps.has(e.operationId);
    const d = (e.structuredDetail ?? {}) as Record<string, unknown>;
    switch (e.kind) {
      case "CREATE":
      case "REWORK":
        if (!t.created) t.created = { at, fromImport: imp, rework: e.kind === "REWORK" };
        if (e.kind === "REWORK" && typeof d.originPracticeId === "string") t.reworkOf = { at, originId: d.originPracticeId };
        if (!cur && t.segments.length === 0) open("CREATA", e.n, at, imp, null);
        break;
      case "RESUBMIT": {
        const from: StatoAttivita | null = (cur as Segment | null)?.stato ?? null;
        t.resubmits.push({ at, fromStato: from });
        close(at, false, null);
        open("CREATA", typeof d.toIteration === "number" ? d.toIteration : e.n, at, false, null);
        break;
      }
      case "STATO": {
        if (d.sourceOnly) break; // stesso stato che torna automatico: non è un passaggio
        const to = d.to as StatoAttivita | undefined;
        if (!to) break;
        const fact = typeof d.autoEventDate === "string" ? d.autoEventDate : null;
        // Storia senza nascita (dati più vecchi degli eventi): l'ingresso nello stato precedente non è noto.
        if (!cur && typeof d.from === "string") open(d.from as StatoAttivita, e.n, at, true, null);
        close(at, imp, fact);
        open(to, e.n, at, imp, fact);
        break;
      }
      case "ARCHIVE":
      case "RESTORE":
        t.archive.push({ at, archived: e.kind === "ARCHIVE" });
        break;
      case "ASSIGN": {
        const added = Array.isArray(d.added) ? (d.added as GroupId[]) : [];
        t.assigns.push({ at, n: e.n, iterationId: e.iterationId.toHexString(), added, fromImport: imp });
        break;
      }
    }
  }
  return t;
}

const sortEvents = (a: EventRow, b: EventRow) =>
  a.timestamp.getTime() - b.timestamp.getTime() || (PRIORITY[a.kind] ?? 3) - (PRIORITY[b.kind] ?? 3) || a.eventIndex - b.eventIndex;

async function build(db: Db, templates: TemplateId[], now: number): Promise<Dataset> {
  const all = templates.length === TEMPLATE_IDS.length;
  const docs = await store
    .practices(db)
    .find(all ? {} : { templateId: { $in: templates } }, {
      projection: { templateId: 1, archived: 1, enabledGroups: 1, currentIterationN: 1, "currentSummary.codiceSito": 1, "currentSummary.nomeSito": 1, "currentSummary.statoAttivita": 1 },
      maxTimeMS: QUERY_MS,
    })
    .toArray();
  const ids = docs.map((p) => p._id as ObjectId);
  const events = (await store
    .events(db)
    .find(all ? { kind: { $in: KINDS } } : { kind: { $in: KINDS }, practiceId: { $in: ids } }, {
      projection: { practiceId: 1, iterationId: 1, n: 1, kind: 1, source: 1, timestamp: 1, operationId: 1, eventIndex: 1, structuredDetail: 1 },
      maxTimeMS: QUERY_MS,
    })
    .toArray()) as EventRow[];
  const byPractice = new Map<string, EventRow[]>();
  let first: number | null = null;
  for (const e of events) {
    const k = e.practiceId.toHexString();
    (byPractice.get(k) ?? byPractice.set(k, []).get(k)!).push(e);
    const at = e.timestamp.getTime();
    if (first === null || at < first) first = at;
  }
  const practices = docs.map((p) =>
    buildTimeline(
      {
        id: p._id.toHexString(),
        templateId: p.templateId,
        codiceSito: p.currentSummary.codiceSito,
        nomeSito: p.currentSummary.nomeSito,
        archived: p.archived,
        enabledGroups: p.enabledGroups,
        currentStato: p.currentSummary.statoAttivita,
        currentN: p.currentIterationN,
      },
      (byPractice.get(p._id.toHexString()) ?? []).sort(sortEvents)
    )
  );
  return { builtAt: now, templates, practices, byId: new Map(practices.map((p) => [p.id, p])), firstEventAt: first };
}

const g = global as unknown as { _andamentoCache?: Map<string, Promise<Dataset>> };
const cache = () => (g._andamentoCache ??= new Map());

/** Insieme dei dati per i template indicati, ricalcolato al più ogni 5 minuti (stesso insieme per tutti i blocchi). */
export function loadDataset(db: Db, templates: readonly TemplateId[], now: Date = new Date()): Promise<Dataset> {
  const list = [...templates].sort() as TemplateId[];
  const key = `${db.databaseName}|${list.join(",")}|${Math.floor(now.getTime() / CACHE_MS)}`;
  const c = cache();
  // Insiemi di finestre di 5 minuti passate: via subito (memoria scarsa sul PC dell'installazione).
  const bucket = key.slice(key.lastIndexOf("|"));
  for (const k of [...c.keys()]) if (!k.endsWith(bucket)) c.delete(k);
  const hit = c.get(key);
  if (hit) return hit;
  const p = build(db, list, now.getTime()).catch((e) => {
    c.delete(key);
    throw e;
  });
  c.set(key, p);
  // Si tengono pochi insiemi: le chiavi più vecchie se ne vanno.
  while (c.size > 8) c.delete(c.keys().next().value!);
  return p;
}

/** Solo prove. */
export function resetAndamentoCache(): void {
  g._andamentoCache = new Map();
}

/** Stato della pratica all'istante t (null = non ancora nata). */
export function stateAt(p: PracticeTimeline, t: number): StatoAttivita | null {
  for (let i = p.segments.length - 1; i >= 0; i--) {
    const s = p.segments[i];
    if (s.start <= t && (s.end === null || t < s.end)) return s.stato;
  }
  return null;
}

/** Archiviata all'istante t. */
export function archivedAt(p: PracticeTimeline, t: number): boolean {
  // Senza eventi d'archivio (dati più vecchi degli eventi) vale lo stato attuale.
  if (p.archive.length === 0) return p.archived;
  // Prima del primo evento vale il contrario di quell'evento (archiviata prima di un RESTORE, attiva prima di un ARCHIVE):
  // mai lo stato attuale, che direbbe «archiviata» anche per gli istanti precedenti all'archiviazione.
  let archived = !p.archive[0].archived;
  for (const a of p.archive) {
    if (a.at > t) break;
    archived = a.archived;
  }
  return archived;
}
