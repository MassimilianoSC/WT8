import { describe, expect, it } from "vitest";
import { addPending, applyPending, changeKey, isRowOp, prunePending } from "@/components/scheda/changes";
import { MOCK_DETAIL } from "@/components/scheda/mock-template";

describe("pending edits", () => {
  it("keys each target once: last edit wins", () => {
    let p = addPending(new Map(), MOCK_DETAIL, { occurrenceKey: "F003@PM_PERMESSI.CORE_ANAGRAFICA_SITO", flowId: "F003", value: "A" });
    p = addPending(p, MOCK_DETAIL, { occurrenceKey: "F003@PM_PERMESSI.CORE_ANAGRAFICA_SITO", flowId: "F003", value: "B" });
    expect(p.size).toBe(1);
    expect(applyPending(MOCK_DETAIL, p).values.F003).toBe("B");
  });

  it("drops an edit that goes back to the saved value", () => {
    let p = addPending(new Map(), MOCK_DETAIL, { occurrenceKey: "F003@PM_PERMESSI.CORE_ANAGRAFICA_SITO", flowId: "F003", value: "Altro nome" });
    p = addPending(p, MOCK_DETAIL, { occurrenceKey: "F003@PM_PERMESSI.CORE_ANAGRAFICA_SITO", flowId: "F003", value: "Milano Centro" });
    expect(p.size).toBe(0);
  });

  it("applies row and transversal edits without touching the saved object", () => {
    let p = addPending(new Map(), MOCK_DETAIL, { occurrenceKey: "F059@PM_PERMESSI.ITER_AUTORIZZATIVO", repeat: "ARPA", rowId: "arpa-2", flowId: "F059", value: "2026-10-30" });
    p = addPending(p, MOCK_DETAIL, { transversal: "fatturabile", value: "SI" });
    const shown = applyPending(MOCK_DETAIL, p);
    expect(shown.repeats.ARPA[1].values.F059).toBe("2026-10-30");
    expect(shown.repeats.ARPA[0]).toBe(MOCK_DETAIL.repeats.ARPA[0]);
    expect(shown.transversal).toMatchObject({ fatturabile: "SI", fatturabileManual: true });
    expect(MOCK_DETAIL.repeats.ARPA[1].values.F059).toBeNull();
    expect(MOCK_DETAIL.transversal.fatturabile).toBe("NO");
  });

  it("keeps edits after a reload and drops those on vanished rows (409)", () => {
    let p = addPending(new Map(), MOCK_DETAIL, { occurrenceKey: "F003@PM_PERMESSI.CORE_ANAGRAFICA_SITO", flowId: "F003", value: "Mio nome" });
    p = addPending(p, MOCK_DETAIL, { occurrenceKey: "F059@PM_PERMESSI.ITER_AUTORIZZATIVO", repeat: "ARPA", rowId: "arpa-2", flowId: "F059", value: "2026-10-30" });
    const fresh = { ...MOCK_DETAIL, revision: 8, repeats: { ...MOCK_DETAIL.repeats, ARPA: MOCK_DETAIL.repeats.ARPA.slice(0, 1) } };
    const kept = prunePending(p, fresh);
    expect([...kept.keys()]).toEqual(["F:F003"]);
  });

  it("drops edits the other user already made identically", () => {
    const p = addPending(new Map(), MOCK_DETAIL, { occurrenceKey: "F003@PM_PERMESSI.CORE_ANAGRAFICA_SITO", flowId: "F003", value: "Mio nome" });
    const fresh = { ...MOCK_DETAIL, values: { ...MOCK_DETAIL.values, F003: "Mio nome" } };
    expect(prunePending(p, fresh).size).toBe(0);
  });

  it("merges stato and ente of one Vincoli row and drops it when back to saved", () => {
    let p = addPending(new Map(), MOCK_DETAIL, { repeat: "VINCOLI", rowId: "vinc-PARCO", constraint: { stato: { code: "PRESENTE" } } });
    p = addPending(p, MOCK_DETAIL, { repeat: "VINCOLI", rowId: "vinc-PARCO", constraint: { ente: { code: "ENTE_PARCO_SUD_MILANO" } } });
    expect(p.size).toBe(1);
    const row = applyPending(MOCK_DETAIL, p).repeats.VINCOLI.find((r) => r.rowId === "vinc-PARCO");
    expect(row?.constraint).toEqual({ code: "PARCO", stato: { code: "PRESENTE" }, ente: { code: "ENTE_PARCO_SUD_MILANO" } });
    p = addPending(p, MOCK_DETAIL, { repeat: "VINCOLI", rowId: "vinc-PARCO", constraint: { stato: { code: "ASSENTE" }, ente: null } });
    p = addPending(p, MOCK_DETAIL, { repeat: "VINCOLI", rowId: "vinc-PARCO", constraint: { stato: { code: "ASSENTE" } } });
    expect(p.size).toBe(0);
    expect(changeKey({ repeat: "VINCOLI", rowId: "vinc-PARCO", constraint: {} })).toBe("V:vinc-PARCO");
  });

  it("keys and applies Note Operative per group (v0.3.0)", () => {
    let p = addPending(new Map(), MOCK_DETAIL, { transversal: "noteOperative", group: "PM_PERMESSI", value: "A" });
    p = addPending(p, MOCK_DETAIL, { transversal: "noteOperative", group: "UT_PE", value: "B" });
    expect([...p.keys()]).toEqual(["T:noteOperative:PM_PERMESSI", "T:noteOperative:UT_PE"]);
    const shown = applyPending(MOCK_DETAIL, p);
    expect(shown.transversal.noteOperative).toEqual({ PM_PERMESSI: "A", UT_PE: "B" });
    p = addPending(p, MOCK_DETAIL, { transversal: "noteOperative", group: "PM_PERMESSI", value: "" });
    expect(p.size).toBe(1);
  });

  it("tells row operations apart and keys targets", () => {
    expect(isRowOp({ repeat: "ARPA", op: "ADD_ROW", clientRowKey: "k1" })).toBe(true);
    expect(isRowOp({ occurrenceKey: "F003@PM_PERMESSI.CORE_ANAGRAFICA_SITO", flowId: "F003", value: "x" })).toBe(false);
    expect(changeKey({ transversal: "fatturato", value: null })).toBe("T:fatturato");
    expect(changeKey({ occurrenceKey: "F059@PM_PERMESSI.ITER_AUTORIZZATIVO", repeat: "ARPA", rowId: "r1", flowId: "F059", value: null })).toBe("R:ARPA:r1:F059");
  });

  it("Fatturabile: clicking the current value is a decision when automatic or with FATTURABILE_KO open (D-137)", () => {
    const decide = { transversal: "fatturabile", value: "NO" } as const;
    // Automatic NO → manual NO: kept.
    expect(addPending(new Map(), MOCK_DETAIL, decide).size).toBe(1);
    // Manual NO, no episode open: back to the saved value, dropped.
    const manual = { ...MOCK_DETAIL, transversal: { ...MOCK_DETAIL.transversal, fatturabileManual: true }, alerts: [] };
    expect(addPending(new Map(), manual, decide).size).toBe(0);
    // Manual NO with FATTURABILE_KO open: NO → NO closes the episode, kept (also after a reload).
    const ko = { ...manual, alerts: [{ ...MOCK_DETAIL.alerts[0], rule: "FATTURABILE_KO" as const, status: "OPEN" as const }] };
    const p = addPending(new Map(), ko, decide);
    expect(p.size).toBe(1);
    expect(prunePending(p, ko).size).toBe(1);
    expect(prunePending(p, manual).size).toBe(0);
  });
});
