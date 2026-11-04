/**
 * PATCH /api/practices/{id}/fields (contratto §5.2): l'orchestrazione dei motori in UNA operazione (D-90).
 *
 * Ordine fisso degli esiti (D-117, decisione della memoria):
 *   404 pratica non visibile → 409 ITERATION_CONFLICT → 403 con TUTTI i rejected → 422 validazione →
 *   409 REVISION_CONFLICT dal compare-and-swap, fatto subito prima delle scritture.
 * La rotta valida solo la struttura (D-132 P-06): i valori si validano qui, dopo visibilità, iterazione e permessi.
 * Tutte o nessuna: qualunque rifiuto annulla l'intera richiesta (transazione).
 *
 * Pipeline: modifiche dell'utente sullo snapshot "dopo" → validazioni finali (liste, cascata ISTAT sul risultato,
 * G7 intero) → CAS → righe di sistema (computeRows: voci Ente, ciclo ARPA) → formule (computeFormulas, con prima/dopo,
 * scritture manuali dei calcolati e Fatturabile manuale) → stato (deriveAutomaticState + applyState) → aggancio
 * OBBLIGATORIO degli alert (alert-hook.ts, D-132 P-10) → scritture. Storico USER come variazione NETTA rispetto al
 * valore salvato (D-132 §3.5), storico SYSTEM con motivo. La condizione di un campo non conta (D-31).
 */
import { ObjectId } from "mongodb";
import {
  noteOperativeKey,
  type FieldChange,
  type FieldChangeRequest,
  type FieldChangeResponse,
  type FieldValue,
  type GroupId,
  type SelectValue,
  type TemplateDTO,
  type ToastDTO,
  type TransversalOccurrenceKey,
  type UserDTO,
} from "@/lib/contract";
import { romeDate } from "@/lib/calendario";
import { canSeePractice, occurrenceAccess, repeatAccess, transversalAccess } from "@/lib/engines/access";
import { computeFormulas, sameValue, type EngineRow, type EngineRowMetadata, type EngineSnapshot } from "@/lib/engines/formulas";
import { computeRows } from "@/lib/engines/rows";
import { applyState, autoEventDateOf, deriveAutomaticState } from "@/lib/engines/state";
import { HttpError } from "@/lib/http-error";
import { accessPracticeOf, progressOf, toEngineRow } from "@/lib/practice/detail";
import { normalizeConstraint, normalizeFieldValue, normalizeNoteOperative, normalizeSiteText, OTHER_CODE } from "@/lib/practice/normalize";
import { notesOf } from "@/lib/practice/notes";
import { store } from "@/lib/store/db";
import { OpLog, type IterationRef } from "@/lib/store/oplog";
import { IDENTITY_FLOWS, summaryOf } from "@/lib/store/practice-factory";
import { bumpPracticeRevision, runOperation, type OperationContext } from "@/lib/store/transaction";
import type { ConstraintRowDoc, IterationDoc, RepeatRowDoc, TransversalDoc } from "@/lib/store/types";
import { reconcileAlertsOnSave } from "@/services/practices-v2/alert-hook";
import { getPracticeDetail } from "@/services/practices-v2/read";
import { notFound, parsePracticeId } from "@/services/practices-v2/repository";
import { assertIstatCascade, assertValuesInLists, type ListCheck } from "@/services/practices-v2/validation";
import { getCompiledVersion } from "@/services/templates";
import type { StoreDeps } from "@/services/users-v2";

/** Punti di guasto per le prove di rollback (D-132 §4.1). */
export type FieldsFaultPoint = "afterCas" | "afterIteration" | "afterRows" | "duringHistory" | "beforeReceipt";

export interface FieldsDeps extends StoreDeps {
  clock?: () => Date;
  /**
   * SOLO PROVE: guasto simulato in un punto della transazione. Esiste unicamente come dipendenza iniettata dalle prove;
   * la rotta usa storeDeps(), che non la imposta, e nessuna variabile d'ambiente o parametro la attiva. Predefinito:
   * nessun guasto.
   */
  faultAt?: FieldsFaultPoint;
}

interface Receipt {
  practiceId: string;
  toasts: ToastDTO[];
  createdRows: Record<string, string>;
}

/** Riga di lavoro: il documento (copiato) più lo stato della modifica. */
interface WorkRow {
  doc: RepeatRowDoc;
  isNew: boolean;
  removed: boolean;
  dirty: boolean;
}

const repeatKey = (key: string) => `repeat:${key}`;

/** Copia di lavoro di una riga (senza structuredClone, che perderebbe il prototipo degli ObjectId). */
const copyRow = (r: RepeatRowDoc): RepeatRowDoc => ({
  ...r,
  values: { ...r.values },
  metadata: { ...r.metadata },
  ...(r.constraint ? { constraint: { ...r.constraint } } : {}),
});

/* ---------- conversione dei metadati di riga motore → documento ---------- */

export function applyEngineMetadata(doc: RepeatRowDoc, patch: Partial<EngineRowMetadata>): void {
  const m = { ...doc.metadata } as RepeatRowDoc["metadata"] & Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete m[k];
    else if (k === "origin") {
      const o = v as NonNullable<EngineRowMetadata["origin"]>;
      m.origin = { groupKey: o.groupKey, rowId: new ObjectId(o.rowId) };
    } else m[k] = v;
  }
  doc.metadata = m;
}

/* ---------- comando ---------- */

export async function patchFields(deps: FieldsDeps, user: UserDTO, id: string, req: FieldChangeRequest): Promise<FieldChangeResponse> {
  const practiceId = parsePracticeId(id);
  const { operationId: _op, ...request } = req;
  const { result } = await runOperation<Receipt>(
    deps.client,
    deps.db,
    { actorId: user.id, operationId: req.operationId, request: { fields: id, ...request }, practiceId, now: deps.clock?.() },
    (ctx) => applyFieldChanges(ctx, user, practiceId, req, { faultAt: deps.faultAt })
  );
  const practice = await getPracticeDetail(deps.db, user, id);
  return { practice, toasts: result.toasts, ...(Object.keys(result.createdRows).length ? { createdRows: result.createdRows } : {}) };
}

export interface ApplyFieldOptions {
  /** Solo prove (iniezione di guasti). */
  faultAt?: FieldsFaultPoint;
  /** Origine delle voci di storico scritte dall'utente: IMPORT per l'import Excel (D-135). */
  source?: "USER" | "IMPORT";
}

/**
 * Salvataggio dei campi DENTRO una transazione già aperta (PATCH e import, D-135): permessi, convalide, righe di
 * sistema, formule, stato, scritture, alert, riepilogo, storico ed eventi. La ricevuta la scrive chi apre la
 * transazione (runOperation).
 */
export async function applyFieldChanges(
  ctx: OperationContext,
  user: UserDTO,
  practiceId: ObjectId,
  req: Pick<FieldChangeRequest, "iteration" | "revision" | "changes">,
  opts: ApplyFieldOptions = {}
): Promise<Receipt> {
  const { faultAt } = opts;
  const userSource = opts.source ?? "USER";
  const { db, session } = ctx;
  const fault = (point: FieldsFaultPoint) => {
    if (faultAt === point) throw new Error(`Guasto simulato: ${point}`);
  };

  /* 404 */
  const practice = await store.practices(db).findOne({ _id: practiceId }, { session });
  if (!practice || !canSeePractice(user, practice)) throw notFound();

  /* 409 ITERATION_CONFLICT */
  if (req.iteration !== practice.currentIterationN) {
    throw new HttpError("La pratica ha un'iterazione più recente: ricarica", 409, { code: "ITERATION_CONFLICT" });
  }
  const iteration = await store.iterations(db).findOne({ _id: practice.currentIterationId }, { session });
  if (!iteration) throw new Error(`Iterazione corrente mancante per la pratica ${practiceId.toHexString()}`);
  const savedRows = await store.repeatRows(db).find({ iterationId: iteration._id }, { session }).toArray();
  const savedById = new Map(savedRows.map((r) => [r._id.toHexString(), r]));
  const iterationCount = await store.iterations(db).countDocuments({ practiceId }, { session });
  const compiled = await getCompiledVersion(practice.templateId, iteration.templateVersion, async () => db);
  const template = compiled.template;
  const ap = accessPracticeOf(practice, iterationCount);
  const view = { isCurrentIteration: true };
  const rowsAccess = repeatAccess(user, ap, template, view);

  /* stato di lavoro */
  const values: Record<string, FieldValue> = { ...iteration.values };
  const savedNotes = notesOf(iteration.transversal);
  const transversal: TransversalDoc = { ...iteration.transversal, noteOperative: { ...savedNotes } };
  const rows = new Map<string, WorkRow>(savedRows.map((r) => [r._id.toHexString(), { doc: copyRow(r), isNew: false, removed: false, dirty: false }]));
  const occByKey = new Map(template.occurrences.map((o) => [o.occurrenceKey, o]));
  const masterOf = (flowId: string) => template.occurrences.find((o) => o.kind === "MASTER" && o.flowId === flowId);
  const vincoliOcc = template.occurrences.find((o) => o.kind === "MASTER" && o.repeatGroup === "VINCOLI");

  // Ordinal mai riusati (D-132 P-03): massimo assegnato per gruppo, che sopravvive alle rimozioni fisiche.
  const rowSeq: Record<string, number> = { ...(iteration.rowSeq ?? {}) };
  const nextOrdinal = (group: string) => {
    const seen = Math.max(0, ...[...rows.values()].filter((r) => r.doc.groupKey === group).map((r) => r.doc.ordinal));
    rowSeq[group] = Math.max(rowSeq[group] ?? 0, seen) + 1;
    return rowSeq[group];
  };

  const rejected: string[] = [];
  const reject = (key: string) => {
    if (!rejected.includes(key)) rejected.push(key);
  };

  /* Passo 1 — permessi (403, tutti insieme) prima di qualunque validazione: chi non può scrivere non scopre i dettagli. */
  for (const c of req.changes) {
    if ("transversal" in c) {
      const key: TransversalOccurrenceKey =
        c.transversal === "noteOperative" ? noteOperativeKey(c.group) : c.transversal === "fatturabile" ? "TRASV.FATTURABILE" : "TRASV.FATTURATO";
      if (!transversalAccess(user, ap, key, view).editable) reject(key);
    } else if ("constraint" in c) {
      // D-132 P-07: la chiave contrattuale dei vincoli è "repeat:VINCOLI" (il permesso resta quello del contenitore).
      if (!vincoliOcc || !occurrenceAccess(user, ap, vincoliOcc, view).editable) reject(repeatKey("VINCOLI"));
    } else if ("op" in c) {
      const ok = c.op === "ADD_ROW" ? rowsAccess[c.repeat]?.canAddRows : rowsAccess[c.repeat]?.canRemoveRows;
      if (!ok) reject(repeatKey(c.repeat));
      if (c.op === "ADD_ROW") {
        for (const flowId of Object.keys(c.values ?? {})) {
          const occ = masterOf(flowId);
          if (occ && !occurrenceAccess(user, ap, occ, view).editable) reject(occ.occurrenceKey);
        }
      }
    } else {
      const occ = occByKey.get(c.occurrenceKey);
      // Occorrenza sconosciuta: si valida al passo 2 (422) solo se non ci sono rifiuti di permesso.
      if (occ && !occurrenceAccess(user, ap, occ, view).editable) reject(c.occurrenceKey);
    }
  }
  if (rejected.length) throw new HttpError("Alcune modifiche non sono consentite", 403, { rejected });

  /* Passo 2 — validazione dei valori (422) e applicazione allo snapshot "dopo". */
  const invalid = (msg: string) => new HttpError(msg, 422);
  const listChecks: ListCheck[] = [];
  const manualWrites = new Set<string>();
  let fatturabileWritten = false;
  const createdRows = new Map<string, string>(); // D-132 P-11: niente proprietà ereditate
  const touchedFlows = new Set<string>();
  /** Bersagli toccati, nell'ordine della prima modifica: lo storico USER è la variazione netta (D-132 §3.5). */
  const touched: string[] = [];
  const touch = (key: string) => {
    if (!touched.includes(key)) touched.push(key);
  };
  const assertG7 = (flowId: string, v: FieldValue) => {
    if (flowId === IDENTITY_FLOWS.codiceG7 && v !== null && (typeof v !== "number" || !Number.isInteger(v) || v < 0)) {
      throw invalid("Codice G7: serve un numero intero non negativo");
    }
  };

  // Righe citate che non sono dell'iterazione corrente: quelle della stessa pratica in un'altra iterazione hanno un
  // codice proprio; le altre (inesistenti, già tolte, di altre pratiche) sono ROW_NOT_FOUND senza altri dettagli.
  const cited = [...new Set(req.changes.flatMap((c) => ("rowId" in c && typeof c.rowId === "string" ? [c.rowId] : [])))].filter((id) => !rows.has(id) && ObjectId.isValid(id));
  const otherIteration = new Set(
    cited.length
      ? (await store.repeatRows(db).find({ _id: { $in: cited.map((id) => new ObjectId(id)) }, practiceId, iterationId: { $ne: iteration._id } }, { session, projection: { _id: 1 } }).toArray()).map((r) => r._id.toHexString())
      : []
  );
  /**
   * 422 di una riga con un codice per l'interfaccia (contratto v0.5.3 §5). Il testo comincia sempre con "Riga non
   * trovata" (riconosciuto dalle interfacce che non leggono ancora il codice).
   */
  const rowError = (rowId: string, group: string) => {
    const w = rows.get(rowId);
    if (w?.removed) return new HttpError("Riga non trovata: è già tolta in questa stessa modifica", 422, { code: "ROW_REMOVED", rowId });
    if (w) return new HttpError(`Riga non trovata nel gruppo ${group}`, 422, { code: "ROW_GROUP_MISMATCH", rowId });
    if (otherIteration.has(rowId)) return new HttpError("Riga non trovata nell'iterazione corrente: è di un'altra iterazione", 422, { code: "ROW_OTHER_ITERATION", rowId });
    return new HttpError("Riga non trovata", 422, { code: "ROW_NOT_FOUND", rowId });
  };

  for (const c of req.changes) applyOne(c);

  function applyOne(c: FieldChange): void {
    if ("transversal" in c) {
      const raw: unknown = c.value;
      if (c.transversal === "noteOperative") {
        if (typeof raw !== "string") throw invalid("Note Operative: serve un testo");
        transversal.noteOperative = { ...transversal.noteOperative, [c.group]: normalizeNoteOperative(raw) };
        touch(`note|${c.group}`);
      } else if (c.transversal === "fatturabile") {
        if (raw !== "SI" && raw !== "NO") throw invalid("Fatturabile: SI o NO");
        fatturabileWritten = true; // decisione manuale anche con lo stesso valore (D-37, D-96)
        transversal.fatturabile = raw;
        touch("trasv|fatturabile");
      } else {
        if (raw !== "SI" && raw !== "NO" && raw !== null) throw invalid("Fatturato: SI, NO o vuoto");
        transversal.fatturato = raw;
        touch("trasv|fatturato");
      }
      return;
    }

    if ("constraint" in c) {
      const w = rows.get(c.rowId);
      if (!w || w.removed || w.doc.groupKey !== "VINCOLI" || !w.doc.constraint) throw rowError(c.rowId, "VINCOLI");
      const def = template.constraints.find((d) => d.code === w.doc.constraint!.code);
      if (!def) throw invalid(`Vincolo ${w.doc.constraint.code} non previsto dal template`);
      const n = normalizeConstraint(def.label, c.constraint, { stateList: def.stateList, enteList: def.enteList });
      const cons = { ...w.doc.constraint };
      if (n.stato !== undefined) {
        if (n.stato) listChecks.push({ occ: { label: `${def.label} (stato)`, dataType: "SELECT", list: def.stateList }, value: n.stato, previous: savedById.get(c.rowId)?.constraint?.stato ?? null });
        cons.stato = n.stato;
        touch(`cons|${c.rowId}|stato`);
      }
      if (n.ente !== undefined) {
        // D-132 P-04: con ente unico l'ente non si cambia né si azzera.
        if (!def.enteList && (n.ente === null || n.ente.code !== def.defaultEnte)) throw invalid(`${def.label}: l'ente è unico (${def.defaultEnteLabel ?? def.defaultEnte}) e non si cambia`);
        if (def.enteList && n.ente) listChecks.push({ occ: { label: `${def.label} (ente)`, dataType: "SELECT", list: def.enteList }, value: n.ente, previous: savedById.get(c.rowId)?.constraint?.ente ?? null });
        cons.ente = n.ente;
        touch(`cons|${c.rowId}|ente`);
      }
      w.doc.constraint = cons;
      w.dirty = true;
      return;
    }

    if ("op" in c) {
      const group = template.repeatGroups.find((g) => g.key === c.repeat);
      if (!group || group.rowPolicy === "FIXED") throw invalid(`Il gruppo ${c.repeat} non ha righe aggiungibili o rimovibili`);
      if (c.op === "REMOVE_ROW") {
        const w = rows.get(c.rowId);
        if (!w || w.removed || w.doc.groupKey !== c.repeat) throw rowError(c.rowId, c.repeat);
        if (w.doc.metadata?.locked) throw new HttpError("Questa riga è collegata a un vincolo Presente e non si può togliere", 422, { code: "ROW_LOCKED", rowId: c.rowId });
        w.removed = true;
        touch(`remove|${c.rowId}`);
        return;
      }
      if (createdRows.has(c.clientRowKey)) throw invalid(`clientRowKey ripetuta: ${c.clientRowKey}`);
      const rowValues: Record<string, FieldValue> = {};
      for (const [flowId, raw] of Object.entries(c.values ?? {})) {
        const occ = masterOf(flowId);
        if (!occ || !group.flowIds.includes(flowId)) throw invalid(`${flowId} non appartiene al gruppo ${c.repeat}`);
        const v = normalizeFieldValue(occ, raw as FieldValue);
        if (v === null) continue;
        listChecks.push({ occ, value: v });
        if (occ.computed?.manualOverride) manualWrites.add(flowId);
        rowValues[flowId] = v;
      }
      const _id = new ObjectId();
      const doc: RepeatRowDoc = {
        _id,
        practiceId,
        iterationId: iteration!._id,
        groupKey: c.repeat,
        ordinal: nextOrdinal(c.repeat),
        values: rowValues,
        metadata: {},
        createdAt: ctx.now,
        updatedAt: ctx.now,
      };
      rows.set(_id.toHexString(), { doc, isNew: true, removed: false, dirty: true });
      createdRows.set(c.clientRowKey, _id.toHexString());
      touch(`add|${_id.toHexString()}`);
      return;
    }

    // Campo semplice o di riga.
    const occ = occByKey.get(c.occurrenceKey);
    if (!occ || occ.flowId !== c.flowId) throw invalid(`Occorrenza ${c.occurrenceKey} non valida per ${c.flowId}`);
    if ("repeat" in c) {
      if (occ.repeatGroup !== c.repeat || c.repeat === "VINCOLI") throw invalid(`${occ.label}: non è un campo del gruppo ${c.repeat}`);
      const w = rows.get(c.rowId);
      if (!w || w.removed || w.doc.groupKey !== c.repeat) throw rowError(c.rowId, c.repeat);
      const v = normalizeFieldValue(occ, c.value);
      listChecks.push({ occ, value: v, previous: savedById.get(c.rowId)?.values[c.flowId] ?? null });
      if (occ.computed?.manualOverride) manualWrites.add(c.flowId);
      w.doc.values = { ...w.doc.values, [c.flowId]: v };
      w.dirty = true;
      if (!w.isNew) touch(`row|${c.rowId}|${c.flowId}`);
      return;
    }
    if (occ.repeatGroup) throw invalid(`${occ.label}: campo di un gruppo ripetibile, serve la riga`);
    const v = normalizeSiteText(c.flowId, normalizeFieldValue(occ, c.value));
    assertG7(c.flowId, v);
    listChecks.push({ occ, value: v, previous: iteration!.values[c.flowId] ?? null });
    if (occ.computed?.manualOverride) manualWrites.add(c.flowId);
    values[c.flowId] = v;
    touchedFlows.add(c.flowId);
    touch(`val|${c.flowId}`);
  }

  await assertValuesInLists(ctx, practice.templateId, listChecks);
  assertIstatCascade(template.occurrences, values, touchedFlows);

  /* 409 REVISION_CONFLICT: compare-and-swap subito prima degli effetti. */
  const revision = await bumpPracticeRevision(ctx, practiceId, req.revision);
  fault("afterCas");

  const log = new OpLog(ctx, { id: new ObjectId(user.id), name: user.name });
  const ref: IterationRef = { practiceId, iterationId: iteration._id, n: iteration.n, templateVersion: iteration.templateVersion };
  const vincoliFlow = vincoliOcc?.flowId ?? undefined;

  /* Storico USER: variazione netta rispetto al salvato, nell'ordine della prima modifica (D-132 §3.5, P-09). */
  for (const key of touched) {
    const [kind, a, b] = key.split("|");
    if (kind === "val") {
      const before = iteration.values[a] ?? null;
      if (!sameValue(before, values[a])) log.field(ref, revision, { kind: "FIELD", target: { flowId: a }, oldValue: before, newValue: values[a], source: userSource });
    } else if (kind === "row") {
      const w = rows.get(a)!;
      if (w.removed) continue; // tolta: vale il ROW_REMOVE con la fotografia salvata
      const before = savedById.get(a)?.values[b] ?? null;
      const after = w.doc.values[b] ?? null;
      if (!sameValue(before, after)) log.field(ref, revision, { kind: "FIELD", target: { flowId: b, groupKey: w.doc.groupKey, rowId: w.doc._id }, oldValue: before, newValue: after, source: userSource });
    } else if (kind === "cons") {
      const w = rows.get(a)!;
      const field = b as keyof Pick<ConstraintRowDoc, "stato" | "ente">;
      const before = savedById.get(a)?.constraint?.[field] ?? null;
      const after = w.doc.constraint?.[field] ?? null;
      const label = template.constraints.find((d) => d.code === w.doc.constraint?.code)?.label ?? "";
      if (!sameValue(before, after)) log.field(ref, revision, { kind: "FIELD", target: { flowId: vincoliFlow, groupKey: "VINCOLI", rowId: w.doc._id }, oldValue: before, newValue: after, detail: `Vincolo ${label}: ${field}`, source: userSource });
    } else if (kind === "remove") {
      const saved = savedById.get(a)!;
      log.field(ref, revision, { kind: "ROW_REMOVE", target: { groupKey: saved.groupKey, rowId: saved._id }, oldValue: null, newValue: null, rowSnapshot: saved.values, source: userSource });
    } else if (kind === "add") {
      const w = rows.get(a)!;
      log.field(ref, revision, { kind: "ROW_ADD", target: { groupKey: w.doc.groupKey, rowId: w.doc._id }, oldValue: null, newValue: null, rowSnapshot: w.doc.values, source: userSource });
      // P-09: anche una FIELD per ogni valore iniziale non vuoto (valori finali della riga in questo salvataggio).
      for (const [flowId, v] of Object.entries(w.doc.values)) {
        if (v !== null && v !== undefined) log.field(ref, revision, { kind: "FIELD", target: { flowId, groupKey: w.doc.groupKey, rowId: w.doc._id }, oldValue: null, newValue: v, source: userSource });
      }
    } else if (kind === "note") {
      const g = a as GroupId;
      if (savedNotes[g] !== transversal.noteOperative[g]) log.field(ref, revision, { kind: "FIELD", target: { transversal: "noteOperative", noteGroup: g }, oldValue: savedNotes[g], newValue: transversal.noteOperative[g], source: userSource });
    } else if (kind === "trasv") {
      const f = a as "fatturabile" | "fatturato";
      const before = iteration.transversal[f];
      if (before !== transversal[f]) log.field(ref, revision, { kind: "FIELD", target: { transversal: f }, oldValue: before, newValue: transversal[f], source: userSource });
    }
  }

  /* Passo 3 — righe di sistema (voci Ente, ciclo ARPA), poi formule sullo stato che le comprende. */
  const live = () => [...rows.values()].filter((r) => !r.removed);
  const snapshotAfter = (): EngineSnapshot => {
    const repeats: Record<string, EngineRow[]> = {};
    for (const r of live().sort((a, b) => a.doc.ordinal - b.doc.ordinal)) (repeats[r.doc.groupKey] ??= []).push(toEngineRow(r.doc));
    return { values, repeats, formulaMeta: iteration.formulaMeta, transversal };
  };
  const before: EngineSnapshot = (() => {
    const repeats: Record<string, EngineRow[]> = {};
    for (const r of [...savedRows].sort((a, b) => a.ordinal - b.ordinal)) (repeats[r.groupKey] ??= []).push(toEngineRow(r));
    return { values: iteration.values, repeats, formulaMeta: iteration.formulaMeta, transversal: { ...iteration.transversal, noteOperative: savedNotes } };
  })();

  const enteLabels = await enteLabeler(ctx, practice.templateId, template);
  const rowsResult = computeRows({ templateId: practice.templateId, template, before, after: snapshotAfter(), enteLabel: enteLabels, newRowId: () => new ObjectId().toHexString() });
  for (const a of rowsResult.add) {
    const doc: RepeatRowDoc = {
      _id: new ObjectId(a.rowId),
      practiceId,
      iterationId: iteration._id,
      groupKey: a.groupKey,
      ordinal: nextOrdinal(a.groupKey),
      values: a.values,
      metadata: {},
      createdAt: ctx.now,
      updatedAt: ctx.now,
    };
    applyEngineMetadata(doc, a.metadata);
    rows.set(a.rowId, { doc, isNew: true, removed: false, dirty: true });
    log.field(ref, revision, { kind: "ROW_ADD", target: { groupKey: a.groupKey, rowId: doc._id }, oldValue: null, newValue: null, rowSnapshot: a.values, detail: a.reason, source: "SYSTEM" });
  }
  for (const r of rowsResult.remove) {
    const w = rows.get(r.rowId);
    if (!w || w.removed) continue;
    w.removed = true;
    log.field(ref, revision, { kind: "ROW_REMOVE", target: { groupKey: r.groupKey, rowId: w.doc._id }, oldValue: null, newValue: null, rowSnapshot: w.doc.values, detail: r.reason, source: "SYSTEM" });
  }
  for (const u of rowsResult.update) {
    const w = rows.get(u.rowId);
    if (!w || w.removed) continue;
    applyEngineMetadata(w.doc, u.metadata);
    for (const [flowId, v] of Object.entries(u.values ?? {})) {
      const prev = w.doc.values[flowId] ?? null;
      w.doc.values = { ...w.doc.values, [flowId]: v };
      if (!sameValue(prev, v)) log.field(ref, revision, { kind: "FIELD", target: { flowId, groupKey: u.groupKey, rowId: w.doc._id }, oldValue: prev, newValue: v, detail: u.reason, source: "SYSTEM" });
    }
    w.dirty = true;
  }

  const formulas = computeFormulas({
    templateId: practice.templateId,
    template,
    bindings: compiled.bindings,
    before,
    after: snapshotAfter(),
    today: romeDate(ctx.now),
    now: ctx.now,
    operationId: ctx.operationId,
    actorId: new ObjectId(user.id),
    manualWrites,
    fatturabileWritten,
  });
  Object.assign(values, formulas.values);
  const formulaMeta = { ...iteration.formulaMeta, ...formulas.formulaMeta };
  Object.assign(transversal, formulas.transversal);
  for (const [rowId, patch] of Object.entries(formulas.rowMetadata)) {
    const w = rows.get(rowId);
    if (!w || w.removed) continue;
    applyEngineMetadata(w.doc, patch);
    w.dirty = true;
  }
  for (const c of formulas.systemChanges) {
    log.field(ref, revision, { kind: "FIELD", target: c.target, oldValue: c.oldValue, newValue: c.newValue, detail: c.reason, source: "SYSTEM" });
  }

  /* Passo 4 — stato attività (D-115, D-119, D-126, D-127). */
  const change = applyState(iteration.stateMeta, deriveAutomaticState({ templateId: practice.templateId, values, repeats: snapshotAfter().repeats }));
  if (change.changed) {
    log.event(ref, {
      kind: "STATO",
      source: "SYSTEM",
      detail: `Stato attività: ${change.from} → ${change.to}${change.manualReleased ? " (nuovo evento automatico: termina lo stato manuale, D-119)" : ""}`,
      structuredDetail: { from: change.from, to: change.to, manualReleased: change.manualReleased, ...autoEventDateOf(change.next) },
    });
  } else if (change.manualReleased) {
    // D-132 §3.6: lo stato resta lo stesso ma torna automatico.
    log.event(ref, {
      kind: "STATO",
      source: "SYSTEM",
      detail: `Stato attività ${change.to}: torna automatico (nuovo evento automatico, D-119)`,
      structuredDetail: { from: change.from, to: change.to, manualReleased: true, sourceOnly: true },
    });
  }

  /* Passo 5 — scritture, con l'aggancio obbligatorio degli alert prima del riepilogo. */
  const nextIteration: IterationDoc = { ...iteration, values, transversal, formulaMeta, stateMeta: change.next, rowSeq };
  await store.iterations(db).updateOne({ _id: iteration._id }, { $set: { values, transversal, formulaMeta, stateMeta: change.next, rowSeq } }, { session });
  fault("afterIteration");
  const all = [...rows.values()];
  const removedIds = all.filter((r) => r.removed && !r.isNew).map((r) => r.doc._id);
  if (removedIds.length) await store.repeatRows(db).deleteMany({ _id: { $in: removedIds } }, { session });
  const inserts = all.filter((r) => r.isNew && !r.removed).map((r) => r.doc);
  if (inserts.length) await store.repeatRows(db).insertMany(inserts, { session });
  for (const r of all.filter((x) => x.dirty && !x.isNew && !x.removed)) {
    await store.repeatRows(db).updateOne(
      { _id: r.doc._id },
      { $set: { values: r.doc.values, metadata: r.doc.metadata, ...(r.doc.constraint ? { constraint: r.doc.constraint } : {}), updatedAt: ctx.now } },
      { session }
    );
  }
  fault("afterRows");
  const liveDocs = all.filter((r) => !r.removed).map((r) => r.doc);
  const alerts = await reconcileAlertsOnSave({ ctx, practice, iteration: nextIteration, rows: liveDocs, template, actor: user, fatturabileWritten, log });
  await store.practices(db).updateOne(
    { _id: practiceId },
    { $set: { currentSummary: summaryOf(nextIteration, alerts.openAlerts, progressOf(template, nextIteration, liveDocs)) } },
    { session }
  );
  await log.flushHistory();
  fault("duringHistory");
  await log.flushEvents();
  fault("beforeReceipt");
  return { practiceId: practiceId.toHexString(), toasts: formulas.toasts, createdRows: Object.fromEntries(createdRows) };
}

/** Etichetta di un ente per il Nome Ente delle voci generate (D-103): liste degli enti, ente predefinito, "Altro". */
async function enteLabeler(ctx: OperationContext, templateId: TemplateDTO["id"], template: TemplateDTO): Promise<(e: SelectValue | null) => string | null> {
  const listIds = [...new Set(template.constraints.map((c) => c.enteList?.listId).filter((x): x is string => !!x))];
  const lists = await store.lists(ctx.db)
    .find({ listId: { $in: listIds }, templateId: { $in: [templateId, null] } }, { session: ctx.session, projection: { items: 1 } })
    .toArray();
  const labels = new Map<string, string>();
  for (const l of lists) for (const i of l.items) labels.set(i.code, i.label);
  for (const c of template.constraints) if (c.defaultEnte && c.defaultEnteLabel) labels.set(c.defaultEnte, c.defaultEnteLabel);
  return (e) => {
    if (!e) return null;
    if (e.code === OTHER_CODE && e.otherText) return e.otherText;
    return labels.get(e.code) ?? e.code;
  };
}
