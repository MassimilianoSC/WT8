import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CommandDialogShell } from "@/components/scheda/command-dialog-shell";
import { Combobox } from "@/components/scheda/fields/combobox";
import { DateInput } from "@/components/scheda/fields/date-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * C1 (collaudo): in Nuova pratica the Committente / Cliente Finale menus did not
 * scroll with the mouse wheel. The modal Dialog locks scrolling (react-remove-scroll)
 * and lets through only events inside its own content; the menu is portalled to
 * <body>, outside it, so its wheel events were cancelled.
 */

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});

const OPTIONS = Array.from({ length: 40 }, (_, i) => ({ code: `C${i}`, label: `Committente ${i}` }));

/** jsdom has no layout: give `el` the sizes of a scrollable box (taller content than its height), as in a browser. */
function scrollable(el: HTMLElement) {
  el.style.overflowY = "auto";
  Object.defineProperty(el, "scrollHeight", { configurable: true, value: 1000 });
  Object.defineProperty(el, "clientHeight", { configurable: true, value: 200 });
}

/** A wheel event on `el`: was it cancelled by a scroll lock? */
function wheelCancelled(el: Element): boolean {
  const e = new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e.defaultPrevented;
}

function InDialog({ children }: { children: React.ReactNode }) {
  return (
    <CommandDialogShell open onOpenChange={vi.fn()} title="Nuova pratica" submitLabel="Crea pratica" onSubmit={vi.fn()} testId="d">
      {children}
    </CommandDialogShell>
  );
}

describe("menus inside a dialog scroll with the mouse wheel (C1)", () => {
  it("Combobox list", async () => {
    render(
      <InDialog>
        <Combobox id="c" options={OPTIONS} allowOther value={null} onChange={vi.fn()} />
      </InDialog>
    );
    fireEvent.click(screen.getByRole("combobox"));
    const list = await screen.findByRole("listbox");
    // The list is portalled out of the dialog content, as before.
    expect(screen.getByTestId("d").contains(list)).toBe(false);
    scrollable(list);
    expect(wheelCancelled(list.querySelector('[role="option"]')!)).toBe(false);
  });

  it("date calendar", async () => {
    render(
      <InDialog>
        <DateInput id="data" value="2026-10-12" onChange={vi.fn()} />
      </InDialog>
    );
    fireEvent.click(screen.getByTestId("data-calendar"));
    const cal = await screen.findByTestId("date-calendar");
    // The popover box scrolls when the month is taller than the window (zoom 200%).
    scrollable(cal.parentElement!);
    expect(wheelCancelled(cal)).toBe(false);
  });

  it("Select menus (Utenti, Liste, Soglie, Import) already lock around themselves: they scroll too", async () => {
    render(
      <InDialog>
        <Select open value="A" onValueChange={vi.fn()}>
          <SelectTrigger aria-label="Gestore">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["A", "B", "C"].map((v) => (
              <SelectItem key={v} value={v}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </InDialog>
    );
    const listbox = await screen.findByRole("listbox");
    scrollable(listbox);
    expect(wheelCancelled(screen.getAllByRole("option")[0])).toBe(false);
  });

  it("the page behind the dialog still does not scroll", () => {
    render(
      <InDialog>
        <Combobox id="c" options={OPTIONS} allowOther value={null} onChange={vi.fn()} />
      </InDialog>
    );
    expect(wheelCancelled(document.body)).toBe(true);
  });
});
