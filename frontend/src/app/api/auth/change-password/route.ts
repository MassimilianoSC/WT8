import { handle, HttpError, json, parseBody } from "@/lib/api";
import { requireSessionUser } from "@/lib/auth-v2";
import { changePasswordSchema } from "@/lib/validators";
import { assertAttemptsAllowed, clearAttempts, LOGIN_LIMITS, recordAttempt } from "@/services/login-guard";
import { changePassword, storeDeps } from "@/services/users-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/change-password { currentPassword, newPassword } → { ok: true }. Unica rotta (con GET /api/me) aperta
 * durante il cambio obbligatorio (D-173), che chiude. 401 sessione assente o utente non più attivo, 422 password
 * nuova corta, 400 password attuale errata, 429 dopo 5 password attuali errate in 15 minuti (PR-22).
 */
export const POST = handle(async (req) => {
  const user = await requireSessionUser();
  const { currentPassword, newPassword } = await parseBody(req, changePasswordSchema);
  const deps = await storeDeps();
  const key = `change:${user.id}`;
  await assertAttemptsAllowed(deps.db, key, LOGIN_LIMITS.perEmail);
  try {
    await changePassword(deps, user.id, currentPassword, newPassword);
  } catch (e) {
    if (e instanceof HttpError && e.status === 400) await recordAttempt(deps.db, key);
    throw e;
  }
  await clearAttempts(deps.db, key);
  return json({ ok: true });
});
