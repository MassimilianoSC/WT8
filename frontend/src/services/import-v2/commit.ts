/**
 * POST /api/import/{importId}/commit (B9, contratto §12, D-49, D-135, D-138). Solo l'ADMIN che ha fatto l'anteprima.
 *
 * Ogni riga è una transazione a sé (runOperation con operationId "<operationId>:<riga>"): una riga in errore non annulla
 * le altre, e un nuovo tentativo con la stessa operationId rifà solo le righe non riuscite (le altre sono replay).
 * La conferma intera ha la sua ricevuta (§1): stessa operationId con un corpo diverso (es. altre scelte) → 409
 * OPERATION_REUSED; con lo stesso corpo, il riepilogo registrato se completa, altrimenti si ritentano le righe fallite.
 * Dentro la transazione della riga si RIFANNO abbinamento e controllo dei campi vuoti sui dati di quel momento:
 * - esito diverso dall'anteprima (es. qualcuno ha creato la pratica nel frattempo) → la riga fallisce, "rifai l'anteprima";
 * - un campo compilato nel frattempo non si sovrascrive: si salta (mai sovrascrivere, D-49).
 * Creazione, rilavorazione e salvataggio dei campi sono gli stessi del comando e del PATCH (formule, stato, alert,
 * riepilogo), con storico e timeline in `source: "IMPORT"` e un evento IMPORT (D-47).
 */
import { ObjectId, type MongoClient } from "mongodb";
import type { FieldValue, ImportCommitRequest, ImportResultDTO, SelectValue, UserDTO } from "@/lib/contract";
import { isEmpty } from "@/lib/engines/conditions";
import { HttpError } from "@/lib/http-error";
import { store } from "@/lib/store/db";
import { OpLog } from "@/lib/store/oplog";
import { IDENTITY_FLOWS } from "@/lib/store/practice-factory";
import { requestHash, reused, runOperation, type OperationContext } from "@/lib/store/transaction";
import type { ImportPreviewDoc, ImportPreviewRowDoc } from "@/lib/store/types";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";
import { matchKey } from "@/services/import-v2/plan";
import { assertAdmin, type ImportDeps } from "@/services/import-v2/preview";
import { createPracticeInTx, reworkPracticeInTx } from "@/services/practices-v2/commands";
import { applyFieldChanges } from "@/services/practices-v2/fields";

export interface CommitDeps extends ImportDeps {
  client: MongoClient;
}

type Choice = NonNullable<ImportCommitRequest["choices"]>[number];
type RowKind = "created" | "updated" | "reworks" | "skipped";
interface RowReceipt {
  kind: RowKind;
  practiceId: string | null;
}

const changed = () => new HttpError("La situazione è cambiata dall'anteprima: rifai l'anteprima", 409);

export async function commitImport(deps: CommitDeps, user: UserDTO, importId: string, req: ImportCommitRequest): Promise<ImportResultDTO> {
  assertAdmin(user);
  const notFound = () => new HttpError("Anteprima non trovata o scaduta: ricarica il file", 404);
  if (!/^[0-9a-f]{24}$/i.test(importId)) throw notFound();
  const now = deps.clock?.() ?? new Date();
  const preview = await store.importPreviews(deps.db).findOne({ _id: new ObjectId(importId) });
  // Di un altro ADMIN: come inesistente (D-138: conferma solo dallo stesso ADMIN dell'anteprima).
  if (!preview || !preview.actorId.equals(new ObjectId(user.id)) || preview.expiresAt.getTime() <= now.getTime()) throw notFound();

  const byRow = new Map(preview.rows.map((r) => [r.rowIndex, r]));
  const choices = new Map<number, Choice>();
  for (const c of req.choices ?? []) {
    const row = byRow.get(c.rowIndex);
    if (!row) throw new HttpError(`Riga ${c.rowIndex} non presente nell'anteprima`, 422);
    if (choices.has(c.rowIndex)) throw new HttpError(`Riga ${c.rowIndex}: scelta ripetuta`, 422);
    if (c.action === "APPLY") {
      if (row.outcome !== "AMBIGUOUS") throw new HttpError(`Riga ${c.rowIndex}: APPLY solo per le righe ambigue`, 422);
      if (!c.practiceId || !row.candidateIds.some((id) => id.toHexString() === c.practiceId)) {
        throw new HttpError(`Riga ${c.rowIndex}: scegli una delle pratiche proposte`, 422);
      }
    }
    choices.set(c.rowIndex, c);
  }
  const missing = preview.rows.filter((r) => r.outcome === "AMBIGUOUS" && !choices.has(r.rowIndex)).map((r) => r.rowIndex);
  if (missing.length) throw new HttpError(`Righe ambigue senza scelta: ${missing.join(", ")}`, 422, { rows: missing });

  // Ricevuta della conferma intera, prenotata PRIMA delle righe: il primo corpo registrato vince.
  const hash = requestHash({ import: importId, choices: [...(req.choices ?? [])].sort((a, b) => a.rowIndex - b.rowIndex) });
  const receiptKey = { actorId: user.id, operationId: req.operationId };
  await store.operations(deps.db).updateOne(
    receiptKey,
    { $setOnInsert: { _id: new ObjectId(), ...receiptKey, requestHash: hash, practiceId: null, status: "PARTIAL", result: null, createdAt: now } },
    { upsert: true }
  );
  const receipt = (await store.operations(deps.db).findOne(receiptKey))!;
  if (receipt.requestHash !== hash) throw reused();
  if (receipt.status === "DONE") return receipt.result as ImportResultDTO;

  const result: ImportResultDTO = { created: 0, updated: 0, reworks: 0, skipped: 0, failed: [] };
  let retryable = 0;
  const createdByRow = new Map<number, string>();
  for (const row of preview.rows) {
    const choice = choices.get(row.rowIndex);
    if (choice?.action === "SKIP") {
      result.skipped++;
      continue;
    }
    if (row.outcome === "ERROR") {
      result.failed.push({ rowIndex: row.rowIndex, error: row.errors[0] ?? "Riga non importabile" });
      continue;
    }
    try {
      const { result: r } = await runOperation<RowReceipt>(
        deps.client,
        deps.db,
        {
          actorId: user.id,
          operationId: `${req.operationId}:${row.rowIndex}`,
          request: { import: importId, row: row.rowIndex, choice: choice ?? null },
          now: deps.clock?.(),
        },
        (ctx) => commitRow(ctx, user, preview, row, choice, createdByRow)
      );
      if (r.practiceId && (r.kind === "created" || r.kind === "reworks")) createdByRow.set(row.rowIndex, r.practiceId);
      result[r.kind]++;
    } catch (e) {
      retryable++;
      if (!(e instanceof HttpError)) console.error(`[import ${importId}] riga ${row.rowIndex}:`, e);
      result.failed.push({ rowIndex: row.rowIndex, error: e instanceof HttpError ? e.message : "Errore interno: riga non importata" });
    }
  }
  // Completa (anche con righe in errore già all'anteprima, che non cambiano ritentando) → DONE: i tentativi ripetuti
  // ricevono questo riepilogo. Con righe fallite in transazione → PARTIAL: un nuovo tentativo le rifà.
  await store.operations(deps.db).updateOne({ ...receiptKey, requestHash: hash }, { $set: { status: retryable ? "PARTIAL" : "DONE", result } });
  return result;
}

async function commitRow(
  ctx: OperationContext,
  user: UserDTO,
  preview: ImportPreviewDoc,
  row: ImportPreviewRowDoc,
  choice: Choice | undefined,
  createdByRow: ReadonlyMap<number, string>
): Promise<RowReceipt> {
  const { db, session } = ctx;
  const template = COMPILED_TEMPLATES[preview.templateId].template;
  const key = row.key;
  if (!key) throw new HttpError("Riga senza chiave", 422);

  // Abbinamento rifatto sui dati di adesso.
  const docs = await store.practices(db)
    .find({ templateId: preview.templateId, "currentSummary.codiceSito": key.codiceSito }, { session })
    .toArray();
  const m = matchKey(
    key,
    docs.map((p) => ({ id: p._id.toHexString(), codiceG7: p.currentSummary.codiceG7, codiceSito: p.currentSummary.codiceSito, nomeSito: p.currentSummary.nomeSito, archived: p.archived, createdAt: p.createdAt }))
  );
  const valueOf = (flowId: string) => row.changes.find((c) => c.flowId === flowId)?.value;
  const actor = { id: new ObjectId(user.id), name: user.name };

  let practiceId: ObjectId;
  let kind: RowKind;
  let rest = row.changes;
  switch (row.outcome) {
    case "NEW_PRACTICE": {
      if (m.outcome !== "NEW_PRACTICE") throw changed();
      practiceId = new ObjectId();
      await createPracticeInTx(
        ctx,
        user,
        {
          templateId: preview.templateId,
          codiceG7: String(key.codiceG7),
          codiceSito: key.codiceSito,
          nomeSito: key.nomeSito,
          committente: valueOf(IDENTITY_FLOWS.committente) as SelectValue,
          clienteFinale: valueOf(IDENTITY_FLOWS.clienteFinale) as SelectValue,
        },
        { practiceId, iterationId: new ObjectId(), source: "IMPORT" }
      );
      const identity = new Set<string>(Object.values(IDENTITY_FLOWS));
      rest = row.changes.filter((c) => !identity.has(c.flowId));
      kind = "created";
      break;
    }
    case "REWORK": {
      const expected = row.originRow !== null ? createdByRow.get(row.originRow) : row.practiceId?.toHexString();
      if (!expected) throw new HttpError(`La pratica d'origine (riga ${row.originRow}) non è stata creata: riga non importata`, 409);
      if (m.outcome !== "REWORK" || m.practiceId !== expected) throw changed();
      practiceId = new ObjectId();
      await reworkPracticeInTx(ctx, user, new ObjectId(expected), { codiceG7: String(key.codiceG7) }, { practiceId, iterationId: new ObjectId(), source: "IMPORT" });
      rest = row.changes.filter((c) => c.flowId !== IDENTITY_FLOWS.codiceG7);
      kind = "reworks";
      break;
    }
    case "UPDATE": {
      if (m.outcome !== "UPDATE" || m.practiceId !== row.practiceId?.toHexString()) throw changed();
      practiceId = row.practiceId!;
      kind = "updated";
      break;
    }
    case "AMBIGUOUS": {
      const chosen = choice?.practiceId;
      const stillOk = (m.outcome === "AMBIGUOUS" && !!chosen && m.candidateIds.includes(chosen)) || (m.outcome === "UPDATE" && m.practiceId === chosen);
      if (!stillOk) throw changed();
      practiceId = new ObjectId(chosen);
      kind = "updated";
      break;
    }
    default:
      throw new HttpError("Riga non importabile", 422);
  }

  // Campi ancora vuoti ADESSO (D-49: mai sovrascrivere, anche se compilati dopo l'anteprima).
  const practice = (await store.practices(db).findOne({ _id: practiceId }, { session }))!;
  const iteration = (await store.iterations(db).findOne({ _id: practice.currentIterationId }, { session }))!;
  const todo = rest.filter((c) => isEmpty(iteration.values[c.flowId] as FieldValue | undefined));
  const filledMeanwhile = rest.length - todo.length;
  if (todo.length === 0 && kind === "updated") return { kind: "skipped", practiceId: practiceId.toHexString() };

  if (todo.length) {
    const occKey = (flowId: string) => template.occurrences.find((o) => o.kind === "MASTER" && o.flowId === flowId && !o.repeatGroup)!.occurrenceKey;
    await applyFieldChanges(
      ctx,
      user,
      practiceId,
      { iteration: practice.currentIterationN, revision: practice.revision, changes: todo.map((c) => ({ flowId: c.flowId, occurrenceKey: occKey(c.flowId), value: c.value })) },
      { source: "IMPORT" }
    );
  }

  const log = new OpLog(ctx, actor);
  log.event(
    { practiceId, iterationId: iteration._id, n: iteration.n },
    {
      kind: "IMPORT",
      source: "IMPORT",
      detail: `Import da Excel${preview.fileName ? ` (${preview.fileName})` : ""}, riga ${row.rowIndex}: ${todo.length} ${todo.length === 1 ? "campo compilato" : "campi compilati"}${
        filledMeanwhile ? `, ${filledMeanwhile} già compilati nel frattempo (non sovrascritti)` : ""
      }`,
      structuredDetail: { importId: preview._id.toHexString(), rowIndex: row.rowIndex, outcome: row.outcome, flowIds: todo.map((c) => c.flowId), filledMeanwhile },
    }
  );
  await log.flush();
  return { kind, practiceId: practiceId.toHexString() };
}
