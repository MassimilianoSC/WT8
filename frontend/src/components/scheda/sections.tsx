"use client";
import * as React from "react";
import { useConfirm } from "@/components/layout/use-confirm";
import { AlertTriangle, Lock, Plus, Trash2 } from "lucide-react";
import type {
  AlertDTO,
  ConstraintDefDTO,
  FieldChange,
  ListRefDTO,
  FieldOccurrenceDTO,
  FieldValue,
  GroupId,
  OccurrenceAccessDTO,
  RepeatAccessDTO,
  RepeatGroupDTO,
  RepeatRowDTO,
} from "@/lib/contract";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GROUP_LABEL } from "@/components/pratiche/labels";
import { isVisible, type ConditionContext } from "@/components/scheda/conditions";
import { Field, readOnlyReason } from "@/components/scheda/fields/field";
import { Combobox } from "@/components/scheda/fields/combobox";
import { selectLabel } from "@/components/scheda/fields/format";
import type { Option } from "@/components/scheda/fields/format";
import { sectionProgress, type Block, type GroupView, type SectionView, type SheetValues } from "@/components/scheda/layout";
import { sectionAlerts, type HiddenAlert } from "@/components/scheda/alert-visibility";

export interface OptionsResult {
  options?: Option[];
  loading?: boolean;
  /** Why the menu is empty, in plain Italian. */
  emptyText?: string;
}

export interface SheetSectionsProps {
  groups: GroupView[];
  data: SheetValues;
  access: Record<string, OccurrenceAccessDTO | undefined>;
  /** Row add/remove rights per repeat group, from the backend (v0.1.6). */
  repeatAccess: Record<string, RepeatAccessDTO | undefined>;
  alerts: AlertDTO[];
  enabledGroups: GroupId[];
  /** Open section keys (controlled, so the side index can open them). */
  open: string[];
  onOpenChange: (keys: string[]) => void;
  /** When set, every field is read-only with this reason (past iteration). */
  lockedReason?: string;
  /** The 11 rows of the Vincoli table (TemplateDTO.constraints). */
  constraints: ConstraintDefDTO[];
  /** Computed flowIds overridden by hand (PraticaDetailDTO.manualLocks). */
  manualLocks: string[];
  /** Options of a list; `parentValue` is the value of `list.parentFlowId`
   *  (ISTAT cascade), resolved on the same row if any. */
  getOptions: (list: ListRefDTO, parentValue: FieldValue | undefined) => OptionsResult;
  onChange: (change: FieldChange) => void;
}

interface RenderCtx {
  groups: GroupView[];
  data: SheetValues;
  access: SheetSectionsProps["access"];
  repeatAccess: SheetSectionsProps["repeatAccess"];
  lockedReason?: string;
  constraints: ConstraintDefDTO[];
  manualLocks: Set<string>;
  /** Open, active alerts by `flowId` or `flowId#rowId` (row alerts, v0.1.7). */
  alertByFlow: Map<string, AlertDTO>;
  getOptions: SheetSectionsProps["getOptions"];
  onChange: SheetSectionsProps["onChange"];
}

/** Sections of the main view, grouped by operational group (G §9, §17.1). */
export function SheetSections({
  groups,
  data,
  access,
  repeatAccess,
  alerts,
  enabledGroups,
  open,
  onOpenChange,
  lockedReason,
  constraints,
  manualLocks,
  getOptions,
  onChange,
}: SheetSectionsProps) {
  const alertByFlow = React.useMemo(() => alertIndex(alerts), [alerts]);
  const locks = React.useMemo(() => new Set(manualLocks), [manualLocks]);

  const ctx: RenderCtx = {
    groups,
    data,
    access,
    repeatAccess,
    lockedReason,
    constraints,
    manualLocks: locks,
    alertByFlow,
    getOptions,
    onChange,
  };

  return (
    <Accordion type="multiple" value={open} onValueChange={onOpenChange} className="space-y-8" data-testid="sheet-sections">
      {groups.map((g) => {
        const enabled = enabledGroups.includes(g.group);
        return (
          <section key={g.group} id={`gruppo-${g.group}`} data-testid={`sheet-group-${g.group}`} className="scroll-mt-20">
            <div className="mb-3 flex items-baseline justify-between gap-3 border-b-2 border-foreground pb-2">
              <h2 className="font-heading text-xl font-black tracking-tight">{GROUP_LABEL[g.group]}</h2>
              {!enabled && (
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Non ancora assegnato
                </span>
              )}
            </div>
            <div className={cn("space-y-2", !enabled && "opacity-70")}>
              {g.sections.map((s, i) => {
                const prev = g.sections[i - 1];
                const showSub = s.section.subsection && s.section.subsection !== prev?.section.subsection;
                return (
                  <React.Fragment key={s.section.key}>
                    {showSub && (
                      <div className="pt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        Sezione {s.section.subsection}
                      </div>
                    )}
                    <SectionItem view={s} ctx={ctx} />
                  </React.Fragment>
                );
              })}
            </div>
          </section>
        );
      })}
    </Accordion>
  );
}

/** Open alerts still running (an archived practice suspends them). */
export function alertIndex(alerts: AlertDTO[]): Map<string, AlertDTO> {
  const map = new Map<string, AlertDTO>();
  for (const a of alerts) {
    if (a.status !== "OPEN" || a.executionStatus !== "ACTIVE" || !a.flowId) continue;
    const key = a.rowId ? `${a.flowId}#${a.rowId}` : a.flowId;
    if (!map.has(key)) map.set(key, a);
    if (!map.has(a.flowId)) map.set(a.flowId, a); // section counters and index
  }
  return map;
}

function newClientRowKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `row-${Date.now()}`;
}

/** A section whose fields are all hidden by conditions stays visible with 0/n (D-122). */
function SectionItem({ view, ctx }: { view: SectionView; ctx: RenderCtx }) {
  const { filled, total } = sectionProgress(view, ctx.data);
  const editable = !ctx.lockedReason && view.occurrences.some((o) => ctx.access[o.occurrenceKey]?.editable);
  // Only alerts on fields shown here, or hidden everywhere (L9): the counter matches what the section shows.
  const { count: alertCount, hidden } = sectionAlerts(view, ctx.groups, ctx.data, ctx.alertByFlow);

  return (
    <AccordionItem value={view.section.key} id={`sezione-${view.section.key}`} className="scroll-mt-20 bg-card">
      <AccordionTrigger data-testid={`section-trigger-${view.section.key}`}>
        <span className="flex flex-1 items-center gap-3 text-left">
          <span>{view.section.label}</span>
          <span className="font-mono text-[10px] tabular text-muted-foreground">
            {filled}/{total}
          </span>
          {alertCount > 0 && (
            <span className="flex items-center gap-1 text-status-error" title={`${alertCount} campi con alert aperto`}>
              <AlertTriangle className="h-3 w-3" /> {alertCount}
            </span>
          )}
          {!editable && <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Sola lettura" />}
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-6">
        {hidden.length > 0 && <HiddenAlerts hidden={hidden} sectionKey={view.section.key} />}
        {view.blocks.map((b, i) => (
          <BlockView key={i} block={b} ctx={ctx} />
        ))}
      </AccordionContent>
    </AccordionItem>
  );
}

/** Alerts on fields this section hides with a condition: say where they show, or what to fill. */
function HiddenAlerts({ hidden, sectionKey }: { hidden: HiddenAlert[]; sectionKey: string }) {
  const quote = (labels: string[]) => labels.map((l) => `«${l}»`).join(" e ");
  return (
    <div className="space-y-1 border-l-4 border-status-error px-3 py-1 text-sm" id={`alert-nascosti-${sectionKey}`} data-testid={`hidden-alerts-${sectionKey}`}>
      {hidden.map((h) => (
        <p key={h.occurrence.occurrenceKey} className="flex gap-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-error" />
          <span>
            Alert aperto su «{h.occurrence.label}», nascosto qui da una condizione
            {h.visibleIn
              ? `: si vede in «${h.visibleIn.section.label}».`
              : h.controllers.length
                ? `: compila ${quote(h.controllers)} per vederlo.`
                : "."}
          </span>
        </p>
      ))}
    </div>
  );
}

function BlockView({ block, ctx }: { block: Block; ctx: RenderCtx }) {
  if (block.kind === "fields") {
    const cond: ConditionContext = ctx.data;
    return <FieldGrid occurrences={block.occurrences} values={ctx.data.values} cond={cond} ctx={ctx} />;
  }
  if (block.kind === "repeat") return <RepeatBlock repeat={block.repeat} occurrences={block.occurrences} ctx={ctx} />;

  // Pop-up (G §6 case 3): a framed block inside the section (D-122).
  return (
    <div className="border border-foreground" data-testid={`popup-${block.popup.key}`}>
      <div className="flex items-center justify-between border-b border-foreground bg-secondary px-3 py-2 font-mono text-[10px] uppercase tracking-wider">
        <span>{block.popup.label}</span>
        <span className="text-muted-foreground">Da {GROUP_LABEL[block.popup.sourceGroup]}</span>
      </div>
      <div className="space-y-4 p-3">
        {block.blocks.map((b, i) => (
          <BlockView key={i} block={b} ctx={ctx} />
        ))}
      </div>
    </div>
  );
}

function FieldGrid({
  occurrences,
  values,
  cond,
  ctx,
  row,
}: {
  occurrences: FieldOccurrenceDTO[];
  values: Record<string, FieldValue | undefined>;
  cond: ConditionContext;
  ctx: RenderCtx;
  row?: { repeat: string; rowId: string };
}) {
  const visible = occurrences.filter((o) => isVisible(o.condition, cond));
  if (visible.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {visible.map((o) => {
        const flowId = o.flowId as string;
        const parentId = o.list?.parentFlowId;
        const parentValue = parentId
          ? row && ctx.data.repeatOf.get(parentId) === row.repeat
            ? values[parentId]
            : ctx.data.values[parentId]
          : undefined;
        const { options, loading, emptyText } = o.list ? ctx.getOptions(o.list, parentValue) : ({} as OptionsResult);
        return (
          <Field
            key={o.occurrenceKey}
            occurrence={o}
            value={values[flowId]}
            access={ctx.lockedReason ? { editable: false } : ctx.access[o.occurrenceKey]}
            reasonOverride={ctx.lockedReason}
            alert={ctx.alertByFlow.get(row ? `${flowId}#${row.rowId}` : flowId) ?? (row ? undefined : undefined)}
            manualLocked={ctx.manualLocks.has(flowId)}
            options={options}
            optionsLoading={loading}
            optionsEmptyText={emptyText}
            idSuffix={row?.rowId}
            onChange={(value) =>
              ctx.onChange(
                row
                  ? { occurrenceKey: o.occurrenceKey, repeat: row.repeat, rowId: row.rowId, flowId, value }
                  : { occurrenceKey: o.occurrenceKey, flowId, value }
              )
            }
          />
        );
      })}
    </div>
  );
}

function RepeatBlock({
  repeat,
  occurrences,
  ctx,
}: {
  repeat: RepeatGroupDTO;
  occurrences: FieldOccurrenceDTO[];
  ctx: RenderCtx;
}) {
  const [confirm, confirmDialog] = useConfirm();
  if (repeat.schemaKind === "VINCOLI") return <VincoliTable repeat={repeat} occurrences={occurrences} ctx={ctx} />;

  const rows: RepeatRowDTO[] = ctx.data.repeats[repeat.key] ?? [];
  // Missing rights = no add/remove: the backend decides (FIXED rows: never).
  const canAdd = !ctx.lockedReason && repeat.rowPolicy === "DYNAMIC" && ctx.repeatAccess[repeat.key]?.canAddRows === true;
  const canRemove = !ctx.lockedReason && ctx.repeatAccess[repeat.key]?.canRemoveRows === true;

  return (
    <>
      {confirmDialog}
    <div className="space-y-3" data-testid={`repeat-${repeat.key}`}>
      <div className="flex items-center justify-between border-b border-border pb-1">
        <span className="font-mono text-xs uppercase tracking-wider">
          {repeat.label} <span className="text-muted-foreground">({rows.length})</span>
        </span>
      </div>
      {rows.length === 0 && <p className="font-mono text-xs text-muted-foreground">Nessuna voce.</p>}
      {rows.map((r, i) => {
        const cond: ConditionContext = { ...ctx.data, row: { repeat: repeat.key, values: r.values } };
        const removable = canRemove && !r.locked;
        const last = i === rows.length - 1;
        return (
          <div
            key={r.rowId}
            className={cn("border bg-background", last && canAdd ? "border-foreground" : "border-border")}
            data-testid={`repeat-row-${repeat.key}-${r.rowId}`}
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {repeat.label} #{i + 1}
                {r.origin && " · creata automaticamente"}
              </span>
              {removable && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-muted-foreground hover:text-status-error"
                  onClick={async () => {
                    const ok = await confirm({
                      title: `Rimuovere ${repeat.label} #${i + 1}?`,
                      description: "La riga si toglie subito, insieme ai suoi valori.",
                      confirmLabel: "Rimuovi",
                      destructive: true,
                    });
                    if (ok) ctx.onChange({ repeat: repeat.key, op: "REMOVE_ROW", rowId: r.rowId });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Rimuovi
                </Button>
              )}
            </div>
            {r.warning && (
              <div className="flex items-center gap-2 border-b border-status-error px-3 py-1.5 font-mono text-[10px] text-status-error">
                <AlertTriangle className="h-3 w-3" /> {r.warning}
              </div>
            )}
            <div className="p-3">
              <FieldGrid
                occurrences={occurrences}
                values={r.values}
                cond={cond}
                ctx={ctx}
                row={{ repeat: repeat.key, rowId: r.rowId }}
              />
            </div>
          </div>
        );
      })}
      {canAdd && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => ctx.onChange({ repeat: repeat.key, op: "ADD_ROW", clientRowKey: newClientRowKey() })}
          data-testid={`repeat-add-${repeat.key}`}
        >
          <Plus className="h-4 w-4" /> Aggiungi {repeat.label}
        </Button>
      )}
    </div>
    </>
  );
}

/**
 * The common Vincoli table (D-35, v0.1.7): 11 fixed rows, each with a state
 * and an Ente (list, or a single default Ente). Editable like the container
 * occurrence of the section.
 */
function VincoliTable({
  repeat,
  occurrences,
  ctx,
}: {
  repeat: RepeatGroupDTO;
  occurrences: FieldOccurrenceDTO[];
  ctx: RenderCtx;
}) {
  const container = occurrences[0];
  const rows = ctx.data.repeats[repeat.key] ?? [];
  const access = container ? ctx.access[container.occurrenceKey] : undefined;
  const editable = !ctx.lockedReason && access?.editable === true;
  const reason = ctx.lockedReason ?? (container ? readOnlyReason(container, access) : "Sola lettura");
  const defs = new Map(ctx.constraints.map((c) => [c.code, c]));

  return (
    <div className="space-y-2" data-testid={`repeat-${repeat.key}`}>
      <div className="flex items-center justify-between border-b border-border pb-1">
        <span className="font-mono text-xs uppercase tracking-wider">{container?.label ?? repeat.label}</span>
        {!editable && (
          <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
            <Lock className="h-3 w-3" /> {reason}
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border border-border text-sm">
          <thead>
            <tr className="bg-secondary text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="w-1/3 px-3 py-2 font-medium">Vincolo</th>
              <th className="px-3 py-2 font-medium">Stato</th>
              <th className="px-3 py-2 font-medium">Ente</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const c = r.constraint;
              const def = c ? defs.get(c.code) : undefined;
              if (!c || !def) return null;
              const stateRes = ctx.getOptions(def.stateList, undefined);
              const enteRes = def.enteList ? ctx.getOptions(def.enteList, undefined) : ({} as OptionsResult);
              const states = stateRes.options ?? [];
              const enti = enteRes.options ?? [];
              const presente = c.stato?.code === "PRESENTE";
              return (
                <tr key={r.rowId} className="border-t border-border align-top" data-testid={`vincolo-${c.code}`}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{def.label}</div>
                    {presente && (
                      <div className="font-mono text-[10px] text-muted-foreground">crea la voce nel gruppo Ente</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editable ? (
                      <Combobox
                        options={states}
                        loading={stateRes.loading}
                        emptyText={stateRes.emptyText}
                        allowOther={false}
                        value={c.stato}
                        placeholder="—"
                        onChange={(v) => ctx.onChange({ repeat: "VINCOLI", rowId: r.rowId, constraint: { stato: v } })}
                      />
                    ) : (
                      <span>{c.stato ? selectLabel(c.stato, states) : "—"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {def.enteList ? (
                      editable ? (
                        <Combobox
                          options={enti}
                          loading={enteRes.loading}
                          emptyText={enteRes.emptyText}
                          allowOther={def.enteList.allowOther}
                          value={c.ente}
                          placeholder="—"
                          onChange={(v) => ctx.onChange({ repeat: "VINCOLI", rowId: r.rowId, constraint: { ente: v } })}
                        />
                      ) : (
                        <span>{c.ente ? selectLabel(c.ente, enti) : "—"}</span>
                      )
                    ) : (
                      <span className="text-sm text-muted-foreground" title="Ente predefinito">
                        {def.defaultEnteLabel ?? def.defaultEnte ?? "—"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
