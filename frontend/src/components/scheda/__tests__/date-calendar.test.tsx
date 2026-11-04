import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DateCalendar, monthGrid } from "@/components/scheda/fields/date-calendar";
import { DateInput } from "@/components/scheda/fields/date-input";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const TODAY = new Date(2026, 9, 11); // sabato 11 ottobre 2026
const day = (iso: string) => document.querySelector<HTMLButtonElement>(`[data-day="${iso}"]`)!;

describe("DateCalendar (D-190)", () => {
  it("Italian month, week from Monday, 6 rows; today marked, the written date selected", () => {
    render(<DateCalendar value="2026-10-05" onSelect={vi.fn()} today={TODAY} />);
    expect(screen.getByTestId("calendar-title")).toHaveTextContent("ottobre 2026");
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["lun", "mar", "mer", "gio", "ven", "sab", "dom"]);
    expect(within(screen.getByRole("grid")).getAllByRole("row")).toHaveLength(7);
    expect(day("2026-10-11")).toHaveAttribute("aria-current", "date");
    expect(day("2026-10-05").closest("td")).toHaveAttribute("aria-selected", "true");
    expect(day("2026-10-05")).toHaveAttribute("tabindex", "0");
    expect(day("2026-10-05")).toHaveAccessibleName("lunedì 5 ottobre 2026");
    // The grid starts on Monday 28 September.
    expect(monthGrid(TODAY)[0][0].getDate()).toBe(28);
  });

  it("arrows move the day, PgDn the month, Shift+PgUp the year, Home the Monday; Enter picks", () => {
    const onSelect = vi.fn();
    render(<DateCalendar value="2026-10-05" onSelect={onSelect} today={TODAY} />);
    const grid = screen.getByRole("grid");
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    expect(day("2026-10-13")).toHaveFocus();
    fireEvent.keyDown(grid, { key: "Home" });
    expect(day("2026-10-12")).toHaveFocus();
    fireEvent.keyDown(grid, { key: "PageDown" });
    expect(screen.getByTestId("calendar-title")).toHaveTextContent("novembre 2026");
    fireEvent.keyDown(grid, { key: "PageUp", shiftKey: true });
    expect(screen.getByTestId("calendar-title")).toHaveTextContent("novembre 2025");
    fireEvent.keyDown(grid, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("2025-11-12");
  });

  it("the arrows above change month and year; a click picks the day", () => {
    const onSelect = vi.fn();
    render(<DateCalendar value={null} onSelect={onSelect} today={TODAY} />);
    fireEvent.click(screen.getByRole("button", { name: "Mese successivo" }));
    fireEvent.click(screen.getByRole("button", { name: "Anno precedente" }));
    expect(screen.getByTestId("calendar-title")).toHaveTextContent("novembre 2025");
    fireEvent.click(day("2025-11-20"));
    expect(onSelect).toHaveBeenCalledWith("2025-11-20");
  });
});

describe("DateInput with the calendar", () => {
  it("still typed as gg/mm/aaaa; a picked day is written and emitted as if typed", async () => {
    const onChange = vi.fn();
    render(<DateInput id="d" value="2026-10-05" onChange={onChange} />);
    fireEvent.click(screen.getByTestId("d-calendar"));
    await screen.findByTestId("date-calendar");
    await waitFor(() => expect(day("2026-10-05")).toHaveFocus());
    fireEvent.click(day("2026-10-20"));
    expect(onChange).toHaveBeenCalledWith("2026-10-20");
    expect(screen.getByPlaceholderText("gg/mm/aaaa")).toHaveValue("20/10/2026");
    await waitFor(() => expect(screen.queryByTestId("date-calendar")).not.toBeInTheDocument());
  });

  it("a picked day goes through the same checks as typing", async () => {
    const onChange = vi.fn();
    render(<DateInput id="d" value={null} onChange={onChange} validate={(iso) => (iso > "2026-10-15" ? "Oltre il 15/10/2026" : null)} />);
    fireEvent.click(screen.getByTestId("d-calendar"));
    await screen.findByTestId("date-calendar");
    fireEvent.click(screen.getByRole("button", { name: "Mese successivo" }));
    fireEvent.click(screen.getAllByRole("gridcell")[20].querySelector("button")!);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("Oltre il 15/10/2026")).toBeInTheDocument();
  });

  it("never taller than the space left in the window: it scrolls inside (zoom 200%)", async () => {
    render(<DateInput id="d" value="2026-10-05" onChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId("d-calendar"));
    const content = (await screen.findByTestId("date-calendar")).closest("[data-radix-popper-content-wrapper] > *") as HTMLElement;
    expect(content.className).toContain("max-h-[var(--radix-popover-content-available-height)]");
    expect(content.className).toContain("overflow-y-auto");
  });

  it("read-only (disabled): no calendar", () => {
    render(<DateInput id="d" value="2026-10-05" onChange={vi.fn()} disabled />);
    expect(screen.queryByLabelText("Scegli la data dal calendario")).not.toBeInTheDocument();
  });
});
