import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/pratiche",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("@/components/notifiche/notification-bell-v2", () => ({ NotificationBellV2: () => <span data-testid="bell-v2" /> }));
vi.mock("@/components/layout/template-nav", () => ({ TemplateNav: () => null }));

import { AppShell, type ShellUser } from "@/components/layout/app-shell";
import type { MeDTO } from "@/lib/contract";
import { demoStatus } from "@/components/__fixtures__/demo-assistant";

afterEach(() => vi.unstubAllGlobals());

const user = (patch: Partial<ShellUser> = {}): ShellUser => ({
  name: "Laura Verdi",
  email: "laura@x",
  templateIds: ["ILIAD"],
  isAdmin: false,
  isLeader: false,
  canStats: true,
  summary: "PM · ILIAD",
  ...patch,
});

describe("AppShell (after the cutover)", () => {
  it("shows the support contact (D-150), the memberships in the footer and the v2 bell", () => {
    render(
      <AppShell user={user()}>
        <p>contenuto</p>
      </AppShell>
    );
    const contact = screen.getAllByTestId("support-contact")[0];
    expect(contact).toHaveTextContent("Hai un problema? Scrivi a operations@hqe.it");
    expect(within(contact).getByRole("link", { name: "operations@hqe.it" })).toHaveAttribute("href", "mailto:operations@hqe.it");
    expect(screen.getAllByTestId("sidebar-memberships")[0]).toHaveTextContent("PM · ILIAD");
    expect(screen.getByTestId("bell-v2")).toBeInTheDocument();
  });

  it("has no beta entries: no Dashboard, Analisi, Users, Import, notification settings; the logo goes to /pratiche", () => {
    render(
      <AppShell user={user({ isAdmin: true, summary: "Amministratore" })}>
        <p>contenuto</p>
      </AppShell>
    );
    for (const id of ["nav-dashboard", "nav-analisi", "nav-utenti", "nav-import", "menu-settings"]) {
      expect(screen.queryByTestId(id)).not.toBeInTheDocument();
    }
    expect(screen.getAllByRole("link", { name: "PracticeHub" })[0]).toHaveAttribute("href", "/pratiche");
  });

  it("Configurazione > Assistente AI is an ADMIN entry", () => {
    const { unmount } = render(
      <AppShell user={user()}>
        <p>contenuto</p>
      </AppShell>
    );
    expect(screen.queryByTestId("nav-config-assistente")).not.toBeInTheDocument();
    unmount();
    render(
      <AppShell user={user({ isAdmin: true })}>
        <p>contenuto</p>
      </AppShell>
    );
    expect(screen.getAllByTestId("nav-config-assistente")[0]).toHaveAttribute("href", "/configurazione/assistente");
  });

  it("'Chiedi' only when the MeDTO carries the assistant (contract §13.1); it opens the panel", () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(demoStatus()), { headers: { "Content-Type": "application/json" } })));
    const { unmount } = render(
      <AppShell user={user()}>
        <p>contenuto</p>
      </AppShell>
    );
    expect(screen.queryByTestId("assistant-ask")).not.toBeInTheDocument();
    unmount();
    const me = { id: "u", name: "Laura", email: "laura@x", status: "active", isAdmin: false, memberships: [], createdAt: "", updatedAt: "", canCreate: [], mustChangePassword: false } as MeDTO;
    render(
      <AppShell user={user()} assistant={{ me, status: demoStatus() }}>
        <p>contenuto</p>
      </AppShell>
    );
    fireEvent.click(screen.getByTestId("assistant-ask"));
    expect(screen.getByTestId("assistant-panel")).toBeInTheDocument();
  });
});
