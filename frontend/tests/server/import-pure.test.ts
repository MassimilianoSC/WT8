// @vitest-environment node
/** B9 import, parti pure: riconoscimento delle colonne (D-30) e conversione delle celle. */
import { describe, expect, it } from "vitest";
import { NONE_CODE } from "@/lib/contract";
import { mapColumns } from "@/lib/import/columns";
import { convertCell, type ConvertLookups } from "@/lib/import/convert";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";

const T = COMPILED_TEMPLATES.INWIT.template;
const occ = (flowId: string) => T.occurrences.find((o) => o.kind === "MASTER" && o.flowId === flowId)!;

describe("colonne (§12, D-30)", () => {
  it("flowId o etichetta esatta e unica; non importabili con il motivo; ripetute e sconosciute", () => {
    const mirror = T.occurrences.find((o) => o.kind === "MIRROR" && !o.repeatGroup)!;
    const repeated = [...T.occurrences.reduce((m, o) => m.set(o.label.trim(), (m.get(o.label.trim()) ?? 0) + 1), new Map<string, number>())].find(([, n]) => n > 1)![0];
    const cols = mapColumns(T, ["F002", " Nome Sito ", "nome sito", "F074", "Note Operative PM/Permessi", "F055", repeated, `${mirror.flowId}`, "Boh", "", "F002"]);
    expect(cols.map((c) => [c.flowId, c.importable])).toEqual([
      ["F002", true],
      ["F003", true],
      [null, false], // senza maiuscole non vale (D-30)
      ["F074", false],
      [null, false],
      ["F055", false],
      [null, false],
      [mirror.flowId, true], // per flowId si importa il MASTER
      [null, false],
      [null, false],
      ["F002", false],
    ]);
    expect(cols[3].note).toBe("campo calcolato");
    expect(cols[4].note).toMatch(/trasversale/);
    expect(cols[5].note).toBe("gruppo ripetibile");
    expect(cols[6].note).toMatch(/etichetta ripetuta/);
    expect(cols[10].note).toMatch(/ripetuta/);
  });
});

describe("conversione delle celle", () => {
  const lookups: ConvertLookups = {
    listCode: (listId, t) => (listId === "TIPOLOGIA_SITO" ? ({ RAW_LAND: "RAW_LAND", "raw land": "RAW_LAND" } as Record<string, string>)[t.toLowerCase() === "raw land" ? "raw land" : t] ?? null : null),
    userId: (role, t) => (role === "UT" && t.toLowerCase() === "ugo ut" ? "0123456789abcdef01234567" : null),
    istatCode: (listId, t, parent) => (listId === "ISTAT_COMUNI" && t === "Agliè" && parent === "201" ? "001001" : listId === "ISTAT_REGIONI" && t === "Piemonte" ? "01" : null),
  };
  it("date: seriale Excel, Date, gg/mm/aaaa, aaaa-mm-gg; invalida segnalata", () => {
    expect(convertCell(occ("F023"), 46296, lookups)).toEqual({ ok: true, value: "2026-10-01" });
    expect(convertCell(occ("F023"), new Date("2026-10-01T00:00:00+02:00"), lookups)).toEqual({ ok: true, value: "2026-10-01" });
    expect(convertCell(occ("F023"), "1/10/2026", lookups)).toEqual({ ok: true, value: "2026-10-01" });
    expect(convertCell(occ("F023"), "2026-10-01", lookups)).toEqual({ ok: true, value: "2026-10-01" });
    expect(convertCell(occ("F023"), "31/02/2026", lookups)).toMatchObject({ ok: false });
  });
  it("numeri con virgola; G7 intero; vuoti; testo", () => {
    expect(convertCell(occ("F021"), "45,4612", lookups)).toEqual({ ok: true, value: 45.4612 });
    expect(convertCell(occ("F021"), "1.234,5", lookups)).toEqual({ ok: true, value: 1234.5 });
    expect(convertCell(occ("F001"), "12.5", lookups, { integer: true })).toMatchObject({ ok: false });
    expect(convertCell(occ("F001"), 4501, lookups, { integer: true })).toEqual({ ok: true, value: 4501 });
    expect(convertCell(occ("F002"), "  ", lookups)).toEqual({ ok: true, empty: true });
    expect(convertCell(occ("F002"), " MI001 ", lookups)).toEqual({ ok: true, value: "MI001" });
  });
  it("liste per codice o etichetta, utenti per nome, Nessuno, ISTAT nella cascata", () => {
    expect(convertCell(occ("F010"), "Raw Land", lookups)).toEqual({ ok: true, value: { code: "RAW_LAND" } });
    expect(convertCell(occ("F010"), "Sconosciuto", lookups)).toMatchObject({ ok: false });
    expect(convertCell(occ("F095"), "Ugo UT", lookups)).toEqual({ ok: true, value: { code: "0123456789abcdef01234567" } });
    expect(convertCell(occ("F110"), "nessuno", lookups)).toEqual({ ok: true, value: [{ code: NONE_CODE }] });
    expect(convertCell(occ("F006"), "Piemonte", lookups)).toEqual({ ok: true, value: { code: "01" } });
    expect(convertCell(occ("F008"), "Agliè", lookups, { parentCode: "201" })).toEqual({ ok: true, value: { code: "001001" } });
    expect(convertCell(occ("F008"), "Agliè", lookups, { parentCode: "215" })).toMatchObject({ ok: false });
  });
});
