/**
 * Parti comuni degli strumenti di sola lettura dell'assistente (progetto §4.1, versione snella D-166).
 *
 * - Ogni strumento riceve SOLO parametri validati (Zod strict) e un contesto con utente riletto dal database,
 *   orologio fisso della domanda e segnale di annullamento. Niente query libere, nomi di collezioni o codice.
 * - Le fonti le genera il server dai soli risultati autorizzati (registro numerato per domanda); il modello le
 *   cita con [n] e non può crearne.
 * - Massimo 20 elementi per strumento, niente cursori (D-166): oltre si dichiara il taglio e si invita a restringere.
 * - Un errore di strumento è un risultato tipizzato con codice neutro: nessuna conferma di pratiche invisibili.
 */
import type { Db } from "mongodb";
import { z } from "zod";
import { GROUP_IDS, ROLE_IDS, STATI_ATTIVITA, TEMPLATE_IDS, type TemplateId, type UserDTO } from "@/lib/contract";
import { diffCalendarDays, isValidIsoDate } from "@/lib/calendario";
import type { PracticeDoc } from "@/lib/store/types";
import type { AssistantFactDTO, AssistantSourceDTO } from "@/lib/contract";

export const MAX_ITEMS = 20;
export const MAX_PERIOD_DAYS = 366;

/* ---------- contesto ---------- */

export interface ToolContext {
  db: Db;
  /** Utente riletto dal database prima di ogni strumento (D-94). */
  user: UserDTO;
  /** Istante fisso della domanda: tutte le letture e le date relative lo usano. */
  now: Date;
  todayRome: string;
  /** Testo della domanda, solo per le fonti QUERY (riapre /assistente precompilata); mai nei registri. */
  question: string;
  signal: AbortSignal;
  sources: SourceRegistry;
  facts: FactRegistry;
}

export class ToolError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "FORBIDDEN" | "QUERY_TOO_BROAD" | "INVALID",
    message: string
  ) {
    super(message);
    this.name = "ToolError";
  }
}

/** Risultato per il modello: dati proiettati + rimandi alle fonti del server. */
export interface ToolResult<T = unknown> {
  asOf: string;
  selection: Record<string, unknown>;
  items: T[];
  /** Solo se calcolato sull'intero insieme autorizzato. */
  total?: number;
  complete: boolean;
  truncated: boolean;
  omittedReason?: "ROWS" | "CHARS" | "SCAN_LIMIT";
  note?: string;
}

/* ---------- fonti e fatti ---------- */

export class SourceRegistry {
  private readonly byKey = new Map<string, number>();
  readonly list: AssistantSourceDTO[] = [];

  /** Numero [n] della fonte (1..), riusato se la stessa fonte è già registrata. */
  add(source: AssistantSourceDTO): number {
    const { readAt: _readAt, ...rest } = source;
    const key = JSON.stringify(rest);
    const found = this.byKey.get(key);
    if (found) return found;
    this.list.push(source);
    const n = this.list.length;
    this.byKey.set(key, n);
    return n;
  }

  has(index: number): boolean {
    return Number.isInteger(index) && index >= 1 && index <= this.list.length;
  }
}

export class FactRegistry {
  readonly list: AssistantFactDTO[] = [];
  add(f: AssistantFactDTO): void {
    this.list.push(f);
  }
}

/** Fonte PRACTICE: identità dal riepilogo autorizzato, punto preciso facoltativo. */
export function practiceSource(
  ctx: ToolContext,
  p: Pick<PracticeDoc, "_id" | "templateId" | "currentIterationN" | "currentSummary">,
  label: string,
  at: { iteration?: number; flowId?: string; sectionKey?: string; occurrenceKey?: string; rowId?: string; historyEntryId?: string } = {}
): number {
  return ctx.sources.add({
    kind: "PRACTICE",
    practiceId: p._id.toHexString(),
    codiceSito: p.currentSummary.codiceSito,
    nomeSito: p.currentSummary.nomeSito,
    templateId: p.templateId,
    iteration: at.iteration ?? p.currentIterationN,
    ...(at.sectionKey ? { sectionKey: at.sectionKey } : {}),
    ...(at.occurrenceKey ? { occurrenceKey: at.occurrenceKey } : {}),
    ...(at.flowId ? { flowId: at.flowId } : {}),
    ...(at.rowId ? { rowId: at.rowId } : {}),
    ...(at.historyEntryId ? { historyEntryId: at.historyEntryId } : {}),
    label,
    readAt: ctx.now.toISOString(),
  });
}

/* ---------- schemi comuni ---------- */

export const templateIdSchema = z.enum(TEMPLATE_IDS);
export const groupIdSchema = z.enum(GROUP_IDS);
export const roleIdSchema = z.enum(ROLE_IDS);
export const statoSchema = z.enum(STATI_ATTIVITA);
export const objectIdSchema = z.string().regex(/^[0-9a-f]{24}$/, "id non valido");
export const isoDateSchema = z.string().refine(isValidIsoDate, "data non valida (AAAA-MM-GG)");

export const periodSchema = z
  .strictObject({ from: isoDateSchema, to: isoDateSchema })
  .refine((p) => p.from <= p.to, "il periodo inizia dopo la fine")
  .refine((p) => !isValidIsoDate(p.from) || !isValidIsoDate(p.to) || diffCalendarDays(p.from, p.to) <= MAX_PERIOD_DAYS, `periodo oltre ${MAX_PERIOD_DAYS} giorni`);
export type Period = z.infer<typeof periodSchema>;

/** Selezione delle pratiche (progetto §4.1). scope predefinito "assigned", archivio solo se chiesto. */
export const selectionSchema = z.strictObject({
  templateId: templateIdSchema.optional(),
  scope: z.enum(["assigned", "all"]).optional(),
  archived: z.boolean().optional(),
  stato: statoSchema.optional(),
  clienteFinaleCode: z.string().trim().min(1).max(80).optional(),
  enabledGroup: groupIdSchema.optional(),
  assignee: z.union([z.literal("me"), objectIdSchema]).optional(),
  q: z.string().trim().min(1).max(200).optional(),
});
export type Selection = z.infer<typeof selectionSchema>;

/** Selezione normalizzata (valori predefiniti espliciti), come la vede il modello. */
export function normalizeSelection(s: Selection): Selection & { scope: "assigned" | "all"; archived: boolean } {
  return { ...s, scope: s.scope ?? "assigned", archived: s.archived ?? false };
}

/* ---------- limiti di dimensione ---------- */

/**
 * Taglia gli elementi finché il JSON del risultato sta entro `maxChars` (mai a metà di un elemento). I campi di testo
 * lunghi si accorciano prima dal chiamante; qui si tolgono elementi interi dalla coda.
 */
export function fitResult<T>(result: ToolResult<T>, maxChars: number): ToolResult<T> {
  let r = result;
  while (JSON.stringify(r).length > maxChars && r.items.length > 0) {
    r = { ...r, items: r.items.slice(0, -1), truncated: true, complete: false, omittedReason: r.omittedReason ?? "CHARS" };
  }
  return r;
}

/** Testo non fidato accorciato a `max` caratteri, con la lunghezza originale dichiarata. */
export function clip(text: string, max: number): { text: string; truncated?: true; originalLength?: number } {
  if (text.length <= max) return { text };
  return { text: text.slice(0, max), truncated: true, originalLength: text.length };
}

export const templateOf = (s: { templateId?: TemplateId }) => s.templateId;
