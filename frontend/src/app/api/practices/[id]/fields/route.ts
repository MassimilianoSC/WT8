import { handle, json, parseBody } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import type { FieldChangeRequest } from "@/lib/contract";
import { fieldChangeRequestStructSchema } from "@/lib/validators";
import { patchFields } from "@/services/practices-v2/fields";
import { storeDeps } from "@/services/users-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/practices/{id}/fields { iteration; revision; changes; operationId? } → FieldChangeResponse (contratto §5.2).
// Qui solo la struttura (D-132 P-06): i valori li valida il servizio dopo 404, iterazione e permessi.
export const PATCH = handle(async (req, { params }) => {
  const user = await requireCurrentUser();
  const body = await parseBody(req, fieldChangeRequestStructSchema);
  return json(await patchFields(await storeDeps(), user, params.id, body as FieldChangeRequest));
});
