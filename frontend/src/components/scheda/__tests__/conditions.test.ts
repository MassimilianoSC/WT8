import { describe, expect, it } from "vitest";
import type { ConditionDTO, FieldValue } from "@/lib/contract";
import {
  buildRepeatIndex,
  codesOf,
  isFilled,
  isVisible,
  type ConditionContext,
} from "@/components/scheda/conditions";

const repeatOf = buildRepeatIndex({
  repeatGroups: [{ key: "ARPA", label: "ARPA", flowIds: ["F059", "F060"], rowPolicy: "DYNAMIC", schemaKind: "FIELDS" }],
});

function ctx(values: Record<string, FieldValue>, row?: ConditionContext["row"]): ConditionContext {
  return { values, row, repeatOf };
}

describe("isFilled", () => {
  it("treats null, blank text, empty arrays and empty codes as empty", () => {
    expect(isFilled(null)).toBe(false);
    expect(isFilled(undefined)).toBe(false);
    expect(isFilled("   ")).toBe(false);
    expect(isFilled([])).toBe(false);
    expect(isFilled({ code: "" })).toBe(false);
    expect(isFilled([{ code: "" }])).toBe(false);
  });

  it("treats text, numbers (including 0) and codes as filled", () => {
    expect(isFilled("x")).toBe(true);
    expect(isFilled(0)).toBe(true);
    expect(isFilled({ code: "SI" })).toBe(true);
    expect(isFilled([{ code: "A" }])).toBe(true);
    expect(isFilled("2026-10-08")).toBe(true);
  });
});

describe("codesOf", () => {
  it("extracts comparable codes", () => {
    expect(codesOf({ code: "RAW_LAND" })).toEqual(["RAW_LAND"]);
    expect(codesOf([{ code: "A" }, { code: "B" }])).toEqual(["A", "B"]);
    expect(codesOf("testo")).toEqual(["testo"]);
    expect(codesOf(12)).toEqual(["12"]);
    expect(codesOf(null)).toEqual([]);
  });
});

describe("isVisible", () => {
  it("shows the occurrence when there is no condition", () => {
    expect(isVisible(null, ctx({}))).toBe(true);
    expect(isVisible(undefined, ctx({}))).toBe(true);
  });

  it("EQ / NEQ compare list codes", () => {
    const eq: ConditionDTO = { flowId: "F010", op: "EQ", value: "RAW_LAND" };
    const neq: ConditionDTO = { flowId: "F010", op: "NEQ", value: "RAW_LAND" };
    expect(isVisible(eq, ctx({ F010: { code: "RAW_LAND" } }))).toBe(true);
    expect(isVisible(eq, ctx({ F010: { code: "ROOF_TOP" } }))).toBe(false);
    expect(isVisible(eq, ctx({}))).toBe(false);
    expect(isVisible(neq, ctx({ F010: { code: "ROOF_TOP" } }))).toBe(true);
    expect(isVisible(neq, ctx({ F010: { code: "RAW_LAND" } }))).toBe(false);
    // An empty field is "different from X".
    expect(isVisible(neq, ctx({}))).toBe(true);
  });

  it("IN matches any of the listed codes", () => {
    const cond: ConditionDTO = { flowId: "F020", op: "IN", value: ["LOMBARDIA", "PIEMONTE"] };
    expect(isVisible(cond, ctx({ F020: { code: "PIEMONTE" } }))).toBe(true);
    expect(isVisible(cond, ctx({ F020: { code: "LAZIO" } }))).toBe(false);
  });

  it("MULTISELECT: EQ is true when at least one selected code matches", () => {
    const cond: ConditionDTO = { flowId: "F030", op: "EQ", value: "MW" };
    expect(isVisible(cond, ctx({ F030: [{ code: "FIBRA" }, { code: "MW" }] }))).toBe(true);
    expect(isVisible(cond, ctx({ F030: [{ code: "FIBRA" }] }))).toBe(false);
  });

  it("FILLED / EMPTY", () => {
    const filled: ConditionDTO = { flowId: "F040", op: "FILLED" };
    const empty: ConditionDTO = { flowId: "F040", op: "EMPTY" };
    expect(isVisible(filled, ctx({ F040: "2026-10-08" }))).toBe(true);
    expect(isVisible(filled, ctx({ F040: "" }))).toBe(false);
    expect(isVisible(empty, ctx({}))).toBe(true);
    expect(isVisible(empty, ctx({ F040: "x" }))).toBe(false);
  });

  it("combines with all / any", () => {
    const pe: ConditionDTO = { flowId: "F050", op: "EQ", value: "SI" };
    const sism: ConditionDTO = { flowId: "F051", op: "EQ", value: "SI" };
    const values = { F050: { code: "SI" }, F051: { code: "NO" } };
    expect(isVisible({ all: [pe, sism] }, ctx(values))).toBe(false);
    expect(isVisible({ any: [pe, sism] }, ctx(values))).toBe(true);
    expect(isVisible({ all: [pe, { any: [sism, { flowId: "F052", op: "EMPTY" }] }] }, ctx(values))).toBe(true);
    expect(isVisible({ all: [] }, ctx({}))).toBe(true);
    expect(isVisible({ any: [] }, ctx({}))).toBe(false);
  });

  it("reads a flowId of the same repeat group on the same row (v0.1.1)", () => {
    // "Esito parere Arpa compare solo se compilato Parere Arpa" — per row.
    const cond: ConditionDTO = { flowId: "F059", op: "FILLED" };
    const rowFilled = { repeat: "ARPA", values: { F059: "2026-09-01" } };
    const rowEmpty = { repeat: "ARPA", values: { F059: null } };
    expect(isVisible(cond, ctx({}, rowFilled))).toBe(true);
    expect(isVisible(cond, ctx({}, rowEmpty))).toBe(false);
    // A stray practice-level value must not leak into the row.
    expect(isVisible(cond, ctx({ F059: "2026-01-01" }, rowEmpty))).toBe(false);
  });

  it("reads non-repeatable flowIds on the practice even inside a row", () => {
    const cond: ConditionDTO = { flowId: "F010", op: "EQ", value: "RAW_LAND" };
    const row = { repeat: "ARPA", values: { F010: { code: "ROOF_TOP" } } };
    expect(isVisible(cond, ctx({ F010: { code: "RAW_LAND" } }, row))).toBe(true);
  });

  it("FILLED on the Vincoli container: at least one constraint with a state (v0.1.7)", () => {
    const index = buildRepeatIndex({
      repeatGroups: [{ key: "VINCOLI", label: "Vincoli", flowIds: ["F065"], rowPolicy: "FIXED", schemaKind: "VINCOLI" }],
    });
    const rows = (stato: string | null) => [
      { values: {}, constraint: { stato: null } },
      { values: {}, constraint: { stato: stato === null ? null : { code: stato } } },
    ];
    const filled: ConditionDTO = { flowId: "F065", op: "FILLED" };
    const presente: ConditionDTO = { flowId: "F065", op: "EQ", value: "PRESENTE" };
    expect(isVisible(filled, { values: {}, repeats: { VINCOLI: rows("ASSENTE") }, repeatOf: index })).toBe(true);
    expect(isVisible(filled, { values: {}, repeats: { VINCOLI: rows(null) }, repeatOf: index })).toBe(false);
    expect(isVisible(presente, { values: {}, repeats: { VINCOLI: rows("PRESENTE") }, repeatOf: index })).toBe(true);
  });

  describe("flowId of another repeat group (v0.1.5): true on at least one row", () => {
    // ILIAD: "Forecast Ottenimento 'Nome ente'" (ENTE) shows if Vincoli is compiled (VINCOLI).
    const index = buildRepeatIndex({
      repeatGroups: [
        { key: "VINCOLI", label: "Vincoli", flowIds: ["F070"], rowPolicy: "DYNAMIC", schemaKind: "FIELDS" },
        { key: "ENTE", label: "Ente", flowIds: ["F080", "F081"], rowPolicy: "DYNAMIC", schemaKind: "FIELDS" },
      ],
    });
    const enteRow = { repeat: "ENTE", values: { F080: "Soprintendenza" } };
    const vincoli = (...codes: Array<string | null>) =>
      codes.map((c) => ({ values: { F070: c === null ? null : { code: c } } }));
    const at = (rows: ReturnType<typeof vincoli>, row = enteRow): ConditionContext => ({
      values: {},
      repeats: { VINCOLI: rows },
      row,
      repeatOf: index,
    });

    it("FILLED: at least one row compiled; EMPTY: no row compiled", () => {
      const filled: ConditionDTO = { flowId: "F070", op: "FILLED" };
      const empty: ConditionDTO = { flowId: "F070", op: "EMPTY" };
      expect(isVisible(filled, at(vincoli(null, "PRESENTE")))).toBe(true);
      expect(isVisible(filled, at(vincoli(null, null)))).toBe(false);
      expect(isVisible(filled, at([]))).toBe(false);
      expect(isVisible(empty, at(vincoli(null, null)))).toBe(true);
      expect(isVisible(empty, at(vincoli(null, "ASSENTE")))).toBe(false);
    });

    it("EQ / IN: at least one row with the code; NEQ: no row with the code", () => {
      const eq: ConditionDTO = { flowId: "F070", op: "EQ", value: "PRESENTE" };
      const inn: ConditionDTO = { flowId: "F070", op: "IN", value: ["PRESENTE", "ASSOLTO"] };
      const neq: ConditionDTO = { flowId: "F070", op: "NEQ", value: "PRESENTE" };
      expect(isVisible(eq, at(vincoli("ASSENTE", "PRESENTE")))).toBe(true);
      expect(isVisible(eq, at(vincoli("ASSENTE", "ASSENTE")))).toBe(false);
      expect(isVisible(inn, at(vincoli("ASSENTE", "ASSOLTO")))).toBe(true);
      expect(isVisible(neq, at(vincoli("ASSENTE", "PRESENTE")))).toBe(false);
      expect(isVisible(neq, at(vincoli("ASSENTE", null)))).toBe(true);
    });

    it("applies the same rule when a non-repeatable field cites a repeatable flowId", () => {
      const cond: ConditionDTO = { flowId: "F070", op: "FILLED" };
      const noRow = (rows: ReturnType<typeof vincoli>): ConditionContext => ({
        values: { F070: { code: "PRESENTE" } }, // a stray practice-level value is ignored
        repeats: { VINCOLI: rows },
        repeatOf: index,
      });
      expect(isVisible(cond, noRow(vincoli(null, "PRESENTE")))).toBe(true);
      expect(isVisible(cond, noRow(vincoli(null)))).toBe(false);
    });
  });
});
