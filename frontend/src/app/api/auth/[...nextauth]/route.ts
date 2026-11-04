import type { NextRequest } from "next/server";
import { handlers } from "@/lib/auth";

export const runtime = "nodejs";

/** Cookie CSRF di Auth.js (con o senza prefisso __Host- su HTTPS). */
const CSRF_COOKIE = /^(__Host-)?(authjs|next-auth)\.csrf-token=/;

/**
 * D-143 (MissingCSRF al primo accesso): senza cookie, Auth.js crea un token CSRF nuovo a OGNI richiesta, compresa
 * GET /api/auth/session che SessionProvider fa al caricamento della pagina. Se l'utente accede subito, quella risposta
 * arriva dopo quella di GET /api/auth/csrf usata dal login e sostituisce il cookie: il token del modulo non corrisponde
 * più e il primo tentativo fallisce. Il cookie CSRF lo emette solo /csrf (e le altre azioni che ne hanno bisogno):
 * dalla risposta di /session si toglie. La verifica CSRF del login resta invariata.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const res = await handlers.GET(req);
  if (!req.nextUrl.pathname.endsWith("/session")) return res;
  const cookies = res.headers.getSetCookie();
  if (!cookies.some((c) => CSRF_COOKIE.test(c))) return res;
  const headers = new Headers(res.headers);
  headers.delete("set-cookie");
  for (const c of cookies) if (!CSRF_COOKIE.test(c)) headers.append("set-cookie", c);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export const POST = handlers.POST;
