import { handle, json, parseBody } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { getStoreDb } from "@/lib/store/db";
import { createPracticeRequestSchema } from "@/lib/validators";
import { createPractice } from "@/services/practices-v2/commands";
import { listPractices, parseListQuery } from "@/services/practices-v2/list";
import { storeDeps } from "@/services/users-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/practices?templateId=&stato=&archived=&q=&scope=&sort=&page=&from=&to= → PagedDTO<PraticaSummaryDTO> (§5.1).
export const GET = handle(async (req) => {
  const user = await requireCurrentUser();
  return json(await listPractices(await getStoreDb(), user, parseListQuery(new URL(req.url).searchParams)));
});

// POST /api/practices → PraticaDetailDTO (201). Solo PM e ADMIN (D-20); 422 senza PM leader attivo (D-101).
export const POST = handle(async (req) => {
  const user = await requireCurrentUser();
  const body = await parseBody(req, createPracticeRequestSchema);
  return json(await createPractice(await storeDeps(), user, body), 201);
});
