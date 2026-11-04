// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ConditionDTO } from "@/lib/contract";
import { evaluateCondition, repeatIndex, type ConditionContext } from "@/lib/engines/conditions";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";
import cases from "../fixtures/conditions-cases.json";

interface Case {
  name: string;
  condition: ConditionDTO | null;
  context: Omit<ConditionContext, "repeatOf"> & { repeatOf?: Record<string, string> };
  expected: boolean;
}

describe("condizioni: casi condivisi (tests/fixtures/conditions-cases.json)", () => {
  for (const c of (cases as unknown as { cases: Case[] }).cases) {
    it(c.name, () => {
      const ctx = { ...c.context, repeatOf: new Map(Object.entries(c.context.repeatOf ?? {})) } as ConditionContext;
      expect(evaluateCondition(c.condition, ctx)).toBe(c.expected);
    });
  }
});

describe("condizioni sui template veri", () => {
  it("ILIAD F081 Forecast Ottenimento (riga ENTE) visibile se un vincolo è compilato", () => {
    const t = COMPILED_TEMPLATES.ILIAD.template;
    const occ = t.occurrences.find((o) => o.flowId === "F081" && o.kind === "MASTER")!;
    const vincoli = t.constraints.map(() => ({ values: {}, constraint: { stato: null as null | { code: string } } }));
    const ctx: ConditionContext = { values: {}, repeats: { VINCOLI: vincoli }, row: { repeat: "ENTE", values: {} }, repeatOf: repeatIndex(t) };
    expect(evaluateCondition(occ.condition, ctx)).toBe(false);
    vincoli[0].constraint.stato = { code: "PRESENTE" };
    expect(evaluateCondition(occ.condition, ctx)).toBe(true);
  });
});
