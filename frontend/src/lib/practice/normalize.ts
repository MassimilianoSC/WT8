/**
 * Normalizzazione in scrittura dei valori dei campi (B5b, D-110). PURA: niente database.
 *
 * - Testo di soli spazi → null (TEXT, LONGTEXT, DATE); il testo valorizzato si salva così com'è.
 * - DATE: data reale "YYYY-MM-DD"; NUMBER: numero finito.
 * - SELECT / USER: codice non vuoto (altrimenti 422); otherText solo con il codice ALTRO e una lista che
 *   ammette "Altro", e allora obbligatorio. USER: id utente o NONE_CODE se la lista lo ammette.
 * - MULTISELECT / USERS: array vuoto → null; codici univoci; NONE_CODE esclusivo.
 * Che i codici esistano nelle liste (e siano attivi) lo controlla il servizio, che legge le liste: qui si
 * restituisce solo cosa controllare (`listCodesOf`).
 */
import { isValidIsoDate } from "@/lib/calendario";
import { NONE_CODE, type FieldOccurrenceDTO, type ListRefDTO, type FieldValue, type SelectValue } from "@/lib/contract";
import { HttpError } from "@/lib/http-error";

export const OTHER_CODE = "ALTRO";
export const TEXT_MAX = 2000;
export const LONGTEXT_MAX = 20000;
const USER_ID_RX = /^[0-9a-f]{24}$/;

type Occ = Pick<FieldOccurrenceDTO, "dataType" | "label" | "list">;

const invalid = (occ: Pick<Occ, "label">, why: string) => new HttpError(`${occ.label}: ${why}`, 422);

const isSelect = (v: unknown): v is SelectValue =>
  !!v && typeof v === "object" && !Array.isArray(v) && typeof (v as SelectValue).code === "string";

function normalizeSelect(occ: Occ, v: unknown, user: boolean): SelectValue {
  if (!isSelect(v)) throw invalid(occ, "serve un valore della lista");
  const extra = Object.keys(v).filter((k) => k !== "code" && k !== "otherText");
  if (extra.length) throw invalid(occ, `chiavi non ammesse (${extra.join(", ")})`);
  const code = v.code.trim();
  if (code === "") throw invalid(occ, "codice vuoto: per svuotare il campo si manda null");
  if (user) {
    if (v.otherText !== undefined) throw invalid(occ, "un campo utente non ammette testo libero");
    if (code === NONE_CODE) {
      if (!occ.list?.allowNone) throw invalid(occ, "la voce Nessuno non è ammessa");
      return { code };
    }
    if (!USER_ID_RX.test(code)) throw invalid(occ, "utente non valido");
    return { code };
  }
  if (code === OTHER_CODE && occ.list?.allowOther) {
    const otherText = typeof v.otherText === "string" ? v.otherText.trim() : "";
    if (otherText === "") throw invalid(occ, "con Altro serve il testo");
    return { code, otherText };
  }
  if (v.otherText !== undefined) throw invalid(occ, "il testo libero si usa solo con Altro");
  return { code };
}

/** Valore normalizzato di un'occorrenza, oppure 422 con un messaggio leggibile. */
export function normalizeFieldValue(occ: Occ, value: FieldValue | undefined): FieldValue {
  if (value === null || value === undefined) return null;
  switch (occ.dataType) {
    case "TEXT":
    case "LONGTEXT": {
      if (typeof value !== "string") throw invalid(occ, "serve un testo");
      if (value.trim() === "") return null;
      const max = occ.dataType === "TEXT" ? TEXT_MAX : LONGTEXT_MAX;
      if (value.length > max) throw invalid(occ, `testo troppo lungo (massimo ${max} caratteri)`);
      return value;
    }
    case "DATE": {
      if (typeof value !== "string") throw invalid(occ, "serve una data");
      const d = value.trim();
      if (d === "") return null;
      if (!isValidIsoDate(d)) throw invalid(occ, "data non valida (formato AAAA-MM-GG)");
      return d;
    }
    case "NUMBER":
      if (typeof value !== "number" || !Number.isFinite(value)) throw invalid(occ, "serve un numero");
      return value;
    case "SELECT":
    case "USER":
      return normalizeSelect(occ, value, occ.dataType === "USER");
    case "MULTISELECT":
    case "USERS": {
      if (!Array.isArray(value)) throw invalid(occ, "serve un elenco di valori");
      if (value.length === 0) return null;
      const items = value.map((x) => normalizeSelect(occ, x, occ.dataType === "USERS"));
      const codes = items.map((x) => x.code);
      if (new Set(codes).size !== codes.length) throw invalid(occ, "valori ripetuti");
      if (codes.includes(NONE_CODE) && codes.length > 1) throw invalid(occ, "Nessuno non si combina con altri utenti");
      return items;
    }
    default:
      throw invalid(occ, "tipo di dato sconosciuto");
  }
}

/** Testo delle Note Operative: soli spazi → "" (il trasversale non ammette null). */
export function normalizeNoteOperative(value: string): string {
  if (value.trim() === "") return "";
  if (value.length > LONGTEXT_MAX) throw new HttpError(`Note Operative: testo troppo lungo (massimo ${LONGTEXT_MAX} caratteri)`, 422);
  return value;
}

/** Stato ed ente di una riga di VINCOLI: codice vuoto → 422, null per svuotare; "Altro" con testo se la lista lo ammette. */
export function normalizeConstraint(
  label: string,
  c: { stato?: SelectValue | null; ente?: SelectValue | null },
  lists: { stateList?: ListRefDTO; enteList?: ListRefDTO | null } = {}
): { stato?: SelectValue | null; ente?: SelectValue | null } {
  const one = (what: string, v: SelectValue | null | undefined, list?: ListRefDTO | null) =>
    v === undefined ? undefined : v === null ? null : normalizeSelect({ dataType: "SELECT", label: `${label} (${what})`, list: list ?? undefined }, v, false);
  const out: { stato?: SelectValue | null; ente?: SelectValue | null } = {};
  const stato = one("stato", c.stato, lists.stateList);
  const ente = one("ente", c.ente, lists.enteList);
  if (stato !== undefined) out.stato = stato;
  if (ente !== undefined) out.ente = ente;
  return out;
}

/** Codici da verificare sulle liste per un valore già normalizzato (vuoto per testo, date, numeri). */
export function listCodesOf(occ: Pick<Occ, "list">, value: FieldValue): string[] {
  if (value === null || typeof value !== "object") return [];
  const items = Array.isArray(value) ? value : [value];
  return items
    .map((x) => x.code)
    .filter((c) => c !== NONE_CODE && !(c === OTHER_CODE && occ.list?.allowOther));
}

/** Codice Sito (F002) e Nome Sito (F003): la chiave di abbinamento D-49. */
export const SITE_KEY_FLOWS: ReadonlySet<string> = new Set(["F002", "F003"]);

/** Spazi di un testo della chiave del sito: niente agli estremi, uno solo tra le parole (D-138). */
export const normalizeSiteKey = (text: string) => text.trim().replace(/\s+/g, " ");

/** In scrittura Codice Sito e Nome Sito si normalizzano negli spazi; gli altri valori passano invariati. */
export function normalizeSiteText(flowId: string, v: FieldValue): FieldValue {
  return SITE_KEY_FLOWS.has(flowId) && typeof v === "string" ? normalizeSiteKey(v) : v;
}
