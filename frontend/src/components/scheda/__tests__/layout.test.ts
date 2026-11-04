import { describe, expect, it } from "vitest";
import { buildRepeatIndex } from "@/components/scheda/conditions";
import { buildSheetFromTemplate, sectionProgress } from "@/components/scheda/layout";
import { MOCK_DETAIL, MOCK_TEMPLATE } from "@/components/scheda/mock-template";

describe("buildSheet", () => {
  const groups = buildSheetFromTemplate(MOCK_TEMPLATE);

  it("orders groups and sections as in the template", () => {
    expect(groups.map((g) => g.group)).toEqual(["PM_PERMESSI", "UT_PE", "AIE", "DL"]);
    expect(groups[0].sections.map((s) => s.section.label)).toEqual([
      "Core Anagrafica Sito",
      "Fase Preliminare",
      "Iter Autorizzativo",
    ]);
    expect(groups[1].sections.map((s) => s.section.subsection)).toEqual(["UT", "PE"]);
  });

  it("groups consecutive pop-up occurrences into one pop-up block", () => {
    const prel = groups[0].sections[1];
    expect(prel.blocks.map((b) => b.kind)).toEqual(["fields", "popup"]);
    const popup = prel.blocks[1];
    expect(popup.kind === "popup" && popup.popup.label).toBe("Pop-up UT");
    expect(popup.kind === "popup" && popup.blocks[0].kind === "fields" && popup.blocks[0].occurrences.length).toBe(2);
  });

  it("groups repeatable occurrences by repeat group", () => {
    const iter = groups[0].sections[2];
    expect(iter.blocks.map((b) => (b.kind === "repeat" ? b.repeat.key : b.kind))).toEqual(["fields", "ARPA", "VINCOLI", "fields"]);
  });

  it("keeps transversal occurrences out of the sections", () => {
    const keys = groups.flatMap((g) => g.sections.flatMap((s) => s.occurrences.map((o) => o.occurrenceKey)));
    expect(keys.some((k) => k.startsWith("TRASV."))).toBe(false);
  });
});

describe("sectionProgress", () => {
  const groups = buildSheetFromTemplate(MOCK_TEMPLATE);
  const data = {
    values: MOCK_DETAIL.values,
    repeats: MOCK_DETAIL.repeats,
    repeatOf: buildRepeatIndex(MOCK_TEMPLATE),
  };

  it("counts visible MASTER occurrences, mirrors excluded", () => {
    // Fase Preliminare: 3 masters (Data assegnazione filled), the pop-up holds mirrors.
    expect(sectionProgress(groups[0].sections[1], data)).toEqual({ filled: 1, total: 3 });
  });

  it("counts repeatable masters once per row and honours row conditions", () => {
    // Iter: Data protocollo + Forecast Ottenimento Permessi (overridable, counted;
    // Forecast Geologica is not) + ARPA row 1 (3/3) + ARPA row 2 (Esito hidden: 1/2)
    // + the 11 Vincoli rows, compiled when the state is set (6).
    expect(sectionProgress(groups[0].sections[2], data)).toEqual({ filled: 2 + 3 + 1 + 6, total: 2 + 3 + 2 + 11 });
  });

  it("hides PE fields conditioned on PE = SI", () => {
    // PE section: Assegnazione PE hidden (PE = NO), Invio PE visible and empty.
    expect(sectionProgress(groups[1].sections[1], data)).toEqual({ filled: 0, total: 1 });
  });
});
