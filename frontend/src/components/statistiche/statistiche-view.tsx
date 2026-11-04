"use client";
import * as React from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  GROUP_IDS,
  STATI_ATTIVITA,
  TEMPLATE_IDS,
  type GroupId,
  type StatsDTO,
  type TemplateId,
  type TemplateSummaryDTO,
  type WorkloadItemDTO,
} from "@/lib/contract";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { listTemplates } from "@/components/pratiche/data-source";
import { GROUP_LABEL, STATO_LABEL } from "@/components/pratiche/labels";
import { StatoBadge } from "@/components/pratiche/stato-badge";
import { DateInput } from "@/components/scheda/fields/date-input";
import { formatDecimal } from "@/components/scheda/fields/format";
import { ROLE_LABEL } from "@/components/configurazione/users-admin";
import { defaultPeriod, loadStats, loadWorkload } from "@/components/statistiche/stats-source";
import { useAssistantPageContext } from "@/components/assistente/assistant-store";
import { LoadError, loadErrorMessage } from "@/components/layout/load-error";
import type { StatsInitial } from "@/components/statistiche/stats-url";

const ALL = "all";

type Tab = "stats" | "workload";

/** Who sees what (D-23); `null` = everything (ADMIN). */
export interface StatsAccess {
  statsTemplates: TemplateId[] | null;
  workload: Partial<Record<TemplateId, GroupId[] | "all">> | null;
}

/**
 * Statistics (§9) and workload (§10). Never a ranking (G §17.13): people are
 * listed by name; bars only show proportions.
 */
export function StatisticheView({ access, initial = {} }: { access: StatsAccess; initial?: StatsInitial }) {
  const [templates, setTemplates] = React.useState<TemplateSummaryDTO[]>([]);
  const canStats = access.statsTemplates === null || access.statsTemplates.length > 0;
  const [tab, setTab] = React.useState<Tab>(canStats && initial.tab !== "workload" ? "stats" : "workload");
  const [templatesError, setTemplatesError] = React.useState<string | null>(null);

  const loadTemplates = React.useCallback(() => {
    setTemplatesError(null);
    listTemplates()
      .then(setTemplates)
      .catch((e) => setTemplatesError(loadErrorMessage(e)));
  }, []);
  React.useEffect(loadTemplates, [loadTemplates]);

  const label = (id: TemplateId) => templates.find((t) => t.id === id)?.label ?? id;

  return (
    <div className="space-y-6" data-testid="statistiche-view">
      {templatesError && (
        <LoadError message={templatesError} onRetry={loadTemplates} className="border border-border bg-card" testId="stats-templates-error" />
      )}
      <div role="tablist" className="inline-flex border border-border">
        {(
          [
            ["stats", "Statistiche", canStats],
            ["workload", "Carichi di lavoro", true],
          ] as const
        )
          .filter(([, , show]) => show)
          .map(([key, text]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              data-testid={`stats-tab-${key}`}
              className={cn(
                "px-4 py-2 font-mono text-xs uppercase tracking-wider",
                tab === key ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent"
              )}
            >
              {text}
            </button>
          ))}
      </div>
      {tab === "stats" ? (
        <StatsTab templates={templates} allowed={access.statsTemplates} label={label} initial={initial} />
      ) : (
        <WorkloadTab templates={templates} templatesFailed={templatesError !== null} scope={access.workload} label={label} initial={initial} />
      )}
    </div>
  );
}

// ─── Statistics ─────────────────────────────────────────────────────────────

function StatsTab({
  templates,
  allowed,
  label,
  initial: start,
}: {
  templates: TemplateSummaryDTO[];
  allowed: TemplateId[] | null;
  label: (id: TemplateId) => string;
  initial: StatsInitial;
}) {
  const visible = templates.filter((t) => allowed === null || allowed.includes(t.id));
  // Period from the address (stats-url.ts), completed with the default one.
  const initial = React.useMemo(() => {
    const d = defaultPeriod();
    const from = start.from ?? d.from;
    const to = start.to ?? d.to;
    return from <= to ? { from, to } : { from: start.from ?? to, to: start.to ?? from };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [templateId, setTemplateId] = React.useState<string>(() => {
    if (start.templateId && (allowed === null || allowed.includes(start.templateId))) return start.templateId;
    return allowed && allowed.length === 1 ? allowed[0] : ALL;
  });
  const [from, setFrom] = React.useState<string>(initial.from);
  const [to, setTo] = React.useState<string>(initial.to);
  const [stats, setStats] = React.useState<StatsDTO | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const statsTemplate = templateId === ALL ? undefined : (templateId as TemplateId);
  useAssistantPageContext({
    context: { page: "stats", templateId: statsTemplate },
    label: `Statistiche: ${statsTemplate ? label(statsTemplate) : "tutti i clienti"}`,
  });

  React.useEffect(() => {
    let alive = true;
    setStats(null);
    setLoadError(null);
    loadStats({ templateId: templateId === ALL ? undefined : (templateId as TemplateId), from, to })
      .then((s) => alive && setStats(s))
      .catch((e) => alive && setLoadError(loadErrorMessage(e)));
    return () => {
      alive = false;
    };
  }, [templateId, from, to, attempt]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 border border-border bg-card p-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Gestore</Label>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger data-testid="stats-template">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(allowed === null || allowed.length > 1) && <SelectItem value={ALL}>Tutti i miei gestori</SelectItem>}
              {visible.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="stats-from">Da</Label>
          <DateInput id="stats-from" value={from} onChange={(v) => v && v <= to && setFrom(v)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="stats-to">A</Label>
          <DateInput id="stats-to" value={to} onChange={(v) => v && v >= from && setTo(v)} />
        </div>
      </div>

      {loadError ? (
        <LoadError message={loadError} onRetry={() => setAttempt((n) => n + 1)} className="border border-border bg-card" testId="stats-load-error" />
      ) : !stats ? (
        <p className="font-mono text-xs text-muted-foreground">Caricamento…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px border border-border bg-border md:grid-cols-3 xl:grid-cols-6" data-testid="stats-tiles">
            <Tile label="Pratiche attive" value={stats.activeTotal} />
            <Tile label="Alert aperti" value={stats.alertsOpen} />
            <Tile label="Alert scaduti" value={stats.alertsOverdue} tone={stats.alertsOverdue > 0 ? "error" : undefined} hint="Aperti oltre la data di trigger" />
            <Tile label="Scadenze nei 7 giorni" value={stats.upcoming.count} />
            <Tile
              label="Terminate · KO nel periodo"
              value={`${stats.closedInPeriod.terminato} · ${stats.closedInPeriod.ko}`}
              hint={`${format(new Date(stats.period.from), "dd/MM/yyyy")} – ${format(new Date(stats.period.to), "dd/MM/yyyy")}`}
            />
            <Tile
              label="Assegnazione → Terminato"
              value={stats.leadTime.meanDays === null ? "—" : `${formatDecimal(Math.round(stats.leadTime.meanDays * 10) / 10)} gg`}
              hint={
                stats.leadTime.medianDays === null
                  ? "Nessuna pratica terminata nel periodo"
                  : `media · mediana ${formatDecimal(stats.leadTime.medianDays)} gg · ${stats.leadTime.count} pratiche`
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <BarTable
              title="Per Stato attività"
              note="Pratiche non archiviate"
              rows={STATI_ATTIVITA.map((s) => ({ key: s, label: <StatoBadge stato={s} wrap />, text: STATO_LABEL[s], value: stats.byStato[s] ?? 0 }))}
              testId="stats-by-stato"
            />
            <div className="space-y-6">
              <BarTable
                title="Per gestore"
                note="Pratiche attive"
                // Every client the user sees, zero included: the DTO leaves out clients without active practices.
                rows={(statsTemplate ? [statsTemplate] : TEMPLATE_IDS.filter((t) => allowed === null || allowed.includes(t))).map((t) => ({
                  key: t,
                  text: label(t),
                  value: stats.byTemplate[t] ?? 0,
                }))}
                testId="stats-by-template"
              />
              <BarTable
                title="Per gruppo"
                note="Pratiche attive in cui il gruppo ha ricevuto l'Assegna"
                rows={GROUP_IDS.map((g) => ({ key: g, text: GROUP_LABEL[g], value: stats.byGroup[g] ?? 0 }))}
                testId="stats-by-group"
              />
            </div>
            <BarTable
              title="Per assegnatario"
              note="Pratiche attive in cui la persona compare in un campo utente · in ordine di nome"
              rows={stats.byAssignee.map((a) => ({ key: a.userId, text: a.name, value: a.count }))}
              testId="stats-by-assignee"
            />
            <section className="border border-border bg-card" data-testid="stats-upcoming">
              <header className="border-b border-border px-4 py-2.5">
                <h2 className="font-mono text-xs uppercase tracking-wider">Scadenze nei prossimi 7 giorni</h2>
              </header>
              {stats.upcoming.items.length === 0 ? (
                <p className="px-4 py-4 text-sm text-muted-foreground">Nessuna scadenza.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {stats.upcoming.items.map((u) => (
                    <li key={`${u.practiceId}-${u.rule}-${u.dueAt}`} className="flex items-baseline justify-between gap-3 px-4 py-2 text-sm">
                      <span className="min-w-0">
                        {/* D-193: Direzione sees practices of clients it does not open; then no link (a 404). The server always sends canOpen. */}
                        {u.canOpen === false ? (
                          <span className="font-mono font-medium" data-testid={`upcoming-${u.practiceId}`}>{u.codiceSito}</span>
                        ) : (
                          <Link href={`/pratiche/${u.practiceId}`} className="font-mono font-medium hover:underline" data-testid={`upcoming-${u.practiceId}`}>
                            {u.codiceSito}
                          </Link>
                        )}
                        <span className="ml-2 font-mono text-[10px] uppercase text-muted-foreground">{label(u.templateId)}</span>
                        <span className="block truncate text-xs text-muted-foreground">{u.label}</span>
                      </span>
                      <span className="shrink-0 font-mono text-xs tabular">{format(new Date(u.dueAt), "dd/MM/yyyy")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, hint, tone }: { label: string; value: number | string; hint?: string; tone?: "error" }) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-heading text-3xl font-black tabular tracking-tight", tone === "error" && "text-status-error")}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** One measure per row; the bar shows the share of the largest value (not an order). */
function BarTable({
  title,
  note,
  rows,
  testId,
}: {
  title: string;
  note?: string;
  rows: { key: string; text: string; label?: React.ReactNode; value: number }[];
  testId: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="border border-border bg-card" data-testid={testId}>
      <header className="border-b border-border px-4 py-2.5">
        <h2 className="font-mono text-xs uppercase tracking-wider">{title}</h2>
        {note && <p className="text-[11px] text-muted-foreground">{note}</p>}
      </header>
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">Nessun dato.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-border last:border-0" title={`${r.text}: ${r.value}`}>
                <td className="w-1/2 px-4 py-1.5">{r.label ?? r.text}</td>
                <td className="px-2 py-1.5">
                  <div className="h-2 w-full bg-border" aria-hidden>
                    <div className="h-2 bg-foreground" style={{ width: `${(r.value / max) * 100}%` }} />
                  </div>
                </td>
                <td className="w-14 px-4 py-1.5 text-right font-mono tabular">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ─── Workload ───────────────────────────────────────────────────────────────

function WorkloadTab({
  templates,
  templatesFailed,
  scope,
  label,
  initial: start,
}: {
  templates: TemplateSummaryDTO[];
  /** The clients could not be read (the page shows why and "Riprova"). */
  templatesFailed: boolean;
  scope: StatsAccess["workload"];
  label: (id: TemplateId) => string;
  initial: StatsInitial;
}) {
  const allowedTemplates = templates.filter((t) => scope === null || scope[t.id] !== undefined);
  // Template and group from the address, only if the user may see them (the group is re-checked below).
  const [templateId, setTemplateId] = React.useState<TemplateId | null>(() =>
    start.templateId && (scope === null || scope[start.templateId] !== undefined) ? start.templateId : null
  );
  const groupsFor = (t: TemplateId): GroupId[] => {
    const s = scope === null ? "all" : scope[t];
    return s === "all" || s === undefined ? [...GROUP_IDS] : s;
  };
  const allGroups = templateId !== null && (scope === null || scope[templateId] === "all");
  const [group, setGroup] = React.useState<string>(() => (templateId !== null && start.group ? start.group : ALL));
  useAssistantPageContext({
    context: { page: "stats", templateId: templateId ?? undefined },
    label: `Carichi di lavoro${templateId ? `: ${label(templateId)}` : ""}`,
  });
  const [items, setItems] = React.useState<WorkloadItemDTO[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    if (templateId === null && allowedTemplates.length > 0) setTemplateId(allowedTemplates[0].id);
  }, [allowedTemplates, templateId]);

  React.useEffect(() => {
    if (templateId === null) return;
    // A team leader always asks for one of their groups.
    if (!allGroups && (group === ALL || !groupsFor(templateId).includes(group as GroupId))) {
      setGroup(groupsFor(templateId)[0]);
      return;
    }
    let alive = true;
    setItems(null);
    setLoadError(null);
    loadWorkload(templateId, group === ALL ? undefined : (group as GroupId))
      .then((r) => alive && setItems(r))
      .catch((e) => alive && setLoadError(loadErrorMessage(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, group, allGroups, attempt]);

  if (allowedTemplates.length === 0 && templates.length > 0) {
    return <p className="text-sm text-muted-foreground">Non hai carichi di lavoro da consultare.</p>;
  }
  const max = Math.max(1, ...(items ?? []).map((i) => i.activePractices));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 border border-border bg-card p-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Gestore</Label>
          <Select value={templateId ?? undefined} onValueChange={(v) => setTemplateId(v as TemplateId)}>
            <SelectTrigger data-testid="workload-template">
              <SelectValue placeholder="Seleziona…" />
            </SelectTrigger>
            <SelectContent>
              {allowedTemplates.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Gruppo</Label>
          <Select value={group} onValueChange={setGroup}>
            <SelectTrigger data-testid="workload-group">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allGroups && <SelectItem value={ALL}>Tutti i gruppi</SelectItem>}
              {templateId &&
                groupsFor(templateId).map((g) => (
                  <SelectItem key={g} value={g}>{GROUP_LABEL[g]}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <p className="self-end text-xs text-muted-foreground">
          Pratiche attive in cui la persona compare in un campo utente del suo ruolo. In ordine di nome: non è una classifica.
        </p>
      </div>

      <div className="overflow-x-auto border border-border bg-card" data-testid="workload-table">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2 font-medium">Nome</th>
              <th className="px-4 py-2 font-medium">Ruolo</th>
              <th className="px-4 py-2 font-medium">Pratiche attive</th>
              <th className="px-4 py-2 font-medium">Per stato</th>
            </tr>
          </thead>
          <tbody>
            {loadError ? (
              <tr>
                <td colSpan={4}>
                  <LoadError message={loadError} onRetry={() => setAttempt((n) => n + 1)} testId="workload-load-error" />
                </td>
              </tr>
            ) : templateId === null && templatesFailed ? (
              <tr>
                <td colSpan={4} className="px-4 py-4 text-muted-foreground">Gestori non disponibili.</td>
              </tr>
            ) : items === null ? (
              <tr>
                <td colSpan={4} className="px-4 py-4 font-mono text-xs text-muted-foreground">Caricamento…</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-4 text-muted-foreground">Nessun utente.</td>
              </tr>
            ) : (
              items.map((i) => (
                <tr key={`${i.userId}-${i.group}-${i.role}`} className="border-b border-border align-top last:border-0" data-testid={`workload-${i.userId}`}>
                  <td className="px-4 py-2 font-medium">{i.name}</td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {ROLE_LABEL[i.role]} · {GROUP_LABEL[i.group]}
                    {templateId === null ? "" : <span className="sr-only"> {label(i.templateId)}</span>}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 bg-border" aria-hidden>
                        <div className="h-2 bg-foreground" style={{ width: `${(i.activePractices / max) * 100}%` }} />
                      </div>
                      <span className="font-mono tabular">{i.activePractices}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {STATI_ATTIVITA.filter((s) => (i.byStato[s] ?? 0) > 0).map((s) => (
                        <span key={s} className="border border-border px-1.5 font-mono text-[10px] uppercase">
                          {STATO_LABEL[s]} {i.byStato[s]}
                        </span>
                      ))}
                      {STATI_ATTIVITA.every((s) => !i.byStato[s]) && <span className="text-muted-foreground">—</span>}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
