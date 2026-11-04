import { handle, json } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { listTemplates } from "@/services/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/templates → TemplateSummaryDTO[] (contratto §3).
export const GET = handle(async () => {
  await requireCurrentUser();
  return json(listTemplates());
});
