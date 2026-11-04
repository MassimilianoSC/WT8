/**
 * Lettura del file caricato per l'import (B9, D-136). L'UNICO punto di B9 che usa la libreria Excel: il resto lavora
 * su intestazioni e celle già estratte. Il file arriva da un utente, quindi:
 * - solo .xlsx (archivio zip: si controlla la firma prima di passarlo alla libreria, niente CSV/HTML/XML/xls);
 * - dimensione e righe limitate (MAX_FILE_BYTES, MAX_ROWS);
 * - nessuna formula, nessuno stile, nessuna macro: si leggono solo i valori già calcolati;
 * - le date restano numeri di serie (nessuna Date della libreria, che dipende dal fuso): le converte convert.ts.
 */
import * as XLSX from "xlsx";
import { HttpError } from "@/lib/http-error";
import type { Cell } from "@/lib/import/convert";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 2000;

export interface SheetRow {
  /** 1 = prima riga di dati (quella sotto le intestazioni). */
  rowIndex: number;
  cells: Cell[];
}

export interface SheetData {
  sheetName: string;
  headers: string[];
  /** Solo le righe con almeno una cella non vuota. */
  rows: SheetRow[];
  /** Cartella con date dal 1904 (Excel per Mac di vecchia data): i numeri di serie partono da un'altra origine. */
  date1904: boolean;
}

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];

function isBlank(c: unknown): boolean {
  return c === null || c === undefined || (typeof c === "string" && c.trim() === "");
}

function toCell(v: unknown): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  return String(v);
}

export function readSheet(bytes: Uint8Array): SheetData {
  if (bytes.byteLength === 0) throw new HttpError("File vuoto", 422);
  if (bytes.byteLength > MAX_FILE_BYTES) throw new HttpError(`File troppo grande (massimo ${MAX_FILE_BYTES / 1024 / 1024} MB)`, 413);
  if (!ZIP_SIGNATURE.every((b, i) => bytes[i] === b)) throw new HttpError("Formato non supportato: serve un file .xlsx", 422);

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(bytes, {
      type: "array",
      cellDates: false,
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      bookVBA: false,
      // +1 per le intestazioni, +1 per accorgersi che le righe sono troppe.
      sheetRows: MAX_ROWS + 2,
    });
  } catch {
    throw new HttpError("File non leggibile: serve un file .xlsx non protetto da password", 422);
  }

  const visible = wb.SheetNames.find((_, i) => !wb.Workbook?.Sheets?.[i]?.Hidden) ?? wb.SheetNames[0];
  const sheet = visible ? wb.Sheets[visible] : undefined;
  if (!sheet) throw new HttpError("Il file non contiene fogli", 422);

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, blankrows: true });
  if (matrix.length === 0) throw new HttpError("Il foglio è vuoto: serve una riga di intestazioni", 422);
  if (matrix.length > MAX_ROWS + 1) throw new HttpError(`Troppe righe (massimo ${MAX_ROWS} per file): dividi il foglio`, 413);

  const headers = (matrix[0] ?? []).map((h) => (isBlank(h) ? "" : String(h).trim()));
  const rows: SheetRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const raw = matrix[r] ?? [];
    if (raw.every(isBlank)) continue;
    rows.push({ rowIndex: r, cells: headers.map((_, c) => toCell(raw[c])) });
  }
  return { sheetName: visible, headers, rows, date1904: !!wb.Workbook?.WBProps?.date1904 };
}
