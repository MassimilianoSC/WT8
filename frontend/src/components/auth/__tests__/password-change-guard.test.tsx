import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { MeDTO } from "@/lib/contract";

const nav = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: nav.redirect,
  usePathname: () => "/change-password",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
const session = vi.hoisted(() => ({ user: { name: "Primo Admin", email: "admin@x.it" } as { name: string; email: string } | null }));
vi.mock("@/lib/auth", () => ({ auth: async () => (session.user ? { user: session.user } : null) }));
const me = vi.hoisted(() => ({ current: null as MeDTO | null }));
vi.mock("@/components/me/load-me", () => ({
  loadMe: async () => (me.current ? { status: "ok", me: me.current } : { status: "anonymous" }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/components/notifiche/notification-bell-v2", () => ({ NotificationBellV2: () => <span data-testid="bell-v2" /> }));
vi.mock("@/components/layout/template-nav", () => ({ TemplateNav: () => null }));

import { ApiError, apiFetch, browserNav, goToPasswordChangeIfRequired } from "@/lib/client";
import { authErrorMessage } from "@/components/auth/auth-errors";
import AppLayout from "@/app/(app)/layout";
import AccountLayout from "@/app/(account)/layout";
import ChangePasswordPage from "@/app/(account)/change-password/page";
import { FORCED_CHANGE_TEXT } from "@/components/auth/forced-password-shell";

const ADMIN: MeDTO = {
  id: "u-admin", name: "Primo Admin", email: "admin@x.it", status: "active", isAdmin: true, memberships: [],
  canCreate: [], mustChangePassword: true, createdAt: "2026-10-09T09:00:00+02:00", updatedAt: "2026-10-09T09:00:00+02:00",
};

let assign: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  assign = vi.spyOn(browserNav, "assign").mockImplementation(() => undefined);
  session.user = { name: "Primo Admin", email: "admin@x.it" };
  me.current = ADMIN;
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  nav.redirect.mockClear();
});

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("D-173: mandatory password change", () => {
  it("the app layout sends to /change-password while mustChangePassword is true", async () => {
    await expect(AppLayout({ children: <p>pratiche</p> })).rejects.toThrow("REDIRECT /change-password");
    me.current = { ...ADMIN, mustChangePassword: false };
    nav.redirect.mockClear();
    const el = await AppLayout({ children: <p>pratiche</p> });
    expect(nav.redirect).not.toHaveBeenCalled();
    render(el);
    expect(screen.getByText("pratiche")).toBeInTheDocument();
  });

  it("the account layout shows the bare shell with the warning: no menus, no bell, only Esci", async () => {
    render(await AccountLayout({ children: <ChangePasswordPage /> }));
    expect(screen.getByTestId("forced-password-warning")).toHaveTextContent(FORCED_CHANGE_TEXT);
    expect(screen.queryByTestId("sidebar-nav")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bell-v2")).not.toBeInTheDocument();
    expect(screen.getByTestId("forced-logout")).toBeInTheDocument();
    expect(screen.getByTestId("change-password-form")).toBeInTheDocument();
  });

  it("without the flag /change-password keeps the normal shell", async () => {
    me.current = { ...ADMIN, mustChangePassword: false };
    render(await AccountLayout({ children: <ChangePasswordPage /> }));
    expect(screen.queryByTestId("forced-password-shell")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("sidebar-nav").length).toBeGreaterThan(0);
  });

  it("after the mandatory change the app opens with a full load", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ ok: true }, 200)));
    render(await AccountLayout({ children: <ChangePasswordPage /> }));
    fireEvent.change(screen.getByTestId("current-password-input"), { target: { value: "Ambiente@2026" } });
    fireEvent.change(screen.getByTestId("new-password-input"), { target: { value: "Nuova@2026" } });
    fireEvent.change(screen.getByTestId("confirm-password-input"), { target: { value: "Nuova@2026" } });
    fireEvent.submit(screen.getByTestId("change-password-form"));
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("/pratiche"));
  });

  it("an ordinary change stays on the page", async () => {
    me.current = { ...ADMIN, mustChangePassword: false };
    vi.stubGlobal("fetch", vi.fn(async () => json({ ok: true }, 200)));
    render(await AccountLayout({ children: <ChangePasswordPage /> }));
    fireEvent.change(screen.getByTestId("current-password-input"), { target: { value: "Vecchia@2026" } });
    fireEvent.change(screen.getByTestId("new-password-input"), { target: { value: "Nuova@2026" } });
    fireEvent.change(screen.getByTestId("confirm-password-input"), { target: { value: "Nuova@2026" } });
    fireEvent.submit(screen.getByTestId("change-password-form"));
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith("Password aggiornata"));
    expect(assign).not.toHaveBeenCalled();
  });

  it("a 403 CAMBIO_PASSWORD from any route sends to the page; other 403s do not", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "Cambia la password prima di continuare", code: "CAMBIO_PASSWORD" }, 403)));
    await expect(apiFetch("/api/practices")).rejects.toBeInstanceOf(ApiError);
    expect(assign).toHaveBeenCalledWith("/change-password");
    assign.mockClear();
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "Vietato" }, 403)));
    await expect(apiFetch("/api/practices")).rejects.toBeInstanceOf(ApiError);
    expect(assign).not.toHaveBeenCalled();
    expect(goToPasswordChangeIfRequired(401, { code: "CAMBIO_PASSWORD" })).toBe(false);
  });
});

describe("429 of the access routes", () => {
  it("uses retryAfterSeconds when the server sends it", () => {
    const err = (s?: number) => new ApiError("x", 429, s === undefined ? { error: "x" } : { error: "x", retryAfterSeconds: s });
    expect(authErrorMessage("change", err(900))).toBe("Troppi tentativi: riprova tra 15 minuti.");
    expect(authErrorMessage("forgot", err(30))).toBe("Troppi tentativi: riprova tra 1 minuto.");
    expect(authErrorMessage("reset", err())).toBe("Troppi tentativi: riprova tra qualche minuto.");
  });
});
