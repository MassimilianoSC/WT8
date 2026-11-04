/**
 * Costruttori PURI dei documenti di una pratica del modello nuovo (nessun accesso al database).
 * Usati dal seed demo (B3) e dai comandi di creazione / ripresentazione / rilavorazione (B5).
 */
import { ObjectId } from "mongodb";
import { GROUP_IDS, type FieldValue, type GroupId, type GroupProgressDTO, type SelectValue, type StatoAttivita, type TemplateDTO, type TemplateId } from "@/lib/contract";
import type { IterationDoc, PracticeDoc, RepeatRowDoc, TransversalDoc } from "@/lib/store/types";

/** Identità visibile della pratica: F001–F005 in tutti i template (D-38). */
export interface PracticeIdentity {
  codiceG7: string;
  codiceSito: string;
  nomeSito: string;
  committente: SelectValue;
  clienteFinale: SelectValue;
}

export const IDENTITY_FLOWS = { codiceG7: "F001", codiceSito: "F002", nomeSito: "F003", committente: "F004", clienteFinale: "F005" } as const;

/** Le quattro Note Operative vuote (D-121). */
export function emptyNotes(): Record<GroupId, string> {
  return Object.fromEntries(GROUP_IDS.map((g) => [g, ""])) as Record<GroupId, string>;
}

export function emptyTransversal(): TransversalDoc {
  return { noteOperative: emptyNotes(), fatturabile: "NO", fatturabileManual: false, fatturato: null };
}

/** Valori F001–F005 dall'identità; Codice G7 è NUMBER nei template (D-93.6). */
export function identityValues(identity: PracticeIdentity): Record<string, FieldValue> {
  return {
    [IDENTITY_FLOWS.codiceG7]: Number(identity.codiceG7),
    [IDENTITY_FLOWS.codiceSito]: identity.codiceSito,
    [IDENTITY_FLOWS.nomeSito]: identity.nomeSito,
    [IDENTITY_FLOWS.committente]: identity.committente,
    [IDENTITY_FLOWS.clienteFinale]: identity.clienteFinale,
  };
}

/** Le 11 righe fisse di VINCOLI di un'iterazione: nessuno stato iniziale (mai ASSENTE per difetto, D-99). */
export function constraintRows(
  template: TemplateDTO,
  ids: { practiceId: ObjectId; iterationId: ObjectId },
  now: Date,
  rowId: (ordinal: number) => ObjectId = () => new ObjectId()
): RepeatRowDoc[] {
  if (!template.repeatGroups.some((g) => g.key === "VINCOLI")) return [];
  return template.constraints.map((c, i) => ({
    _id: rowId(i + 1),
    practiceId: ids.practiceId,
    iterationId: ids.iterationId,
    groupKey: "VINCOLI",
    ordinal: i + 1,
    values: {},
    constraint: { code: c.code, stato: null, ente: c.defaultEnte ? { code: c.defaultEnte } : null },
    metadata: {},
    createdAt: now,
    updatedAt: now,
  }));
}

export interface NewIterationInput {
  practiceId: ObjectId;
  iterationId: ObjectId;
  n: number;
  template: TemplateDTO;
  values: Record<string, FieldValue>;
  transversal?: TransversalDoc;
  stato?: StatoAttivita;
  now: Date;
}

export function buildIteration(input: NewIterationInput): IterationDoc {
  const stato = input.stato ?? "CREATA";
  return {
    _id: input.iterationId,
    practiceId: input.practiceId,
    n: input.n,
    templateVersion: input.template.version,
    values: input.values,
    transversal: input.transversal ?? emptyTransversal(),
    stateMeta: { stato, source: "AUTO", autoStato: stato, autoEvent: null, manualBaseline: null, manualAt: null, manualBy: null },
    formulaMeta: {},
    createdAt: input.now,
    closedAt: null,
  };
}

export interface NewPracticeInput {
  practiceId: ObjectId;
  iterationId: ObjectId;
  templateId: TemplateId;
  template: TemplateDTO;
  identity: PracticeIdentity;
  /** Altri valori non ripetibili oltre all'identità. */
  values?: Record<string, FieldValue>;
  createdBy: ObjectId | null;
  originPracticeId?: ObjectId | null;
  /** PM_PERMESSI è sempre abilitato dalla creazione (D-22). */
  enabledGroups?: GroupId[];
  now: Date;
}

/** Ultimo ordinal per gruppo delle righe date (D-132 P-03): punto di partenza del contatore dell'iterazione. */
export function rowSeqOf(rows: ReadonlyArray<Pick<RepeatRowDoc, "groupKey" | "ordinal">>): Record<string, number> {
  const seq: Record<string, number> = {};
  for (const r of rows) seq[r.groupKey] = Math.max(seq[r.groupKey] ?? 0, r.ordinal);
  return seq;
}

/** Pratica nuova con la prima iterazione (stato CREATA) e le righe fisse di VINCOLI. */
export function buildNewPractice(input: NewPracticeInput): { practice: PracticeDoc; iteration: IterationDoc; rows: RepeatRowDoc[] } {
  if (input.template.id !== input.templateId) throw new Error(`Template ${input.template.id} diverso da ${input.templateId}`);
  const iteration = buildIteration({
    practiceId: input.practiceId,
    iterationId: input.iterationId,
    n: 1,
    template: input.template,
    values: { ...identityValues(input.identity), ...input.values },
    now: input.now,
  });
  const enabledGroups = Array.from(new Set<GroupId>(["PM_PERMESSI", ...(input.enabledGroups ?? [])]));
  const practice: PracticeDoc = {
    _id: input.practiceId,
    templateId: input.templateId,
    currentIterationId: input.iterationId,
    currentIterationN: 1,
    revision: 1,
    archived: false,
    archivedAt: null,
    originPracticeId: input.originPracticeId ?? null,
    enabledGroups,
    currentSummary: summaryOf(iteration, 0),
    createdBy: input.createdBy,
    createdAt: input.now,
    updatedAt: input.now,
  };
  const rows = constraintRows(input.template, input, input.now);
  iteration.rowSeq = rowSeqOf(rows);
  return { practice, iteration, rows };
}

/** Proiezione per l'elenco calcolata dall'iterazione corrente. */
export function summaryOf(iteration: IterationDoc, openAlerts: number, progress?: Record<GroupId, GroupProgressDTO>): PracticeDoc["currentSummary"] {
  const v = iteration.values;
  const sel = (x: FieldValue | undefined): SelectValue => (x && typeof x === "object" && !Array.isArray(x) ? x : { code: "" });
  const g7 = v[IDENTITY_FLOWS.codiceG7];
  return {
    codiceSito: String(v[IDENTITY_FLOWS.codiceSito] ?? ""),
    nomeSito: String(v[IDENTITY_FLOWS.nomeSito] ?? ""),
    committente: sel(v[IDENTITY_FLOWS.committente]),
    clienteFinale: sel(v[IDENTITY_FLOWS.clienteFinale]),
    codiceG7: g7 === null || g7 === undefined || g7 === "" ? null : String(g7),
    statoAttivita: iteration.stateMeta.stato,
    statoSource: iteration.stateMeta.source,
    transversal: iteration.transversal,
    openAlerts,
    ...(progress ? { progress } : {}),
  };
}
