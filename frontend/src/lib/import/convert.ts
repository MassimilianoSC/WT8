/**
 * Conversione di una cella del foglio nel valore di un campo (contratto §12, B9). PURO: liste, utenti e ISTAT arrivano
 * come funzioni di ricerca. Dopo la conversione il valore passa dalle stesse convalide del PATCH (normalizzazione D-110,
 * liste, cascata ISTAT finale). Un valore che non si riesce a convertire è INVALID e non blocca la riga.
 *
 * - DATE: data Excel (numero di serie o Date), testo gg/mm/aaaa o aaaa-mm-gg.
 * - NUMBER: numero o testo con virgola o punto decimale (G7 intero non negativo).
 * - SELECT / MULTISELECT: codice esatto o etichetta della lista senza distinzione di maiuscole; MULTISELECT separato da ";".
 * - USER / USERS: nome o email di un utente assegnabile per il ruolo del campo; "Nessuno" se la lista lo ammette.
 * - ISTAT: codice o nome (il nome del Comune si cerca nella Provincia della stessa riga).
 * - Cella vuota: nessun valore (non compila nulla).
 */
import { addCalendarDays, isValidIsoDate } from "@/lib/calendario";
import { NONE_CODE, type FieldOccurrenceDTO, type FieldValue, type SelectValue } from "@/lib/contract";

export type Cell = string | number | boolean | Date | null | undefined;

export interface ConvertLookups {
  /** Codice della voce di lista per codice esatto o etichetta (senza maiuscole); null se assente. */
  listCode(listId: string, text: string): string | null;
  /** Id dell'utente assegnabile per nome o email (senza maiuscole); null se assente o ambiguo. */
  userId(role: string | undefined, text: string): string | null;
  /** Codice ISTAT per codice o nome; parentCode restringe la ricerca (Provincia per il Comune). */
  istatCode(listId: string, text: string, parentCode: string | null): string | null;
}

export type Converted = { ok: true; value: FieldValue } | { ok: false; reason: string } | { ok: true; empty: true };

const EXCEL_EPOCH = "1899-12-30";
/** Cartelle con date dal 1904: il giorno 0 è l'1/1/1904. */
const EXCEL_EPOCH_1904 = "1904-01-01";

function toDate(cell: Cell, date1904: boolean): string | null {
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    // Le date dei fogli si leggono a mezzogiorno UTC per non cambiare giorno col fuso.
    return new Date(cell.getTime() + 12 * 3_600_000).toISOString().slice(0, 10);
  }
  if (typeof cell === "number" && Number.isFinite(cell) && cell > 0 && cell < 2958466) return addCalendarDays(date1904 ? EXCEL_EPOCH_1904 : EXCEL_EPOCH, Math.floor(cell));
  if (typeof cell !== "string") return null;
  const t = cell.trim();
  const it = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  const iso = it ? `${it[3]}-${it[2].padStart(2, "0")}-${it[1].padStart(2, "0")}` : t;
  return isValidIsoDate(iso) ? iso : null;
}

function toNumber(cell: Cell): number | null {
  if (typeof cell === "number" && Number.isFinite(cell)) return cell;
  if (typeof cell !== "string") return null;
  const t = cell.trim().replace(/\s/g, "");
  // "1.234,5" (italiano) oppure "1234.5"
  const normalized = /,\d+$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t;
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

const text = (cell: Cell) => (cell === null || cell === undefined ? "" : cell instanceof Date ? cell.toISOString() : String(cell)).trim();

export function convertCell(
  occ: Pick<FieldOccurrenceDTO, "dataType" | "list" | "flowId">,
  cell: Cell,
  lookups: ConvertLookups,
  scope: { parentCode?: string | null; integer?: boolean; date1904?: boolean } = {}
): Converted {
  const raw = text(cell);
  if (raw === "") return { ok: true, empty: true };
  switch (occ.dataType) {
    case "TEXT":
    case "LONGTEXT":
      return { ok: true, value: raw };
    case "DATE": {
      const d = toDate(cell, !!scope.date1904);
      return d ? { ok: true, value: d } : { ok: false, reason: `data non riconosciuta: ${raw}` };
    }
    case "NUMBER": {
      const n = toNumber(cell);
      if (n === null) return { ok: false, reason: `numero non riconosciuto: ${raw}` };
      if (scope.integer && (!Number.isInteger(n) || n < 0)) return { ok: false, reason: `serve un intero non negativo: ${raw}` };
      return { ok: true, value: n };
    }
    case "SELECT":
    case "MULTISELECT":
    case "USER":
    case "USERS": {
      const many = occ.dataType === "MULTISELECT" || occ.dataType === "USERS";
      const parts = many ? raw.split(";").map((p) => p.trim()).filter(Boolean) : [raw];
      const out: SelectValue[] = [];
      for (const p of parts) {
        const code = codeFor(occ, p, lookups, scope.parentCode ?? null);
        if (!code) return { ok: false, reason: `valore non riconosciuto: ${p}` };
        out.push({ code });
      }
      return { ok: true, value: many ? out : out[0] };
    }
    default:
      return { ok: false, reason: "tipo non importabile" };
  }
}

function codeFor(occ: Pick<FieldOccurrenceDTO, "dataType" | "list">, text: string, lookups: ConvertLookups, parentCode: string | null): string | null {
  const list = occ.list;
  if (!list) return null;
  if (occ.dataType === "USER" || occ.dataType === "USERS") {
    if (list.allowNone && text.toLowerCase() === "nessuno") return NONE_CODE;
    return lookups.userId(list.userRole, text);
  }
  if (list.kind === "ISTAT") return lookups.istatCode(list.listId, text, parentCode);
  return lookups.listCode(list.listId, text);
}
