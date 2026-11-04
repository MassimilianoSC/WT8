import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/client";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const signIn = vi.hoisted(() => vi.fn());
vi.mock("next-auth/react", () => ({ signIn }));

import { GENERIC_ERROR, LOGIN_LOCKED, PASSWORD_RULE, authErrorMessage, loginErrorMessage } from "@/components/auth/auth-errors";
import LoginPage from "@/app/login/page";
import { SetPasswordForm } from "@/components/auth/set-password-form";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const english = (status: number) => new ApiError("This link is invalid or has expired", status, { error: "This link is invalid or has expired" });

describe("authErrorMessage: Italian only, never the server's text", () => {
  it("maps each flow and status to a fixed Italian text, with a generic fallback", () => {
    expect(authErrorMessage("invite", english(400))).toBe("Il link non è più valido: chiedi all'amministratore di reinviare l'invito.");
    expect(authErrorMessage("reset", english(400))).toBe("Il link non è più valido: richiedi un nuovo link da \"Password dimenticata?\".");
    expect(authErrorMessage("reset", english(422))).toBe(PASSWORD_RULE);
    expect(authErrorMessage("invite", english(404))).toContain("Account non trovato o disattivato");
    expect(authErrorMessage("change", english(400))).toBe("La password attuale non è corretta.");
    expect(authErrorMessage("change", english(401))).toBe("Sessione scaduta: accedi di nuovo.");
    expect(authErrorMessage("forgot", english(422))).toBe("Inserisci un indirizzo email valido.");
    expect(authErrorMessage("reset", english(429))).toBe("Troppi tentativi: riprova tra qualche minuto.");
    expect(authErrorMessage("change", english(500))).toBe(GENERIC_ERROR);
    expect(authErrorMessage("reset", new TypeError("Failed to fetch"))).toBe(GENERIC_ERROR);
    for (const flow of ["login", "invite", "reset", "forgot", "change"] as const) {
      for (const status of [0, 400, 401, 403, 404, 409, 422, 429, 500, 503]) {
        expect(authErrorMessage(flow, english(status))).not.toMatch(/link is invalid|expired/i);
      }
    }
  });

  it("login: wrong credentials vs anything else", () => {
    expect(loginErrorMessage(undefined)).toBeNull();
    expect(loginErrorMessage("CredentialsSignin")).toBe("Email o password non validi.");
    expect(loginErrorMessage("Configuration")).toBe(GENERIC_ERROR);
  });

  it("login locked after too many attempts (PR-22): its own message, even if the error is CredentialsSignin", () => {
    expect(loginErrorMessage("CredentialsSignin", "troppi_tentativi")).toBe(
      "Troppi tentativi: riprova tra 15 minuti. Se hai dimenticato la password usa 'Password dimenticata?'."
    );
    expect(loginErrorMessage("CredentialsSignin", "credentials")).toBe("Email o password non validi.");
  });
});

describe("LoginPage", () => {
  it("shows the PR-22 lock message when signIn answers code troppi_tentativi", async () => {
    signIn.mockResolvedValueOnce({ error: "CredentialsSignin", code: "troppi_tentativi", status: 401, ok: false, url: null });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "pm@x.it" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Giusta@2026" } });
    fireEvent.submit(screen.getByTestId("login-form"));
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith(LOGIN_LOCKED));
  });
});

describe("SetPasswordForm", () => {
  it("an expired invitation link: Italian message on the page and the way out, not the server's English", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "This link is invalid or has expired" }), { status: 400, headers: { "content-type": "application/json" } })));
    render(<SetPasswordForm flow="reset" token="abcdefghijkl" endpoint="/api/auth/reset-password" title="T" subtitle="S" cta="Reimposta" />);
    fireEvent.change(screen.getByLabelText("Nuova password"), { target: { value: "Nuova@2026" } });
    fireEvent.change(screen.getByLabelText("Conferma password"), { target: { value: "Nuova@2026" } });
    fireEvent.submit(screen.getByTestId("set-password-form"));
    const box = await screen.findByTestId("set-password-error");
    expect(box).toHaveTextContent("Il link non è più valido: richiedi un nuovo link");
    expect(box).not.toHaveTextContent(/invalid|expired/i);
    expect(screen.getByRole("link", { name: "Richiedi un nuovo link" })).toHaveAttribute("href", "/forgot-password");
  });

  it("a link without token says so before asking for a password", () => {
    render(<SetPasswordForm flow="invite" token="" endpoint="/api/auth/set-password" title="T" subtitle="S" cta="Attiva" />);
    expect(screen.getByTestId("set-password-link-invalid")).toHaveTextContent("chiedi all'amministratore di reinviare l'invito");
    expect(screen.queryByTestId("set-password-form")).not.toBeInTheDocument();
  });
});
