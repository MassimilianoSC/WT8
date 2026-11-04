/**
 * Soglie degli alert configurabili dall'ADMIN (B6, D-46, contratto §6). Versionate in rule_config: ogni
 * modifica crea la versione n+1 (le soglie nuove valgono per gli alert non ancora emessi); `revision` del DTO
 * è il numero di versione. Default da src/data/alert-rules.json, caricati da bootstrapStore.
 */
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { TEMPLATE_IDS, type AlertRuleConfigDTO, type AlertRuleUpdateRequest, type TemplateId, type UserDTO } from "@/lib/contract";
import { visibleTemplates } from "@/lib/engines/access";
import { HttpError } from "@/lib/http-error";
import { ALERT_RULES, store } from "@/lib/store/db";
import { runOperation } from "@/lib/store/transaction";
import type { RuleConfigDoc } from "@/lib/store/types";
import type { StoreDeps } from "@/services/users-v2";

const ruleOf = (ruleId: string) => ALERT_RULES.find((r) => r.ruleId === ruleId);

function toDTO(doc: RuleConfigDoc): AlertRuleConfigDTO {
  return { templateId: doc.templateId, ruleId: doc.ruleId, label: ruleOf(doc.ruleId)?.label ?? doc.ruleId, days: doc.days, unit: doc.unit, revision: doc.version };
}

function assertTemplate(user: UserDTO, templateId: string | null | undefined): TemplateId {
  if (!templateId || !(TEMPLATE_IDS as readonly string[]).includes(templateId) || !visibleTemplates(user).includes(templateId as TemplateId)) {
    throw new HttpError("Template non trovato", 404);
  }
  return templateId as TemplateId;
}

/** Ultima versione di ogni soglia del template. */
export async function getAlertRules(db: Db, user: UserDTO, templateId: string | null): Promise<AlertRuleConfigDTO[]> {
  const t = assertTemplate(user, templateId);
  const docs = await store.ruleConfig(db).find({ templateId: t }).sort({ ruleId: 1, version: -1 }).toArray();
  const latest = new Map<string, RuleConfigDoc>();
  for (const d of docs) if (!latest.has(d.ruleId)) latest.set(d.ruleId, d);
  const order = ALERT_RULES.map((r) => r.ruleId);
  return [...latest.values()].sort((a, b) => order.indexOf(a.ruleId) - order.indexOf(b.ruleId)).map(toDTO);
}

/** PUT (solo ADMIN): nuova versione della soglia; 409 se `revision` non è l'ultima versione. */
export async function updateAlertRule(
  deps: StoreDeps,
  user: UserDTO,
  ruleId: string,
  templateId: string | null,
  body: AlertRuleUpdateRequest,
  operationId?: string
): Promise<AlertRuleConfigDTO> {
  if (!user.isAdmin) throw new HttpError("Solo l'ADMIN modifica le soglie degli alert", 403);
  const t = assertTemplate(user, templateId);
  const rule = ruleOf(ruleId);
  if (!rule || !rule.templates.includes(t)) throw new HttpError("Regola non trovata per questo gestore", 404);
  const { result } = await runOperation(deps.client, deps.db, { actorId: user.id, operationId, request: { ruleId, templateId: t, body } }, async (ctx) => {
    const latest = await store.ruleConfig(ctx.db).findOne({ templateId: t, ruleId }, { sort: { version: -1 }, session: ctx.session });
    if (!latest) throw new HttpError("Regola non trovata per questo gestore", 404);
    if (body.revision !== latest.version) {
      throw new HttpError("La soglia è stata modificata nel frattempo: ricarica e riprova", 409, { code: "REVISION_CONFLICT", currentRevision: latest.version });
    }
    const doc: RuleConfigDoc = {
      _id: new ObjectId(),
      templateId: t,
      ruleId,
      version: latest.version + 1,
      days: body.days,
      unit: latest.unit,
      enabled: latest.enabled,
      revision: latest.version + 1,
      updatedAt: ctx.now,
      updatedBy: ObjectId.isValid(user.id) ? new ObjectId(user.id) : null,
    };
    await store.ruleConfig(ctx.db).insertOne(doc, { session: ctx.session });
    return toDTO(doc);
  });
  return result;
}
