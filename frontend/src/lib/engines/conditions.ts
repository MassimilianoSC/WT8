/**
 * Valutatore delle condizioni lato server (B5a): stessa semantica del contratto v0.1.5 / D-74 / D-110 usata dal
 * frontend, per progress e diagnostica. La condizione NON è un permesso (D-31): non blocca mai una scrittura.
 *
 * Il contesto ha la stessa forma di quello del valutatore di o3, così i casi di
 * tests/fixtures/conditions-cases.json valgono per entrambi.
 */
import type { ConditionDTO, FieldValue, SelectValue, TemplateDTO } from "@/lib/contract";

type Values = Record<string, FieldValue | undefined>;

export interface ConditionContext {
  /** Valori non ripetibili, chiave = flowId. */
  values: Values;
  /** Righe dei gruppi ripetibili (le righe VINCOLI hanno `constraint`). */
  repeats?: Record<string, ReadonlyArray<{ values: Values; constraint?: { stato: SelectValue | null } }> | undefined>;
  /** Riga in cui si trova l'occorrenza valutata, se ripetibile. */
  row?: { repeat: string; values: Values };
  /** flowId → chiave del gruppo ripetibile. */
  repeatOf: ReadonlyMap<string, string>;
}

export function repeatIndex(template: Pick<TemplateDTO, "repeatGroups">): Map<string, string> {
  const m = new Map<string, string>();
  for (const g of template.repeatGroups) for (const f of g.flowIds) m.set(f, g.key);
  return m;
}

/**
 * D-110 (precisa D-74): vuoto = null o assente, stringa vuota o di soli spazi, array vuoto, codice vuoto
 * ({code: ""}), array di soli codici vuoti; un numero non finito. Uguale al valutatore del frontend.
 */
export function isEmpty(v: FieldValue | undefined): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (typeof v === "number") return !Number.isFinite(v);
  if (Array.isArray(v)) return v.every((x) => isEmpty(x));
  return (v as SelectValue).code.trim() === "";
}

/** Codici confrontabili: SelectValue.code, elementi di un MULTISELECT, testo e numeri come stringa. */
function codesOf(v: FieldValue | undefined): string[] {
  if (v === null || v === undefined) return [];
  if (typeof v === "string") return v.trim() === "" ? [] : [v];
  if (typeof v === "number") return Number.isFinite(v) ? [String(v)] : [];
  if (Array.isArray(v)) return v.map((x) => x.code).filter((c) => c !== "");
  return (v as SelectValue).code === "" ? [] : [(v as SelectValue).code];
}

/** Diagnostica facoltativa: operatori sconosciuti (non raggiungibili con i tipi del contratto). */
export const conditionDiagnostics: string[] = [];

/**
 * Valori a cui si riferisce un flowId dal punto di vista dell'occorrenza:
 * stesso gruppo ripetibile → la riga corrente; altro gruppo (o occorrenza non ripetibile) → ogni riga del
 * gruppo; flowId non ripetibile → il valore della pratica. Il contenitore VINCOLI vale lo stato di ogni vincolo.
 */
function lookup(flowId: string, ctx: ConditionContext): Array<FieldValue | undefined> {
  const group = ctx.repeatOf.get(flowId);
  if (group === undefined) return [ctx.values[flowId]];
  if (ctx.row?.repeat === group) return [ctx.row.values[flowId]];
  return (ctx.repeats?.[group] ?? []).map((r) => (r.constraint ? r.constraint.stato : r.values[flowId]));
}

/** true = visibile. null/undefined = sempre visibile; all: [] vero; any: [] falso (D-74). */
export function evaluateCondition(c: ConditionDTO | null | undefined, ctx: ConditionContext): boolean {
  if (!c) return true;
  if ("all" in c) return c.all.every((x) => evaluateCondition(x, ctx));
  if ("any" in c) return c.any.some((x) => evaluateCondition(x, ctx));
  const values = lookup(c.flowId, ctx);
  switch (c.op) {
    case "FILLED":
      return values.some((v) => !isEmpty(v));
    case "EMPTY":
      return !values.some((v) => !isEmpty(v));
    case "EQ":
    case "IN":
    case "NEQ": {
      const expected = Array.isArray(c.value) ? c.value : [c.value];
      const match = values.some((v) => codesOf(v).some((code) => expected.includes(code)));
      return c.op === "NEQ" ? !match : match;
    }
    default:
      // Prudenza lato server (D-110): falso e diagnostica.
      conditionDiagnostics.push(`operatore sconosciuto: ${JSON.stringify(c)}`);
      return false;
  }
}
