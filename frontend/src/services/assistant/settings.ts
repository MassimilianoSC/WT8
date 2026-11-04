/**
 * Impostazioni globali dell'assistente (contratto §13.1, D-169, D-171): interruttore degli ADMIN e limiti personali.
 * Lettura senza scritture (documento assente = valori iniziali da .env); modifica solo ADMIN, in transazione con la
 * voce di audit (valori vecchi → nuovi). Nessuna cache: effetto immediato sulle richieste successive.
 */
import { ObjectId, type Db } from "mongodb";
import type { UserDTO } from "@/lib/contract";
import { HttpError } from "@/lib/http-error";
import { store } from "@/lib/store/db";
import { assistantSettingsUpdateRequestSchema } from "@/lib/validators";
import { runOperation } from "@/lib/store/transaction";
import type { AssistantSettingsAuditDoc, AssistantSettingsDoc } from "@/lib/store/types";
import type { StoreDeps } from "@/services/users-v2";
import { assistantConfig, type AssistantConfig } from "./config";
import type { AssistantSettingsDTO, AssistantSettingsUpdateRequest } from "@/lib/contract";

export interface EffectiveSettings {
  enabled: boolean;
  dailyLimit: number;
  perMinuteLimit: number;
  revision: number;
  updatedAt: Date | null;
  updatedByName: string | null;
}

export async function readSettings(db: Db, cfg: AssistantConfig = assistantConfig()): Promise<EffectiveSettings> {
  const doc = await store.assistantSettings(db).findOne({ _id: "global" });
  if (!doc) return { enabled: true, dailyLimit: cfg.initialDailyLimit, perMinuteLimit: cfg.initialPerMinuteLimit, revision: 0, updatedAt: null, updatedByName: null };
  return { enabled: doc.enabled, dailyLimit: doc.dailyLimit, perMinuteLimit: doc.perMinuteLimit, revision: doc.revision, updatedAt: doc.updatedAt, updatedByName: doc.updatedByName };
}

function toDTO(s: EffectiveSettings, cfg: AssistantConfig): AssistantSettingsDTO {
  return {
    enabled: s.enabled,
    dailyLimit: s.dailyLimit,
    perMinuteLimit: s.perMinuteLimit,
    technicalEnabled: cfg.technicalEnabled,
    updatedAt: s.updatedAt ? s.updatedAt.toISOString() : null,
    updatedBy: s.updatedByName,
  };
}

const requireAdmin = (u: UserDTO) => {
  if (!u.isAdmin) throw new HttpError("Solo un ADMIN gestisce l'assistente", 403);
};

export async function getSettings(db: Db, user: UserDTO, cfg: AssistantConfig = assistantConfig()): Promise<AssistantSettingsDTO> {
  requireAdmin(user);
  return toDTO(await readSettings(db, cfg), cfg);
}


/** PUT delle impostazioni (ADMIN). 422 fuori intervallo (dallo schema nella rotta); audit solo dei campi cambiati. */
export async function updateSettings(deps: StoreDeps, user: UserDTO, input: AssistantSettingsUpdateRequest, cfg: AssistantConfig = assistantConfig()): Promise<AssistantSettingsDTO> {
  requireAdmin(user);
  const parsed = assistantSettingsUpdateRequestSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(parsed.error.issues.map((i) => i.message).join(", "), 422);
  const body = parsed.data;
  const { result } = await runOperation(deps.client, deps.db, { actorId: user.id, request: { assistantSettings: body } }, async (ctx) => {
    const before = await store.assistantSettings(ctx.db).findOne({ _id: "global" }, { session: ctx.session });
    const old = before ?? { enabled: true, dailyLimit: cfg.initialDailyLimit, perMinuteLimit: cfg.initialPerMinuteLimit, revision: 0 };
    const next = {
      enabled: body.enabled ?? old.enabled,
      dailyLimit: body.dailyLimit ?? old.dailyLimit,
      perMinuteLimit: body.perMinuteLimit ?? old.perMinuteLimit,
    };
    const changes = (["enabled", "dailyLimit", "perMinuteLimit"] as const)
      .filter((f) => next[f] !== old[f])
      .map((field) => ({ field, oldValue: old[field], newValue: next[field] }));
    if (changes.length === 0 && before) return { ...next, revision: before.revision, updatedAt: before.updatedAt, updatedByName: before.updatedByName };
    const doc: AssistantSettingsDoc = { _id: "global", ...next, revision: old.revision + 1, updatedAt: ctx.now, updatedBy: new ObjectId(user.id), updatedByName: user.name };
    await store.assistantSettings(ctx.db).replaceOne({ _id: "global" }, doc, { upsert: true, session: ctx.session });
    if (changes.length > 0) {
      const audit: AssistantSettingsAuditDoc = {
        _id: new ObjectId(),
        kind: "ASSISTANT_SETTINGS",
        actorId: new ObjectId(user.id),
        actorName: user.name,
        at: ctx.now,
        operationId: ctx.operationId,
        changes,
      };
      await store.auditLog(ctx.db).insertOne(audit, { session: ctx.session });
    }
    return { ...next, revision: doc.revision, updatedAt: doc.updatedAt, updatedByName: doc.updatedByName };
  });
  return toDTO(result, cfg);
}
