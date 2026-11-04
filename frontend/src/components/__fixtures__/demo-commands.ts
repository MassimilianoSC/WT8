/**
 * TEST FIXTURE (cutover D-161): demo practice commands, template resolution and creation, moved out of the app code.
 * Tests plug it in with vi.mock(<source>, ...) in place of the real API calls.
 */
import { ApiError } from "@/lib/client";
import type { CreatePracticeRequest, FieldValue, PraticaDetailDTO, ResolveTemplateRequest, ResolveTemplateResponse, TemplateDTO, TemplateId } from "@/lib/contract";
import type { Command } from "@/components/scheda/commands";
import { fixtureTemplate as fetchTemplate } from "@/components/__fixtures__/fixture-template";
import { coreValues, mockDelete, mockPut } from "@/components/__fixtures__/demo-sheet";
import { adminAccess, archivedView, buildDemoPractice, demoProgress, demoRepeatAccess, demoRepeats } from "@/components/__fixtures__/demo-practice";


/** D-16, on the demo list codes. */
function mockResolve({ committente, clienteFinale }: ResolveTemplateRequest): ResolveTemplateResponse {
  const all: TemplateId[] = ["ILIAD", "TOWERNET", "TIM_FIBERCOP", "INWIT", "FASTWEB_VODAFONE", "LEONARDO"];
  const byCliente: Record<string, TemplateId> = {
    ILIAD: "ILIAD",
    WIND3: "ILIAD",
    ZEFIRO: "ILIAD",
    INWIT: "INWIT",
    TOWERNET: "TOWERNET",
    TIM_FIBERCOP: "TIM_FIBERCOP",
    VODAFONE: "FASTWEB_VODAFONE",
    LEONARDO: "LEONARDO",
  };
  if (clienteFinale.code === "FASTWEB") {
    return committente.code === "FASTWEB"
      ? { templateId: "FASTWEB_VODAFONE", candidates: ["FASTWEB_VODAFONE"] }
      : { templateId: "ILIAD", candidates: ["ILIAD", "FASTWEB_VODAFONE"] };
  }
  const t = byCliente[clienteFinale.code];
  return t ? { templateId: t, candidates: [t] } : { templateId: null, candidates: all };
}

let mockSeq = 0;

function now(): string {
  return new Date().toISOString();
}

/** Core inherited without Codice G7 (set to the given one, typed like its field). */
function inheritedCore(t: TemplateDTO, p: PraticaDetailDTO, codiceG7: string | null): Record<string, FieldValue> {
  const values = coreValues(t, p);
  const g7 = t.occurrences.find((o) => o.kind === "MASTER" && o.label.trim().toLowerCase() === "codice g7");
  if (g7?.flowId) values[g7.flowId] = codiceG7 === null ? null : g7.dataType === "NUMBER" ? Number(codiceG7) : codiceG7;
  return values;
}

function iterationRef(practiceId: string, n: number, codiceG7: string | null) {
  return { id: `it-${practiceId}-${n}`, n, codiceG7, createdAt: now(), current: true };
}

async function mockCommand(p: PraticaDetailDTO, c: Command): Promise<PraticaDetailDTO | null> {
  const t = await fetchTemplate(p.templateId);
  const bump = { revision: p.revision + 1, updatedAt: now() };
  let next: PraticaDetailDTO;
  switch (c.kind) {
    case "assign":
      // Assegna enables groups; it does not change Stato attività (G §10).
      next = { ...p, ...bump, enabledGroups: Array.from(new Set([...p.enabledGroups, ...c.groups])) };
      break;
    case "stato":
      next = { ...p, ...bump, statoAttivita: c.stato, statoSource: "MANUAL" };
      break;
    case "archive":
      next = archivedView({ ...p, ...bump }, bump.updatedAt);
      break;
    case "restore":
      // The state does not change (C J15).
      next = {
        ...p,
        ...bump,
        archived: false,
        archivedAt: null,
        access: adminAccess(t),
        repeatAccess: demoRepeatAccess(t),
        alerts: p.alerts.map((a) => ({ ...a, executionStatus: "ACTIVE" as const })),
        actions: {
          ...p.actions,
          canAssign: true,
          canChangeStato: true,
          canArchive: p.statoAttivita === "TERMINATO" || p.statoAttivita === "KO",
          canRestore: false,
          canResubmit: true,
        },
      };
      break;
    case "delete":
      mockDelete(p.id);
      return null;
    case "resubmit": {
      // D-25: new iteration; operational sections empty; Core inherited but
      // not Codice G7; Note Operative kept; Fatturabile NO; Fatturato reset.
      const n = p.iteration + 1;
      const g7 = c.codiceG7?.trim() || null;
      const values = inheritedCore(t, p, g7);
      const repeats = demoRepeats(t, false);
      next = {
        ...p,
        ...bump,
        iteration: n,
        codiceG7: g7,
        statoAttivita: "CREATA",
        statoSource: "AUTO",
        manualLocks: [],
        iterationId: `it-${p.id}-${n}`,
        values,
        repeats,
        progress: demoProgress(t, { values, repeats }),
        transversal: { ...p.transversal, fatturabile: "NO", fatturabileManual: false, fatturato: null },
        alerts: [],
        openAlerts: 0,
        actions: { ...p.actions, canDelete: false },
        iterations: [...p.iterations.map((i) => ({ ...i, current: false })), iterationRef(p.id, n, g7)],
      };
      break;
    }
    case "rework": {
      // D-26: a NEW practice linked to the origin, Core duplicated.
      const id = `rilavorazione-${++mockSeq}`;
      const g7 = c.codiceG7?.trim() || p.codiceG7;
      const fresh = buildDemoPractice(
        t,
        { ...p, id, codiceG7: g7, iteration: 1, statoAttivita: "CREATA", enabledGroups: ["PM_PERMESSI"], originPracticeId: p.id, createdAt: now(), updatedAt: now() },
        { filled: false }
      );
      const values = { ...fresh.values, ...inheritedCore(t, p, g7) };
      next = { ...fresh, values, progress: demoProgress(t, { values, repeats: fresh.repeats }) };
      break;
    }
  }
  mockPut(next);
  return next;
}

async function mockCreate(req: CreatePracticeRequest): Promise<PraticaDetailDTO> {
  const t = await fetchTemplate(req.templateId);
  const id = `nuova-${++mockSeq}`;
  const practice = buildDemoPractice(
    t,
    {
      id,
      codiceSito: req.codiceSito,
      nomeSito: req.nomeSito,
      codiceG7: req.codiceG7,
      committente: req.committente,
      clienteFinale: req.clienteFinale,
      iteration: 1,
      statoAttivita: "CREATA",
      enabledGroups: ["PM_PERMESSI"],
      originPracticeId: null,
      createdAt: now(),
      updatedAt: now(),
    },
    { filled: false }
  );
  mockPut(practice);
  return practice;
}

/** Same signatures as commands.ts. */
export const demoCommands = {
  runCommand: async (practice: PraticaDetailDTO, command: Command, _operationId: string) => mockCommand(practice, command),
  resolveTemplate: async (req: ResolveTemplateRequest) => mockResolve(req),
  createPractice: async (req: CreatePracticeRequest, _operationId: string) => mockCreate(req),
};
