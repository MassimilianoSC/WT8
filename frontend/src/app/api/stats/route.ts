import { handle, json } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { getStoreDb } from "@/lib/store/db";
import { getStats, parseStatsQuery } from "@/services/practices-v2/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/stats?templateId=&from=&to= (PM del template e ADMIN; altri 403) → StatsResponse (§9). Default: 30 giorni.
export const GET = handle(async (req) => {
  const user = await requireCurrentUser();
  return json(await getStats(await getStoreDb(), user, parseStatsQuery(new URL(req.url).searchParams)));
});
