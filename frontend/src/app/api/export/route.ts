import { handle } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { getStoreDb } from "@/lib/store/db";
import { exportPractices, parseExportQuery } from "@/services/practices-v2/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/export?templateId=&stato=&archived=&q= → text/csv (contratto §11, D-48).
export const GET = handle(async (req) => {
  const user = await requireCurrentUser();
  const file = await exportPractices(await getStoreDb(), user, parseExportQuery(new URL(req.url).searchParams));
  return new Response(file.body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
