import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/pratiche",
  useSearchParams: () => nav.params,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
// Fixtures in place of the API (cutover: no demo data in the app).
vi.mock("@/components/pratiche/data-source", async (orig) => ({
  ...(await orig<typeof import("@/components/pratiche/data-source")>()),
  ...(await import("@/components/__fixtures__/demo-list")).demoList,
}));

import { listPratiche } from "@/components/pratiche/data-source";
import { PraticheList } from "@/components/pratiche/pratiche-list";
import { exportUrl } from "@/components/statistiche/stats-source";
import { serveTemplates } from "@/components/scheda/__tests__/serve-templates";

beforeEach(() => {
  serveTemplates();
  nav.params = new URLSearchParams();
});

async function all(q: { from?: string; to?: string }) {
  const first = await listPratiche({ ...q, page: 1 });
  const pages = Math.ceil(first.total / first.pageSize);
  const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, i) => listPratiche({ ...q, page: i + 2 })));
  return [first, ...rest].flatMap((r) => r.items);
}

describe("creation date filter (D-129)", () => {
  it("filters on the creation date, both ends included", async () => {
    const every = await all({});
    const day = every[0].createdAt.slice(0, 10);
    const exact = await all({ from: day, to: day });
    expect(exact.length).toBeGreaterThan(0);
    expect(exact.every((p) => p.createdAt.slice(0, 10) === day)).toBe(true);
    const after = await all({ from: day });
    expect(after.every((p) => p.createdAt.slice(0, 10) >= day)).toBe(true);
    expect(after.length).toBeLessThanOrEqual(every.length);
  });

  it("passes the list scope to the export (v0.3.4)", () => {
    expect(exportUrl({ templateId: "INWIT", scope: "all" })).toBe("/api/export?templateId=INWIT&archived=false&scope=all");
  });

  it("passes the range to the export", () => {
    expect(exportUrl({ templateId: "INWIT", from: "2026-09-01", to: "2026-09-30" })).toBe(
      "/api/export?templateId=INWIT&archived=false&from=2026-09-01&to=2026-09-30"
    );
  });

  it("shows Da / A and refuses a start after the end", async () => {
    render(<PraticheList />);
    const from = screen.getByLabelText("Creata dal");
    const to = screen.getByLabelText("Creata fino al");
    fireEvent.change(to, { target: { value: "10092026" } });
    fireEvent.blur(to);
    fireEvent.change(from, { target: { value: "20092026" } });
    fireEvent.blur(from);
    expect(await screen.findByText("La data iniziale non può essere dopo quella finale")).toBeInTheDocument();
    expect(to).toHaveValue("10/09/2026");
  });
});

describe("export for everyone who sees the list (D-128)", () => {
  it("shows the button without any special right, enabled once a client is chosen", async () => {
    const { unmount } = render(<PraticheList />);
    expect(screen.getByTestId("export-csv")).toBeDisabled();
    unmount();
    nav.params = new URLSearchParams("template=INWIT");
    render(<PraticheList />);
    expect(screen.getByTestId("export-csv")).toBeEnabled();
  });
});
