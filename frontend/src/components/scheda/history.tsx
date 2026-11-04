"use client";
import * as React from "react";
import { format } from "date-fns";
import { ArrowRight, History, Loader2 } from "lucide-react";
import type {
  FieldOccurrenceDTO,
  FieldValue,
  HistoryEntryDTO,
  HistoryKind,
  HistoryResponse,
  HistoryView,
  RepeatRowDTO,
  TemplateDTO,
} from "@/lib/contract";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatValue, type Option } from "@/components/scheda/fields/format";
import { GROUP_LABEL } from "@/components/pratiche/labels";

const TRANSVERSAL_LABEL = { noteOperative: "Note Operative", fatturabile: "Fatturabile", fatturato: "Fatturato" } as const;
const SOURCE_LABEL = { USER: null, SYSTEM: "Sistema", IMPORT: "Import" } as const;

const KIND_LABEL: Record<HistoryKind, string> = {
  FIELD: "Modifica",
  ROW_ADD: "Riga aggiunta",
  ROW_REMOVE: "Riga rimossa",
  ASSIGN: "Assegna",
  STATO: "Stato attività",
  ARCHIVE: "Archiviazione",
  RESTORE: "Ripristino",
  CREATE: "Creazione",
  REWORK: "Rilavorazione",
  RESUBMIT: "Ripresentazione totale",
  ALERT_OPEN: "Alert aperto",
  ALERT_CLOSE: "Alert chiuso",
  IMPORT: "Import",
  COMMENT_ADD: "Commento aggiunto",
  COMMENT_EDIT: "Commento modificato",
  COMMENT_DELETE: "Commento eliminato",
};

type Tab = HistoryView;

export function HistoryPanel({
  practiceId,
  iteration,
  template,
  repeats,
  load,
  optionsFor,
  revision,
}: {
  practiceId: string;
  iteration: number;
  /** Revision of the practice: a save or a row change reloads the first page. */
  revision?: number;
  template: TemplateDTO;
  /** Current rows, to number "Ciclo ARPA #n". */
  repeats: Record<string, RepeatRowDTO[]>;
  /** Value history and timeline are distinct (D-47): one server view each. */
  load: (id: string, iteration: number, page: number, view: HistoryView) => Promise<HistoryResponse>;
  optionsFor?: (o: FieldOccurrenceDTO) => Option[] | undefined;
}) {
  const [items, setItems] = React.useState<HistoryEntryDTO[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<Tab>("fields");

  // Only the latest request may write: a slower answer of the previous tab must not overwrite the current one.
  const latest = React.useRef(0);

  const fetchPage = React.useCallback(
    async (n: number, reset: boolean) => {
      const req = ++latest.current;
      setLoading(true);
      setError(null);
      try {
        const res = await load(practiceId, iteration, n, tab);
        if (req !== latest.current) return;
        setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
        setTotal(res.total);
        setPage(n);
      } catch (e) {
        if (req === latest.current) setError((e as Error).message);
      } finally {
        if (req === latest.current) setLoading(false);
      }
    },
    [load, practiceId, iteration, tab]
  );

  React.useEffect(() => {
    void fetchPage(1, true);
  }, [fetchPage, revision]);

  // MASTER label first: mirrors share the flowId and may be labelled differently.
  const byFlow = React.useMemo(() => {
    const map = new Map<string, FieldOccurrenceDTO>();
    for (const o of template.occurrences) {
      if (!o.flowId) continue;
      if (!map.has(o.flowId) || o.kind === "MASTER") map.set(o.flowId, o);
    }
    return map;
  }, [template]);
  const repeatLabel = React.useMemo(() => new Map(template.repeatGroups.map((r) => [r.key, r.label])), [template]);

  function rowName(e: HistoryEntryDTO): string | null {
    if (!e.repeat) return null;
    const label = repeatLabel.get(e.repeat) ?? e.repeat;
    const idx = (repeats[e.repeat] ?? []).findIndex((r) => r.rowId === e.rowId);
    return idx >= 0 ? `${label} #${idx + 1}` : `${label} (riga rimossa)`;
  }

  function valueText(e: HistoryEntryDTO, v: FieldValue | undefined): string {
    if (e.transversal) return v === null || v === undefined ? "" : String(v);
    const o = e.flowId ? byFlow.get(e.flowId) : undefined;
    if (!o) return v === null || v === undefined ? "" : JSON.stringify(v);
    return formatValue(o.dataType, v, optionsFor?.(o));
  }

  const shown = items;

  return (
    <div className="border border-border bg-card" data-testid="history-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider">
          <History className="h-4 w-4" /> Storico · iterazione {iteration}
        </div>
        <div role="tablist" className="inline-flex border border-border">
          {(
            [
              ["fields", "Modifiche ai campi"],
              ["events", "Attività"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              data-testid={`history-tab-${key}`}
              className={cn(
                "px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider",
                tab === key ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="px-4 py-6 text-sm text-status-error">{error}</p>
      ) : (
        <ol className="divide-y divide-border">
          {shown.length === 0 && !loading && (
            <li className="px-4 py-6 text-sm text-muted-foreground">Nessuna voce.</li>
          )}
          {shown.map((e) => {
            const o = e.flowId ? byFlow.get(e.flowId) : undefined;
            const row = rowName(e);
            return (
              <li key={e.id} className="grid grid-cols-1 gap-1 px-4 py-2.5 sm:grid-cols-[9rem_1fr]" data-testid={`history-${e.id}`}>
                <div className="font-mono text-[10px] tabular text-muted-foreground">
                  {format(new Date(e.timestamp), "dd/MM/yyyy HH:mm")}
                  <div className="truncate">{SOURCE_LABEL[e.source] ?? e.userName ?? "Sistema"}</div>
                </div>
                <div className="min-w-0 text-sm">
                  <span className="mr-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {KIND_LABEL[e.kind] ?? e.kind}
                  </span>
                  {e.kind === "FIELD" ? (
                    <>
                      <span className="font-medium">
                        {e.transversal
                          ? `${TRANSVERSAL_LABEL[e.transversal]}${e.noteGroup ? ` · ${GROUP_LABEL[e.noteGroup]}` : ""}`
                          : o?.label ?? e.flowId}
                      </span>
                      {row && <span className="text-muted-foreground"> · {row}</span>}
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-xs">
                        <span className="text-muted-foreground line-through">{valueText(e, e.oldValue) || "vuoto"}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span>{valueText(e, e.newValue) || "vuoto"}</span>
                      </div>
                    </>
                  ) : (
                    <span>{e.detail ?? row ?? ""}</span>
                  )}
                  {e.kind === "FIELD" && e.detail && (
                    <div className="font-mono text-[10px] text-muted-foreground">{e.detail}</div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {items.length} di {total} voci caricate
        </span>
        {items.length < total && (
          <Button variant="outline" size="sm" disabled={loading} onClick={() => void fetchPage(page + 1, false)} data-testid="history-more">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />} Carica altre
          </Button>
        )}
      </div>
    </div>
  );
}
