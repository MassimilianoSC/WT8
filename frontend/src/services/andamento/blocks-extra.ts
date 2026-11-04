/**
 * Blocchi di Andamento che leggono anche i valori dei campi (contratto §15.4): scadenze (forecast rispettati e alert)
 * e tempo per gruppo (D-195: per partire e per la prima consegna). Funzioni pure su eventi + dati aggiuntivi.
 */
import {
  GROUP_IDS,
  type AndamentoGruppiDTO,
  type AndamentoScadenzeDTO,
  type AndamentoScadenzeValoriDTO,
  type FieldValue,
  type GroupId,
} from "@/lib/contract";
import { diffCalendarDays, isValidIsoDate, romeDate } from "@/lib/calendario";
import { baseOf, type Windows } from "./blocks";
import type { Dataset, PracticeTimeline } from "./dataset";
import { milestonePairs, type ExtraData, type IterationValues } from "./extra";
import { days, durata, FINALI, inWindow, median, mean, POCHI_DATI, type Window } from "./period";

const isoDate = (v: FieldValue | undefined): string | null => (typeof v === "string" && isValidIsoDate(v) ? v : null);
const inDates = (d: string, w: Window) => d >= w.period.from && d <= w.period.to;
const scope = (ds: Dataset, w: Windows) => new Set((w.q.templateId ? ds.practices.filter((p) => p.templateId === w.q.templateId) : ds.practices).map((p) => p.id));

/* ---------- scadenze ---------- */

interface Completion {
  semanticId: string;
  label: string;
  ownerGroup: GroupId;
  forecast: string;
  completion: string;
  rinviata: boolean;
}

/** Completamenti con il loro forecast, su tutte le iterazioni (righe ripetibili comprese). */
function completions(it: IterationValues, changed: Set<string>): Completion[] {
  const out: Completion[] = [];
  for (const e of milestonePairs(it.templateId)) {
    const rows = e.repeatGroup ? it.rows.filter((r) => r.groupKey === e.repeatGroup).map((r) => ({ v: r.values, rowId: r.rowId })) : [{ v: it.values, rowId: "" }];
    for (const r of rows) {
      const forecast = isoDate(r.v[e.flowId]);
      const completion = isoDate(r.v[e.completionFlowId]);
      if (!forecast || !completion) continue;
      out.push({ semanticId: e.semanticId, label: e.label, ownerGroup: e.ownerGroup, forecast, completion, rinviata: changed.has(`${it.iterationId}|${e.flowId}|${r.rowId}`) });
    }
  }
  return out;
}

function scadenzeValori(all: Completion[], alerts: ExtraData["alerts"], w: Window, cutoff: number): AndamentoScadenzeValoriDTO {
  const inW = all.filter((c) => inDates(c.completion, w));
  const opened = alerts.filter((a) => a.executionStatus !== "SUPERSEDED" && inWindow(a.openedAt.getTime(), w));
  const closed = alerts.filter((a) => a.executionStatus !== "SUPERSEDED" && a.closedAt && inWindow(a.closedAt.getTime(), w));
  const openAt = alerts.filter((a) => a.executionStatus !== "SUPERSEDED" && a.openedAt.getTime() < cutoff && (!a.closedAt || a.closedAt.getTime() >= cutoff));
  const closeDays = closed.map((a) => days(a.closedAt!.getTime() - a.openedAt.getTime()));
  return {
    entro: inW.filter((c) => c.completion <= c.forecast).length,
    oltre: inW.filter((c) => c.completion > c.forecast).length,
    rinviate: inW.filter((c) => c.rinviata).length,
    alert: {
      aperti: opened.length,
      chiusi: closed.length,
      scaduti: openAt.filter((a) => a.executionStatus === "ACTIVE" && a.dueAt && a.dueAt.getTime() < cutoff).length,
      ripetuti: opened.filter((a) => a.generation > 1 || (a.reminderCount ?? 0) > 0).length,
      sospesi: openAt.filter((a) => a.executionStatus === "SUSPENDED").length,
      mediaChiusuraGiorni: mean(closeDays),
      medianaChiusuraGiorni: median(closeDays),
    },
  };
}

export function scadenzeBlock(ds: Dataset, extra: ExtraData, w: Windows, now: Date): AndamentoScadenzeDTO {
  const ids = scope(ds, w);
  const iters = extra.iterations.filter((i) => ids.has(i.practiceId));
  const all = iters.flatMap((i) => completions(i, extra.forecastChanged));
  const alerts = extra.alerts.filter((a) => ids.has(a.practiceId.toHexString()));
  const t = now.getTime();
  const cut = (x: Window) => Math.min(x.end, t);

  // Forecast aperti e già passati, oggi: solo iterazioni correnti di pratiche attive.
  const today = romeDate(now);
  let scadutiAperti = 0;
  for (const it of iters) {
    const p = ds.byId.get(it.practiceId);
    if (!p || p.archived || FINALI.includes(p.currentStato) || it.n !== p.currentN) continue;
    for (const e of milestonePairs(it.templateId)) {
      const rows = e.repeatGroup ? it.rows.filter((r) => r.groupKey === e.repeatGroup).map((r) => r.values) : [it.values];
      for (const v of rows) {
        const f = isoDate(v[e.flowId]);
        if (f && f < today && !isoDate(v[e.completionFlowId])) scadutiAperti++;
      }
    }
  }

  const perMilestone = new Map<string, AndamentoScadenzeDTO["perMilestone"][number]>();
  for (const c of all.filter((x) => inDates(x.completion, w.current))) {
    const k = `${c.semanticId}|${c.ownerGroup}`;
    const m = perMilestone.get(k) ?? { semanticId: c.semanticId, label: c.label, ownerGroup: c.ownerGroup, entro: 0, oltre: 0, rinviate: 0 };
    if (c.completion <= c.forecast) m.entro++;
    else m.oltre++;
    if (c.rinviata) m.rinviate++;
    perMilestone.set(k, m);
  }
  return {
    ...baseOf(ds, w, now),
    periodo: scadenzeValori(all, alerts, w.current, cut(w.current)),
    precedente: scadenzeValori(all, alerts, w.previous, cut(w.previous)),
    annoPrecedente: w.year ? scadenzeValori(all, alerts, w.year, cut(w.year)) : null,
    perMilestone: [...perMilestone.values()].sort((a, b) => b.entro + b.oltre - (a.entro + a.oltre) || a.semanticId.localeCompare(b.semanticId)),
    forecastScadutiAperti: scadutiAperti,
    serie: w.buckets.map((b) => {
      const v = scadenzeValori(all, alerts, b, cut(b));
      return { periodo: b.period, entro: v.entro, oltre: v.oltre, alertAperti: v.alert.aperti, alertChiusi: v.alert.chiusi };
    }),
  };
}

/* ---------- tempo per gruppo (D-195) ---------- */

interface Assegnazione {
  group: GroupId;
  at: number;
  /** Prima modifica USER di un campo del gruppo dopo l'Assegna (istante). */
  partito: number | null;
  /** Prima data di completamento di una milestone del gruppo dal giorno dell'Assegna (giorno, ora di Roma). */
  consegna: string | null;
}

function assegnazioni(p: PracticeTimeline, extra: ExtraData, itersById: Map<string, IterationValues>): Assegnazione[] {
  const out: Assegnazione[] = [];
  for (const a of p.assigns) {
    if (a.fromImport) continue;
    const it = itersById.get(a.iterationId);
    const day = romeDate(new Date(a.at));
    for (const group of a.added) {
      const edits = extra.firstEdits.get(a.iterationId)?.get(group) ?? [];
      const partito = edits.find((t) => t >= a.at) ?? null;
      let consegna: string | null = null;
      if (it) {
        for (const e of milestonePairs(p.templateId).filter((x) => x.ownerGroup === group)) {
          const rows = e.repeatGroup ? it.rows.filter((r) => r.groupKey === e.repeatGroup).map((r) => r.values) : [it.values];
          for (const v of rows) {
            const c = isoDate(v[e.completionFlowId]);
            if (c && c >= day && (!consegna || c < consegna)) consegna = c;
          }
        }
      }
      out.push({ group, at: a.at, partito, consegna });
    }
  }
  return out;
}

function misureGruppo(list: Assegnazione[], w: Window, now: number) {
  const cut = Math.min(w.end, now);
  const cutDay = romeDate(new Date(cut - 1));
  const partire = { conclusi: [] as number[], inCorso: [] as number[] };
  const consegnare = { conclusi: [] as number[], inCorso: [] as number[] };
  let assegnazioniN = 0;
  for (const a of list) {
    if (inWindow(a.at, w)) assegnazioniN++;
    if (a.partito !== null && inWindow(a.partito, w)) partire.conclusi.push(days(a.partito - a.at));
    if (a.at < cut && cut > w.start && (a.partito === null || a.partito >= cut)) partire.inCorso.push(days(cut - a.at));
    const day = romeDate(new Date(a.at));
    if (a.consegna && inDates(a.consegna, w)) consegnare.conclusi.push(diffCalendarDays(day, a.consegna));
    if (a.at < cut && cut > w.start && (!a.consegna || a.consegna > cutDay)) consegnare.inCorso.push(diffCalendarDays(day, cutDay));
  }
  return { assegnazioni: assegnazioniN, perPartire: durata(partire.conclusi, partire.inCorso), perConsegnare: durata(consegnare.conclusi, consegnare.inCorso) };
}

export function gruppiBlock(ds: Dataset, extra: ExtraData, w: Windows, now: Date): AndamentoGruppiDTO {
  const ids = scope(ds, w);
  const itersById = new Map(extra.iterations.map((i) => [i.iterationId, i]));
  const all = ds.practices.filter((p) => ids.has(p.id)).flatMap((p) => assegnazioni(p, extra, itersById));
  const t = now.getTime();
  return {
    ...baseOf(ds, w, now),
    righe: GROUP_IDS.filter((g) => g !== "PM_PERMESSI").map((group) => {
      const mine = all.filter((a) => a.group === group);
      const cur = misureGruppo(mine, w.current, t);
      const prev = misureGruppo(mine, w.previous, t);
      return { group, ...cur, precedente: prev, pochiDati: cur.perPartire.conclusi < POCHI_DATI && cur.perConsegnare.conclusi < POCHI_DATI };
    }),
  };
}
