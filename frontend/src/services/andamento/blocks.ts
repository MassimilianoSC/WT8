/**
 * Blocchi di Andamento calcolati dagli eventi (contratto §15.3, §15.4): stati, flussi, rilavorazioni, ferme. Funzioni
 * pure sull'insieme dei dati (dataset.ts) più l'orologio: le prove le usano senza rotte. Mai persone nei risultati.
 */
import {
  STATI_ATTIVITA,
  type AndamentoBaseDTO,
  type AndamentoDurataDTO,
  type AndamentoFermeDTO,
  type AndamentoFlussiDTO,
  type AndamentoFlussoValoriDTO,
  type AndamentoQueryDTO,
  type AndamentoRilavorazioniDTO,
  type AndamentoStatiDTO,
  type AndamentoStatoRigaDTO,
  type StatoAttivita,
  type TemplateId,
  type UserDTO,
} from "@/lib/contract";
import { diffCalendarDays, romeDate } from "@/lib/calendario";
import { canSeePractice } from "@/lib/engines/access";
import { archivedAt, stateAt, type Dataset, type PracticeTimeline, type Segment } from "./dataset";
import { bucketsOf, DAY_MS, days, durata, FINALI, gruppoStato, inWindow, median, mean, POCHI_DATI, previousPeriod, windowOf, yearBefore, type Window } from "./period";

export const FERME_MAX_ITEMS = 200;

/* ---------- parte comune ---------- */

export interface Windows {
  q: AndamentoQueryDTO;
  current: Window;
  previous: Window;
  /** null = nessun dato in quel periodo. */
  year: Window | null;
  buckets: Window[];
}

export function windowsOf(ds: Dataset, q: AndamentoQueryDTO): Windows {
  const current = windowOf({ from: q.from, to: q.to });
  const previous = windowOf(previousPeriod(current.period));
  const y = windowOf(yearBefore(current.period));
  const year = ds.firstEventAt !== null && ds.firstEventAt < y.end ? y : null;
  return { q, current, previous, year, buckets: bucketsOf(current.period, q.granularity).map(windowOf) };
}

export function baseOf(ds: Dataset, w: Windows, now: Date): AndamentoBaseDTO {
  return {
    asOf: now.toISOString(),
    dataFrom: ds.firstEventAt === null ? null : romeDate(new Date(ds.firstEventAt)),
    query: w.q,
    confronto: { periodoPrecedente: w.previous.period, annoPrecedente: w.year?.period ?? null },
    buckets: w.buckets.map((b) => b.period),
  };
}

const inScope = (ds: Dataset, templateId: TemplateId | null) => (templateId ? ds.practices.filter((p) => p.templateId === templateId) : ds.practices);
/** Istante di fine misura: fine del periodo, o adesso se il periodo non è ancora finito. */
const cutoffOf = (w: Window, now: number) => Math.min(w.end, now);
const valid = (s: Segment) => !s.startImport && !s.endImport;

/* ---------- stati ---------- */

interface StatoMisure {
  passaggi: number;
  conclusi: number[];
  inCorso: number[];
  fatti: number[];
}

function misureStati(ps: PracticeTimeline[], w: Window, now: number): Map<StatoAttivita, StatoMisure> {
  const out = new Map<StatoAttivita, StatoMisure>(STATI_ATTIVITA.map((s) => [s, { passaggi: 0, conclusi: [], inCorso: [], fatti: [] }]));
  const cut = cutoffOf(w, now);
  for (const p of ps) {
    for (const s of p.segments) {
      const m = out.get(s.stato)!;
      if (!s.startImport && inWindow(s.start, w)) m.passaggi++;
      if (s.end !== null && inWindow(s.end, w) && valid(s)) {
        m.conclusi.push(days(s.end - s.start));
        if (s.startFact && s.endFact) {
          const d = diffCalendarDays(s.startFact, s.endFact);
          if (d >= 0) m.fatti.push(d);
        }
      }
      if (!s.startImport && s.start < cut && (s.end === null || s.end >= cut) && cut > w.start) m.inCorso.push(days(cut - s.start));
    }
  }
  return out;
}

const durataOf = (m: StatoMisure): AndamentoDurataDTO => durata(m.conclusi, m.inCorso);

/** Tempo complessivo (solo stati OPERATIVO, finali esclusi) delle pratiche entrate in TERMINATO nel periodo. */
function complessivo(ps: PracticeTimeline[], w: Window): AndamentoDurataDTO & { esclusePerImport: number } {
  const tot: number[] = [];
  let excluded = 0;
  for (const p of ps) {
    p.segments.forEach((s, i) => {
      if (s.stato !== "TERMINATO" || s.startImport || !inWindow(s.start, w)) return;
      const before = p.segments.slice(0, i);
      if (before.length === 0 || before.some((b) => !valid(b))) {
        excluded++;
        return;
      }
      tot.push(days(before.filter((b) => gruppoStato(b.stato) === "OPERATIVO" && !FINALI.includes(b.stato)).reduce((a, b) => a + (b.end! - b.start), 0)));
    });
  }
  return { ...durata(tot, []), esclusePerImport: excluded };
}

export function statiBlock(ds: Dataset, w: Windows, now: Date): AndamentoStatiDTO {
  const ps = inScope(ds, w.q.templateId);
  const t = now.getTime();
  const cur = misureStati(ps, w.current, t);
  const prev = misureStati(ps, w.previous, t);
  const year = w.year ? misureStati(ps, w.year, t) : null;
  const righe: AndamentoStatoRigaDTO[] = STATI_ATTIVITA.map((stato) => {
    const m = cur.get(stato)!;
    const gs = gruppoStato(stato);
    return {
      stato,
      gruppoStato: gs,
      candidabile: gs === "OPERATIVO" && !FINALI.includes(stato),
      passaggi: m.passaggi,
      periodo: durataOf(m),
      precedente: { ...durataOf(prev.get(stato)!), passaggi: prev.get(stato)!.passaggi },
      annoPrecedente: year ? { ...durataOf(year.get(stato)!), passaggi: year.get(stato)!.passaggi } : null,
      perDataDelFatto: m.fatti.length ? { conclusi: m.fatti.length, mediaGiorni: mean(m.fatti), medianaGiorni: median(m.fatti) } : null,
      pochiDati: m.conclusi.length < POCHI_DATI,
    };
  });
  const eligible = righe.filter((r) => r.candidabile && r.periodo.conclusi >= POCHI_DATI && r.periodo.medianaGiorni !== null);
  const top = Math.max(...eligible.map((r) => r.periodo.medianaGiorni!), -Infinity);
  return {
    ...baseOf(ds, w, now),
    righe,
    piuLenti: eligible.filter((r) => r.periodo.medianaGiorni === top).map((r) => r.stato),
    complessivo: complessivo(ps, w.current),
    complessivoPrecedente: complessivo(ps, w.previous),
    serie: w.buckets.map((b) => {
      const m = misureStati(ps, b, t);
      const perStato: AndamentoStatiDTO["serie"][number]["perStato"] = {};
      for (const [stato, x] of m) if (x.conclusi.length) perStato[stato] = { conclusi: x.conclusi.length, medianaGiorni: median(x.conclusi)! };
      return { periodo: b.period, perStato };
    }),
  };
}

/* ---------- flussi ---------- */

/** Pratiche attive (non finali, non archiviate) all'istante t. */
function attiveA(ps: PracticeTimeline[], t: number): number {
  let n = 0;
  for (const p of ps) {
    const s = stateAt(p, t);
    if (s && !FINALI.includes(s) && !archivedAt(p, t)) n++;
  }
  return n;
}

/**
 * Flussi di un periodo, costruiti perché l'arretrato quadri (contratto §15.4, v0.6.7): ogni ingresso o uscita
 * dall'insieme delle pratiche attive è contato una volta sola. Una pratica creata dall'import già chiusa non entra e
 * non esce (non è lavoro); le uscite e i rientri dentro un import che aggiorna una pratica esistente contano.
 */
function flussi(ps: PracticeTimeline[], w: Window, now: number): AndamentoFlussoValoriDTO {
  const v: Required<AndamentoFlussoValoriDTO> = { entrate: 0, entrateImport: 0, terminate: 0, ko: 0, rientri: 0, archiviate: 0, ripristinate: 0, arretratoFine: 0 };
  for (const p of ps) {
    // Catena della creazione da import: le permanenze aperte nella stessa operazione (stesso istante, da import).
    const chain = p.created?.fromImport ? p.segments.filter((s) => s.startImport && s.start === p.created!.at).length : 0;
    const afterImport = chain ? p.segments[chain - 1].stato : null;
    if (p.created && inWindow(p.created.at, w) && !(p.created.fromImport && afterImport && FINALI.includes(afterImport))) {
      if (p.created.fromImport) v.entrateImport++;
      else v.entrate++;
    }
    p.segments.forEach((s, i) => {
      if (i < chain || !inWindow(s.start, w)) return;
      const prev = p.segments[i - 1];
      if (!prev) return;
      const from = FINALI.includes(prev.stato);
      const to = FINALI.includes(s.stato);
      if (!from && to && s.stato === "TERMINATO") v.terminate++;
      if (!from && to && s.stato === "KO") v.ko++;
      if (from && !to) v.rientri++;
    });
    for (const a of p.archive) {
      if (!inWindow(a.at, w)) continue;
      const s = stateAt(p, a.at);
      if (!s || FINALI.includes(s) || archivedAt(p, a.at - 1) === a.archived) continue;
      if (a.archived) v.archiviate++;
      else v.ripristinate++;
    }
  }
  v.arretratoFine = attiveA(ps, cutoffOf(w, now) - 1);
  return v;
}

export function flussiBlock(ds: Dataset, w: Windows, now: Date): AndamentoFlussiDTO {
  const ps = inScope(ds, w.q.templateId);
  const t = now.getTime();
  return {
    ...baseOf(ds, w, now),
    attiveOra: attiveA(ps, t),
    arretratoInizio: attiveA(ps, w.current.start - 1),
    periodo: flussi(ps, w.current, t),
    precedente: flussi(ps, w.previous, t),
    annoPrecedente: w.year ? flussi(ps, w.year, t) : null,
    serie: w.buckets.map((b) => ({ periodo: b.period, ...flussi(ps, b, t) })),
  };
}

/* ---------- rilavorazioni ---------- */

/** Stati in cui un passaggio «all'indietro» ha senso: fase operativa, finali e attese esterne esclusi (D-194). */
const ORDINE = STATI_ATTIVITA.filter((s) => gruppoStato(s) === "OPERATIVO" && !FINALI.includes(s));

function rilavorazioni(ds: Dataset, ps: PracticeTimeline[], w: Window) {
  const totals = { rework: 0, resubmit: 0, ritorni: 0 };
  const daStato = new Map<StatoAttivita, { rework: number; resubmit: number }>();
  const ritorni = new Map<string, number>();
  const bump = (s: StatoAttivita | null, k: "rework" | "resubmit") => {
    if (!s) return;
    const x = daStato.get(s) ?? { rework: 0, resubmit: 0 };
    x[k]++;
    daStato.set(s, x);
  };
  for (const p of ps) {
    if (p.reworkOf && inWindow(p.reworkOf.at, w)) {
      totals.rework++;
      const origin = ds.byId.get(p.reworkOf.originId);
      bump(origin ? stateAt(origin, p.reworkOf.at - 1) : null, "rework");
    }
    for (const r of p.resubmits) {
      if (!inWindow(r.at, w)) continue;
      totals.resubmit++;
      bump(r.fromStato, "resubmit");
    }
    p.segments.forEach((s, i) => {
      const prev = p.segments[i - 1];
      if (!prev || s.startImport || prev.n !== s.n || !inWindow(s.start, w)) return;
      const a = ORDINE.indexOf(prev.stato);
      const b = ORDINE.indexOf(s.stato);
      if (a < 0 || b < 0 || b >= a) return;
      totals.ritorni++;
      const k = `${prev.stato}>${s.stato}`;
      ritorni.set(k, (ritorni.get(k) ?? 0) + 1);
    });
  }
  return { totals, daStato, ritorni };
}

export function rilavorazioniBlock(ds: Dataset, w: Windows, now: Date): AndamentoRilavorazioniDTO {
  const ps = inScope(ds, w.q.templateId);
  const cur = rilavorazioni(ds, ps, w.current);
  return {
    ...baseOf(ds, w, now),
    periodo: cur.totals,
    precedente: rilavorazioni(ds, ps, w.previous).totals,
    annoPrecedente: w.year ? rilavorazioni(ds, ps, w.year).totals : null,
    daStato: STATI_ATTIVITA.filter((s) => cur.daStato.has(s)).map((s) => ({ stato: s, ...cur.daStato.get(s)! })),
    ritorni: [...cur.ritorni]
      .map(([k, count]) => {
        const [from, to] = k.split(">") as [StatoAttivita, StatoAttivita];
        return { from, to, count };
      })
      .sort((a, b) => b.count - a.count || STATI_ATTIVITA.indexOf(a.from) - STATI_ATTIVITA.indexOf(b.from) || STATI_ATTIVITA.indexOf(a.to) - STATI_ATTIVITA.indexOf(b.to)),
    serie: w.buckets.map((b) => ({ periodo: b.period, ...rilavorazioni(ds, ps, b).totals })),
  };
}

/* ---------- ferme ---------- */

export function fermeBlock(ds: Dataset, user: UserDTO, q: { templateId: TemplateId | null; stato: StatoAttivita | null }, soglia: number, now: Date, maxItems = FERME_MAX_ITEMS): AndamentoFermeDTO {
  const t = now.getTime();
  const items: AndamentoFermeDTO["items"] = [];
  const nonDatabili = new Map<StatoAttivita, number>();
  for (const p of inScope(ds, q.templateId)) {
    if (p.archived || FINALI.includes(p.currentStato) || (q.stato && p.currentStato !== q.stato)) continue;
    const last = p.segments[p.segments.length - 1];
    if (!last || last.end !== null || last.stato !== p.currentStato) {
      // Ingresso nello stato attuale non databile: non si indovina, ma la pratica si conta (non sparisce).
      nonDatabili.set(p.currentStato, (nonDatabili.get(p.currentStato) ?? 0) + 1);
      continue;
    }
    const giorni = Math.floor((t - last.start) / DAY_MS);
    if (giorni <= soglia) continue;
    items.push({
      practiceId: p.id,
      codiceSito: p.codiceSito,
      nomeSito: p.nomeSito,
      templateId: p.templateId,
      stato: p.currentStato,
      gruppoStato: gruppoStato(p.currentStato),
      since: new Date(last.start).toISOString(),
      giorni,
      fromImport: last.startImport,
      gruppi: p.enabledGroups,
      canOpen: canSeePractice(user, { templateId: p.templateId }),
    });
  }
  items.sort((a, b) => b.giorni - a.giorni || a.codiceSito.localeCompare(b.codiceSito, "it") || a.practiceId.localeCompare(b.practiceId));
  const countBy = <K extends string>(key: (i: (typeof items)[number]) => K) => {
    const m = new Map<K, number>();
    for (const i of items) m.set(key(i), (m.get(key(i)) ?? 0) + 1);
    return m;
  };
  const perStato = countBy((i) => i.stato);
  const perCliente = countBy((i) => i.templateId);
  return {
    asOf: now.toISOString(),
    dataFrom: ds.firstEventAt === null ? null : romeDate(new Date(ds.firstEventAt)),
    query: q,
    soglia,
    totale: items.length,
    perStato: STATI_ATTIVITA.filter((s) => perStato.has(s)).map((s) => ({ stato: s, gruppoStato: gruppoStato(s), count: perStato.get(s)! })),
    perCliente: [...perCliente].map(([templateId, count]) => ({ templateId, count })).sort((a, b) => b.count - a.count || a.templateId.localeCompare(b.templateId)),
    items: items.slice(0, maxItems),
    truncated: items.length > maxItems,
    nonDatabili: {
      totale: [...nonDatabili.values()].reduce((a, b) => a + b, 0),
      perStato: STATI_ATTIVITA.filter((s) => nonDatabili.has(s)).map((s) => ({ stato: s, count: nonDatabili.get(s)! })),
    },
  };
}
