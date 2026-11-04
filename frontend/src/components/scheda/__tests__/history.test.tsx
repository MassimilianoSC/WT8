import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { HistoryEntryDTO, HistoryResponse } from "@/lib/contract";
import { MOCK_TEMPLATE } from "@/components/scheda/mock-template";
import { HistoryPanel } from "@/components/scheda/history";

function deferred() {
  let resolve!: (r: HistoryResponse) => void;
  const promise = new Promise<HistoryResponse>((r) => (resolve = r));
  return { promise, resolve };
}

const entry = (id: string, detail: string) =>
  ({ id, practiceId: "p1", iteration: 1, kind: "ASSIGN", source: "USER", detail, userName: "Admin", timestamp: "2026-10-09T08:00:00Z" }) as HistoryEntryDTO;

describe("HistoryPanel", () => {
  it("ignores a slower answer of the previous tab (fields arriving after events)", async () => {
    const calls: Record<string, ReturnType<typeof deferred>> = {};
    const load = (_id: string, _it: number, _page: number, view: string) => {
      calls[view] = deferred();
      return calls[view].promise;
    };
    render(<HistoryPanel practiceId="p1" iteration={1} template={MOCK_TEMPLATE} repeats={{}} load={load} />);
    fireEvent.click(screen.getByTestId("history-tab-events"));
    calls.events.resolve({ items: [entry("e1", "Assegnata a AIE")], total: 1, page: 1, pageSize: 50 });
    await screen.findByText("Assegnata a AIE");
    calls.fields.resolve({ items: [entry("f1", "voce dei campi")], total: 1, page: 1, pageSize: 50 });
    await waitFor(() => expect(screen.getByText("1 di 1 voci caricate", { exact: false })).toBeInTheDocument());
    expect(screen.queryByText("voce dei campi")).not.toBeInTheDocument();
    expect(screen.getByText("Assegnata a AIE")).toBeInTheDocument();
  });

  it("reloads after a save or a row change (new revision), without reloading the page", async () => {
    let n = 0;
    const load = async () => {
      n++;
      return { items: [entry(`f${n}`, `voce ${n}`)], total: 1, page: 1, pageSize: 50 } as HistoryResponse;
    };
    const view = render(<HistoryPanel practiceId="p1" iteration={1} template={MOCK_TEMPLATE} repeats={{}} load={load} revision={3} />);
    await screen.findByText("voce 1");
    view.rerender(<HistoryPanel practiceId="p1" iteration={1} template={MOCK_TEMPLATE} repeats={{}} load={load} revision={4} />);
    await screen.findByText("voce 2");
    expect(screen.queryByText("voce 1")).not.toBeInTheDocument();
  });
});
