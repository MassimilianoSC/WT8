import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { MeDTO, MembershipDTO } from "@/lib/contract";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/andamento" }));
vi.mock("@/components/pratiche/data-source", () => ({
  listTemplates: vi.fn(async () => [
    { id: "ILIAD", label: "ILIAD", baseline: "" },
    { id: "INWIT", label: "INWIT", baseline: "" },
  ]),
}));

vi.mock("@/components/andamento/andamento-source", () => ({
  loadStati: vi.fn(() => new Promise(() => {})),
  loadFerme: vi.fn(() => new Promise(() => {})),
  loadFlussi: vi.fn(() => new Promise(() => {})),
  loadRilavorazioni: vi.fn(() => new Promise(() => {})),
  loadGruppi: vi.fn(() => new Promise(() => {})),
  loadScadenze: vi.fn(() => new Promise(() => {})),
  csvHref: vi.fn(() => "#"),
  CSV_READY: false,
}));

import { andamentoOn, canSeeAndamento, isDirezione, isDirezionePura } from "@/components/andamento/access";
import { andamentoHref, defaultFilters, filtersFromParams, presetRange, weeksIn } from "@/components/andamento/andamento-url";
import { AndamentoView } from "@/components/andamento/andamento-view";
import { canSeeStats, membershipSummary, statsTemplates, visibleTemplates, workloadScope } from "@/components/me/me-derive";
import { shellAssistantOf, shellUserOf } from "@/components/layout/shell-user";
import { ConfigNav } from "@/components/layout/config-nav";
import { demoStatus } from "@/components/__fixtures__/demo-assistant";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
});
beforeEach(() => vi.clearAllMocks());

const UT: MembershipDTO = { templateId: "ILIAD", group: "UT_PE", role: "UT", leader: false };
function me(extra: Record<string, unknown> = {}, memberships: MembershipDTO[] = [UT]): MeDTO {
  return {
    id: "u", name: "U", email: "u@x.it", status: "active", isAdmin: false, memberships, canCreate: [], mustChangePassword: false,
    createdAt: "2026-09-01T09:00:00+02:00", updatedAt: "2026-09-01T09:00:00+02:00", ...extra,
  } as MeDTO;
}
const ON = { features: { andamento: true } };

describe("switch off (PH_ANDAMENTO missing): the app is exactly as before (§15.1)", () => {
  it("no Andamento, and a stored direzione gives nothing", () => {
    for (const m of [me(), me({ direzione: true }, []), me({ isAdmin: true }), me({ features: { andamento: false }, direzione: true })]) {
      expect(andamentoOn(m)).toBe(false);
      expect(canSeeAndamento(m)).toBe(false);
      expect(isDirezione(m)).toBe(false);
    }
    const direzioneOff = me({ direzione: true }, []);
    expect(canSeeStats(direzioneOff)).toBe(false);
    expect(statsTemplates(direzioneOff)).toEqual([]);
    expect(shellUserOf({ name: "U" }, direzioneOff)).toMatchObject({ canAndamento: false, direzione: false });
  });

  it("the menu has no Andamento entry and keeps its order", () => {
    render(<ConfigNav isAdmin isLeader={false} canStats />);
    const entries = screen.getAllByRole("link").map((a) => a.textContent);
    expect(entries.slice(0, 2)).toEqual(["Notifiche", "Statistiche"]);
    expect(entries).not.toContain("Andamento");
  });
});

describe("switch on: Andamento and the Direzione permission (§15.2, D-193)", () => {
  it("ADMIN and Direzione open Andamento; others do not", () => {
    expect(canSeeAndamento(me({ ...ON, isAdmin: true }))).toBe(true);
    expect(canSeeAndamento(me({ ...ON, direzione: true }))).toBe(true);
    expect(canSeeAndamento(me(ON))).toBe(false);
  });

  it("Direzione is on top of the memberships: list per client, assistant and menu as before, plus Andamento and every Statistiche", () => {
    const manager = me({ ...ON, direzione: true, assistant: demoStatus() });
    expect(isDirezione(manager)).toBe(true);
    expect(isDirezionePura(manager)).toBe(false);
    expect(visibleTemplates(manager)).toEqual(["ILIAD"]);
    expect(statsTemplates(manager)).toBeNull();
    expect(workloadScope(manager)).toBeNull();
    expect(shellUserOf({ name: "U" }, manager)).toMatchObject({ canAndamento: true, canStats: true, direzione: false, templateIds: ["ILIAD"] });
    expect(shellAssistantOf(manager)).toBeDefined();
    expect(membershipSummary(manager)).toBe("Direzione — UT · ILIAD");
  });

  it("Direzione without memberships: short menu, no assistant, starts on Andamento", () => {
    const pure = me({ ...ON, direzione: true, assistant: demoStatus() }, []);
    expect(isDirezionePura(pure)).toBe(true);
    expect(shellUserOf({ name: "U" }, pure)).toMatchObject({ direzione: true, canAndamento: true, canStats: true });
    expect(shellAssistantOf(pure)).toBeUndefined();
    render(<ConfigNav isAdmin={false} isLeader={false} canStats canAndamento />);
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual(["Andamento", "Notifiche", "Statistiche"]);
  });

  it("ADMIN wins over Direzione", () => {
    expect(isDirezione(me({ ...ON, isAdmin: true, direzione: true }, []))).toBe(false);
  });
});

describe("filters in the address (UX note §2)", () => {
  const TODAY = new Date(2026, 9, 11);

  it("defaults: every client, the last 12 months by month, against the previous period; a plain address stays plain", () => {
    const d = defaultFilters(TODAY);
    expect(d).toEqual({ templateId: null, from: "2025-11-01", to: "2026-10-11", passo: "mese", confronto: "precedente" });
    expect(andamentoHref(d, TODAY)).toBe("/andamento");
  });

  it("reads and writes template, da, a, passo, confronto; invalid values fall back", () => {
    const f = filtersFromParams(new URLSearchParams("template=ILIAD&da=2025-10-01&a=2026-09-30&passo=settimana&confronto=anno"), TODAY);
    expect(f).toEqual({ templateId: "ILIAD", from: "2025-10-01", to: "2026-09-30", passo: "settimana", confronto: "anno" });
    expect(andamentoHref(f, TODAY)).toBe("/andamento?template=ILIAD&da=2025-10-01&a=2026-09-30&passo=settimana&confronto=anno");
    const bad = filtersFromParams(new URLSearchParams("template=XYZ&da=2026-10-05&a=2026-10-01&passo=giorno"), TODAY);
    expect(bad).toEqual(defaultFilters(TODAY));
  });

  it("period buttons end today; weeks are counted for the 26-week limit", () => {
    expect(presetRange("trimestre", TODAY)).toEqual({ from: "2026-07-12", to: "2026-10-11" });
    expect(weeksIn("2026-01-01", "2026-06-30")).toBe(26);
    expect(weeksIn("2025-11-01", "2026-10-11")).toBeGreaterThan(26);
  });
});

describe("AndamentoView", () => {
  it("writes the address on every change; weekly step is offered only up to 26 weeks", async () => {
    render(<AndamentoView initial={{ templateId: null, from: "2026-07-12", to: "2026-10-11", passo: "mese", confronto: "precedente" }} />);
    fireEvent.click(screen.getByTestId("andamento-passo-settimana"));
    expect(router.replace).toHaveBeenLastCalledWith(expect.stringMatching(/passo=settimana/), { scroll: false });
    fireEvent.click(screen.getByTestId("andamento-confronto-anno"));
    expect(router.replace).toHaveBeenLastCalledWith(expect.stringMatching(/confronto=anno/), { scroll: false });
    // A year is more than 26 weeks: back to months, and the weekly button is off.
    fireEvent.click(screen.getByTestId("andamento-preset-anno"));
    expect(router.replace).toHaveBeenLastCalledWith(expect.not.stringMatching(/passo=settimana/), { scroll: false });
    expect(screen.getByTestId("andamento-passo-settimana")).toBeDisabled();
    expect(screen.getByText("Per settimana fino a 26 settimane.")).toBeInTheDocument();
  });
});
