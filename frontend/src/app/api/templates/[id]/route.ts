import { handle, json } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { getTemplate } from "@/services/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/templates/{id}[?version=] → TemplateDTO (contratto §3).
export const GET = handle(async (req, { params }) => {
  await requireCurrentUser();
  const version = new URL(req.url).searchParams.get("version");
  return json(await getTemplate(params.id, version));
});
