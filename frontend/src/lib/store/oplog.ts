/**
 * Voci di storico dei valori ed eventi di timeline di UNA operazione (D-47, D-90). Raccoglie le voci con
 * indici progressivi (chiave unica opKey + indice: attore + operationId, D-126 M-06) e le scrive insieme, nella transazione dell'operazione.
 */
import { ObjectId } from "mongodb";
import { store } from "@/lib/store/db";
import type { OperationContext } from "@/lib/store/transaction";
import type { PracticeEventDoc, Source, ValueHistoryDoc } from "@/lib/store/types";

export interface OpActor {
  id: ObjectId | null;
  name: string | null;
}

export interface IterationRef {
  practiceId: ObjectId;
  iterationId: ObjectId;
  n: number;
  templateVersion: string;
}

type HistoryInput = Pick<ValueHistoryDoc, "kind" | "target" | "oldValue" | "newValue" | "rowSnapshot" | "detail"> & { source: Source };
type EventInput = Pick<PracticeEventDoc, "kind" | "detail" | "structuredDetail"> & { source?: Source };

/**
 * Indici progressivi per OPERAZIONE (non per registro): l'import compone creazione e salvataggio dei campi nella
 * stessa transazione, con più registri sullo stesso opKey (D-135). Il contesto è nuovo a ogni tentativo del callback.
 */
const counters = new WeakMap<OperationContext, { history: number; events: number }>();

export class OpLog {
  readonly history: ValueHistoryDoc[] = [];
  readonly events: PracticeEventDoc[] = [];

  constructor(
    private readonly ctx: OperationContext,
    private readonly actor: OpActor
  ) {}

  private next(kind: "history" | "events"): number {
    let c = counters.get(this.ctx);
    if (!c) counters.set(this.ctx, (c = { history: 0, events: 0 }));
    return c[kind]++;
  }

  /** Le voci di SISTEMA non hanno autore (userId null = automatismi, contratto §7). */
  field(it: IterationRef, revision: number, h: HistoryInput): void {
    const system = h.source === "SYSTEM";
    this.history.push({
      _id: new ObjectId(),
      operationId: this.ctx.operationId,
      opKey: this.ctx.opKey,
      changeIndex: this.next("history"),
      practiceId: it.practiceId,
      iterationId: it.iterationId,
      n: it.n,
      templateVersion: it.templateVersion,
      kind: h.kind,
      target: h.target,
      oldValue: h.oldValue,
      newValue: h.newValue,
      ...(h.rowSnapshot ? { rowSnapshot: h.rowSnapshot } : {}),
      ...(h.detail ? { detail: h.detail } : {}),
      actorId: system ? null : this.actor.id,
      actorName: system ? null : this.actor.name,
      source: h.source,
      timestamp: this.ctx.now,
      revision,
    });
  }

  event(it: Omit<IterationRef, "templateVersion">, e: EventInput): void {
    const source = e.source ?? "USER";
    this.events.push({
      _id: new ObjectId(),
      operationId: this.ctx.operationId,
      opKey: this.ctx.opKey,
      eventIndex: this.next("events"),
      practiceId: it.practiceId,
      iterationId: it.iterationId,
      n: it.n,
      kind: e.kind,
      actorId: source === "SYSTEM" ? null : this.actor.id,
      actorName: source === "SYSTEM" ? null : this.actor.name,
      source,
      timestamp: this.ctx.now,
      detail: e.detail,
      ...(e.structuredDetail ? { structuredDetail: e.structuredDetail } : {}),
    });
  }

  async flushHistory(): Promise<void> {
    if (this.history.length) await store.valueHistory(this.ctx.db).insertMany(this.history, { session: this.ctx.session });
  }

  async flushEvents(): Promise<void> {
    if (this.events.length) await store.events(this.ctx.db).insertMany(this.events, { session: this.ctx.session });
  }

  async flush(): Promise<void> {
    await this.flushHistory();
    await this.flushEvents();
  }
}
