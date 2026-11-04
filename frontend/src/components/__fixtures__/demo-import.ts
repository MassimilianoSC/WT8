/**
 * TEST FIXTURE (cutover D-161): demo import preview and commit (the file is not read), moved out of the app code.
 * Tests plug it in with vi.mock(<source>, ...) in place of the real API calls.
 */
import { ApiError } from "@/lib/client";
import type { FieldOccurrenceDTO, FieldValue, ImportCommitRequest, ImportPreviewDTO, ImportResultDTO, ImportRowDTO, TemplateDTO, TemplateId } from "@/lib/contract";
import { demoSummaries } from "@/components/__fixtures__/demo-store";
import { fixtureTemplate as fetchTemplate } from "@/components/__fixtures__/fixture-template";
import { loadCatalog, optionsOf } from "@/components/scheda/lists-source";
import { MOCK_USERS } from "@/components/scheda/mock-template";


function importable(t: TemplateDTO, o: FieldOccurrenceDTO): boolean {
  return o.kind === "MASTER" && !!o.flowId && !o.repeatGroup && !o.computed;
}

async function demoValue(o: FieldOccurrenceDTO, templateId: TemplateId): Promise<FieldValue | undefined> {
  switch (o.dataType) {
    case "NUMBER":
      return 12;
    case "DATE":
      return "2026-10-01";
    case "LONGTEXT":
      return "[demo] nota importata";
    case "TEXT":
      return "[demo] testo importato";
    case "USER":
      return { code: MOCK_USERS[0].code };
    case "USERS":
      return [{ code: MOCK_USERS[0].code }];
    default: {
      if (!o.list || o.list.kind === "ISTAT") return undefined;
      const first = optionsOf((await loadCatalog(templateId).catch(() => new Map())).get(o.list.listId)).find((x) => !x.inactive);
      if (!first) return undefined;
      return o.dataType === "MULTISELECT" ? [{ code: first.code }] : { code: first.code };
    }
  }
}

async function mockPreview(templateId: TemplateId): Promise<ImportPreviewDTO> {
  const t = await fetchTemplate(templateId);
  const labels = new Map<string, number>();
  for (const o of t.occurrences.filter((x) => x.kind === "MASTER")) labels.set(o.label, (labels.get(o.label) ?? 0) + 1);

  const fields = t.occurrences.filter((o) => importable(t, o)).slice(0, 8);
  const computed = t.occurrences.find((o) => o.kind === "MASTER" && o.computed);
  const repeated = t.occurrences.find((o) => o.kind === "MASTER" && (labels.get(o.label) ?? 0) > 1);

  const columns: ImportPreviewDTO["columns"] = [
    ...fields.map((o, i) => ({ header: i === 0 ? (o.flowId as string) : o.label, flowId: o.flowId })),
    ...(computed ? [{ header: computed.label, flowId: computed.flowId, note: "Non importabile: campo calcolato" }] : []),
    ...(repeated ? [{ header: repeated.label, flowId: null, note: "Etichetta ripetuta nel template: usare il flowId nell'intestazione (D-30)" }] : []),
    { header: "Colonna extra", flowId: null, note: "Intestazione non riconosciuta" },
  ];

  const changes: ImportRowDTO["changes"] = [];
  for (const o of fields) {
    const value = await demoValue(o, templateId);
    if (value !== undefined) changes.push({ flowId: o.flowId as string, label: o.label, value });
  }
  const skippedComputed = computed ? [{ flowId: computed.flowId as string, label: computed.label, reason: "NOT_IMPORTABLE" as const }] : [];
  // A date column with an impossible value (e.g. 31/02): skipped as INVALID, the row goes on.
  const dateField = t.occurrences.find((o) => importable(t, o) && o.dataType === "DATE");

  const existing = demoSummaries().filter((p) => p.templateId === templateId && !p.archived);
  const [a, b, c, d] = existing;
  const rows: ImportRowDTO[] = [
    { rowIndex: 1, outcome: "NEW_PRACTICE", changes, skipped: skippedComputed, errors: [] },
    {
      rowIndex: 2,
      outcome: "UPDATE",
      practiceId: a?.id,
      changes: changes.slice(3, 5),
      skipped: [
        ...changes.slice(0, 3).map((x) => ({ flowId: x.flowId, label: x.label, reason: "ALREADY_FILLED" as const })),
        ...(dateField
          ? [{ flowId: dateField.flowId as string, label: dateField.label, reason: "INVALID" as const, detail: "data non riconosciuta: 31/02/2026" }]
          : []),
      ],
      errors: [],
    },
    { rowIndex: 3, outcome: "REWORK", practiceId: b?.id, changes: changes.slice(0, 2), skipped: [], errors: [] },
    { rowIndex: 4, outcome: "AMBIGUOUS", candidates: [c, d].filter(Boolean), changes: changes.slice(4, 6), skipped: [], errors: [] },
    {
      rowIndex: 5,
      outcome: "ERROR",
      changes: [],
      skipped: [],
      errors: ["Nome Sito mancante: è obbligatorio per creare una nuova pratica (D-38)"],
    },
  ];
  return { importId: `demo-${Date.now()}`, templateId, columns, rows };
}

function mockCommit(preview: ImportPreviewDTO, req: ImportCommitRequest): ImportResultDTO {
  const pending = pendingChoices(preview, req.choices);
  if (pending.length > 0) {
    const msg = `Scegli la pratica o "Salta" per le righe ambigue: ${pending.join(", ")}`;
    throw new ApiError(msg, 422, { error: msg });
  }
  const s = plannedSummary(preview, req.choices);
  const failed = preview.rows.filter((r) => r.outcome === "ERROR").map((r) => ({ rowIndex: r.rowIndex, error: r.errors.join("; ") }));
  return { created: s.created, updated: s.updated, reworks: s.reworks, skipped: s.skipped - failed.length, failed };
}

/** Same signatures as import-source. */
export const demoImport = {
  previewImport: async (_file: File, templateId: TemplateId) => mockPreview(templateId),
  commitImport: async (preview: ImportPreviewDTO, req: ImportCommitRequest) => mockCommit(preview, req),
};

/** Copies of import-source helpers (importing the mocked module from its own fixture would be circular). */
function pendingChoices(preview: ImportPreviewDTO, choices: ImportCommitRequest["choices"]): number[] {
  return preview.rows
    .filter((r) => r.outcome === "AMBIGUOUS" && !choices?.some((c) => c.rowIndex === r.rowIndex && (c.action === "SKIP" || c.practiceId)))
    .map((r) => r.rowIndex);
}

function plannedSummary(preview: ImportPreviewDTO, choices: ImportCommitRequest["choices"] = []) {
  const out = { created: 0, updated: 0, reworks: 0, skipped: 0 };
  for (const r of preview.rows) {
    const c = choices.find((x) => x.rowIndex === r.rowIndex);
    if (r.outcome === "ERROR" || c?.action === "SKIP") out.skipped += 1;
    else if (r.outcome === "NEW_PRACTICE") out.created += 1;
    else if (r.outcome === "REWORK") out.reworks += 1;
    else out.updated += 1;
  }
  return out;
}
