/** Thin client-side fetch wrapper. Uses same-origin relative paths so it works
 *  both locally and behind a reverse proxy. */

/** Error thrown by apiFetch for non-2xx responses. Carries the HTTP status so
 *  callers can tell 403 / 409 / 422 apart, plus the parsed JSON body (e.g. the
 *  `rejected` list of a 403 on field writes). */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** Page of the password change; the mandatory one (D-173) is reached from any 403 CAMBIO_PASSWORD. */
export const CHANGE_PASSWORD_PATH = "/change-password";

/** Full page loads, behind an object so the tests can watch them (jsdom cannot navigate). */
export const browserNav = {
  assign(url: string): void {
    window.location.assign(url);
  },
};

/**
 * D-173: a 403 { code: "CAMBIO_PASSWORD" } from any route sends to the password
 * change (a full load, so the layout shows the bare shell). True if it did.
 */
export function goToPasswordChangeIfRequired(status: number, body: unknown): boolean {
  if (status !== 403 || (body as { code?: unknown } | null)?.code !== "CAMBIO_PASSWORD") return false;
  if (typeof window !== "undefined" && window.location.pathname !== CHANGE_PASSWORD_PATH) browserNav.assign(CHANGE_PASSWORD_PATH);
  return true;
}

/** Access pages: a 401 there is an answer of the form (e.g. wrong password), not an expired session. */
const PUBLIC_AUTH_PATHS = ["/login", "/forgot-password", "/reset-password", "/set-password"];
export const SESSION_EXPIRED_PARAM = "sessione";

/**
 * A 401 from any route of the app (session expired, PR-22, or user deactivated)
 * sends to the login with "Sessione scaduta" and the page to return to. True if it did.
 */
export function goToLoginIfExpired(status: number): boolean {
  if (status !== 401 || typeof window === "undefined") return false;
  const { pathname, search } = window.location;
  if (PUBLIC_AUTH_PATHS.includes(pathname)) return false;
  const next = encodeURIComponent(`${pathname}${search}`);
  browserNav.assign(`/login?${SESSION_EXPIRED_PARAM}=scaduta&next=${next}`);
  return true;
}

/** Only a page of the app (never another site, never the login itself) is a place to return to after the login. */
export function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\") || raw.startsWith("/login")) return "/pratiche";
  return raw;
}

/** Reads (GET) that do not answer in this time fail with status 0 and code TIMEOUT, never wait forever. */
export const READ_TIMEOUT_MS = 20_000;

export async function apiFetch<T = unknown>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const { timeoutMs, ...rest } = init ?? {};
  const isRead = !rest.method || rest.method.toUpperCase() === "GET";
  const limit = timeoutMs ?? (isRead ? READ_TIMEOUT_MS : 0);
  const controller = limit > 0 && !rest.signal ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), limit) : null;
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      ...(controller ? { signal: controller.signal } : {}),
      headers: { "Content-Type": "application/json", ...(rest.headers || {}) },
      credentials: "include",
    });
  } catch (e) {
    if (controller?.signal.aborted) throw new ApiError("Il server non risponde", 0, { code: "TIMEOUT" });
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
  // 204 No Content (e.g. DELETE): there is no body to parse.
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    goToPasswordChangeIfRequired(res.status, data);
    goToLoginIfExpired(res.status);
    const message = (data as { error?: string })?.error || "Richiesta non riuscita";
    throw new ApiError(message, res.status, data);
  }
  return data as T;
}
