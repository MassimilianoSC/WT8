import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { FieldChange } from "@/lib/contract";
import { buildRepeatIndex } from "@/components/scheda/conditions";
import { buildSheetFromTemplate, defaultOpenSections } from "@/components/scheda/layout";
import { SheetSections } from "@/components/scheda/sections";
import { TransversalPanel } from "@/components/scheda/transversal-panel";
import { MOCK_DETAIL, MOCK_OPTIONS, MOCK_TEMPLATE } from "@/components/scheda/mock-template";

const groups = buildSheetFromTemplate(MOCK_TEMPLATE);

function Harness({
  onChange,
  lockedReason,
  manualLocks = [],
}: {
  onChange: (c: FieldChange) => void;
  lockedReason?: string;
  manualLocks?: string[];
}) {
  const [open, setOpen] = React.useState(() => defaultOpenSections(groups, ["PM_PERMESSI"]));
  return (
    <SheetSections
      groups={groups}
      data={{ values: MOCK_DETAIL.values, repeats: MOCK_DETAIL.repeats, repeatOf: buildRepeatIndex(MOCK_TEMPLATE) }}
      access={MOCK_DETAIL.access}
      repeatAccess={MOCK_DETAIL.repeatAccess}
      alerts={MOCK_DETAIL.alerts}
      enabledGroups={MOCK_DETAIL.enabledGroups}
      open={open}
      onOpenChange={setOpen}
      lockedReason={lockedReason}
      constraints={MOCK_TEMPLATE.constraints}
      manualLocks={manualLocks}
      getOptions={(list) => ({ options: MOCK_OPTIONS[list.listId] ?? [] })}
      onChange={onChange}
    />
  );
}

function renderSheet(onChange = vi.fn<(c: FieldChange) => void>(), lockedReason?: string, manualLocks?: string[]) {
  render(<Harness onChange={onChange} lockedReason={lockedReason} manualLocks={manualLocks} />);
  return onChange;
}

describe("SheetSections", () => {
  it("opens the user's group sections and keeps the others closed", () => {
    renderSheet();
    expect(screen.getByTestId("field-F020@PM_PERMESSI.FASE_PRELIMINARE")).toBeInTheDocument();
    expect(screen.queryByTestId("field-F080@UT_PE.UT")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("sheet-group-AIE")).getByText("Non ancora assegnato")).toBeInTheDocument();
  });

  it("shows mirrors in the pop-up as read-only with the reason", () => {
    renderSheet();
    const popup = screen.getByTestId("popup-PM_PERMESSI.FASE_PRELIMINARE.POPUP_UT");
    expect(within(popup).getByText("Da UT/PE")).toBeInTheDocument();
    expect(within(popup).getAllByText("Compilato da UT/PE")).toHaveLength(2);
    expect(within(popup).getByText("15/10/2026")).toBeInTheDocument();
  });

  it("shows non-overridable computed fields read-only with their formula", () => {
    renderSheet();
    expect(screen.getByText("Calcolato: Assegnazione Geologica + 15 giorni di calendario")).toBeInTheDocument();
  });

  it("lets the user override a computed field and says the calculation stops (D-42)", () => {
    renderSheet();
    const field = screen.getByTestId("field-F051@PM_PERMESSI.ITER_AUTORIZZATIVO");
    expect(within(field).getByDisplayValue("26/11/2026")).toBeInTheDocument();
    expect(
      within(field).getByText("Calcolato: Protocollo + 67 giorni di calendario · una modifica a mano ferma il calcolo")
    ).toBeInTheDocument();
  });

  it("marks a computed field set by hand", () => {
    renderSheet(undefined, undefined, ["F051"]);
    const field = screen.getByTestId("field-F051@PM_PERMESSI.ITER_AUTORIZZATIVO");
    expect(within(field).getByText("Impostato a mano: il calcolo automatico è fermo")).toBeInTheDocument();
  });

  it("renders the 11 Vincoli rows and edits a state as a constraint change", () => {
    const onChange = renderSheet();
    const table = screen.getByTestId("repeat-VINCOLI");
    expect(within(table).getAllByRole("row")).toHaveLength(12); // header + 11
    const parco = within(table).getByTestId("vincolo-PARCO");
    fireEvent.click(within(parco).getAllByRole("combobox")[0]);
    fireEvent.click(screen.getByRole("option", { name: "Presente" }));
    expect(onChange).toHaveBeenCalledWith({ repeat: "VINCOLI", rowId: "vinc-PARCO", constraint: { stato: { code: "PRESENTE" } } });
    expect(within(within(table).getByTestId("vincolo-MONUMENTALE")).getByText("Soprintendenza")).toBeInTheDocument();
  });

  it("offers Nessuno in user fields with allowNone", () => {
    const onChange = renderSheet();
    const field = screen.getByTestId("field-F021@PM_PERMESSI.FASE_PRELIMINARE");
    fireEvent.click(within(field).getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Nessuno" }));
    expect(onChange).toHaveBeenCalledWith({
      occurrenceKey: "F021@PM_PERMESSI.FASE_PRELIMINARE",
      flowId: "F021",
      value: { code: "NESSUNO" },
    });
  });

  it("evaluates conditions per repeat row", () => {
    renderSheet();
    expect(within(screen.getByTestId("repeat-row-ARPA-arpa-1")).getByText("Esito parere Arpa")).toBeInTheDocument();
    expect(within(screen.getByTestId("repeat-row-ARPA-arpa-2")).queryByText("Esito parere Arpa")).not.toBeInTheDocument();
  });

  it("adds rows to free repeat groups but not to the fixed Vincoli table", () => {
    const onChange = renderSheet();
    fireEvent.click(screen.getByTestId("repeat-add-ARPA"));
    expect(onChange).toHaveBeenCalledWith({ repeat: "ARPA", op: "ADD_ROW", clientRowKey: expect.any(String) });
    expect(screen.queryByTestId("repeat-add-VINCOLI")).not.toBeInTheDocument();
  });

  it("removes a repeat row only after the app's confirmation dialog (no window.confirm)", async () => {
    const onChange = renderSheet();
    const native = vi.spyOn(window, "confirm");
    const arpa = screen.getByTestId("repeat-ARPA");
    fireEvent.click(within(arpa).getAllByRole("button", { name: /Rimuovi/ })[0]);
    expect(await screen.findByTestId("confirm-dialog")).toHaveTextContent("Rimuovere");
    fireEvent.click(screen.getByTestId("confirm-dialog-cancel"));
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ op: "REMOVE_ROW" }));
    fireEvent.click(within(arpa).getAllByRole("button", { name: /Rimuovi/ })[0]);
    fireEvent.click(await screen.findByTestId("confirm-dialog-ok"));
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ repeat: "ARPA", op: "REMOVE_ROW" })));
    expect(native).not.toHaveBeenCalled();
  });

  it("emits a simple field change on edit", () => {
    const onChange = renderSheet();
    const field = screen.getByTestId("field-F003@PM_PERMESSI.CORE_ANAGRAFICA_SITO");
    fireEvent.change(within(field).getByRole("textbox"), { target: { value: "Milano Duomo" } });
    expect(onChange).toHaveBeenCalledWith({
      occurrenceKey: "F003@PM_PERMESSI.CORE_ANAGRAFICA_SITO",
      flowId: "F003",
      value: "Milano Duomo",
    });
  });

  it("locks every field and row command on a past iteration", () => {
    renderSheet(undefined, "Iterazione 1: sola lettura");
    const field = screen.getByTestId("field-F003@PM_PERMESSI.CORE_ANAGRAFICA_SITO");
    expect(within(field).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(field).getByText("Iterazione 1: sola lettura")).toBeInTheDocument();
    expect(screen.queryByTestId("repeat-add-ARPA")).not.toBeInTheDocument();
  });

  it("opens a closed section when the user expands it", () => {
    renderSheet();
    fireEvent.click(screen.getByTestId("section-trigger-UT_PE.UT"));
    expect(screen.getByTestId("field-F080@UT_PE.UT")).toBeInTheDocument();
  });

  it("highlights fields with an open alert", () => {
    renderSheet();
    const field = screen.getByTestId("field-F020@PM_PERMESSI.FASE_PRELIMINARE");
    expect(within(field).getByText(MOCK_DETAIL.alerts[0].label)).toBeInTheDocument();
  });
});

describe("TransversalPanel", () => {
  it("shows Fatturabile as automatic and emits typed changes", () => {
    const onChange = vi.fn<(c: FieldChange) => void>();
    render(
      <TransversalPanel
        values={MOCK_DETAIL.transversal}
        occurrences={MOCK_TEMPLATE.transversal}
        access={MOCK_DETAIL.access}
        onChange={onChange}
      />
    );
    expect(screen.getByText("automatico")).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId("trasv-fatturato")).getByText("SÌ"));
    expect(onChange).toHaveBeenCalledWith({ transversal: "fatturato", value: "SI" });
    const note = screen.getByLabelText("Note Operative PM/Permessi");
    fireEvent.change(note, { target: { value: "Accesso solo con custode" } });
    fireEvent.blur(note);
    expect(onChange).toHaveBeenCalledWith({ transversal: "noteOperative", group: "PM_PERMESSI", value: "Accesso solo con custode" });
  });

  it("shows one note per visible group: the own editable, the others read-only, the hidden ones absent (D-121)", () => {
    render(
      <TransversalPanel
        values={MOCK_DETAIL.transversal}
        occurrences={MOCK_TEMPLATE.transversal}
        access={MOCK_DETAIL.access}
        onChange={vi.fn()}
      />
    );
    expect(within(screen.getByTestId("note-PM_PERMESSI")).getByRole("textbox")).toBeInTheDocument();
    const ut = screen.getByTestId("note-UT_PE");
    expect(within(ut).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(ut).getByText("[demo] Sopralluogo da fissare con il custode")).toBeInTheDocument();
    expect(within(ut).getByText("Di competenza di UT/PE")).toBeInTheDocument();
    expect(screen.queryByTestId("note-AIE")).not.toBeInTheDocument();
    expect(screen.queryByTestId("note-DL")).not.toBeInTheDocument();
  });

  it("says when no note is visible", () => {
    render(
      <TransversalPanel
        values={{ ...MOCK_DETAIL.transversal, noteOperative: {} }}
        occurrences={MOCK_TEMPLATE.transversal}
        access={MOCK_DETAIL.access}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText("Nessuna nota visibile per il tuo gruppo.")).toBeInTheDocument();
  });
});
