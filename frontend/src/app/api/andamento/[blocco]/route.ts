import { handle, json } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { getStoreDb } from "@/lib/store/db";
import { andamentoResponse } from "@/services/andamento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/andamento/{blocco}?templateId=&from=&to=&granularity=week|month (ferme: ?templateId=&stato=) → DTO del
// blocco (§15.3); &format=csv → text/csv (&tabella= per le tabelle secondarie). ADMIN e Direzione; altri 403;
// interruttore spento o blocco sconosciuto 404; filtri non validi 400.
export const GET = handle(async (req, { params }) => {
  const user = await requireCurrentUser();
  const r = await andamentoResponse(await getStoreDb(), user, params.blocco, new URL(req.url).searchParams);
  if ("json" in r) return json(r.json);
  return new Response(r.csv.body, {
    status: 200,
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${r.csv.filename}"`, "Cache-Control": "no-store" },
  });
});
