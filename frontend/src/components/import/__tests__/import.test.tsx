import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
// Fixtures in place of the API (cutover: no demo data in the app).
vi.mock("@/components/import/import-source", async (orig) => ({
  ...(await orig<typeof import("@/components/import/import-source")>()),
  ...(await import("@/components/__fixtures__/demo-import")).demoImport,
}));

import { commitImport, pendingChoices, plannedSummary, previewImport } from "@/components/import/import-source";
import { ImportWizard, NO_OVERWRITE, REWORK_NOTE } from "@/components/import/import-wizard";
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

const FILE = new File(["x"], "sites.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

describe("demo import (§12)", () => {
  it("previews every outcome, recognised and unrecognised columns", async () => {
    const p = await previewImport(FILE, "INWIT");
    expect(p.rows.map((r) => r.outcome)).toEqual(["NEW_PRACTICE", "UPDATE", "REWORK", "AMBIGUOUS", "ERROR"]);
    expect(p.columns.some((c) => c.flowId === null)).toBe(true);
    expect(p.columns.find((c) => c.note?.includes("calcolato"))?.flowId).toBeTruthy();
    expect(p.rows[1].skipped.some((s) => s.reason === "ALREADY_FILLED")).toBe(true);
    expect(p.rows[3].candidates?.length).toBe(2);
  });

  it("requires a choice for ambiguous rows, then summarises", async () => {
    const p = await previewImport(FILE, "INWIT");
    expect(pendingChoices(p, [])).toEqual([4]);
    await expect(commitImport(p, { operationId: "op" })).rejects.toMatchObject({ status: 422 });
    const choices = [{ rowIndex: 4, action: "SKIP" as const }];
    expect(plannedSummary(p, choices)).toEqual({ created: 1, updated: 1, reworks: 1, skipped: 2 });
    const r = await commitImport(p, { operationId: "op", choices });
    expect(r).toMatchObject({ created: 1, updated: 1, reworks: 1, skipped: 1 });
    expect(r.failed).toHaveLength(1);
  });
});

describe("ImportWizard", () => {
  async function toPreview() {
    render(<ImportWizard />);
    const trigger = await screen.findByTestId("import-template");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    const option = await screen.findByRole("option", { name: "INWIT" });
    option.focus();
    fireEvent.keyDown(option, { key: "Enter" });
    fireEvent.change(screen.getByTestId("import-file"), { target: { files: [FILE] } });
    fireEvent.click(screen.getByTestId("import-analyse"));
    return screen.findByTestId("import-step-preview");
  }

  it("states that nothing is ever overwritten, from the first step", () => {
    render(<ImportWizard />);
    expect(screen.getByTestId("import-no-overwrite")).toHaveTextContent(NO_OVERWRITE);
    expect(screen.getByTestId("import-analyse")).toBeDisabled();
  });

  it("explains rows: rework, skipped fields with the column note, errors", async () => {
    await toPreview();
    expect(within(screen.getByTestId("import-row-3")).getByText(REWORK_NOTE)).toBeInTheDocument();
    const updateRow = screen.getByTestId("import-row-2");
    fireEvent.click(within(updateRow).getByText("Riga 2"));
    expect(within(updateRow).getAllByText("già compilato: non viene sovrascritto").length).toBeGreaterThan(0);
    // One message per skipped field: the readable detail when the server gives one (v0.3.6, D-138), not also the generic reason.
    expect(within(updateRow).getByText("data non riconosciuta: 31/02/2026")).toBeInTheDocument();
    expect(within(updateRow).queryByText("valore non valido")).not.toBeInTheDocument();
    const newRow = screen.getByTestId("import-row-1");
    fireEvent.click(within(newRow).getByText("Riga 1"));
    expect(within(newRow).getByText("Non importabile: campo calcolato")).toBeInTheDocument();
    expect(within(screen.getByTestId("import-row-5")).getByText(/Nome Sito mancante/)).toBeInTheDocument();
  });

  it("blocks the confirmation until ambiguous rows are decided, then shows the result", async () => {
    await toPreview();
    const confirm = screen.getByTestId("import-confirm");
    expect(confirm).toBeDisabled();
    fireEvent.click(within(screen.getByTestId("import-choice-4")).getAllByRole("radio")[0]);
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    const dialog = screen.getByTestId("import-confirm-dialog");
    expect(dialog).toHaveTextContent("Verranno create 1 pratiche, aggiornate 2, rilavorazioni 1; saltate 1 righe.");
    fireEvent.click(screen.getByTestId("import-confirm-dialog-submit"));
    const result = await screen.findByTestId("import-result");
    expect(result).toHaveTextContent("Import completato");
    expect(result).toHaveTextContent("Righe non importate: 1");
    // The only failure is an ERROR row of the preview: retrying would not help.
    expect(screen.queryByTestId("import-retry")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("import-restart"));
    await waitFor(() => expect(screen.getByTestId("import-step-upload")).toBeInTheDocument());
  });
});
