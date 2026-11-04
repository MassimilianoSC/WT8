import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AssignDialog } from "@/components/scheda/assign-dialog";
import { StatoDialog } from "@/components/scheda/stato-dialog";
import { ConfirmCommandDialog } from "@/components/scheda/confirm-command-dialog";
import { MOCK_DETAIL } from "@/components/scheda/mock-template";
import { StatoBadge } from "@/components/pratiche/stato-badge";

describe("AssignDialog", () => {
  it("assigns several groups with the mail note, reusing the operation id on retry", async () => {
    const onRun = vi.fn().mockRejectedValueOnce(new Error("Rete non disponibile")).mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(<AssignDialog practice={MOCK_DETAIL} open onOpenChange={onOpenChange} hasPending={false} onRun={onRun} />);

    const submit = screen.getByTestId("assign-dialog-submit");
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByTestId("assign-group-AIE"));
    fireEvent.click(screen.getByTestId("assign-group-DL"));
    fireEvent.change(screen.getByLabelText("Nota per la mail (facoltativa)"), { target: { value: "Urgente" } });
    expect(submit).toHaveTextContent("Assegna a 2 gruppi");

    fireEvent.click(submit);
    expect(await screen.findByRole("alert")).toHaveTextContent("Rete non disponibile");
    expect(submit).toHaveTextContent("Riprova");
    fireEvent.click(submit);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

    expect(onRun).toHaveBeenNthCalledWith(1, { kind: "assign", groups: ["AIE", "DL"], note: "Urgente" }, expect.any(String));
    expect(onRun.mock.calls[1][1]).toBe(onRun.mock.calls[0][1]);
  });

  it("marks groups already assigned and blocks with unsaved edits", () => {
    render(<AssignDialog practice={MOCK_DETAIL} open onOpenChange={vi.fn()} hasPending onRun={vi.fn()} />);
    expect(screen.getByText("Hai modifiche non salvate nella scheda: salvale prima di assegnare.")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("assign-group-UT_PE"));
    expect(screen.getByText("già assegnato · nuova notifica")).toBeInTheDocument();
    expect(screen.getByTestId("assign-dialog-submit")).toBeDisabled();
  });
});

describe("StatoDialog", () => {
  it("sets a different state", async () => {
    const onRun = vi.fn().mockResolvedValue(undefined);
    render(<StatoDialog practice={MOCK_DETAIL} open onOpenChange={vi.fn()} onRun={onRun} />);
    expect(screen.getByTestId("stato-dialog-submit")).toBeDisabled();
    expect(within(screen.getByTestId("stato-option-PROTOCOLLATO")).getByText("attuale")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("stato-option-TERMINATO"));
    fireEvent.click(screen.getByTestId("stato-dialog-submit"));
    await waitFor(() => expect(onRun).toHaveBeenCalledWith({ kind: "stato", stato: "TERMINATO" }, expect.any(String)));
  });

  it("long labels wrap inside their own box, never over the next one (L9)", () => {
    render(<StatoDialog practice={MOCK_DETAIL} open onOpenChange={vi.fn()} onRun={vi.fn()} />);
    for (const s of ["INTEGRAZIONE_RICHIESTA", "IN_APPROVAZIONE"]) {
      const option = screen.getByTestId(`stato-option-${s}`);
      expect(option.className).toMatch(/\bmin-w-0\b/);
      const badge = within(option).getByTestId(`stato-badge-${s.toLowerCase()}`);
      expect(badge.className).toMatch(/max-w-full/);
      expect(badge.className).toMatch(/overflow-wrap:anywhere/);
      expect(badge.className).not.toMatch(/whitespace-nowrap/);
    }
  });
});

describe("StatoBadge", () => {
  it("stays on one line by default (list table, which scrolls); wraps only when asked", () => {
    const { rerender } = render(<StatoBadge stato="INTEGRAZIONE_RICHIESTA" />);
    expect(screen.getByTestId("stato-badge-integrazione_richiesta").className).toMatch(/whitespace-nowrap/);
    rerender(<StatoBadge stato="INTEGRAZIONE_RICHIESTA" wrap />);
    const badge = screen.getByTestId("stato-badge-integrazione_richiesta");
    expect(badge.className).not.toMatch(/whitespace-nowrap/);
    expect(badge).toHaveTextContent("INTEGRAZIONE RICHIESTA");
  });

  it("outline badges swap to lighter tints in the dark theme (contrast ≥ 4.5:1); filled ones do not", () => {
    render(
      <>
        <StatoBadge stato="CREATA" />
        <StatoBadge stato="STAND_BY" />
        <StatoBadge stato="ASSEGNATO" />
        <StatoBadge stato="TERMINATO" />
      </>
    );
    const creata = screen.getByTestId("stato-badge-creata");
    expect(creata.style.getPropertyValue("--badge")).toBe("#002EA6");
    expect(creata.style.getPropertyValue("--badge-dark")).toBe("#7EA2FF");
    expect(creata.className).toMatch(/dark:text-\[color:var\(--badge-dark\)\]/);
    expect(screen.getByTestId("stato-badge-stand_by").style.getPropertyValue("--badge-dark")).toBe("#A3A3A3");
    // Yellow keeps the foreground text; only its border and square take the signal.
    expect(screen.getByTestId("stato-badge-assegnato").className).not.toMatch(/text-\[color/);
    const terminato = screen.getByTestId("stato-badge-terminato");
    expect(terminato.style.backgroundColor).not.toBe("");
    expect(terminato.className).not.toMatch(/--badge/);
  });

  it("green reaches 4.5:1 in the light theme, outline and filled (#008550); the dark theme keeps the lighter green", () => {
    render(
      <>
        <StatoBadge stato="AUTORIZZATO" />
        <StatoBadge stato="TERMINATO" />
      </>
    );
    const autorizzato = screen.getByTestId("stato-badge-autorizzato");
    expect(autorizzato.style.getPropertyValue("--badge")).toBe("#008550");
    expect(autorizzato.style.getPropertyValue("--badge-dark")).toBe("#00A35C");
    expect(screen.getByTestId("stato-badge-terminato").style.backgroundColor).toBe("rgb(0, 133, 80)");
  });
});

describe("ConfirmCommandDialog", () => {
  it("asks to type the Codice Sito before deleting", async () => {
    const onRun = vi.fn().mockResolvedValue(undefined);
    render(<ConfirmCommandDialog kind="delete" practice={MOCK_DETAIL} onOpenChange={vi.fn()} onRun={onRun} />);
    expect(screen.getByText("Si cancellano solo pratiche in CREATA, mai ripresentate.")).toBeInTheDocument();
    const submit = screen.getByTestId("confirm-delete-submit");
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Per confermare scrivi il Codice Sito/), { target: { value: "MI1000" } });
    fireEvent.click(submit);
    await waitFor(() => expect(onRun).toHaveBeenCalledWith({ kind: "delete" }, expect.any(String)));
  });

  it("explains resubmission and passes the optional Codice G7", async () => {
    const onRun = vi.fn().mockResolvedValue(undefined);
    render(<ConfirmCommandDialog kind="resubmit" practice={MOCK_DETAIL} onOpenChange={vi.fn()} onRun={onRun} />);
    expect(screen.getByText(/Apre l'iterazione 2 della stessa pratica/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Codice G7 della nuova iterazione/), { target: { value: " 500 " } });
    fireEvent.click(screen.getByTestId("confirm-resubmit-submit"));
    await waitFor(() => expect(onRun).toHaveBeenCalledWith({ kind: "resubmit", codiceG7: "500" }, expect.any(String)));
  });

  it("renders nothing without a kind", () => {
    const { container } = render(
      <ConfirmCommandDialog kind={null} practice={MOCK_DETAIL} onOpenChange={vi.fn()} onRun={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
