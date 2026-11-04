import { handle, json, parseBody } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { alertRuleUpdateRequestSchema } from "@/lib/validators";
import { storeDeps } from "@/services/users-v2";
import { updateAlertRule } from "@/services/alert-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PUT /api/alert-rules/{ruleId}?templateId= { days; revision } → AlertRuleConfigDTO (solo ADMIN, D-46).
export const PUT = handle(async (req, { params }) => {
  const user = await requireCurrentUser();
  const body = await parseBody(req, alertRuleUpdateRequestSchema);
  const templateId = new URL(req.url).searchParams.get("templateId");
  return json(await updateAlertRule(await storeDeps(), user, params.ruleId, templateId, body));
});
