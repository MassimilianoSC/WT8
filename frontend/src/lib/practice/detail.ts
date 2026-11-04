/**
 * Dall'aggregato della pratica (documenti _v2) ai DTO del contratto §5 (B5b). PURO: il servizio carica i
 * documenti e il template della versione dell'iterazione, qui si calcolano accessi, azioni e avanzamento con
 * gli stessi motori che usano le scritture (B4, B5a).
 *
 * Iterazione passata (contratto §5): valori, righe, trasversali, stato, G7, avanzamento e versione sono di
 * quell'iterazione; archiviazione, origine, gruppi abilitati, iterazioni e revisione sono quelli attuali;
 * access vuoto, repeatAccess tutto falso, azioni tutte false, alert vuoti.
 */
import {
  GROUP_IDS,
  type AlertDTO,
  type FieldValue,
  type GroupId,
  type GroupProgressDTO,
  type IterationRefDTO,
  type OccurrenceAccessDTO,
  noteOperativeKey,
  type PraticaActionsDTO,
  type PraticaDetailDTO,
  type PraticaSummaryDTO,
  type RepeatRowDTO,
  type TemplateDTO,
} from "@/lib/contract";
import { accessMap, practiceActions, repeatAccess, type AccessPractice, type AccessUser } from "@/lib/engines/access";
import { FATTURABILE_META_KEY, type EngineRow, type EngineSnapshot } from "@/lib/engines/formulas";
import { computeProgress } from "@/lib/engines/progress";
import { notesOf, visibleNoteGroups, visibleNotes } from "@/lib/practice/notes";
import { IDENTITY_FLOWS, summaryOf } from "@/lib/store/practice-factory";
import type { IterationDoc, PracticeDoc, RepeatRowDoc } from "@/lib/store/types";

export interface PracticeAggregate {
  practice: PracticeDoc;
  /** Iterazione mostrata (corrente o passata). */
  iteration: IterationDoc;
  /** Righe dell'iterazione mostrata. */
  rows: RepeatRowDoc[];
  /** Tutte le iterazioni della pratica (solo i campi per IterationRefDTO). */
  iterations: Array<Pick<IterationDoc, "_id" | "n" | "values" | "createdAt">>;
}

const iso = (d: Date) => d.toISOString();

export const NO_ACTIONS: PraticaActionsDTO = {
  assignableGroups: [],
  canAssign: false,
  canChangeStato: false,
  canArchive: false,
  canRestore: false,
  canDelete: false,
  canRework: false,
  canResubmit: false,
};

/* ---------- motori ---------- */

export function toEngineRow(r: RepeatRowDoc): EngineRow {
  const m = r.metadata ?? {};
  return {
    rowId: r._id.toHexString(),
    ordinal: r.ordinal,
    values: r.values,
    metadata: {
      ...(m.origin ? { origin: { groupKey: m.origin.groupKey, rowId: m.origin.rowId.toHexString() } } : {}),
      ...(m.locked !== undefined ? { locked: m.locked } : {}),
      ...(m.warning !== undefined ? { warning: m.warning } : {}),
      ...(m.integrationCheck ? { integrationCheck: m.integrationCheck } : {}),
      // D-132 P-01: anche il nome generato (null compreso: "generata senza ente") e il consumo del ciclo ARPA.
      ...("generatedName" in m && m.generatedName !== undefined ? { generatedName: m.generatedName } : {}),
      ...(m.arpaOpened !== undefined ? { arpaOpened: m.arpaOpened } : {}),
    },
    ...(r.constraint ? { constraint: r.constraint } : {}),
  };
}

/** Istantanea dell'iterazione per i motori (righe in ordine di ordinal). */
export function engineSnapshot(iteration: IterationDoc, rows: RepeatRowDoc[]): EngineSnapshot {
  const repeats: Record<string, EngineRow[]> = {};
  for (const r of [...rows].sort((a, b) => a.ordinal - b.ordinal)) (repeats[r.groupKey] ??= []).push(toEngineRow(r));
  return { values: iteration.values, repeats, formulaMeta: iteration.formulaMeta, transversal: iteration.transversal };
}

export function progressOf(template: TemplateDTO, iteration: IterationDoc, rows: RepeatRowDoc[]): Record<GroupId, GroupProgressDTO> {
  return computeProgress(template, engineSnapshot(iteration, rows));
}

/* ---------- DTO ---------- */

export function toRepeatsDTO(template: TemplateDTO, rows: RepeatRowDoc[]): Record<string, RepeatRowDTO[]> {
  const out: Record<string, RepeatRowDTO[]> = Object.fromEntries(template.repeatGroups.map((g) => [g.key, [] as RepeatRowDTO[]]));
  for (const r of [...rows].sort((a, b) => a.ordinal - b.ordinal)) {
    const m = r.metadata ?? {};
    (out[r.groupKey] ??= []).push({
      rowId: r._id.toHexString(),
      values: r.values as Record<string, FieldValue>,
      ...(m.origin ? { origin: { repeat: m.origin.groupKey, rowId: m.origin.rowId.toHexString() } } : {}),
      ...(m.locked ? { locked: true } : {}),
      ...(m.warning ? { warning: m.warning } : {}),
      ...(r.constraint ? { constraint: { code: r.constraint.code, stato: r.constraint.stato, ente: r.constraint.ente } } : {}),
    });
  }
  return out;
}

const g7Of = (values: Record<string, FieldValue>): string | null => {
  const v = values[IDENTITY_FLOWS.codiceG7];
  return v === null || v === undefined || v === "" ? null : String(v);
};

export function iterationRefs(agg: Pick<PracticeAggregate, "practice" | "iterations">): IterationRefDTO[] {
  return [...agg.iterations]
    .sort((a, b) => a.n - b.n)
    .map((i) => ({
      id: i._id.toHexString(),
      n: i.n,
      codiceG7: g7Of(i.values),
      createdAt: iso(i.createdAt),
      current: i._id.equals(agg.practice.currentIterationId),
    }));
}

export function accessPracticeOf(practice: PracticeDoc, iterationCount: number): AccessPractice {
  return {
    templateId: practice.templateId,
    archived: practice.archived,
    enabledGroups: practice.enabledGroups,
    statoAttivita: practice.currentSummary.statoAttivita,
    iterationCount,
  };
}

/** Riepilogo per l'elenco, dalla proiezione della pratica (progress memorizzato; zeri se assente). */
export function toSummaryDTO(practice: PracticeDoc): PraticaSummaryDTO {
  const s = practice.currentSummary;
  const zero = Object.fromEntries(GROUP_IDS.map((g) => [g, { filled: 0, total: 0 }])) as Record<GroupId, GroupProgressDTO>;
  return {
    id: practice._id.toHexString(),
    templateId: practice.templateId,
    codiceSito: s.codiceSito,
    nomeSito: s.nomeSito,
    committente: s.committente,
    clienteFinale: s.clienteFinale,
    codiceG7: s.codiceG7,
    iteration: practice.currentIterationN,
    statoAttivita: s.statoAttivita,
    enabledGroups: practice.enabledGroups,
    archived: practice.archived,
    archivedAt: practice.archivedAt ? iso(practice.archivedAt) : null,
    originPracticeId: practice.originPracticeId ? practice.originPracticeId.toHexString() : null,
    openAlerts: s.openAlerts,
    progress: s.progress ?? zero,
    createdAt: iso(practice.createdAt),
    updatedAt: iso(practice.updatedAt),
  };
}

/** Le occorrenze delle note di gruppi non visibili non compaiono nemmeno nella mappa degli accessi (D-121). */
function withoutHiddenNotes(access: Record<string, OccurrenceAccessDTO>, groups: readonly GroupId[]): Record<string, OccurrenceAccessDTO> {
  const hidden = new Set(GROUP_IDS.filter((g) => !groups.includes(g)).map(noteOperativeKey));
  return Object.fromEntries(Object.entries(access).filter(([k]) => !hidden.has(k as never)));
}

export function toDetailDTO(agg: PracticeAggregate, template: TemplateDTO, user: AccessUser, alerts: AlertDTO[] = []): PraticaDetailDTO {
  const { practice, iteration, rows } = agg;
  const current = iteration._id.equals(practice.currentIterationId);
  const view = { isCurrentIteration: current };
  const ap = accessPracticeOf(practice, agg.iterations.length);
  const s = summaryOf(iteration, current ? practice.currentSummary.openAlerts : 0);
  const noteGroups = visibleNoteGroups(user, practice.templateId);
  const repeatsAccess = current
    ? repeatAccess(user, ap, template, view)
    : Object.fromEntries(template.repeatGroups.map((g) => [g.key, { canAddRows: false, canRemoveRows: false }]));
  return {
    ...toSummaryDTO(practice),
    codiceSito: s.codiceSito,
    nomeSito: s.nomeSito,
    committente: s.committente,
    clienteFinale: s.clienteFinale,
    codiceG7: s.codiceG7,
    iteration: iteration.n,
    statoAttivita: iteration.stateMeta.stato,
    openAlerts: s.openAlerts,
    progress: progressOf(template, iteration, rows),
    revision: practice.revision,
    iterationId: iteration._id.toHexString(),
    templateVersion: iteration.templateVersion,
    statoSource: iteration.stateMeta.source,
    manualLocks: Object.entries(iteration.formulaMeta)
      .filter(([k, m]) => k !== FATTURABILE_META_KEY && m.mode === "MANUAL")
      .map(([k]) => k)
      .sort(),
    // Solo le note dei gruppi visibili all'utente (D-121).
    transversal: { ...iteration.transversal, noteOperative: visibleNotes(notesOf(iteration.transversal), noteGroups) },
    values: iteration.values,
    repeats: toRepeatsDTO(template, rows),
    // Anche nelle iterazioni passate (v0.4.2): ogni occorrenza in sola lettura con il suo motivo (PAST_ITERATION, o
    // ARCHIVED se la pratica è archiviata), così l'interfaccia lo spiega campo per campo.
    access: withoutHiddenNotes(accessMap(user, ap, template, view), noteGroups),
    repeatAccess: repeatsAccess,
    actions: current ? practiceActions(user, ap, view) : { ...NO_ACTIONS },
    iterations: iterationRefs(agg),
    alerts: current ? alerts : [],
  };
}
