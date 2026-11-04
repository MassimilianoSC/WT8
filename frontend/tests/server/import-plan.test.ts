// @vitest-environment node
/** B9 import: lettura del foglio, abbinamento D-49, piano dei valori e simulazione del file (parti pure). */
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import type { FieldValue } from "@/lib/contract";
import { mapColumns } from "@/lib/import/columns";
import type { ConvertLookups } from "@/lib/import/convert";
import { MAX_ROWS, readSheet } from "@/lib/import/sheet";
import { istatLookup } from "@/lib/istat/service";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";
import { keyOfRow, matchKey, missingKeyColumns, planRow, type SiteCandidate } from "@/services/import-v2/plan";
import { planSheet } from "@/services/import-v2/preview";

const T = COMPILED_TEMPLATES.INWIT.template;

const LISTS: Record<string, Record<string, string>> = {
  COMMITTENTE: { todos: "TODOS", fastweb: "FASTWEB" },
  CLIENTE_FINALE: { inwit: "INWIT", tim: "TIM" },
  TIPOLOGIA_SITO: { "raw land": "RAW_LAND", roof_top: "ROOF_TOP" },
};
const lookups: ConvertLookups = {
  listCode: (listId, t) => LISTS[listId]?.[t.trim().toLowerCase()] ?? null,
  userId: () => null,
  istatCode: (listId, t, parent) => istatLookup(listId, t, parent),
};

function xlsx(aoa: unknown[][], opts: { hiddenFirst?: boolean } = {}): Uint8Array {
  const wb = XLSX.utils.book_new();
  if (opts.hiddenFirst) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Nascosto"], ["x"]]), "Nascosto");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Dati");
  if (opts.hiddenFirst) wb.Workbook = { Sheets: [{ Hidden: 1 }, { Hidden: 0 }] };
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

describe("lettura del foglio", () => {
  it("solo .xlsx: firma zip, file vuoto, testo travestito", () => {
    expect(() => readSheet(new Uint8Array())).toThrow(/vuoto/);
    expect(() => readSheet(new TextEncoder().encode("F001;F002\n1;2"))).toThrow(/\.xlsx/);
    expect(() => readSheet(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).toThrow(/non leggibile/);
  });
  it("primo foglio visibile, intestazioni ripulite, righe vuote saltate, date come numero di serie", () => {
    const s = readSheet(xlsx([[" F001 ", "F002", null, "F023"], [4501, "MI001", "x", 46296], [], [null, "  "], [4502, "MI002"]], { hiddenFirst: true }));
    expect(s.sheetName).toBe("Dati");
    expect(s.headers).toEqual(["F001", "F002", "", "F023"]);
    expect(s.rows).toEqual([
      { rowIndex: 1, cells: [4501, "MI001", "x", 46296] },
      { rowIndex: 4, cells: [4502, "MI002", null, null] },
    ]);
    expect(s.date1904).toBe(false);
  });
  it("troppe righe → 413", () => {
    const aoa: unknown[][] = [["F001"], ...Array.from({ length: MAX_ROWS + 1 }, (_, i) => [i])];
    expect(() => readSheet(xlsx(aoa))).toThrow(/Troppe righe/);
    expect(readSheet(xlsx(aoa.slice(0, MAX_ROWS + 1))).rows).toHaveLength(MAX_ROWS);
  });
});

describe("ISTAT per nome, sigla o codice", () => {
  it("nome senza maiuscole, sigla di provincia, codice senza zeri, omonimi ambigui senza genitore", () => {
    expect(istatLookup("ISTAT_REGIONI", "piemonte", null)).toBe("01");
    expect(istatLookup("ISTAT_PROVINCE", "TO", "01")).toBe("201");
    expect(istatLookup("ISTAT_PROVINCE", "Torino", "03")).toBeNull();
    expect(istatLookup("ISTAT_COMUNI", "1001", null)).toBe("001001");
    expect(istatLookup("ISTAT_COMUNI", "001001", "215")).toBeNull();
    expect(istatLookup("ISTAT_COMUNI", "Castro", null)).toBeNull();
  });
});

const cand = (id: string, g7: string | null, over: Partial<SiteCandidate> = {}): SiteCandidate => ({
  id,
  codiceG7: g7,
  codiceSito: "MI001",
  nomeSito: "Sito Uno",
  archived: false,
  createdAt: new Date("2026-01-01"),
  ...over,
});
const KEY = { codiceG7: 4501, codiceSito: "MI001", nomeSito: "Sito Uno" };

describe("abbinamento D-49", () => {
  it("nuova, aggiornamento, ambigua, archiviata, rilavorazione dalla più recente", () => {
    expect(matchKey(KEY, [])).toEqual({ outcome: "NEW_PRACTICE" });
    expect(matchKey(KEY, [cand("a", "4501", { nomeSito: "Sito Due" })])).toEqual({ outcome: "NEW_PRACTICE" });
    expect(matchKey(KEY, [cand("a", "4501", { codiceSito: " MI001 ", nomeSito: "Sito Uno " })])).toEqual({ outcome: "UPDATE", practiceId: "a" });
    expect(matchKey(KEY, [cand("a", "4501"), cand("b", "4501")])).toEqual({ outcome: "AMBIGUOUS", candidateIds: ["a", "b"] });
    expect(matchKey(KEY, [cand("a", "4501", { archived: true }), cand("b", "4501")])).toEqual({ outcome: "UPDATE", practiceId: "b" });
    expect(matchKey(KEY, [cand("a", "4501", { archived: true })])).toMatchObject({ outcome: "ERROR" });
    expect(matchKey(KEY, [cand("a", "4400"), cand("b", "4300", { createdAt: new Date("2026-05-01"), archived: true })])).toEqual({ outcome: "REWORK", practiceId: "b" });
    expect(matchKey(KEY, [cand("a", null)])).toEqual({ outcome: "REWORK", practiceId: "a" });
  });
  it("chiave: G7 intero, Sito e Nome non vuoti; colonne chiave mancanti", () => {
    const cols = mapColumns(T, ["F001", "F002", "F003"]);
    expect(keyOfRow(T, cols, [4501, " MI001 ", "Sito Uno"], lookups)).toEqual({ key: KEY });
    expect(keyOfRow(T, cols, ["4501", "MI001", "Sito Uno"], lookups)).toEqual({ key: KEY });
    expect(keyOfRow(T, cols, [45.5, "MI001", "Sito Uno"], lookups)).toHaveProperty("error");
    expect(keyOfRow(T, cols, [4501, "MI001", " "], lookups)).toHaveProperty("error");
    expect(missingKeyColumns(T, mapColumns(T, ["F001", "Nome Sito"]))).toEqual(["F002 Codice Sito"]);
  });
});

describe("piano dei valori", () => {
  const headers = ["F001", "F002", "F003", "F010", "F023", "F021", "F074", "F009"];
  const cols = mapColumns(T, headers);
  const row = [4501, "MI001", "Sito Uno", "Raw Land", "1/10/2026", "45,46", "2026-01-01", "Via Roma 1"];

  it("aggiornamento: solo i campi vuoti; diverso → ALREADY_FILLED, uguale → niente; calcolati NOT_IMPORTABLE", () => {
    const current: Record<string, FieldValue> = { F001: 4501, F002: "MI001", F003: "Sito Uno", F009: "Via Verdi 2", F021: 45.46 };
    const p = planRow(T, "INWIT", cols, row, lookups, { kind: "UPDATE", values: current });
    expect(p.changes).toEqual([
      { flowId: "F010", label: "Tipologia sito", value: { code: "RAW_LAND" } },
      { flowId: "F023", label: "Data assegnazione", value: "2026-10-01" },
    ]);
    expect(p.skipped).toEqual([
      expect.objectContaining({ flowId: "F074", reason: "NOT_IMPORTABLE", detail: "campo calcolato" }),
      expect.objectContaining({ flowId: "F009", reason: "ALREADY_FILLED" }),
    ]);
    expect(p.errors).toEqual([]);
  });
  it("valori non validi: INVALID con il motivo, la riga prosegue", () => {
    const bad = [4501, "MI001", "Sito Uno", "Palazzo", "31/02/2026", "tanti", "", "Via Roma 1"];
    const p = planRow(T, "INWIT", cols, bad, lookups, { kind: "UPDATE", values: { F001: 4501, F002: "MI001", F003: "Sito Uno" } });
    expect(p.changes.map((c) => c.flowId)).toEqual(["F009"]);
    expect(p.skipped.map((s) => [s.flowId, s.reason])).toEqual([
      ["F010", "INVALID"],
      ["F023", "INVALID"],
      ["F021", "INVALID"],
    ]);
    expect(p.skipped[0].detail).toMatch(/Palazzo/);
  });
  it("nuova pratica: obbligatori D-38 e gestore coerente con Committente e Cliente Finale", () => {
    const c = mapColumns(T, ["F001", "F002", "F003", "F004", "F005"]);
    expect(planRow(T, "INWIT", c, [4501, "MI001", "Sito Uno", "Todos", "INWIT"], lookups, { kind: "NEW_PRACTICE", values: {} }).errors).toEqual([]);
    expect(planRow(T, "INWIT", c, [4501, "MI001", "Sito Uno", "Todos", ""], lookups, { kind: "NEW_PRACTICE", values: {} }).errors).toEqual([
      expect.stringMatching(/^Cliente Finale.*obbligatorio/),
    ]);
    expect(planRow(T, "INWIT", c, [4501, "MI001", "Sito Uno", "Todos", "TIM"], lookups, { kind: "NEW_PRACTICE", values: {} }).errors).toEqual([
      expect.stringMatching(/TIM_FIBERCOP/),
    ]);
  });
  it("rilavorazione: il G7 lo imposta il comando, non è una modifica", () => {
    const p = planRow(T, "INWIT", cols, row, lookups, { kind: "REWORK", values: { F001: 4501, F002: "MI001", F003: "Sito Uno" } });
    expect(p.changes.map((c) => c.flowId)).not.toContain("F001");
  });
  it("cascata ISTAT: nomi nella stessa riga, genitore già salvato, figlio fuori provincia", () => {
    const c = mapColumns(T, ["F001", "F002", "F003", "F006", "F007", "F008"]);
    const ID = { F001: 4501, F002: "MI001", F003: "Sito Uno" };
    const a = planRow(T, "INWIT", c, [4501, "MI001", "Sito Uno", "Piemonte", "TO", "Agliè"], lookups, { kind: "UPDATE", values: ID });
    expect(a.changes.map((x) => [x.flowId, x.value])).toEqual([
      ["F006", { code: "01" }],
      ["F007", { code: "201" }],
      ["F008", { code: "001001" }],
    ]);
    // Provincia già salvata (Milano): il Comune si cerca lì e Agliè non c'è.
    const b = planRow(T, "INWIT", c, [4501, "MI001", "Sito Uno", "", "", "Agliè"], lookups, { kind: "UPDATE", values: { ...ID, F006: { code: "03" }, F007: { code: "215" } } });
    expect(b.changes).toEqual([]);
    expect(b.skipped).toEqual([expect.objectContaining({ flowId: "F008", reason: "INVALID" })]);
    // Comune per codice di un'altra provincia: la cascata sul risultato finale lo scarta.
    const d = planRow(T, "INWIT", c, [4501, "MI001", "Sito Uno", "", "", "001001"], lookups, { kind: "UPDATE", values: { ...ID, F006: { code: "03" }, F007: { code: "215" } } });
    expect(d.skipped).toEqual([expect.objectContaining({ flowId: "F008", reason: "INVALID" })]);
    // Regione nuova diversa da quella della Provincia salvata: non si propone.
    const e = planRow(T, "INWIT", c, [4501, "MI001", "Sito Uno", "Piemonte", "", ""], lookups, { kind: "UPDATE", values: { ...ID, F007: { code: "215" } } });
    expect(e.changes).toEqual([]);
    expect(e.skipped).toEqual([expect.objectContaining({ flowId: "F006", reason: "INVALID" })]);
  });
});

describe("simulazione del file", () => {
  const headers = ["F001", "F002", "F003", "F004", "F005", "F009"];
  const columns = mapColumns(T, headers);
  const existing: Record<string, Record<string, FieldValue>> = { p1: { F001: 4400, F002: "TO001", F003: "Torre", F009: "Via Po 1" } };

  it("nuova + rilavorazione nello stesso file, chiave ripetuta, aggiornamento in sequenza", () => {
    const rows = planSheet({
      template: T,
      templateId: "INWIT",
      sheet: {
        date1904: false,
        rows: [
          { rowIndex: 1, cells: [4501, "MI001", "Sito Uno", "Todos", "INWIT", "Via A"] },
          { rowIndex: 2, cells: [4502, "MI001", "Sito Uno", "", "", "Via B"] },
          { rowIndex: 3, cells: [4501, "MI001", "Sito Uno", "Todos", "INWIT", ""] },
          { rowIndex: 4, cells: [4400, "TO001", "Torre", "", "", "Via Po 2"] },
          { rowIndex: 5, cells: [4401, "TO001", "Torre", "", "", ""] },
          { rowIndex: 6, cells: ["", "TO001", "Torre", "", "", ""] },
        ],
      },
      columns,
      lookups,
      candidates: [cand("p1", "4400", { codiceSito: "TO001", nomeSito: "Torre" })],
      valuesOf: (id) => existing[id],
    });
    expect(rows.map((r) => [r.rowIndex, r.outcome, r.practiceId, r.originRow])).toEqual([
      [1, "NEW_PRACTICE", null, null],
      [2, "REWORK", null, 1],
      [3, "ERROR", null, null],
      [4, "UPDATE", "p1", null],
      [5, "REWORK", "p1", null],
      [6, "ERROR", null, null],
    ]);
    // La rilavorazione eredita il Core dalla riga 1 (Committente, Cliente Finale, Indirizzo): l'indirizzo diverso non sovrascrive.
    expect(rows[1].errors).toEqual([]);
    expect(rows[1].changes).toEqual([]);
    expect(rows[1].skipped).toEqual([expect.objectContaining({ flowId: "F009", reason: "ALREADY_FILLED" })]);
    expect(rows[2].errors[0]).toMatch(/riga 1/);
    expect(rows[3].skipped).toEqual([expect.objectContaining({ flowId: "F009", reason: "ALREADY_FILLED" })]);
    expect(rows[3].changes).toEqual([]);
  });
});
