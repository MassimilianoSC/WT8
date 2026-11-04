/**
 * Interruttori delle funzioni in preparazione (contratto §15.1, D-192). Letti a ogni chiamata: per accenderli basta
 * la variabile in deploy/.env e un riavvio. Spento è il valore predefinito: il codice c'è ma resta inerte.
 */
import type { FeaturesDTO, UserDTO } from "@/lib/contract";

/** Andamento e profilo Direzione (§15): solo con PH_ANDAMENTO=true. */
export function andamentoEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PH_ANDAMENTO === "true";
}

export function features(env: NodeJS.ProcessEnv = process.env): FeaturesDTO {
  return { andamento: andamentoEnabled(env) };
}

/**
 * Profilo Direzione effettivo (§15.2): utente attivo con direzione e interruttore acceso. `UserDTO.direzione` è già
 * falso a interruttore spento (toUserDTO); il controllo qui è una seconda cintura.
 */
export function isDirezione(u: Pick<UserDTO, "status" | "direzione">, env: NodeJS.ProcessEnv = process.env): boolean {
  return andamentoEnabled(env) && u.status === "active" && u.direzione === true;
}

/** Chi legge Andamento (§15.3): ADMIN o Direzione, attivi. */
export function canReadAndamento(u: Pick<UserDTO, "status" | "isAdmin" | "direzione">, env: NodeJS.ProcessEnv = process.env): boolean {
  return u.status === "active" && (u.isAdmin || isDirezione(u, env));
}
