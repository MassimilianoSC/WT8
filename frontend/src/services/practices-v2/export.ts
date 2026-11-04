/**
 * Export CSV (contratto §11, D-48): GET /api/export?templateId=&stato=&archived=&q= → text/csv, nuova e pubblicata.
 * Stessi filtri e stessa visibilità dell'elenco (§5.1, anche from/to sulla data di creazione, D-129), iterazione
 * corrente; ogni utente con un'appartenenza sul gestore e l'ADMIN (D-128).
 * Colonne: ID pratica, Iterazione, Stato attività, Archiviata; un'occorrenza MASTER per colonna nell'ordine del
 * template ("<flowId> <etichetta>", D-30); Note Operative dei soli gruppi visibili (D-121); Fatturabile, Fatturato;
 * una colonna per vincolo con "stato (ente)". Gruppi ripetibili: valori delle righe uniti con " | ".
 * Inclusi i valori dei campi nascosti per condizione (D-31).
 */
import { ObjectId, type Db, type Document } from "mongodb";
import { type ExportQuery, type FieldOccurrenceDTO, type GroupId, type TemplateId, type UserDTO } from "@/lib/contract";
import { romeDate } from "@/lib/calendario";
import { visibleTemplates } from "@/lib/engines/access";
import { HttpError } from "@/lib/http-error";
import { CSV_BOM, REPEAT_JOIN, cellText, csvLine, safeText, statoLabel, type CsvLookup } from "@/lib/practice/csv";
import { GROUP_LABELS } from "@/lib/practice/labels";
import { notesOf, visibleNoteGroups } from "@/lib/practice/notes";
import { store } from "@/lib/store/db";
import type { ConstraintRowDoc, IterationDoc, PracticeDoc, RepeatRowDoc } from "@/lib/store/types";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";
import { listFilter, listOrderStages, parseListQuery } from "@/services/practices-v2/list";

/** ?templateId (obbligatorio, 400 senza) &stato&archived&q, come l'elenco. */
export function parseExportQuery(params: URLSearchParams): ExportQuery {
  const q = parseListQuery(params);
  if (!q.templateId) throw new HttpError("templateId obbligatorio", 400);
  return {
    templateId: q.templateId,
    ...(q.stato ? { stato: q.stato } : {}),
    archived: q.archived ?? false,
    ...(q.q ? { q: q.q } : {}),
    ...(q.from ? { from: q.from } : {}),
    ...(q.to ? { to: q.to } : {}),
    ...(q.scope ? { scope: q.scope } : {}),
  };
}

export interface CsvFile {
  filename: string;
  body: string;
}

export async function exportPractices(db: Db, user: UserDTO, q: ExportQuery, now: Date = new Date()): Promise<CsvFile> {
  const templateId = q.templateId as TemplateId;
  // D-128: chi ha un'appartenenza sul gestore (e l'ADMIN) esporta le pratiche che vede, con le sole note visibili.
  if (!visibleTemplates(user).includes(templateId)) throw new HttpError("Nessuna appartenenza su questo gestore", 403);
  const template = COMPILED_TEMPLATES[templateId].template;

  // Esattamente l'elenco che l'utente sta guardando: stessi filtri e stesso scope (default "assigned", v0.3.4).
  const filter = listFilter(user, { templateId, stato: q.stato, archived: q.archived ?? false, q: q.q, from: q.from, to: q.to, scope: q.scope ?? "assigned" });
  const practices: PracticeDoc[] = filter
    ? await store.practices(db).aggregate<PracticeDoc>([{ $match: filter }, ...listOrderStages("open_first"), { $project: { _closed: 0 } }] as Document[]).toArray()
    : [];
  const ids = practices.map((p) => p.currentIterationId);
  const [iterations, rows, lists] = await Promise.all([
    store.iterations(db).find({ _id: { $in: ids } }).toArray(),
    store.repeatRows(db).find({ iterationId: { $in: ids } }).sort({ ordinal: 1 }).toArray(),
    store.lists(db).find({ templateId: { $in: [templateId, null] } }, { projection: { templateId: 1, listId: 1, items: 1 } }).toArray(),
  ]);
  const itById = new Map(iterations.map((i) => [i._id.toHexString(), i]));
  const rowsBy = new Map<string, RepeatRowDoc[]>();
  for (const r of rows) {
    const k = r.iterationId.toHexString();
    if (!rowsBy.has(k)) rowsBy.set(k, []);
    rowsBy.get(k)!.push(r);
  }

  // Etichette: la lista del gestore prevale su quella comune.
  const labels = new Map<string, Map<string, string>>();
  for (const l of [...lists].sort((a, b) => (a.templateId === null ? -1 : 1) - (b.templateId === null ? -1 : 1))) {
    labels.set(l.listId, new Map(l.items.map((i) => [i.code, i.label])));
  }
  const userIds = new Set<string>();
  const collect = (v: unknown) => {
    for (const x of Array.isArray(v) ? v : [v]) if (x && typeof x === "object" && /^[0-9a-f]{24}$/i.test((x as { code: string }).code)) userIds.add((x as { code: string }).code);
  };
  for (const it of iterations) Object.values(it.values).forEach(collect);
  for (const r of rows) Object.values(r.values).forEach(collect);
  const users = await store.users(db).find({ _id: { $in: [...userIds].map((id) => new ObjectId(id)) } }, { projection: { name: 1 } }).toArray();
  const names = new Map(users.map((u) => [u._id.toHexString(), u.name]));
  const lookup: CsvLookup = { listLabel: (listId, code) => labels.get(listId)?.get(code) ?? null, userName: (id) => names.get(id) ?? null };

  const fields: FieldOccurrenceDTO[] = template.occurrences.filter((o) => o.kind === "MASTER" && o.flowId && o.repeatGroup !== "VINCOLI");
  const noteGroups: GroupId[] = visibleNoteGroups(user, templateId);
  const header = [
    "ID pratica",
    "Iterazione",
    "Stato attività",
    "Archiviata",
    ...fields.map((o) => `${o.flowId} ${o.label}`),
    ...noteGroups.map((g) => `Note Operative ${GROUP_LABELS[g]}`),
    "Fatturabile",
    "Fatturato",
    // D-143: un nome che è già "Vincoli …" non si ripete col prefisso.
    ...template.constraints.map((c) => (/^vincol/i.test(c.label.trim()) ? c.label.trim() : `Vincolo ${c.label}`)),
  ];

  const constraintText = (c: (typeof template.constraints)[number], row: ConstraintRowDoc | undefined) => {
    if (!row?.stato) return "";
    const stato = lookup.listLabel(c.stateList.listId, row.stato.code) ?? row.stato.code;
    const ente = !row.ente
      ? null
      : row.ente.code === c.defaultEnte && c.defaultEnteLabel
        ? c.defaultEnteLabel
        : row.ente.code === "ALTRO" && row.ente.otherText
          ? safeText(row.ente.otherText)
          : (c.enteList && lookup.listLabel(c.enteList.listId, row.ente.code)) ?? row.ente.code;
    return ente ? `${stato} (${ente})` : stato;
  };

  const lines = [csvLine(header)];
  for (const p of practices) {
    const it: IterationDoc | undefined = itById.get(p.currentIterationId.toHexString());
    if (!it) continue;
    const itRows = rowsBy.get(it._id.toHexString()) ?? [];
    const notes = notesOf(it.transversal);
    lines.push(
      csvLine([
        p._id.toHexString(),
        String(it.n),
        statoLabel(it.stateMeta.stato),
        p.archived ? "SI" : "NO",
        ...fields.map((o) =>
          o.repeatGroup
            ? itRows
                .filter((r) => r.groupKey === o.repeatGroup)
                .map((r) => cellText(o, r.values[o.flowId!], lookup))
                .join(REPEAT_JOIN)
            : cellText(o, it.values[o.flowId!], lookup)
        ),
        ...noteGroups.map((g) => safeText(notes[g])),
        it.transversal.fatturabile,
        it.transversal.fatturato ?? "",
        ...template.constraints.map((c) => constraintText(c, itRows.find((r) => r.groupKey === "VINCOLI" && r.constraint?.code === c.code)?.constraint)),
      ])
    );
  }
  return { filename: `PracticeHub_${templateId}_${romeDate(now)}.csv`, body: CSV_BOM + lines.join("\r\n") + "\r\n" };
}

