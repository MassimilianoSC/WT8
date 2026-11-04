/**
 * CSV dei blocchi di Andamento (contratto §15.3: &format=csv, generato dal server). Stesso formato dell'export delle
 * pratiche: separatore «;», date gg/mm/aaaa, numeri con la virgola, intestazioni in italiano, BOM per Excel. Una
 * tabella per richiesta: quella principale del blocco, oppure un'altra con &tabella= (rilavorazioni, scadenze, stati).
 */
import {
  STATI_ATTIVITA,
  type AndamentoDurataDTO,
  type AndamentoFermeDTO,
  type AndamentoFlussiDTO,
  type AndamentoGruppiDTO,
  type AndamentoRilavorazioniDTO,
  type AndamentoScadenzeDTO,
  type AndamentoStatiDTO,
} from "@/lib/contract";
import { romeDate } from "@/lib/calendario";
import { HttpError } from "@/lib/http-error";
import { CSV_BOM, csvLine, itDate, itNumber, safeText, statoLabel } from "@/lib/practice/csv";
import { GROUP_LABELS, groupsLabel } from "@/lib/practice/labels";

export interface CsvFile {
  filename: string;
  body: string;
}

/** Tabelle disponibili per blocco: la prima è quella predefinita. */
export const TABELLE: Record<string, readonly string[]> = {
  stati: ["stati", "serie"],
  gruppi: ["gruppi"],
  ferme: ["ferme"],
  flussi: ["serie"],
  rilavorazioni: ["serie", "daStato", "ritorni"],
  scadenze: ["serie", "milestone"],
};

const n = (x: number | null | undefined) => (x === null || x === undefined ? "" : itNumber(x));
const si = (b: boolean) => (b ? "sì" : "no");
const file = (name: string, header: string[], rows: string[][]): CsvFile => ({
  filename: `${name}.csv`,
  body: CSV_BOM + [header, ...rows].map(csvLine).join("\r\n") + "\r\n",
});
const durata = (d: AndamentoDurataDTO) => [n(d.conclusi), n(d.medianaGiorni), n(d.mediaGiorni), n(d.inCorso), n(d.etaMedianaInCorsoGiorni)];

export function tabellaOf(blocco: string, raw: string | null): string {
  const list = TABELLE[blocco];
  if (!raw) return list[0];
  if (!list.includes(raw)) throw new HttpError(`Parametro tabella non valido (${list.join(", ")})`, 400);
  return raw;
}

/** Nome del file: blocco, tabella, cliente e periodo (o il giorno, per le ferme). */
function nameOf(blocco: string, tabella: string, templateId: string | null, from: string, to: string | null): string {
  const t = tabella === TABELLE[blocco][0] ? "" : `-${tabella}`;
  return `andamento-${blocco}${t}_${templateId ?? "tutti"}_${from}${to ? `_${to}` : ""}`;
}

export function statiCsv(d: AndamentoStatiDTO, tabella: string): CsvFile {
  const name = nameOf("stati", tabella, d.query.templateId, d.query.from, d.query.to);
  if (tabella === "serie") {
    return file(
      name,
      ["Dal", "Al", "Stato attività", "Permanenze concluse", "Mediana giorni"],
      d.serie.flatMap((s) =>
        STATI_ATTIVITA.filter((x) => s.perStato[x]).map((x) => [itDate(s.periodo.from), itDate(s.periodo.to), statoLabel(x), n(s.perStato[x]!.conclusi), n(s.perStato[x]!.medianaGiorni)])
      )
    );
  }
  return file(
    name,
    ["Stato attività", "Tipo", "Passaggi", "Permanenze concluse", "Mediana giorni", "Media giorni", "In corso", "Età mediana in corso (giorni)", "Mediana periodo precedente", "Mediana per data del fatto", "Pochi dati", "Più lento"],
    d.righe.map((r) => [
      statoLabel(r.stato),
      r.gruppoStato === "ESTERNO" ? "Attesa esterna" : "Operativo",
      n(r.passaggi),
      ...durata(r.periodo),
      n(r.precedente.medianaGiorni),
      n(r.perDataDelFatto?.medianaGiorni),
      si(r.pochiDati),
      si(d.piuLenti.includes(r.stato)),
    ])
  );
}

export function gruppiCsv(d: AndamentoGruppiDTO): CsvFile {
  return file(
    nameOf("gruppi", "gruppi", d.query.templateId, d.query.from, d.query.to),
    [
      "Gruppo",
      "Assegnazioni",
      "Per partire: concluse",
      "Per partire: mediana giorni",
      "Per partire: media giorni",
      "Per partire: in corso",
      "Per partire: età mediana in corso",
      "Prima consegna: concluse",
      "Prima consegna: mediana giorni",
      "Prima consegna: media giorni",
      "Prima consegna: in corso",
      "Prima consegna: età mediana in corso",
      "Pochi dati",
    ],
    d.righe.map((r) => [GROUP_LABELS[r.group], n(r.assegnazioni), ...durata(r.perPartire), ...durata(r.perConsegnare), si(r.pochiDati)])
  );
}

export function fermeCsv(d: AndamentoFermeDTO, now: Date): CsvFile {
  return file(
    nameOf("ferme", "ferme", d.query.templateId, romeDate(now), null),
    ["Codice Sito", "Nome Sito", "Cliente", "Stato attività", "Nello stato dal", "Giorni", "Ferma da import", "Gruppi abilitati"],
    d.items.map((i) => [safeText(i.codiceSito), safeText(i.nomeSito), i.templateId, statoLabel(i.stato), itDate(romeDate(new Date(i.since))), n(i.giorni), si(i.fromImport), groupsLabel(i.gruppi)])
  );
}

export function flussiCsv(d: AndamentoFlussiDTO): CsvFile {
  const row = (label: [string, string], v: AndamentoFlussiDTO["periodo"]) => [...label, n(v.entrate), n(v.entrateImport), n(v.terminate), n(v.ko), n(v.rientri), n(v.arretratoFine)];
  return file(
    nameOf("flussi", "serie", d.query.templateId, d.query.from, d.query.to),
    ["Dal", "Al", "Entrate", "Entrate da import", "Terminate", "KO", "Riaperture", "Arretrato a fine"],
    [...d.serie.map((s) => row([itDate(s.periodo.from), itDate(s.periodo.to)], s)), row([itDate(d.query.from), itDate(d.query.to)], d.periodo)]
  );
}

export function rilavorazioniCsv(d: AndamentoRilavorazioniDTO, tabella: string): CsvFile {
  const name = nameOf("rilavorazioni", tabella, d.query.templateId, d.query.from, d.query.to);
  if (tabella === "daStato") return file(name, ["Stato attività", "Rilavorazioni", "Ripresentazioni"], d.daStato.map((r) => [statoLabel(r.stato), n(r.rework), n(r.resubmit)]));
  if (tabella === "ritorni") return file(name, ["Da", "A", "Passaggi"], d.ritorni.map((r) => [statoLabel(r.from), statoLabel(r.to), n(r.count)]));
  return file(
    name,
    ["Dal", "Al", "Rilavorazioni", "Ripresentazioni", "Ritorni all'indietro"],
    [...d.serie.map((s) => [itDate(s.periodo.from), itDate(s.periodo.to), n(s.rework), n(s.resubmit), n(s.ritorni)]), [itDate(d.query.from), itDate(d.query.to), n(d.periodo.rework), n(d.periodo.resubmit), n(d.periodo.ritorni)]]
  );
}

export function scadenzeCsv(d: AndamentoScadenzeDTO, tabella: string): CsvFile {
  const name = nameOf("scadenze", tabella, d.query.templateId, d.query.from, d.query.to);
  if (tabella === "milestone") {
    return file(name, ["Milestone", "Gruppo", "Entro il forecast", "Oltre il forecast", "Forecast rinviati"], d.perMilestone.map((m) => [safeText(m.label), GROUP_LABELS[m.ownerGroup], n(m.entro), n(m.oltre), n(m.rinviate)]));
  }
  const p = d.periodo;
  return file(
    name,
    ["Dal", "Al", "Entro il forecast", "Oltre il forecast", "Alert aperti", "Alert chiusi"],
    [...d.serie.map((s) => [itDate(s.periodo.from), itDate(s.periodo.to), n(s.entro), n(s.oltre), n(s.alertAperti), n(s.alertChiusi)]), [itDate(d.query.from), itDate(d.query.to), n(p.entro), n(p.oltre), n(p.alert.aperti), n(p.alert.chiusi)]]
  );
}
