import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DateInput } from "@/components/scheda/fields/date-input";
import { NumberInput } from "@/components/scheda/fields/number-input";
import { Combobox } from "@/components/scheda/fields/combobox";
import { Field, readOnlyReason } from "@/components/scheda/fields/field";
import { MOCK_TEMPLATE } from "@/components/scheda/mock-template";

describe("DateInput", () => {
  it("masks typing and emits the ISO date on blur", () => {
    const onChange = vi.fn();
    render(<DateInput value={null} onChange={onChange} />);
    const input = screen.getByPlaceholderText("gg/mm/aaaa");
    fireEvent.change(input, { target: { value: "08102026" } });
    expect(input).toHaveValue("08/10/2026");
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith("2026-10-08");
  });

  it("rejects impossible dates without emitting", () => {
    const onChange = vi.fn();
    render(<DateInput value={null} onChange={onChange} />);
    const input = screen.getByPlaceholderText("gg/mm/aaaa");
    fireEvent.change(input, { target: { value: "31/02/2026" } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("Data non valida (gg/mm/aaaa)")).toBeInTheDocument();
  });

  it("emits null when cleared", () => {
    const onChange = vi.fn();
    render(<DateInput value="2026-10-08" onChange={onChange} />);
    const input = screen.getByDisplayValue("08/10/2026");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(null);
  });
});

describe("NumberInput", () => {
  it("accepts the Italian comma and enforces the range", () => {
    const onChange = vi.fn();
    render(<NumberInput value={null} onChange={onChange} min={-90} max={90} placeholder="lat" />);
    const input = screen.getByPlaceholderText("lat");
    fireEvent.change(input, { target: { value: "45,4642" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(45.4642);
    fireEvent.change(input, { target: { value: "120" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Numero tra -90 e 90")).toBeInTheDocument();
  });
});

describe("Combobox", () => {
  const options = [
    { code: "RAW_LAND", label: "Raw Land" },
    { code: "ROOF_TOP", label: "Roof Top" },
  ];

  it("filters by search and selects an option", () => {
    const onChange = vi.fn();
    render(<Combobox options={options} allowOther={false} value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.change(screen.getByPlaceholderText("Cerca…"), { target: { value: "roof" } });
    expect(screen.queryByText("Raw Land")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Roof Top"));
    expect(onChange).toHaveBeenCalledWith({ code: "ROOF_TOP" });
  });

  it("forgets the search when it closes: new options are not filtered by an old query", () => {
    const { rerender } = render(<Combobox options={options} allowOther={false} value={null} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.change(screen.getByPlaceholderText("Cerca…"), { target: { value: "roof" } });
    fireEvent.click(screen.getByText("Roof Top"));
    // The parent changes the options (e.g. provinces of another region) and the menu reopens.
    rerender(<Combobox options={[{ code: "BG", label: "Bergamo" }]} allowOther={false} value={null} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByPlaceholderText("Cerca…")).toHaveValue("");
    expect(screen.getByText("Bergamo")).toBeInTheDocument();
  });

  it("offers Altro once and asks for the free text", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Combobox options={[...options, { code: "ALTRO", label: "Altro" }]} allowOther value={null} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getAllByText("Altro")).toHaveLength(1);
    fireEvent.click(screen.getByText("Altro"));
    expect(onChange).toHaveBeenCalledWith({ code: "ALTRO", otherText: "" });

    rerender(<Combobox options={options} allowOther value={{ code: "ALTRO", otherText: "" }} onChange={onChange} />);
    const text = screen.getByPlaceholderText("Specifica il valore (Altro)");
    fireEvent.change(text, { target: { value: "Palo" } });
    fireEvent.blur(text);
    expect(onChange).toHaveBeenLastCalledWith({ code: "ALTRO", otherText: "Palo" });
  });

  it("toggles several values in multiple mode", () => {
    const onChange = vi.fn();
    render(<Combobox multiple options={options} allowOther={false} value={[{ code: "RAW_LAND" }]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Roof Top" }));
    expect(onChange).toHaveBeenCalledWith([{ code: "RAW_LAND" }, { code: "ROOF_TOP" }]);
  });
});

describe("Field", () => {
  const occ = MOCK_TEMPLATE.occurrences.find((o) => o.flowId === "F020")!;

  it("is read-only when access is missing (backend decides editability)", () => {
    render(<Field occurrence={occ} value="2026-09-02" access={undefined} onChange={vi.fn()} />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("02/09/2026")).toBeInTheDocument();
  });

  it("explains every read-only reason", () => {
    expect(readOnlyReason(occ, { editable: false, reason: "NOT_ASSIGNED" })).toBe(
      "Il tuo gruppo non ha ancora ricevuto l'Assegna"
    );
    expect(readOnlyReason(occ, { editable: false, reason: "ARCHIVED" })).toBe("Pratica archiviata: sola lettura");
    expect(readOnlyReason(occ, { editable: false, reason: "NOT_MY_GROUP" })).toBe("Di competenza di PM/Permessi");
  });
});
