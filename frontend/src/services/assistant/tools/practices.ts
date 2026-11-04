/**
 * get_practices e get_practice (progetto §4.2).
 * - get_practices: pratiche della selezione autorizzata con il totale esatto; massimo 20; niente note.
 * - get_practice: scheda di UNA pratica visibile (getPracticeDetail: stessa autorizzazione e stesse note visibili
 *   della scheda, D-121), proiettata sugli argomenti chiesti. Pratica non visibile = NOT_FOUND come inesistente.
 */
import { ObjectId } from "mongodb";
import { z } from "zod";
import type { FieldOccurrenceDTO, FieldValue, GroupId, PraticaDetailDTO } from "@/lib/contract";
import { canSeePractice } from "@/lib/engines/access";
import { HttpError } from "@/lib/http-error";
import { userFields } from "@/lib/practice/assignees";
import { store } from "@/lib/store/db";
import type { PracticeDoc } from "@/lib/store/types";
import { getPracticeDetail } from "@/services/practices-v2/read";
import { getTemplate } from "@/services/templates";
import { catalogFor } from "../catalog";
import { countSelection, isEmptyValue, QUERY_MS, scanSelection, selectionFilter } from "../reads";
import {
  clip,
  fitResult,
  MAX_ITEMS,
  normalizeSelection,
  objectIdSchema,
  practiceSource,
  selectionSchema,
  ToolError,
  type Selection,
  type ToolContext,
  type ToolResult,
} from "./common";
import { listOrderStages } from "@/services/practices-v2/list";

/* ---------- get_practices ---------- */

export const getPracticesSchema = z.strictObject({
  selection: selectionSchema,
  activeOnly: z.boolean().optional(),
});

interface PracticeItem {
  fonte: number;
  id: string;
  codiceSito: string;
  nomeSito: string;
  codiceG7: string | null;
  templateId: string;
  stato: string;
  iterazione: number;
  archiviata: boolean;
  gruppiAbilitati: GroupId[];
  alertAperti: number;
}

function practiceItem(ctx: ToolContext, p: PracticeDoc): PracticeItem {
  return {
    fonte: practiceSource(ctx, p, `${p.currentSummary.codiceSito} — ${p.currentSummary.nomeSito}`),
    id: p._id.toHexString(),
    codiceSito: p.currentSummary.codiceSito,
    nomeSito: p.currentSummary.nomeSito,
    codiceG7: p.currentSummary.codiceG7,
    templateId: p.templateId,
    stato: p.currentSummary.statoAttivita,
    iterazione: p.currentIterationN,
    archiviata: p.archived,
    gruppiAbilitati: p.enabledGroups,
    alertAperti: p.currentSummary.openAlerts,
  };
}

/** Fonte dell'insieme: LIST se l'elenco dell'app sa riprodurre la selezione, altrimenti QUERY (domanda precompilata). */
export function selectionSource(ctx: ToolContext, sel: Selection, extra: { activeOnly?: boolean } = {}): number {
  const s = normalizeSelection(sel);
  const listable = !s.clienteFinaleCode && !s.enabledGroup && !s.assignee && !extra.activeOnly;
  if (listable) {
    return ctx.sources.add({
      kind: "LIST",
      label: "Elenco delle pratiche con questi filtri",
      query: { ...(s.templateId ? { templateId: s.templateId } : {}), ...(s.stato ? { stato: s.stato } : {}), ...(s.q ? { q: s.q } : {}), scope: s.scope, archived: s.archived },
      readAt: ctx.now.toISOString(),
    });
  }
  return ctx.sources.add({ kind: "QUERY", label: "Ricerca dell'assistente con questi filtri", question: ctx.question, readAt: ctx.now.toISOString() });
}

export async function getPractices(ctx: ToolContext, args: z.infer<typeof getPracticesSchema>): Promise<ToolResult<PracticeItem>> {
  const sel = normalizeSelection(args.selection);
  let docs: PracticeDoc[];
  let total: number;
  if (sel.assignee) {
    const scanned = await scanSelection(ctx, sel, { activeOnly: args.activeOnly });
    total = scanned.length;
    docs = scanned.slice(0, MAX_ITEMS).map((c) => c.practice);
  } else {
    const filter = selectionFilter(ctx.user, sel, { activeOnly: args.activeOnly });
    total = await countSelection(ctx, sel, { activeOnly: args.activeOnly });
    docs = filter
      ? await store.practices(ctx.db).aggregate<PracticeDoc>([{ $match: filter }, ...listOrderStages(), { $limit: MAX_ITEMS }, { $project: { _closed: 0 } }], { maxTimeMS: QUERY_MS }).toArray()
      : [];
  }
  const setIndex = selectionSource(ctx, sel, { activeOnly: args.activeOnly });
  ctx.facts.add({ key: "practices.total", label: "Pratiche trovate", value: total, scopeLabel: "Pratiche visibili con questi filtri", sourceIndex: setIndex });
  return fitResult(
    {
      asOf: ctx.now.toISOString(),
      selection: { ...sel, ...(args.activeOnly ? { activeOnly: true } : {}), fonteInsieme: setIndex },
      items: docs.map((p) => practiceItem(ctx, p)),
      total,
      complete: docs.length === total,
      truncated: docs.length < total,
      ...(docs.length < total ? { omittedReason: "ROWS" as const, note: `Mostrate ${docs.length} di ${total}: restringi i filtri per vederle tutte.` } : {}),
    },
    8000
  );
}

/* ---------- get_practice ---------- */

const TOPICS = ["identity", "milestones", "notes", "assignments", "constraints"] as const;
export const getPracticeSchema = z.strictObject({
  practiceId: objectIdSchema,
  iteration: z.number().int().min(1).optional(),
  topics: z.array(z.enum(TOPICS)).min(1).max(5),
});

const NOTE_MAX = 1500;
const fmt = (v: FieldValue): string | number | boolean | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.map((x) => x.code).join(", ");
  return (v as { code: string; otherText?: string }).otherText ?? (v as { code: string }).code;
};

async function loadDetail(ctx: ToolContext, practiceId: string, n?: number): Promise<{ detail: PraticaDetailDTO; practice: PracticeDoc }> {
  try {
    const detail = await getPracticeDetail(ctx.db, ctx.user, practiceId, n);
    const practice = (await store.practices(ctx.db).findOne({ _id: new ObjectId(practiceId) }, { maxTimeMS: QUERY_MS }))!;
    return { detail, practice };
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) throw new ToolError("NOT_FOUND", "Pratica non trovata o non visibile");
    throw e;
  }
}

export async function getPractice(ctx: ToolContext, args: z.infer<typeof getPracticeSchema>): Promise<ToolResult> {
  const { detail, practice } = await loadDetail(ctx, args.practiceId, args.iteration);
  const template = await getTemplate(detail.templateId, detail.templateVersion, async () => ctx.db);
  const masterOf = new Map<string, FieldOccurrenceDTO>(template.occurrences.filter((o) => o.kind === "MASTER" && o.flowId).map((o) => [o.flowId!, o]));
  const at = (flowId: string, rowId?: string) => {
    const o = masterOf.get(flowId);
    return { iteration: detail.iteration, flowId, ...(o ? { sectionKey: o.sectionKey, occurrenceKey: o.occurrenceKey } : {}), ...(rowId ? { rowId } : {}) };
  };
  const items: Record<string, unknown>[] = [];
  const topics = new Set(args.topics);

  if (topics.has("identity")) {
    const origin = practice.originPracticeId ? await store.practices(ctx.db).findOne({ _id: practice.originPracticeId }, { maxTimeMS: QUERY_MS }) : null;
    items.push({
      argomento: "identity",
      fonte: practiceSource(ctx, practice, "Scheda della pratica", { iteration: detail.iteration }),
      codiceSito: detail.codiceSito,
      nomeSito: detail.nomeSito,
      codiceG7: detail.codiceG7,
      templateId: detail.templateId,
      committente: detail.committente?.code ?? null,
      clienteFinale: detail.clienteFinale?.code ?? null,
      stato: detail.statoAttivita,
      statoImpostatoAMano: detail.statoSource === "MANUAL",
      iterazione: detail.iteration,
      iterazioneCorrente: detail.iteration === practice.currentIterationN,
      iterazioni: detail.iterations.map((i) => i.n),
      archiviata: practice.archived,
      // Collegamento alla pratica d'origine solo se visibile (nessun nome da collegamenti non autorizzati).
      ...(origin && canSeePractice(ctx.user, origin)
        ? { rilavorazioneDi: { id: origin._id.toHexString(), codiceSito: origin.currentSummary.codiceSito, fonte: practiceSource(ctx, origin, "Pratica d'origine") } }
        : {}),
    });
  }

  if (topics.has("milestones")) {
    for (const e of catalogFor(detail.templateId)) {
      const rows = e.repeatGroup ? detail.repeats[e.repeatGroup] ?? [] : [{ rowId: undefined as string | undefined, values: detail.values }];
      for (const r of rows) {
        const date = r.values[e.flowId];
        const done = e.completionFlowId ? r.values[e.completionFlowId] : undefined;
        if (isEmptyValue(date) && isEmptyValue(done)) continue;
        items.push({
          argomento: "milestones",
          fonte: practiceSource(ctx, practice, e.label, at(e.flowId, r.rowId)),
          milestone: e.semanticId,
          etichetta: e.label,
          tipo: e.dateKind,
          data: fmt(date ?? null),
          ...(e.completionFlowId ? { conclusione: fmt(done ?? null) } : {}),
          ...(r.rowId ? { riga: r.rowId } : {}),
        });
      }
    }
  }

  if (topics.has("notes")) {
    // Solo le note visibili (chiave assente = non visibile, D-121): il filtro è già nella scheda.
    for (const [group, text] of Object.entries(detail.transversal.noteOperative ?? {}) as [GroupId, string][]) {
      if (!text || !text.trim()) continue;
      items.push({
        argomento: "notes",
        fonte: practiceSource(ctx, practice, `Note Operative ${group}`, { iteration: detail.iteration, occurrenceKey: `TRASV.NOTE_OPERATIVE.${group}` }),
        campo: `Note Operative ${group}`,
        gruppo: group,
        nota: clip(text, NOTE_MAX),
      });
    }
    // Campi note della scheda (testo lungo), leggibili come nell'app; nelle righe ripetibili con le date della riga.
    for (const o of template.occurrences.filter((x) => x.kind === "MASTER" && x.flowId && x.dataType === "LONGTEXT")) {
      const rows = o.repeatGroup ? (detail.repeats[o.repeatGroup] ?? []).map((r) => ({ values: r.values, rowId: r.rowId as string | undefined })) : [{ values: detail.values, rowId: undefined }];
      for (const r of rows) {
        const text = r.values[o.flowId!];
        if (typeof text !== "string" || !text.trim()) continue;
        const siblings = o.repeatGroup
          ? Object.fromEntries(
              template.occurrences
                .filter((x) => x.kind === "MASTER" && x.repeatGroup === o.repeatGroup && x.dataType === "DATE" && !isEmptyValue(r.values[x.flowId!]))
                .map((x) => [x.label, fmt(r.values[x.flowId!])])
            )
          : undefined;
        items.push({
          argomento: "notes",
          fonte: practiceSource(ctx, practice, o.label, at(o.flowId!, r.rowId)),
          campo: o.label,
          nota: clip(text, NOTE_MAX),
          ...(siblings && Object.keys(siblings).length ? { dateDellaRiga: siblings } : {}),
        });
      }
    }
  }

  if (topics.has("assignments")) {
    const fields = userFields(template);
    const ids = new Set<string>();
    const found: { o: FieldOccurrenceDTO; codes: string[]; rowId?: string }[] = [];
    for (const o of fields) {
      const sources = o.repeatGroup ? (detail.repeats[o.repeatGroup] ?? []).map((r) => ({ v: r.values[o.flowId!], rowId: r.rowId })) : [{ v: detail.values[o.flowId!], rowId: undefined }];
      for (const s of sources) {
        const codes = (Array.isArray(s.v) ? s.v : s.v && typeof s.v === "object" ? [s.v] : []).map((x) => (x as { code: string }).code).filter((c) => /^[0-9a-f]{24}$/.test(c));
        if (codes.length) {
          codes.forEach((c) => ids.add(c));
          found.push({ o, codes, rowId: s.rowId });
        }
      }
    }
    const names = new Map(
      (await store.users(ctx.db).find({ _id: { $in: [...ids].map((i) => new ObjectId(i)) } }, { projection: { name: 1 }, maxTimeMS: QUERY_MS }).toArray()).map((u) => [u._id.toHexString(), u.name])
    );
    for (const f of found) {
      items.push({
        argomento: "assignments",
        fonte: practiceSource(ctx, practice, f.o.label, at(f.o.flowId!, f.rowId)),
        campo: f.o.label,
        persone: f.codes.map((c) => ({ id: c, nome: names.get(c) ?? "(utente non trovato)" })),
      });
    }
  }

  if (topics.has("constraints")) {
    for (const r of detail.repeats.VINCOLI ?? []) {
      if (!r.constraint) continue;
      items.push({
        argomento: "constraints",
        fonte: practiceSource(ctx, practice, `Vincolo ${r.constraint.code}`, { iteration: detail.iteration, rowId: r.rowId }),
        vincolo: r.constraint.code,
        stato: r.constraint.stato?.code ?? null,
        ente: r.constraint.ente?.code ?? null,
      });
    }
  }

  const limited = items.slice(0, MAX_ITEMS);
  const others = detail.iterations.map((i) => i.n).filter((n) => n !== detail.iteration);
  return fitResult(
    {
      asOf: ctx.now.toISOString(),
      selection: { practiceId: args.practiceId, iterazione: detail.iteration, argomenti: [...topics] },
      ...(items.length === 0
        ? { note: `Niente per questi argomenti nell'iterazione ${detail.iteration}.${others.length ? ` La pratica ha anche le iterazioni ${others.join(", ")}: per i dati di un'iterazione passata ripeti con iteration.` : ""}` }
        : others.length
          ? { note: `Iterazione ${detail.iteration}; altre iterazioni: ${others.join(", ")}.` }
          : {}),
      items: limited,
      complete: limited.length === items.length,
      truncated: limited.length < items.length,
      ...(limited.length < items.length ? { omittedReason: "ROWS" as const } : {}),
    },
    12000
  );
}
