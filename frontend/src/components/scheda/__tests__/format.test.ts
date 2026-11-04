import { describe, expect, it } from "vitest";
import {
  formatDecimal,
  formatValue,
  isoToIt,
  itToIso,
  maskItDate,
  parseDecimal,
  selectLabel,
} from "@/components/scheda/fields/format";

describe("date gg/mm/aaaa", () => {
  it("converts transport ISO dates to Italian display", () => {
    expect(isoToIt("2026-10-08")).toBe("08/10/2026");
    expect(isoToIt(null)).toBe("");
    expect(isoToIt("08/10/2026")).toBe("");
  });

  it("parses only real calendar dates", () => {
    expect(itToIso("08/10/2026")).toBe("2026-10-08");
    expect(itToIso(" 29/02/2028 ")).toBe("2028-02-29");
    expect(itToIso("29/02/2026")).toBeNull();
    expect(itToIso("31/04/2026")).toBeNull();
    expect(itToIso("8/10/2026")).toBeNull();
    expect(itToIso("")).toBeNull();
  });

  it("masks typed digits into gg/mm/aaaa", () => {
    expect(maskItDate("0")).toBe("0");
    expect(maskItDate("081")).toBe("08/1");
    expect(maskItDate("08102026")).toBe("08/10/2026");
    expect(maskItDate("08/10/20261")).toBe("08/10/2026");
    expect(maskItDate("ab08c10")).toBe("08/10");
  });
});

describe("decimals", () => {
  it("accepts the Italian comma and the dot", () => {
    expect(parseDecimal("45,4642")).toBe(45.4642);
    expect(parseDecimal("9.19")).toBe(9.19);
    expect(parseDecimal("-12")).toBe(-12);
    expect(parseDecimal("  ")).toBeNull();
    expect(parseDecimal("12,3,4")).toBeUndefined();
    expect(parseDecimal("abc")).toBeUndefined();
  });

  it("formats with the comma", () => {
    expect(formatDecimal(45.4642)).toBe("45,4642");
    expect(formatDecimal(null)).toBe("");
  });
});

describe("formatValue", () => {
  const options = [
    { code: "RAW_LAND", label: "Raw Land" },
    { code: "ROOF_TOP", label: "Roof Top" },
  ];

  it("uses list labels and marks Altro", () => {
    expect(selectLabel({ code: "RAW_LAND" }, options)).toBe("Raw Land");
    expect(selectLabel({ code: "SCONOSCIUTO" }, options)).toBe("SCONOSCIUTO");
    expect(selectLabel({ code: "ALTRO", otherText: "Palo" }, options)).toBe("Palo (Altro)");
    expect(selectLabel({ code: "ALTRO" }, options)).toBe("Altro");
  });

  it("formats each data type for read-only display", () => {
    expect(formatValue("DATE", "2026-10-08")).toBe("08/10/2026");
    expect(formatValue("NUMBER", 12.5)).toBe("12,5");
    expect(formatValue("SELECT", { code: "ROOF_TOP" }, options)).toBe("Roof Top");
    expect(formatValue("MULTISELECT", [{ code: "RAW_LAND" }, { code: "ROOF_TOP" }], options)).toBe("Raw Land, Roof Top");
    expect(formatValue("TEXT", "abc")).toBe("abc");
    expect(formatValue("TEXT", null)).toBe("");
  });
});
