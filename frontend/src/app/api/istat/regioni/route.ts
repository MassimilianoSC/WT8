import { handle, json } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { regioni } from "@/lib/istat/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/istat/regioni → IstatItemDTO[] (contratto §6); 503 finché il dataset non è caricato.
export const GET = handle(async () => {
  await requireCurrentUser();
  return json(regioni());
});
