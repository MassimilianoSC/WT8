import { handle, json } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { getStoreDb } from "@/lib/store/db";
import { getAlertRules } from "@/services/alert-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/alert-rules?templateId= → AlertRuleConfigDTO[] (contratto §6, D-46).
export const GET = handle(async (req) => {
  const user = await requireCurrentUser();
  return json(await getAlertRules(await getStoreDb(), user, new URL(req.url).searchParams.get("templateId")));
});
