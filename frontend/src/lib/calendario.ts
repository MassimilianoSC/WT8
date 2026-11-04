/**
 * Calendario e orari di PracticeHub (D-43). Funzioni PURE: niente DB, niente orologio implicito
 * (l'istante "adesso" si passa sempre come parametro), nessuna dipendenza dal fuso del server.
 *
 * - Le date dell'utente viaggiano come "YYYY-MM-DD" (IsoDate, contratto §1) e qui si calcolano in UTC
 *   a mezzanotte, così ora legale e fuso del container non spostano mai il giorno.
 * - Giorni lavorativi: lunedì–venerdì esclusi i festivi nazionali italiani (non i santi patroni).
 * - Gli orari (es. le 09:00 degli alert) sono sempre in Europe/Rome, calcolati con Intl.
 */

export type IsoDate = string;

export const TIME_ZONE = "Europe/Rome";
const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE_RX = /^(\d{4})-(\d{2})-(\d{2})$/;

/* ---------- date YYYY-MM-DD ---------- */

/** Converte "YYYY-MM-DD" in un Date UTC a mezzanotte; RangeError se la data non esiste. */
export function parseIsoDate(date: IsoDate): Date {
  const m = ISO_DATE_RX.exec(date);
  if (!m) throw new RangeError(`Data non valida (atteso YYYY-MM-DD): ${date}`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    throw new RangeError(`Data inesistente: ${date}`);
  }
  return dt;
}

/** Date (letto in UTC) → "YYYY-MM-DD". */
export function formatIsoDate(dt: Date): IsoDate {
  const y = String(dt.getUTCFullYear()).padStart(4, "0");
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isValidIsoDate(date: string): boolean {
  try {
    parseIsoDate(date);
    return true;
  } catch {
    return false;
  }
}

/** Somma (o sottrae, con n negativo) giorni di calendario. */
export function addCalendarDays(date: IsoDate, n: number): IsoDate {
  if (!Number.isInteger(n)) throw new RangeError(`Numero di giorni non intero: ${n}`);
  return formatIsoDate(new Date(parseIsoDate(date).getTime() + n * DAY_MS));
}

/**
 * Somma (o sottrae) mesi di calendario. Se il giorno non esiste nel mese di arrivo si usa l'ultimo
 * giorno del mese (31/01 + 1 mese = 28 o 29/02).
 */
export function addMonths(date: IsoDate, n: number): IsoDate {
  if (!Number.isInteger(n)) throw new RangeError(`Numero di mesi non intero: ${n}`);
  const dt = parseIsoDate(date);
  const total = dt.getUTCFullYear() * 12 + dt.getUTCMonth() + n;
  const y = Math.floor(total / 12);
  const m = total - y * 12;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return formatIsoDate(new Date(Date.UTC(y, m, Math.min(dt.getUTCDate(), lastDay))));
}

/** Differenza in giorni di calendario (b − a). */
export function diffCalendarDays(a: IsoDate, b: IsoDate): number {
  return Math.round((parseIsoDate(b).getTime() - parseIsoDate(a).getTime()) / DAY_MS);
}

/** 0 = domenica … 6 = sabato. */
export function dayOfWeek(date: IsoDate): number {
  return parseIsoDate(date).getUTCDay();
}

/* ---------- festività nazionali ---------- */

/** Domenica di Pasqua (calendario gregoriano, algoritmo anonimo di Meeus/Jones/Butcher). */
export function easterSunday(year: number): IsoDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return formatIsoDate(new Date(Date.UTC(year, month - 1, day)));
}

/** Festività fisse: [mese, giorno, nome, primo anno di validità]. */
const FIXED_HOLIDAYS: Array<[number, number, string, number?]> = [
  [1, 1, "Capodanno"],
  [1, 6, "Epifania"],
  [4, 25, "Festa della Liberazione"],
  [5, 1, "Festa del Lavoro"],
  [6, 2, "Festa della Repubblica"],
  [8, 15, "Ferragosto"],
  // San Francesco d'Assisi, di nuovo festività nazionale dal 2026: in attesa di conferma di M (R-14).
  // Se non confermata, basta togliere questa riga.
  [10, 4, "San Francesco d'Assisi", 2026],
  [11, 1, "Ognissanti"],
  [12, 8, "Immacolata Concezione"],
  [12, 25, "Natale"],
  [12, 26, "Santo Stefano"],
];

const holidayCache = new Map<number, Map<IsoDate, string>>();

/** Festività nazionali italiane dell'anno: data → nome. */
export function nationalHolidays(year: number): Map<IsoDate, string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const out = new Map<IsoDate, string>();
  for (const [m, d, name, from] of FIXED_HOLIDAYS) {
    if (from !== undefined && year < from) continue;
    out.set(formatIsoDate(new Date(Date.UTC(year, m - 1, d))), name);
  }
  const easter = easterSunday(year);
  out.set(easter, "Pasqua");
  out.set(addCalendarDays(easter, 1), "Lunedì dell'Angelo");
  holidayCache.set(year, out);
  return out;
}

export function holidayName(date: IsoDate): string | null {
  return nationalHolidays(parseIsoDate(date).getUTCFullYear()).get(date) ?? null;
}

export function isHoliday(date: IsoDate): boolean {
  return holidayName(date) !== null;
}

/* ---------- giorni lavorativi ---------- */

/** Lunedì–venerdì e non festivo nazionale. */
export function isBusinessDay(date: IsoDate): boolean {
  const dow = dayOfWeek(date);
  return dow !== 0 && dow !== 6 && !isHoliday(date);
}

/** Primo giorno lavorativo STRETTAMENTE successivo a `date`. */
export function nextBusinessDay(date: IsoDate): IsoDate {
  let d = addCalendarDays(date, 1);
  while (!isBusinessDay(d)) d = addCalendarDays(d, 1);
  return d;
}

/** `date` stessa se lavorativa, altrimenti il primo giorno lavorativo successivo. */
export function rollForwardToBusinessDay(date: IsoDate): IsoDate {
  return isBusinessDay(date) ? date : nextBusinessDay(date);
}

/**
 * Somma n giorni lavorativi (n < 0: li sottrae, per "N giorni lavorativi prima").
 * Si contano solo i giorni lavorativi attraversati; n = 0 restituisce `date` invariata.
 * Esempio: venerdì + 1 = lunedì; lunedì − 1 = venerdì.
 */
export function addBusinessDays(date: IsoDate, n: number): IsoDate {
  if (!Number.isInteger(n)) throw new RangeError(`Numero di giorni non intero: ${n}`);
  const step = n < 0 ? -1 : 1;
  let d = date;
  for (let left = Math.abs(n); left > 0; ) {
    d = addCalendarDays(d, step);
    if (isBusinessDay(d)) left--;
  }
  return d;
}

/* ---------- orari Europe/Rome ---------- */

const offsetFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  timeZoneName: "longOffset",
  year: "numeric",
});
const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Scostamento di Europe/Rome da UTC, in minuti, nell'istante dato (+60 solare, +120 legale). */
export function romeOffsetMinutes(instant: Date): number {
  const name = offsetFormatter.formatToParts(instant).find((p) => p.type === "timeZoneName")?.value ?? "";
  const m = /GMT(?:([+-])(\d{2}):?(\d{2}))?/.exec(name);
  if (!m) throw new Error(`Scostamento del fuso non leggibile: ${name}`);
  if (!m[1]) return 0;
  const minutes = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === "-" ? -minutes : minutes;
}

/** Istante corrispondente a `date` alle hh:mm ora di Roma (ora legale/solare corretta). */
export function romeTime(date: IsoDate, hour = 9, minute = 0): Date {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new RangeError(`Orario non valido: ${hour}:${minute}`);
  }
  const d = parseIsoDate(date);
  const wallAsUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, minute);
  // Due passaggi: l'offset si legge sull'istante stimato, poi si ricontrolla su quello corretto.
  let instant = wallAsUtc - romeOffsetMinutes(new Date(wallAsUtc)) * 60_000;
  const check = wallAsUtc - romeOffsetMinutes(new Date(instant)) * 60_000;
  if (check !== instant) instant = check;
  return new Date(instant);
}

/** Le 09:00 ora di Roma di `date`. */
export function nineAmRome(date: IsoDate): Date {
  return romeTime(date, 9, 0);
}

/**
 * Istante di scadenza di un alert (D-43): se `date` non è lavorativo si slitta al primo giorno
 * lavorativo successivo; l'ora è sempre le 09:00 di Roma.
 */
export function businessDeadlineAt9(date: IsoDate): Date {
  return nineAmRome(rollForwardToBusinessDay(date));
}

function romeParts(instant: Date) {
  const p = Object.fromEntries(partsFormatter.formatToParts(instant).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}` as IsoDate, time: `${p.hour}:${p.minute}:${p.second}` };
}

/** Il giorno di calendario a Roma nell'istante dato (es. per "data del giorno"). */
export function romeDate(instant: Date): IsoDate {
  return romeParts(instant).date;
}

/** Timestamp ISO 8601 con lo scostamento di Roma, es. "2026-10-08T09:00:00+02:00" (contratto §1). */
export function formatRomeTimestamp(instant: Date): string {
  const { date, time } = romeParts(instant);
  const off = romeOffsetMinutes(instant);
  const sign = off < 0 ? "-" : "+";
  const abs = Math.abs(off);
  return `${date}T${time}${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/**
 * Primo istante utile per una mail degli alert (D-43, D-137 A-12): l'istante stesso se cade in un giorno lavorativo
 * dalle 09:00 di Roma in poi, altrimenti le 09:00 del primo giorno lavorativo utile.
 */
export function alertMailSlotFrom(instant: Date): Date {
  const d = romeDate(instant);
  if (isBusinessDay(d)) return instant.getTime() >= nineAmRome(d).getTime() ? instant : nineAmRome(d);
  return nineAmRome(nextBusinessDay(d));
}
