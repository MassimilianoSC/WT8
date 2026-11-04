/**
 * get_history e search_visible_notes (progetto §4.2, §3, §5.1 punti 5–6).
 * - get_history: storico di UNA pratica visibile. Il filtro delle note non visibili (hiddenNotesFilter, D-121; voci
 *   senza noteGroup = PM_PERMESSI) e il periodo sono nella query PRIMA di conteggio e limite. Niente operationId,
 *   email o dettagli strutturati grezzi verso il modello.
 * - search_visible_notes: ricerca letterale (2–80 caratteri, senza regex del modello) nelle sole Note Operative
 *   visibili e nei campi lunghi di testo; cliente facoltativo; al massimo 200 pratiche; scansione incompleta dichiarata.
 */
import type { Filter } from "mongodb";
import { z } from "zod";
import type { FieldValue, GroupId, TemplateId } from "@/lib/contract";
import { addCalendarDays, romeTime } from "@/lib/calendario";
import { notesOf, visibleNoteGroups } from "@/lib/practice/notes";
import { store } from "@/lib/store/db";
import type { PracticeEventDoc, ValueHistoryDoc } from "@/lib/store/types";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";
import { hiddenNotesFilter } from "@/services/practices-v2/history";
import { loadVisiblePractice, parsePracticeId } from "@/services/practices-v2/repository";
import { HttpError } from "@/lib/http-error";
import { QUERY_MS, selectionFilter } from "../reads";
import {
  clip,
  fitResult,
  MAX_ITEMS,
  normalizeSelection,
  objectIdSchema,
  periodSchema,
  practiceSource,
  selectionSchema,
  ToolError,
  type ToolContext,
  type ToolResult,
} from "./common";
import { selectionSource } from "./practices";

const TEXT_MAX = 1000;
const show = (v: FieldValue): unknown => {
  if (typeof v === "string") return clip(v, TEXT_MAX);
  if (Array.isArray(v)) return v.map((x) => x.code);
  if (v && typeof v === "object") return (v as { code: string }).code;
  return v;
};

/* ---------- get_history ---------- */

export const getHistorySchema = z
  .strictObject({
    practiceId: objectIdSchema,
    iteration: z.number().int().min(1).optional(),
    allIterations: z.boolean().optional(),
    period: periodSchema.optional(),
    view: z.enum(["fields", "events"]).optional(),
  })
  .refine((a) => !(a.iteration !== undefined && a.allIterations), "iteration e allIterations sono alternativi");

export async function getHistoryTool(ctx: ToolContext, args: z.infer<typeof getHistorySchema>): Promise<ToolResult> {
  let practice;
  try {
    practice = await loadVisiblePractice(ctx.db, ctx.user, parsePracticeId(args.practiceId));
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) throw new ToolError("NOT_FOUND", "Pratica non trovata o non visibile");
    throw e;
  }
  const n = args.allIterations ? undefined : args.iteration ?? practice.currentIterationN;
  const time = args.period ? { timestamp: { $gte: romeTime(args.period.from, 0, 0), $lt: romeTime(addCalendarDays(args.period.to, 1), 0, 0) } } : {};
  const base = { practiceId: practice._id, ...(n !== undefined ? { n } : {}), ...time };
  const template = COMPILED_TEMPLATES[practice.templateId].template;
  const label = (flowId?: string) => (flowId ? template.occurrences.find((o) => o.kind === "MASTER" && o.flowId === flowId)?.label ?? flowId : undefined);

  type Row = { t: number; id: string; item: Record<string, unknown> };
  const rows: Row[] = [];
  let total = 0;
  if (args.view !== "events") {
    const f = { ...base, ...hiddenNotesFilter(visibleNoteGroups(ctx.user, practice.templateId)) } as Filter<ValueHistoryDoc>;
    total += await store.valueHistory(ctx.db).countDocuments(f, { maxTimeMS: QUERY_MS });
    for (const h of await store.valueHistory(ctx.db).find(f, { maxTimeMS: QUERY_MS }).sort({ timestamp: -1, _id: -1 }).limit(MAX_ITEMS).toArray()) {
      const noteGroup: GroupId | undefined = h.target.transversal === "noteOperative" ? h.target.noteGroup ?? "PM_PERMESSI" : undefined;
      rows.push({
        t: h.timestamp.getTime(),
        id: h._id.toHexString(),
        item: {
          fonte: practiceSource(ctx, practice, `Storico ${label(h.target.flowId) ?? h.target.transversal ?? h.kind}`, {
            iteration: h.n,
            historyEntryId: h._id.toHexString(),
            ...(h.target.flowId ? { flowId: h.target.flowId } : {}),
          }),
          quando: h.timestamp.toISOString(),
          iterazione: h.n,
          tipo: h.kind,
          campo: label(h.target.flowId) ?? (noteGroup ? `Note Operative ${noteGroup}` : h.target.transversal ?? null),
          ...(h.target.groupKey ? { gruppoRipetibile: h.target.groupKey } : {}),
          prima: show(h.oldValue),
          dopo: show(h.newValue),
          origine: h.source,
          autore: h.actorName,
        },
      });
    }
  }
  if (args.view !== "fields") {
    const f = base as Filter<PracticeEventDoc>;
    total += await store.events(ctx.db).countDocuments(f, { maxTimeMS: QUERY_MS });
    for (const e of await store.events(ctx.db).find(f, { maxTimeMS: QUERY_MS }).sort({ timestamp: -1, _id: -1 }).limit(MAX_ITEMS).toArray()) {
      rows.push({
        t: e.timestamp.getTime(),
        id: e._id.toHexString(),
        item: {
          fonte: practiceSource(ctx, practice, `Evento ${e.kind}`, { iteration: e.n, historyEntryId: e._id.toHexString() }),
          quando: e.timestamp.toISOString(),
          iterazione: e.n,
          evento: e.kind,
          dettaglio: clip(e.detail ?? "", 300).text,
          origine: e.source,
          autore: e.actorName,
        },
      });
    }
  }
  rows.sort((a, b) => b.t - a.t || (a.id < b.id ? 1 : -1));
  const shown = rows.slice(0, MAX_ITEMS);
  return fitResult(
    {
      asOf: ctx.now.toISOString(),
      selection: { practiceId: args.practiceId, ...(n !== undefined ? { iterazione: n } : { tutteLeIterazioni: true }), ...(args.period ? { periodo: args.period } : {}), vista: args.view ?? "tutto" },
      items: shown.map((r) => r.item),
      total,
      complete: shown.length === total,
      truncated: shown.length < total,
      ...(shown.length < total ? { omittedReason: "ROWS" as const, note: `Le ${shown.length} voci più recenti di ${total}.` } : {}),
    },
    12000
  );
}

/* ---------- search_visible_notes ---------- */

const NOTES_SCAN = 200;
export const searchNotesSchema = z.strictObject({
  selection: selectionSchema,
  text: z.string().trim().min(2).max(80),
  targets: z.array(z.enum(["OPERATIVE", "FIELD_NOTES"])).min(1).max(2).optional(),
});

export async function searchVisibleNotes(ctx: ToolContext, args: z.infer<typeof searchNotesSchema>): Promise<ToolResult> {
  const sel = normalizeSelection(args.selection);
  const targets = new Set(args.targets ?? ["OPERATIVE"]);
  const filter = selectionFilter(ctx.user, sel);
  const needle = args.text.toLocaleLowerCase("it");
  // Gruppi visibili e campi lunghi dipendono dal cliente della pratica: si calcolano per template.
  const groupsOf = (t: TemplateId) => visibleNoteGroups(ctx.user, t);
  const longTextOf = (t: TemplateId) => COMPILED_TEMPLATES[t].template.occurrences.filter((o) => o.kind === "MASTER" && o.flowId && o.dataType === "LONGTEXT");
  const practices = filter ? await store.practices(ctx.db).find(filter, { maxTimeMS: QUERY_MS }).sort({ _id: 1 }).limit(NOTES_SCAN + 1).toArray() : [];
  const scanIncomplete = practices.length > NOTES_SCAN;
  const scan = practices.slice(0, NOTES_SCAN);
  const iterations = await store.iterations(ctx.db).find({ _id: { $in: scan.map((p) => p.currentIterationId) } }, { projection: { values: 1, transversal: 1 }, maxTimeMS: QUERY_MS }).toArray();
  const rowGroups = [...new Set(scan.flatMap((p) => longTextOf(p.templateId)).map((o) => o.repeatGroup).filter((g): g is string => !!g))];
  const rows = targets.has("FIELD_NOTES") && rowGroups.length
    ? await store.repeatRows(ctx.db).find({ iterationId: { $in: scan.map((p) => p.currentIterationId) }, groupKey: { $in: rowGroups } }, { projection: { iterationId: 1, groupKey: 1, values: 1 }, maxTimeMS: QUERY_MS }).limit(400).toArray()
    : [];
  const itBy = new Map(iterations.map((i) => [i._id.toHexString(), i]));

  const hits: Record<string, unknown>[] = [];
  const snippet = (text: string) => {
    const i = text.toLocaleLowerCase("it").indexOf(needle);
    const start = Math.max(0, i - 200);
    return clip(text.slice(start, start + 500), 500).text;
  };
  for (const p of scan) {
    const it = itBy.get(p.currentIterationId.toHexString());
    if (!it) continue;
    if (targets.has("OPERATIVE")) {
      // Solo i gruppi visibili: il testo degli altri non entra né nel confronto né nel conteggio.
      const notes = notesOf(it.transversal);
      for (const g of groupsOf(p.templateId)) {
        const text = notes[g] ?? "";
        if (text.toLocaleLowerCase("it").includes(needle)) {
          hits.push({ fonte: practiceSource(ctx, p, `Note Operative ${g}`, { occurrenceKey: `TRASV.NOTE_OPERATIVE.${g}` }), pratica: { id: p._id.toHexString(), codiceSito: p.currentSummary.codiceSito, nomeSito: p.currentSummary.nomeSito }, dove: `Note Operative ${g}`, estratto: snippet(text) });
        }
      }
    }
    if (targets.has("FIELD_NOTES")) {
      for (const o of longTextOf(p.templateId)) {
        const sources = o.repeatGroup
          ? rows.filter((r) => r.iterationId.equals(p.currentIterationId) && r.groupKey === o.repeatGroup).map((r) => ({ v: r.values[o.flowId!], rowId: r._id.toHexString() }))
          : [{ v: it.values[o.flowId!], rowId: undefined }];
        for (const s of sources) {
          if (typeof s.v !== "string" || !s.v.toLocaleLowerCase("it").includes(needle)) continue;
          hits.push({
            fonte: practiceSource(ctx, p, o.label, { flowId: o.flowId!, sectionKey: o.sectionKey, occurrenceKey: o.occurrenceKey, ...(s.rowId ? { rowId: s.rowId } : {}) }),
            pratica: { id: p._id.toHexString(), codiceSito: p.currentSummary.codiceSito, nomeSito: p.currentSummary.nomeSito },
            dove: o.label,
            estratto: snippet(s.v),
          });
        }
      }
    }
  }
  const shown = hits.slice(0, 10);
  const setIndex = selectionSource(ctx, sel);
  return fitResult(
    {
      asOf: ctx.now.toISOString(),
      selection: { ...sel, testo: args.text, dove: [...targets], fonteInsieme: setIndex },
      items: shown,
      ...(scanIncomplete ? {} : { total: hits.length }),
      complete: !scanIncomplete && shown.length === hits.length,
      truncated: shown.length < hits.length,
      ...(scanIncomplete ? { omittedReason: "SCAN_LIMIT" as const, note: `Lette solo ${NOTES_SCAN} pratiche: nessun totale esatto, restringi i filtri.` } : {}),
    },
    8000
  );
}

