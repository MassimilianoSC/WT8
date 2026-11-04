import { handle, HttpError, json } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { getStoreDb } from "@/lib/store/db";
import { getPracticeDetail } from "@/services/practices-v2/read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/practices/{id}/iterations/{n} → PraticaDetailDTO di un'iterazione (passata o corrente, contratto §5).
export const GET = handle(async (_req, { params }) => {
  const user = await requireCurrentUser();
  const n = Number(params.n);
  if (!Number.isInteger(n) || n < 1) throw new HttpError("Iterazione non trovata", 404);
  return json(await getPracticeDetail(await getStoreDb(), user, params.id, n));
});
