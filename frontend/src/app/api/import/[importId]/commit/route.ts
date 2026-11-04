import { handle, json, parseBody } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { importCommitRequestSchema } from "@/lib/validators";
import { commitImport } from "@/services/import-v2/commit";
import { assertAdmin } from "@/services/import-v2/preview";
import { storeDeps } from "@/services/users-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/import/{importId}/commit { operationId; choices? } → ImportResultDTO (contratto §12, D-49; solo ADMIN).
export const POST = handle(async (req, { params }) => {
  const user = await requireCurrentUser();
  assertAdmin(user);
  const body = await parseBody(req, importCommitRequestSchema);
  return json(await commitImport(await storeDeps(), user, params.importId, body));
});
