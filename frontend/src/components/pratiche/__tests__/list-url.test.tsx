import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PracticeListQuery } from "@/lib/contract";

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn(), pathname: "/pratiche" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.params,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
const calls = vi.hoisted(() => ({ list: [] as PracticeListQuery[] }));
vi.mock("@/components/pratiche/data-source", async (orig) => {
  const demo = (await import("@/components/__fixtures__/demo-list")).demoList;
  return {
    ...(await orig<typeof import("@/components/pratiche/data-source")>()),
    ...demo,
    listPratiche: async (q: PracticeListQuery) => {
      calls.list.push(q);
      return demo.listPratiche(q);
    },
  };
});

import { PraticheList } from "@/components/pratiche/pratiche-list";
import { filtersFromParams, filtersToParams, listHref } from "@/components/pratiche/list-url";
import { serveTemplates } from "@/components/scheda/__tests__/serve-templates";

beforeEach(() => {
  // Radix Select scrolls to the chosen option.
  Element.prototype.scrollIntoView ??= () => {};
  serveTemplates();
  nav.params = new URLSearchParams();
  nav.pathname = "/pratiche";
  nav.replace.mockReset();
  calls.list = [];
});

const lastList = () => calls.list[calls.list.length - 1];

describe("list-url", () => {
  it("reads every filter, ignoring unknown or malformed values", () => {
    const p = new URLSearchParams("template=ILIAD&stato=ASSEGNATO&q=%20Roma%20&da=2026-10-01&a=2026-10-31&tutte=1&ordine=created_desc");
    expect(filtersFromParams(p, false)).toEqual({
      templateId: "ILIAD",
      stato: "ASSEGNATO",
      q: "Roma",
      from: "2026-10-01",
      to: "2026-10-31",
      scope: "all",
      sort: "created_desc",
    });
    const bad = new URLSearchParams("template=ACME&stato=boh&da=2026-02-30&a=ieri&tutte=si&ordine=random");
    expect(filtersFromParams(bad, false)).toEqual({ scope: "assigned", sort: "open_first" });
    // A reversed range is dropped; the archive has no scope and sorts by update.
    expect(filtersFromParams(new URLSearchParams("da=2026-10-31&a=2026-10-01&tutte=1"), true)).toEqual({ scope: "assigned", sort: "updated_desc" });
  });

  it("writes only what differs from the defaults, and reads back the same", () => {
    expect(filtersToParams({ scope: "assigned", sort: "open_first" }, false).toString()).toBe("");
    const f = { templateId: "TOWERNET" as const, stato: "KO" as const, q: "Via Roma", from: "2026-01-01", to: "2026-01-31", scope: "all" as const, sort: "updated_desc" as const };
    const qs = filtersToParams(f, false);
    expect(qs.toString()).toBe("template=TOWERNET&stato=KO&q=Via+Roma&da=2026-01-01&a=2026-01-31&tutte=1&ordine=updated_desc");
    expect(filtersFromParams(qs, false)).toEqual(f);
  });

  it("listHref: the list or the archive with the same query", () => {
    expect(listHref({ templateId: "ILIAD", stato: "ASSEGNATO", scope: "all" })).toBe("/pratiche?template=ILIAD&stato=ASSEGNATO&tutte=1");
    expect(listHref({ archived: true, q: "x", scope: "all" })).toBe("/pratiche/archivio?q=x");
    expect(listHref({})).toBe("/pratiche");
  });
});

describe("PraticheList and the address", () => {
  it("opens with the filters of the link", async () => {
    nav.params = new URLSearchParams("template=ILIAD&stato=ASSEGNATO&q=Roma&da=2026-10-01&a=2026-10-31&tutte=1&ordine=created_desc");
    render(<PraticheList />);
    await waitFor(() => expect(calls.list.length).toBeGreaterThan(0));
    expect(lastList()).toMatchObject({
      templateId: "ILIAD",
      stato: "ASSEGNATO",
      q: "Roma",
      from: "2026-10-01",
      to: "2026-10-31",
      scope: "all",
      sort: "created_desc",
    });
    expect(screen.getByTestId("pratiche-search-input")).toHaveValue("Roma");
    expect(screen.getByLabelText("Creata dal")).toHaveValue("01/10/2026");
    expect(screen.getByTestId("filter-scope")).toHaveAttribute("aria-checked", "true");
    // Already normalised: nothing to write back.
    await new Promise((r) => setTimeout(r, 300));
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("writes the filters back to the address as they change (search debounced)", async () => {
    nav.params = new URLSearchParams("template=ILIAD");
    render(<PraticheList />);
    fireEvent.click(screen.getByTestId("filter-scope"));
    fireEvent.change(screen.getByTestId("pratiche-search-input"), { target: { value: "Ro" } });
    fireEvent.change(screen.getByTestId("pratiche-search-input"), { target: { value: "Roma " } });
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenLastCalledWith("/pratiche?template=ILIAD&q=Roma&tutte=1", { scroll: false });
  });

  it("the client select keeps the other filters in the address", async () => {
    nav.params = new URLSearchParams("stato=KO&tutte=1");
    render(<PraticheList />);
    fireEvent.click(screen.getByTestId("filter-template"));
    fireEvent.click(await screen.findByRole("option", { name: /TOWERNET/i }));
    expect(nav.replace).toHaveBeenCalledWith("/pratiche?template=TOWERNET&stato=KO&tutte=1", { scroll: false });
  });

  it("a new address from outside (a link, back) resets the filters to it", async () => {
    nav.params = new URLSearchParams("stato=KO&q=Roma");
    const view = render(<PraticheList />);
    await waitFor(() => expect(lastList()).toMatchObject({ stato: "KO", q: "Roma" }));
    nav.params = new URLSearchParams("template=TOWERNET&ordine=created_desc");
    view.rerender(<PraticheList />);
    await waitFor(() => expect(lastList()).toMatchObject({ templateId: "TOWERNET", sort: "created_desc" }));
    expect(lastList().stato).toBeUndefined();
    expect(lastList().q).toBeUndefined();
    expect(screen.getByTestId("pratiche-search-input")).toHaveValue("");
  });

  it("the archive writes to its own path without the scope", async () => {
    nav.pathname = "/pratiche/archivio";
    nav.params = new URLSearchParams("tutte=1");
    render(<PraticheList mode="archive" />);
    fireEvent.change(screen.getByTestId("pratiche-search-input"), { target: { value: "Torino" } });
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/pratiche/archivio?q=Torino", { scroll: false }));
    expect(lastList()).toMatchObject({ archived: true, scope: "assigned" });
  });
});
