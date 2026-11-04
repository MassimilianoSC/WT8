import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => "/pratiche",
  useSearchParams: () => nav.params,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
// Fixtures in place of the API (cutover: no demo data in the app).
vi.mock("@/components/pratiche/data-source", async (orig) => ({
  ...(await orig<typeof import("@/components/pratiche/data-source")>()),
  ...(await import("@/components/__fixtures__/demo-list")).demoList,
}));
vi.mock("@/components/scheda/commands", async (orig) => ({
  ...(await orig<typeof import("@/components/scheda/commands")>()),
  ...(await import("@/components/__fixtures__/demo-commands")).demoCommands,
}));
vi.mock("@/components/scheda/sheet-source", async (orig) => ({
  ...(await orig<typeof import("@/components/scheda/sheet-source")>()),
  ...(await import("@/components/__fixtures__/demo-sheet")).demoSheet,
}));

import { PraticheList } from "@/components/pratiche/pratiche-list";
import { listPratiche } from "@/components/pratiche/data-source";
import { AlertsPanel } from "@/components/scheda/alerts-panel";
import { runCommand } from "@/components/scheda/commands";
import { mockGet } from "@/components/__fixtures__/demo-sheet";
import { serveTemplates } from "@/components/scheda/__tests__/serve-templates";
import { MOCK_TEMPLATE } from "@/components/scheda/mock-template";

beforeEach(() => {
  vi.clearAllMocks();
  serveTemplates();
});

async function allPages(archived: boolean) {
  const first = await listPratiche({ archived });
  const pages = Math.ceil(first.total / first.pageSize);
  const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, i) => listPratiche({ archived, page: i + 2 })));
  return [first, ...rest].flatMap((p) => p.items);
}

describe("Archivio", () => {
  it("the main list excludes archived practices; the archive holds only them", async () => {
    const active = await allPages(false);
    const archived = await allPages(true);
    expect(active.length).toBeGreaterThan(0);
    expect(archived.length).toBeGreaterThan(0);
    expect(active.every((p) => !p.archived)).toBe(true);
    expect(archived.every((p) => p.archived && p.archivedAt && ["TERMINATO", "KO"].includes(p.statoAttivita))).toBe(true);
  });

  it("archive mode shows 'Archiviata il' and no create button nor scope switch", async () => {
    render(<PraticheList mode="archive" canCreateIn={["INWIT"]} />);
    expect(await screen.findByText("Archiviata il")).toBeInTheDocument();
    expect(screen.queryByTestId("create-pratica-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("filter-scope")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByTestId(/^pratica-row-/).length).toBeGreaterThan(0));
    // Progress cells: short label (no overlap at 1440 px), full name in the tooltip.
    const progress = screen.getAllByTestId(/^pratica-progress-/)[0];
    expect(within(progress).getByText("PM/Perm.")).toBeInTheDocument();
    expect(within(progress).getByText("PM/Perm.").parentElement).toHaveAttribute("title", expect.stringMatching(/^PM\/Permessi: /));
  });

  it("archiving moves a practice to the archive, read-only with suspended alerts; restoring brings it back", async () => {
    const active = await allPages(false);
    const target = active.find((p) => p.statoAttivita === "TERMINATO" || p.statoAttivita === "KO") ?? active[0];
    const practice = (await mockGet(target.id))!;

    const archived = (await runCommand(practice, { kind: "archive" }, "op-a"))!;
    expect(archived.archived).toBe(true);
    expect(archived.archivedAt).toBeTruthy();
    expect(Object.values(archived.access).every((a) => a.reason === "ARCHIVED")).toBe(true);
    expect(archived.alerts.every((a) => a.executionStatus === "SUSPENDED")).toBe(true);
    expect(archived.actions).toMatchObject({ canRestore: true, canRework: true, canAssign: false });
    expect((await allPages(true)).some((p) => p.id === target.id)).toBe(true);
    expect((await allPages(false)).some((p) => p.id === target.id)).toBe(false);

    const restored = (await runCommand(archived, { kind: "restore" }, "op-r"))!;
    expect(restored).toMatchObject({ archived: false, archivedAt: null, statoAttivita: archived.statoAttivita });
    expect((await allPages(false)).some((p) => p.id === target.id)).toBe(true);
  });

  it("uses the Offerta → ODA hint for manual closes", () => {
    render(
      <AlertsPanel
        alerts={[
          {
            id: "a1", practiceId: "p", iteration: 1, rule: "OFFERTA_ODA", label: "Offerta senza ODA",
            executionStatus: "ACTIVE", openedAt: "2026-10-01T09:00:00+02:00", dueAt: null, status: "OPEN", canCloseManually: true,
          },
        ]}
        labelOf={() => null}
        onGoTo={vi.fn()}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(within(screen.getByTestId("alert-a1")).getByTestId("alert-close-a1"));
    expect(screen.getByText("Chiudilo quando sono arrivati tutti gli ODA previsti.")).toBeInTheDocument();
  });

  it("serves the archived demo practice on its template", async () => {
    const archived = (await allPages(true))[0];
    const p = (await mockGet(archived.id))!;
    expect(p.archived).toBe(true);
    expect(p.templateId).toBe(archived.templateId);
    expect(MOCK_TEMPLATE.occurrences.length).toBeGreaterThan(0);
  });
});
