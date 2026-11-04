import { ApiError } from "@/lib/client";

/**
 * Messages of the access pages: always Italian, never the server's text
 * (the beta answers in English, and wording may change). They depend only on
 * the flow and on the HTTP status of POST /api/auth/* (see the note on the
 * cutover-o3 branch): 400 invalid or expired link / wrong current password,
 * 401 session expired, 404 account not found or deactivated, 422 invalid
 * input (password too short, bad email), 429 too many attempts (with
 * retryAfterSeconds in the body, cutover 3.5).
 */
export type AuthFlow = "login" | "invite" | "reset" | "forgot" | "change";

export const PASSWORD_RULE = "La password deve avere almeno 8 caratteri.";
export const GENERIC_ERROR = "Non è stato possibile completare l'operazione. Riprova tra poco.";
const TOO_MANY = "Troppi tentativi: riprova tra qualche minuto.";

/** 429: the wait from retryAfterSeconds, rounded up to minutes; without it, "qualche minuto". */
function tooMany(err: unknown): string {
  const s = err instanceof ApiError ? (err.body as { retryAfterSeconds?: unknown } | null)?.retryAfterSeconds : undefined;
  if (typeof s !== "number" || !Number.isFinite(s) || s <= 0) return TOO_MANY;
  const minutes = Math.ceil(s / 60);
  return `Troppi tentativi: riprova tra ${minutes === 1 ? "1 minuto" : `${minutes} minuti`}.`;
}
const ACCOUNT_MISSING = "Account non trovato o disattivato: scrivi a operations@hqe.it.";

const LINK_INVALID: Record<"invite" | "reset", string> = {
  invite: "Il link non è più valido: chiedi all'amministratore di reinviare l'invito.",
  reset: "Il link non è più valido: richiedi un nuovo link da \"Password dimenticata?\".",
};

export function authErrorMessage(flow: AuthFlow, err: unknown): string {
  const status = err instanceof ApiError ? err.status : 0;
  if (status === 429) return tooMany(err);
  switch (flow) {
    case "login":
      return status === 0 ? GENERIC_ERROR : "Email o password non validi.";
    case "invite":
    case "reset":
      if (status === 400) return LINK_INVALID[flow];
      if (status === 404) return ACCOUNT_MISSING;
      if (status === 422) return PASSWORD_RULE;
      return GENERIC_ERROR;
    case "forgot":
      if (status === 422) return "Inserisci un indirizzo email valido.";
      return GENERIC_ERROR;
    case "change":
      if (status === 400) return "La password attuale non è corretta.";
      if (status === 401) return "Sessione scaduta: accedi di nuovo.";
      if (status === 404) return ACCOUNT_MISSING;
      if (status === 422) return PASSWORD_RULE;
      return GENERIC_ERROR;
  }
}

/** PR-22: after 5 wrong passwords for an email the login is refused for 15 minutes, even with the right one. */
export const LOGIN_LOCKED = "Troppi tentativi: riprova tra 15 minuti. Se hai dimenticato la password usa 'Password dimenticata?'.";

/**
 * next-auth signIn result: code "troppi_tentativi" (PR-22) has its own text;
 * a failed credentials check is "wrong email or password"; anything else is generic.
 */
export function loginErrorMessage(error: string | null | undefined, code?: string | null): string | null {
  if (!error) return null;
  if (code === "troppi_tentativi") return LOGIN_LOCKED;
  return error === "CredentialsSignin" ? "Email o password non validi." : GENERIC_ERROR;
}

/** The link's own text, also used before submitting when the token is missing. */
export function invalidLinkMessage(flow: "invite" | "reset"): string {
  return LINK_INVALID[flow];
}
