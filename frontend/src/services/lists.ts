/**
 * Liste e configurazione (B6, contratto §6, D-40, D-86, D-100, D-106) sul database _v2.
 * Le liste iniziali arrivano da src/data/templates/lists-initial.json (generato col compilatore) e si caricano
 * con bootstrapStore ($setOnInsert: mai sopra le modifiche dei leader, lib/store/db.ts).
 */
import type { ClientSession, Db } from "mongodb";
import { TEMPLATE_IDS, type GroupId, type ListDTO, type ListItemDTO, type ListUpdateRequest, type TemplateId, type UserDTO } from "@/lib/contract";
import { listEditable, visibleTemplates } from "@/lib/engines/access";
import { HttpError } from "@/lib/http-error";
import { DERIVED_LISTS, deriveItems } from "@/lib/lists/catalog";
import { store } from "@/lib/store/db";
import { runOperation, type OperationContext } from "@/lib/store/transaction";
import type { ListDoc } from "@/lib/store/types";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";
import type { StoreDeps } from "@/services/users-v2";

const CODE_RX = /^[A-Z0-9][A-Z0-9_]*$/;

export function toListDTO(l: ListDoc, user: UserDTO): ListDTO {
  return {
    listId: l.listId,
    label: l.label,
    kind: l.kind,
    templateId: l.templateId,
    group: l.group,
    items: [...l.items].sort((a, b) => a.order - b.order),
    editable: listEditable(user, l),
    revision: l.revision,
  };
}

/** GET /api/lists?templateId=&group=: liste dei template visibili (o di quello richiesto) più le comuni. */
export async function getLists(db: Db, user: UserDTO, q: { templateId?: string | null; group?: string | null }): Promise<ListDTO[]> {
  const visible = visibleTemplates(user);
  let templates: TemplateId[] = visible;
  if (q.templateId) {
    if (!(TEMPLATE_IDS as readonly string[]).includes(q.templateId) || !visible.includes(q.templateId as TemplateId)) {
      throw new HttpError("Template non trovato", 404);
    }
    templates = [q.templateId as TemplateId];
  }
  const docs = await store.lists(db)
    .find({ $or: [{ templateId: { $in: templates } }, { templateId: null }], ...(q.group ? { group: q.group as GroupId } : {}) })
    .sort({ templateId: 1, listId: 1 })
    .toArray();
  return docs.map((d) => toListDTO(d, user));
}

/* ---------- codici in uso (D-106) ---------- */

/** flowId che usano la lista, per template (lista comune → tutti i template). */
function flowIdsUsing(listId: string, templateId: TemplateId | null): Array<{ templateId: TemplateId; flowIds: string[] }> {
  const ids = templateId ? [templateId] : [...TEMPLATE_IDS];
  return ids.map((t) => ({
    templateId: t,
    flowIds: COMPILED_TEMPLATES[t].template.occurrences.filter((o) => o.kind === "MASTER" && o.list?.listId === listId).map((o) => o.flowId!),
  }));
}

/** Codici, tra quelli dati, salvati in almeno una pratica (valori, righe ripetibili, vincoli). */
export async function usedCodes(db: Db, listId: string, templateId: TemplateId | null, codes: string[], session?: ClientSession): Promise<string[]> {
  if (codes.length === 0) return [];
  const used = new Set<string>();
  const constraintField = listId.startsWith("STATO_VINCOLO_") ? "constraint.stato.code" : listId.startsWith("ENTE_VINCOLO_") ? "constraint.ente.code" : null;
  for (const { templateId: t, flowIds } of flowIdsUsing(listId, templateId)) {
    if (flowIds.length === 0 && !constraintField) continue;
    const practiceIds = await store.practices(db).distinct("_id", { templateId: t }, { session });
    if (practiceIds.length === 0) continue;
    for (const code of codes) {
      if (used.has(code)) continue;
      const byValue = flowIds.map((f) => ({ [`values.${f}.code`]: code }));
      const inIterations = byValue.length
        ? await store.iterations(db).countDocuments({ practiceId: { $in: practiceIds }, $or: byValue }, { session, limit: 1 })
        : 0;
      const rowFilter = [...byValue, ...(constraintField ? [{ [constraintField]: code }] : [])];
      const inRows = rowFilter.length
        ? await store.repeatRows(db).countDocuments({ practiceId: { $in: practiceIds }, $or: rowFilter }, { session, limit: 1 })
        : 0;
      if (inIterations + inRows > 0) used.add(code);
    }
  }
  return codes.filter((c) => used.has(c));
}

/* ---------- aggiornamento ---------- */

function validateItems(current: ListDoc, items: ListItemDTO[]): void {
  const codes = items.map((i) => i.code);
  if (new Set(codes).size !== codes.length) throw new HttpError("Codici ripetuti nella lista", 422);
  if (current.kind === "CONTROLLED") {
    // Liste controllate: stessi codici, stesso ordine e stato; cambia solo l'etichetta (§6).
    const before = [...current.items].sort((a, b) => a.order - b.order);
    const after = [...items].sort((a, b) => a.order - b.order);
    const same = before.length === after.length && before.every((b, i) => b.code === after[i].code && b.active === after[i].active && b.order === after[i].order);
    if (!same) throw new HttpError("Lista controllata: si possono cambiare solo le etichette", 422);
    return;
  }
  for (const i of items) {
    if (!CODE_RX.test(i.code)) throw new HttpError(`Codice non valido: ${i.code} (maiuscole, cifre e _)`, 422);
    if (i.code === "ALTRO") throw new HttpError("\"Altro\" non è una voce della lista: si attiva sul campo (D-100)", 422);
  }
}

/** Riallinea le liste derivate che dipendono da `listId` nello stesso template (D-86). */
async function realignDerived(ctx: OperationContext, templateId: TemplateId | null, listId: string): Promise<void> {
  if (!templateId) return;
  for (const [derived, sources] of Object.entries(DERIVED_LISTS)) {
    if (!sources.includes(listId)) continue;
    const docs = await store.lists(ctx.db).find({ templateId, listId: { $in: [derived, ...sources] } }, { session: ctx.session }).toArray();
    const target = docs.find((d) => d.listId === derived);
    if (!target) continue;
    const sourceItems = sources.flatMap((s) => [...(docs.find((d) => d.listId === s)?.items ?? [])].sort((a, b) => a.order - b.order));
    await store.lists(ctx.db).updateOne(
      { _id: target._id },
      { $set: { items: deriveItems(sourceItems, target.items), updatedAt: ctx.now }, $inc: { revision: 1 } },
      { session: ctx.session }
    );
  }
}

/** PUT /api/lists/{listId}?templateId= (contratto §6, D-106). */
export async function updateList(
  deps: StoreDeps,
  user: UserDTO,
  listId: string,
  templateId: string | null,
  body: ListUpdateRequest,
  operationId?: string
): Promise<ListDTO> {
  const tid = templateId && (TEMPLATE_IDS as readonly string[]).includes(templateId) ? (templateId as TemplateId) : null;
  if (templateId && !tid) throw new HttpError("Template non trovato", 404);
  const { result } = await runOperation(deps.client, deps.db, { actorId: user.id, operationId, request: { listId, templateId: tid, body } }, async (ctx) => {
    const current = await store.lists(ctx.db).findOne({ templateId: tid, listId }, { session: ctx.session });
    if (!current || (tid && !visibleTemplates(user).includes(tid))) throw new HttpError("Lista non trovata", 404);
    if (!listEditable(user, current)) throw new HttpError("Non puoi modificare questa lista", 403);
    if (body.revision !== current.revision) {
      throw new HttpError("La lista è stata modificata nel frattempo: ricarica e riprova", 409, { code: "REVISION_CONFLICT", currentRevision: current.revision });
    }
    validateItems(current, body.items);
    const removed = current.items.map((i) => i.code).filter((c) => !body.items.some((i) => i.code === c));
    const blocked = await usedCodes(ctx.db, listId, tid, removed, ctx.session);
    if (blocked.length) {
      throw new HttpError(`Codici usati in pratiche: non si tolgono, si disattivano (${blocked.join(", ")})`, 422, { usedCodes: blocked });
    }
    const updated = await store.lists(ctx.db).findOneAndUpdate(
      { _id: current._id, revision: current.revision },
      { $set: { items: body.items.map((i, n) => ({ ...i, order: i.order ?? n + 1 })), updatedAt: ctx.now }, $inc: { revision: 1 } },
      { session: ctx.session, returnDocument: "after" }
    );
    if (!updated) throw new HttpError("La lista è stata modificata nel frattempo: ricarica e riprova", 409, { code: "REVISION_CONFLICT" });
    await realignDerived(ctx, tid, listId);
    return toListDTO(updated, user);
  });
  return result;
}

export const __test = { validateItems };
