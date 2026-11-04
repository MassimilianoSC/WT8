import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ImportCommitRequest, ImportPreviewDTO, ImportResultDTO } from "@/lib/contract";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

const commit = vi.hoisted(() => vi.fn<(p: ImportPreviewDTO, r: ImportCommitRequest) => Promise<ImportResultDTO>>());
vi.mock("@/components/import/import-source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/import/import-source")>()),
  ...(await import("@/components/__fixtures__/demo-import")).demoImport,
  commitImport: commit,
}));

import { previewImport } from "@/components/import/import-source";
import { ImportWizard } from "@/components/import/import-wizard";
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
  commit.mockReset();
});

const FILE = new File(["x"], "sites.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

describe("ImportWizard retry", () => {
  it("retries the rows failed at commit with the SAME operationId and shows the new result", async () => {
    const preview = await previewImport(FILE, "INWIT");
    const newRow = preview.rows.find((r) => r.outcome === "NEW_PRACTICE")!.rowIndex;
    commit
      .mockResolvedValueOnce({ created: 0, updated: 2, reworks: 1, skipped: 1, failed: [{ rowIndex: newRow, error: "Conflitto di scrittura, riprova" }] })
      .mockResolvedValueOnce({ created: 1, updated: 2, reworks: 1, skipped: 1, failed: [] });

    render(<ImportWizard />);
    const trigger = await screen.findByTestId("import-template");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    const option = await screen.findByRole("option", { name: "INWIT" });
    option.focus();
    fireEvent.keyDown(option, { key: "Enter" });
    fireEvent.change(screen.getByTestId("import-file"), { target: { files: [FILE] } });
    fireEvent.click(screen.getByTestId("import-analyse"));
    await screen.findByTestId("import-step-preview");
    const ambiguous = preview.rows.find((r) => r.outcome === "AMBIGUOUS")!.rowIndex;
    fireEvent.click(within(screen.getByTestId(`import-choice-${ambiguous}`)).getAllByRole("radio")[0]);
    fireEvent.click(screen.getByTestId("import-confirm"));
    fireEvent.click(screen.getByTestId("import-confirm-dialog-submit"));

    const result = await screen.findByTestId("import-result");
    expect(result).toHaveTextContent(`Riga ${newRow}: Conflitto di scrittura, riprova`);
    fireEvent.click(screen.getByTestId("import-retry"));
    await waitFor(() => expect(commit).toHaveBeenCalledTimes(2));
    const [first, second] = commit.mock.calls.map((c) => c[1]);
    expect(second.operationId).toBe(first.operationId);
    expect(second.choices).toEqual(first.choices);
    await waitFor(() => expect(screen.queryByText(/Righe non importate/)).not.toBeInTheDocument());
    expect(screen.queryByTestId("import-retry")).not.toBeInTheDocument();
  });
});
