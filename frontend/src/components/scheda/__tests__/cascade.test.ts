import { describe, expect, it } from "vitest";
import type { FieldOccurrenceDTO, PraticaDetailDTO } from "@/lib/contract";
import { addPendingWithCascade, applyPending, changeKey } from "@/components/scheda/changes";
import { MOCK_DETAIL } from "@/components/scheda/mock-template";

const S = "PM_PERMESSI.CORE";
function istat(flowId: string, label: string, listId: string, parentFlowId?: string): FieldOccurrenceDTO {
  return {
    occurrenceKey: `${flowId}@${S}`, flowId, label, sectionKey: S, order: 1, kind: "MASTER", ownerGroup: "PM_PERMESSI",
    dataType: "SELECT", required: false, list: { listId, kind: "ISTAT", allowOther: false, parentFlowId },
  };
}
const OCCS = [istat("F007", "Regione", "ISTAT_REGIONI"), istat("F008", "Provincia", "ISTAT_PROVINCE", "F007"), istat("F012", "Comune", "ISTAT_COMUNI", "F008")];

const saved: PraticaDetailDTO = {
  ...MOCK_DETAIL,
  values: { ...MOCK_DETAIL.values, F007: { code: "03" }, F008: { code: "015" }, F012: { code: "015146" } },
};
const set = (flowId: string, value: PraticaDetailDTO["values"][string]) => ({ occurrenceKey: `${flowId}@${S}`, flowId, value });

describe("ISTAT cascade in one save (D-132)", () => {
  it("changing Regione clears Provincia and Comune in the same save", () => {
    const p = addPendingWithCascade(new Map(), saved, set("F007", { code: "01" }), OCCS);
    expect([...p.keys()]).toEqual(["F:F007", "F:F008", "F:F012"]);
    const shown = applyPending(saved, p);
    expect(shown.values).toMatchObject({ F007: { code: "01" }, F008: null, F012: null });
  });

  it("clearing Regione clears the children too", () => {
    const p = addPendingWithCascade(new Map(), saved, set("F007", null), OCCS);
    expect(applyPending(saved, p).values).toMatchObject({ F007: null, F008: null, F012: null });
  });

  it("changing Provincia clears only Comune", () => {
    const p = addPendingWithCascade(new Map(), saved, set("F008", { code: "016" }), OCCS);
    expect([...p.keys()]).toEqual(["F:F008", "F:F012"]);
  });

  it("setting Regione back to its saved value drops the clears", () => {
    let p = addPendingWithCascade(new Map(), saved, set("F007", { code: "01" }), OCCS);
    p = addPendingWithCascade(p, saved, set("F007", { code: "03" }), OCCS);
    expect(p.size).toBe(0);
  });

  it("does not add clears for children already empty", () => {
    const empty = { ...saved, values: { ...saved.values, F008: null, F012: null } };
    const p = addPendingWithCascade(new Map(), empty, set("F007", { code: "01" }), OCCS);
    expect([...p.keys()]).toEqual([changeKey(set("F007", { code: "01" }))]);
  });

  it("other fields are not affected", () => {
    const p = addPendingWithCascade(new Map(), saved, set("F003", "Altro nome"), OCCS);
    expect([...p.keys()]).toEqual(["F:F003"]);
  });
});
