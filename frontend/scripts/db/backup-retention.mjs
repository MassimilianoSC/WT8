/**
 * Conservazione delle copie notturne (K4, D-144): giornaliere 14 giorni, settimanali 3 mesi, mensili 1 anno.
 *
 * Regola (date e settimane di Roma):
 * - si tiene la copia PIÙ RECENTE di ciascuno degli ultimi `daily` giorni (oggi compreso);
 * - la più recente di ciascuna delle ultime `weekly` settimane ISO;
 * - la più recente di ciascuno degli ultimi `monthly` mesi;
 * - sempre la più recente in assoluto.
 * Si considerano solo le cartelle "<db>_AAAA-MM-GG_hh-mm-ss" del database indicato, con manifest.json, al primo livello
 * della cartella delle copie: copie di sicurezza dei ripristini (sottocartella "sicurezza"), copie non valide e altri
 * file non si toccano mai.
 */
import fs from "node:fs";
import path from "node:path";

export const DEFAULT_POLICY = { daily: 14, weekly: 13, monthly: 12 };

const ROME = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" });
/** Giorno di Roma "AAAA-MM-GG" di un istante. */
export const romeDay = (instant) => ROME.format(instant);

const FOLDER = /^(.+)_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})$/;

/** Nome di una cartella di copia → { db, day, stamp } (stamp ordinabile), oppure null. */
export function parseBackupFolder(name) {
  const m = FOLDER.exec(name);
  if (!m) return null;
  const [, db, y, mo, d, h, mi, s] = m;
  return { db, day: `${y}-${mo}-${d}`, stamp: `${y}${mo}${d}${h}${mi}${s}` };
}

/** Lunedì della settimana ISO di un giorno "AAAA-MM-GG" (chiave della settimana). */
function isoWeekKey(day) {
  const t = new Date(`${day}T12:00:00Z`);
  const dow = (t.getUTCDay() + 6) % 7; // 0 = lunedì
  t.setUTCDate(t.getUTCDate() - dow);
  return t.toISOString().slice(0, 10);
}

function addDays(day, n) {
  const t = new Date(`${day}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

function addMonths(monthKey, n) {
  const [y, m] = monthKey.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return t.toISOString().slice(0, 7);
}

/**
 * Nomi da tenere tra le copie `names` (cartelle del database `db`) all'istante `now`. PURA: i nomi di altri database o
 * non riconosciuti non sono nel risultato ma non vanno nemmeno cancellati (li esclude applyRetention).
 */
export function selectToKeep(names, db, now, policy = DEFAULT_POLICY) {
  const today = romeDay(now);
  const backups = names
    .map((name) => ({ name, info: parseBackupFolder(name) }))
    .filter((b) => b.info && b.info.db === db && b.info.day <= today)
    .sort((a, b) => (a.info.stamp < b.info.stamp ? 1 : -1)); // dalla più recente
  const keep = new Set();
  if (backups.length) keep.add(backups[0].name);
  // Copie con una data successiva a oggi (orologio tornato indietro): mai cancellate.
  for (const name of names) {
    const info = parseBackupFolder(name);
    if (info && info.db === db && info.day > today) keep.add(name);
  }

  const newestBy = (keyOf, allowed) => {
    const seen = new Set();
    for (const b of backups) {
      const k = keyOf(b.info.day);
      if (!allowed.has(k) || seen.has(k)) continue;
      seen.add(k);
      keep.add(b.name);
    }
  };
  newestBy((d) => d, new Set(Array.from({ length: policy.daily }, (_, i) => addDays(today, -i))));
  const thisWeek = isoWeekKey(today);
  newestBy(isoWeekKey, new Set(Array.from({ length: policy.weekly }, (_, i) => addDays(thisWeek, -7 * i))));
  const thisMonth = today.slice(0, 7);
  newestBy((d) => d.slice(0, 7), new Set(Array.from({ length: policy.monthly }, (_, i) => addMonths(thisMonth, -i))));
  return keep;
}

/**
 * Applica la conservazione nella cartella `dir` per il database `db`: cancella solo cartelle di copia valide (con
 * manifest.json) di quel database che la regola non tiene. Restituisce { kept, removed }.
 */
export function applyRetention({ dir, db, now = new Date(), policy = DEFAULT_POLICY, log = console.log }) {
  if (!fs.existsSync(dir)) return { kept: [], removed: [] };
  const candidates = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && parseBackupFolder(e.name)?.db === db && fs.existsSync(path.join(dir, e.name, "manifest.json")))
    .map((e) => e.name);
  const keep = selectToKeep(candidates, db, now, policy);
  const removed = [];
  for (const name of candidates) {
    if (keep.has(name)) continue;
    fs.rmSync(path.join(dir, name), { recursive: true, force: true });
    removed.push(name);
  }
  if (removed.length) log(`Conservazione ${db}: tolte ${removed.length} copie vecchie, tenute ${keep.size}`);
  return { kept: [...keep].sort(), removed: removed.sort() };
}
