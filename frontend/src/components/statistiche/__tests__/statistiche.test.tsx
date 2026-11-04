import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { MeDTO, MembershipDTO } from "@/lib/contract";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
// Fixture statistics in place of the API (cutover: no demo data in the app).
vi.mock("@/components/statistiche/stats-source", async (orig) => ({
  ...(await orig<typeof import("@/components/statistiche/stats-source")>()),
  ...(await import("@/components/__fixtures__/demo-stats")).demoStats,
}));

import { defaultPeriod, exportUrl } from "@/components/statistiche/stats-source";
import * as statsSource from "@/components/statistiche/stats-source";
import { ApiError } from "@/lib/client";
import { StatisticheView } from "@/components/statistiche/statistiche-view";
import { statsTemplates, workloadScope } from "@/components/me/me-derive";
import { serveTemplates } from "@/components/scheda/__tests__/serve-templates";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  serveTemplates();
});

function user(memberships: MembershipDTO[], extra: Partial<MeDTO> = {}): MeDTO {
  return {
    id: "u", name: "U", email: "u@x.it", status: "active", isAdmin: false, memberships, canCreate: [], mustChangePassword: false,
    createdAt: "2026-09-01T09:00:00+02:00", updatedAt: "2026-09-01T09:00:00+02:00", ...extra,
  };
}

describe("access (D-23)", () => {
  it("statistics and export: PM of the template and ADMIN", () => {
    expect(statsTemplates(user([{ templateId: "INWIT", group: "PM_PERMESSI", role: "PM", leader: false }]))).toEqual(["INWIT"]);
    expect(statsTemplates(user([{ templateId: "INWIT", group: "PM_PERMESSI", role: "PERMESSI", leader: true }]))).toEqual([]);
    expect(statsTemplates(user([], { isAdmin: true }))).toBeNull();
  });

  it("workload: every group as PM, the own group as team leader", () => {
    const me = user([
      { templateId: "INWIT", group: "PM_PERMESSI", role: "PM", leader: false },
      { templateId: "TOWERNET", group: "UT_PE", role: "UT", leader: true },
      { templateId: "LEONARDO", group: "DL", role: "DL", leader: false },
    ]);
    expect(workloadScope(me)).toEqual({ INWIT: "all", TOWERNET: ["UT_PE"] });
    expect(workloadScope(user([], { isAdmin: true }))).toBeNull();
  });
});

describe("export (§11)", () => {
  it("builds the URL with the mandatory client and the list filters", () => {
    expect(exportUrl({ templateId: "INWIT", stato: "PROTOCOLLATO", q: "MI" })).toBe(
      "/api/export?templateId=INWIT&stato=PROTOCOLLATO&archived=false&q=MI"
    );
  });

});

describe("stats-source on the real routes", () => {
  it("defaults to the last 30 days", () => {
    expect(defaultPeriod(new Date("2026-10-08T12:00:00Z"))).toEqual({ from: "2026-09-08", to: "2026-10-08" });
  });

  it("GET /api/stats with the period and the client; GET /api/workload with client and group", async () => {
    const real = await vi.importActual<typeof import("@/components/statistiche/stats-source")>("@/components/statistiche/stats-source");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await real.loadStats({ from: "2026-09-01", to: "2026-09-30", templateId: "INWIT" });
    await real.loadWorkload("INWIT", "UT_PE");
    expect(fetchMock.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual([
      "/api/stats?from=2026-09-01&to=2026-09-30&templateId=INWIT",
      "/api/workload?templateId=INWIT&group=UT_PE",
    ]);
    vi.unstubAllGlobals();
    serveTemplates();
  });
});

describe("StatisticheView", () => {
  it("a failed read shows why and Riprova, never 'Caricamento…' forever", async () => {
    vi.spyOn(statsSource, "loadStats").mockRejectedValueOnce(new ApiError("Internal server error", 500, {}));
    render(<StatisticheView access={{ statsTemplates: null, workload: null }} />);
    expect(await screen.findByTestId("stats-load-error")).toHaveTextContent("Errore del server: riprova tra poco.");
    expect(screen.queryByText("Caricamento…")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("stats-load-error-retry"));
    expect(await screen.findByTestId("stats-tiles")).toBeInTheDocument();
  });

  it("shows tiles, states in their fixed order and the upcoming deadlines", async () => {
    render(<StatisticheView access={{ statsTemplates: null, workload: null }} />);
    expect(await screen.findByTestId("stats-tiles")).toHaveTextContent("Pratiche attive");
    const byStato = screen.getByTestId("stats-by-stato");
    const rows = within(byStato).getAllByRole("row");
    expect(rows).toHaveLength(12);
    expect(rows[0]).toHaveTextContent("CREATA");
    expect(rows[11]).toHaveTextContent("KO");
    expect(screen.getByTestId("stats-upcoming")).toBeInTheDocument();
  });

  it("upcoming deadlines link to the practice only when the user can open it (D-193, canOpen)", async () => {
    const base = await statsSource.loadStats({ from: "2026-10-01", to: "2026-10-31" });
    const item = { codiceSito: "IL-TO-0001", templateId: "ILIAD" as const, rule: "FORECAST_UT", label: "Forecast UT", dueAt: "2026-10-15T09:00:00+02:00" };
    vi.spyOn(statsSource, "loadStats").mockResolvedValueOnce({
      ...base,
      upcoming: { count: 2, items: [{ ...item, practiceId: "p-open", canOpen: true }, { ...item, practiceId: "p-closed", codiceSito: "IN-RM-0002", canOpen: false }] },
    });
    render(<StatisticheView access={{ statsTemplates: null, workload: null }} />);
    expect((await screen.findByTestId("upcoming-p-open")).tagName).toBe("A");
    expect(screen.getByTestId("upcoming-p-open")).toHaveAttribute("href", "/pratiche/p-open");
    expect(screen.getByTestId("upcoming-p-closed").tagName).toBe("SPAN");
  });

  it("'Per gestore' lists every client of the user, zero included", async () => {
    // The fixture has no active practice for some clients: they must show 0, not disappear.
    render(<StatisticheView access={{ statsTemplates: null, workload: null }} />);
    const table = await screen.findByTestId("stats-by-template");
    await waitFor(() => expect(within(table).getAllByRole("row")).toHaveLength(6));
    const rows = within(table).getAllByRole("row").map((r) => r.textContent ?? "");
    expect(rows.some((r) => /FASTWEB/.test(r))).toBe(true);
  });

  it("'Per gestore' for a PM of two clients: just those two", async () => {
    render(<StatisticheView access={{ statsTemplates: ["INWIT", "LEONARDO"], workload: {} }} />);
    const table = await screen.findByTestId("stats-by-template");
    await waitFor(() => expect(within(table).getAllByRole("row")).toHaveLength(2));
    expect(within(table).getAllByRole("row").map((r) => r.textContent ?? "").join(" ")).toMatch(/INWIT.*LEONARDO/);
  });

  it("a team leader sees only the workload of their group", async () => {
    render(<StatisticheView access={{ statsTemplates: [], workload: { INWIT: ["UT_PE"] } }} />);
    expect(screen.queryByTestId("stats-tab-stats")).not.toBeInTheDocument();
    const table = await screen.findByTestId("workload-table");
    await waitFor(() => expect(within(table).queryByText("Caricamento…")).not.toBeInTheDocument());
    const people = within(table).getAllByRole("row").slice(1);
    expect(people.length).toBeGreaterThan(0);
    expect(people.every((r) => r.textContent?.includes("UT/PE"))).toBe(true);
    fireEvent.click(screen.getByTestId("workload-group"));
    expect(screen.queryByRole("option", { name: "Tutti i gruppi" })).not.toBeInTheDocument();
  });
});
