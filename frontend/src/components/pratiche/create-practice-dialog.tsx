"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { AlertTriangle, ExternalLink, Plus } from "lucide-react";
import type { PraticaSummaryDTO, SelectValue, TemplateId, TemplateSummaryDTO } from "@/lib/contract";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CommandDialogShell } from "@/components/scheda/command-dialog-shell";
import { createPractice, resolveTemplate } from "@/components/scheda/commands";
import { Combobox } from "@/components/scheda/fields/combobox";
import { ALTRO, type Option } from "@/components/scheda/fields/format";
import { loadListOptions } from "@/components/scheda/sheet-source";
import { findDuplicates } from "@/components/pratiche/data-source";
import { StatoBadge } from "@/components/pratiche/stato-badge";
import { LoadError, loadErrorMessage } from "@/components/layout/load-error";

function complete(v: SelectValue | null): v is SelectValue {
  return !!v && (v.code !== ALTRO || !!v.otherText?.trim());
}

/**
 * Nuova pratica (PM, ADMIN: D-20). Mandatory fields D-38; the template
 * follows Cliente Finale + Committente (D-16) and is chosen by hand only when
 * the backend cannot decide.
 */
export function CreatePracticeDialog({
  templates,
  allowed,
}: {
  templates: TemplateSummaryDTO[];
  /** Templates where the user may create (MeDTO.canCreate). */
  allowed: TemplateId[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [codiceG7, setCodiceG7] = React.useState("");
  const [codiceSito, setCodiceSito] = React.useState("");
  const [nomeSito, setNomeSito] = React.useState("");
  const [committente, setCommittente] = React.useState<SelectValue | null>(null);
  const [clienteFinale, setClienteFinale] = React.useState<SelectValue | null>(null);
  const [lists, setLists] = React.useState<{ committente: Option[]; clienteFinale: Option[] } | null>(null);
  const [listsError, setListsError] = React.useState<string | null>(null);
  const [listsAttempt, setListsAttempt] = React.useState(0);
  const [resolved, setResolved] = React.useState<{ templateId: TemplateId | null; candidates: TemplateId[] } | null>(null);
  const [manual, setManual] = React.useState<TemplateId | null>(null);
  /** D-157: same client + G7 + site + name already present. null = not checked yet. */
  const [duplicates, setDuplicates] = React.useState<PraticaSummaryDTO[] | null>(null);
  const [createAnyway, setCreateAnyway] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setCodiceG7("");
    setCodiceSito("");
    setNomeSito("");
    setCommittente(null);
    setClienteFinale(null);
    setResolved(null);
    setManual(null);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    setListsError(null);
    Promise.all([loadListOptions("COMMITTENTE", null), loadListOptions("CLIENTE_FINALE", null)])
      .then(([c, f]) => setLists({ committente: c, clienteFinale: f }))
      .catch((e) => {
        // The values can still be typed ("Altro"); the fields must not stay on "Caricamento…".
        setLists({ committente: [], clienteFinale: [] });
        setListsError(loadErrorMessage(e));
      });
  }, [open, listsAttempt]);

  // Resolve the template as soon as both values are complete.
  React.useEffect(() => {
    setResolved(null);
    setManual(null);
    if (!complete(committente) || !complete(clienteFinale)) return;
    let alive = true;
    resolveTemplate({ committente, clienteFinale })
      .then((r) => alive && setResolved(r))
      .catch((e) => alive && toast.error((e as Error).message));
    return () => {
      alive = false;
    };
  }, [committente, clienteFinale]);

  const label = (id: TemplateId) => templates.find((t) => t.id === id)?.label ?? id;
  const templateId = resolved?.templateId ?? manual;
  const forbidden = !!resolved?.templateId && !allowed.includes(resolved.templateId);
  const candidates = (resolved?.candidates ?? []).filter((t) => allowed.includes(t));
  const filled = codiceG7.trim() && codiceSito.trim() && nomeSito.trim() && complete(committente) && complete(clienteFinale);
  // Which mandatory fields are still missing, shown once the user has started (C2: say which one).
  const missing = [
    !codiceG7.trim() && "Codice G7",
    !codiceSito.trim() && "Codice Sito",
    !nomeSito.trim() && "Nome Sito",
    !complete(clienteFinale) && "Cliente Finale",
    !complete(committente) && "Committente",
  ].filter((m): m is string => !!m);
  const started = missing.length < 5;
  // The check must have answered (or failed: it never blocks) and a duplicate must be acknowledged.
  const duplicateOk = duplicates !== null && (duplicates.length === 0 || createAnyway);
  const canSubmit = !!filled && !!templateId && !forbidden && duplicateOk;

  // Look for duplicates once the key and the template are known (debounced while typing).
  React.useEffect(() => {
    setDuplicates(null);
    setCreateAnyway(false);
    const key = { codiceG7: codiceG7.trim(), codiceSito: codiceSito.trim(), nomeSito: nomeSito.trim() };
    if (!templateId || !key.codiceG7 || !key.codiceSito || !key.nomeSito) return;
    let alive = true;
    const t = setTimeout(() => {
      findDuplicates(templateId, key)
        .then((d) => alive && setDuplicates(d))
        .catch(() => alive && setDuplicates([])); // non-blocking: a failed check does not stop the creation
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [templateId, codiceG7, codiceSito, nomeSito]);

  async function submit(operationId: string) {
    if (!templateId || !complete(committente) || !complete(clienteFinale)) return;
    const created = await createPractice(
      {
        templateId,
        committente,
        clienteFinale,
        codiceG7: codiceG7.trim(),
        codiceSito: codiceSito.trim(),
        nomeSito: nomeSito.trim(),
      },
      operationId
    );
    toast.success("Pratica creata");
    router.push(`/pratiche/${created.id}`);
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} data-testid="create-pratica-button">
        <Plus className="h-4 w-4" /> Nuova pratica
      </Button>
      <CommandDialogShell
        open={open}
        onOpenChange={setOpen}
        testId="create-pratica-dialog"
        title="Nuova pratica"
        description="Tutti i campi sono obbligatori. Il template del cliente si sceglie da Cliente Finale e Committente."
        submitLabel="Crea pratica"
        canSubmit={canSubmit}
        onSubmit={submit}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="new-g7">Codice G7</Label>
            <Input id="new-g7" value={codiceG7} onChange={(e) => setCodiceG7(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-sito">Codice Sito</Label>
            <Input id="new-sito" value={codiceSito} onChange={(e) => setCodiceSito(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="new-nome">Nome Sito</Label>
            <Input id="new-nome" value={nomeSito} onChange={(e) => setNomeSito(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-cliente">Cliente Finale</Label>
            <Combobox
              id="new-cliente"
              options={lists?.clienteFinale ?? []}
              loading={!lists}
              allowOther
              value={clienteFinale}
              onChange={setClienteFinale}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-committente">Committente</Label>
            <Combobox
              id="new-committente"
              options={lists?.committente ?? []}
              loading={!lists}
              allowOther
              value={committente}
              onChange={setCommittente}
            />
          </div>
        </div>

        {listsError && (
          <LoadError
            message={listsError}
            context="Elenchi di Cliente Finale e Committente"
            onRetry={() => setListsAttempt((n) => n + 1)}
            className="border border-border"
            testId="create-lists-error"
          />
        )}

        {started && missing.length > 0 && (
          <p className="text-sm text-muted-foreground" data-testid="create-missing">
            Mancano: {missing.join(", ")}
          </p>
        )}

        <div className="border border-border bg-secondary px-3 py-2.5" data-testid="create-template">
          <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Template</div>
          {!resolved ? (
            <p className="text-sm text-muted-foreground">Scegli Cliente Finale e Committente.</p>
          ) : resolved.templateId ? (
            <>
              <p className="font-mono text-sm uppercase tracking-wider">{label(resolved.templateId)}</p>
              {forbidden && (
                <p className="mt-1 text-sm text-status-error" role="alert">
                  Non puoi creare pratiche per {label(resolved.templateId)}.
                </p>
              )}
            </>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-status-error" role="alert">
              La combinazione non determina il template e non puoi creare pratiche per nessuno dei candidati.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm">La combinazione non determina il template: sceglilo tu.</p>
              <div role="radiogroup" className="flex flex-wrap gap-2">
                {candidates.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={manual === t}
                    onClick={() => setManual(t)}
                    data-testid={`create-template-${t}`}
                    className={cn(
                      "border px-3 py-1.5 font-mono text-xs uppercase tracking-wider",
                      manual === t ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:bg-accent"
                    )}
                  >
                    {label(t)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {duplicates && duplicates.length > 0 && (
          <div className="space-y-2 border border-status-progress bg-card px-3 py-2.5 text-sm" data-testid="create-duplicates" role="alert">
            <p className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0 text-status-progress" />
              {duplicates.length === 1 ? "Esiste già una pratica con questi dati:" : `Esistono già ${duplicates.length} pratiche con questi dati:`}
            </p>
            <ul className="space-y-1">
              {duplicates.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">{d.codiceSito}</span>
                  <span>{d.nomeSito}</span>
                  <span className="font-mono text-xs text-muted-foreground">G7 {d.codiceG7 ?? "—"}</span>
                  <StatoBadge stato={d.statoAttivita} wrap />
                  <span className="font-mono text-xs text-muted-foreground">
                    creata il {format(new Date(d.createdAt), "dd/MM/yyyy")}
                    {d.archived && " · archiviata"}
                  </span>
                  <a
                    href={`/pratiche/${encodeURIComponent(d.id)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 underline underline-offset-2"
                  >
                    Apri <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              ))}
            </ul>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={createAnyway}
                onChange={(e) => setCreateAnyway(e.target.checked)}
                data-testid="create-anyway"
              />
              Vuoi crearne comunque un&apos;altra? Sì, crea un&apos;altra pratica
            </label>
          </div>
        )}
      </CommandDialogShell>
    </>
  );
}
