"use client";
import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { format } from "date-fns";
import { Search, Filter, ChevronLeft, ChevronRight, AlertTriangle, GitBranch } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DateInput } from "@/components/scheda/fields/date-input";
import { useAssistantPageContext } from "@/components/assistente/assistant-store";
import { filtersFromParams, filtersToParams, type ListFilters } from "@/components/pratiche/list-url";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  STATI_ATTIVITA,
  type GroupId,
  type PracticeListResponse,
  type PracticeScope,
  type PracticeSort,
  type PraticaSummaryDTO,
  type SelectValue as SelectValueDTO,
  type StatoAttivita,
  type TemplateId,
  type TemplateSummaryDTO,
} from "@/lib/contract";
import { StatoBadge } from "@/components/pratiche/stato-badge";
import { CreatePracticeDialog } from "@/components/pratiche/create-practice-dialog";
import { downloadExport } from "@/components/statistiche/export-csv";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { GROUP_LABEL, GROUP_ORDER, STATO_LABEL } from "@/components/pratiche/labels";
import { listPratiche, listTemplates } from "@/components/pratiche/data-source";
import { LoadError, loadErrorMessage } from "@/components/layout/load-error";

const ALL = "all";

const SORT_LABEL: Record<PracticeSort, string> = {
  open_first: "Aperte prima",
  updated_desc: "Ultimo aggiornamento",
  created_desc: "Data di creazione",
};

/** Until the lists API (B6) is wired, a select value shows its code. */
function selectText(v: SelectValueDTO | null | undefined): string {
  if (!v) return "—";
  return v.otherText ? `${v.otherText} (Altro)` : v.code;
}

/**
 * `canCreateIn`: templates where the user may create practices (MeDTO.canCreate, D-20).
 * `mode = "archive"`: archived practices only (D-23, D-28), read-only.
 */
export function PraticheList({
  canCreateIn = [],
  mode = "active",
}: {
  canCreateIn?: TemplateId[];
  mode?: "active" | "archive";
}) {
  const archive = mode === "archive";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The filters live in the address (list-url.ts): a filtered list can be shared
  // with a link. The template is read from it on every render; the other filters
  // are local state written back to it, and reset when the address changes from
  // outside (a link, the sidebar, back/forward).
  const [initial] = React.useState(() => filtersFromParams(searchParams, archive));
  const templateParam = filtersFromParams(searchParams, archive).templateId ?? null;

  const [templates, setTemplates] = React.useState<TemplateSummaryDTO[]>([]);
  const [q, setQ] = React.useState(initial.q ?? "");
  const [stato, setStato] = React.useState<string>(initial.stato ?? ALL);
  const [scope, setScope] = React.useState<PracticeScope>(initial.scope);
  const [sort, setSort] = React.useState<PracticeSort>(initial.sort);
  // Creation date range (D-129), both ends included.
  const [from, setFrom] = React.useState<string | null>(initial.from ?? null);
  const [to, setTo] = React.useState<string | null>(initial.to ?? null);
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<PracticeListResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    listTemplates().then(setTemplates).catch(() => setTemplates([]));
  }, []);

  const templateLabel = React.useMemo(
    () => new Map(templates.map((t) => [t.id, t.label])),
    [templates]
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listPratiche({
        templateId: templateParam ?? undefined,
        stato: stato === ALL ? undefined : (stato as StatoAttivita),
        archived: archive,
        q: q.trim() || undefined,
        from: from ?? undefined,
        to: to ?? undefined,
        scope,
        sort,
        page,
      });
      setData(res);
    } catch (e) {
      setError(loadErrorMessage(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [templateParam, stato, q, scope, sort, page, archive, from, to]);

  // Debounce search + filters.
  React.useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  // Reset to page 1 when filters change.
  React.useEffect(() => {
    setPage(1);
  }, [templateParam, stato, q, scope, sort, from, to]);

  const filtersFor = (templateId: TemplateId | null): ListFilters => ({
    templateId: templateId ?? undefined,
    stato: stato === ALL ? undefined : (stato as StatoAttivita),
    q,
    from: from ?? undefined,
    to: to ?? undefined,
    scope,
    sort,
  });
  const urlQs = filtersToParams(filtersFor(templateParam), archive).toString();
  // Last address this list wrote (or read): anything else came from outside.
  const written = React.useRef(searchParams.toString());
  const go = React.useCallback(
    (qs: string) => {
      written.current = qs;
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router]
  );

  // State → address, debounced like the search so typing does not flood it.
  React.useEffect(() => {
    if (urlQs === written.current) return;
    const base = written.current;
    const t = setTimeout(() => {
      if (written.current === base) go(urlQs);
    }, 250);
    return () => clearTimeout(t);
  }, [urlQs, go]);

  // Address → state when it changes from outside.
  const addressQs = searchParams.toString();
  React.useEffect(() => {
    if (addressQs === written.current) return;
    written.current = addressQs;
    const f = filtersFromParams(new URLSearchParams(addressQs), archive);
    setQ(f.q ?? "");
    setStato(f.stato ?? ALL);
    setScope(f.scope);
    setSort(f.sort);
    setFrom(f.from ?? null);
    setTo(f.to ?? null);
  }, [addressQs, archive]);

  // The template lives in the URL so the sidebar entries and the filter agree.
  function setTemplate(value: string) {
    go(filtersToParams(filtersFor(value === ALL ? null : (value as TemplateId)), archive).toString());
  }

  // Context of the next assistant question: the filters on screen (page and sort excluded).
  const assistantQuery = {
    templateId: templateParam ?? undefined,
    stato: stato === ALL ? undefined : (stato as StatoAttivita),
    archived: archive || undefined,
    q: q.trim() || undefined,
    from: from ?? undefined,
    to: to ?? undefined,
    scope,
  };
  useAssistantPageContext({
    context: { page: "list", templateId: assistantQuery.templateId, listQuery: assistantQuery },
    label: [
      `${archive ? "Archivio" : "Elenco"}: ${templateParam ? templateParam.replace(/_/g, " / ") : "tutti i clienti"}`,
      assistantQuery.stato ? `stato ${STATO_LABEL[assistantQuery.stato]}` : "",
      assistantQuery.q ? `ricerca "${assistantQuery.q}"` : "",
    ]
      .filter(Boolean)
      .join(" · "),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const showTemplateColumn = !templateParam;
  const colCount = showTemplateColumn ? 8 : 7;

  return (
    <div className="space-y-6">

      <div className="flex flex-wrap items-center justify-end gap-2">
        {/* Everyone who sees a client's list may export what they see (D-128). */}
        <ExportButton
          templateId={templateParam}
          query={{
            stato: stato === ALL ? undefined : (stato as StatoAttivita),
            archived: archive,
            q: q.trim() || undefined,
            from: from ?? undefined,
            to: to ?? undefined,
            scope: archive ? undefined : scope,
          }}
        />
        {canCreateIn.length > 0 && !archive && <CreatePracticeDialog templates={templates} allowed={canCreateIn} />}
      </div>

      {/* Filter bar */}
      <div className="border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Filtri</span>
        </div>
        <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 lg:col-span-2">
            <Label htmlFor="pratiche-search">Cerca</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="pratiche-search"
                placeholder="Codice Sito, Nome Sito o Codice G7…"
                className="pl-9"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                data-testid="pratiche-search-input"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <Select value={templateParam ?? ALL} onValueChange={setTemplate}>
              <SelectTrigger data-testid="filter-template">
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
            <Label>Stato attività</Label>
            <Select value={stato} onValueChange={setStato}>
              <SelectTrigger data-testid="filter-stato">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tutti gli stati</SelectItem>
                {STATI_ATTIVITA.map((s) => (
                  <SelectItem key={s} value={s}>{STATO_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pratiche-from">Creata dal</Label>
            <DateInput
              id="pratiche-from"
              value={from}
              onChange={setFrom}
              validate={(v) => (to && v > to ? "La data iniziale non può essere dopo quella finale" : null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pratiche-to">Creata fino al</Label>
            <DateInput
              id="pratiche-to"
              value={to}
              onChange={setTo}
              validate={(v) => (from && v < from ? "La data finale non può essere prima di quella iniziale" : null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Ordina per</Label>
            <Select value={sort} onValueChange={(v) => setSort(v as PracticeSort)}>
              <SelectTrigger data-testid="filter-sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABEL) as PracticeSort[]).map((s) => (
                  <SelectItem key={s} value={s}>{SORT_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!archive && (
          <div className="space-y-1.5">
            <Label htmlFor="pratiche-scope">Anche non assegnate</Label>
            <div className="flex h-10 items-center gap-3">
              <Switch
                id="pratiche-scope"
                checked={scope === "all"}
                onCheckedChange={(on) => setScope(on ? "all" : "assigned")}
                data-testid="filter-scope"
              />
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {scope === "all" ? "Tutte" : "Assegnate al mio gruppo"}
              </span>
            </div>
          </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Codice Sito</TableHead>
              <TableHead>Nome Sito</TableHead>
              {showTemplateColumn && <TableHead>Cliente</TableHead>}
              <TableHead>Codice G7</TableHead>
              <TableHead>Committente</TableHead>
              <TableHead>Stato attività</TableHead>
              <TableHead>Avanzamento</TableHead>
              <TableHead>{archive ? "Archiviata il" : "Aggiornata"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: colCount }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : error ? (
              <TableRow>
                <TableCell colSpan={colCount} className="py-12 text-center">
                  <div className="font-heading text-2xl font-black tracking-tight text-status-error">
                    ERRORE DI CARICAMENTO
                  </div>
                  <LoadError message={error} onRetry={() => void load()} className="mx-auto max-w-xl justify-center" testId="pratiche-load-error" />
                </TableCell>
              </TableRow>
            ) : data && data.items.length > 0 ? (
              data.items.map((p) => (
                <PraticaRow
                  key={p.id}
                  p={p}
                  templateLabel={showTemplateColumn ? templateLabel.get(p.templateId) ?? p.templateId : null}
                  archive={archive}
                  onOpen={() => router.push(`/pratiche/${p.id}`)}
                />
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={colCount} className="py-16 text-center">
                  <div className="font-heading text-2xl font-black tracking-tight text-muted-foreground">
                    {archive ? "NESSUNA PRATICA ARCHIVIATA" : "NESSUNA PRATICA TROVATA"}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">Aggiorna i filtri e riprova.</p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {data && (
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground" data-testid="pratiche-pagination-info">
            {data.total} {data.total === 1 ? "pratica" : "pratiche"} · Pagina {data.page}/{totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={data.page <= 1}
              onClick={() => setPage((n) => Math.max(1, n - 1))}
              data-testid="pratiche-pagination-prev"
            >
              <ChevronLeft className="h-4 w-4" /> Precedente
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={data.page >= totalPages}
              onClick={() => setPage((n) => n + 1)}
              data-testid="pratiche-pagination-next"
            >
              Successiva <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PraticaRow({
  p,
  templateLabel,
  archive,
  onOpen,
}: {
  p: PraticaSummaryDTO;
  templateLabel: string | null;
  archive: boolean;
  onOpen: () => void;
}) {

  return (
    <TableRow className="cursor-pointer" onClick={onOpen} data-testid={`pratica-row-${p.id}`}>
      <TableCell className="font-mono font-medium tabular">
        {/* The alert mark may go under the code: the row must not push the last columns out of view. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="whitespace-nowrap">{p.codiceSito}</span>
          {p.openAlerts > 0 && (
            <span
              className="inline-flex items-center gap-1 border border-status-error px-1 font-mono text-[10px] text-status-error"
              title={`${p.openAlerts} alert aperti`}
            >
              <AlertTriangle className="h-3 w-3" /> {p.openAlerts}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          {p.nomeSito}
          {p.originPracticeId && (
            <span title="Rilavorazione" className="text-muted-foreground">
              <GitBranch className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      </TableCell>
      {templateLabel !== null && <TableCell className="font-mono text-xs">{templateLabel}</TableCell>}
      <TableCell className="whitespace-nowrap font-mono text-xs tabular">
        {p.codiceG7 ?? "—"}
        {p.iteration > 1 && (
          <span className="ml-2 text-muted-foreground" title={`Iterazione ${p.iteration}`}>
            it. {p.iteration}
          </span>
        )}
      </TableCell>
      <TableCell className="font-mono text-xs">{selectText(p.committente)}</TableCell>
      <TableCell><StatoBadge stato={p.statoAttivita} /></TableCell>
      <TableCell><GroupProgress p={p} /></TableCell>
      <TableCell className="whitespace-nowrap font-mono text-xs tabular text-muted-foreground">
        {format(new Date(archive && p.archivedAt ? p.archivedAt : p.updatedAt), "dd/MM/yyyy")}
      </TableCell>
    </TableRow>
  );
}

/** Compact labels of the progress cells: the full name stays in the tooltip. */
const SHORT_GROUP_LABEL: Record<GroupId, string> = { PM_PERMESSI: "PM/Perm.", UT_PE: "UT/PE", AIE: "AIE", DL: "DL" };

/** Secondary progress view (G §9): one cell per group; groups that have not
 *  received an Assegna yet are shown disabled (D-21). */
function GroupProgress({ p }: { p: PraticaSummaryDTO }) {
  return (
    <div className="flex items-end gap-2" data-testid={`pratica-progress-${p.id}`}>
      {GROUP_ORDER.map((g: GroupId) => {
        const enabled = p.enabledGroups.includes(g);
        const { filled, total } = p.progress[g] ?? { filled: 0, total: 0 };
        const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
        return (
          <div
            key={g}
            className={enabled ? "w-14" : "w-14 opacity-40"}
            title={`${GROUP_LABEL[g]}: ${enabled ? `${filled}/${total}` : "non ancora assegnato"}`}
          >
            <div className="truncate font-mono text-[9px] uppercase text-muted-foreground">{SHORT_GROUP_LABEL[g]}</div>
            <div className="mt-0.5 h-1.5 w-full bg-border">
              {enabled && <div className="h-1.5 bg-primary" style={{ width: `${pct}%` }} aria-hidden />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** CSV export (§11): needs one client; same filters as the list. */
function ExportButton({
  templateId,
  query,
}: {
  templateId: TemplateId | null;
  query: { stato?: StatoAttivita; archived: boolean; q?: string; from?: string; to?: string; scope?: PracticeScope };
}) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      variant="outline"
      disabled={!templateId || busy}
      title={templateId ? "Esporta le pratiche filtrate in CSV (Excel)" : "Scegli un cliente per esportare"}
      onClick={async () => {
        if (!templateId) return;
        setBusy(true);
        try {
          await downloadExport({ templateId, ...query });
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
      data-testid="export-csv"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Esporta CSV
    </Button>
  );
}
