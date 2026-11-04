"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import type { TemplateId, TemplateSummaryDTO } from "@/lib/contract";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { listTemplates } from "@/components/pratiche/data-source";
import { DateInput } from "@/components/scheda/fields/date-input";
import { LoadError, loadErrorMessage } from "@/components/layout/load-error";
import { FermeBlock, StatiBlock } from "@/components/andamento/blocks";
import { FlussiBlock, Riepilogo, RilavorazioniBlock } from "@/components/andamento/flussi-blocks";
import { GruppiBlock, ScadenzeBlock } from "@/components/andamento/gruppi-scadenze";
import {
  MAX_WEEKS,
  andamentoHref,
  presetRange,
  weeksIn,
  type AndamentoFilters,
  type Confronto,
  type Passo,
  type Preset,
} from "@/components/andamento/andamento-url";

const ALL = "all";

/**
 * Andamento (D-191, UX note): where practices stop, whether the work keeps
 * pace, how it goes over time. States, groups and clients, never people.
 * The filters live in the address (andamento-url.ts) and are written back on
 * every change, so a view can be bookmarked.
 */
export function AndamentoView({ initial }: { initial: AndamentoFilters }) {
  const router = useRouter();
  const [filters, setFilters] = React.useState<AndamentoFilters>(initial);
  const [templates, setTemplates] = React.useState<TemplateSummaryDTO[]>([]);
  const [templatesError, setTemplatesError] = React.useState<string | null>(null);

  const loadTemplates = React.useCallback(() => {
    setTemplatesError(null);
    listTemplates()
      .then(setTemplates)
      .catch((e) => setTemplatesError(loadErrorMessage(e)));
  }, []);
  React.useEffect(loadTemplates, [loadTemplates]);

  function update(patch: Partial<AndamentoFilters>) {
    const next = { ...filters, ...patch };
    // More than 26 weekly columns are unreadable: back to months (UX note §2).
    if (next.passo === "settimana" && weeksIn(next.from, next.to) > MAX_WEEKS) next.passo = "mese";
    setFilters(next);
    router.replace(andamentoHref(next), { scroll: false });
  }

  const tooManyWeeks = weeksIn(filters.from, filters.to) > MAX_WEEKS;
  const labelOf = (id: TemplateId) => templates.find((t) => t.id === id)?.label ?? id;

  return (
    <div className="space-y-6" data-testid="andamento-view">
      {templatesError && (
        <LoadError message={templatesError} context="Elenco dei clienti" onRetry={loadTemplates} className="border border-border bg-card" testId="andamento-templates-error" />
      )}

      <div className="grid grid-cols-1 gap-4 border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="andamento-filters">
        <div className="space-y-1.5">
          <Label>Cliente</Label>
          <Select value={filters.templateId ?? ALL} onValueChange={(v) => update({ templateId: v === ALL ? null : (v as TemplateId) })}>
            <SelectTrigger data-testid="andamento-template">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tutti i clienti</SelectItem>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="andamento-from">Da</Label>
          <DateInput id="andamento-from" value={filters.from} onChange={(v) => v && v <= filters.to && update({ from: v })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="andamento-to">A</Label>
          <DateInput id="andamento-to" value={filters.to} onChange={(v) => v && v >= filters.from && update({ to: v })} />
        </div>
        <div className="space-y-1.5">
          <span className="text-sm font-medium leading-none">Periodo</span>
          <Segmented
            label="Periodo"
            options={[
              ["mese", "Mese"],
              ["trimestre", "Trimestre"],
              ["anno", "Anno"],
            ]}
            onPick={(p) => update(presetRange(p as Preset))}
            testId="andamento-preset"
          />
        </div>
        <div className="space-y-1.5">
          <span className="text-sm font-medium leading-none">Passo</span>
          <Segmented
            label="Passo"
            options={[
              ["settimana", "Settimana", tooManyWeeks],
              ["mese", "Mese"],
            ]}
            value={filters.passo}
            onPick={(p) => update({ passo: p as Passo })}
            testId="andamento-passo"
          />
          {tooManyWeeks && <p className="text-[11px] text-muted-foreground">Per settimana fino a {MAX_WEEKS} settimane.</p>}
        </div>
        <div className="space-y-1.5 sm:col-span-2 xl:col-span-3">
          <span className="text-sm font-medium leading-none">Confronto</span>
          <Segmented
            label="Confronto"
            options={[
              ["precedente", "Periodo precedente"],
              ["anno", "Stesso periodo dell'anno prima"],
            ]}
            value={filters.confronto}
            onPick={(c) => update({ confronto: c as Confronto })}
            testId="andamento-confronto"
          />
        </div>
      </div>

      <Riepilogo filters={filters} />

      {/* Blocks in the order of the three questions (UX note §3); data with contract §15.3. */}
      <Section title="Dove si fermano le pratiche" testId="andamento-dove">
        <StatiBlock filters={filters} />
        <GruppiBlock filters={filters} />
        <FermeBlock filters={filters} labelOf={labelOf} />
      </Section>
      <Section title="Il lavoro tiene il passo?" testId="andamento-passo-lavoro">
        <FlussiBlock filters={filters} />
      </Section>
      <Section title="Rilavorazioni e scadenze" testId="andamento-rilavorazioni-scadenze">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <RilavorazioniBlock filters={filters} />
          <ScadenzeBlock filters={filters} />
        </div>
      </Section>
    </div>
  );
}

/** A row of exclusive buttons (period presets, step, comparison). */
function Segmented({
  label,
  options,
  value,
  onPick,
  testId,
}: {
  label: string;
  options: Array<[string, string, boolean?]>;
  value?: string;
  onPick: (v: string) => void;
  testId: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap border border-border" data-testid={testId}>
      {options.map(([v, text, disabled]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === undefined ? undefined : value === v}
          disabled={disabled}
          onClick={() => onPick(v)}
          className={cn(
            "flex-1 whitespace-nowrap px-3 py-2 font-mono text-xs uppercase tracking-wider disabled:opacity-40",
            value === v ? "bg-foreground text-background" : "hover:bg-accent"
          )}
          data-testid={`${testId}-${v}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function Section({ title, testId, children }: { title: string; testId: string; children?: React.ReactNode }) {
  return (
    <section className="space-y-3" data-testid={testId}>
      <h2 className="border-b-2 border-foreground pb-2 font-heading text-xl font-black tracking-tight">{title}</h2>
      {children ?? <p className="text-sm text-muted-foreground">In preparazione.</p>}
    </section>
  );
}
