/**
 * Catalogo degli strumenti di sola lettura (progetto §4.2) e loro esecuzione.
 * - Il modello vede solo gli strumenti consentiti all'utente (es. niente get_stats a un tecnico); il server
 *   autorizza comunque ogni chiamata.
 * - Argomenti con schema Zod strict: strumento sconosciuto, campi in più, regex o query libere → errore tipizzato.
 * - Nessuno strumento scrive: niente comandi, PATCH, runOperation, alert, notifiche, mail o import.
 */
import { z } from "zod";
import { semanticIds } from "../catalog";
import { visibleTemplates } from "@/lib/engines/access";
import { getCalendar, getCalendarSchema, getIssues, getIssuesSchema } from "./calendar";
import { ToolError, type ToolContext, type ToolResult } from "./common";
import { getHistorySchema, getHistoryTool, searchNotesSchema, searchVisibleNotes } from "./history";
import { canUseAndamento, getAndamentoSchema, getAndamentoTool } from "./andamento";
import { canUseStats, canUseWorkload, findPeople, findPeopleSchema, getStatsSchema, getStatsTool, getWorkloadSchema, getWorkloadTool } from "./kpi";
import { getPractice, getPractices, getPracticeSchema, getPracticesSchema } from "./practices";

interface ToolDef {
  name: string;
  description: (ctx: Pick<ToolContext, "user">) => string;
  schema: z.ZodType;
  run: (ctx: ToolContext, args: never) => Promise<ToolResult>;
  allowed?: (ctx: Pick<ToolContext, "user">) => boolean;
}

const SELECTION_HELP =
  "selection: templateId (cliente), scope 'assigned' (predefinito, le pratiche del proprio gruppo) o 'all' (solo se l'utente chiede tutte), archived (solo se chiesto l'archivio), stato, clienteFinaleCode, enabledGroup, assignee ('me' o id persona da find_people), q (codice sito, nome sito o Codice G7).";

export const TOOLS: ToolDef[] = [
  {
    name: "get_practices",
    description: () => `Trova pratiche e il loro numero esatto. Massimo 20 elementi, niente note. ${SELECTION_HELP} activeOnly esclude TERMINATO e KO.`,
    schema: getPracticesSchema,
    run: getPractices as ToolDef["run"],
  },
  {
    name: "get_practice",
    description: () =>
      "Sintesi di UNA pratica per id (trovalo prima con get_practices): topics tra identity, milestones (date principali), notes (Note Operative visibili dei gruppi e campi di testo lungo come \"Note Revit\", anche delle righe come le integrazioni: ognuna con il suo campo), assignments (persone nei campi), constraints (vincoli). Per dati di un'iterazione passata o \"vecchia\" (es. prima della ripresentazione) passa iteration: le iterazioni disponibili sono nell'argomento identity.",
    schema: getPracticeSchema,
    run: getPractice as ToolDef["run"],
  },
  {
    name: "get_calendar",
    description: (ctx) =>
      `Date di milestone in un periodo (estremi compresi, AAAA-MM-GG). dateKind: FORECAST = date previste ("cosa è previsto", "consegne previste"; pendingOnly predefinito vero = solo non ancora concluse), RECORDED = date effettive ("consegne effettuate", "cosa è stato fatto"), DEADLINE = scadenze e alert. Periodo massimo 366 giorni: per i ritardi (forecast passati e non conclusi, "in ritardo") usa invece get_issues con OVERDUE_FORECAST, che non richiede un periodo. milestones (facoltativo, senza = tutte): id FORECAST ${semanticIds(visibleTemplates(ctx.user), "FORECAST").join(", ")}; id RECORDED ${semanticIds(visibleTemplates(ctx.user), "RECORDED").join(", ")}. ${SELECTION_HELP}`,
    schema: getCalendarSchema,
    run: getCalendar as ToolDef["run"],
  },
  {
    name: "get_issues",
    description: () => `Criticità osservabili, senza bisogno di un periodo: OPEN_ALERT, OVERDUE_ALERT (alert scaduti), OVERDUE_FORECAST (forecast passati e non conclusi: "cosa è in ritardo"), KO, STAND_BY. Episodi e pratiche distinte contati a parte. ${SELECTION_HELP}`,
    schema: getIssuesSchema,
    run: getIssues as ToolDef["run"],
  },
  {
    name: "get_stats",
    description: () => "KPI istituzionali (pratiche attive, per stato, cliente e gruppo, alert aperti e scaduti, chiusure e durate nel periodo). Riporta i numeri come arrivano, non ricalcolarli.",
    schema: getStatsSchema,
    run: getStatsTool as ToolDef["run"],
    allowed: canUseStats,
  },
  {
    name: "get_workload",
    description: () => "Carichi di lavoro per persona e gruppo in un cliente (pratiche attive in cui la persona compare nei campi). Ordine per nome, nessuna classifica.",
    schema: getWorkloadSchema,
    run: getWorkloadTool as ToolDef["run"],
    allowed: canUseWorkload,
  },
  {
    name: "get_andamento",
    description: () =>
      "Andamento del lavoro nel tempo (ADMIN e Direzione), un blocco alla volta: stati (tempo per Stato attività, mediana e media, stati più lenti), ferme (pratiche ferme oltre la soglia, oggi), flussi (entrate, uscite, arretrato), rilavorazioni (rilavorazioni, ripresentazioni, ritorni all'indietro), scadenze (forecast rispettati, alert), gruppi (tempo per partire e per la prima consegna). Periodo predefinito: ultimi 12 mesi. Numeri già calcolati dal server: riportali, non ricalcolarli.",
    schema: getAndamentoSchema,
    run: getAndamentoTool as ToolDef["run"],
    allowed: canUseAndamento,
  },
  {
    name: "get_history",
    description: () => "Storico di UNA pratica: modifiche dei campi (view fields) ed eventi (view events), le più recenti; periodo facoltativo; iterazione corrente se non indicata.",
    schema: getHistorySchema,
    run: getHistoryTool as ToolDef["run"],
  },
  {
    name: "find_people",
    description: () => "Persone di un cliente con un ruolo (id e nome), per disambiguare un nome prima di filtrare per tecnico.",
    schema: findPeopleSchema,
    run: findPeople as ToolDef["run"],
  },
  {
    name: "search_visible_notes",
    description: () => `Ricerca letterale (2-80 caratteri, senza sinonimi) nelle Note Operative visibili (OPERATIVE) e nei campi di testo lungo (FIELD_NOTES); senza templateId cerca in tutti i clienti dell'utente. Zero risultati = nessuna nota visibile lo cita. ${SELECTION_HELP}`,
    schema: searchNotesSchema,
    run: searchVisibleNotes as ToolDef["run"],
  },
];

const byName = new Map(TOOLS.map((t) => [t.name, t]));

/** Dichiarazione per il provider: nome, descrizione e schema JSON (senza $schema). */
export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export function toolDeclarations(ctx: Pick<ToolContext, "user">): ToolDeclaration[] {
  return TOOLS.filter((t) => !t.allowed || t.allowed(ctx)).map((t) => {
    const { $schema: _s, ...parameters } = z.toJSONSchema(t.schema, { io: "input" }) as Record<string, unknown>;
    return { name: t.name, description: t.description(ctx), parameters };
  });
}

export type ToolOutcome =
  | { ok: true; result: ToolResult; rows: number }
  | { ok: false; error: { code: ToolError["code"] | "TOOL_UNKNOWN"; message: string }; rows: 0 };

/** Esegue uno strumento con argomenti NON fidati (dal modello). Gli errori attesi diventano un risultato neutro. */
export async function runTool(ctx: ToolContext, name: string, rawArgs: unknown): Promise<ToolOutcome> {
  const def = byName.get(name);
  if (!def) return { ok: false, error: { code: "TOOL_UNKNOWN", message: "Strumento inesistente" }, rows: 0 };
  if (def.allowed && !def.allowed(ctx)) return { ok: false, error: { code: "FORBIDDEN", message: "Strumento non consentito a questo utente" }, rows: 0 };
  const parsed = def.schema.safeParse(rawArgs ?? {});
  if (!parsed.success) return { ok: false, error: { code: "INVALID", message: parsed.error.issues.map((i) => `${i.path.join(".") || "argomenti"}: ${i.message}`).join("; ").slice(0, 500) }, rows: 0 };
  try {
    const result = await def.run(ctx, parsed.data as never);
    return { ok: true, result, rows: result.items.length };
  } catch (e) {
    if (e instanceof ToolError) return { ok: false, error: { code: e.code, message: e.message }, rows: 0 };
    throw e;
  }
}
