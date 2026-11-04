"use client";
import * as React from "react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { STATO_LABEL } from "@/components/pratiche/labels";
import type { AndamentoFilters } from "@/components/andamento/andamento-url";
import { csvHref, loadFerme, loadFlussi, loadRilavorazioni, loadStati } from "@/components/andamento/andamento-source";
import type { AndamentoFlussoValoriDTO, AndamentoRilavorazioniDTO } from "@/components/andamento/types";
import { BlockState, CsvLink, Frame, days, useBlock } from "@/components/andamento/blocks";
import { TimeChart } from "@/components/andamento/time-chart";
import { bucketsOf } from "@/components/andamento/buckets";

/**
 * Summary tiles, entries/exits with the backlog, and rework (contract §15.3,
 * UX note §3–§4). Every comparison is written ("+5", "prec. 38"): no red or
 * green arrows. Never people.
 */

export { bucketsOf } from "@/components/andamento/buckets";

/** "+5", "−3", "0": a change written, never colored. */
export function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0";
}

const uscite = (v: AndamentoFlussoValoriDTO) => v.terminate + v.ko;

/**
 * The backlog adds up (contract v0.6.8): start + entrate + da import + riaperture
 * + ripristinate − terminate − KO − archiviate = end. Written in full so it can be
 * checked by hand.
 */
export function arretratoConto(inizio: number, v: AndamentoFlussoValoriDTO): string {
  const piu = [
    `${v.entrate} entrate`,
    `${v.entrateImport} da import`,
    `${v.rientri} riaperture`,
    `${v.ripristinate ?? 0} ripristinate`,
  ];
  const meno = [`${v.terminate} terminate`, `${v.ko} KO`, `${v.archiviate ?? 0} archiviate`];
  return `Arretrato: ${inizio} all'inizio + ${piu.join(" + ")} − ${meno.join(" − ")} = ${v.arretratoFine} alla fine.`;
}

function Tile({ label, value, hint, testId }: { label: string; value: React.ReactNode; hint?: string; testId: string }) {
  return (
    <div className="bg-card px-4 py-3" data-testid={testId}>
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-heading text-3xl font-black tabular tracking-tight">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

// ─── Riepilogo (UX note §3.2) ───────────────────────────────────────────────

export function Riepilogo({ filters }: { filters: AndamentoFilters }) {
  const deps = [filters.templateId, filters.from, filters.to, filters.passo];
  const flussi = useBlock((fresh) => loadFlussi(filters, fresh), deps);
  const stati = useBlock((fresh) => loadStati(filters, fresh), deps);
  const ferme = useBlock((fresh) => loadFerme(filters, fresh), [filters.templateId]);
  const anno = filters.confronto === "anno";
  const prevFlussi = flussi.data ? (anno ? flussi.data.annoPrecedente : flussi.data.precedente) : null;
  const prevLabel = anno ? "anno prima" : "prec.";
  const dataFrom = stati.data?.dataFrom ?? flussi.data?.dataFrom ?? null;
  const error = flussi.error ?? stati.error;

  if (error) {
    return <BlockState error={error} retry={() => (flussi.retry(), stati.retry(), ferme.retry())} testId="andamento-riepilogo" />;
  }
  const f = flussi.data;
  const s = stati.data;
  return (
    <div className="space-y-2" data-testid="andamento-riepilogo">
      <p className="text-xs text-muted-foreground" data-testid="andamento-dati-dal">
        {dataFrom
          ? `Dati dal ${format(parseISO(dataFrom), "dd/MM/yyyy")} · le pratiche importate contano dal giorno dell'import.`
          : "Nessun dato ancora: i tempi si misurano dai passaggi registrati nell'app."}
      </p>
      <div className="grid grid-cols-2 gap-px border border-border bg-border md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Attive ora" value={f ? f.attiveOra : "…"} testId="tile-attive" />
        <Tile
          label="Entrate"
          value={f ? f.periodo.entrate : "…"}
          hint={f ? [prevFlussi ? `${prevLabel} ${prevFlussi.entrate}` : null, f.periodo.entrateImport ? `+ ${f.periodo.entrateImport} da import` : null].filter(Boolean).join(" · ") : undefined}
          testId="tile-entrate"
        />
        <Tile
          label="Uscite"
          value={f ? uscite(f.periodo) : "…"}
          hint={f ? `terminate ${f.periodo.terminate} · KO ${f.periodo.ko}${prevFlussi ? ` · ${prevLabel} ${uscite(prevFlussi)}` : ""}` : undefined}
          testId="tile-uscite"
        />
        <Tile
          label="Arretrato"
          value={f ? signed(f.periodo.arretratoFine - f.arretratoInizio) : "…"}
          hint={
            f
              ? `da ${f.arretratoInizio} a ${f.periodo.arretratoFine} · archiviate ${f.periodo.archiviate ?? 0} · ripristinate ${f.periodo.ripristinate ?? 0}`
              : undefined
          }
          testId="tile-arretrato"
        />
        <Tile
          label="Ferme"
          value={ferme.data ? ferme.data.totale : ferme.error ? "—" : "…"}
          hint={ferme.data ? `da più di ${ferme.data.soglia} giorni` : undefined}
          testId="tile-ferme"
        />
        <Tile
          label="Tempo mediano"
          value={s ? days(s.complessivo.medianaGiorni) : "…"}
          // The contract compares the overall time with the previous period only.
          hint={s ? `pratiche terminate · periodo prec. ${days(s.complessivoPrecedente.medianaGiorni)}` : undefined}
          testId="tile-tempo"
        />
      </div>
    </div>
  );
}

// ─── Entrate e uscite, arretrato (UX note §4) ───────────────────────────────

export function FlussiBlock({ filters }: { filters: AndamentoFilters }) {
  const { data, error, retry } = useBlock((fresh) => loadFlussi(filters, fresh), [filters.templateId, filters.from, filters.to, filters.passo]);
  const per = filters.passo === "mese" ? "per mese" : "per settimana";
  return (
    <Frame title={`Entrate e uscite ${per}`} csv={csvHref("flussi", filters)} id="flussi" ready={!!data} testId="andamento-flussi">
      {!data ? (
        <BlockState error={error} retry={retry} testId="andamento-flussi" />
      ) : (
        <div className="space-y-6">
          <TimeChart
            title={`Entrate e uscite ${per}`}
            buckets={bucketsOf(data.serie.map((r) => r.periodo), filters.passo)}
            series={[
              { key: "entrate", label: "Entrate", values: data.serie.map((r) => r.entrate) },
              { key: "uscite", label: "Uscite (terminate e KO)", values: data.serie.map(uscite), look: "outline" },
              // The rest of the sum, so each month can be checked by hand in "Mostra come tabella".
              { key: "import", label: "Da import", values: data.serie.map((r) => r.entrateImport), tableOnly: true },
              { key: "rientri", label: "Riaperture", values: data.serie.map((r) => r.rientri), tableOnly: true },
              { key: "ripristinate", label: "Ripristinate", values: data.serie.map((r) => r.ripristinate ?? 0), tableOnly: true },
              { key: "archiviate", label: "Archiviate", values: data.serie.map((r) => r.archiviate ?? 0), tableOnly: true },
              { key: "arretrato", label: "Arretrato a fine periodo", values: data.serie.map((r) => r.arretratoFine), tableOnly: true },
            ]}
            testId="andamento-flussi-chart"
          />
          {/* One axis per chart: the backlog has its own scale, same buckets. */}
          <div className="space-y-1">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Arretrato a fine {filters.passo === "mese" ? "mese" : "settimana"}</p>
            <TimeChart
              title={`Arretrato a fine ${filters.passo === "mese" ? "mese" : "settimana"}`}
              kind="line"
              buckets={bucketsOf(data.serie.map((r) => r.periodo), filters.passo)}
              series={[{ key: "arretrato", label: "Arretrato", values: data.serie.map((r) => r.arretratoFine) }]}
              testId="andamento-arretrato-chart"
            />
          </div>
          <p className="text-xs text-muted-foreground" data-testid="andamento-flussi-note">
            {arretratoConto(data.arretratoInizio, data.periodo)} Le pratiche create dall&apos;import non contano nelle entrate; le riaperture sono
            ritorni da TERMINATO o KO.
          </p>
        </div>
      )}
    </Frame>
  );
}

// ─── Rilavorazioni (UX note §3.5) ───────────────────────────────────────────

export function RilavorazioniBlock({ filters }: { filters: AndamentoFilters }) {
  const { data, error, retry } = useBlock<AndamentoRilavorazioniDTO>(
    (fresh) => loadRilavorazioni(filters, fresh),
    [filters.templateId, filters.from, filters.to, filters.passo]
  );
  const prev = data ? (filters.confronto === "anno" ? data.annoPrecedente : data.precedente) : null;
  const prevLabel = filters.confronto === "anno" ? "anno prima" : "prec.";
  return (
    <Frame title="Rilavorazioni" csv={csvHref("rilavorazioni", filters)} id="rilavorazioni" ready={!!data} testId="andamento-rilavorazioni">
      {!data ? (
        <BlockState error={error} retry={retry} testId="andamento-rilavorazioni" />
      ) : (
        <div className="space-y-3 text-sm">
          <dl className="grid grid-cols-3 gap-px border border-border bg-border">
            {(
              [
                ["rework", "Rilavorazioni"],
                ["resubmit", "Ripresentazioni"],
                ["ritorni", "Ritorni di stato"],
              ] as const
            ).map(([k, label]) => (
              <div key={k} className="bg-card px-3 py-2" data-testid={`andamento-rilav-${k}`}>
                <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
                <dd className="font-heading text-2xl font-black tabular">{data.periodo[k]}</dd>
                {prev && <dd className="text-[11px] text-muted-foreground">{prevLabel} {prev[k]}</dd>}
              </div>
            ))}
          </dl>
          {data.daStato.length > 0 && (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p data-testid="andamento-rilav-da-stato">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Da stato </span>
                {data.daStato.map((d) => `${STATO_LABEL[d.stato]} ${d.rework + d.resubmit}`).join(" · ")}
              </p>
              <CsvLink href={csvHref("rilavorazioni", filters, "daStato")} testId="andamento-rilav-da-stato-csv" />
            </div>
          )}
          {data.ritorni.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[24rem] text-sm" data-testid="andamento-ritorni">
                <caption className="pb-1 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Ritorni a uno stato precedente: dove nasce il lavoro rifatto
                </caption>
                <thead>
                  <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th scope="col" className="px-2 py-1 font-medium">Da</th>
                    <th scope="col" className="px-2 py-1 font-medium">A</th>
                    <th scope="col" className="px-2 py-1 text-right font-medium">Volte</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.ritorni].sort((a, b) => b.count - a.count).map((r) => (
                    <tr key={`${r.from}-${r.to}`} className="border-b border-border last:border-0">
                      <td className="px-2 py-1">{STATO_LABEL[r.from]}</td>
                      <td className="px-2 py-1">{STATO_LABEL[r.to]}</td>
                      <td className="px-2 py-1 text-right font-mono tabular">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <CsvLink href={csvHref("rilavorazioni", filters, "ritorni")} testId="andamento-ritorni-csv" />
            </div>
          )}
          <SerieRilavorazioni data={data} filters={filters} />
        </div>
      )}
    </Frame>
  );
}

/** Rework bucket by bucket (UX note §3.6), as a table. */
function SerieRilavorazioni({ data, filters }: { data: AndamentoRilavorazioniDTO; filters: AndamentoFilters }) {
  const buckets = bucketsOf(data.serie.map((b) => b.periodo), filters.passo);
  if (buckets.length === 0) return null;
  return (
    <details className="border-t border-border pt-3" data-testid="andamento-rilav-serie">
      <summary className="cursor-pointer">Serie {filters.passo === "mese" ? "mese per mese" : "settimana per settimana"}</summary>
      <div className="mt-2 space-y-2">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[24rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <th scope="col" className="px-2 py-1 font-medium">Periodo</th>
                <th scope="col" className="px-2 py-1 text-right font-medium">Rilavorazioni</th>
                <th scope="col" className="px-2 py-1 text-right font-medium">Ripresentazioni</th>
                <th scope="col" className="px-2 py-1 text-right font-medium">Ritorni</th>
              </tr>
            </thead>
            <tbody>
              {data.serie.map((r, i) => (
                <tr key={buckets[i].key} className="border-b border-border last:border-0">
                  <th scope="row" className="px-2 py-1 text-left font-normal">{buckets[i].full}</th>
                  <td className="px-2 py-1 text-right font-mono tabular">{r.rework}</td>
                  <td className="px-2 py-1 text-right font-mono tabular">{r.resubmit}</td>
                  <td className="px-2 py-1 text-right font-mono tabular">{r.ritorni}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

/** Blocks whose route answers 404 for now (gruppi, scadenze): "in arrivo", never an error. */
export function ComingBlock({ title, text, testId }: { title: string; text: string; testId: string }) {
  return (
    <Frame title={title} testId={testId}>
      <p className="text-sm text-muted-foreground">
        <span className="mr-2 border border-border px-1 font-mono text-[10px] uppercase tracking-wider">In arrivo</span>
        {text}
      </p>
    </Frame>
  );
}
