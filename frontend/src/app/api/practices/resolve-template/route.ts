import { handle, json, parseBody } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { resolveTemplate } from "@/lib/engines/resolve-template";
import { resolveTemplateRequestSchema } from "@/lib/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/practices/resolve-template { committente; clienteFinale } → ResolveTemplateResponse (D-16).
export const POST = handle(async (req) => {
  await requireCurrentUser();
  const body = await parseBody(req, resolveTemplateRequestSchema);
  return json(resolveTemplate(body));
});
