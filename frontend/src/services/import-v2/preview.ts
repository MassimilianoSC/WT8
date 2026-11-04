/**
 * POST /api/import/preview (B9, contratto §12, D-49, D-135): anteprima SENZA scritture sulle pratiche. Si salva
 * solo il piano in import_previews (24 h) per il commit. Solo ADMIN.
 *
 * Le righe si pianificano in ordine come se il file venisse confermato: una pratica creata da una riga (nuova o
 * rilavorazione) è già "presente" per le righe successive, così due righe dello stesso sito non creano due pratiche
 * nuove ma una nuova e una rilavorazione, e la stessa chiave ripetuta è segnalata.
 */
import { BSON, ObjectId, type Db } from "mongodb";
import {
  TEMPLATE_IDS,
  type FieldValue,
  type ImportPreviewDTO,
  type ImportRowDTO,
  type TemplateDTO,
  type TemplateId,
  type UserDTO,
} from "@/lib/contract";
import { HttpError } from "@/lib/http-error";
import { mapColumns, type ImportColumn } from "@/lib/import/columns";
import type { ConvertLookups } from "@/lib/import/convert";
import { readSheet, type SheetData } from "@/lib/import/sheet";
import { toSummaryDTO } from "@/lib/practice/detail";
import { inherit, inheritancePlan } from "@/lib/practice/inheritance";
import { normalizeSiteKey } from "@/lib/practice/normalize";
import { store } from "@/lib/store/db";
import { IDENTITY_FLOWS } from "@/lib/store/practice-factory";
import type { ImportPreviewDoc, ImportPreviewRowDoc, PracticeDoc } from "@/lib/store/types";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";
import { buildLookups } from "@/services/import-v2/lookups";
import { keyOfRow, keyString, matchKey, missingKeyColumns, planRow, type SiteCandidate } from "@/services/import-v2/plan";

export const PREVIEW_TTL_MS = 24 * 3_600_000;
/** Margine sotto i 16 MB di un documento MongoDB. */
const MAX_PREVIEW_BYTES = 12 * 1024 * 1024;

export interface ImportDeps {
  db: Db;
  clock?: () => Date;
}

export interface PlannedSheetRow extends Omit<ImportPreviewRowDoc, "practiceId" | "candidateIds"> {
  practiceId: string | null;
  candidateIds: string[];
}

/**
 * Piano di tutte le righe. PURO: candidates = pratiche del template con i Codici Sito del file; valuesOf = valori
 * dell'iterazione corrente di una pratica esistente.
 */
export function planSheet(input: {
  template: TemplateDTO;
  templateId: TemplateId;
  sheet: Pick<SheetData, "rows" | "date1904">;
  columns: ReadonlyArray<ImportColumn>;
  lookups: ConvertLookups;
  candidates: ReadonlyArray<SiteCandidate>;
  valuesOf: (practiceId: string) => Record<string, FieldValue | undefined>;
}): PlannedSheetRow[] {
  const { template, templateId, columns, lookups } = input;
  const candidates: SiteCandidate[] = [...input.candidates];
  // Pratiche "create" da righe precedenti: id virtuale "riga:N" → valori dopo l'import.
  const virtual = new Map<string, Record<string, FieldValue | undefined>>();
  const firstRowOfKey = new Map<string, number>();
  const reworkPlan = inheritancePlan(template, "rework");
  const out: PlannedSheetRow[] = [];

  input.sheet.rows.forEach((row, i) => {
    const base = { rowIndex: row.rowIndex, key: null, practiceId: null, originRow: null, candidateIds: [], changes: [], skipped: [], errors: [] };
    const k = keyOfRow(template, columns, row.cells, lookups);
    if ("error" in k) return void out.push({ ...base, outcome: "ERROR", errors: [k.error] });
    const ks = keyString(k.key);
    const first = firstRowOfKey.get(ks);
    if (first !== undefined) {
      return void out.push({ ...base, key: k.key, outcome: "ERROR", errors: [`Stessa chiave della riga ${first}: unisci le due righe`] });
    }
    firstRowOfKey.set(ks, row.rowIndex);

    const m = matchKey(k.key, candidates);
    if (m.outcome === "ERROR") return void out.push({ ...base, key: k.key, outcome: "ERROR", errors: [m.error] });
    if (m.outcome === "AMBIGUOUS") {
      // La pratica la sceglie l'ADMIN: si convertono e convalidano tutti i valori della riga; quali campi sono ancora
      // vuoti lo decide il commit sulla pratica scelta (D-49). La chiave non è una modifica.
      const plan = planRow(template, templateId, columns, row.cells, lookups, { kind: "UPDATE", values: {} }, { date1904: input.sheet.date1904 });
      const identity = new Set<string>([IDENTITY_FLOWS.codiceG7, IDENTITY_FLOWS.codiceSito, IDENTITY_FLOWS.nomeSito]);
      return void out.push({
        ...base,
        key: k.key,
        outcome: "AMBIGUOUS",
        candidateIds: m.candidateIds,
        changes: plan.changes.filter((c) => !identity.has(c.flowId)),
        skipped: plan.skipped,
      });
    }

    const valuesOfAny = (id: string) => virtual.get(id) ?? input.valuesOf(id);
    let targetValues: Record<string, FieldValue | undefined> = {};
    if (m.outcome === "UPDATE") targetValues = valuesOfAny(m.practiceId);
    if (m.outcome === "REWORK") {
      const source = valuesOfAny(m.practiceId) as Record<string, FieldValue>;
      targetValues = { ...inherit(reworkPlan, { values: source, rows: [] }).values, [IDENTITY_FLOWS.codiceG7]: k.key.codiceG7 };
    }
    const plan = planRow(template, templateId, columns, row.cells, lookups, { kind: m.outcome, values: targetValues }, { date1904: input.sheet.date1904 });
    const isVirtual = "practiceId" in m && m.practiceId.startsWith("riga:");
    const planned: PlannedSheetRow = {
      ...base,
      key: k.key,
      outcome: plan.errors.length > 0 ? "ERROR" : m.outcome,
      practiceId: "practiceId" in m && !isVirtual ? m.practiceId : null,
      originRow: isVirtual ? Number(m.practiceId.slice(5)) : null,
      changes: plan.changes,
      skipped: plan.skipped,
      errors: plan.errors,
    };
    out.push(planned);

    const after = { ...targetValues, ...Object.fromEntries(plan.changes.map((c) => [c.flowId, c.value])) };
    if (planned.outcome === "UPDATE" && m.outcome === "UPDATE") virtual.set(m.practiceId, after);
    if (planned.outcome === "NEW_PRACTICE" || planned.outcome === "REWORK") {
      const id = `riga:${row.rowIndex}`;
      virtual.set(id, after);
      // Dopo le pratiche esistenti: per una rilavorazione successiva è la più recente del sito.
      candidates.push({ ...k.key, id, codiceG7: String(k.key.codiceG7), archived: false, createdAt: new Date(8.64e15 - (input.sheet.rows.length - i)) });
    }
  });
  return out;
}

export function toImportRowDTO(row: PlannedSheetRow, practices: Map<string, PracticeDoc>): ImportRowDTO {
  return {
    rowIndex: row.rowIndex,
    outcome: row.outcome,
    ...(row.practiceId ? { practiceId: row.practiceId } : {}),
    ...(row.outcome === "AMBIGUOUS" ? { candidates: row.candidateIds.flatMap((id) => (practices.has(id) ? [toSummaryDTO(practices.get(id)!)] : [])) } : {}),
    changes: row.changes,
    skipped: row.skipped.map(({ flowId, label, reason, detail }) => ({ flowId, label, reason, ...(detail ? { detail } : {}) })),
    errors: row.errors,
  };
}

export function assertAdmin(user: UserDTO) {
  if (!user.isAdmin || user.status !== "active") throw new HttpError("Solo un amministratore può importare", 403);
}

export async function previewImport(
  deps: ImportDeps,
  user: UserDTO,
  input: { templateId: string; bytes: Uint8Array; fileName?: string | null }
): Promise<ImportPreviewDTO> {
  assertAdmin(user);
  if (!(TEMPLATE_IDS as readonly string[]).includes(input.templateId)) throw new HttpError("Gestore non valido", 422);
  const templateId = input.templateId as TemplateId;
  const { template } = COMPILED_TEMPLATES[templateId];

  const sheet = readSheet(input.bytes);
  const columns = mapColumns(template, sheet.headers);
  const missing = missingKeyColumns(template, columns);
  if (missing.length) throw new HttpError(`Mancano le colonne della chiave (D-49): ${missing.join(", ")}`, 422);
  if (sheet.rows.length === 0) throw new HttpError("Il foglio non contiene righe di dati", 422);

  const lookups = await buildLookups(deps.db, templateId);
  const sites = new Set<string>();
  const siteCol = columns.find((c) => c.importable && c.flowId === IDENTITY_FLOWS.codiceSito)!;
  for (const r of sheet.rows) {
    const v = r.cells[siteCol.index];
    if (v !== null && v !== undefined && String(v).trim()) sites.add(normalizeSiteKey(String(v)));
  }
  const practiceDocs = await store.practices(deps.db).find({ templateId, "currentSummary.codiceSito": { $in: [...sites] } }).toArray();
  const practices = new Map(practiceDocs.map((p) => [p._id.toHexString(), p]));
  const iterations = await store.iterations(deps.db)
    .find({ _id: { $in: practiceDocs.map((p) => p.currentIterationId) } }, { projection: { values: 1 } })
    .toArray();
  const valuesByIteration = new Map(iterations.map((it) => [it._id.toHexString(), it.values]));

  const rows = planSheet({
    template,
    templateId,
    sheet,
    columns,
    lookups,
    candidates: practiceDocs.map((p) => ({
      id: p._id.toHexString(),
      codiceG7: p.currentSummary.codiceG7,
      codiceSito: p.currentSummary.codiceSito,
      nomeSito: p.currentSummary.nomeSito,
      archived: p.archived,
      createdAt: p.createdAt,
    })),
    valuesOf: (id) => valuesByIteration.get(practices.get(id)!.currentIterationId.toHexString()) ?? {},
  });

  const now = deps.clock?.() ?? new Date();
  const doc: ImportPreviewDoc = {
    _id: new ObjectId(),
    templateId,
    templateVersion: template.version,
    actorId: new ObjectId(user.id),
    fileName: input.fileName?.slice(0, 200) ?? null,
    columns: columns.map(({ header, index, flowId, importable, note }) => ({ header, index, flowId, importable, ...(note ? { note } : {}) })),
    rows: rows.map((r) => ({
      ...r,
      practiceId: r.practiceId ? new ObjectId(r.practiceId) : null,
      candidateIds: r.candidateIds.map((id) => new ObjectId(id)),
    })),
    createdAt: now,
    expiresAt: new Date(now.getTime() + PREVIEW_TTL_MS),
  };
  if (BSON.calculateObjectSize(doc) > MAX_PREVIEW_BYTES) throw new HttpError("Anteprima troppo grande: dividi il file in parti più piccole", 413);
  await store.importPreviews(deps.db).insertOne(doc);

  return {
    importId: doc._id.toHexString(),
    templateId,
    columns: columns.map(({ header, flowId, note }) => ({ header, flowId, ...(note ? { note } : {}) })),
    rows: rows.map((r) => toImportRowDTO(r, practices)),
  };
}
