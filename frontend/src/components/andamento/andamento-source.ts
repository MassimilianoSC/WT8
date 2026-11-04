import { apiFetch } from "@/lib/client";
import type { AndamentoFilters } from "@/components/andamento/andamento-url";
import type {
  AndamentoFermeDTO,
  AndamentoFlussiDTO,
  AndamentoGruppiDTO,
  AndamentoRilavorazioniDTO,
  AndamentoScadenzeDTO,
  AndamentoSettingsDTO,
  AndamentoStatiDTO,
} from "@/components/andamento/types";

/** Andamento reads (contract §15.3): one endpoint per block; ADMIN or Direzione, 404 with the switch off. */

function periodQuery(f: AndamentoFilters): string {
  const p = new URLSearchParams();
  if (f.templateId) p.set("templateId", f.templateId);
  p.set("from", f.from);
  p.set("to", f.to);
  p.set("granularity", f.passo === "settimana" ? "week" : "month");
  // Both comparisons come in every answer (§15.3): the page picks one, no parameter.
  return p.toString();
}

/**
 * The summary tiles and the blocks read the same answers: one request per
 * address for a minute. A failed request is forgotten at once; "Riprova"
 * passes fresh = true and always asks again.
 */
const TTL_MS = 60_000;
const recent = new Map<string, { at: number; promise: Promise<unknown> }>();

function readOnce<T>(url: string, fresh = false): Promise<T> {
  const hit = recent.get(url);
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) return hit.promise as Promise<T>;
  const promise = apiFetch<T>(url, { cache: "no-store" });
  recent.set(url, { at: Date.now(), promise });
  promise.catch(() => recent.get(url)?.promise === promise && recent.delete(url));
  return promise;
}

/** For the tests. */
export function forgetReads(): void {
  recent.clear();
}

export function loadStati(f: AndamentoFilters, fresh = false): Promise<AndamentoStatiDTO> {
  return readOnce(`/api/andamento/stati?${periodQuery(f)}`, fresh);
}

export function loadFlussi(f: AndamentoFilters, fresh = false): Promise<AndamentoFlussiDTO> {
  return readOnce(`/api/andamento/flussi?${periodQuery(f)}`, fresh);
}

export function loadRilavorazioni(f: AndamentoFilters, fresh = false): Promise<AndamentoRilavorazioniDTO> {
  return readOnce(`/api/andamento/rilavorazioni?${periodQuery(f)}`, fresh);
}

export function loadGruppi(f: AndamentoFilters, fresh = false): Promise<AndamentoGruppiDTO> {
  return readOnce(`/api/andamento/gruppi?${periodQuery(f)}`, fresh);
}

export function loadScadenze(f: AndamentoFilters, fresh = false): Promise<AndamentoScadenzeDTO> {
  return readOnce(`/api/andamento/scadenze?${periodQuery(f)}`, fresh);
}

/** /ferme reads only templateId (and stato): the threshold is today's. */
export function loadFerme(f: Pick<AndamentoFilters, "templateId">, fresh = false): Promise<AndamentoFermeDTO> {
  const p = new URLSearchParams();
  if (f.templateId) p.set("templateId", f.templateId);
  const qs = p.toString();
  return readOnce(`/api/andamento/ferme${qs ? `?${qs}` : ""}`, fresh);
}

/** The server's CSV (§15.3, o2 4945db8): one switch, in case it has to be hidden again. */
export const CSV_READY = true;

export type AndamentoBlock = "stati" | "gruppi" | "ferme" | "flussi" | "rilavorazioni" | "scadenze";
/** Secondary tables (§15.3): stati → serie; rilavorazioni → daStato, ritorni; scadenze → milestone. */
export type CsvTable = "serie" | "daStato" | "ritorni" | "milestone";

/** Server-made CSV of a block's table (&format=csv[&tabella=]); the server names the file. */
export function csvHref(block: AndamentoBlock, f: AndamentoFilters, tabella?: CsvTable): string {
  const qs = block === "ferme" ? (f.templateId ? `templateId=${f.templateId}&` : "") : `${periodQuery(f)}&`;
  return `/api/andamento/${block}?${qs}format=csv${tabella ? `&tabella=${tabella}` : ""}`;
}

export function loadAndamentoSettings(): Promise<AndamentoSettingsDTO> {
  return apiFetch<AndamentoSettingsDTO>("/api/andamento/settings", { cache: "no-store" });
}

export function saveAndamentoSettings(sogliaFermeGiorni: number): Promise<AndamentoSettingsDTO> {
  return apiFetch<AndamentoSettingsDTO>("/api/andamento/settings", { method: "PUT", body: JSON.stringify({ sogliaFermeGiorni }) });
}
