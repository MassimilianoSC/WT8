"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { GROUP_LABEL } from "@/components/pratiche/labels";
import type { AndamentoFilters } from "@/components/andamento/andamento-url";
import { csvHref, loadGruppi, loadScadenze } from "@/components/andamento/andamento-source";
import type { AndamentoDurataDTO, AndamentoGruppiDTO, AndamentoScadenzeDTO } from "@/components/andamento/types";
import { BlockState, CsvLink, Frame, days, useBlock } from "@/components/andamento/blocks";
import { MIN_PASSAGGI } from "@/components/andamento/stati-read";
import { bucketsOf } from "@/components/andamento/buckets";
import { TimeChart } from "@/components/andamento/time-chart";

/**
 * Time per group (D-195) and deadlines (contract §15.3–§15.4). Groups, never
 * people; every comparison written.
 */

const periodDeps = (f: AndamentoFilters) => [f.templateId, f.from, f.to, f.passo];

/** "12,5 gg · media 14 gg · 3 in corso". */
function Durata({ d, few }: { d: AndamentoDurataDTO; few: boolean }) {
  return (
    <span className="space-y-0.5">
      <span className={cn("block font-mono tabular", few && "text-muted-foreground")}>
        {days(d.medianaGiorni)}
        {few && d.medianaGiorni !== null && "*"}
      </span>
      <span className="block text-[11px] text-muted-foreground">
        media {days(d.mediaGiorni)}
        {d.inCorso > 0 && ` · ${d.inCorso} in corso`}
      </span>
    </span>
  );
}

// ─── Tempo per gruppo (D-195) ───────────────────────────────────────────────

export function GruppiBlock({ filters }: { filters: AndamentoFilters }) {
  const { data, error, retry } = useBlock<AndamentoGruppiDTO>((fresh) => loadGruppi(filters, fresh), periodDeps(filters));
  return (
    <Frame title="Tempo per gruppo" csv={csvHref("gruppi", filters)} id="gruppi" ready={!!data} testId="andamento-gruppi">
      {!data ? (
        <BlockState error={error} retry={retry} testId="andamento-gruppi" />
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th scope="col" className="px-2 py-1.5 font-medium">Gruppo</th>
                  <th scope="col" className="px-2 py-1.5 text-right font-medium">Assegna</th>
                  <th scope="col" className="px-2 py-1.5 font-medium" title="Dall'Assegna alla prima modifica di un campo del gruppo">Tempo per partire</th>
                  <th scope="col" className="px-2 py-1.5 font-medium" title="Dall'Assegna alla prima attività del gruppo completata">Tempo per la prima consegna</th>
                  <th scope="col" className="px-2 py-1.5 text-right font-medium">Prec.</th>
                </tr>
              </thead>
              <tbody>
                {data.righe.map((r) => (
                  <tr key={r.group} className="border-b border-border align-top last:border-0" data-testid={`andamento-gruppo-${r.group}`}>
                    <th scope="row" className="px-2 py-1.5 text-left font-medium">{GROUP_LABEL[r.group]}</th>
                    <td className="px-2 py-1.5 text-right font-mono tabular">{r.assegnazioni}</td>
                    <td className="px-2 py-1.5"><Durata d={r.perPartire} few={r.pochiDati} /></td>
                    <td className="px-2 py-1.5"><Durata d={r.perConsegnare} few={r.pochiDati} /></td>
                    <td className="px-2 py-1.5 text-right text-[11px] text-muted-foreground">
                      partire {days(r.precedente.perPartire.medianaGiorni)}
                      <br />
                      consegna {days(r.precedente.perConsegnare.medianaGiorni)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground">
            I tempi di PM/Permessi sono quelli degli stati: il gruppo lavora dalla creazione della pratica.
            {data.righe.some((r) => r.pochiDati) && ` * Meno di ${MIN_PASSAGGI} casi nel periodo: valore poco indicativo.`}
          </p>
        </div>
      )}
    </Frame>
  );
}

// ─── Scadenze e alert (§15.4) ───────────────────────────────────────────────

const pct = (part: number, all: number) => (all === 0 ? "—" : `${Math.round((part / all) * 100)} %`);

export function ScadenzeBlock({ filters }: { filters: AndamentoFilters }) {
  const { data, error, retry } = useBlock<AndamentoScadenzeDTO>((fresh) => loadScadenze(filters, fresh), periodDeps(filters));
  const prev = data ? (filters.confronto === "anno" ? data.annoPrecedente : data.precedente) : null;
  const prevLabel = filters.confronto === "anno" ? "anno prima" : "prec.";
  return (
    <Frame title="Scadenze e alert" csv={csvHref("scadenze", filters)} id="scadenze" ready={!!data} testId="andamento-scadenze">
      {!data ? (
        <BlockState error={error} retry={retry} testId="andamento-scadenze" />
      ) : (
        <div className="space-y-4 text-sm">
          <dl className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
            <Stat
              label="Entro il forecast"
              value={pct(data.periodo.entro, data.periodo.entro + data.periodo.oltre)}
              hint={`${data.periodo.entro} su ${data.periodo.entro + data.periodo.oltre}${prev ? ` · ${prevLabel} ${pct(prev.entro, prev.entro + prev.oltre)}` : ""}`}
              testId="andamento-scad-entro"
            />
            <Stat label="Oltre il forecast" value={data.periodo.oltre} hint={prev ? `${prevLabel} ${prev.oltre}` : undefined} testId="andamento-scad-oltre" />
            <Stat label="Rinviate" value={data.periodo.rinviate} hint="forecast cambiato almeno una volta" testId="andamento-scad-rinviate" />
            <Stat label="Forecast scaduti aperti" value={data.forecastScadutiAperti} hint="già passati, senza completamento" testId="andamento-scad-aperti" />
          </dl>
          <p data-testid="andamento-scad-alert">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Alert </span>
            aperti {data.periodo.alert.aperti} · chiusi {data.periodo.alert.chiusi} · scaduti {data.periodo.alert.scaduti} · ripetuti{" "}
            {data.periodo.alert.ripetuti} · sospesi {data.periodo.alert.sospesi} · chiusura in mediana {days(data.periodo.alert.medianaChiusuraGiorni)} (media{" "}
            {days(data.periodo.alert.mediaChiusuraGiorni)})
          </p>
          {data.serie.length > 0 && (
            <TimeChart
              title={`Attività completate entro e oltre il forecast, ${filters.passo === "mese" ? "per mese" : "per settimana"}`}
              buckets={bucketsOf(data.serie.map((r) => r.periodo), filters.passo)}
              series={[
                { key: "entro", label: "Entro il forecast", values: data.serie.map((r) => r.entro) },
                { key: "oltre", label: "Oltre il forecast", values: data.serie.map((r) => r.oltre), look: "outline" },
              ]}
              testId="andamento-scadenze-chart"
            />
          )}
          {data.perMilestone.length > 0 && (
            <details data-testid="andamento-scad-milestone">
              <summary className="cursor-pointer">Per attività ({data.perMilestone.length})</summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[32rem] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th scope="col" className="px-2 py-1 font-medium">Attività</th>
                      <th scope="col" className="px-2 py-1 font-medium">Gruppo</th>
                      <th scope="col" className="px-2 py-1 text-right font-medium">Entro</th>
                      <th scope="col" className="px-2 py-1 text-right font-medium">Oltre</th>
                      <th scope="col" className="px-2 py-1 text-right font-medium">Rinviate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.perMilestone.map((m) => (
                      <tr key={m.semanticId} className="border-b border-border last:border-0">
                        <td className="px-2 py-1">{m.label}</td>
                        <td className="px-2 py-1">{GROUP_LABEL[m.ownerGroup]}</td>
                        <td className="px-2 py-1 text-right font-mono tabular">{m.entro}</td>
                        <td className="px-2 py-1 text-right font-mono tabular">{m.oltre}</td>
                        <td className="px-2 py-1 text-right font-mono tabular">{m.rinviate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2">
                <CsvLink href={csvHref("scadenze", filters, "milestone")} testId="andamento-scad-milestone-csv" />
              </div>
            </details>
          )}
        </div>
      )}
    </Frame>
  );
}

function Stat({ label, value, hint, testId }: { label: string; value: React.ReactNode; hint?: string; testId: string }) {
  return (
    <div className="bg-card px-3 py-2" data-testid={testId}>
      <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="font-heading text-2xl font-black tabular">{value}</dd>
      {hint && <dd className="text-[11px] text-muted-foreground">{hint}</dd>}
    </div>
  );
}
