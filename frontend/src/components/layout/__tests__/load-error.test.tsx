import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
const signIn = vi.hoisted(() => vi.fn());
vi.mock("next-auth/react", () => ({ signIn }));
vi.mock("@/components/configurazione/config-source", async (orig) => ({
  ...(await orig<typeof import("@/components/configurazione/config-source")>()),
  ...(await import("@/components/__fixtures__/demo-config")).demoConfig,
}));

import { ApiError, apiFetch, browserNav, READ_TIMEOUT_MS, safeNext } from "@/lib/client";
import { LoadError, loadErrorMessage, SESSION_EXPIRED } from "@/components/layout/load-error";
import { UsersAdmin } from "@/components/configurazione/users-admin";
import { AlertRulesEditor } from "@/components/configurazione/alert-rules-editor";
import * as source from "@/components/configurazione/config-source";
import { serveTemplates } from "@/components/scheda/__tests__/serve-templates";
import LoginPage from "@/app/login/page";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
});

let assign: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  assign = vi.spyOn(browserNav, "assign").mockImplementation(() => undefined);
  window.history.replaceState(null, "", "/configurazione/utenti?x=1");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("apiFetch: expired session and slow server", () => {
  it("a 401 sends to the login with 'Sessione scaduta' and the page to return to", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "Unauthenticated" }, 401)));
    await expect(apiFetch("/api/users")).rejects.toMatchObject({ status: 401 });
    expect(assign).toHaveBeenCalledWith(`/login?sessione=scaduta&next=${encodeURIComponent("/configurazione/utenti?x=1")}`);
  });

  it("on the access pages a 401 is the form's answer: no redirect", async () => {
    window.history.replaceState(null, "", "/reset-password");
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "Unauthenticated" }, 401)));
    await expect(apiFetch("/api/auth/reset-password", { method: "POST" })).rejects.toBeInstanceOf(ApiError);
    expect(assign).not.toHaveBeenCalled();
  });

  it("a read that does not answer fails with TIMEOUT; a write has no time limit", async () => {
    vi.useFakeTimers();
    const hanging = vi.fn(
      (_: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))
    );
    vi.stubGlobal("fetch", hanging);
    const read = apiFetch("/api/users");
    const check = expect(read).rejects.toMatchObject({ status: 0, body: { code: "TIMEOUT" } });
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS);
    await check;
    void apiFetch("/api/users", { method: "POST" }).catch(() => undefined);
    expect(hanging.mock.calls[1][1]?.signal).toBeUndefined();
  });

  it("returns only to pages of the app", () => {
    expect(safeNext("/configurazione/utenti?x=1")).toBe("/configurazione/utenti?x=1");
    for (const bad of [null, "", "https://evil.example", "//evil.example", "/\\evil.example", "/login?next=/x"]) expect(safeNext(bad)).toBe("/pratiche");
  });
});

describe("load error messages", () => {
  it("fixed Italian texts by status, never the server's", () => {
    expect(loadErrorMessage(new ApiError("Unauthenticated", 401, {}))).toBe(SESSION_EXPIRED);
    expect(loadErrorMessage(new ApiError("x", 403, {}))).toBe("Non hai accesso a questi dati.");
    expect(loadErrorMessage(new ApiError("x", 404, {}), "Pratica non trovata.")).toBe("Pratica non trovata.");
    expect(loadErrorMessage(new ApiError("x", 0, { code: "TIMEOUT" }))).toBe("Il server non risponde: riprova tra poco.");
    expect(loadErrorMessage(new ApiError("Internal server error", 500, {}))).toBe("Errore del server: riprova tra poco.");
    expect(loadErrorMessage(new TypeError("Failed to fetch"))).toMatch(/non è raggiungibile/);
  });

  it("an expired session offers Accedi instead of Riprova", () => {
    render(<LoadError message={SESSION_EXPIRED} onRetry={() => undefined} />);
    expect(screen.getByRole("link", { name: "Accedi" })).toHaveAttribute("href", "/login");
    expect(screen.queryByTestId("load-error-retry")).not.toBeInTheDocument();
  });
});

describe("pages never stay on 'Caricamento…'", () => {
  beforeEach(() => serveTemplates());

  it("Utenti: a failed read shows why, Riprova loads the table", async () => {
    vi.spyOn(source, "loadUsers").mockRejectedValueOnce(new ApiError("Internal server error", 500, {}));
    render(<UsersAdmin />);
    expect(await screen.findByTestId("users-load-error")).toHaveTextContent("Errore del server: riprova tra poco.");
    expect(screen.queryByText("Caricamento…")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("users-load-error-retry"));
    await waitFor(() => expect(screen.queryByTestId("users-load-error")).not.toBeInTheDocument());
    expect(await screen.findByTestId("no-pm-leader")).toBeInTheDocument();
  });

  it("Soglie: a failed read of the rules shows why, Riprova loads them", async () => {
    vi.spyOn(source, "loadAlertRules").mockRejectedValueOnce(new ApiError("x", 0, { code: "TIMEOUT" }));
    render(<AlertRulesEditor />);
    expect(await screen.findByTestId("rules-load-error")).toHaveTextContent("Il server non risponde");
    fireEvent.click(screen.getByTestId("rules-load-error-retry"));
    expect(await screen.findByTestId("rule-SOPRALLUOGO")).toBeInTheDocument();
  });

  it("Soglie: no clients says so", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json([], 200)));
    render(<AlertRulesEditor />);
    expect(await screen.findByTestId("rules-no-template")).toHaveTextContent("Nessun gestore disponibile");
    expect(screen.queryByText("Caricamento…")).not.toBeInTheDocument();
  });
});

describe("LoginPage after an expired session", () => {
  it("says why and returns to the page after the login", async () => {
    window.history.replaceState(null, "", `/login?sessione=scaduta&next=${encodeURIComponent("/configurazione/utenti")}`);
    signIn.mockResolvedValueOnce({ ok: true, error: undefined, status: 200, url: null });
    render(<LoginPage />);
    expect(await screen.findByTestId("login-session-expired")).toHaveTextContent("Sessione scaduta: accedi di nuovo.");
    fireEvent.change(screen.getByTestId("login-email-input"), { target: { value: "admin@x.it" } });
    fireEvent.change(screen.getByTestId("login-password-input"), { target: { value: "segreta123" } });
    fireEvent.submit(screen.getByTestId("login-form"));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/configurazione/utenti"));
  });

  it("without the mark: no notice, back to the practices", async () => {
    window.history.replaceState(null, "", "/login");
    signIn.mockResolvedValueOnce({ ok: true, error: undefined, status: 200, url: null });
    render(<LoginPage />);
    fireEvent.change(screen.getByTestId("login-email-input"), { target: { value: "admin@x.it" } });
    fireEvent.change(screen.getByTestId("login-password-input"), { target: { value: "segreta123" } });
    fireEvent.submit(screen.getByTestId("login-form"));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/pratiche"));
    expect(screen.queryByTestId("login-session-expired")).not.toBeInTheDocument();
  });
});
