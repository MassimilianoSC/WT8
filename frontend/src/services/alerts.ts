/**
 * Alert: ciclo di vita legato ai comandi e chiusura manuale (B7, contratto §8, D-44, D-46). L'apertura e la
 * chiusura automatica le farà il motore degli alert (dopo la revisione dei motori); qui c'è ciò che dipende solo dai
 * dati: sospensione su archivio, ripresa su ripristino, SUPERSEDED sulla ripresentazione (non sono chiusure), la
 * chiusura manuale idempotente e la proiezione per la scheda.
 */
import { ObjectId, type Db } from "mongodb";
import type { AlertDTO, GroupId, TemplateDTO, TemplateId, UserDTO } from "@/lib/contract";
import { canCloseAlert, canSeePractice } from "@/lib/engines/access";
import { HttpError } from "@/lib/http-error";
import { ALERT_RULES, store } from "@/lib/store/db";
import { OpLog } from "@/lib/store/oplog";
import { cancelAlertDeliveries } from "@/lib/store/outbox";
import { runOperation, type OperationContext } from "@/lib/store/transaction";
import type { AlertDoc, AlertEventDoc, PracticeDoc } from "@/lib/store/types";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";
import type { StoreDeps } from "@/services/users-v2";

/** Regole senza soglia: testo fisso. */
const FIXED_LABELS: Record<string, string> = { FATTURABILE_KO: "Pratica KO: decidere se è fatturabile" };

/** Soglia di una versione della regola (rule_config). */
export type AlertThreshold = { days: number; unit: "WORKING_DAYS" | "CALENDAR_DAYS" };

/**
 * Etichetta leggibile di un alert (D-155): l'etichetta della regola con la soglia della versione dell'EPISODIO al posto
 * di "giorni" (es. "Data sopralluogo: 7 giorni lavorativi dopo la Data assegnazione"). Senza soglia: l'etichetta della
 * regola com'è.
 */
export function alertLabel(ruleId: string, threshold?: AlertThreshold | null): string {
  if (FIXED_LABELS[ruleId]) return FIXED_LABELS[ruleId];
  const base = ALERT_RULES.find((r) => r.ruleId === ruleId)?.label ?? ruleId;
  if (!threshold) return base;
  const n = threshold.days;
  const unit = threshold.unit === "WORKING_DAYS" ? (n === 1 ? "giorno lavorativo" : "giorni lavorativi") : n === 1 ? "giorno di calendario" : "giorni di calendario";
  return base.replace(/\bgiorni\b/, `${n} ${unit}`);
}

/** Soglie di tutte le versioni delle regole di un gestore: (ruleId, versione) → soglia. */
export async function thresholdsByVersion(
  ctx: Pick<OperationContext, "db"> & { session?: OperationContext["session"] },
  templateId: TemplateId
): Promise<(ruleId: string, version: number) => AlertThreshold | undefined> {
  const docs = await store.ruleConfig(ctx.db).find({ templateId }, { session: ctx.session, projection: { ruleId: 1, version: 1, days: 1, unit: 1 } }).toArray();
  const map = new Map(docs.map((d) => [`${d.ruleId}|${d.version}`, { days: d.days, unit: d.unit }]));
  return (ruleId, version) => map.get(`${ruleId}|${version}`);
}

/** Gruppo competente: quello dichiarato dall'alert, altrimenti quello del master del campo, altrimenti PM/Permessi. */
export function alertOwnerGroup(a: Pick<AlertDoc, "ownerGroup" | "subject">, template: Pick<TemplateDTO, "occurrences">): GroupId {
  if (a.ownerGroup) return a.ownerGroup;
  const occ = a.subject.flowId ? template.occurrences.find((o) => o.kind === "MASTER" && o.flowId === a.subject.flowId) : undefined;
  return occ?.ownerGroup ?? "PM_PERMESSI";
}

export function toAlertDTO(
  a: AlertDoc,
  ctx: { templateId: TemplateId; iteration: number; user: UserDTO; closedByName?: string | null; threshold?: AlertThreshold | null }
): AlertDTO {
  const template = COMPILED_TEMPLATES[ctx.templateId].template;
  const canClose = a.status === "OPEN" && canCloseAlert(ctx.user, { templateId: ctx.templateId, ruleId: a.ruleId, ownerGroup: alertOwnerGroup(a, template) });
  return {
    id: a._id.toHexString(),
    practiceId: a.practiceId.toHexString(),
    iteration: ctx.iteration,
    rule: a.ruleId,
    label: alertLabel(a.ruleId, ctx.threshold),
    ...(a.subject.flowId ? { flowId: a.subject.flowId } : {}),
    ...(a.subject.groupKey ? { repeat: a.subject.groupKey } : {}),
    ...(a.subject.rowId ? { rowId: a.subject.rowId.toHexString() } : {}),
    ...(a.subject.sectionKey ? { sectionKey: a.subject.sectionKey } : {}),
    executionStatus: a.executionStatus,
    openedAt: a.openedAt.toISOString(),
    dueAt: a.dueAt ? a.dueAt.toISOString() : null,
    status: a.status,
    ...(a.closedAt ? { closedAt: a.closedAt.toISOString() } : {}),
    ...(a.closeMode ? { closeMode: a.closeMode } : {}),
    ...(a.closedBy ? { closedBy: a.closedBy.toHexString() } : {}),
    ...(a.closedBy && ctx.closedByName ? { closedByName: ctx.closedByName } : {}),
    canCloseManually: canClose,
  };
}

/* ---------- ciclo di vita nei comandi (nella transazione del comando) ---------- */

async function nextEventIndex(ctx: OperationContext, alertId: ObjectId): Promise<number> {
  const last = await store.alertEvents(ctx.db).find({ alertId }, { session: ctx.session, projection: { eventIndex: 1 } }).sort({ eventIndex: -1 }).limit(1).toArray();
  return last.length ? last[0].eventIndex + 1 : 0;
}

async function transition(
  ctx: OperationContext,
  filter: Partial<Pick<AlertDoc, "practiceId" | "iterationId">> & { executionStatus: { $in: AlertDoc["executionStatus"][] } },
  to: AlertDoc["executionStatus"],
  kind: AlertEventDoc["kind"],
  actorId: ObjectId | null
): Promise<number> {
  const alerts = await store.alerts(ctx.db).find({ ...filter, status: "OPEN" }, { session: ctx.session, projection: { _id: 1 } }).toArray();
  // D-137 A-07: sospensione e sostituzione annullano le mail non ancora in invio (la ripresa non le ricrea).
  if (to !== "ACTIVE") {
    await cancelAlertDeliveries(ctx, alerts.map((a) => a._id), to === "SUSPENDED" ? "Alert sospeso (pratica archiviata)" : "Alert sostituito da una ripresentazione");
  }
  for (const a of alerts) {
    await store.alerts(ctx.db).updateOne({ _id: a._id }, { $set: { executionStatus: to } }, { session: ctx.session });
    await store.alertEvents(ctx.db).insertOne(
      { _id: new ObjectId(), alertId: a._id, eventIndex: await nextEventIndex(ctx, a._id), kind, actorId, time: ctx.now, detail: { operationId: ctx.operationId } },
      { session: ctx.session }
    );
  }
  return alerts.length;
}

/** Archivio: gli alert aperti dell'iterazione corrente si sospendono (non si chiudono). */
export const suspendAlerts = (ctx: OperationContext, p: Pick<PracticeDoc, "_id" | "currentIterationId">, actorId: ObjectId | null) =>
  transition(ctx, { practiceId: p._id, iterationId: p.currentIterationId, executionStatus: { $in: ["ACTIVE"] } }, "SUSPENDED", "SUSPEND", actorId);

/** Ripristino: gli alert sospesi dell'iterazione corrente riprendono. */
export const resumeAlerts = (ctx: OperationContext, p: Pick<PracticeDoc, "_id" | "currentIterationId">, actorId: ObjectId | null) =>
  transition(ctx, { practiceId: p._id, iterationId: p.currentIterationId, executionStatus: { $in: ["SUSPENDED"] } }, "ACTIVE", "RESUME", actorId);

/** Ripresentazione: gli alert aperti dell'iterazione chiusa diventano SUPERSEDED (alert solo sulla corrente, D-25). */
export const supersedeAlerts = (ctx: OperationContext, practiceId: ObjectId, oldIterationId: ObjectId, actorId: ObjectId | null) =>
  transition(ctx, { practiceId, iterationId: oldIterationId, executionStatus: { $in: ["ACTIVE", "SUSPENDED"] } }, "SUPERSEDED", "SUSPEND", actorId);

/** Conteggio degli alert aperti e attivi dell'iterazione corrente (proiezione per l'elenco). */
export async function countOpenAlerts(ctx: Pick<OperationContext, "db" | "session">, iterationId: ObjectId): Promise<number> {
  return store.alerts(ctx.db).countDocuments({ iterationId, status: "OPEN", executionStatus: "ACTIVE" }, { session: ctx.session });
}

/* ---------- lettura per la scheda ---------- */

/** Alert aperti dell'iterazione corrente (attivi o sospesi), dal più urgente. */
export async function openAlertsOf(db: Db, p: PracticeDoc, iteration: number, user: UserDTO): Promise<AlertDTO[]> {
  const docs = await store.alerts(db).find({ iterationId: p.currentIterationId, status: "OPEN" }).sort({ dueAt: 1, _id: 1 }).toArray();
  const at = docs.length ? await thresholdsByVersion({ db }, p.templateId) : () => undefined;
  return docs.map((a) => toAlertDTO(a, { templateId: p.templateId, iteration, user, threshold: at(a.ruleId, a.ruleVersion) }));
}

/* ---------- chiusura manuale (POST /api/alerts/{id}/close) ---------- */

/**
 * Leader del gruppo competente e ADMIN (D-46; OFFERTA_ODA: solo leader PM/Permessi e ADMIN). Idempotente: un alert
 * già chiuso torna invariato (200). Un alert chiuso a mano non si riapre da solo (il motore lo rispetterà).
 */
export async function closeAlert(deps: StoreDeps, user: UserDTO, id: string, operationId?: string): Promise<AlertDTO> {
  if (!/^[0-9a-f]{24}$/i.test(id)) throw new HttpError("Alert non trovato", 404);
  const alertId = new ObjectId(id);
  const load = async (db: Db) => {
    const a = await store.alerts(db).findOne({ _id: alertId });
    const p = a ? await store.practices(db).findOne({ _id: a.practiceId }) : null;
    if (!a || !p || !canSeePractice(user, p)) throw new HttpError("Alert non trovato", 404);
    return { a, p };
  };
  const before = await load(deps.db);
  if (before.a.status === "OPEN") {
    await runOperation(deps.client, deps.db, { actorId: user.id, operationId, request: { closeAlert: id }, practiceId: before.p._id }, async (ctx) => {
      const a = await store.alerts(ctx.db).findOne({ _id: alertId }, { session: ctx.session });
      const p = a ? await store.practices(ctx.db).findOne({ _id: a.practiceId }, { session: ctx.session }) : null;
      if (!a || !p) throw new HttpError("Alert non trovato", 404);
      if (a.status !== "OPEN") return { alertId: id };
      if (a.ruleId === "FATTURABILE_KO") throw new HttpError("Fatturabile KO si chiude solo con la decisione su Fatturabile (D-131)", 403);
      const owner = alertOwnerGroup(a, COMPILED_TEMPLATES[p.templateId].template);
      if (!canCloseAlert(user, { templateId: p.templateId, ruleId: a.ruleId, ownerGroup: owner })) throw new HttpError("Solo i team leader competenti e l'ADMIN chiudono questo alert", 403);
      const actorId = new ObjectId(user.id);
      await store.alerts(ctx.db).updateOne(
        { _id: alertId, status: "OPEN" },
        { $set: { status: "CLOSED", closedAt: ctx.now, closeMode: "MANUAL", closedBy: actorId, closeReason: "Chiusura manuale", nextReminderAt: null } },
        { session: ctx.session }
      );
      await store.alertEvents(ctx.db).insertOne(
        { _id: new ObjectId(), alertId, eventIndex: await nextEventIndex(ctx, alertId), kind: "CLOSE", actorId, time: ctx.now, detail: { mode: "MANUAL", operationId: ctx.operationId } },
        { session: ctx.session }
      );
      await cancelAlertDeliveries(ctx, [alertId], "Alert chiuso a mano");
      const it = await store.iterations(ctx.db).findOne({ _id: a.iterationId }, { session: ctx.session, projection: { n: 1 } });
      const log = new OpLog(ctx, { id: actorId, name: user.name });
      const th = (await thresholdsByVersion(ctx, p.templateId))(a.ruleId, a.ruleVersion);
      log.event({ practiceId: p._id, iterationId: a.iterationId, n: it?.n ?? 0 }, { kind: "ALERT_CLOSE", detail: `Alert chiuso a mano: ${alertLabel(a.ruleId, th)}`, structuredDetail: { alertId: id, ruleId: a.ruleId } });
      await log.flush();
      if (a.iterationId.equals(p.currentIterationId)) {
        await store.practices(ctx.db).updateOne({ _id: p._id }, { $set: { "currentSummary.openAlerts": await countOpenAlerts(ctx, a.iterationId) } }, { session: ctx.session });
      }
      return { alertId: id };
    });
  }
  const { a, p } = await load(deps.db);
  const it = await store.iterations(deps.db).findOne({ _id: a.iterationId }, { projection: { n: 1 } });
  const closer = a.closedBy ? await store.users(deps.db).findOne({ _id: a.closedBy }, { projection: { name: 1 } }) : null;
  const th = (await thresholdsByVersion({ db: deps.db }, p.templateId))(a.ruleId, a.ruleVersion);
  return toAlertDTO(a, { templateId: p.templateId, iteration: it?.n ?? 0, user, closedByName: closer?.name ?? null, threshold: th });
}
