import { describe, expect, it } from "vitest";
import type { ConditionDTO } from "@/lib/contract";
import { isVisible, type ConditionContext } from "@/components/scheda/conditions";
// Shared with the backend (o2's fixture, read only): both evaluators must agree.
import fixture from "../../../../tests/fixtures/conditions-cases.json";

interface Case {
  name: string;
  condition: ConditionDTO | null;
  context: Omit<ConditionContext, "repeatOf"> & { repeatOf?: Record<string, string> };
  expected: boolean;
}

const { version, cases } = fixture as unknown as { version: string; cases: Case[] };

describe(`shared condition cases (fixture v${version})`, () => {
  it("has cases", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const ctx: ConditionContext = { ...c.context, repeatOf: new Map(Object.entries(c.context.repeatOf ?? {})) };
    expect(isVisible(c.condition, ctx)).toBe(c.expected);
  });
});
