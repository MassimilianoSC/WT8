import { handle, json } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { getStoreDb } from "@/lib/store/db";
import { getHistory, parseHistoryQuery } from "@/services/practices-v2/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/practices/{id}/history?iteration=&page=&view= → HistoryResponse (contratto §7).
export const GET = handle(async (req, { params }) => {
  const user = await requireCurrentUser();
  const q = parseHistoryQuery(new URL(req.url).searchParams);
  return json(await getHistory(await getStoreDb(), user, params.id, q));
});
