/**
 * Impostazioni di Andamento (contratto §15.3): soglia delle «pratiche ferme» in giorni di calendario. Lettura senza
 * scritture (documento assente = 30); modifica solo ADMIN, in transazione con la voce di audit (valore vecchio → nuovo).
 */
import { ObjectId, type Db } from "mongodb";
import type { AndamentoSettingsDTO, AndamentoSettingsUpdateRequest, UserDTO } from "@/lib/contract";
import { HttpError } from "@/lib/http-error";
import { store } from "@/lib/store/db";
import { runOperation } from "@/lib/store/transaction";
import type { AndamentoSettingsAuditDoc, AndamentoSettingsDoc } from "@/lib/store/types";
import type { StoreDeps } from "@/services/users-v2";
import { requireAndamento } from "./access";

export const SOGLIA_FERME_INIZIALE = 30;

export async function readAndamentoSettings(db: Db): Promise<AndamentoSettingsDTO> {
  const doc = await store.andamentoSettings(db).findOne({ _id: "global" });
  return {
    sogliaFermeGiorni: doc?.sogliaFermeGiorni ?? SOGLIA_FERME_INIZIALE,
    updatedAt: doc ? doc.updatedAt.toISOString() : null,
    updatedBy: doc?.updatedByName ?? null,
  };
}

/** GET: ADMIN o Direzione (interruttore spento 404). */
export async function getAndamentoSettings(db: Db, user: UserDTO): Promise<AndamentoSettingsDTO> {
  requireAndamento(user);
  const s = await readAndamentoSettings(db);
  // «Mai nomi» (§15): il nome di chi l'ha cambiata serve solo agli ADMIN, che gestiscono la soglia.
  return user.isAdmin ? s : { ...s, updatedBy: null };
}

/** PUT: solo ADMIN; audit solo se il valore cambia. */
export async function updateAndamentoSettings(deps: StoreDeps, user: UserDTO, input: AndamentoSettingsUpdateRequest): Promise<AndamentoSettingsDTO> {
  requireAndamento(user);
  if (!user.isAdmin) throw new HttpError("Solo un ADMIN cambia la soglia delle pratiche ferme", 403);
  await runOperation(deps.client, deps.db, { actorId: user.id, request: { andamentoSettings: input } }, async (ctx) => {
    const before = await store.andamentoSettings(ctx.db).findOne({ _id: "global" }, { session: ctx.session });
    const oldValue = before?.sogliaFermeGiorni ?? SOGLIA_FERME_INIZIALE;
    if (before && oldValue === input.sogliaFermeGiorni) return null;
    const doc: AndamentoSettingsDoc = {
      _id: "global",
      sogliaFermeGiorni: input.sogliaFermeGiorni,
      revision: (before?.revision ?? 0) + 1,
      updatedAt: ctx.now,
      updatedBy: new ObjectId(user.id),
      updatedByName: user.name,
    };
    await store.andamentoSettings(ctx.db).replaceOne({ _id: "global" }, doc, { upsert: true, session: ctx.session });
    if (oldValue !== input.sogliaFermeGiorni) {
      const audit: AndamentoSettingsAuditDoc = {
        _id: new ObjectId(),
        kind: "ANDAMENTO_SETTINGS",
        actorId: new ObjectId(user.id),
        actorName: user.name,
        at: ctx.now,
        operationId: ctx.operationId,
        changes: [{ field: "sogliaFermeGiorni", oldValue, newValue: input.sogliaFermeGiorni }],
      };
      await store.auditLog(ctx.db).insertOne(audit, { session: ctx.session });
    }
    return null;
  });
  return readAndamentoSettings(deps.db);
}
