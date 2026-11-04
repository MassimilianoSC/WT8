/**
 * Dati geografici ISTAT a cascata (D-40, D-71), serviti dal JSON in src/data/istat/ senza database.
 * Finché c'è il segnaposto { loaded: false } le rotte rispondono 503 "Dataset ISTAT non caricato".
 */
import type { IstatItemDTO } from "@/lib/contract";
import { HttpError } from "@/lib/http-error";
import type { IstatData, IstatDataset } from "@/lib/istat/parse";
import data from "@/data/istat/istat.json";

const DATASET = data as unknown as IstatData;

function loaded(d: IstatData = DATASET): IstatDataset {
  if (!d.loaded) throw new HttpError("Dataset ISTAT non caricato", 503);
  return d;
}

export function regioni(d?: IstatData): IstatItemDTO[] {
  return loaded(d).regioni.map(({ code, label }) => ({ code, label }));
}
export function province(regione: string | null, d?: IstatData): IstatItemDTO[] {
  if (!regione) throw new HttpError("Indica la regione", 400);
  return loaded(d).province.filter((p) => p.regione === regione).map(({ code, label }) => ({ code, label }));
}
export function comuni(provincia: string | null, d?: IstatData): IstatItemDTO[] {
  if (!provincia) throw new HttpError("Indica la provincia", 400);
  return loaded(d).comuni.filter((c) => c.provincia === provincia).map(({ code, label }) => ({ code, label }));
}

let parents: Map<string, Map<string, string | null>> | null = null;

/**
 * Genitore di un codice ISTAT nella sua lista (ISTAT_REGIONI → null, ISTAT_PROVINCE → regione, ISTAT_COMUNI →
 * provincia); undefined se il codice non esiste. null come risultato globale = dataset non caricato.
 */
export function istatParentOf(listId: string, code: string, d: IstatData = DATASET): string | null | undefined | "NOT_LOADED" {
  if (!d.loaded) return "NOT_LOADED";
  if (!parents || d !== DATASET) {
    const built = new Map<string, Map<string, string | null>>([
      ["ISTAT_REGIONI", new Map(d.regioni.map((r) => [r.code, null]))],
      ["ISTAT_PROVINCE", new Map(d.province.map((p) => [p.code, p.regione]))],
      ["ISTAT_COMUNI", new Map(d.comuni.map((c) => [c.code, c.provincia]))],
    ]);
    if (d !== DATASET) return built.get(listId)?.get(code);
    parents = built;
  }
  return parents.get(listId)?.get(code);
}

const CODE_LENGTH: Record<string, number> = { ISTAT_REGIONI: 2, ISTAT_PROVINCE: 3, ISTAT_COMUNI: 6 };

type IstatIndex = { byCode: Map<string, string | null>; byName: Map<string, string[]> };
let lookupIndex: Map<string, IstatIndex> | null = null;

const nameKey = (parent: string | null, text: string) => `${parent ?? ""}|${text.trim().toLocaleLowerCase("it")}`;

function buildLookupIndex(d: IstatDataset): Map<string, IstatIndex> {
  const index = (items: Array<{ code: string; label: string; parent: string | null; alt?: string | null }>): IstatIndex => {
    const byCode = new Map(items.map((i) => [i.code, i.parent]));
    const byName = new Map<string, string[]>();
    const add = (k: string, code: string) => byName.set(k, [...(byName.get(k) ?? []), code]);
    for (const i of items) {
      for (const name of [i.label, i.alt].filter((x): x is string => !!x)) {
        add(nameKey(i.parent, name), i.code);
        if (i.parent !== null) add(nameKey(null, name), i.code);
      }
    }
    return { byCode, byName };
  };
  return new Map([
    ["ISTAT_REGIONI", index(d.regioni.map((r) => ({ code: r.code, label: r.label, parent: null })))],
    ["ISTAT_PROVINCE", index(d.province.map((p) => ({ code: p.code, label: p.label, parent: p.regione, alt: p.sigla })))],
    ["ISTAT_COMUNI", index(d.comuni.map((c) => ({ code: c.code, label: c.label, parent: c.provincia })))],
  ]);
}

/**
 * Codice ISTAT da un testo dell'import (B9): codice esatto, oppure nome (senza maiuscole; per le Province anche la
 * sigla). parentCode restringe la ricerca al genitore; senza genitore il nome deve essere unico in Italia.
 * null = non trovato o ambiguo. 503 se il dataset non è caricato.
 */
export function istatLookup(listId: string, text: string, parentCode: string | null, d: IstatData = DATASET): string | null {
  const ds = loaded(d);
  const idx = d === DATASET ? (lookupIndex ??= buildLookupIndex(ds)) : buildLookupIndex(ds);
  const list = idx.get(listId);
  if (!list) return null;
  // Un codice numerico in Excel perde gli zeri iniziali (1001 → "001001").
  const t = /^\d+$/.test(text.trim()) ? text.trim().padStart(CODE_LENGTH[listId] ?? 0, "0") : text.trim();
  if (list.byCode.has(t)) return parentCode === null || list.byCode.get(t) === parentCode ? t : null;
  const found = list.byName.get(nameKey(parentCode, t)) ?? [];
  return found.length === 1 ? found[0] : null;
}
