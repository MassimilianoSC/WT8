/**
 * Lettura della tabella "Associazioni" dei sei MD canonici (D-29). Solo parsing: nessuna interpretazione.
 * Usato a compile time dal compilatore dei template (B2), mai durante le richieste.
 */
import { createHash } from "node:crypto";

export interface SourceRow {
  /** Colonna "#": numero di riga della tabella. */
  row: number;
  team: string;
  section: string;
  label: string;
  dtype: string;
  flowId: string;
  universal: string;
  confidence: string;
  note: string;
  condition: string;
  /** Riga Markdown originale (senza spazi finali). */
  raw: string;
  /** Impronta della riga: primi 16 caratteri esadecimali dello SHA-256 di `raw`. */
  hash: string;
}

export const ASSOCIATION_HEADER = [
  "#",
  "Team",
  "Sezione",
  "Campo nel documento",
  "dtype",
  "id_flusso",
  "Campo Universale proposto",
  "Confidenza",
  "Evidenza / nota",
  "Condizione documentata",
];

export function rowHash(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 16);
}

/** Divide una riga di tabella Markdown sulle "|" non precedute da "\" e fuori dai blocchi `codice`. */
export function splitTableRow(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let inCode = false;
  const body = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "\\" && body[i + 1] === "|") {
      cell += "|";
      i++;
    } else if (ch === "`") {
      inCode = !inCode;
      cell += ch;
    } else if (ch === "|" && !inCode) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell.trim());
  return cells;
}

/**
 * Estrae le righe della tabella "Associazioni" (riconosciuta dalla sua intestazione di dieci colonne).
 * Errore se l'intestazione manca o una riga non ha dieci colonne.
 */
export function parseAssociations(markdown: string, file: string): SourceRow[] {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => {
    const c = splitTableRow(l);
    return c.length === ASSOCIATION_HEADER.length && c.every((v, i) => v === ASSOCIATION_HEADER[i]);
  });
  if (start < 0) throw new Error(`${file}: tabella Associazioni non trovata`);
  const rows: SourceRow[] = [];
  for (let i = start + 2; i < lines.length; i++) {
    const raw = lines[i].replace(/\s+$/, "");
    if (!raw.startsWith("|")) break; // fine della tabella
    const c = splitTableRow(raw);
    if (c.length !== ASSOCIATION_HEADER.length) throw new Error(`${file}:${i + 1}: ${c.length} colonne invece di 10`);
    rows.push({
      row: Number(c[0]),
      team: c[1],
      section: c[2],
      label: c[3],
      dtype: c[4],
      flowId: c[5],
      universal: c[6],
      confidence: c[7],
      note: c[8],
      condition: c[9],
      raw,
      hash: rowHash(raw),
    });
  }
  return rows;
}
