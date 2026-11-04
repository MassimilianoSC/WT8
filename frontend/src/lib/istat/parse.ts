/**
 * Lettura del CSV ufficiale ISTAT "Elenco comuni italiani" (D-71): separatore ";", codifica Windows-1252.
 * Le colonne si riconoscono dall'intestazione (non dalla posizione), così un cambio d'ordine non sbaglia i dati.
 */
import type { IstatItemDTO } from "@/lib/contract";

export interface IstatDataset {
  loaded: true;
  /** Data di estrazione (YYYY-MM-DD). */
  version: string;
  source: string;
  regioni: IstatItemDTO[];
  province: Array<IstatItemDTO & { regione: string; sigla: string | null }>;
  comuni: Array<IstatItemDTO & { provincia: string }>;
}
export type IstatData = IstatDataset | { loaded: false };

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const COLUMNS = {
  regioneCode: "codice regione",
  regioneName: "denominazione regione",
  provinciaCode: "codice dell unita territoriale sovracomunale",
  provinciaName: "denominazione dell unita territoriale sovracomunale",
  comuneCode: "codice comune formato alfanumerico",
  comuneName: "denominazione in italiano",
  sigla: "sigla automobilistica",
} as const;

/**
 * Record del CSV con separatore ";": i campi tra virgolette possono contenere ";", virgolette raddoppiate e A CAPO
 * (l'intestazione ufficiale ISTAT ha nomi di colonna su più righe).
 */
export function parseRecords(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ";") {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some((c) => c !== "")) out.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c !== "")) out.push(row);
  return out;
}

/** Decodifica (Windows-1252, o UTF-8 se c'è il BOM) e converte nel dataset a cascata. */
export function parseIstatCsv(bytes: Uint8Array, version: string, source: string): IstatDataset {
  const utf8Bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const text = new TextDecoder(utf8Bom ? "utf-8" : "windows-1252").decode(utf8Bom ? bytes.subarray(3) : bytes);
  const records = parseRecords(text);
  if (records.length < 2) throw new Error("File ISTAT vuoto");
  const header = records[0].map(norm);
  const idx = Object.fromEntries(
    Object.entries(COLUMNS).map(([k, name]) => [k, header.findIndex((h) => h.startsWith(name))])
  ) as Record<keyof typeof COLUMNS, number>;
  const missing = Object.entries(idx).filter(([k, i]) => i < 0 && k !== "sigla").map(([k]) => COLUMNS[k as keyof typeof COLUMNS]);
  if (missing.length) throw new Error(`Colonne ISTAT non trovate: ${missing.join(", ")}`);

  const regioni = new Map<string, IstatItemDTO>();
  const province = new Map<string, IstatItemDTO & { regione: string; sigla: string | null }>();
  const comuni: Array<IstatItemDTO & { provincia: string }> = [];
  for (const c of records.slice(1)) {
    const r = c[idx.regioneCode].padStart(2, "0");
    const p = c[idx.provinciaCode].padStart(3, "0");
    const k = c[idx.comuneCode].padStart(6, "0");
    if (!r || !p || !k) continue;
    regioni.set(r, { code: r, label: c[idx.regioneName] });
    province.set(p, { code: p, label: c[idx.provinciaName], regione: r, sigla: idx.sigla >= 0 ? c[idx.sigla] || null : null });
    comuni.push({ code: k, label: c[idx.comuneName], provincia: p });
  }
  const byLabel = <T extends IstatItemDTO>(a: T, b: T) => a.label.localeCompare(b.label, "it");
  return {
    loaded: true,
    version,
    source,
    regioni: [...regioni.values()].sort(byLabel),
    province: [...province.values()].sort(byLabel),
    comuni: comuni.sort(byLabel),
  };
}
