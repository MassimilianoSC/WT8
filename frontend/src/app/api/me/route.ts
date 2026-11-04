import { handle, json } from "@/lib/api";
import { requireSessionUser } from "@/lib/auth-v2";
import { loadMeDTO } from "@/lib/current-user";
import { getStoreDb } from "@/lib/store/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me -> MeDTO (contratto §4), con mustChangePassword (D-173): resta aperta durante il cambio obbligatorio.
// 401 senza sessione o se l'utente non è più attivo. "assistant" (§13.1): assente se l'assistente è spento
// tecnicamente; la lettura non crea contatori e un suo errore non impedisce la risposta.
export const GET = handle(async () => {
  const user = await requireSessionUser();
  return json(await loadMeDTO(await getStoreDb(), user));
});
