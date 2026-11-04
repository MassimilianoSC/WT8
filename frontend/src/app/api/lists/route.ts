import { handle, json } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { getStoreDb } from "@/lib/store/db";
import { getLists } from "@/services/lists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/lists?templateId=&group= → ListDTO[] (contratto §6).
export const GET = handle(async (req) => {
  const user = await requireCurrentUser();
  const sp = new URL(req.url).searchParams;
  return json(await getLists(await getStoreDb(), user, { templateId: sp.get("templateId"), group: sp.get("group") }));
});
