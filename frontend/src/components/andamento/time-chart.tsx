"use client";
import * as React from "react";
import { Table2, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDecimal } from "@/components/scheda/fields/format";

/**
 * Series over time for Andamento (UX note §4), made in house like the bars of
 * Statistiche: no chart library. One axis per chart (entrate/uscite and the
 * backlog are two charts on the same months, never a double axis). Series in
 * the theme's ink only: solid and outlined, so they read without color, in
 * dark mode and in print; status colors stay for states and alerts.
 * Every chart has "Mostra come tabella" with the same numbers; the columns
 * show month and values on hover; the chart scrolls inside its box.
 */

export interface Bucket {
  key: string;
  /** Short label under the column ("ott 25"). */
  label: string;
  /** Full label for the tooltip and the table ("ottobre 2025"). */
  full: string;
}

export interface Series {
  key: string;
  label: string;
  values: Array<number | null>;
  /** Solid fill or outline (two series stay apart without color). */
  look?: "solid" | "outline";
  /** Only in "Mostra come tabella" and in the hover text: not drawn, not in the legend nor in the scale. */
  tableOnly?: boolean;
}

const PLOT_H = 140;
const LEFT = 40;
const BOTTOM = 22;
const TOP = 8;

/** A round top for the axis: 1, 2, 5 × 10^n. */
export function niceMax(max: number): number {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  return ([1, 2, 5, 10].find((m) => m * p >= max) ?? 10) * p;
}

export function TimeChart({
  title,
  buckets,
  series,
  kind = "columns",
  unit = "",
  testId,
}: {
  /** Says what the chart shows, for screen readers ("Entrate e uscite, ott 2025 – set 2026"). */
  title: string;
  buckets: Bucket[];
  series: Series[];
  kind?: "columns" | "line";
  unit?: string;
  testId: string;
}) {
  const [asTable, setAsTable] = React.useState(false);
  const drawn = series.filter((s) => !s.tableOnly);
  const all = drawn.flatMap((s) => s.values).filter((v): v is number => typeof v === "number");
  const top = niceMax(Math.max(0, ...all));
  const n = buckets.length;
  const perSeries = kind === "columns" ? drawn.length : 1;
  // Wide enough for its columns and for its label ("nov 25", ~6 px per character at 10 px mono): labels never overlap.
  const longest = Math.max(0, ...buckets.map((b) => b.label.length));
  const group = Math.max(28, perSeries * 14 + 10, Math.ceil(longest * 6.2) + 10);
  const colStart = (group - (perSeries * 14 - 2)) / 2;
  const width = LEFT + n * group + 8;
  const height = TOP + PLOT_H + BOTTOM;
  const y = (v: number) => TOP + PLOT_H - (v / top) * PLOT_H;
  const fmt = (v: number | null) => (v === null ? "—" : `${formatDecimal(v)}${unit}`);

  return (
    <div className="space-y-2" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {drawn.length > 1 ? (
          <ul className="flex flex-wrap gap-4 text-xs" aria-label="Legenda">
            {drawn.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={cn("inline-block h-3 w-3 border border-foreground", (s.look ?? "solid") === "solid" && "bg-foreground")}
                />
                {s.label}
              </li>
            ))}
          </ul>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
          className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          data-testid={`${testId}-toggle`}
        >
          {asTable ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
          {asTable ? "Mostra come grafico" : "Mostra come tabella"}
        </button>
      </div>

      {asTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid={`${testId}-table`}>
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <th scope="col" className="px-2 py-1.5 font-medium">Periodo</th>
                {series.map((s) => (
                  <th key={s.key} scope="col" className="px-2 py-1.5 text-right font-medium">{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {buckets.map((b, i) => (
                <tr key={b.key} className="border-b border-border last:border-0">
                  <th scope="row" className="px-2 py-1 text-left font-normal">{b.full}</th>
                  {series.map((s) => (
                    <td key={s.key} className="px-2 py-1 text-right font-mono tabular">{fmt(s.values[i] ?? null)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <svg role="img" aria-label={title} width={width} height={height} className="block text-foreground" data-testid={`${testId}-svg`}>
            {/* Recessive grid: 0, half, top. */}
            {[0, top / 2, top].map((v) => (
              <g key={v}>
                <line x1={LEFT} x2={width - 4} y1={y(v)} y2={y(v)} className="stroke-border" strokeWidth={1} />
                <text x={LEFT - 6} y={y(v) + 3} textAnchor="end" className="fill-muted-foreground font-mono text-[10px]">
                  {formatDecimal(v)}
                </text>
              </g>
            ))}
            {buckets.map((b, i) => {
              const x0 = LEFT + i * group;
              return (
                <g key={b.key} data-testid={`${testId}-bucket`}>
                  <title>{`${b.full}: ${series.map((s) => `${s.label} ${fmt(s.values[i] ?? null)}`).join(" · ")}`}</title>
                  {/* Hover target bigger than the marks. */}
                  <rect x={x0} y={TOP} width={group} height={PLOT_H} fill="transparent" className="hover:fill-accent" />
                  {kind === "columns" &&
                    drawn.map((s, j) => {
                      const v = s.values[i];
                      if (typeof v !== "number" || v <= 0) return null;
                      const solid = (s.look ?? "solid") === "solid";
                      return (
                        <rect
                          key={s.key}
                          x={x0 + colStart + j * 14}
                          y={y(v)}
                          width={12}
                          height={TOP + PLOT_H - y(v)}
                          className={solid ? "fill-foreground" : "fill-background stroke-foreground"}
                          strokeWidth={solid ? 0 : 1.5}
                        />
                      );
                    })}
                  <text x={x0 + group / 2} y={height - 6} textAnchor="middle" className="fill-muted-foreground font-mono text-[10px]">
                    {b.label}
                  </text>
                </g>
              );
            })}
            {/* The line on top of the hover bands, so they never hide it. */}
            {kind === "line" && drawn.map((s) => <Line key={s.key} series={s} x={(i) => LEFT + i * group + group / 2} y={y} />)}
          </svg>
        </div>
      )}
    </div>
  );
}

/** A 2 px line with square markers; a gap where a value is missing. */
function Line({ series, x, y }: { series: Series; x: (i: number) => number; y: (v: number) => number }) {
  const runs: string[][] = [[]];
  series.values.forEach((v, i) => {
    if (typeof v === "number") runs[runs.length - 1].push(`${x(i)},${y(v)}`);
    else if (runs[runs.length - 1].length) runs.push([]);
  });
  return (
    <g>
      {runs.filter((r) => r.length).map((r, k) => (
        <polyline key={k} points={r.join(" ")} fill="none" className="stroke-foreground" strokeWidth={2} />
      ))}
      {series.values.map((v, i) =>
        typeof v === "number" ? <rect key={i} x={x(i) - 4} y={y(v) - 4} width={8} height={8} className="fill-foreground stroke-background" strokeWidth={2} /> : null
      )}
    </g>
  );
}
