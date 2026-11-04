/**
 * TEST FIXTURE (cutover D-161): demo data from demo-practice.ts, moved out of the app code.
 * Tests plug it in with vi.mock(<source>, ...) in place of the real API calls.
 */
import {
  GROUP_IDS,
  type AlertDTO,
  type FieldOccurrenceDTO,
  type FieldValue,
  type GroupId,
  type OccurrenceAccessDTO,
  type PraticaDetailDTO,
  type PraticaSummaryDTO,
  type RepeatAccessDTO,
  type RepeatRowDTO,
  type TemplateDTO,
} from "@/lib/contract";
import { buildRepeatIndex } from "@/components/scheda/conditions";
import { buildSheetFromTemplate, sectionProgress } from "@/components/scheda/layout";

/**
 * Demo practice built from a REAL template (GET /api/templates/{id}), for the
 * admin preview while the practices API (B5) does not exist. Values are fake
 * and deterministic; structure, access and rights follow the contract.
 */

export type DemoHeader = Pick<
  PraticaSummaryDTO,
  | "id"
  | "codiceSito"
  | "nomeSito"
  | "codiceG7"
  | "committente"
  | "clienteFinale"
  | "iteration"
  | "statoAttivita"
  | "enabledGroups"
  | "originPracticeId"
  | "createdAt"
  | "updatedAt"
> &
  Partial<Pick<PraticaSummaryDTO, "archived" | "archivedAt">>;

/** Value of the right shape for an occurrence (G7 is NUMBER in the templates). */
function typed(o: FieldOccurrenceDTO | undefined, text: string | null): FieldValue {
  if (!o || text === null) return null;
  if (o.dataType === "NUMBER") return Number.isFinite(Number(text)) ? Number(text) : null;
  return text;
}

function master(t: TemplateDTO, label: string): FieldOccurrenceDTO | undefined {
  return t.occurrences.find((o) => o.kind === "MASTER" && o.label.trim().toLowerCase() === label.toLowerCase());
}

function byList(t: TemplateDTO, listId: string): FieldOccurrenceDTO | undefined {
  return t.occurrences.find((o) => o.kind === "MASTER" && o.list?.listId === listId);
}

/** ADMIN access (contract §5.1 order): mirrors and non-overridable computed
 *  fields stay read-only; ADMIN passes group and Assegna. */
export function adminAccess(t: TemplateDTO): Record<string, OccurrenceAccessDTO> {
  const access: Record<string, OccurrenceAccessDTO> = {};
  for (const o of [...t.occurrences, ...t.transversal]) {
    if (o.kind === "MIRROR") access[o.occurrenceKey] = { editable: false, reason: "MIRROR" };
    else if (o.computed && !o.computed.manualOverride) access[o.occurrenceKey] = { editable: false, reason: "COMPUTED" };
    else access[o.occurrenceKey] = { editable: true };
  }
  return access;
}

export function demoRepeatAccess(t: TemplateDTO): Record<string, RepeatAccessDTO> {
  return Object.fromEntries(
    t.repeatGroups.map((r) => {
      const dynamic = r.rowPolicy === "DYNAMIC";
      return [r.key, { canAddRows: dynamic, canRemoveRows: dynamic }];
    })
  );
}

/** Rows: the 11 Vincoli (some compiled when `filled`), one row per dynamic group. */
export function demoRepeats(t: TemplateDTO, filled: boolean): Record<string, RepeatRowDTO[]> {
  return Object.fromEntries(
    t.repeatGroups.map((r) => {
      if (r.schemaKind === "VINCOLI") {
        return [
          r.key,
          t.constraints.map((c, i) => ({
            rowId: `vinc-${c.code}`,
            values: {},
            constraint: { code: c.code, stato: filled && i < 3 ? { code: "ASSENTE" } : null, ente: null },
          })),
        ];
      }
      return [r.key, filled ? [{ rowId: `${r.key.toLowerCase()}-1`, values: {} }] : []];
    })
  );
}

function demoDates(t: TemplateDTO): Record<string, FieldValue> {
  // A few dates in the PM preliminary and authorisation sections.
  const dates = ["2026-09-02", "2026-09-10", "2026-09-20", "2026-10-01"];
  const targets = t.occurrences.filter(
    (o) =>
      o.kind === "MASTER" &&
      o.dataType === "DATE" &&
      !o.repeatGroup &&
      !o.computed &&
      !o.condition &&
      /FASE_PRELIMINARE|ITER_AUTORIZZATIVO/.test(o.sectionKey)
  );
  return Object.fromEntries(targets.slice(0, dates.length).map((o, i) => [o.flowId as string, dates[i]]));
}

/** Note Operative of every group, empty (ADMIN sees them all, D-121). */
export function emptyNotes(): PraticaDetailDTO["transversal"]["noteOperative"] {
  return Object.fromEntries(GROUP_IDS.map((g) => [g, ""]));
}

/** Progress per group with the same rule as the sheet's counters (v0.1.7). */
export function demoProgress(t: TemplateDTO, p: Pick<PraticaDetailDTO, "values" | "repeats">): PraticaSummaryDTO["progress"] {
  const data = { values: p.values, repeats: p.repeats, repeatOf: buildRepeatIndex(t) };
  const progress = Object.fromEntries(GROUP_IDS.map((g) => [g, { filled: 0, total: 0 }])) as PraticaSummaryDTO["progress"];
  for (const g of buildSheetFromTemplate(t)) {
    for (const s of g.sections) {
      const { filled, total } = sectionProgress(s, data);
      progress[g.group].filled += filled;
      progress[g.group].total += total;
    }
  }
  return progress;
}

export function buildDemoPractice(t: TemplateDTO, h: DemoHeader, opts: { filled: boolean }): PraticaDetailDTO {
  const values: Record<string, FieldValue> = opts.filled ? demoDates(t) : {};
  const set = (o: FieldOccurrenceDTO | undefined, v: FieldValue) => {
    if (o?.flowId) values[o.flowId] = v;
  };
  set(master(t, "Codice G7"), typed(master(t, "Codice G7"), h.codiceG7));
  set(master(t, "Codice Sito"), h.codiceSito);
  set(master(t, "Nome Sito"), h.nomeSito);
  set(byList(t, "COMMITTENTE"), h.committente);
  set(byList(t, "CLIENTE_FINALE"), h.clienteFinale);

  const repeats = demoRepeats(t, opts.filled);
  const firstDate = Object.keys(values).find((k) => typeof values[k] === "string" && /^\d{4}-/.test(values[k] as string));
  const alerts: AlertDTO[] =
    opts.filled && firstDate
      ? [
          {
            id: `al-${h.id}`,
            practiceId: h.id,
            iteration: h.iteration,
            rule: "SOPRALLUOGO",
            label: "[demo] Data sopralluogo non compilata a 7 giorni dalla Data assegnazione",
            flowId: firstDate,
            executionStatus: "ACTIVE",
            openedAt: "2026-09-11T09:00:00+02:00",
            dueAt: "2026-09-11",
            status: "OPEN",
            canCloseManually: false,
          },
        ]
      : [];
  const allGroups: GroupId[] = [...GROUP_IDS];
  const archived = h.archived === true;

  const practice: PraticaDetailDTO = {
    ...h,
    templateId: t.id,
    archived: false,
    archivedAt: null,
    openAlerts: alerts.length,
    progress: demoProgress(t, { values, repeats }),
    revision: 1,
    iterationId: `it-${h.id}-${h.iteration}`,
    templateVersion: t.version,
    statoSource: "AUTO",
    manualLocks: [],
    // ADMIN preview: every group's note is visible (D-121).
    transversal: { noteOperative: emptyNotes(), fatturabile: "NO", fatturabileManual: false, fatturato: null },
    values,
    repeats,
    access: adminAccess(t),
    repeatAccess: demoRepeatAccess(t),
    actions: {
      assignableGroups: allGroups.filter((g) => g !== "PM_PERMESSI"),
      canAssign: true,
      canChangeStato: true,
      canArchive: h.statoAttivita === "TERMINATO" || h.statoAttivita === "KO",
      canRestore: false,
      canDelete: h.statoAttivita === "CREATA" && h.iteration === 1,
      canRework: true,
      canResubmit: true,
    },
    iterations: Array.from({ length: h.iteration }, (_, i) => ({
      id: `it-${h.id}-${i + 1}`,
      n: i + 1,
      codiceG7: h.codiceG7,
      createdAt: h.createdAt,
      current: i + 1 === h.iteration,
    })),
    alerts,
  };
  return archived ? archivedView(practice, h.archivedAt ?? practice.updatedAt) : practice;
}

/** An archived practice: read-only until restored, alerts suspended (D-28). */
export function archivedView(p: PraticaDetailDTO, archivedAt: string): PraticaDetailDTO {
  return {
    ...p,
    archived: true,
    archivedAt,
    access: Object.fromEntries(Object.keys(p.access).map((k) => [k, { editable: false, reason: "ARCHIVED" as const }])),
    repeatAccess: Object.fromEntries(Object.keys(p.repeatAccess).map((k) => [k, { canAddRows: false, canRemoveRows: false }])),
    actions: {
      ...p.actions,
      assignableGroups: [],
      canAssign: false,
      canChangeStato: false,
      canArchive: false,
      canRestore: true,
      canDelete: false,
      canResubmit: false,
      // Rework from an archived practice is allowed (v0.1.7).
      canRework: true,
    },
    alerts: p.alerts.map((a) => ({ ...a, executionStatus: "SUSPENDED" as const })),
  };
}
