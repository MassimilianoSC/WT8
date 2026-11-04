import { handle, json } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { province } from "@/lib/istat/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/istat/province → IstatItemDTO[] (contratto §6); 503 finché il dataset non è caricato.
export const GET = handle(async (req) => {
  await requireCurrentUser();
  return json(province(new URL(req.url).searchParams.get("regione")));
});
