import { NO_DATE, NO_DATE_LABEL, NONE_CODE, type DataType, type FieldValue, type SelectValue } from "@/lib/contract";

/** Pure formatting/parsing helpers for field values (no React). */

export const ALTRO = "ALTRO";

export interface Option {
  code: string;
  label: string;
  /** Deactivated list item: not offered, but still labels saved values (D-106). */
  inactive?: boolean;
}

/** Empty list (D-103): who can fill it. */
export const EMPTY_LIST_TEXT = "Nessun valore: chiedi al team leader di aggiungerlo in Configurazione → Liste";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const IT_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function validDate(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** "YYYY-MM-DD" (transport) → "gg/mm/aaaa" (display, D-38). */
export function isoToIt(iso: string | null | undefined): string {
  const m = iso ? ISO_DATE.exec(iso) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** "gg/mm/aaaa" → "YYYY-MM-DD", or null when not a real calendar date. */
export function itToIso(text: string): string | null {
  const m = IT_DATE.exec(text.trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return validDate(y, mo, d) ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Input mask: keeps up to 8 digits and inserts the slashes (gg/mm/aaaa). */
export function maskItDate(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Italian decimal input ("12,5" or "12.5") → number, null when blank,
 *  undefined when not a number. */
export function parseDecimal(text: string): number | null | undefined {
  const t = text.trim().replace(/\s/g, "");
  if (t === "") return null;
  if (!/^[-+]?\d+([.,]\d+)?$/.test(t)) return undefined;
  return Number(t.replace(",", "."));
}

export function formatDecimal(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  return String(n).replace(".", ",");
}

/** "Nessuno" of the user fields (ListRefDTO.allowNone, contract NONE_CODE). */
export const NONE_LABEL = "Nessuno";

export function selectLabel(v: SelectValue, options: Option[] | undefined): string {
  if (v.code === ALTRO) return v.otherText ? `${v.otherText} (Altro)` : "Altro";
  if (v.code === NONE_CODE) return NONE_LABEL;
  const o = options?.find((x) => x.code === v.code);
  if (!o) return v.code;
  return o.inactive ? `${o.label} (disattivata)` : o.label;
}

/** Read-only text for any value, given its data type. */
export function formatValue(dataType: DataType, value: FieldValue | undefined, options?: Option[]): string {
  if (value === null || value === undefined) return "";
  switch (dataType) {
    case "DATE":
      if (value === NO_DATE) return NO_DATE_LABEL; // D-208
      return typeof value === "string" ? isoToIt(value) || value : "";
    case "NUMBER":
      return typeof value === "number" ? formatDecimal(value) : String(value);
    case "SELECT":
    case "USER":
      return typeof value === "object" && !Array.isArray(value) && "code" in value ? selectLabel(value, options) : "";
    case "MULTISELECT":
    case "USERS":
      return Array.isArray(value) ? value.map((v) => selectLabel(v, options)).join(", ") : "";
    default:
      return typeof value === "string" || typeof value === "number" ? String(value) : "";
  }
}
