/**
 * Catalogo delle liste iniziali (B6, D-40, D-86, D-99, D-100, D-103). Funzione PURA: dai template compilati
 * e da LISTE_VALORI_INIZIALI.csv produce le liste da caricare nel database. Generato fuori linea insieme ai
 * template (src/data/lists-initial.json), così la build non legge docs/.
 *
 * - Per template: ogni listId CONTROLLED/CONFIGURABLE usato dalle occorrenze; gruppo = owner del master.
 * - Comuni (templateId null, solo ADMIN): SI_NO, COMMITTENTE e CLIENTE_FINALE (unione + Altro, D-16),
 *   stati dei vincoli ed enti controllati (D-99).
 * - TIPOLOGIA_ATTIVITA_PE derivata: unione di PROGETTO e INCARICO (Incarico / Lavorazione) del gestore (D-86).
 */
import type { GroupId, ListItemDTO, TemplateDTO, TemplateId } from "@/lib/contract";
import { snake, type BindingsData, type InitialListRow } from "@/lib/templates/compiler";

export interface InitialList {
  templateId: TemplateId | null;
  listId: string;
  label: string;
  group: GroupId | null;
  kind: "CONTROLLED" | "CONFIGURABLE";
  items: ListItemDTO[];
  provenance: string;
}

/** listId dei template: "Incarico / Lavorazione" → INCARICO (nome del CSV fino a " / "). */
export const DERIVED_LISTS: Record<string, string[]> = { TIPOLOGIA_ATTIVITA_PE: ["PROGETTO", "INCARICO"] };
export const COMMON_LIST_IDS = ["SI_NO", "COMMITTENTE", "CLIENTE_FINALE"];

const csvListId = (campo: string) => snake(campo.split(" / ")[0]);
const itemCode = (r: InitialListRow) => r.codice_proposto || snake(r.valore);

function itemsFrom(rows: InitialListRow[]): ListItemDTO[] {
  const seen = new Set<string>();
  const out: ListItemDTO[] = [];
  for (const r of rows) {
    if (!r.valore) continue;
    const code = itemCode(r);
    if (seen.has(code)) continue;
    seen.add(code);
    out.push({ code, label: r.valore, active: true, order: out.length + 1 });
  }
  // "Altro" sempre in fondo dove esiste (Committente / Cliente Finale, D-100 D1).
  const altro = out.findIndex((i) => i.code === "ALTRO");
  if (altro >= 0) out.push(...out.splice(altro, 1));
  return out.map((i, n) => ({ ...i, order: n + 1 }));
}

const STATE_LABEL: Record<string, string> = { PRESENTE: "Presente", ASSENTE: "Assente", ASSOLTO: "Assolto", NON_PERTINENTE: "Non pertinente" };
const ENTE_LABEL: Record<string, string> = { SOPRINTENDENZA: "Soprintendenza", COMUNE: "Comune", ENAC: "ENAC", ENAV: "ENAV", SIC: "SIC", NATURA2000: "Natura2000", ALTRO: "Altro" };
const CONTROLLED_ENTI: Record<string, string[]> = {
  ENTE_VINCOLO_PAESAGGISTICO: ["SOPRINTENDENZA", "COMUNE"],
  ENTE_VINCOLO_AEROPORTUALE: ["ENAC", "ENAV"],
  ENTE_VINCOLO_NATURALISTICI: ["SIC", "NATURA2000", "ALTRO"],
};
const simpleItems = (codes: string[], labels: Record<string, string>): ListItemDTO[] =>
  codes.map((code, i) => ({ code, label: labels[code] ?? code, active: true, order: i + 1 }));

/**
 * Etichetta distinta di una lista dei vincoli, dai vincoli che la usano (D-157: in Configurazione → Liste le liste
 * erano indistinguibili). Es. "Stato del vincolo (Paesaggistico, Parco)", "Ente del vincolo Aeroportuale",
 * "Stato dei Vincoli Ambientali Naturalistici". Le fasce di rispetto si raccolgono in una voce.
 */
export function constraintListLabel(kind: "Stato" | "Ente", constraintLabels: string[]): string {
  const names = [...new Set(constraintLabels.map((l) => (/^fascia di rispetto/i.test(l.trim()) ? "Fasce di rispetto" : l.trim())))];
  if (names.length === 0) return `${kind} del vincolo`;
  if (names.length === 1) return /^vincol/i.test(names[0]) ? `${kind} dei ${names[0]}` : `${kind} del vincolo ${names[0]}`;
  return `${kind} del vincolo (${names.join(", ")})`;
}

export interface CatalogResult {
  lists: InitialList[];
  warnings: string[];
}

export function buildInitialLists(templates: TemplateDTO[], csv: InitialListRow[], bindings: Pick<BindingsData, "constraints" | "constraintStateLists">): CatalogResult {
  const lists: InitialList[] = [];
  const warnings: string[] = [];
  const rowsFor = (gestori: string[], listId: string) => csv.filter((r) => gestori.includes(r.gestore) && csvListId(r.campo) === listId);

  /* comuni */
  lists.push({ templateId: null, listId: "SI_NO", label: "SI / NO", group: null, kind: "CONTROLLED", items: itemsFrom(rowsFor(["TUTTI"], "SI")), provenance: "LISTE_VALORI_INIZIALI.csv (dominio comune)" });
  for (const listId of ["COMMITTENTE", "CLIENTE_FINALE"]) {
    const rows = csv.filter((r) => csvListId(r.campo) === listId);
    lists.push({ templateId: null, listId, label: listId === "COMMITTENTE" ? "Committente" : "Cliente Finale", group: null, kind: "CONTROLLED", items: itemsFrom(rows), provenance: "Unione dei gestori + Altro (D-16, contratto §6)" });
  }
  const usersOf = (pick: (c: (typeof bindings.constraints)[number]) => string | null | undefined, listId: string) =>
    bindings.constraints.filter((c) => pick(c) === listId).map((c) => c.label);
  for (const [listId, def] of Object.entries(bindings.constraintStateLists)) {
    const label = constraintListLabel("Stato", usersOf((c) => c.stateList, listId));
    lists.push({ templateId: null, listId, label, group: null, kind: def.kind, items: simpleItems(def.values, STATE_LABEL), provenance: "Tabella Vincoli comune degli MD (D-35, D-99)" });
  }
  for (const [listId, codes] of Object.entries(CONTROLLED_ENTI)) {
    const label = constraintListLabel("Ente", usersOf((c) => c.enteList?.listId, listId));
    lists.push({ templateId: null, listId, label, group: null, kind: "CONTROLLED", items: simpleItems(codes, ENTE_LABEL), provenance: "Tabella Vincoli comune degli MD (D-99)" });
  }

  /* per template */
  for (const t of templates) {
    const used = new Map<string, { group: GroupId; kind: "CONTROLLED" | "CONFIGURABLE"; label: string }>();
    for (const o of t.occurrences) {
      if (o.kind !== "MASTER" || !o.list || (o.list.kind !== "CONTROLLED" && o.list.kind !== "CONFIGURABLE")) continue;
      if (o.list.listId === "SI_NO") continue;
      const prev = used.get(o.list.listId);
      if (prev && prev.group !== o.ownerGroup) warnings.push(`${t.id} ${o.list.listId}: usata dai gruppi ${prev.group} e ${o.ownerGroup}, gestita da ${prev.group}`);
      if (!prev) used.set(o.list.listId, { group: o.ownerGroup, kind: o.list.kind, label: o.label });
    }
    for (const c of bindings.constraints) {
      if (c.enteList?.kind === "CONFIGURABLE") used.set(c.enteList.listId, { group: "PM_PERMESSI", kind: "CONFIGURABLE", label: constraintListLabel("Ente", [c.label]) });
    }
    for (const [listId, u] of used) {
      if (DERIVED_LISTS[listId]) continue;
      const rows = rowsFor([t.id, "TUTTI"], listId);
      const tipo = rows[0]?.tipo_lista;
      let items = itemsFrom(rows);
      if (u.kind === "CONFIGURABLE" && items.some((i) => i.code === "ALTRO")) {
        // Su un menu configurabile "Altro" (con testo libero) lo dà il campo (allowOther, D-100 D1): niente doppione.
        items = items.filter((i) => i.code !== "ALTRO").map((i, n) => ({ ...i, order: n + 1 }));
        warnings.push(`${t.id} ${listId}: voce "Altro" del CSV tolta, vale "Altro" del campo (D-100 D1)`);
      }
      lists.push({
        templateId: t.id,
        listId,
        label: rows[0]?.campo ?? u.label,
        group: u.group,
        kind: u.kind,
        items,
        provenance: rows.length ? `LISTE_VALORI_INIZIALI.csv (${tipo})` : "Nessun valore iniziale: da completare in Configurazione (D-103)",
      });
    }
    for (const [listId, sources] of Object.entries(DERIVED_LISTS)) {
      if (!used.has(listId)) continue;
      const fromSources = sources.flatMap((s) => lists.find((l) => l.templateId === t.id && l.listId === s)?.items ?? []);
      lists.push({
        templateId: t.id,
        listId,
        label: "Tipologia attività PE",
        group: used.get(listId)!.group,
        kind: "CONTROLLED",
        items: deriveItems(fromSources, []),
        provenance: `Derivata: unione di ${sources.join(" e ")} (D-86)`,
      });
    }
  }
  lists.sort((a, b) => (a.templateId ?? "").localeCompare(b.templateId ?? "") || a.listId.localeCompare(b.listId));
  return { lists, warnings };
}

/**
 * Lista derivata: unione delle voci sorgente (prima occorrenza di ogni codice). I codici già presenti nella
 * derivata ma spariti dalle sorgenti restano, disattivati: potrebbero essere usati in una pratica.
 */
export function deriveItems(sourceItems: ListItemDTO[], previous: ListItemDTO[]): ListItemDTO[] {
  const out: ListItemDTO[] = [];
  const seen = new Set<string>();
  for (const i of sourceItems) {
    if (seen.has(i.code)) continue;
    seen.add(i.code);
    out.push({ code: i.code, label: i.label, active: i.active, order: out.length + 1 });
  }
  for (const p of previous) {
    if (seen.has(p.code)) continue;
    seen.add(p.code);
    out.push({ ...p, active: false, order: out.length + 1 });
  }
  return out;
}
