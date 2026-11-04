import { handle, HttpError, json } from "@/lib/api";
import { tokenPasswordSchema } from "@/lib/validators";
import { setPasswordWithToken, storeDeps } from "@/services/users-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/reset-password { token, password } → { email }. 400 link non valido o scaduto (anche senza token),
 * 422 password corta, 404 account non trovato o disattivato. Il token è casuale a 256 bit: nessun limite ai tentativi.
 */
export const POST = handle(async (req) => {
  const raw: unknown = await req.json().catch(() => ({}));
  const token = (raw as { token?: unknown } | null)?.token;
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) throw new HttpError("Il link non è valido o è scaduto", 400);
  const parsed = tokenPasswordSchema.safeParse(raw);
  if (!parsed.success) throw new HttpError(parsed.error.issues.map((i) => i.message).join(", "), 422);
  return json(await setPasswordWithToken(await storeDeps(), token, parsed.data.password, "reset"));
});
