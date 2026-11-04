import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { GroupId, StatsQuery, TemplateId } from "@/lib/contract";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
const calls = vi.hoisted(() => ({ stats: [] as StatsQuery[], workload: [] as Array<[TemplateId, GroupId | undefined]> }));
vi.mock("@/components/statistiche/stats-source", async (orig) => {
  const demo = (await import("@/components/__fixtures__/demo-stats")).demoStats;
  return {
    ...(await orig<typeof import("@/components/statistiche/stats-source")>()),
    ...demo,
    loadStats: async (q: StatsQuery & { from: string; to: string }) => {
      calls.stats.push(q);
      return demo.loadStats(q);
    },
    loadWorkload: async (t: TemplateId, g?: GroupId) => {
      calls.workload.push([t, g]);
      return demo.loadWorkload(t, g);
    },
  };
});

import { StatisticheView } from "@/components/statistiche/statistiche-view";
import { paramsOf, statsHref, statsInitialFromParams, workloadHref } from "@/components/statistiche/stats-url";
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
  calls.stats = [];
  calls.workload = [];
});

describe("stats-url", () => {
  it("reads view, template, period and group; ignores the rest", () => {
    expect(statsInitialFromParams(paramsOf({ template: "ILIAD", da: "2026-10-01", a: "2026-10-31" }))).toEqual({
      templateId: "ILIAD",
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(statsInitialFromParams(paramsOf({ vista: "carichi", template: ["INWIT", "ILIAD"], gruppo: "UT_PE" }))).toEqual({
      tab: "workload",
      templateId: "INWIT",
      group: "UT_PE",
    });
    expect(statsInitialFromParams(paramsOf({ template: "ACME", da: "2026-10-31", a: "2026-10-01", gruppo: "X", vista: "y" }))).toEqual({});
  });

  it("builds the links of the assistant's sources", () => {
    expect(statsHref({ templateId: "ILIAD", from: "2026-10-01", to: "2026-10-31" })).toBe("/statistiche?template=ILIAD&da=2026-10-01&a=2026-10-31");
    expect(statsHref({})).toBe("/statistiche");
    expect(workloadHref({ templateId: "TOWERNET", group: "AIE" })).toBe("/statistiche?vista=carichi&template=TOWERNET&gruppo=AIE");
  });
});

describe("StatisticheView opened from a link", () => {
  it("statistics: the template and period of the link", async () => {
    render(<StatisticheView access={{ statsTemplates: null, workload: null }} initial={{ templateId: "ILIAD", from: "2026-09-01", to: "2026-09-30" }} />);
    await waitFor(() => expect(calls.stats.length).toBeGreaterThan(0));
    expect(calls.stats[0]).toEqual({ templateId: "ILIAD", from: "2026-09-01", to: "2026-09-30" });
    expect(screen.getByTestId("stats-tab-stats")).toHaveAttribute("aria-selected", "true");
  });

  it("a template the user may not see is ignored", async () => {
    render(<StatisticheView access={{ statsTemplates: ["INWIT"], workload: {} }} initial={{ templateId: "ILIAD" }} />);
    await waitFor(() => expect(calls.stats.length).toBeGreaterThan(0));
    expect(calls.stats[0].templateId).toBe("INWIT");
  });

  it("workload: the view, template and group of the link", async () => {
    render(<StatisticheView access={{ statsTemplates: null, workload: null }} initial={{ tab: "workload", templateId: "TOWERNET", group: "AIE" }} />);
    await waitFor(() => expect(calls.workload.length).toBeGreaterThan(0));
    expect(calls.workload[0]).toEqual(["TOWERNET", "AIE"]);
    expect(screen.getByTestId("stats-tab-workload")).toHaveAttribute("aria-selected", "true");
  });

  it("a team leader asking for another group gets their own", async () => {
    render(<StatisticheView access={{ statsTemplates: [], workload: { TOWERNET: ["UT_PE"] } }} initial={{ tab: "workload", templateId: "TOWERNET", group: "AIE" }} />);
    await waitFor(() => expect(calls.workload.length).toBeGreaterThan(0));
    expect(calls.workload.every(([, g]) => g === "UT_PE")).toBe(true);
  });
});
