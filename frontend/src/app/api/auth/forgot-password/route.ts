import { handle, json, parseBody } from "@/lib/api";
import { forgotPasswordSchema } from "@/lib/validators";
import { assertAttemptsAllowed, LOGIN_LIMITS, recordAttempt } from "@/services/login-guard";
import { requestPasswordReset, storeDeps } from "@/services/users-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/forgot-password { email } → { ok: true } sempre, per non rivelare quali email esistono. 422 email
 * non valida; 429 dopo 5 richieste per la stessa email in 15 minuti (niente raffiche di mail, PR-22).
 */
export const POST = handle(async (req) => {
  const { email } = await parseBody(req, forgotPasswordSchema);
  const deps = await storeDeps();
  const key = `forgot:${email.toLowerCase()}`;
  await assertAttemptsAllowed(deps.db, key, LOGIN_LIMITS.perEmail);
  await recordAttempt(deps.db, key);
  await requestPasswordReset(deps, email);
  return json({ ok: true });
});
