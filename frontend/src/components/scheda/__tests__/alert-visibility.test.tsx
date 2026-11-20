import * as React from "react";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { AlertDTO, TemplateDTO } from "@/lib/contract";
import { buildRepeatIndex } from "@/components/scheda/conditions";
import { buildSheetFromTemplate, type SheetValues } from "@/components/scheda/layout";
import { conditionFlows, sectionAlerts, visibleOccurrence } from "@/components/scheda/alert-visibility";
import { SheetSections } from "@/components/scheda/sections";
import { SectionIndex } from "@/components/scheda/section-index";
// The committed output of the template compiler, read only in tests.
import ILIAD from "@/data/templates/ILIAD.json";

/**
 * L9, seen on the installation (PRV-ILI-005): "Approvazione AIE" (F124) is a
 * MIRROR in Pacchetto Permessi shown only when AIE (F052) = SÌ, and the MASTER
 * in Fase AIE. With AIE empty, Pacchetto Permessi said "⚠ 2" but showed one.
 */
const template = (ILIAD as unknown as { template: TemplateDTO }).template;
const groups = buildSheetFromTemplate(template);
const PACCHETTO = "PM_PERMESSI.PACCHETTO_PERMESSI";
const FASE_AIE = "AIE.FASE_AIE";
const section = (key: string) => groups.flatMap((g) => g.sections).find((s) => s.section.key === key)!;
const data = (values: SheetValues["values"] = {}): SheetValues => ({ values, repeats: {}, repeatOf: buildRepeatIndex(template) });

const alert = (id: string, flowId: string, sectionKey: string): AlertDTO => ({
  id, practiceId: "p", iteration: 1, rule: id, label: id, flowId, sectionKey,
  executionStatus: "ACTIVE", openedAt: "2026-09-20T09:00:00+02:00", dueAt: null, status: "OPEN", canCloseManually: false,
});
// Forecast AIE on Approvazione AIE, Forecast Ottenimento Permessi on Ottenimento Permessi (both in Pacchetto Permessi).
const ALERTS = [alert("FORECAST_AIE", "F124", FASE_AIE), alert("FORECAST_OTTENIMENTO_PERMESSI", "F071", PACCHETTO)];
const keys = new Set(["F124", "F071"]);

describe("where an open alert can be seen", () => {
  it("the fixture is the real case: F124 hidden by AIE in Pacchetto Permessi, shown in Fase AIE", () => {
    const mirror = section(PACCHETTO).occurrences.find((o) => o.flowId === "F124")!;
    expect(mirror.kind).toBe("MIRROR");
    // AIE = SÌ, più la regola di sezione per Incarico / Lavorazione (F015, D-207).
    expect(conditionFlows(mirror.condition)).toEqual(["F052", "F015"]);
    expect(section(FASE_AIE).occurrences.some((o) => o.flowId === "F124" && o.kind === "MASTER")).toBe(true);
  });

  it("counts an alert where its field is shown: Pacchetto Permessi 1 (not 2), Fase AIE 1", () => {
    const p = sectionAlerts(section(PACCHETTO), groups, data(), keys);
    expect(p.count).toBe(1);
    expect(p.hidden).toHaveLength(1);
    expect(p.hidden[0].occurrence.label).toBe("Approvazione AIE");
    expect(p.hidden[0].visibleIn?.section.key).toBe(FASE_AIE);
    expect(sectionAlerts(section(FASE_AIE), groups, data(), keys).count).toBe(1);
  });

  it("with AIE = SÌ the field shows in Pacchetto Permessi too, and counts there", () => {
    const p = sectionAlerts(section(PACCHETTO), groups, data({ F052: { code: "SI", label: "SI" } as never }), keys);
    expect(p).toMatchObject({ count: 2, hidden: [] });
  });

  it("an alert hidden everywhere still counts in its section, which says what to fill", () => {
    const onlyPacchetto = groups.map((g) => ({ ...g, sections: g.sections.filter((s) => s.section.key !== FASE_AIE) }));
    const p = sectionAlerts(section(PACCHETTO), onlyPacchetto, data(), keys);
    expect(p.count).toBe(2);
    expect(p.hidden[0]).toMatchObject({ controllers: ["AIE", "Incarico / Lavorazione"], visibleIn: undefined });
  });

  it("'Vai al campo' targets the occurrence that is shown, preferring the alert's section", () => {
    expect(visibleOccurrence("F124", groups, data(), PACCHETTO)?.section.section.key).toBe(FASE_AIE);
    expect(visibleOccurrence("F124", groups, data({ F052: { code: "SI", label: "SI" } as never }), PACCHETTO)?.section.section.key).toBe(PACCHETTO);
  });
});

describe("sheet: counter, notice and side index agree", () => {
  it("Pacchetto Permessi says ⚠ 1 and explains the hidden alert; the index has no dot for the hidden one only", () => {
    render(
      <SheetSections
        groups={groups}
        data={data()}
        access={{}}
        repeatAccess={{}}
        alerts={ALERTS}
        enabledGroups={["PM_PERMESSI", "AIE"]}
        open={[PACCHETTO]}
        onOpenChange={() => {}}
        constraints={template.constraints}
        manualLocks={[]}
        getOptions={() => ({ options: [] })}
        onChange={() => {}}
      />
    );
    const trigger = screen.getByTestId(`section-trigger-${PACCHETTO}`);
    expect(within(trigger).getByTitle("1 campi con alert aperto")).toHaveTextContent("1");
    expect(screen.getByTestId(`hidden-alerts-${PACCHETTO}`)).toHaveTextContent(
      "Alert aperto su «Approvazione AIE», nascosto qui da una condizione: si vede in «Fase AIE»."
    );
    expect(within(screen.getByTestId(`section-trigger-${FASE_AIE}`)).getByTitle("1 campi con alert aperto")).toBeInTheDocument();
  });

  it("side index: a dot where an alert is shown", () => {
    render(<SectionIndex groups={groups} data={data()} alerts={[ALERTS[0]]} enabledGroups={["PM_PERMESSI", "AIE"]} open={[]} onSelect={() => {}} />);
    expect(within(screen.getByTestId(`index-${FASE_AIE}`)).queryByLabelText("Alert aperto")).toBeInTheDocument();
    expect(within(screen.getByTestId(`index-${PACCHETTO}`)).queryByLabelText("Alert aperto")).not.toBeInTheDocument();
  });
});
