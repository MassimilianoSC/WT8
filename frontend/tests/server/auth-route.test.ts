// @vitest-environment node
/**
 * D-143: MissingCSRF al primo accesso. GET /api/auth/session non deve emettere il cookie CSRF (lo fa solo /csrf),
 * altrimenti al caricamento della pagina sostituisce quello appena dato al modulo di login.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

type Route = typeof import("@/app/api/auth/[...nextauth]/route");
let route: Route;

beforeAll(async () => {
  process.env.AUTH_SECRET ??= "segreto-di-prova-solo-per-i-test-0123456789";
  route = await import("@/app/api/auth/[...nextauth]/route");
});

const get = (path: string, cookie?: string) =>
  route.GET(new NextRequest(`http://127.0.0.1:3999/api/auth/${path}`, { headers: cookie ? { cookie } : {} }));
const csrfCookies = (res: Response) => res.headers.getSetCookie().filter((c) => /csrf-token=/.test(c));

describe("rotta di Auth.js", () => {
  it("/csrf emette il cookie; /session senza cookie no; poi il login trova il token del modulo", async () => {
    const csrf = await get("csrf");
    expect(csrfCookies(csrf)).toHaveLength(1);
    const { csrfToken } = (await csrf.json()) as { csrfToken: string };
    expect(csrfToken).toMatch(/^[0-9a-f]{32,}$/);

    const session = await get("session");
    expect(session.status).toBe(200);
    expect(csrfCookies(session)).toEqual([]);

    // Con il cookie di /csrf, /session non lo cambia.
    const cookie = csrfCookies(csrf)[0].split(";")[0];
    expect(csrfCookies(await get("session", cookie))).toEqual([]);
  });

  it("le altre risposte restano invariate (es. /providers)", async () => {
    const providers = await get("providers");
    expect(providers.status).toBe(200);
    expect(Object.keys((await providers.json()) as object)).toContain("credentials");
  });
});
