"use client";
import * as React from "react";
import { useConfirm } from "@/components/layout/use-confirm";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, ChevronDown, GitBranch, History, Loader2, MessageSquare, Save, Send, Undo2 } from "lucide-react";
import type { AlertDTO, FieldChange, MeDTO, PraticaDetailDTO, TemplateDTO } from "@/lib/contract";
import { groupsIn } from "@/components/me/me-derive";
import { ApiError } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { GROUP_LABEL, GROUP_ORDER } from "@/components/pratiche/labels";
import { StatoBadge } from "@/components/pratiche/stato-badge";
import { buildRepeatIndex } from "@/components/scheda/conditions";
import { addPendingWithCascade, applyPending, changeKey, isRowOp, prunePending, type ValueChange } from "@/components/scheda/changes";
import { buildSheetFromTemplate, defaultOpenSections } from "@/components/scheda/layout";
import { HistoryPanel } from "@/components/scheda/history";
import { AssignDialog } from "@/components/scheda/assign-dialog";
import { StatoDialog } from "@/components/scheda/stato-dialog";
import { ConfirmCommandDialog, type ConfirmKind } from "@/components/scheda/confirm-command-dialog";
import { conflictOf, runCommand, type Command } from "@/components/scheda/commands";
import { AlertsPanel } from "@/components/scheda/alerts-panel";
import { closeAlert } from "@/components/notifiche/notifications-source";
import { useSheetOptions } from "@/components/scheda/use-sheet-options";
import { SectionIndex } from "@/components/scheda/section-index";
import { SheetSections } from "@/components/scheda/sections";
import { useAssistantPageContext } from "@/components/assistente/assistant-store";
import { LoadError, loadErrorMessage } from "@/components/layout/load-error";
import { COMMENTS_ANCHOR, CommentsPanel } from "@/components/commenti/comments-panel";
import { visibleOccurrence } from "@/components/scheda/alert-visibility";
import { TransversalPanel } from "@/components/scheda/transversal-panel";
import {
  loadHistory,
  loadIteration,
  loadSheet,
  reloadPractice,
  saveFields,
} from "@/components/scheda/sheet-source";

const CONFLICT_MESSAGE =
  "La pratica è stata modificata da un altro utente: dati aggiornati, le tue modifiche non salvate sono state mantenute.";
const ITERATION_MESSAGE = "È stata aperta una nuova iterazione: ora vedi quella corrente.";
const ROW_GONE_MESSAGE = "Una riga è stata rimossa nel frattempo: le sue modifiche sono state scartate.";
const ROW_GONE_SAVED = "Una riga è stata rimossa nel frattempo: le sue modifiche sono state scartate, le altre sono state salvate.";
/** 422 of a row that is no longer there (contract v0.5.3); ROW_LOCKED is not one of them. */
const ROW_GONE_CODES = new Set(["ROW_NOT_FOUND", "ROW_REMOVED", "ROW_GROUP_MISMATCH", "ROW_OTHER_ITERATION"]);

function rowGone(e: unknown): { rowId?: string } | null {
  if (!(e instanceof ApiError) || e.status !== 422) return null;
  const body = (e.body ?? {}) as { code?: string; rowId?: string };
  if (body.code ? ROW_GONE_CODES.has(body.code) : /^riga non trovata/i.test(e.message)) return { rowId: body.rowId };
  return null;
}
const COMMAND_DONE: Record<Command["kind"], string> = {
  assign: "Pratica assegnata",
  stato: "Stato attività aggiornato",
  archive: "Pratica archiviata",
  restore: "Pratica ripristinata",
  delete: "Pratica cancellata",
  rework: "Rilavorazione creata",
  resubmit: "Nuova iterazione aperta",
};

type DialogKind = "assign" | "stato" | ConfirmKind;

/** A point of the sheet to open and highlight (notification links, alerts). */
export interface SheetFocus {
  sectionKey?: string;
  /** occurrenceKey, or a flowId (its MASTER occurrence is used). */
  campo?: string;
  rowId?: string;
}

const HIGHLIGHT = ["ring-2", "ring-primary", "ring-offset-2"];
/** Anchor of the history box (side index "Storico", C3). */
const HISTORY_ANCHOR = "storico";

/** Escape for a value inside a quoted attribute selector. */
function attr(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

/**
 * Practice sheet (F2).
 * `iteration` (from ?iterazione=) opens a past iteration, always read-only.
 */
export function PraticaSheet({
  id,
  me = null,
  iteration,
  focus,
  commentId,
}: {
  id: string;
  /** Current user (MeDTO): their groups in the template start open. */
  me?: MeDTO | null;
  iteration?: number;
  focus?: SheetFocus;
  /** From ?commento= (MENTION notification or mail): open the sheet on that comment. */
  commentId?: string;
}) {
  const router = useRouter();
  const [template, setTemplate] = React.useState<TemplateDTO | null>(null);
  const [saved, setSaved] = React.useState<PraticaDetailDTO | null>(null);
  const [past, setPast] = React.useState<PraticaDetailDTO | null>(null);
  const [open, setOpen] = React.useState<string[] | null>(null);
  const [dialog, setDialog] = React.useState<DialogKind | null>(null);
  const [pending, setPending] = React.useState<Map<string, ValueChange>>(new Map());
  const [confirm, confirmDialog] = useConfirm();
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pastError, setPastError] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const [pastAttempt, setPastAttempt] = React.useState(0);
  /** Comments of the iteration on screen, for the mark in the header (null until read). */
  const [commentCount, setCommentCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    setError(null);
    loadSheet(id)
      .then(({ template, practice }) => {
        setTemplate(template);
        setSaved(practice);
        // Open the user's sections in the same render as the data (no flash).
        const myGroups = me ? groupsIn(me, template.id) : ["PM_PERMESSI" as const];
        setOpen((prev) => prev ?? defaultOpenSections(buildSheetFromTemplate(template), myGroups));
      })
      .catch((e) => setError(loadErrorMessage(e, "Pratica non trovata: forse è stata eliminata.")));
    // me only seeds the first state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, attempt]);

  // A past iteration is loaded on top of the current one.
  const viewingPast = saved !== null && iteration !== undefined && iteration !== saved.iteration;
  React.useEffect(() => {
    setPastError(null);
    if (!viewingPast || iteration === undefined) {
      setPast(null);
      return;
    }
    let alive = true;
    loadIteration(id, iteration)
      .then((p) => alive && setPast(p))
      .catch((e) => alive && setPastError(loadErrorMessage(e, `Iterazione ${iteration} non trovata.`)));
    return () => {
      alive = false;
    };
  }, [id, iteration, viewingPast, pastAttempt]);

  // Warn before leaving with unsaved edits.
  React.useEffect(() => {
    if (pending.size === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [pending.size]);

  const groups = React.useMemo(() => (template ? buildSheetFromTemplate(template) : []), [template]);
  const getOptions = useSheetOptions(template?.id ?? null);
  const repeatOf = React.useMemo(() => (template ? buildRepeatIndex(template) : new Map<string, string>()), [template]);
  const current = React.useMemo(() => (saved ? applyPending(saved, pending) : null), [saved, pending]);
  const shown = viewingPast ? past : current;
  // Context of the next assistant question: this practice and the iteration on screen.
  const shownIteration = shown?.iteration ?? saved?.iteration;
  useAssistantPageContext(
    saved && shownIteration !== undefined
      ? {
          context: { page: "sheet", practiceId: id, iteration: shownIteration, templateId: saved.templateId },
          label: `Pratica ${saved.codiceSito} · iterazione ${shownIteration}`,
        }
      : null
  );

  const selectSection = React.useCallback((key: string) => {
    setOpen((prev) => (prev?.includes(key) ? prev : [...(prev ?? []), key]));
    requestAnimationFrame(() =>
      document.getElementById(`sezione-${key}`)?.scrollIntoView?.({ behavior: "smooth", block: "start" })
    );
  }, []);

  /** C3, C4: the side index's "Storico" and "Commenti" entries, like a section: smooth scroll to the box. */
  const scrollToBox = React.useCallback((anchor: string) => {
    requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView?.({ behavior: "smooth", block: "start" }));
  }, []);
  const selectHistory = React.useCallback(() => scrollToBox(HISTORY_ANCHOR), [scrollToBox]);
  const selectComments = React.useCallback(() => scrollToBox(COMMENTS_ANCHOR), [scrollToBox]);

  /** Opens the section of a field (or row) and highlights it for a moment. */
  const focusOn = React.useCallback(
    (target: SheetFocus) => {
      if (!template) return;
      const all = template.occurrences;
      // A field in several sections goes to the one where a condition does not hide it (L9).
      const seen =
        target.campo && !target.rowId && shown
          ? visibleOccurrence(target.campo, groups, { values: shown.values, repeats: shown.repeats, repeatOf }, target.sectionKey)
          : undefined;
      const occ =
        all.find((o) => o.occurrenceKey === target.campo) ??
        seen?.occurrence ??
        all.find((o) => o.flowId === target.campo && o.kind === "MASTER") ??
        all.find((o) => o.flowId === target.campo);
      const sectionKey = seen?.section.section.key ?? target.sectionKey ?? occ?.sectionKey;
      if (!sectionKey) return;
      setOpen((prev) => (prev?.includes(sectionKey) ? prev : [...(prev ?? []), sectionKey]));
      // Two frames: the section content mounts only once it is open.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const row = target.rowId ? document.querySelector(`[data-testid$="-${attr(target.rowId)}"]`) : null;
          const scope: ParentNode = row ?? document;
          const el =
            (occ && scope.querySelector(`[data-testid="field-${attr(occ.occurrenceKey)}"]`)) ??
            row ??
            // Hidden everywhere: the section's notice says which field to fill.
            document.getElementById(`alert-nascosti-${sectionKey}`) ??
            document.getElementById(`sezione-${sectionKey}`);
          if (!el) return;
          el.scrollIntoView?.({ behavior: "smooth", block: "center" });
          el.classList.add(...HIGHLIGHT);
          window.setTimeout(() => el.classList.remove(...HIGHLIGHT), 2500);
        })
      );
    },
    [template, groups, shown, repeatOf]
  );

  // Link from a notification: once, when the sheet is ready.
  const focused = React.useRef(false);
  React.useEffect(() => {
    if (!focus || focused.current || !template || !shown) return;
    focused.current = true;
    focusOn(focus);
  }, [focus, template, shown, focusOn]);

  async function onCloseAlert(alert: AlertDTO, operationId: string) {
    const result = await closeAlert(alert, operationId);
    // Idempotent: closed meanwhile (e.g. automatically) comes back unchanged.
    if (result.closeMode === "AUTO") toast.info("L'alert era già stato chiuso automaticamente");
    else toast.success("Alert chiuso");
    setSaved((p) => {
      if (!p) return p;
      const alerts = p.alerts.filter((a) => a.id !== alert.id);
      return { ...p, alerts, openAlerts: alerts.length };
    });
  }

  function alertField(a: AlertDTO): string | null {
    const o = template?.occurrences.find((x) => x.flowId === a.flowId && x.kind === "MASTER");
    if (!o) return null;
    const repeat = a.repeat ? template?.repeatGroups.find((r) => r.key === a.repeat) : undefined;
    const idx = repeat && shown ? (shown.repeats[repeat.key] ?? []).findIndex((r) => r.rowId === a.rowId) : -1;
    return repeat && idx >= 0 ? `${o.label} · ${repeat.label} #${idx + 1}` : o.label;
  }

  async function goToIteration(n: number) {
    if (pending.size > 0 && !(await confirm({ title: "Ci sono modifiche non salvate", description: "Cambiando iterazione le modifiche non salvate si perdono.", confirmLabel: "Cambia iterazione" }))) return;
    const isCurrent = n === saved?.iteration;
    router.push(isCurrent ? `/pratiche/${id}` : `/pratiche/${id}?iterazione=${n}`);
  }

  const labelOf = React.useCallback(
    (occurrenceKey: string) =>
      [...(template?.occurrences ?? []), ...(template?.transversal ?? [])].find((o) => o.occurrenceKey === occurrenceKey)
        ?.label ?? occurrenceKey,
    [template]
  );

  const send = React.useCallback(
    async (changes: FieldChange[], onSaved?: (practice: PraticaDetailDTO) => void) => {
      if (!saved) return;
      setSaving(true);
      try {
        const res = await saveFields(saved, changes);
        setSaved(res.practice);
        onSaved?.(res.practice);
        for (const t of res.toasts) (t.kind === "WARNING" ? toast.warning : toast.info)(t.message);
      } catch (e) {
        const conflict = conflictOf(e);
        if (conflict) {
          // Someone saved meanwhile: reload, keep the local edits on top.
          const fresh = await reloadPractice(saved.id);
          setSaved(fresh);
          setPending((p) => prunePending(p, fresh));
          if (conflict === "ITERATION_CONFLICT") {
            setPending(new Map());
            toast.warning(ITERATION_MESSAGE);
          } else toast.warning(CONFLICT_MESSAGE);
        } else if (rowGone(e)) {
          // A row removed meanwhile (here or elsewhere): drop its edits, reload, save the rest once,
          // say so; never a bare error (L11). ROW_LOCKED falls through: the server's message as is.
          const goneRow = rowGone(e)!.rowId;
          const fresh = await reloadPractice(saved.id);
          setSaved(fresh);
          const values = new Map(changes.filter((c): c is ValueChange => !isRowOp(c)).map((c) => [changeKey(c), c]));
          const rest = prunePending(values, fresh);
          rest.forEach((c, key) => "rowId" in c && c.rowId === goneRow && rest.delete(key));
          if (rest.size === 0) {
            setPending((p) => prunePending(p, fresh));
            toast.warning(ROW_GONE_MESSAGE);
          } else {
            try {
              const retry = await saveFields(fresh, Array.from(rest.values()));
              setSaved(retry.practice);
              onSaved?.(retry.practice);
              toast.warning(ROW_GONE_SAVED);
            } catch (again) {
              setPending(rest);
              toast.error((again as Error).message);
            }
          }
        } else if (e instanceof ApiError && e.status === 403) {
          const rejected = (e.body as { rejected?: string[] })?.rejected ?? [];
          toast.error(rejected.length ? `${e.message}: ${rejected.map(labelOf).join(", ")}` : e.message);
        } else {
          toast.error((e as Error).message);
        }
      } finally {
        setSaving(false);
      }
    },
    [saved, labelOf]
  );

  const onChange = React.useCallback(
    (change: FieldChange) => {
      if (!saved) return;
      // Row structure is sent at once; value edits wait for "Salva". A removed
      // row takes its pending edits with it (pop-ups and mirrors share its rowId).
      if (isRowOp(change)) void send([change], (practice) => setPending((p) => prunePending(p, practice)));
      else setPending((p) => addPendingWithCascade(p, saved, change, template?.occurrences ?? []));
    },
    [saved, send, template]
  );

  function save() {
    if (!saved) return;
    // Edits of rows that no longer exist are never sent.
    const live = prunePending(pending, saved);
    if (live.size !== pending.size) setPending(live);
    if (live.size === 0) return;
    void send(Array.from(live.values()), () => setPending(new Map()));
  }

  /** Runs a command from a dialog. Conflicts reload the practice and close
   *  the dialog; any other error is shown in the dialog (retry = same id). */
  const runCmd = React.useCallback(
    async (command: Command, operationId: string) => {
      if (!saved) return;
      try {
        const result = await runCommand(saved, command, operationId);
        toast.success(COMMAND_DONE[command.kind]);
        if (command.kind === "delete") {
          setPending(new Map());
          router.push("/pratiche");
        } else if (command.kind === "rework" && result) {
          router.push(`/pratiche/${result.id}`);
        } else if (result) {
          setSaved(result);
          // A new iteration starts empty: edits made on the old one are dropped.
          if (command.kind === "resubmit") setPending(new Map());
          else setPending((p) => prunePending(p, result));
          if (viewingPast) router.push(`/pratiche/${id}`);
        }
      } catch (e) {
        const conflict = conflictOf(e);
        if (!conflict) throw e;
        const fresh = await reloadPractice(saved.id);
        setSaved(fresh);
        setPending((p) => prunePending(p, fresh));
        // Same operationId with a different body: the request is stale; reload.
        if (conflict === "OPERATION_REUSED") toast.warning("Operazione non ripetibile con dati diversi: dati aggiornati, riprova.");
        else if (conflict === "ITERATION_CONFLICT") {
          toast.warning(ITERATION_MESSAGE);
          router.push(`/pratiche/${id}`);
        } else toast.warning("La pratica è stata modificata da un altro utente: dati aggiornati, ricontrolla e riprova.");
      }
    },
    [saved, router, id, viewingPast]
  );

  if (error || pastError) {
    return (
      <div className="space-y-3 border border-border bg-card p-4" data-testid="sheet-load-error">
        <LoadError
          message={(error ?? pastError)!}
          onRetry={() => (error ? setAttempt((n) => n + 1) : setPastAttempt((n) => n + 1))}
        />
        <Link href={error ? "/pratiche" : `/pratiche/${id}`} className="inline-block px-4 text-sm text-primary hover:underline">
          {error ? "Torna alle pratiche" : "Torna all'iterazione corrente"}
        </Link>
      </div>
    );
  }

  if (!template || !shown || !saved) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", pending.size > 0 && "pb-24")} data-testid="pratica-sheet">
      {confirmDialog}

      <SheetHeader
        practice={shown}
        template={template}
        currentIteration={saved.iteration}
        viewingPast={viewingPast}
        hasPending={pending.size > 0}
        commentCount={commentCount}
        onIteration={goToIteration}
        onCommand={setDialog}
      />

      <AssignDialog
        practice={saved}
        open={dialog === "assign"}
        onOpenChange={(o) => !o && setDialog(null)}
        hasPending={pending.size > 0}
        onRun={runCmd}
      />
      <StatoDialog
        practice={saved}
        open={dialog === "stato"}
        onOpenChange={(o) => !o && setDialog(null)}
        onRun={runCmd}
      />
      <ConfirmCommandDialog
        kind={dialog === "assign" || dialog === "stato" ? null : dialog}
        practice={saved}
        onOpenChange={(o) => !o && setDialog(null)}
        onRun={runCmd}
      />

      {shown.archived && !viewingPast && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-2 border-foreground bg-secondary px-4 py-3"
          data-testid="archived-banner"
        >
          <span className="font-mono text-xs uppercase tracking-wider">Archiviata: sola lettura, alert sospesi</span>
          {shown.actions.canRestore && (
            <Button size="sm" onClick={() => setDialog("restore")} data-testid="archived-restore">
              Ripristina
            </Button>
          )}
        </div>
      )}

      {viewingPast && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-2 border-foreground bg-secondary px-4 py-3"
          data-testid="past-iteration-banner"
        >
          <span className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider">
            <History className="h-4 w-4" /> Iterazione {shown.iteration}: sola lettura
          </span>
          <Button variant="outline" size="sm" onClick={() => goToIteration(saved.iteration)}>
            Torna all&apos;iterazione corrente ({saved.iteration})
          </Button>
        </div>
      )}

      {!viewingPast && (
        <AlertsPanel
          alerts={shown.alerts}
          labelOf={alertField}
          onGoTo={(a) => focusOn({ sectionKey: a.sectionKey, campo: a.flowId, rowId: a.rowId })}
          onGoToFatturabile={() => {
            const el = document.getElementById("trasv-fatturabile-box");
            el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
            el?.classList.add(...HIGHLIGHT);
            window.setTimeout(() => el?.classList.remove(...HIGHLIGHT), 2500);
          }}
          onClose={onCloseAlert}
        />
      )}

      <TransversalPanel
        values={shown.transversal}
        occurrences={template.transversal}
        access={viewingPast ? {} : shown.access}
        onChange={onChange}
      />

      <ProgressStrip practice={shown} />

      <div className="grid grid-cols-1 gap-8 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
        {/* From 640 px (zoom 200% on a desktop window, C4); from 1024 px the layout is the same as before. */}
        <aside className="hidden sm:block">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-auto">
            <SectionIndex
              groups={groups}
              data={{ values: shown.values, repeats: shown.repeats, repeatOf }}
              alerts={shown.alerts}
              enabledGroups={shown.enabledGroups}
              open={open ?? []}
              onSelect={selectSection}
              onHistory={selectHistory}
              onComments={selectComments}
              commentCount={commentCount}
            />
          </div>
        </aside>
        <div className="min-w-0 space-y-8">
          <SheetSections
            groups={groups}
            data={{ values: shown.values, repeats: shown.repeats, repeatOf }}
            access={shown.access}
            repeatAccess={shown.repeatAccess}
            alerts={shown.alerts}
            enabledGroups={shown.enabledGroups}
            open={open ?? []}
            onOpenChange={setOpen}
            lockedReason={viewingPast ? `Iterazione ${shown.iteration}: sola lettura` : undefined}
            constraints={template.constraints}
            manualLocks={shown.manualLocks}
            getOptions={getOptions}
            onChange={onChange}
          />

          <CommentsPanel
            key={`comments-${shown.iteration}`}
            practiceId={id}
            iteration={shown.iteration}
            onCount={setCommentCount}
            focusCommentId={commentId}
          />

          <div id={HISTORY_ANCHOR} className="scroll-mt-20">
            <HistoryPanel
              key={shown.iteration}
              practiceId={id}
              iteration={shown.iteration}
              revision={saved.revision}
              template={template}
              repeats={shown.repeats}
              load={loadHistory}
              optionsFor={(o) => (o.list ? getOptions(o.list, undefined).options : undefined)}
            />
          </div>
        </div>
      </div>

      {!viewingPast && pending.size > 0 && (
        <SaveBar count={pending.size} saving={saving} onSave={save} onDiscard={() => setPending(new Map())} />
      )}
    </div>
  );
}

function SheetHeader({
  practice,
  template,
  currentIteration,
  viewingPast,
  hasPending,
  commentCount,
  onIteration,
  onCommand,
}: {
  practice: PraticaDetailDTO;
  template: TemplateDTO;
  currentIteration: number;
  viewingPast: boolean;
  hasPending: boolean;
  commentCount: number | null;
  onIteration: (n: number) => void;
  onCommand: (kind: DialogKind) => void;
}) {
  const { actions } = practice;
  const pendingHint = hasPending ? "Salva o annulla prima le modifiche" : undefined;
  const more = (
    [
      actions.canArchive && (["archive", "Archivia"] as const),
      actions.canRestore && (["restore", "Ripristina"] as const),
      actions.canRework && (["rework", "Rilavorazione"] as const),
      actions.canResubmit && (["resubmit", "Ripresentazione totale"] as const),
      actions.canDelete && (["delete", "Cancella"] as const),
    ].filter(Boolean) as Array<readonly [ConfirmKind, string]>
  );

  return (
    <div className="border-b border-border pb-5" data-testid="sheet-header">
      <Link
        href={practice.archived ? `/pratiche/archivio?template=${practice.templateId}` : `/pratiche?template=${practice.templateId}`}
        className="mb-3 inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {practice.archived ? "Archivio" : "Pratiche"} {template.label}
      </Link>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-3xl font-black tracking-tight tabular lg:text-4xl">{practice.codiceSito}</h1>
            <span className="font-heading text-2xl font-bold tracking-tight text-muted-foreground lg:text-3xl">
              {practice.nomeSito}
            </span>
            <StatoBadge stato={practice.statoAttivita} wrap />
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
            <span>
              Cliente <span className="text-foreground">{template.label}</span>
            </span>
            <span>
              Codice G7 <span className="tabular text-foreground">{practice.codiceG7 ?? "—"}</span>
            </span>
            {practice.iterations.length > 1 ? (
              <span className="flex items-center gap-2">
                Iterazione
                <Select value={String(practice.iteration)} onValueChange={(v) => onIteration(Number(v))}>
                  <SelectTrigger className="h-7 w-auto gap-2 px-2 font-mono text-xs" data-testid="iteration-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {practice.iterations.map((it) => (
                      <SelectItem key={it.n} value={String(it.n)}>
                        {it.n} {it.n === currentIteration ? "(corrente)" : "· sola lettura"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                di {practice.iterations.length}
              </span>
            ) : (
              <span>
                Iterazione <span className="tabular text-foreground">{practice.iteration}</span> di 1
              </span>
            )}
            {practice.originPracticeId && (
              <Link href={`/pratiche/${practice.originPracticeId}`} className="inline-flex items-center gap-1 hover:text-foreground">
                <GitBranch className="h-3.5 w-3.5" /> Rilavorazione di un&apos;altra pratica
              </Link>
            )}
            {practice.alerts.length > 0 && (
              <span className="inline-flex items-center gap-1 text-status-error">
                <AlertTriangle className="h-3.5 w-3.5" /> {practice.alerts.length} alert aperti
              </span>
            )}
            {!!commentCount && (
              <a href="#commenti" className="inline-flex items-center gap-1 hover:text-foreground" data-testid="sheet-comments-mark">
                <MessageSquare className="h-3.5 w-3.5" /> {commentCount === 1 ? "1 commento" : `${commentCount} commenti`}
              </a>
            )}
          </div>
        </div>

        {/* Commands follow the backend's actions; never on a past iteration. */}
        {!viewingPast && (
          // On a phone the commands wrap instead of pushing the page wider (360 px).
          <div className="flex flex-wrap items-center gap-2">
            {actions.canAssign && (
              <Button onClick={() => onCommand("assign")} data-testid="cmd-assign">
                <Send className="h-4 w-4" /> Assegna
              </Button>
            )}
            {actions.canChangeStato && (
              <Button
                variant="outline"
                onClick={() => onCommand("stato")}
                disabled={hasPending}
                title={pendingHint}
                data-testid="cmd-stato"
              >
                Stato attività
              </Button>
            )}
            {more.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" disabled={hasPending} title={pendingHint} data-testid="cmd-more">
                    Altre azioni <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {more.map(([kind, label]) => (
                    <DropdownMenuItem
                      key={kind}
                      onSelect={() => onCommand(kind)}
                      className={kind === "delete" ? "text-status-error" : undefined}
                      data-testid={`cmd-${kind}`}
                    >
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Secondary progress view (G §9): one card per group, disabled until the
 *  group receives an Assegna (D-21); a click jumps to the group. */
function ProgressStrip({ practice }: { practice: PraticaDetailDTO }) {
  return (
    <div className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4" data-testid="progress-strip">
      {GROUP_ORDER.map((g) => {
        const enabled = practice.enabledGroups.includes(g);
        const { filled, total } = practice.progress[g] ?? { filled: 0, total: 0 };
        const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
        return (
          <a
            key={g}
            href={`#gruppo-${g}`}
            className={cn("bg-card px-4 py-3 transition-colors hover:bg-accent", !enabled && "opacity-50")}
            title={enabled ? `${GROUP_LABEL[g]}: ${filled}/${total}` : `${GROUP_LABEL[g]}: non ancora assegnato`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-xs uppercase tracking-wider">{GROUP_LABEL[g]}</span>
              <span className="font-mono text-[10px] tabular text-muted-foreground">
                {enabled ? `${filled}/${total}` : "non assegnato"}
              </span>
            </div>
            <div className="mt-2 h-1 w-full bg-border">
              {enabled && <div className="h-1 bg-primary" style={{ width: `${pct}%` }} aria-hidden />}
            </div>
          </a>
        );
      })}
    </div>
  );
}

/** Save bar (D-122): value edits are saved together. */
function SaveBar({
  count,
  saving,
  onSave,
  onDiscard,
}: {
  count: number;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-foreground bg-background/95 backdrop-blur lg:left-64"
      data-testid="save-bar"
    >
      <div className="flex items-center justify-between gap-4 px-4 py-3 lg:px-8">
        <span className="font-mono text-xs uppercase tracking-wider">
          {count} {count === 1 ? "modifica non salvata" : "modifiche non salvate"}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onDiscard} disabled={saving} data-testid="save-bar-discard">
            <Undo2 className="h-4 w-4" /> Annulla
          </Button>
          <Button onClick={onSave} disabled={saving} data-testid="save-bar-save">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salva
          </Button>
        </div>
      </div>
    </div>
  );
}
