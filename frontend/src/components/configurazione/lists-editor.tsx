"use client";
import * as React from "react";
import { useConfirm } from "@/components/layout/use-confirm";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Lock, Plus, Save, Trash2, Undo2 } from "lucide-react";
import type { GroupId, ListDTO, ListItemDTO, TemplateId, TemplateSummaryDTO } from "@/lib/contract";
import { ApiError } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { GROUP_LABEL, GROUP_ORDER } from "@/components/pratiche/labels";
import { listTemplates } from "@/components/pratiche/data-source";
import { loadLists, saveList } from "@/components/configurazione/config-source";

const COMMON = "COMMON";
const ALL = "all";
export const LIST_CONFLICT_MESSAGE =
  "Un altro utente ha modificato la lista: le tue modifiche non salvate sono state scartate";

/** A draft row: `isNew` = added here and not saved yet (only those can be removed). */
type DraftItem = ListItemDTO & { isNew?: boolean };

/** Code proposed from the label: UPPER_SNAKE_CASE without accents. */
export function codeFromLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function draftProblems(items: DraftItem[]): string | null {
  if (items.some((i) => !i.label.trim())) return "Ogni voce deve avere un'etichetta.";
  if (items.some((i) => !/^[A-Z0-9_]+$/.test(i.code))) return "I codici usano solo lettere maiuscole, cifre e _.";
  const codes = items.map((i) => i.code);
  if (new Set(codes).size !== codes.length) return "Due voci hanno lo stesso codice.";
  return null;
}

/** Lists of one group, or all ("Tutti i gruppi"). */
function inGroup(lists: ListDTO[], group: string): ListDTO[] {
  return lists.filter((l) => group === ALL || l.group === group);
}

/**
 * Lists per client (§6, D-40). Editable when the backend says so (team leaders
 * of the group, ADMIN). CONTROLLED lists: label only. A saved code is never
 * removed nor renamed: it is deactivated.
 */
/**
 * `allowed`: templates of the user's memberships (null = all, ADMIN); the others
 * are not offered, the server would refuse them anyway.
 */
export function ListsEditor({
  initialTemplate = null,
  allowed = null,
}: {
  initialTemplate?: TemplateId | null;
  allowed?: TemplateId[] | null;
}) {
  const [templates, setTemplates] = React.useState<TemplateSummaryDTO[]>([]);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [scope, setScope] = React.useState<string>(initialTemplate ?? COMMON);
  const [group, setGroup] = React.useState<string>(ALL);
  const [lists, setLists] = React.useState<ListDTO[] | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<DraftItem[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    listTemplates()
      .then((all) => setTemplates(all.filter((t) => allowed === null || allowed.includes(t.id))))
      .catch(() => setTemplates([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const templateId = scope === COMMON ? null : (scope as TemplateId);

  const reload = React.useCallback(
    async (keep?: string | null) => {
      const res = await loadLists(templateId);
      setLists(res);
      const next = keep && res.some((l) => l.listId === keep) ? keep : res[0]?.listId ?? null;
      setSelected(next);
      setDraft(res.find((l) => l.listId === next)?.items ?? []);
      setError(null);
      setLoadError(null);
    },
    [templateId]
  );

  React.useEffect(() => {
    setLists(null);
    setLoadError(null);
    // A failed load must not stay on "Caricamento…".
    reload().catch(() => {
      setLists([]);
      setLoadError("Liste non disponibili per questo gestore.");
    });
  }, [reload]);

  const visible = inGroup(lists ?? [], group);

  // C2: the open list always belongs to the combination client + group. When the group (or the client,
  // after the reload) leaves it out, the first list of the new combination opens, or none.
  React.useEffect(() => {
    if (!lists) return;
    const shown = inGroup(lists, group);
    if (selected && shown.some((l) => l.listId === selected)) return;
    const first = shown[0] ?? null;
    setSelected(first?.listId ?? null);
    setDraft(first?.items ?? []);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lists, group]);
  const list = lists?.find((l) => l.listId === selected) ?? null;
  const dirty = !!list && JSON.stringify(draft.map(({ isNew: _n, ...i }) => i)) !== JSON.stringify(list.items);
  const controlled = list?.kind === "CONTROLLED";
  const editable = list?.editable === true;

  const [confirm, confirmDialog] = useConfirm();
  const discardOk = () => confirm({ title: "Ci sono modifiche non salvate", description: "Le modifiche a questa lista si perdono.", confirmLabel: "Continua" });

  async function select(listId: string) {
    if (dirty && !(await discardOk())) return;
    setSelected(listId);
    setDraft(lists?.find((l) => l.listId === listId)?.items ?? []);
    setError(null);
  }

  async function changeScope(value: string) {
    if (dirty && !(await discardOk())) return;
    setScope(value);
  }

  /** Unsaved edits are not lost in silence: ask only when the open list would change. */
  async function changeGroup(value: string) {
    const keeps = !!selected && inGroup(lists ?? [], value).some((l) => l.listId === selected);
    if (dirty && !keeps && !(await discardOk())) return;
    setGroup(value);
  }

  function update(index: number, patch: Partial<DraftItem>) {
    setDraft((d) => d.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function move(index: number, delta: number) {
    setDraft((d) => {
      const next = [...d];
      const target = index + delta;
      if (target < 0 || target >= next.length) return d;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function add() {
    setDraft((d) => [...d, { code: "", label: "", active: true, order: d.length + 1, isNew: true }]);
  }

  async function save() {
    if (!list) return;
    const problem = draftProblems(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await saveList(
        list,
        draft.map(({ isNew: _n, ...i }, idx) => ({ ...i, order: idx + 1 }))
      );
      setLists((ls) => (ls ?? []).map((l) => (l.listId === saved.listId ? saved : l)));
      setDraft(saved.items);
      toast.success("Lista salvata");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast.warning(LIST_CONFLICT_MESSAGE);
        await reload(list.listId);
      } else if (e instanceof ApiError && e.status === 422 && (e.body as { usedCodes?: string[] })?.usedCodes?.length) {
        const used = (e.body as { usedCodes: string[] }).usedCodes;
        setError(`Codici già usati in pratiche, non si possono togliere: ${used.join(", ")}. Disattivali.`);
      } else {
        setError((e as Error).message);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6" data-testid="lists-editor">
      {confirmDialog}
      <div className="grid grid-cols-1 gap-4 border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Gestore</Label>
          <Select value={scope} onValueChange={changeScope}>
            <SelectTrigger data-testid="lists-scope">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={COMMON}>Comuni a tutti i gestori</SelectItem>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Gruppo</Label>
          <Select value={group} onValueChange={changeGroup}>
            <SelectTrigger data-testid="lists-group">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tutti i gruppi</SelectItem>
              {GROUP_ORDER.map((g: GroupId) => (
                <SelectItem key={g} value={g}>{GROUP_LABEL[g]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <nav className="border border-border bg-card" aria-label="Liste">
          {lists === null ? (
            <p className="p-4 font-mono text-xs text-muted-foreground">Caricamento…</p>
          ) : loadError ? (
            <p className="p-4 text-sm text-status-error" role="alert" data-testid="lists-load-error">
              {loadError}
            </p>
          ) : visible.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nessuna lista.</p>
          ) : (
            <ul className="divide-y divide-border">
              {visible.map((l) => (
                <li key={l.listId}>
                  <button
                    type="button"
                    onClick={() => select(l.listId)}
                    data-testid={`list-${l.listId}`}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm hover:bg-accent",
                      l.listId === selected && "bg-foreground text-background hover:bg-foreground"
                    )}
                  >
                    <span className="truncate">{l.label}</span>
                    <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider opacity-70">
                      {l.kind === "CONTROLLED" ? "controllata" : "configurabile"}
                      {!l.editable && <Lock className="h-3 w-3" aria-label="Sola lettura" />}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>

        {list && (
          <section className="border border-border bg-card" data-testid="list-detail">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <h2 className="font-heading text-xl font-black tracking-tight">{list.label}</h2>
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {controlled ? "Lista controllata: si cambiano solo le etichette" : "Lista configurabile"}
                  {list.group ? ` · gestita dai team leader ${GROUP_LABEL[list.group]}` : " · gestita dall'ADMIN"}
                </p>
              </div>
              {!editable && (
                <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <Lock className="h-3.5 w-3.5" /> Sola lettura
                </span>
              )}
            </header>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="w-20 px-3 py-2 font-medium">Ordine</th>
                    <th className="px-3 py-2 font-medium">Etichetta</th>
                    <th className="px-3 py-2 font-medium">Codice</th>
                    <th className="w-28 px-3 py-2 font-medium">Attiva</th>
                    <th className="w-12 px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {draft.map((it, i) => (
                    <tr key={`${it.code}-${i}`} className={cn("border-b border-border", !it.active && "text-muted-foreground")} data-testid={`list-item-${i}`}>
                      <td className="px-3 py-1.5">
                        {editable && !controlled ? (
                          <div className="flex gap-1">
                            <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Sposta su">
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5" disabled={i === draft.length - 1} onClick={() => move(i, 1)} aria-label="Sposta giù">
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <span className="font-mono text-xs tabular">{i + 1}</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        {editable ? (
                          <Input
                            value={it.label}
                            aria-label={`Etichetta ${i + 1}`}
                            onChange={(e) =>
                              update(i, it.isNew ? { label: e.target.value, code: codeFromLabel(e.target.value) } : { label: e.target.value })
                            }
                          />
                        ) : (
                          it.label
                        )}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-xs">
                        {editable && it.isNew ? (
                          <Input
                            value={it.code}
                            aria-label={`Codice ${i + 1}`}
                            className="font-mono"
                            onChange={(e) => update(i, { code: e.target.value.toUpperCase() })}
                          />
                        ) : (
                          <span title="Un codice salvato non si rinomina">{it.code}</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <Switch
                          checked={it.active}
                          disabled={!editable || controlled}
                          onCheckedChange={(on) => update(i, { active: on })}
                          aria-label={`Attiva ${it.label || i + 1}`}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        {editable && it.isNew && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-1.5 hover:text-status-error"
                            onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}
                            aria-label="Togli la voce"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {editable && (
              <footer className="space-y-3 px-4 py-3">
                {!controlled && (
                  <p className="text-xs text-muted-foreground">
                    Una voce già salvata non si toglie: si disattiva, e non compare più nelle nuove scelte.
                  </p>
                )}
                {error && (
                  <p className="border border-status-error px-3 py-2 text-sm text-status-error" role="alert">
                    {error}
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {!controlled ? (
                    <Button type="button" variant="outline" onClick={add} data-testid="list-add">
                      <Plus className="h-4 w-4" /> Aggiungi voce
                    </Button>
                  ) : (
                    <span />
                  )}
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" disabled={!dirty || saving} onClick={() => { setDraft(list.items); setError(null); }}>
                      <Undo2 className="h-4 w-4" /> Annulla
                    </Button>
                    <Button type="button" disabled={!dirty || saving} onClick={save} data-testid="list-save">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salva lista
                    </Button>
                  </div>
                </div>
              </footer>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
