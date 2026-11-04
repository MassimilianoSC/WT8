/**
 * Accesso ad Andamento (contratto §15.1, §15.3): interruttore spento = 404 come una rotta che non esiste; acceso,
 * solo ADMIN o Direzione (permesso in più, D-193), gli altri 403.
 */
import type { UserDTO } from "@/lib/contract";
import { andamentoEnabled, canReadAndamento } from "@/lib/features";
import { HttpError } from "@/lib/http-error";

export function requireAndamento(user: UserDTO): void {
  if (!andamentoEnabled()) throw new HttpError("Non trovato", 404);
  if (!canReadAndamento(user)) throw new HttpError("Andamento riservato a ADMIN e Direzione", 403);
}
