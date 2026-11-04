import { handle, json } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { getStoreDb } from "@/lib/store/db";
import { getWorkload, parseWorkloadQuery } from "@/services/practices-v2/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/workload?templateId=&group= → WorkloadResponse (contratto §10, D-23).
export const GET = handle(async (req) => {
  const user = await requireCurrentUser();
  return json(await getWorkload(await getStoreDb(), user, parseWorkloadQuery(new URL(req.url).searchParams)));
});
