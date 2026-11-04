/**
 * Comandi della pratica del modello nuovo (B5b, contratto §5.3) sul database _v2. Ogni comando è UNA
 * operazione (runOperation, D-90): revisione controllata, storico ed eventi, notifiche e intenzioni di mail
 * nella stessa transazione. La ricevuta memorizza solo l'id della pratica; la scheda restituita si rilegge
 * dopo il commit (anche nei tentativi ripetuti: risponde con lo stato attuale).
 *
 * Le rotte in collisione con la beta (POST /api/practices, DELETE /api/practices/{id}) entrano al cutover
 * (D-68); le altre sono già pubblicate sotto /api/practices/{id}/….
 */
import { ObjectId } from "mongodb";
import {
  type AssignRequest,
  type ChangeStatoRequest,
  type CreatePracticeRequest,
  type FieldOccurrenceDTO,
  type FieldValue,
  type GroupId,
  type PraticaDetailDTO,
  type ReworkRequest,
  type ResubmitRequest,
  type RevisionRequest,
  type SelectValue,
  type TemplateDTO,
  type TemplateId,
  type UserDTO,
} from "@/lib/contract";
import { romeDate } from "@/lib/calendario";
import { appBaseUrl, assignEmail } from "@/lib/email";
import {
  ACCESS_POLICY,
  actionAllowed,
  assignNotifiedGroups,
  canCreateIn,
  canSeePractice,
  hasRole,
  practiceActions,
  type AccessPractice,
  type ActionName,
} from "@/lib/engines/access";
import { isEmpty } from "@/lib/engines/conditions";
import { computeFormulas, type EngineSnapshot } from "@/lib/engines/formulas";
import { resolveTemplate } from "@/lib/engines/resolve-template";
import { applyState, autoEventDateOf, deriveAutomaticState, newStateMeta } from "@/lib/engines/state";
import { HttpError } from "@/lib/http-error";
import { accessPracticeOf, engineSnapshot, progressOf } from "@/lib/practice/detail";
import { inherit, inheritancePlan, type InheritanceMode } from "@/lib/practice/inheritance";
import { groupsLabel } from "@/lib/practice/labels";
import { normalizeFieldValue, normalizeSiteKey } from "@/lib/practice/normalize";
import { notesOf } from "@/lib/practice/notes";
import { store } from "@/lib/store/db";
import { OpLog, type IterationRef } from "@/lib/store/oplog";
import { enqueueDeliveries } from "@/lib/store/outbox";
import { buildIteration, buildNewPractice, constraintRows, IDENTITY_FLOWS, rowSeqOf, summaryOf } from "@/lib/store/practice-factory";
import { bumpPracticeRevision, runOperation, touchWriteGuard, type OperationContext } from "@/lib/store/transaction";
import type { IterationDoc, NotificationDoc, PracticeDoc, RepeatRowDoc } from "@/lib/store/types";
import type { TemplateBindings } from "@/lib/templates/compiler";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";
import { countOpenAlerts, resumeAlerts, supersedeAlerts, suspendAlerts } from "@/services/alerts";
import { reconcilePracticeAlerts } from "@/services/alerts-engine";
import { getPracticeDetail } from "@/services/practices-v2/read";
import { notFound, parsePracticeId } from "@/services/practices-v2/repository";
import { assertValuesInLists } from "@/services/practices-v2/validation";
import { getCompiledVersion } from "@/services/templates";
import { assertTemplateHasPmLeader, type StoreDeps } from "@/services/users-v2";

export interface PracticeDeps extends StoreDeps {
  /** Prove: orologio iniettato (istante dell'operazione). */
  clock?: () => Date;
}

/** Ricevuta piccola e serializzabile (D-90): la scheda si rilegge dopo il commit. */
interface Receipt {
  practiceId: string;
}

const actorOf = (u: UserDTO) => ({ id: new ObjectId(u.id), name: u.name });
const withoutOp = <T extends { operationId?: string }>(req: T) => {
  const { operationId: _op, ...rest } = req;
  return rest;
};

/* ---------- permessi con il motivo giusto ---------- */

const STATE_MESSAGES: Record<ActionName, string> = {
  create: "Creazione non consentita",
  assign: "Una pratica archiviata non si assegna",
  changeStato: "Lo Stato attività di una pratica archiviata non si cambia",
  archive: "Si archiviano solo pratiche non archiviate in stato TERMINATO o KO",
  restore: "Si ripristinano solo pratiche archiviate",
  delete: "Si cancella solo una pratica non archiviata, in stato CREATA e con una sola iterazione",
  rework: "Rilavorazione non consentita",
  resubmit: "Una pratica archiviata non si ripresenta",
};

/** 403 se l'utente non ha il ruolo per l'azione; 422 se il ruolo c'è ma lo stato della pratica non la ammette. */
export function assertAction(user: UserDTO, ap: AccessPractice, action: ActionName): void {
  if (actionAllowed(user, ap, action)) return;
  const r = ACCESS_POLICY.actions[action];
  const byRole = (r.admin && user.isAdmin && user.status === "active") || hasRole(user, ap.templateId, r.roles, !!r.leader);
  if (byRole) throw new HttpError(STATE_MESSAGES[action], 422);
  throw new HttpError("Non hai i permessi per questa azione", 403);
}

/* ---------- caricamento nella transazione ---------- */

interface Loaded {
  practice: PracticeDoc;
  iteration: IterationDoc;
  rows: RepeatRowDoc[];
  iterationCount: number;
  ap: AccessPractice;
}

async function loadForCommand(ctx: OperationContext, user: UserDTO, id: ObjectId): Promise<Loaded> {
  const { db, session } = ctx;
  const practice = await store.practices(db).findOne({ _id: id }, { session });
  if (!practice) throw notFound();
  if (!canSeePractice(user, practice)) throw notFound();
  const iteration = await store.iterations(db).findOne({ _id: practice.currentIterationId }, { session });
  if (!iteration) throw new Error(`Iterazione corrente mancante per la pratica ${id.toHexString()}`);
  const rows = await store.repeatRows(db).find({ iterationId: iteration._id }, { session }).toArray();
  const iterationCount = await store.iterations(db).countDocuments({ practiceId: id }, { session });
  return { practice, iteration, rows, iterationCount, ap: accessPracticeOf(practice, iterationCount) };
}

const iterRef = (practiceId: ObjectId, it: IterationDoc): IterationRef => ({
  practiceId,
  iterationId: it._id,
  n: it.n,
  templateVersion: it.templateVersion,
});

/** Ricalcola la proiezione per l'elenco dall'iterazione corrente. */
const summaryFor = (template: TemplateDTO, practice: PracticeDoc, iteration: IterationDoc, rows: RepeatRowDoc[], openAlerts = practice.currentSummary.openAlerts) =>
  summaryOf(iteration, openAlerts, progressOf(template, iteration, rows));

/* ---------- formule su un'iterazione nuova ---------- */

/**
 * Esegue le formule (B5a) su un'iterazione appena costruita: prima = dopo, quindi nessun effetto "alla prima
 * compilazione" e nessuna scrittura manuale. Aggiorna l'iterazione e registra le modifiche di SISTEMA.
 */
function recomputeFormulas(
  ctx: OperationContext,
  templateId: TemplateId,
  compiled: { template: TemplateDTO; bindings: TemplateBindings },
  iteration: IterationDoc,
  rows: RepeatRowDoc[],
  log: OpLog,
  ref: IterationRef,
  revision: number
): void {
  const snap: EngineSnapshot = engineSnapshot(iteration, rows);
  const res = computeFormulas({
    templateId,
    template: compiled.template,
    bindings: compiled.bindings,
    before: snap,
    after: snap,
    today: romeDate(ctx.now),
    now: ctx.now,
    operationId: ctx.operationId,
    actorId: null,
    manualWrites: new Set(),
    fatturabileWritten: false,
  });
  Object.assign(iteration.values, res.values);
  iteration.formulaMeta = { ...iteration.formulaMeta, ...res.formulaMeta };
  iteration.transversal = { ...iteration.transversal, ...res.transversal };
  for (const c of res.systemChanges) {
    log.field(ref, revision, { kind: "FIELD", target: c.target, oldValue: c.oldValue, newValue: c.newValue, detail: c.reason, source: "SYSTEM" });
  }
}

/* ---------- creazione ---------- */

const identityOcc = (t: TemplateDTO, flowId: string): FieldOccurrenceDTO => {
  const o = t.occurrences.find((x) => x.kind === "MASTER" && x.flowId === flowId);
  if (!o) throw new Error(`Template ${t.id}: manca l'occorrenza master di ${flowId}`);
  return o;
};

/**
 * POST /api/practices (al cutover) → scheda della nuova pratica. PM del template o ADMIN (D-20); il template
 * deve avere un PM leader attivo (D-101 a, con guardia contro il write skew); Committente e Cliente Finale
 * devono corrispondere al template quando la combinazione lo determina (D-16).
 */
export async function createPractice(deps: PracticeDeps, user: UserDTO, req: CreatePracticeRequest): Promise<PraticaDetailDTO> {
  prepareCreate(user, req); // 403 / 422 prima di aprire la transazione
  const practiceId = new ObjectId();
  const iterationId = new ObjectId();
  const { result } = await runOperation<Receipt>(
    deps.client,
    deps.db,
    { actorId: user.id, operationId: req.operationId, request: { create: withoutOp(req) }, practiceId, now: deps.clock?.() },
    async (ctx) => {
      await createPracticeInTx(ctx, user, withoutOp(req), { practiceId, iterationId });
      return { practiceId: practiceId.toHexString() };
    }
  );
  return getPracticeDetail(deps.db, user, result.practiceId);
}

/** Controlli e identità normalizzata della creazione (puri): gestore, combinazione D-16, chiave del sito (D-138). */
function prepareCreate(user: UserDTO, req: Omit<CreatePracticeRequest, "operationId">) {
  if (!canCreateIn(user).includes(req.templateId)) throw new HttpError("Non puoi creare pratiche per questo gestore", 403);
  const { template } = COMPILED_TEMPLATES[req.templateId];
  const committente = normalizeFieldValue(identityOcc(template, IDENTITY_FLOWS.committente), req.committente) as SelectValue;
  const clienteFinale = normalizeFieldValue(identityOcc(template, IDENTITY_FLOWS.clienteFinale), req.clienteFinale) as SelectValue;
  const resolved = resolveTemplate({ committente, clienteFinale });
  if (resolved.templateId && resolved.templateId !== req.templateId) {
    throw new HttpError(`Committente e Cliente Finale corrispondono al gestore ${resolved.templateId}`, 422);
  }
  const codiceSito = normalizeSiteKey(req.codiceSito);
  const nomeSito = normalizeSiteKey(req.nomeSito);
  const codiceG7 = req.codiceG7.trim();
  if (!codiceSito || !nomeSito || !/^\d+$/.test(codiceG7)) throw new HttpError("Codice G7, Codice Sito e Nome Sito sono obbligatori", 422);
  return { template, committente, clienteFinale, codiceSito, nomeSito, codiceG7 };
}

/**
 * Creazione DENTRO una transazione già aperta (comando e import, D-135). PM del template o ADMIN (D-20); il template
 * deve avere un PM leader attivo (D-101 a, con guardia contro il write skew).
 */
export async function createPracticeInTx(
  ctx: OperationContext,
  user: UserDTO,
  req: Omit<CreatePracticeRequest, "operationId">,
  ids: { practiceId: ObjectId; iterationId: ObjectId; source?: "USER" | "IMPORT" }
): Promise<void> {
  const { template, committente, clienteFinale, codiceSito, nomeSito, codiceG7 } = prepareCreate(user, req);
  const { practiceId, iterationId } = ids;
  await assertValuesInLists(ctx, req.templateId, [
    { occ: identityOcc(template, IDENTITY_FLOWS.committente), value: committente },
    { occ: identityOcc(template, IDENTITY_FLOWS.clienteFinale), value: clienteFinale },
  ]);
  await touchWriteGuard(ctx, `pm-leader:${req.templateId}`);
  await assertTemplateHasPmLeader(ctx.db, req.templateId, ctx.session);

  const b = buildNewPractice({
    practiceId,
    iterationId,
    templateId: req.templateId,
    template,
    identity: { codiceG7, codiceSito, nomeSito, committente, clienteFinale },
    createdBy: new ObjectId(user.id),
    now: ctx.now,
  });
  const log = new OpLog(ctx, actorOf(user));
  const ref = iterRef(practiceId, b.iteration);
  for (const flowId of Object.values(IDENTITY_FLOWS)) {
    log.field(ref, 1, { kind: "FIELD", target: { flowId }, oldValue: null, newValue: b.iteration.values[flowId] ?? null, source: ids.source ?? "USER" });
  }
  recomputeFormulas(ctx, req.templateId, COMPILED_TEMPLATES[req.templateId], b.iteration, b.rows, log, ref, 1);
  b.practice.currentSummary = summaryFor(template, b.practice, b.iteration, b.rows, 0);
  await store.practices(ctx.db).insertOne(b.practice, { session: ctx.session });
  await store.iterations(ctx.db).insertOne(b.iteration, { session: ctx.session });
  if (b.rows.length) await store.repeatRows(ctx.db).insertMany(b.rows, { session: ctx.session });
  log.event(ref, { kind: "CREATE", ...(ids.source === "IMPORT" ? { source: "IMPORT" as const } : {}), detail: `Pratica creata: ${codiceSito} – ${nomeSito}` });
  await log.flush();
}

/* ---------- Assegna (D-21) ---------- */

/** flowId che l'Assegna verso UT_PE compila con la data del giorno, se vuoti (effetto del compilatore). */
export function defaultTodayFlowIds(bindings: TemplateBindings): string[] {
  return bindings.effects.filter((e) => e.effects.some((x) => x.startsWith("DEFAULT_TODAY_ON_ASSIGN"))).map((e) => e.flowId);
}

/**
 * POST /api/practices/{id}/assign. groups ⊆ actions.assignableGroups (403 senza permesso, 422 per un gruppo
 * non ammesso); enabledGroups per unione. Con UT_PE, Incarico VS/AS e Incarico PE vuoti ← data del giorno.
 * Notifica in-app e intenzione di mail a OGNI membro attivo dei gruppi destinatari per quel gestore (attore
 * compreso, §3.3), a ogni Assegna: chiave "assign:<pratica>:<revisione>" (il tentativo ripetuto non duplica).
 * Destinatari aggiuntivi dalla policy (assignNotifications: DL quando la destinazione comprende UT_PE, D-116).
 */
export async function assignPractice(deps: PracticeDeps, user: UserDTO, id: string, req: AssignRequest): Promise<PraticaDetailDTO> {
  const practiceId = parsePracticeId(id);
  await runOperation<Receipt>(
    deps.client,
    deps.db,
    { actorId: user.id, operationId: req.operationId, request: { assign: id, ...withoutOp(req) }, practiceId, now: deps.clock?.() },
    async (ctx) => {
      const l = await loadForCommand(ctx, user, practiceId);
      assertAction(user, l.ap, "assign");
      const allowed = practiceActions(user, l.ap).assignableGroups;
      const bad = req.groups.filter((g) => !allowed.includes(g));
      if (bad.length) throw new HttpError(`Gruppi non assegnabili: ${groupsLabel(bad)}`, 422);
      const revision = await bumpPracticeRevision(ctx, practiceId, req.revision);

      const { practice, iteration, rows } = l;
      const compiled = await getCompiledVersion(practice.templateId, iteration.templateVersion, async () => ctx.db);
      const log = new OpLog(ctx, actorOf(user));
      const ref = iterRef(practiceId, iteration);
      const enabledGroups = Array.from(new Set<GroupId>([...practice.enabledGroups, ...req.groups]));
      const added = req.groups.filter((g) => !practice.enabledGroups.includes(g));

      if (req.groups.includes("UT_PE")) {
        const today = romeDate(ctx.now);
        for (const flowId of defaultTodayFlowIds(compiled.bindings)) {
          if (!isEmpty(iteration.values[flowId])) continue;
          iteration.values[flowId] = today;
          log.field(ref, revision, { kind: "FIELD", target: { flowId }, oldValue: null, newValue: today, detail: "Data del giorno all'Assegna verso UT/PE (D-21)", source: "SYSTEM" });
        }
      }
      // Gli Incarichi non sono trigger di stato oggi, ma lo stato si riallinea comunque alle regole (dati).
      const change = applyState(iteration.stateMeta, deriveAutomaticState({ templateId: practice.templateId, values: iteration.values, repeats: engineSnapshot(iteration, rows).repeats }));
      iteration.stateMeta = change.next;
      if (change.changed) {
        log.event(ref, {
          kind: "STATO",
          source: "SYSTEM",
          detail: `Stato attività: ${change.from} → ${change.to}${change.manualReleased ? " (nuovo evento automatico: termina lo stato manuale, D-119)" : ""}`,
          structuredDetail: { from: change.from, to: change.to, manualReleased: change.manualReleased, ...autoEventDateOf(change.next) },
        });
      } else if (change.manualReleased) {
        // D-132 §3.6: stesso stato, ma torna automatico.
        log.event(ref, { kind: "STATO", source: "SYSTEM", detail: `Stato attività ${change.to}: torna automatico (nuovo evento automatico, D-119)`, structuredDetail: { from: change.from, to: change.to, manualReleased: true, sourceOnly: true } });
      }

      await store.iterations(ctx.db).updateOne({ _id: iteration._id }, { $set: { values: iteration.values, stateMeta: iteration.stateMeta } }, { session: ctx.session });
      const summary = summaryFor(compiled.template, practice, iteration, rows);
      await store.practices(ctx.db).updateOne({ _id: practiceId }, { $set: { enabledGroups, currentSummary: summary } }, { session: ctx.session });

      const note = req.note?.trim() || undefined;
      log.event(ref, {
        kind: "ASSIGN",
        detail: `Assegnata a ${groupsLabel(req.groups)}${note ? `: ${note}` : ""}`,
        structuredDetail: { groups: req.groups, added, ...(note ? { note } : {}) },
      });
      await notifyAssign(ctx, { practice, iteration, summary, groups: req.groups, revision, note, actor: user, gestore: compiled.template.label });
      await log.flush();
      return { practiceId: id };
    }
  );
  return getPracticeDetail(deps.db, user, id);
}

async function notifyAssign(
  ctx: OperationContext,
  a: { practice: PracticeDoc; iteration: IterationDoc; summary: PracticeDoc["currentSummary"]; groups: GroupId[]; revision: number; note?: string; actor: UserDTO; gestore: string }
): Promise<void> {
  const templateId = a.practice.templateId;
  const eventKey = `assign:${a.practice._id.toHexString()}:${a.revision}`;
  const { extra } = assignNotifiedGroups(a.groups);
  const recipients = await store.users(ctx.db)
    .find(
      // D-143: chi esegue l'Assegna non riceve notifica né mail della propria azione (nemmeno quella extra per il DL).
      { _id: { $ne: new ObjectId(a.actor.id) }, status: "active", memberships: { $elemMatch: { templateId, group: { $in: [...a.groups, ...extra] } } } },
      { session: ctx.session, projection: { email: 1, name: 1, memberships: 1 } }
    )
    .toArray();
  const link = `${appBaseUrl()}/pratiche/${a.practice._id.toHexString()}`;
  for (const u of recipients) {
    const mine = a.groups.filter((g) => u.memberships.some((m) => m.templateId === templateId && m.group === g));
    // Destinatario aggiuntivo della policy (es. DL quando l'Assegna va a UT/PE, D-116): avvisato per conoscenza.
    const shown = mine.length ? mine : a.groups;
    const title = `Pratica ${a.summary.codiceSito} assegnata a ${groupsLabel(shown)}`;
    const body = `${a.actor.name} ha assegnato la pratica ${a.summary.codiceSito} – ${a.summary.nomeSito} (${a.gestore})${mine.length ? "" : ` a ${groupsLabel(a.groups)}`}${a.note ? `. Nota: ${a.note}` : ""}`;
    const doc: Omit<NotificationDoc, "_id"> = {
      userId: u._id,
      kind: "ASSIGN",
      eventKey,
      title,
      body,
      link: { practiceId: a.practice._id, iteration: a.iteration.n },
      createdAt: ctx.now,
      readAt: null,
    };
    await store.notifications(ctx.db).updateOne({ userId: u._id, eventKey }, { $setOnInsert: { _id: new ObjectId(), ...doc } }, { upsert: true, session: ctx.session });
    const mail = assignEmail({
      name: u.name,
      codiceSito: a.summary.codiceSito,
      nomeSito: a.summary.nomeSito,
      gestore: a.gestore,
      groups: groupsLabel(shown),
      actorName: a.actor.name,
      note: a.note,
      link,
    });
    await enqueueDeliveries(ctx, [{ eventKey, userId: u._id, payload: { to: u.email, subject: mail.subject, html: mail.html, actionLink: link } }]);
  }
}

/* ---------- Stato attività manuale (D-23, D-115, D-119) ---------- */

/** POST /api/practices/{id}/stato: PM e ADMIN; lo stato manuale resta finché non vince un evento automatico più recente di quello memorizzato al comando (D-119). */
export async function changeStato(deps: PracticeDeps, user: UserDTO, id: string, req: ChangeStatoRequest): Promise<PraticaDetailDTO> {
  const practiceId = parsePracticeId(id);
  await runOperation<Receipt>(
    deps.client,
    deps.db,
    { actorId: user.id, operationId: req.operationId, request: { changeStato: id, ...withoutOp(req) }, practiceId, now: deps.clock?.() },
    async (ctx) => {
      const l = await loadForCommand(ctx, user, practiceId);
      assertAction(user, l.ap, "changeStato");
      await bumpPracticeRevision(ctx, practiceId, req.revision);
      const { practice, iteration, rows } = l;
      const auto = deriveAutomaticState({ templateId: practice.templateId, values: iteration.values, repeats: engineSnapshot(iteration, rows).repeats });
      const change = applyState(iteration.stateMeta, auto, { stato: req.stato, actorId: new ObjectId(user.id), at: ctx.now });
      iteration.stateMeta = change.next;
      await store.iterations(ctx.db).updateOne({ _id: iteration._id }, { $set: { stateMeta: iteration.stateMeta } }, { session: ctx.session });
      const template = (await getCompiledVersion(practice.templateId, iteration.templateVersion, async () => ctx.db)).template;
      const log = new OpLog(ctx, actorOf(user));
      log.event(iterRef(practiceId, iteration), {
        kind: "STATO",
        detail: `Stato attività impostato a mano: ${change.from} → ${change.to}`,
        structuredDetail: { from: change.from, to: change.to, manual: true, autoStato: auto.stato },
      });
      // D-137 A-01: come nel salvataggio dei campi, gli alert si riconciliano qui con lo stato definitivo: l'ingresso in
      // KO apre FATTURABILE_KO subito, l'uscita registra subito la risoluzione (nuova generazione al rientro, D-97).
      const alerts = await reconcilePracticeAlerts({ ctx, practice, iteration, rows, template, actor: user, log });
      await store.practices(ctx.db).updateOne({ _id: practiceId }, { $set: { currentSummary: summaryFor(template, practice, iteration, rows, alerts.openAlerts) } }, { session: ctx.session });
      await log.flush();
      return { practiceId: id };
    }
  );
  return getPracticeDetail(deps.db, user, id);
}

/* ---------- archivio e ripristino (D-23, D-28) ---------- */

async function setArchived(deps: PracticeDeps, user: UserDTO, id: string, req: RevisionRequest, archived: boolean): Promise<PraticaDetailDTO> {
  const practiceId = parsePracticeId(id);
  await runOperation<Receipt>(
    deps.client,
    deps.db,
    { actorId: user.id, operationId: req.operationId, request: { [archived ? "archive" : "restore"]: id, ...withoutOp(req) }, practiceId, now: deps.clock?.() },
    async (ctx) => {
      const l = await loadForCommand(ctx, user, practiceId);
      assertAction(user, l.ap, archived ? "archive" : "restore");
      if (!archived) {
        // D-101, D-126 M-04: il ripristino può riattivare il gestore; serve un PM leader attivo, con la stessa guardia
        // delle modifiche agli utenti, così ripristino e rimozione dell'ultimo leader non passano entrambi.
        await touchWriteGuard(ctx, `pm-leader:${l.practice.templateId}`);
        await assertTemplateHasPmLeader(ctx.db, l.practice.templateId, ctx.session);
      }
      await bumpPracticeRevision(ctx, practiceId, req.revision);
      // Alert dell'iterazione corrente: sospesi all'archivio, ripresi al ripristino (non sono chiusure).
      const actor = new ObjectId(user.id);
      if (archived) await suspendAlerts(ctx, l.practice, actor);
      else await resumeAlerts(ctx, l.practice, actor);
      await store.practices(ctx.db).updateOne(
        { _id: practiceId },
        { $set: { archived, archivedAt: archived ? ctx.now : null, "currentSummary.openAlerts": await countOpenAlerts(ctx, l.practice.currentIterationId) } },
        { session: ctx.session }
      );
      const log = new OpLog(ctx, actorOf(user));
      log.event(iterRef(practiceId, l.iteration), { kind: archived ? "ARCHIVE" : "RESTORE", detail: archived ? "Pratica archiviata" : "Pratica ripristinata" });
      await log.flush();
      return { practiceId: id };
    }
  );
  return getPracticeDetail(deps.db, user, id);
}

export const archivePractice = (deps: PracticeDeps, user: UserDTO, id: string, req: RevisionRequest) => setArchived(deps, user, id, req, true);
export const restorePractice = (deps: PracticeDeps, user: UserDTO, id: string, req: RevisionRequest) => setArchived(deps, user, id, req, false);

/* ---------- cancellazione (D-27, D-113) ---------- */

/**
 * DELETE /api/practices/{id}?revision=&operationId= (al cutover) → 204. Solo CREATA, non archiviata, una sola
 * iterazione. Toglie pratica, iterazione, righe, storico, eventi, alert e notifiche della pratica e le mail
 * non ancora partite; la traccia resta nel registro di audit (audit_log, D-113).
 */
export async function deletePractice(deps: PracticeDeps, user: UserDTO, id: string, req: RevisionRequest): Promise<void> {
  const practiceId = parsePracticeId(id);
  await runOperation<Receipt>(
    deps.client,
    deps.db,
    { actorId: user.id, operationId: req.operationId, request: { delete: id, revision: req.revision }, practiceId, now: deps.clock?.() },
    async (ctx) => {
      const l = await loadForCommand(ctx, user, practiceId);
      assertAction(user, l.ap, "delete");
      await bumpPracticeRevision(ctx, practiceId, req.revision);
      const { db, session } = ctx;
      const s = l.practice.currentSummary;
      await store.auditLog(db).insertOne(
        {
          _id: new ObjectId(),
          kind: "PRACTICE_DELETE",
          actorId: new ObjectId(user.id),
          actorName: user.name,
          at: ctx.now,
          operationId: ctx.operationId,
          practice: { id: practiceId, templateId: l.practice.templateId, codiceSito: s.codiceSito, nomeSito: s.nomeSito, codiceG7: s.codiceG7, iterations: l.iterationCount },
        },
        { session }
      );
      const alertIds = (await store.alerts(db).find({ practiceId }, { session, projection: { _id: 1 } }).toArray()).map((a) => a._id);
      if (alertIds.length) await store.alertEvents(db).deleteMany({ alertId: { $in: alertIds } }, { session });
      await store.alerts(db).deleteMany({ practiceId }, { session });
      await store.notifications(db).deleteMany({ "link.practiceId": practiceId }, { session });
      await store.outbox(db).deleteMany({ eventKey: { $regex: `^assign:${practiceId.toHexString()}:` }, status: "PENDING" }, { session });
      await store.valueHistory(db).deleteMany({ practiceId }, { session });
      await store.events(db).deleteMany({ practiceId }, { session });
      await store.repeatRows(db).deleteMany({ practiceId }, { session });
      await store.iterations(db).deleteMany({ practiceId }, { session });
      await store.practices(db).deleteOne({ _id: practiceId }, { session });
      return { practiceId: id };
    }
  );
}

/* ---------- ereditarietà: rilavorazione e ripresentazione ---------- */

/** Righe ereditate e righe fisse di VINCOLI di una nuova iterazione. */
function buildRows(
  template: TemplateDTO,
  inherited: ReturnType<typeof inherit>["rows"],
  ids: { practiceId: ObjectId; iterationId: ObjectId },
  now: Date
): RepeatRowDoc[] {
  const copied: RepeatRowDoc[] = inherited.map((r) => ({
    _id: new ObjectId(),
    practiceId: ids.practiceId,
    iterationId: ids.iterationId,
    groupKey: r.groupKey,
    ordinal: r.ordinal,
    values: r.values,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  }));
  return [...constraintRows(template, ids, now), ...copied];
}

function logInherited(log: OpLog, ref: IterationRef, revision: number, values: Record<string, FieldValue>, rows: RepeatRowDoc[], detail: string): void {
  for (const [flowId, v] of Object.entries(values)) {
    log.field(ref, revision, { kind: "FIELD", target: { flowId }, oldValue: null, newValue: v, detail, source: "SYSTEM" });
  }
  for (const r of rows.filter((x) => x.groupKey !== "VINCOLI")) {
    log.field(ref, revision, { kind: "ROW_ADD", target: { groupKey: r.groupKey, rowId: r._id }, oldValue: null, newValue: null, rowSnapshot: r.values, detail, source: "SYSTEM" });
  }
}

function sourceData(l: Loaded, mode: InheritanceMode, template: TemplateDTO) {
  return inherit(inheritancePlan(template, mode), { values: l.iteration.values, rows: l.rows });
}

/**
 * POST /api/practices/{id}/rework → scheda della NUOVA pratica (D-26). PM o ADMIN, anche da pratica archiviata;
 * l'origine non cambia. Si copia il Core (esclusi ODA, Note ODA, Stato ODA); Codice G7 = quello del comando o,
 * se assente, quello dell'origine. Serve un PM leader attivo sul template (D-101).
 */
export async function reworkPractice(deps: PracticeDeps, user: UserDTO, id: string, req: ReworkRequest): Promise<PraticaDetailDTO> {
  const originId = parsePracticeId(id);
  const practiceId = new ObjectId();
  const iterationId = new ObjectId();
  const { result } = await runOperation<Receipt>(
    deps.client,
    deps.db,
    { actorId: user.id, operationId: req.operationId, request: { rework: id, ...withoutOp(req) }, practiceId, now: deps.clock?.() },
    async (ctx) => {
      await reworkPracticeInTx(ctx, user, originId, withoutOp(req), { practiceId, iterationId });
      return { practiceId: practiceId.toHexString() };
    }
  );
  return getPracticeDetail(deps.db, user, result.practiceId);
}

/** Rilavorazione DENTRO una transazione già aperta (comando e import, D-26, D-135). */
export async function reworkPracticeInTx(
  ctx: OperationContext,
  user: UserDTO,
  originId: ObjectId,
  req: Omit<ReworkRequest, "operationId">,
  ids: { practiceId: ObjectId; iterationId: ObjectId; source?: "USER" | "IMPORT" }
): Promise<void> {
  const { practiceId, iterationId } = ids;
  const l = await loadForCommand(ctx, user, originId);
  assertAction(user, l.ap, "rework");
  const templateId = l.practice.templateId;
  await touchWriteGuard(ctx, `pm-leader:${templateId}`);
  await assertTemplateHasPmLeader(ctx.db, templateId, ctx.session);

  const compiled = COMPILED_TEMPLATES[templateId];
  const source = await getCompiledVersion(templateId, l.iteration.templateVersion, async () => ctx.db);
  const data = sourceData(l, "rework", source.template);
  const g7 = req.codiceG7?.trim() ?? null;
  const originG7 = l.iteration.values[IDENTITY_FLOWS.codiceG7] ?? null;
  const values: Record<string, FieldValue> = { ...data.values, [IDENTITY_FLOWS.codiceG7]: g7 ? Number(g7) : originG7 };
  const iteration = buildIteration({ practiceId, iterationId, n: 1, template: compiled.template, values, now: ctx.now });
  const rows = buildRows(compiled.template, data.rows, { practiceId, iterationId }, ctx.now);
  iteration.rowSeq = rowSeqOf(rows);
  const practice: PracticeDoc = {
    _id: practiceId,
    templateId,
    currentIterationId: iterationId,
    currentIterationN: 1,
    revision: 1,
    archived: false,
    archivedAt: null,
    originPracticeId: originId,
    enabledGroups: ["PM_PERMESSI"],
    currentSummary: summaryOf(iteration, 0),
    createdBy: new ObjectId(user.id),
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  const log = new OpLog(ctx, actorOf(user));
  const ref = iterRef(practiceId, iteration);
  logInherited(log, ref, 1, values, rows, `Copiato dalla pratica d'origine ${l.practice.currentSummary.codiceSito} (rilavorazione, D-26)`);
  recomputeFormulas(ctx, templateId, compiled, iteration, rows, log, ref, 1);
  practice.currentSummary = summaryFor(compiled.template, practice, iteration, rows, 0);
  await store.practices(ctx.db).insertOne(practice, { session: ctx.session });
  await store.iterations(ctx.db).insertOne(iteration, { session: ctx.session });
  if (rows.length) await store.repeatRows(ctx.db).insertMany(rows, { session: ctx.session });
  log.event(ref, {
    kind: "REWORK",
    ...(ids.source === "IMPORT" ? { source: "IMPORT" as const } : {}),
    detail: `Rilavorazione della pratica ${l.practice.currentSummary.codiceSito} – ${l.practice.currentSummary.nomeSito}`,
    structuredDetail: { originPracticeId: originId.toHexString(), originIteration: l.iteration.n },
  });
  await log.flush();
}

/**
 * POST /api/practices/{id}/resubmit → scheda sulla nuova iterazione (D-25). PM leader o ADMIN, pratica non
 * archiviata. Iterazione n+1 con la versione corrente del template: Core e Dati Secondari ereditati (esclusi
 * Codice G7, ODA, Note ODA, Stato ODA), sezioni operative vuote, Vincoli con 11 righe nuove; le quattro Note
 * Operative conservate (D-25, D-121), Fatturabile NO automatico, Fatturato vuoto, Stato attività CREATA. I gruppi abilitati restano.
 */
export async function resubmitPractice(deps: PracticeDeps, user: UserDTO, id: string, req: ResubmitRequest): Promise<PraticaDetailDTO> {
  const practiceId = parsePracticeId(id);
  const iterationId = new ObjectId();
  await runOperation<Receipt>(
    deps.client,
    deps.db,
    { actorId: user.id, operationId: req.operationId, request: { resubmit: id, ...withoutOp(req) }, practiceId, now: deps.clock?.() },
    async (ctx) => {
      const l = await loadForCommand(ctx, user, practiceId);
      assertAction(user, l.ap, "resubmit");
      const revision = await bumpPracticeRevision(ctx, practiceId, req.revision);
      const templateId = l.practice.templateId;
      const compiled = COMPILED_TEMPLATES[templateId];
      const source = await getCompiledVersion(templateId, l.iteration.templateVersion, async () => ctx.db);
      const data = sourceData(l, "resubmit", source.template);
      const g7 = req.codiceG7?.trim();
      const values: Record<string, FieldValue> = { ...data.values, ...(g7 ? { [IDENTITY_FLOWS.codiceG7]: Number(g7) } : {}) };
      const n = l.iteration.n + 1;
      const iteration = buildIteration({
        practiceId,
        iterationId,
        n,
        template: compiled.template,
        values,
        transversal: { noteOperative: notesOf(l.iteration.transversal), fatturabile: "NO", fatturabileManual: false, fatturato: null },
        now: ctx.now,
      });
      iteration.stateMeta = newStateMeta();
      const rows = buildRows(compiled.template, data.rows, { practiceId, iterationId }, ctx.now);
      iteration.rowSeq = rowSeqOf(rows);
      const log = new OpLog(ctx, actorOf(user));
      const ref = iterRef(practiceId, iteration);
      logInherited(log, ref, revision, values, rows, `Ereditato dall'iterazione ${l.iteration.n} (ripresentazione, D-25)`);
      recomputeFormulas(ctx, templateId, compiled, iteration, rows, log, ref, revision);

      await store.iterations(ctx.db).updateOne({ _id: l.iteration._id }, { $set: { closedAt: ctx.now } }, { session: ctx.session });
      await store.iterations(ctx.db).insertOne(iteration, { session: ctx.session });
      if (rows.length) await store.repeatRows(ctx.db).insertMany(rows, { session: ctx.session });
      await store.practices(ctx.db).updateOne(
        { _id: practiceId },
        { $set: { currentIterationId: iterationId, currentIterationN: n, currentSummary: summaryFor(compiled.template, l.practice, iteration, rows, 0) } },
        { session: ctx.session }
      );
      // Alert solo sull'iterazione corrente (D-25): quelli aperti dell'iterazione chiusa diventano SUPERSEDED.
      await supersedeAlerts(ctx, practiceId, l.iteration._id, new ObjectId(user.id));
      log.event(ref, {
        kind: "RESUBMIT",
        detail: `Ripresentazione: iterazione ${n}${g7 ? ` con Codice G7 ${g7}` : ""}`,
        structuredDetail: { fromIteration: l.iteration.n, toIteration: n },
      });
      await log.flush();
      return { practiceId: id };
    }
  );
  return getPracticeDetail(deps.db, user, id);
}
