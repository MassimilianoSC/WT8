import { handle, HttpError, json } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { getStoreDb } from "@/lib/store/db";
import { deletePractice } from "@/services/practices-v2/commands";
import { getPracticeDetail } from "@/services/practices-v2/read";
import { storeDeps } from "@/services/users-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/practices/{id} → PraticaDetailDTO dell'iterazione corrente (§5).
export const GET = handle(async (_req, { params }) => {
  const user = await requireCurrentUser();
  return json(await getPracticeDetail(await getStoreDb(), user, params.id));
});

// DELETE /api/practices/{id}?revision=&operationId= → 204. Solo in CREATA e con una sola iterazione (§5.3, D-27).
export const DELETE = handle(async (req, { params }) => {
  const user = await requireCurrentUser();
  const q = new URL(req.url).searchParams;
  const revision = Number(q.get("revision"));
  if (!q.get("revision") || !Number.isInteger(revision) || revision < 0) throw new HttpError("revision obbligatoria (intero)", 422);
  const operationId = q.get("operationId") ?? undefined;
  if (operationId !== undefined && !/^[0-9a-f-]{36}$/i.test(operationId)) throw new HttpError("operationId non valida", 422);
  await deletePractice(await storeDeps(), user, params.id, { revision, operationId });
  return new Response(null, { status: 204 });
});
