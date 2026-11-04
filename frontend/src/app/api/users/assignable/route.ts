import { handle, HttpError, json } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { ROLE_IDS, TEMPLATE_IDS, type RoleId, type TemplateId } from "@/lib/contract";
import { getStoreDb } from "@/lib/store/db";
import { assignableUsers } from "@/services/users-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/users/assignable?templateId=&role= → AssignableUserDTO[] (§4, D-39): utenti attivi con quell'appartenenza.
export const GET = handle(async (req) => {
  await requireCurrentUser();
  const q = new URL(req.url).searchParams;
  const templateId = q.get("templateId");
  const role = q.get("role");
  if (!templateId || !(TEMPLATE_IDS as readonly string[]).includes(templateId)) throw new HttpError("templateId non valido", 400);
  if (!role || !(ROLE_IDS as readonly string[]).includes(role)) throw new HttpError("role non valido", 400);
  return json(await assignableUsers(await getStoreDb(), templateId as TemplateId, role as RoleId));
});
