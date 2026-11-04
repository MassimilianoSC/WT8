/**
 * Import B9, parte PURA (D-49, D-135): chiave della riga, abbinamento alle pratiche e piano dei valori.
 * Il commit rifà lo stesso piano dentro la transazione della riga sui dati di quel momento: l'anteprima non è
 * vincolante, il ricontrollo dei campi vuoti sì.
 */
import type { FieldOccurrenceDTO, FieldValue, ImportSkipReason, SelectValue, TemplateDTO, TemplateId } from "@/lib/contract";
import { isEmpty } from "@/lib/engines/conditions";
import { resolveTemplate } from "@/lib/engines/resolve-template";
import { HttpError } from "@/lib/http-error";
import type { ImportColumn } from "@/lib/import/columns";
import { convertCell, type Cell, type ConvertLookups } from "@/lib/import/convert";
import { normalizeFieldValue, normalizeSiteKey } from "@/lib/practice/normalize";
import { IDENTITY_FLOWS } from "@/lib/store/practice-factory";
import { assertIstatCascade } from "@/services/practices-v2/validation";

export interface RowKey {
  codiceG7: number;
  codiceSito: string;
  nomeSito: string;
}

export const keyString = (k: RowKey) => `${k.codiceG7}|${k.codiceSito}|${k.nomeSito}`;

export interface PlannedChange {
  flowId: string;
  label: string;
  value: FieldValue;
}

export interface PlannedSkip {
  flowId: string;
  label: string;
  reason: ImportSkipReason;
  /** Spiegazione leggibile (valore non riconosciuto, valore già presente…). */
  detail?: string;
}

export interface RowPlan {
  changes: PlannedChange[];
  skipped: PlannedSkip[];
  errors: string[];
}

const masterOf = (t: Pick<TemplateDTO, "occurrences">, flowId: string) =>
  t.occurrences.find((o) => o.kind === "MASTER" && o.flowId === flowId && !o.repeatGroup);

const columnOf = (columns: ReadonlyArray<ImportColumn>, flowId: string) => columns.find((c) => c.importable && c.flowId === flowId);

/** Le tre colonne della chiave D-49 devono esserci, altrimenti nessuna riga è abbinabile. */
export function missingKeyColumns(template: Pick<TemplateDTO, "occurrences">, columns: ReadonlyArray<ImportColumn>): string[] {
  return [IDENTITY_FLOWS.codiceG7, IDENTITY_FLOWS.codiceSito, IDENTITY_FLOWS.nomeSito]
    .filter((f) => !columnOf(columns, f))
    .map((f) => `${f} ${masterOf(template, f)?.label ?? ""}`.trim());
}

/** Chiave D-49 della riga: Codice G7 intero non negativo, Codice Sito e Nome Sito non vuoti (spazi normalizzati, D-138). */
export function keyOfRow(
  template: Pick<TemplateDTO, "occurrences">,
  columns: ReadonlyArray<ImportColumn>,
  cells: ReadonlyArray<Cell>,
  lookups: ConvertLookups
): { key: RowKey } | { error: string } {
  const read = (flowId: string, integer = false) => {
    const col = columnOf(columns, flowId);
    const occ = masterOf(template, flowId);
    if (!col || !occ) return null;
    const c = convertCell(occ, cells[col.index], lookups, { integer });
    return c.ok && "value" in c ? c.value : null;
  };
  const g7 = read(IDENTITY_FLOWS.codiceG7, true);
  const sito = read(IDENTITY_FLOWS.codiceSito);
  const nome = read(IDENTITY_FLOWS.nomeSito);
  if (typeof g7 !== "number" || typeof sito !== "string" || typeof nome !== "string") {
    return { error: "Servono Codice G7 (numero intero), Codice Sito e Nome Sito per abbinare la riga (D-49)" };
  }
  return { key: { codiceG7: g7, codiceSito: normalizeSiteKey(sito), nomeSito: normalizeSiteKey(nome) } };
}

export interface SiteCandidate {
  id: string;
  codiceG7: string | null;
  codiceSito: string;
  nomeSito: string;
  archived: boolean;
  createdAt: Date;
}

export type MatchResult =
  | { outcome: "NEW_PRACTICE" }
  | { outcome: "UPDATE"; practiceId: string }
  | { outcome: "REWORK"; practiceId: string }
  | { outcome: "AMBIGUOUS"; candidateIds: string[] }
  | { outcome: "ERROR"; error: string };

/**
 * Abbinamento D-49 sull'iterazione corrente (candidates = pratiche dello stesso template, qualunque sito; si
 * filtra qui). Confronto esatto dopo la normalizzazione degli spazi (D-138).
 * - stesso sito e stesso G7: una pratica attiva → UPDATE; più di una → AMBIGUOUS; solo archiviate → ERROR;
 * - stesso sito, G7 nuovo → REWORK dalla pratica del sito creata per ultima (anche archiviata, come il comando);
 * - nessuna → NEW_PRACTICE.
 */
export function matchKey(key: RowKey, candidates: ReadonlyArray<SiteCandidate>): MatchResult {
  const site = candidates.filter((c) => normalizeSiteKey(c.codiceSito) === key.codiceSito && normalizeSiteKey(c.nomeSito) === key.nomeSito);
  if (site.length === 0) return { outcome: "NEW_PRACTICE" };
  const sameG7 = site.filter((c) => c.codiceG7 !== null && c.codiceG7.trim() === String(key.codiceG7));
  if (sameG7.length > 0) {
    const active = sameG7.filter((c) => !c.archived);
    if (active.length === 1) return { outcome: "UPDATE", practiceId: active[0].id };
    if (active.length > 1) return { outcome: "AMBIGUOUS", candidateIds: active.map((c) => c.id) };
    return { outcome: "ERROR", error: "La pratica con questa chiave è archiviata: ripristinala per importare" };
  }
  const origin = [...site].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))[0];
  return { outcome: "REWORK", practiceId: origin.id };
}

/** Profondità nella cascata ISTAT (Regione 0, Provincia 1, Comune 2): i genitori si convertono prima dei figli. */
function istatDepth(template: Pick<TemplateDTO, "occurrences">, occ: FieldOccurrenceDTO): number {
  let depth = 0;
  for (let o: FieldOccurrenceDTO | undefined = occ; o?.list?.parentFlowId; o = masterOf(template, o.list.parentFlowId)) depth++;
  return depth;
}

const codeOf = (v: FieldValue | undefined) => (v && typeof v === "object" && !Array.isArray(v) ? (v as SelectValue).code : null);

/** Rappresentazione per il confronto: gli elenchi senza badare all'ordine. */
function comparable(v: FieldValue | undefined): string {
  if (Array.isArray(v)) return JSON.stringify([...v].map((x) => JSON.stringify(x)).sort());
  return JSON.stringify(v ?? null);
}

export type PlanTarget =
  /** Valori dell'iterazione corrente della pratica (UPDATE) o ereditati dall'origine (REWORK); vuoto per NEW_PRACTICE. */
  { kind: "UPDATE" | "REWORK" | "NEW_PRACTICE"; values: Record<string, FieldValue | undefined> };

/**
 * Piano dei valori di una riga: si propongono solo i campi VUOTI nel bersaglio (D-49). Un valore uguale a quello
 * già presente non si segnala; uno diverso va in skipped ALREADY_FILLED. Le convalide sono quelle del salvataggio:
 * normalizzazione (D-110), liste e utenti (le ricerche accettano solo voci attive e utenti assegnabili), cascata
 * ISTAT sul risultato finale. Un valore non valido va in skipped INVALID e non blocca la riga.
 */
export function planRow(
  template: Pick<TemplateDTO, "occurrences">,
  templateId: TemplateId,
  columns: ReadonlyArray<ImportColumn>,
  cells: ReadonlyArray<Cell>,
  lookups: ConvertLookups,
  target: PlanTarget,
  opts: { date1904?: boolean } = {}
): RowPlan {
  const skipped: PlannedSkip[] = [];
  const changes: PlannedChange[] = [];
  const errors: string[] = [];
  const blank = (c: Cell) => c === null || c === undefined || (typeof c === "string" && c.trim() === "");

  // Colonne riconosciute ma non importabili: una voce per campo, solo se la cella ha un valore.
  const notImportable = new Set<string>();
  for (const col of columns) {
    if (col.importable || !col.flowId || blank(cells[col.index]) || notImportable.has(col.flowId)) continue;
    notImportable.add(col.flowId);
    skipped.push({ flowId: col.flowId, label: masterOf(template, col.flowId)?.label ?? col.header, reason: "NOT_IMPORTABLE", detail: col.note });
  }

  const importable = columns
    .filter((c) => c.importable && c.flowId && !blank(cells[c.index]))
    .map((c) => ({ col: c, occ: masterOf(template, c.flowId!)! }))
    .filter((x) => x.occ)
    .sort((a, b) => istatDepth(template, a.occ) - istatDepth(template, b.occ));

  // Valore effettivo dopo l'import: quello presente se c'è, altrimenti quello proposto.
  const effective: Record<string, FieldValue | undefined> = { ...target.values };
  const istatChanges: PlannedChange[] = [];

  for (const { col, occ } of importable) {
    const flowId = occ.flowId!;
    // Nella rilavorazione il Codice G7 lo imposta il comando (è quello della chiave).
    if (target.kind === "REWORK" && flowId === IDENTITY_FLOWS.codiceG7) continue;
    const parentFlow = occ.list?.kind === "ISTAT" ? occ.list.parentFlowId : undefined;
    const converted = convertCell(occ, cells[col.index], lookups, {
      integer: flowId === IDENTITY_FLOWS.codiceG7,
      parentCode: parentFlow ? codeOf(effective[parentFlow]) : null,
      date1904: opts.date1904,
    });
    if (!converted.ok) {
      skipped.push({ flowId, label: occ.label, reason: "INVALID", detail: converted.reason });
      continue;
    }
    if (!("value" in converted)) continue;
    let value: FieldValue;
    try {
      value = normalizeFieldValue(occ, converted.value);
    } catch (e) {
      if (!(e instanceof HttpError)) throw e;
      skipped.push({ flowId, label: occ.label, reason: "INVALID", detail: e.message });
      continue;
    }
    if (isEmpty(value)) continue;
    const present = target.values[flowId];
    if (!isEmpty(present)) {
      if (comparable(present) !== comparable(value)) {
        skipped.push({ flowId, label: occ.label, reason: "ALREADY_FILLED", detail: "il campo ha già un valore: l'import non sovrascrive" });
      }
      continue;
    }
    const change = { flowId, label: occ.label, value };
    if (occ.list?.kind === "ISTAT") istatChanges.push(change);
    else changes.push(change);
    effective[flowId] = value;
  }

  // Cascata ISTAT sul risultato finale, un campo alla volta dal più alto: chi la rompe resta fuori.
  const accepted: Record<string, FieldValue | undefined> = { ...target.values, ...Object.fromEntries(changes.map((c) => [c.flowId, c.value])) };
  for (const c of istatChanges) {
    const trial = { ...accepted, [c.flowId]: c.value };
    try {
      assertIstatCascade(template.occurrences, trial, new Set([c.flowId]));
      accepted[c.flowId] = c.value;
      changes.push(c);
    } catch (e) {
      if (!(e instanceof HttpError) || e.status !== 422) throw e;
      skipped.push({ flowId: c.flowId, label: c.label, reason: "INVALID", detail: e.message });
    }
  }

  if (target.kind === "NEW_PRACTICE") {
    for (const f of Object.values(IDENTITY_FLOWS)) {
      if (isEmpty(accepted[f])) errors.push(`${masterOf(template, f)?.label ?? f}: obbligatorio per una nuova pratica (D-38)`);
    }
    const committente = accepted[IDENTITY_FLOWS.committente] as SelectValue | undefined;
    const clienteFinale = accepted[IDENTITY_FLOWS.clienteFinale] as SelectValue | undefined;
    if (committente && clienteFinale) {
      const resolved = resolveTemplate({ committente, clienteFinale });
      if (resolved.templateId && resolved.templateId !== templateId) {
        errors.push(`Committente e Cliente Finale corrispondono al gestore ${resolved.templateId}, non a ${templateId}`);
      }
    }
  }

  const order = new Map(columns.map((c, i) => [c.flowId, i]));
  changes.sort((a, b) => (order.get(a.flowId) ?? 0) - (order.get(b.flowId) ?? 0));
  return { changes, skipped, errors };
}
