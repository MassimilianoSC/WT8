"use client";
import * as React from "react";
import { toast } from "sonner";
import { format as formatDate } from "date-fns";
import { AlertTriangle, ChevronDown, ChevronRight, ExternalLink, FileSpreadsheet, Info, Loader2 } from "lucide-react";
import type {
  ImportCommitRequest,
  ImportOutcome,
  ImportPreviewDTO,
  ImportResultDTO,
  ImportRowDTO,
  ImportSkipReason,
  ListDTO,
  RoleId,
  TemplateDTO,
  TemplateId,
  TemplateSummaryDTO,
} from "@/lib/contract";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { listTemplates } from "@/components/pratiche/data-source";
import { StatoBadge } from "@/components/pratiche/stato-badge";
import { CommandDialogShell } from "@/components/scheda/command-dialog-shell";
import { formatValue, type Option } from "@/components/scheda/fields/format";
import { fetchTemplate } from "@/components/scheda/sheet-source";
import { loadAssignable, loadCatalog, optionsOf } from "@/components/scheda/lists-source";
import { commitImport, pendingChoices, plannedSummary, previewImport } from "@/components/import/import-source";
import { LoadError, loadErrorMessage } from "@/components/layout/load-error";

export const NO_OVERWRITE = "L'import non sovrascrive mai un campo già compilato.";
export const REWORK_NOTE = "Verrà creata una nuova pratica collegata.";

const OUTCOME_LABEL: Record<ImportOutcome, string> = {
  NEW_PRACTICE: "Nuova pratica",
  UPDATE: "Aggiornamento",
  REWORK: "Rilavorazione",
  AMBIGUOUS: "Ambigua",
  ERROR: "Errore",
};

const SKIP_TEXT: Record<ImportSkipReason, string> = {
  ALREADY_FILLED: "già compilato: non viene sovrascritto",
  INVALID: "valore non valido",
  NOT_IMPORTABLE: "non importabile (calcolato, mirror, ripetibile o Vincoli)",
};

type Choices = NonNullable<ImportCommitRequest["choices"]>;

/** Import of a client's workbook (§12, ADMIN): upload, preview, confirm. */
export function ImportWizard() {
  const [templates, setTemplates] = React.useState<TemplateSummaryDTO[]>([]);
  const [templateId, setTemplateId] = React.useState<TemplateId | null>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [preview, setPreview] = React.useState<ImportPreviewDTO | null>(null);
  const [template, setTemplate] = React.useState<TemplateDTO | null>(null);
  const [catalog, setCatalog] = React.useState<Map<string, ListDTO>>(new Map());
  /** Names for the USER/USERS values of the preview, by role. */
  const [usersByRole, setUsersByRole] = React.useState<Partial<Record<RoleId, Option[]>>>({});
  const [choices, setChoices] = React.useState<Choices>([]);
  const [confirming, setConfirming] = React.useState(false);
  const [result, setResult] = React.useState<ImportResultDTO | null>(null);
  /** operationId of the commit: a retry reuses it and redoes only the failed rows. */
  const [operationId, setOperationId] = React.useState<string | null>(null);

  const [templatesError, setTemplatesError] = React.useState<string | null>(null);
  const loadTemplates = React.useCallback(() => {
    setTemplatesError(null);
    listTemplates()
      .then(setTemplates)
      .catch((e) => setTemplatesError(loadErrorMessage(e)));
  }, []);
  React.useEffect(loadTemplates, [loadTemplates]);

  async function analyse() {
    if (!file || !templateId) return;
    setBusy(true);
    try {
      const [p, t] = await Promise.all([previewImport(file, templateId), fetchTemplate(templateId)]);
      setTemplate(t);
      setCatalog(await loadCatalog(templateId).catch(() => new Map()));
      setUsersByRole(await loadUsersByRole(p, t));
      setPreview(p);
      setChoices([]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    setPreview(null);
    setResult(null);
    setOperationId(null);
    setFile(null);
    setChoices([]);
  }

  // Rows that failed at commit time (not ERROR rows of the preview, which always fail) can be retried.
  const retryable = result && preview ? result.failed.filter((f) => preview.rows.find((r) => r.rowIndex === f.rowIndex)?.outcome !== "ERROR") : [];

  async function retry() {
    if (!preview || !operationId) return;
    setResult(await commitImport(preview, { operationId, choices }));
  }

  if (result) return <ImportResult result={result} onRestart={restart} onRetry={retryable.length > 0 ? retry : undefined} />;

  if (!preview || !template) {
    return (
      <section className="space-y-4 border border-border bg-card p-4" data-testid="import-step-upload">
        <Notice />
        {templatesError && (
          <LoadError message={templatesError} context="Elenco dei gestori" onRetry={loadTemplates} className="border border-border" testId="import-templates-error" />
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Gestore</Label>
            <Select value={templateId ?? undefined} onValueChange={(v) => setTemplateId(v as TemplateId)}>
              <SelectTrigger data-testid="import-template">
                <SelectValue placeholder="Seleziona…" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="import-file">File Excel (.xlsx)</Label>
            <Input
              id="import-file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              data-testid="import-file"
            />
          </div>
        </div>
        <Button onClick={analyse} disabled={!file || !templateId || busy} data-testid="import-analyse">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Analizza
        </Button>
        <p className="text-xs text-muted-foreground">L&apos;analisi non scrive nulla: prima vedi cosa succederebbe, poi confermi.</p>
      </section>
    );
  }

  const pending = pendingChoices(preview, choices);
  const planned = plannedSummary(preview, choices);
  const noteOf = (flowId: string) => preview.columns.find((c) => c.flowId === flowId)?.note;
  const format = (flowId: string, value: Parameters<typeof formatValue>[1]) => {
    const o = template.occurrences.find((x) => x.flowId === flowId && x.kind === "MASTER");
    if (!o) return String(value ?? "");
    const opts =
      o.list?.kind === "USERS"
        ? (o.list.userRole && usersByRole[o.list.userRole]) || []
        : o.list
          ? optionsOf(catalog.get(o.list.listId))
          : undefined;
    return formatValue(o.dataType, value, opts);
  };
  const setChoice = (rowIndex: number, choice: Choices[number] | null) =>
    setChoices((cs) => [...cs.filter((c) => c.rowIndex !== rowIndex), ...(choice ? [choice] : [])]);

  return (
    <div className="space-y-6" data-testid="import-step-preview">
      <Notice />
      <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-card px-4 py-3">
        <div className="flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-wider">
          {(Object.keys(OUTCOME_LABEL) as ImportOutcome[]).map((o) => (
            <span key={o} className="border border-border px-2 py-1">
              {OUTCOME_LABEL[o]} {preview.rows.filter((r) => r.outcome === o).length}
            </span>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">Anteprima valida 24 ore · {template.label}</span>
      </div>

      <section className="border border-border bg-card" data-testid="import-columns">
        <header className="border-b border-border px-4 py-2.5 font-mono text-xs uppercase tracking-wider">Colonne del file</header>
        <ul className="divide-y divide-border text-sm">
          {preview.columns.map((c) => (
            <li key={c.header} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-1.5">
              <span className="font-medium">{c.header}</span>
              <span className={cn("font-mono text-xs", c.flowId && !c.note ? "" : "text-muted-foreground")}>
                {c.flowId ? `→ ${c.flowId} ${template.occurrences.find((o) => o.flowId === c.flowId)?.label ?? ""}` : "non riconosciuta"}
                {c.note && ` · ${c.note}`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2" data-testid="import-rows">
        {preview.rows.map((r) => (
          <RowCard
            key={r.rowIndex}
            row={r}
            format={format}
            noteOf={noteOf}
            choice={choices.find((c) => c.rowIndex === r.rowIndex) ?? null}
            onChoice={(c) => setChoice(r.rowIndex, c)}
          />
        ))}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-foreground pt-4">
        <Button variant="outline" onClick={restart}>
          Cambia file
        </Button>
        <div className="flex items-center gap-3">
          {pending.length > 0 && (
            <span className="text-sm text-status-error" role="status">
              Scegli la pratica o &quot;Salta&quot; per le righe ambigue: {pending.join(", ")}
            </span>
          )}
          <Button disabled={pending.length > 0} onClick={() => setConfirming(true)} data-testid="import-confirm">
            Conferma import
          </Button>
        </div>
      </div>

      <CommandDialogShell
        open={confirming}
        onOpenChange={setConfirming}
        testId="import-confirm-dialog"
        title="Conferma l'import"
        description={
          <div className="space-y-2">
            <p>
              Verranno create {planned.created} pratiche, aggiornate {planned.updated}, rilavorazioni {planned.reworks}; saltate{" "}
              {planned.skipped} righe.
            </p>
            <p>{NO_OVERWRITE} Ogni riga è indipendente: una riga in errore non annulla le altre.</p>
          </div>
        }
        submitLabel="Importa"
        onSubmit={async (id) => {
          setOperationId(id);
          setResult(await commitImport(preview, { operationId: id, choices }));
        }}
      />
    </div>
  );
}

/** Assignable users of the roles whose USER/USERS fields appear in the preview. */
async function loadUsersByRole(preview: ImportPreviewDTO, template: TemplateDTO): Promise<Partial<Record<RoleId, Option[]>>> {
  const flows = new Set(preview.rows.flatMap((r) => r.changes.map((c) => c.flowId)));
  const roles = new Set<RoleId>();
  for (const o of template.occurrences) {
    if (o.kind === "MASTER" && o.flowId && flows.has(o.flowId) && o.list?.kind === "USERS" && o.list.userRole) roles.add(o.list.userRole);
  }
  const entries = await Promise.all(
    [...roles].map(async (role) => [role, await loadAssignable(template.id, role).catch(() => [])] as const)
  );
  return Object.fromEntries(entries);
}

function Notice() {
  return (
    <p className="flex items-center gap-2 border-2 border-foreground bg-secondary px-4 py-2.5 text-sm font-medium" data-testid="import-no-overwrite">
      <Info className="h-4 w-4 shrink-0" /> {NO_OVERWRITE}
    </p>
  );
}

function RowCard({
  row,
  format,
  noteOf,
  choice,
  onChoice,
}: {
  row: ImportRowDTO;
  format: (flowId: string, value: ImportRowDTO["changes"][number]["value"]) => string;
  noteOf: (flowId: string) => string | undefined;
  choice: Choices[number] | null;
  onChoice: (c: Choices[number] | null) => void;
}) {
  const [open, setOpen] = React.useState(row.outcome === "AMBIGUOUS" || row.outcome === "ERROR");
  const tone = row.outcome === "ERROR" ? "border-status-error" : row.outcome === "AMBIGUOUS" ? "border-status-progress" : "border-border";
  return (
    <article className={cn("border bg-card", tone)} data-testid={`import-row-${row.rowIndex}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left">
        <span className="flex items-center gap-3">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="font-mono text-xs">Riga {row.rowIndex}</span>
          <span className="border border-foreground px-1.5 font-mono text-[10px] uppercase tracking-wider">{OUTCOME_LABEL[row.outcome]}</span>
          {row.outcome === "REWORK" && <span className="text-xs">{REWORK_NOTE}</span>}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {row.changes.length} da compilare · {row.skipped.length} saltati
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-border px-4 py-3 text-sm">
          {row.practiceId && (
            <p>
              {row.outcome === "REWORK" ? "Pratica d'origine: " : "Pratica: "}
              {/* New tab: following the link must not lose the preview. */}
              <a
                href={`/pratiche/${encodeURIComponent(row.practiceId)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline underline-offset-2"
                data-testid={`import-practice-link-${row.rowIndex}`}
              >
                apri in una nuova scheda <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          )}
          {row.errors.length > 0 && (
            <ul className="space-y-1 text-status-error">
              {row.errors.map((e) => (
                <li key={e} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {e}
                </li>
              ))}
              <li className="text-xs text-muted-foreground">La riga verrà saltata.</li>
            </ul>
          )}
          {row.outcome === "AMBIGUOUS" && (
            <fieldset className="space-y-1.5" data-testid={`import-choice-${row.rowIndex}`}>
              <legend className="mb-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">Più pratiche compatibili: scegli</legend>
              {(row.candidates ?? []).map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-3 border border-border px-3 py-1.5">
                  <input
                    type="radio"
                    name={`row-${row.rowIndex}`}
                    checked={choice?.action === "APPLY" && choice.practiceId === c.id}
                    onChange={() => onChoice({ rowIndex: row.rowIndex, action: "APPLY", practiceId: c.id })}
                  />
                  <span className="font-mono">{c.codiceSito}</span>
                  <span>{c.nomeSito}</span>
                  <span className="font-mono text-xs text-muted-foreground">G7 {c.codiceG7 ?? "—"}</span>
                  <StatoBadge stato={c.statoAttivita} wrap />
                  {/* Candidates can share G7, site and name: these tell them apart. */}
                  <span className="font-mono text-xs text-muted-foreground" data-testid={`candidate-meta-${c.id}`}>
                    creata il {formatDate(new Date(c.createdAt), "dd/MM/yyyy")}
                    {c.iteration > 1 && ` · it. ${c.iteration}`}
                    {c.archived && " · archiviata"}
                  </span>
                  <a
                    href={`/pratiche/${encodeURIComponent(c.id)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto inline-flex items-center gap-1 text-xs underline underline-offset-2 hover:text-foreground"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Apri <ExternalLink className="h-3 w-3" />
                  </a>
                </label>
              ))}
              <label className="flex cursor-pointer items-center gap-3 border border-border px-3 py-1.5">
                <input
                  type="radio"
                  name={`row-${row.rowIndex}`}
                  checked={choice?.action === "SKIP"}
                  onChange={() => onChoice({ rowIndex: row.rowIndex, action: "SKIP" })}
                />
                Salta questa riga
              </label>
            </fieldset>
          )}
          {row.changes.length > 0 && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Campi vuoti che verrebbero compilati</div>
              <ul className="mt-1 divide-y divide-border border border-border">
                {row.changes.map((c) => (
                  <li key={c.flowId} className="flex justify-between gap-3 px-3 py-1">
                    <span>
                      <span className="font-mono text-xs text-muted-foreground">{c.flowId}</span> {c.label}
                    </span>
                    <span className="font-mono text-xs">{format(c.flowId, c.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {row.skipped.length > 0 && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Campi saltati</div>
              <ul className="mt-1 divide-y divide-border border border-border">
                {row.skipped.map((s) => (
                  <li key={`${s.flowId}-${s.reason}`} className="flex justify-between gap-3 px-3 py-1">
                    <span>
                      <span className="font-mono text-xs text-muted-foreground">{s.flowId}</span> {s.label}
                    </span>
                    {/* One message: the server's readable detail when present, else the reason (or the column note). */}
                    <span className="text-right text-xs text-muted-foreground" data-testid={`skipped-${s.flowId}`}>
                      {s.detail ?? (s.reason === "NOT_IMPORTABLE" ? noteOf(s.flowId) ?? SKIP_TEXT.NOT_IMPORTABLE : SKIP_TEXT[s.reason])}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function ImportResult({
  result,
  onRestart,
  onRetry,
}: {
  result: ImportResultDTO;
  onRestart: () => void;
  /** Same operationId: the rows already imported are not repeated. */
  onRetry?: () => Promise<void>;
}) {
  const [retrying, setRetrying] = React.useState(false);
  async function retry() {
    if (!onRetry) return;
    setRetrying(true);
    try {
      await onRetry();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRetrying(false);
    }
  }
  return (
    <section className="space-y-4 border border-border bg-card p-4" data-testid="import-result">
      <h2 className="font-heading text-xl font-black tracking-tight">Import completato</h2>
      <div className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
        {(
          [
            ["Create", result.created],
            ["Aggiornate", result.updated],
            ["Rilavorazioni", result.reworks],
            ["Saltate", result.skipped],
          ] as const
        ).map(([label, n]) => (
          <div key={label} className="bg-card px-4 py-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="font-heading text-3xl font-black tabular">{n}</div>
          </div>
        ))}
      </div>
      {result.failed.length > 0 && (
        <div className="border border-status-error px-3 py-2 text-sm" role="alert">
          <div className="font-medium text-status-error">Righe non importate: {result.failed.length}</div>
          <ul className="mt-1 space-y-0.5">
            {result.failed.map((f) => (
              <li key={f.rowIndex}>
                Riga {f.rowIndex}: {f.error}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Ogni modifica è nello storico delle pratiche con l&apos;origine &quot;Import&quot;.</p>
      <div className="flex flex-wrap gap-2">
        {onRetry && (
          <Button onClick={() => void retry()} disabled={retrying} data-testid="import-retry">
            {retrying && <Loader2 className="h-4 w-4 animate-spin" />} Riprova le righe non importate
          </Button>
        )}
        <Button variant="outline" onClick={onRestart} data-testid="import-restart">
          Nuovo import
        </Button>
      </div>
    </section>
  );
}
