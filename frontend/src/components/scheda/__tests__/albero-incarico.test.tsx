import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NO_DATE, type FieldOccurrenceDTO, type TemplateDTO } from "@/lib/contract";
import { buildRepeatIndex } from "@/components/scheda/conditions";
import { buildSheetFromTemplate, sectionHiddenByTree, treeFlowId, visibleTree, type SheetValues } from "@/components/scheda/layout";
import { Field } from "@/components/scheda/fields/field";
import { formatValue } from "@/components/scheda/fields/format";
// The committed output of the template compiler, read only in tests.
import INWIT from "@/data/templates/INWIT.json";

/** D-207 (Q3): sections removed by Incarico / Lavorazione; D-208: "Nessuna data". */
const template = (INWIT as unknown as { template: TemplateDTO }).template;
const groups = buildSheetFromTemplate(template);
const data = (values: SheetValues["values"] = {}): SheetValues => ({ values, repeats: {}, repeatOf: buildRepeatIndex(template) });
const sectionKeys = (values: SheetValues["values"]) =>
  visibleTree(groups, data(values), treeFlowId(template)).flatMap((g) => g.sections.map((s) => s.section.key));

describe("tree by Incarico / Lavorazione (Q3)", () => {
  it("finds the Incarico field of the template", () => {
    expect(treeFlowId(template)).toBe("F012");
  });

  it("Caratterizzazione: only Core, Dati secondari, Fase Preliminare and the UT section (caratterizzazione) remain", () => {
    expect(sectionKeys({ F012: { code: "CARATTERIZZAZIONE" } })).toEqual([
      "PM_PERMESSI.CORE",
      "PM_PERMESSI.DATI_SECONDARI",
      "PM_PERMESSI.FASE_PRELIMINARE",
      "UT_PE.UT",
    ]);
  });

  it("empty Incarico or New Site: every section stays", () => {
    const all = groups.flatMap((g) => g.sections.map((s) => s.section.key));
    expect(sectionKeys({})).toEqual(all);
    expect(sectionKeys({ F012: { code: "NEW_SITE" } })).toEqual(all);
  });

  it("a section emptied by other conditions only stays with its 0/n (D-122)", () => {
    const view = {
      section: { key: "X", label: "X", group: "PM_PERMESSI" as const, order: 1 },
      blocks: [],
      occurrences: [{ occurrenceKey: "F900@X", flowId: "F900", condition: { flowId: "F010", op: "EQ", value: "RAW_LAND" } } as unknown as FieldOccurrenceDTO],
    };
    expect(sectionHiddenByTree(view, data({ F012: { code: "CARATTERIZZAZIONE" } }), "F012")).toBe(false);
  });
});

describe("Nessuna data (D-208)", () => {
  const occ = template.occurrences.find((o) => o.occurrenceKey === "F024@PM_PERMESSI.FASE_PRELIMINARE")!;
  const forecast = template.occurrences.find((o) => o.kind === "MASTER" && o.dataType === "DATE" && o.computed)!;
  const editable = { editable: true } as never;

  it("a hand-filled date offers it, and it can be undone", () => {
    const onChange = vi.fn();
    const { rerender } = render(<Field occurrence={occ} value={null} access={editable} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Nessuna data" }));
    expect(onChange).toHaveBeenLastCalledWith(NO_DATE);
    rerender(<Field occurrence={occ} value={NO_DATE} access={editable} onChange={onChange} />);
    expect(screen.getByText("Nessuna data")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("gg/mm/aaaa")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("a computed date does not offer it", () => {
    render(<Field occurrence={forecast} value={null} access={editable} onChange={() => {}} />);
    expect(screen.queryByRole("button", { name: "Nessuna data" })).toBeNull();
  });

  it("read-only text", () => {
    expect(formatValue("DATE", NO_DATE)).toBe("Nessuna data");
  });
});
