/**
 * Formato CSV dell'export (contratto §11, D-48). PURO. Per Excel in italiano: UTF-8 con BOM, separatore ";",
 * date gg/mm/aaaa, decimali con la virgola, menu con l'etichetta (il testo di "Altro" se usato), utenti col nome.
 * I testi che Excel leggerebbe come formula (=, +, -, @, tab, a capo all'inizio) si prefissano con un apice.
 */
import { isValidIsoDate } from "@/lib/calendario";
import { NO_DATE, NO_DATE_LABEL, NONE_CODE, type FieldOccurrenceDTO, type FieldValue, type SelectValue, type StatoAttivita } from "@/lib/contract";
import { OTHER_CODE } from "@/lib/practice/normalize";

export const CSV_BOM = "﻿";
export const CSV_SEPARATOR = ";";
export const REPEAT_JOIN = " | ";

export interface CsvLookup {
  /** Etichetta di un codice di lista (null se sconosciuto: si mostra il codice). */
  listLabel(listId: string, code: string): string | null;
  /** Nome di un utente (null se sconosciuto: si mostra l'id). */
  userName(id: string): string | null;
}

const STATO_LABELS: Partial<Record<StatoAttivita, string>> = { STAND_BY: "STAND-BY" };
export const statoLabel = (s: StatoAttivita) => STATO_LABELS[s] ?? s.replace(/_/g, " ");

export const itDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
export const itNumber = (n: number) => String(n).replace(".", ",");

/** Testo libero: protetto dall'interpretazione come formula. */
export const safeText = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);

function selectText(occ: Pick<FieldOccurrenceDTO, "dataType" | "list">, v: SelectValue, lookup: CsvLookup): string {
  if (occ.dataType === "USER" || occ.dataType === "USERS") return v.code === NONE_CODE ? "Nessuno" : lookup.userName(v.code) ?? v.code;
  if (v.code === OTHER_CODE && v.otherText) return safeText(v.otherText);
  return safeText((occ.list && lookup.listLabel(occ.list.listId, v.code)) ?? v.code);
}

/** Valore di un campo come testo della cella (non ancora con l'escape CSV). */
export function cellText(occ: Pick<FieldOccurrenceDTO, "dataType" | "list">, v: FieldValue | undefined, lookup: CsvLookup): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return itNumber(v);
  if (typeof v === "string") {
    if (occ.dataType === "DATE" && v === NO_DATE) return NO_DATE_LABEL; // D-208
    return occ.dataType === "DATE" && isValidIsoDate(v) ? itDate(v) : safeText(v);
  }
  if (Array.isArray(v)) return v.map((x) => selectText(occ, x, lookup)).join(", ");
  return selectText(occ, v, lookup);
}

/** Escape CSV: tra virgolette se contiene separatore, virgolette o a capo. */
export function csvCell(s: string): string {
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvLine(cells: string[]): string {
  return cells.map(csvCell).join(CSV_SEPARATOR);
}
