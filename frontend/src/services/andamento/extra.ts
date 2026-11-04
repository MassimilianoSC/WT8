/**
 * Dati aggiuntivi di Andamento per scadenze e tempo per gruppo (contratto §15.4, D-195), in sola lettura e con la
 * stessa cache di 5 minuti dell'insieme degli eventi: valori di forecast e completamenti (iterazioni e righe), forecast
 * cambiati almeno una volta (storico dei valori), prima modifica USER di ogni campo per iterazione, alert.
 */
import { ObjectId, type Db } from "mongodb";
import type { FieldValue, GroupId, TemplateId } from "@/lib/contract";
import { store } from "@/lib/store/db";
import type { AlertDoc } from "@/lib/store/types";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";
import { DATE_CATALOG, type DateCatalogEntry } from "@/services/assistant/catalog";
import { CACHE_MS, type Dataset } from "./dataset";

const QUERY_MS = 60_000;

/** Coppie forecast/completamento del catalogo per template (D-195: 60 coppie). */
export function milestonePairs(templateId: TemplateId): (DateCatalogEntry & { completionFlowId: string })[] {
  return DATE_CATALOG.filter((e): e is DateCatalogEntry & { completionFlowId: string } => e.templateId === templateId && e.dateKind === "FORECAST" && !!e.completionFlowId);
}

/** Gruppo proprietario di ogni flowId del template (dal master, mai dalla persona). */
const ownerCache = new Map<TemplateId, Map<string, GroupId>>();
export function ownerOf(templateId: TemplateId): Map<string, GroupId> {
  let m = ownerCache.get(templateId);
  if (!m) {
    m = new Map(COMPILED_TEMPLATES[templateId].template.occurrences.filter((o) => o.kind === "MASTER" && o.flowId).map((o) => [o.flowId!, o.ownerGroup]));
    ownerCache.set(templateId, m);
  }
  return m;
}

export interface IterationValues {
  iterationId: string;
  practiceId: string;
  templateId: TemplateId;
  n: number;
  values: Record<string, FieldValue>;
  rows: { groupKey: string; rowId: string; values: Record<string, FieldValue> }[];
}

export interface ExtraData {
  iterations: IterationValues[];
  /** `${iterationId}|${flowId}|${rowId ?? ""}`: forecast cambiato almeno una volta (valore vecchio non vuoto). */
  forecastChanged: Set<string>;
  /** iterationId → gruppo → istanti delle prime modifiche USER dei campi del gruppo (ordinati). */
  firstEdits: Map<string, Map<GroupId, number[]>>;
  alerts: Pick<AlertDoc, "practiceId" | "openedAt" | "closedAt" | "dueAt" | "status" | "executionStatus" | "generation" | "reminderCount">[];
}

async function build(db: Db, ds: Dataset): Promise<ExtraData> {
  const ids = ds.practices.map((p) => new ObjectId(p.id));
  const templateOf = new Map(ds.practices.map((p) => [p.id, p.templateId]));
  const flowIds = new Set<string>();
  const groups = new Set<string>();
  for (const t of ds.templates)
    for (const e of milestonePairs(t)) {
      flowIds.add(e.flowId);
      flowIds.add(e.completionFlowId);
      if (e.repeatGroup) groups.add(e.repeatGroup);
    }
  // Campi dei gruppi che si assegnano (PM/Permessi è abilitato dalla creazione: nessun «per partire»).
  const groupFlowIds = new Set<string>();
  for (const t of ds.templates) for (const [f, owner] of ownerOf(t)) if (owner !== "PM_PERMESSI") groupFlowIds.add(f);
  const projection: Record<string, 1> = { practiceId: 1, n: 1 };
  for (const f of flowIds) projection[`values.${f}`] = 1;

  const [iters, rows, changed, edits, alerts] = await Promise.all([
    store.iterations(db).find({ practiceId: { $in: ids } }, { projection, maxTimeMS: QUERY_MS }).toArray(),
    groups.size
      ? store.repeatRows(db).find({ practiceId: { $in: ids }, groupKey: { $in: [...groups] } }, { projection: { iterationId: 1, groupKey: 1, ...Object.fromEntries([...flowIds].map((f) => [`values.${f}`, 1])) }, maxTimeMS: QUERY_MS }).toArray()
      : Promise.resolve([]),
    store
      .valueHistory(db)
      .find({ practiceId: { $in: ids }, kind: "FIELD", "target.flowId": { $in: [...flowIds] }, oldValue: { $ne: null } }, { projection: { iterationId: 1, target: 1, oldValue: 1, newValue: 1 }, maxTimeMS: QUERY_MS })
      .toArray(),
    store
      .valueHistory(db)
      .aggregate<{ _id: { i: ObjectId; p: ObjectId; f: string }; first: Date[] }>(
        [
          { $match: { practiceId: { $in: ids }, kind: "FIELD", source: "USER", "target.flowId": { $in: [...groupFlowIds] } } },
          // Ogni modifica conta: serve la prima DOPO ogni Assegna, non la prima in assoluto.
          { $group: { _id: { i: "$iterationId", p: "$practiceId", f: "$target.flowId" }, first: { $push: "$timestamp" } } },
        ],
        { maxTimeMS: QUERY_MS, allowDiskUse: true }
      )
      .toArray(),
    store
      .alerts(db)
      .find({ practiceId: { $in: ids } }, { projection: { practiceId: 1, openedAt: 1, closedAt: 1, dueAt: 1, status: 1, executionStatus: 1, generation: 1, reminderCount: 1 }, maxTimeMS: QUERY_MS })
      .toArray(),
  ]);

  const rowsByIter = new Map<string, IterationValues["rows"]>();
  for (const r of rows) {
    const k = r.iterationId.toHexString();
    (rowsByIter.get(k) ?? rowsByIter.set(k, []).get(k)!).push({ groupKey: r.groupKey, rowId: r._id.toHexString(), values: r.values ?? {} });
  }
  const iterations: IterationValues[] = iters.map((i) => ({
    iterationId: i._id.toHexString(),
    practiceId: i.practiceId.toHexString(),
    templateId: templateOf.get(i.practiceId.toHexString())!,
    n: i.n,
    values: i.values ?? {},
    rows: rowsByIter.get(i._id.toHexString()) ?? [],
  }));
  const forecastChanged = new Set<string>();
  for (const h of changed) {
    if (JSON.stringify(h.oldValue) === JSON.stringify(h.newValue)) continue;
    forecastChanged.add(`${h.iterationId.toHexString()}|${h.target.flowId}|${h.target.rowId?.toHexString() ?? ""}`);
  }
  const firstEdits = new Map<string, Map<GroupId, number[]>>();
  for (const e of edits) {
    const t = templateOf.get(e._id.p.toHexString());
    const group = t ? ownerOf(t).get(e._id.f) : undefined;
    if (!group) continue;
    const k = e._id.i.toHexString();
    const byGroup = firstEdits.get(k) ?? firstEdits.set(k, new Map()).get(k)!;
    const list = byGroup.get(group) ?? byGroup.set(group, []).get(group)!;
    for (const d of e.first) list.push(d.getTime());
  }
  for (const byGroup of firstEdits.values()) for (const list of byGroup.values()) list.sort((a, b) => a - b);
  return { iterations, forecastChanged, firstEdits, alerts };
}

const g = global as unknown as { _andamentoExtra?: Map<string, Promise<ExtraData>> };
const cache = () => (g._andamentoExtra ??= new Map());

/** Dati aggiuntivi per lo stesso insieme (stessa finestra di cache dell'insieme degli eventi). */
export function loadExtra(db: Db, ds: Dataset): Promise<ExtraData> {
  const key = `${db.databaseName}|${ds.templates.join(",")}|${Math.floor(ds.builtAt / CACHE_MS)}`;
  const c = cache();
  // Insiemi di finestre di 5 minuti passate: via subito (memoria scarsa sul PC dell'installazione).
  const bucket = key.slice(key.lastIndexOf("|"));
  for (const k of [...c.keys()]) if (!k.endsWith(bucket)) c.delete(k);
  const hit = c.get(key);
  if (hit) return hit;
  const p = build(db, ds).catch((e) => {
    c.delete(key);
    throw e;
  });
  c.set(key, p);
  while (c.size > 8) c.delete(c.keys().next().value!);
  return p;
}

/** Solo prove. */
export function resetExtraCache(): void {
  g._andamentoExtra = new Map();
}
