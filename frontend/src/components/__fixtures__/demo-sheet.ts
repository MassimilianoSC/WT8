/**
 * TEST FIXTURE (cutover D-161): demo practices, saves, iterations and history of the sheet, moved out of the app code.
 * Tests plug it in with vi.mock(<source>, ...) in place of the real API calls.
 */
import type { FieldChange, FieldChangeResponse, FieldValue, HistoryEntryDTO, HistoryResponse, HistoryView, PraticaDetailDTO, TemplateDTO, ToastDTO } from "@/lib/contract";
import { MOCK_PRATICHE } from "@/components/__fixtures__/demo-data";
import { isDeleted, storeDelete, storeGet, storePut } from "@/components/__fixtures__/demo-store";
import { buildDemoPractice, demoProgress, demoRepeats } from "@/components/__fixtures__/demo-practice";
import { applyPending, changeKey, isRowOp, type ValueChange } from "@/components/scheda/changes";
import { fixtureTemplate as fetchTemplate } from "@/components/__fixtures__/fixture-template";

// ─── Demo store (USE_MOCK) ──────────────────────────────────────────────────

/** Demo practice by id: the stored one, else built from the clicked demo row on its real template. */
export async function mockGet(id: string): Promise<PraticaDetailDTO | null> {
  const stored = storeGet(id);
  if (stored) return stored;
  const row = MOCK_PRATICHE.find((p) => p.id === id);
  if (!row || isDeleted(id)) return null;
  const practice = buildDemoPractice(await fetchTemplate(row.templateId), row, { filled: true });
  storePut(practice);
  return practice;
}

export const mockPut = storePut;
export const mockDelete = storeDelete;

/** Core and secondary data of a practice (inherited by resubmission and rework). */
export function coreValues(t: TemplateDTO, p: PraticaDetailDTO): Record<string, FieldValue> {
  const core = t.occurrences.filter(
    (o) => o.kind === "MASTER" && o.flowId && !o.repeatGroup && /\.CORE|DATI_SECONDARI/.test(o.sectionKey) && !/\bODA\b/i.test(o.label)
  );
  return Object.fromEntries(core.map((o) => [o.flowId as string, p.values[o.flowId as string] ?? null]));
}

async function mockIteration(id: string, n: number): Promise<PraticaDetailDTO> {
  const practice = await mockGet(id);
  if (!practice) throw new Error("Pratica non trovata");
  const template = await fetchTemplate(practice.templateId);
  const values = coreValues(template, practice);
  const repeats = demoRepeats(template, true);
  return {
    ...practice,
    iteration: n,
    statoAttivita: "KO",
    values,
    repeats,
    progress: demoProgress(template, { values, repeats }),
    iterationId: `it-${id}-${n}`,
    statoSource: "AUTO",
    manualLocks: [],
    access: {},
    repeatAccess: Object.fromEntries(Object.keys(practice.repeatAccess).map((k) => [k, { canAddRows: false, canRemoveRows: false }])),
    actions: {
      assignableGroups: [],
      canAssign: false,
      canChangeStato: false,
      canArchive: false,
      canRestore: false,
      canDelete: false,
      canRework: false,
      canResubmit: false,
    },
    alerts: [],
  };
}

async function mockHistory(id: string, iteration: number, page: number, view: HistoryView): Promise<HistoryResponse> {
  const practice = await mockGet(id);
  const base = { practiceId: id, iteration };
  const pm = { userId: "u-pm-1", userName: "[demo] Laura Verdi", source: "USER" as const };
  const sys = { userId: null, userName: null, source: "SYSTEM" as const };
  // Value entries on the fields the demo practice actually has.
  const dated = Object.entries(practice?.values ?? {}).filter(([, v]) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v as string));
  const fieldEntries: HistoryEntryDTO[] = dated.map(([flowId, v], i) => ({
    ...base,
    ...pm,
    id: `hf${i}`,
    kind: "FIELD",
    flowId,
    oldValue: null,
    newValue: v,
    timestamp: `${v as string}T10:0${i}:00+02:00`,
  }));
  const all: HistoryEntryDTO[] = [
    ...fieldEntries,
    { ...base, ...pm, id: "hn", kind: "FIELD", transversal: "noteOperative", noteGroup: "PM_PERMESSI", oldValue: "", newValue: "[demo] Accesso con il custode", timestamp: "2026-09-03T08:15:00+02:00" },
    { ...base, ...pm, id: "ha", kind: "ASSIGN", detail: "[demo] Assegna a UT/PE — nota: sopralluogo da fissare con il custode", timestamp: "2026-09-05T09:30:00+02:00" },
    { ...base, ...sys, id: "hal", kind: "ALERT_OPEN", detail: "[demo] Alert SOPRALLUOGO aperto", timestamp: "2026-09-11T09:00:00+02:00" },
    { ...base, ...pm, id: "hc", kind: "CREATE", detail: `[demo] Pratica creata (template ${practice?.templateId ?? ""})`, timestamp: "2026-09-01T09:00:00+02:00" },
  ];
  const valueKinds = ["FIELD", "ROW_ADD", "ROW_REMOVE"];
  const sorted = all
    .filter((e) => (view === "fields") === valueKinds.includes(e.kind))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const pageSize = 5;
  return { items: sorted.slice((page - 1) * pageSize, page * pageSize), total: sorted.length, page, pageSize };
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The demo's Forecast Ottenimento Permessi and its Protocollo, from the template. */
function forecastPair(t: TemplateDTO): { forecast: string; protocollo: string } | null {
  const forecast = t.occurrences.find((o) => o.kind === "MASTER" && o.computed?.formula === "FORECAST_OTTENIMENTO_PERMESSI");
  const protocollo = forecast
    ? t.occurrences.find(
        (o) => o.kind === "MASTER" && o.dataType === "DATE" && o.sectionKey === forecast.sectionKey && /^(data )?protocollo$/i.test(o.label.trim())
      )
    : undefined;
  return forecast?.flowId && protocollo?.flowId ? { forecast: forecast.flowId, protocollo: protocollo.flowId } : null;
}

let mockRowSeq = 0;

/** Applies the changes locally, mimicking the backend's recalculation toast
 *  for Forecast Ottenimento Permessi (D-42, toast only on a real change). */
async function mockSave(practice: PraticaDetailDTO, changes: FieldChange[]): Promise<FieldChangeResponse> {
  const template = await fetchTemplate(practice.templateId);
  const pending = new Map<string, ValueChange>();
  const createdRows: Record<string, string> = {};
  let repeats = { ...practice.repeats };
  for (const c of changes) {
    if (isRowOp(c)) {
      const rows = repeats[c.repeat] ?? [];
      if (c.op === "ADD_ROW") {
        const rowId = `nuova-${++mockRowSeq}`;
        createdRows[c.clientRowKey] = rowId;
        repeats = { ...repeats, [c.repeat]: [...rows, { rowId, values: { ...c.values } }] };
      } else {
        repeats = { ...repeats, [c.repeat]: rows.filter((r) => r.rowId !== c.rowId) };
      }
    } else {
      pending.set(changeKey(c), c);
    }
  }
  let next = applyPending({ ...practice, repeats }, pending);
  const toasts: ToastDTO[] = [];
  const pair = forecastPair(template);
  if (pair) {
    // The forecast follows the protocol until someone sets it by hand.
    if (pending.has(`F:${pair.forecast}`)) next = { ...next, manualLocks: Array.from(new Set([...next.manualLocks, pair.forecast])) };
    const protocollo = next.values[pair.protocollo];
    const forecast = typeof protocollo === "string" ? addDays(protocollo, 67) : null;
    if (pending.has(`F:${pair.protocollo}`) && forecast && !next.manualLocks.includes(pair.forecast) && forecast !== next.values[pair.forecast]) {
      next = { ...next, values: { ...next.values, [pair.forecast]: forecast } };
      toasts.push({
        kind: "INFO",
        message: `Forecast Ottenimento Permessi ricalcolato: ${forecast.split("-").reverse().join("/")}`,
        flowId: pair.forecast,
      });
    }
  }
  next = {
    ...next,
    progress: demoProgress(template, next),
    revision: practice.revision + 1,
    updatedAt: new Date().toISOString(),
  };
  mockPut(next);
  return { practice: next, toasts, createdRows };
}

async function mockLoadSheet(id: string): Promise<{ template: TemplateDTO; practice: PraticaDetailDTO }> {
  const practice = await mockGet(id);
  if (!practice) throw new Error("Pratica non trovata");
  return { template: await fetchTemplate(practice.templateId), practice };
}

/** Same signatures as sheet-source (fetchTemplate stays real: tests serve the templates). */
export const demoSheet = {
  loadSheet: mockLoadSheet,
  reloadPractice: async (id: string) => (await mockLoadSheet(id)).practice,
  loadIteration: mockIteration,
  saveFields: mockSave,
  loadHistory: mockHistory,
};
