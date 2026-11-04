import * as React from "react";
import { afterAll, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { TemplateDTO } from "@/lib/contract";
import { buildRepeatIndex } from "@/components/scheda/conditions";
import { buildDemoPractice } from "@/components/__fixtures__/demo-practice";
import { buildSheetFromTemplate } from "@/components/scheda/layout";
import { SheetSections } from "@/components/scheda/sections";
import { TransversalPanel } from "@/components/scheda/transversal-panel";
import { mockOptions } from "@/components/scheda/mock-template";
import { MOCK_PRATICHE } from "@/components/__fixtures__/demo-data";
// The committed outputs of the template compiler (B2), read ONLY in tests:
// the app itself goes through GET /api/templates/{id}.
import ILIAD from "@/data/templates/ILIAD.json";
import TOWERNET from "@/data/templates/TOWERNET.json";
import TIM_FIBERCOP from "@/data/templates/TIM_FIBERCOP.json";
import INWIT from "@/data/templates/INWIT.json";
import FASTWEB_VODAFONE from "@/data/templates/FASTWEB_VODAFONE.json";
import LEONARDO from "@/data/templates/LEONARDO.json";

const FILES = { ILIAD, TOWERNET, TIM_FIBERCOP, INWIT, FASTWEB_VODAFONE, LEONARDO } as unknown as Record<string, { template: TemplateDTO }>;
const timings: string[] = [];

afterAll(() => {
  // Shown in the test output and reported at delivery.
  console.info(`Rendering della scheda con tutte le sezioni aperte:\n${timings.join("\n")}`);
});

describe.each(Object.keys(FILES))("template vero %s", (id) => {
  const template = FILES[id].template;
  const row = { ...MOCK_PRATICHE[0], templateId: template.id };
  const practice = buildDemoPractice(template, row, { filled: true });
  const groups = buildSheetFromTemplate(template);
  const allSections = groups.flatMap((g) => g.sections.map((s) => s.section.key));

  it("has every occurrence in a known section and a known repeat group", () => {
    const sections = new Set(template.sections.map((s) => s.key));
    const repeats = new Set(template.repeatGroups.map((r) => r.key));
    for (const o of template.occurrences) {
      expect(sections.has(o.sectionKey), o.occurrenceKey).toBe(true);
      if (o.repeatGroup) expect(repeats.has(o.repeatGroup), o.occurrenceKey).toBe(true);
    }
    const shown = groups.flatMap((g) => g.sections.flatMap((s) => s.occurrences)).length;
    expect(shown).toBe(template.occurrences.filter((o) => o.flowId).length);
  });

  it("renders the whole sheet, Vincoli and transversal fields included", () => {
    function Harness() {
      const [open, setOpen] = React.useState(allSections);
      return (
        <>
          <TransversalPanel values={practice.transversal} occurrences={template.transversal} access={practice.access} onChange={() => {}} />
          <SheetSections
            groups={groups}
            data={{ values: practice.values, repeats: practice.repeats, repeatOf: buildRepeatIndex(template) }}
            access={practice.access}
            repeatAccess={practice.repeatAccess}
            alerts={practice.alerts}
            enabledGroups={practice.enabledGroups}
            open={open}
            onOpenChange={setOpen}
            constraints={template.constraints}
            manualLocks={practice.manualLocks}
            getOptions={(list, parent) => ({ options: mockOptions(list, parent) })}
            onChange={() => {}}
          />
        </>
      );
    }
    const start = performance.now();
    render(<Harness />);
    const ms = performance.now() - start;
    const fields = screen.getAllByTestId(/^field-/).length;
    timings.push(`  ${id}: ${template.occurrences.length} occorrenze, ${fields} campi visibili, ${Math.round(ms)} ms`);

    expect(fields).toBeGreaterThan(50);
    expect(within(screen.getByTestId("repeat-VINCOLI")).getAllByRole("row")).toHaveLength(12);
    expect(screen.getByTestId("transversal-panel")).toBeInTheDocument();
    // Generous bound for jsdom on a laptop; the browser is much faster.
    expect(ms).toBeLessThan(5000);
  });

  it("an edit re-renders without errors", () => {
    function Harness() {
      const [values, setValues] = React.useState(practice.values);
      return (
        <SheetSections
          groups={groups}
          data={{ values, repeats: practice.repeats, repeatOf: buildRepeatIndex(template) }}
          access={practice.access}
          repeatAccess={practice.repeatAccess}
          alerts={[]}
          enabledGroups={practice.enabledGroups}
          open={allSections}
          onOpenChange={() => {}}
          constraints={template.constraints}
          manualLocks={[]}
          getOptions={(list, parent) => ({ options: mockOptions(list, parent) })}
          onChange={(c) => {
            if ("flowId" in c && !("repeat" in c)) setValues((v) => ({ ...v, [c.flowId]: c.value }));
          }}
        />
      );
    }
    render(<Harness />);
    const nome = template.occurrences.find((o) => o.kind === "MASTER" && o.label.trim().toLowerCase() === "nome sito")!;
    const input = within(screen.getByTestId(`field-${nome.occurrenceKey}`)).getByRole("textbox");
    fireEvent.change(input, { target: { value: "Prova" } });
    expect(input).toHaveValue("Prova");
  });
});
