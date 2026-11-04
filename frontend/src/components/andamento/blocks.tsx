"use client";
import * as React from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Download } from "lucide-react";
import type { TemplateId } from "@/lib/contract";
import { cn } from "@/lib/utils";
import { GROUP_LABEL, STATO_LABEL } from "@/components/pratiche/labels";
import { StatoBadge } from "@/components/pratiche/stato-badge";
import { LoadError, loadErrorMessage } from "@/components/layout/load-error";
import type { AndamentoFilters } from "@/components/andamento/andamento-url";
import { CSV_READY, csvHref, loadFerme, loadStati } from "@/components/andamento/andamento-source";
import type { AndamentoFermaDTO, AndamentoFermeDTO, AndamentoGruppoStato, AndamentoStatiDTO } from "@/components/andamento/types";
import { CONFRONTO_LABEL, MIN_PASSAGGI, comparisonOf, externalSentence, giorni, rowsOf, slowestSentence } from "@/components/andamento/stati-read";
import { bucketsOf } from "@/components/andamento/buckets";

/** Reads one block; a failed read shows why and "Riprova", which always asks again (never "Caricamento…" forever). */
export function useBlock<T>(load: (fresh: boolean) => Promise<T>, deps: React.DependencyList) {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    load(attempt > 0)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(loadErrorMessage(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);
  return { data, error, retry: () => setAttempt((n) => n + 1) };
}

/** "Esporta CSV" next to the table it exports (one link per table). */
export function CsvLink({ href, label = "Esporta CSV", testId }: { href: string; label?: string; testId: string }) {
  if (!CSV_READY) return null;
  return (
    // The server makes the file and names it (Content-Disposition).
    <a href={href} download className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground" data-testid={testId}>
      <Download className="h-3.5 w-3.5" /> {label}
    </a>
  );
}

export function Frame({
  title,
  csv,
  csvLabel,
  id,
  ready = false,
  testId,
  children,
}: {
  title: React.ReactNode;
  csv?: string;
  csvLabel?: string;
  /** Anchor of the block (the assistant's ANDAMENTO source links to #id). */
  id?: string;
  /** The block's data arrived: if the address points here, scroll again (blocks above may have grown). */
  ready?: boolean;
  testId: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    if (ready && id && typeof window !== "undefined" && window.location.hash === `#${id}`) ref.current?.scrollIntoView?.({ block: "start" });
  }, [ready, id]);
  return (
    <section ref={ref} id={id} className="scroll-mt-20 border border-border bg-card" data-testid={testId}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h3 className="font-mono text-xs uppercase tracking-wider">{title}</h3>
        {csv && <CsvLink href={csv} label={csvLabel} testId={`${testId}-csv`} />}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function BlockState({ error, retry, testId }: { error: string | null; retry: () => void; testId: string }) {
  return error ? (
    <LoadError message={error} onRetry={retry} className="p-0" testId={`${testId}-error`} />
  ) : (
    <p className="font-mono text-xs text-muted-foreground">Caricamento…</p>
  );
}

export const days = (n: number | null | undefined) => giorni(n, true);

// ─── Tempo per stato (§15.3–§15.4, D-194) ───────────────────────────────────

export function StatiBlock({ filters }: { filters: AndamentoFilters }) {
  const { data, error, retry } = useBlock<AndamentoStatiDTO>((fresh) => loadStati(filters, fresh), [filters.templateId, filters.from, filters.to, filters.passo]);
  return (
    <div className="space-y-4">
      <Frame title="Tempo per Stato attività" csv={csvHref("stati", filters)} id="stati" ready={!!data} testId="andamento-stati">
        {!data ? <BlockState error={error} retry={retry} testId="andamento-stati" /> : <StatiTable data={data} filters={filters} gruppo="OPERATIVO" />}
      </Frame>
      {data && rowsOf(data, "ESTERNO").length > 0 && (
        <Frame title="Attese esterne e sospensioni" testId="andamento-esterni">
          <StatiTable data={data} filters={filters} gruppo="ESTERNO" />
        </Frame>
      )}
    </div>
  );
}

function StatiTable({ data, filters, gruppo }: { data: AndamentoStatiDTO; filters: AndamentoFilters; gruppo: AndamentoGruppoStato }) {
  const rows = rowsOf(data, gruppo);
  const top = new Set(gruppo === "OPERATIVO" ? data.piuLenti : []);
  const sentence = gruppo === "OPERATIVO" ? slowestSentence(data, filters.confronto) : externalSentence(data);
  const max = Math.max(1, ...rows.map((r) => r.periodo.medianaGiorni ?? 0));
  const anyFew = rows.some((r) => r.pochiDati && r.periodo.medianaGiorni !== null);
  // "Per data del fatto" (autoEventDate) only when some state has it.
  const fatto = rows.some((r) => r.perDataDelFatto !== null);
  if (rows.every((r) => r.passaggi === 0 && r.periodo.inCorso === 0)) {
    return <p className="text-sm text-muted-foreground">Nessun passaggio di stato in questo periodo.</p>;
  }
  return (
    <div className="space-y-3">
      {sentence && (
        <p className="text-sm" data-testid={`andamento-${gruppo === "OPERATIVO" ? "piu-lento" : "esterni"}-frase`}>
          {sentence}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <th scope="col" className="px-2 py-1.5 font-medium">Stato</th>
              <th scope="col" className="w-2/5 px-2 py-1.5 font-medium">Mediana</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">Media</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">Passaggi</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">In corso</th>
              {fatto && (
                <th scope="col" className="px-2 py-1.5 text-right font-medium" title="Mediana calcolata sulle date dei campi, dove ci sono">
                  Per data del fatto
                </th>
              )}
              <th scope="col" className="px-2 py-1.5 text-right font-medium" title={CONFRONTO_LABEL[filters.confronto]}>Prec.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const few = r.pochiDati;
              const isTop = top.has(r.stato);
              const prev = comparisonOf(r, filters.confronto);
              return (
                <tr key={r.stato} className="border-b border-border last:border-0" data-testid={`andamento-stato-${r.stato}`}>
                  <td className="px-2 py-1.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <StatoBadge stato={r.stato} />
                      {isTop && <span className="font-mono text-[10px] uppercase tracking-wider" data-testid="andamento-piu-lento">Più lento</span>}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="flex items-center gap-2">
                      <span className="h-2 flex-1 bg-border" aria-hidden>
                        <span
                          className={cn("block h-2", isTop ? "bg-foreground" : "bg-muted-foreground")}
                          style={{ width: `${((r.periodo.medianaGiorni ?? 0) / max) * 100}%` }}
                        />
                      </span>
                      <span className={cn("w-16 text-right font-mono tabular", few && "text-muted-foreground")}>
                        {days(r.periodo.medianaGiorni)}
                        {few && r.periodo.medianaGiorni !== null && "*"}
                      </span>
                    </span>
                  </td>
                  <td className={cn("px-2 py-1.5 text-right font-mono tabular", few && "text-muted-foreground")}>{days(r.periodo.mediaGiorni)}</td>
                  <td className="px-2 py-1.5 text-right font-mono tabular">{r.passaggi}</td>
                  {/* TERMINATO and KO are where practices end: nothing is "in corso" there. */}
                  <td className="px-2 py-1.5 text-right font-mono tabular">{r.stato === "TERMINATO" || r.stato === "KO" ? "—" : r.periodo.inCorso}</td>
                  {fatto && <td className="px-2 py-1.5 text-right font-mono tabular">{days(r.perDataDelFatto?.medianaGiorni)}</td>}
                  <td className="px-2 py-1.5 text-right font-mono tabular text-muted-foreground">{days(prev?.medianaGiorni)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {anyFew && <p className="text-[11px] text-muted-foreground">* Meno di {MIN_PASSAGGI} passaggi conclusi nel periodo: valore poco indicativo.</p>}
      {gruppo === "OPERATIVO" && <SerieStati data={data} filters={filters} />}
    </div>
  );
}

/**
 * The long period (UX note §3.6): the median per state, bucket by bucket,
 * as a table that scrolls inside its box. Only states with data.
 */
function SerieStati({ data, filters }: { data: AndamentoStatiDTO; filters: AndamentoFilters }) {
  const buckets = bucketsOf(data.serie.map((b) => b.periodo), filters.passo);
  const states = rowsOf(data, "OPERATIVO").filter((r) => data.serie.some((b) => b.perStato[r.stato]));
  if (buckets.length === 0 || states.length === 0) return null;
  return (
    <details className="border-t border-border pt-3" data-testid="andamento-stati-serie">
      <summary className="cursor-pointer text-sm">Serie {filters.passo === "mese" ? "mese per mese" : "settimana per settimana"}: mediana per stato</summary>
      <div className="mt-2 space-y-2">
        <div className="overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <th scope="col" className="sticky left-0 bg-card px-2 py-1 font-medium">Stato</th>
                {buckets.map((b) => (
                  <th key={b.key} scope="col" className="whitespace-nowrap px-2 py-1 text-right font-medium" title={b.full}>
                    {b.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {states.map((r) => (
                <tr key={r.stato} className="border-b border-border last:border-0">
                  <th scope="row" className="sticky left-0 whitespace-nowrap bg-card px-2 py-1 text-left font-normal">{STATO_LABEL[r.stato]}</th>
                  {data.serie.map((b, i) => {
                    const v = b.perStato[r.stato];
                    return (
                      <td
                        key={buckets[i].key}
                        className={cn("whitespace-nowrap px-2 py-1 text-right font-mono tabular", v && v.conclusi < MIN_PASSAGGI && "text-muted-foreground")}
                        title={v ? `${buckets[i].full}: ${v.conclusi} passaggi conclusi` : buckets[i].full}
                      >
                        {v ? days(v.medianaGiorni) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CsvLink href={csvHref("stati", filters, "serie")} testId="andamento-stati-serie-csv" />
      </div>
    </details>
  );
}

// ─── Pratiche ferme (§15.3, D-193) ──────────────────────────────────────────

const SHOWN = 10;

export function FermeBlock({ filters, labelOf }: { filters: AndamentoFilters; labelOf: (t: TemplateId) => string }) {
  const { data, error, retry } = useBlock<AndamentoFermeDTO>((fresh) => loadFerme(filters, fresh), [filters.templateId]);
  const working = data?.items.filter((i) => !i.fromImport) ?? [];
  const fromImport = data?.items.filter((i) => i.fromImport) ?? [];
  const title = data ? `Pratiche ferme da più di ${data.soglia} giorni (${data.totale})` : "Pratiche ferme";
  return (
    <Frame
      title={title}
      csv={csvHref("ferme", filters)}
      // The CSV has every one, without the 200 limit of the list.
      csvLabel={data ? `Esporta CSV (tutte le ${data.totale} pratiche)` : undefined}
      id="ferme"
      ready={!!data}
      testId="andamento-ferme"
    >
      {!data ? (
        <BlockState error={error} retry={retry} testId="andamento-ferme" />
      ) : data.items.length === 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground" data-testid="andamento-ferme-vuoto">Nessuna pratica ferma oltre la soglia.</p>
          <NonDatabili data={data} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1 text-sm">
            {data.perStato.length > 0 && (
              <p data-testid="andamento-ferme-per-stato">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Per stato </span>
                {data.perStato.map((s) => `${STATO_LABEL[s.stato]} ${s.count}`).join(" · ")}
              </p>
            )}
            {data.perCliente.length > 0 && (
              <p data-testid="andamento-ferme-per-cliente">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Per cliente </span>
                {data.perCliente.map((c) => `${labelOf(c.templateId)} ${c.count}`).join(" · ")}
              </p>
            )}
          </div>
          {working.length > 0 && <FermeTable items={working} labelOf={labelOf} testId="andamento-ferme-elenco" />}
          {data.truncated && <p className="text-[11px] text-muted-foreground">Elenco limitato alle prime 200: l&apos;export CSV le comprende tutte.</p>}
          <NonDatabili data={data} />
          {fromImport.length > 0 && (
            <details className="border-t border-border pt-3" data-testid="andamento-ferme-import">
              <summary className="cursor-pointer text-sm">
                Di cui ferme da import ({fromImport.length}): nessun passaggio di stato dopo l&apos;import, quindi il tempo vero non si conosce.
              </summary>
              <div className="mt-3">
                <FermeTable items={fromImport} labelOf={labelOf} testId="andamento-ferme-import-elenco" />
              </div>
            </details>
          )}
        </div>
      )}
    </Frame>
  );
}

/** Practices whose entry into the state cannot be dated (§15.4): counted, never hidden. */
function NonDatabili({ data }: { data: AndamentoFermeDTO }) {
  const n = data.nonDatabili.totale;
  if (n === 0) return null;
  return (
    <p className="border-l-4 border-border px-3 py-1 text-sm text-muted-foreground" data-testid="andamento-ferme-non-databili">
      {n === 1 ? "1 pratica senza data d'ingresso nello stato" : `${n} pratiche senza data d'ingresso nello stato`}
      {data.nonDatabili.perStato.length > 0 && `: ${data.nonDatabili.perStato.map((s) => `${STATO_LABEL[s.stato]} ${s.count}`).join(" · ")}`}. Non
      sono nell&apos;elenco perché non si sa da quanto sono ferme.
    </p>
  );
}

function FermeTable({ items, labelOf, testId }: { items: AndamentoFermaDTO[]; labelOf: (t: TemplateId) => string; testId: string }) {
  const [all, setAll] = React.useState(false);
  // The server sends them from the longest; sorted again so the order never depends on it.
  const sorted = [...items].sort((a, b) => b.giorni - a.giorni);
  const shown = all ? sorted : sorted.slice(0, SHOWN);
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] text-sm" data-testid={testId}>
          <thead>
            <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <th scope="col" className="px-2 py-1.5 font-medium">Codice Sito</th>
              <th scope="col" className="px-2 py-1.5 font-medium">Nome sito</th>
              <th scope="col" className="px-2 py-1.5 font-medium">Cliente</th>
              <th scope="col" className="px-2 py-1.5 font-medium">Stato</th>
              <th scope="col" className="px-2 py-1.5 font-medium">Dal</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">Giorni</th>
              <th scope="col" className="px-2 py-1.5 font-medium">In carico a</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((f) => (
              <tr key={f.practiceId} className="border-b border-border last:border-0">
                <td className="px-2 py-1.5 font-mono">
                  {/* Only practices the user can already open (D-193). */}
                  {f.canOpen ? (
                    <Link href={`/pratiche/${f.practiceId}`} className="underline underline-offset-2 hover:text-primary">
                      {f.codiceSito}
                    </Link>
                  ) : (
                    f.codiceSito
                  )}
                </td>
                <td className="px-2 py-1.5">{f.nomeSito}</td>
                <td className="px-2 py-1.5">{labelOf(f.templateId)}</td>
                <td className="px-2 py-1.5"><StatoBadge stato={f.stato} /></td>
                <td className="px-2 py-1.5 font-mono tabular">{format(new Date(f.since), "dd/MM/yyyy")}</td>
                <td className="px-2 py-1.5 text-right font-mono tabular">{f.giorni}</td>
                <td className="px-2 py-1.5 text-xs">{f.gruppi.length ? f.gruppi.map((g) => GROUP_LABEL[g]).join(", ") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > SHOWN && (
        <button type="button" onClick={() => setAll((v) => !v)} className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground" data-testid={`${testId}-tutte`}>
          {all ? "Mostra le prime 10" : `Mostra tutte (${sorted.length})`}
        </button>
      )}
    </div>
  );
}
