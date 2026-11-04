import { handle, json, parseBody } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { getStoreDb } from "@/lib/store/db";
import { andamentoSettingsUpdateRequestSchema } from "@/lib/validators";
import { requireAndamento } from "@/services/andamento/access";
import { getAndamentoSettings, updateAndamentoSettings } from "@/services/andamento/settings";
import { storeDeps } from "@/services/users-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/andamento/settings (ADMIN e Direzione) → AndamentoSettingsDTO (§15.3). Interruttore spento: 404.
export const GET = handle(async () => {
  const user = await requireCurrentUser();
  return json(await getAndamentoSettings(await getStoreDb(), user));
});

// PUT /api/andamento/settings (solo ADMIN) { sogliaFermeGiorni } → AndamentoSettingsDTO; 422 fuori 1–365; audit.
export const PUT = handle(async (req) => {
  const user = await requireCurrentUser();
  requireAndamento(user); // 404 / 403 prima di leggere il corpo
  const body = await parseBody(req, andamentoSettingsUpdateRequestSchema);
  return json(await updateAndamentoSettings(await storeDeps(), user, body));
});
