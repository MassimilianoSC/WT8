/**
 * Andamento (contratto §15.3): un endpoint per blocco, stessi filtri, stesso insieme di dati in cache (5 minuti).
 * Accesso: interruttore acceso e ADMIN o Direzione (access.ts). Tutti i template: chi legge Andamento li vede tutti.
 */
import type { Db } from "mongodb";
import { STATI_ATTIVITA, TEMPLATE_IDS, type StatoAttivita, type TemplateId, type UserDTO } from "@/lib/contract";
import { HttpError } from "@/lib/http-error";
import { requireAndamento } from "./access";
import { FERME_MAX_ITEMS, fermeBlock, flussiBlock, rilavorazioniBlock, statiBlock, windowsOf } from "./blocks";
import { fermeCsv, flussiCsv, gruppiCsv, rilavorazioniCsv, scadenzeCsv, statiCsv, tabellaOf, type CsvFile } from "./csv";
import { gruppiBlock, scadenzeBlock } from "./blocks-extra";
import { loadDataset } from "./dataset";
import { loadExtra } from "./extra";
import { parseAndamentoQuery } from "./period";
import { readAndamentoSettings } from "./settings";

export const BLOCCHI = ["stati", "gruppi", "ferme", "flussi", "rilavorazioni", "scadenze"] as const;
export type Blocco = (typeof BLOCCHI)[number];

export const isBlocco = (b: string): b is Blocco => (BLOCCHI as readonly string[]).includes(b);

/** Filtri della richiesta (le ferme hanno i propri). */
function fermeQuery(params: URLSearchParams): { templateId: TemplateId | null; stato: StatoAttivita | null } {
  const t = params.get("templateId");
  if (t !== null && t !== "" && !(TEMPLATE_IDS as readonly string[]).includes(t)) throw new HttpError("Parametro templateId non valido", 400);
  const s = params.get("stato");
  if (s !== null && s !== "" && !(STATI_ATTIVITA as readonly string[]).includes(s)) throw new HttpError("Parametro stato non valido", 400);
  return { templateId: t ? (t as TemplateId) : null, stato: s ? (s as StatoAttivita) : null };
}

async function compute(db: Db, user: UserDTO, blocco: Blocco, params: URLSearchParams, now: Date, allItems: boolean) {
  if (blocco === "ferme") {
    const fq = fermeQuery(params);
    const ds = await loadDataset(db, fq.templateId ? [fq.templateId] : TEMPLATE_IDS, now);
    const { sogliaFermeGiorni } = await readAndamentoSettings(db);
    return { blocco, dto: fermeBlock(ds, user, fq, sogliaFermeGiorni, now, allItems ? Infinity : FERME_MAX_ITEMS) } as const;
  }
  const q = parseAndamentoQuery(params, now);
  const ds = await loadDataset(db, q.templateId ? [q.templateId] : TEMPLATE_IDS, now);
  const w = windowsOf(ds, q);
  switch (blocco) {
    case "stati":
      return { blocco, dto: statiBlock(ds, w, now) } as const;
    case "flussi":
      return { blocco, dto: flussiBlock(ds, w, now) } as const;
    case "rilavorazioni":
      return { blocco, dto: rilavorazioniBlock(ds, w, now) } as const;
    case "scadenze":
      return { blocco, dto: scadenzeBlock(ds, await loadExtra(db, ds), w, now) } as const;
    case "gruppi":
      return { blocco, dto: gruppiBlock(ds, await loadExtra(db, ds), w, now) } as const;
  }
}

/** DTO del blocco (JSON). */
export async function getBlocco(db: Db, user: UserDTO, blocco: string, params: URLSearchParams, now: Date = new Date()) {
  requireAndamento(user);
  if (!isBlocco(blocco)) throw new HttpError("Non trovato", 404);
  return (await compute(db, user, blocco, params, now, false)).dto;
}

/** Risposta del blocco: JSON, oppure CSV con &format=csv (&tabella= per le tabelle secondarie). */
export async function andamentoResponse(db: Db, user: UserDTO, blocco: string, params: URLSearchParams, now: Date = new Date()): Promise<{ json: unknown } | { csv: CsvFile }> {
  requireAndamento(user);
  if (!isBlocco(blocco)) throw new HttpError("Non trovato", 404);
  const format = params.get("format");
  if (format !== null && format !== "" && format !== "json" && format !== "csv") throw new HttpError("Parametro format non valido (json o csv)", 400);
  if (format !== "csv") return { json: (await compute(db, user, blocco, params, now, false)).dto };
  const tabella = tabellaOf(blocco, params.get("tabella"));
  const r = await compute(db, user, blocco, params, now, true);
  switch (r.blocco) {
    case "stati":
      return { csv: statiCsv(r.dto, tabella) };
    case "gruppi":
      return { csv: gruppiCsv(r.dto) };
    case "ferme":
      return { csv: fermeCsv(r.dto, now) };
    case "flussi":
      return { csv: flussiCsv(r.dto) };
    case "rilavorazioni":
      return { csv: rilavorazioniCsv(r.dto, tabella) };
    case "scadenze":
      return { csv: scadenzeCsv(r.dto, tabella) };
  }
}
