/**
 * Riconciliazione degli alert di UNA pratica dentro una transazione (B7, D-44–D-46, D-97, D-131). La usano il salvataggio
 * dei campi (aggancio obbligatorio, chiusure da compilazione nello stesso salvataggio) e il job giornaliero delle 09:00.
 *
 * Azioni del motore puro (lib/alerts/engine.ts) → documenti:
 *  - OPEN: alert con chiave d'episodio unica, destinatari fotografati, alert_events OPEN (+ SKIP_RECIPIENT per le quote
 *    senza leader), notifica in-app a ciascuno, mail nell'outbox solo per le regole con email (D-46), evento ALERT_OPEN;
 *  - CLOSE: chiusura AUTO con motivo, resolvedAt, evento ALERT_CLOSE;
 *  - RESCHEDULE / MARK_RESOLVED / REMIND: scadenza spostata, situazione risolta dopo una chiusura, promemoria;
 *  - FATTURABILE_KO si chiude con la decisione manuale su Fatturabile (closedBy = autore, motivo FIELD_MANUAL), anche
 *    l'episodio aperto dalla stessa operazione (nato chiuso, senza notifiche: D-137 A-03).
 * Pratica archiviata: niente aperture né promemoria (gli alert restano SUSPENDED). Notifiche e mail hanno chiavi
 * idempotenti (alert:<id>:OPEN, alert:<id>:REMINDER:<giorno>): un ritentativo non duplica.
 */
import { ObjectId } from "mongodb";
import type { TemplateDTO, UserDTO } from "@/lib/contract";
import { appBaseUrl, alertEmail } from "@/lib/email";
import { alertSpec, evaluateTargets, reconcileAlerts, type AlertAction, type ExistingAlert, type Threshold, type ThresholdAt } from "@/lib/alerts/engine";
import { alertRecipients } from "@/lib/alerts/recipients";
import { store } from "@/lib/store/db";
import { OpLog } from "@/lib/store/oplog";
import { cancelAlertDeliveries, enqueueDeliveries } from "@/lib/store/outbox";
import type { OperationContext } from "@/lib/store/transaction";
import type { AlertDoc, AlertEventDoc, IterationDoc, PracticeDoc, RepeatRowDoc } from "@/lib/store/types";
import { toEngineRow } from "@/lib/practice/detail";
import { alertLabel, countOpenAlerts, thresholdsByVersion } from "@/services/alerts";

/** Versione del calendario delle festività usato per le scadenze (D-97: memorizzata su ogni alert). */
export const CALENDAR_VERSION = "IT-2026-4ottobre";

export interface ReconcileInput {
  ctx: OperationContext;
  practice: PracticeDoc;
  /** Iterazione corrente con i valori definitivi. */
  iteration: IterationDoc;
  rows: RepeatRowDoc[];
  template: TemplateDTO;
  /** Autore della modifica (null = sistema). */
  actor: Pick<UserDTO, "id" | "name"> | null;
  /** Decisione manuale su Fatturabile in questo salvataggio (chiude FATTURABILE_KO, D-131). */
  fatturabileWritten?: boolean;
  /** Registro della stessa operazione (PATCH): gli eventi della timeline lo condividono e li scrive il chiamante. */
  log?: OpLog;
}

export interface ReconcileResult {
  opened: number;
  closed: number;
  reminded: number;
  openAlerts: number;
}

/**
 * Soglie del gestore: la corrente (ultima versione attiva) di ogni regola per i nuovi episodi, e ogni versione del
 * registro per ricalcolare un episodio già emesso con la SUA soglia (D-97, D-137 A-13).
 */
async function thresholdsOf(ctx: OperationContext, templateId: PracticeDoc["templateId"]): Promise<{ current: Partial<Record<string, Threshold>>; at: ThresholdAt }> {
  const docs = await store.ruleConfig(ctx.db).find({ templateId }, { session: ctx.session }).sort({ version: -1 }).toArray();
  const current: Partial<Record<string, Threshold>> = {};
  for (const d of docs) if (d.enabled && !current[d.ruleId]) current[d.ruleId] = { days: d.days, unit: d.unit, version: d.version };
  const byVersion = new Map(docs.map((d) => [`${d.ruleId}|${d.version}`, { days: d.days, unit: d.unit }]));
  return { current, at: (ruleId, version) => byVersion.get(`${ruleId}|${version}`) };
}

const toExisting = (a: AlertDoc): ExistingAlert => ({
  id: a._id.toHexString(),
  ruleId: a.ruleId,
  rowId: a.subject.rowId ? a.subject.rowId.toHexString() : null,
  generation: a.generation,
  status: a.status,
  closeMode: a.closeMode,
  dueAt: a.dueAt,
  dueLocalDate: a.dueLocalDate,
  sourceFingerprint: a.sourceFingerprint,
  resolvedAt: a.resolvedAt ?? null,
  reminderCount: a.reminderCount ?? 0,
  ruleVersion: a.ruleVersion,
  openedAt: a.openedAt,
  lastReminderAt: a.lastReminderAt ?? null,
});

export async function reconcilePracticeAlerts(input: ReconcileInput): Promise<ReconcileResult> {
  const { ctx, practice, iteration, rows, template } = input;
  const { db, session } = ctx;
  const result: ReconcileResult = { opened: 0, closed: 0, reminded: 0, openAlerts: 0 };
  const actorId = input.actor ? new ObjectId(input.actor.id) : null;
  const log = input.log ?? new OpLog(ctx, { id: actorId, name: input.actor?.name ?? null });
  const ref = { practiceId: practice._id, iterationId: iteration._id, n: iteration.n };

  const existingDocs = await store.alerts(db).find({ iterationId: iteration._id }, { session }).toArray();
  // Etichette con la soglia della versione di ciascun episodio (D-155).
  const thresholdAt = await thresholdsByVersion(ctx, practice.templateId);
  const labelOf = (a: Pick<AlertDoc, "ruleId" | "ruleVersion">) => alertLabel(a.ruleId, thresholdAt(a.ruleId, a.ruleVersion));
  const byId = new Map(existingDocs.map((a) => [a._id.toHexString(), a]));
  const events: AlertEventDoc[] = [];
  const nextIndex = new Map<string, number>();
  const event = async (alertId: ObjectId, kind: AlertEventDoc["kind"], detail?: Record<string, unknown>) => {
    const k = alertId.toHexString();
    if (!nextIndex.has(k)) {
      const last = await store.alertEvents(db).find({ alertId }, { session, projection: { eventIndex: 1 } }).sort({ eventIndex: -1 }).limit(1).toArray();
      nextIndex.set(k, last.length ? last[0].eventIndex + 1 : 0);
    }
    const i = nextIndex.get(k)!;
    nextIndex.set(k, i + 1);
    events.push({ _id: new ObjectId(), alertId, eventIndex: i, kind, actorId, time: ctx.now, detail: { operationId: ctx.operationId, ...detail } });
  };
  /** resolved: la situazione si è risolta (abilita un nuovo episodio, D-97); false per la decisione manuale su Fatturabile. */
  const close = async (a: AlertDoc, reason: string, by: ObjectId | null, resolved = true) => {
    await store.alerts(db).updateOne(
      { _id: a._id, status: "OPEN" },
      { $set: { status: "CLOSED", closeMode: "AUTO", closedAt: ctx.now, closedBy: by, closeReason: reason, resolvedAt: resolved ? ctx.now : a.resolvedAt ?? null, nextReminderAt: null } },
      { session }
    );
    a.status = "CLOSED";
    a.closeMode = "AUTO";
    // La decisione su Fatturabile non risolve la situazione, ma un'uscita da KO già registrata resta valida.
    a.resolvedAt = resolved ? ctx.now : a.resolvedAt ?? null;
    await event(a._id, "CLOSE", { mode: "AUTO", reason });
    // D-137 A-07: le mail di questo alert non ancora in invio non partono più.
    await cancelAlertDeliveries(ctx, [a._id], `Alert chiuso: ${reason}`);
    log.event(ref, { kind: "ALERT_CLOSE", source: by ? "USER" : "SYSTEM", detail: `Alert chiuso: ${labelOf(a)} (${reason})`, structuredDetail: { alertId: a._id.toHexString(), ruleId: a.ruleId } });
    result.closed++;
  };

  if (!practice.archived) {
    const thresholds = await thresholdsOf(ctx, practice.templateId);
    const targets = evaluateTargets({
      templateId: practice.templateId,
      values: iteration.values,
      repeats: groupRows(rows),
      stato: iteration.stateMeta.stato,
      thresholds: thresholds.current,
    });
    const actions = reconcileAlerts(targets, existingDocs.map(toExisting), ctx.now, undefined, thresholds.at);
    if (actions.some((a) => a.type === "OPEN" || a.type === "REMIND")) {
      const users = await store.users(db)
        .find({ status: "active", "memberships.templateId": practice.templateId }, { session, projection: { name: 1, email: 1, status: 1, memberships: 1 } })
        .toArray();
      const candidates = users.map((u) => ({ id: u._id.toHexString(), status: u.status, memberships: u.memberships, name: u.name, email: u.email }));
      for (const action of actions) await apply(action, candidates);
    } else {
      for (const action of actions) await apply(action, []);
    }
  }

  // D-131, D-137 A-03: la decisione manuale su Fatturabile (anche NO → NO) chiude l'episodio FATTURABILE_KO aperto,
  // compreso quello che questa stessa operazione ha appena trovato o aperto. Si applica DOPO la riconciliazione, sul
  // risultato finale; un blocco manuale di un KO precedente non impedisce invece l'apertura di un episodio nuovo.
  if (input.fatturabileWritten) {
    for (const a of byId.values()) {
      if (a.ruleId === "FATTURABILE_KO" && a.status === "OPEN") await close(a, "FIELD_MANUAL: decisione manuale su Fatturabile", actorId, false);
    }
  }

  async function apply(action: AlertAction, candidates: Array<{ id: string; status: "active" | "invited" | "deactivated"; memberships: UserDTO["memberships"]; name: string; email: string }>): Promise<void> {
    if (action.type === "CLOSE") {
      const a = byId.get(action.alertId);
      if (a && a.status === "OPEN") await close(a, action.reason, null);
      return;
    }
    if (action.type === "MARK_RESOLVED" || action.type === "MARK_UNRESOLVED") {
      const resolvedAt = action.type === "MARK_RESOLVED" ? ctx.now : null;
      await store.alerts(db).updateOne({ _id: new ObjectId(action.alertId) }, { $set: { resolvedAt } }, { session });
      const a = byId.get(action.alertId);
      if (a) a.resolvedAt = resolvedAt;
      await event(new ObjectId(action.alertId), action.type === "MARK_RESOLVED" ? "RESOLVED" : "UNRESOLVED");
      return;
    }
    if (action.type === "RESCHEDULE") {
      // Scadenza, versione e ricorrenza insieme e coerenti (D-137 A-10, A-13); l'evento conserva gli input del calcolo.
      await store.alerts(db).updateOne(
        { _id: new ObjectId(action.alertId) },
        {
          $set: {
            dueAt: action.due?.dueAt ?? null,
            dueLocalDate: action.due?.dueLocalDate ?? null,
            sourceFingerprint: action.sourceFingerprint,
            ruleVersion: action.ruleVersion,
            reminderCount: action.reminderCount,
            nextReminderAt: action.nextReminder?.dueAt ?? null,
          },
        },
        { session }
      );
      await event(new ObjectId(action.alertId), "RESCHEDULE", {
        dueLocalDate: action.due?.dueLocalDate ?? null,
        trigger: action.sourceFingerprint,
        ruleVersion: action.ruleVersion,
        threshold: action.threshold,
        reminderCount: action.reminderCount,
      });
      return;
    }
    const spec = alertSpec(action.type === "OPEN" ? action.ruleId : byId.get(action.alertId)!.ruleId)!;
    const recipients = alertRecipients(candidates, practice.templateId, spec);
    const people = candidates.filter((c) => recipients.userIds.includes(c.id));
    const link = `${appBaseUrl()}/pratiche/${practice._id.toHexString()}`;

    if (action.type === "OPEN") {
      const _id = new ObjectId();
      const rowId = action.rowId ? new ObjectId(action.rowId) : undefined;
      const episodeKey = `${practice._id.toHexString()}:${iteration._id.toHexString()}:${action.ruleId}:${action.rowId ?? "-"}:${action.generation}`;
      if (await store.alerts(db).findOne({ episodeKey }, { session, projection: { _id: 1 } })) return; // già aperto (ritentativo)
      const doc: AlertDoc = {
        _id,
        practiceId: practice._id,
        iterationId: iteration._id,
        ruleId: action.ruleId,
        ownerGroup: spec.ownerGroup,
        subject: { ...(action.subject.flowId ? { flowId: action.subject.flowId } : {}), ...(action.subject.groupKey ? { groupKey: action.subject.groupKey } : {}), ...(rowId ? { rowId } : {}) },
        episodeKey,
        generation: action.generation,
        sourceFingerprint: action.sourceFingerprint,
        ruleVersion: action.ruleVersion,
        calendarVersion: CALENDAR_VERSION,
        dueLocalDate: action.due?.dueLocalDate ?? null,
        dueAt: action.due?.dueAt ?? null,
        status: "OPEN",
        executionStatus: "ACTIVE",
        openedAt: ctx.now,
        closedAt: null,
        closeMode: null,
        closedBy: null,
        closeReason: null,
        recipientsSnapshot: people.map((p) => new ObjectId(p.id)),
        nextReminderAt: action.nextReminder?.dueAt ?? null,
        // Apertura in ritardo: i turni già trascorsi sono assorbiti (D-137 A-11).
        reminderCount: action.reminderCount,
        lastReminderAt: ctx.now,
        resolvedAt: null,
      };
      await store.alerts(db).insertOne(doc, { session });
      byId.set(_id.toHexString(), doc);
      await event(_id, "OPEN", { recipients: recipients.userIds, dueLocalDate: doc.dueLocalDate });
      for (const quota of recipients.missing) await event(_id, "SKIP_RECIPIENT", { quota, reason: "MISSING_LEADER" });
      // Episodio già deciso in questo salvataggio (A-03): resta per l'audit, si chiude qui sotto, nessuna richiesta.
      const decidedNow = input.fatturabileWritten && action.ruleId === "FATTURABILE_KO";
      if (!decidedNow) await notify(doc, people, `alert:${_id.toHexString()}:OPEN`, false, link);
      log.event(ref, { kind: "ALERT_OPEN", source: "SYSTEM", detail: `Alert: ${labelOf(doc)}`, structuredDetail: { alertId: _id.toHexString(), ruleId: action.ruleId, dueLocalDate: doc.dueLocalDate } });
      result.opened++;
      return;
    }

    // REMIND
    const a = byId.get(action.alertId)!;
    await store.alerts(db).updateOne(
      { _id: a._id, status: "OPEN" },
      { $set: { reminderCount: action.reminderCount, nextReminderAt: action.nextReminder.dueAt, lastReminderAt: ctx.now } },
      { session }
    );
    await event(a._id, "REMIND", { slot: action.slot, recipients: recipients.userIds });
    for (const quota of recipients.missing) await event(a._id, "SKIP_RECIPIENT", { quota, reason: "MISSING_LEADER" });
    await notify(a, people, `alert:${a._id.toHexString()}:REMINDER:${action.slot}`, true, link);
    result.reminded++;
  }

  async function notify(a: AlertDoc, people: Array<{ id: string; name: string; email: string }>, eventKey: string, reminder: boolean, link: string): Promise<void> {
    const spec = alertSpec(a.ruleId)!;
    const label = labelOf(a);
    const s = practice.currentSummary;
    const due = a.dueLocalDate ? a.dueLocalDate.split("-").reverse().join("/") : null;
    for (const p of people) {
      const userId = new ObjectId(p.id);
      await store.notifications(db).updateOne(
        { userId, eventKey },
        {
          $setOnInsert: {
            _id: new ObjectId(),
            userId,
            kind: reminder ? "REMINDER" : "ALERT",
            eventKey,
            title: `${reminder ? "Promemoria" : "Alert"}: ${label}`,
            body: `Pratica ${s.codiceSito} – ${s.nomeSito}${due ? `, scadenza ${due}` : ""}`,
            link: {
              practiceId: practice._id,
              iteration: iteration.n,
              ...(a.subject.flowId ? { flowId: a.subject.flowId } : {}),
              ...(a.subject.groupKey ? { repeat: a.subject.groupKey } : {}),
              ...(a.subject.rowId ? { rowId: a.subject.rowId } : {}),
            },
            createdAt: ctx.now,
            readAt: null,
          },
        },
        { upsert: true, session }
      );
      if (spec.email) {
        const mail = alertEmail({ name: p.name, label, codiceSito: s.codiceSito, nomeSito: s.nomeSito, gestore: template.label, due, reminder, link });
        await enqueueDeliveries(ctx, [{ eventKey, userId, alertId: a._id, payload: { to: p.email, subject: mail.subject, html: mail.html, actionLink: link } }]);
      }
    }
  }

  if (events.length) await store.alertEvents(db).insertMany(events, { session });
  if (!input.log) await log.flushEvents();
  result.openAlerts = await countOpenAlerts(ctx, iteration._id);
  return result;
}

function groupRows(rows: RepeatRowDoc[]): Record<string, Array<{ rowId: string; values: RepeatRowDoc["values"] }>> {
  const out: Record<string, Array<{ rowId: string; values: RepeatRowDoc["values"] }>> = {};
  for (const r of [...rows].sort((a, b) => a.ordinal - b.ordinal)) {
    const e = toEngineRow(r);
    (out[r.groupKey] ??= []).push({ rowId: e.rowId, values: r.values });
  }
  return out;
}
