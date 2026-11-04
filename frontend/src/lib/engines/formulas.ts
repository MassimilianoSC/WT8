/**
 * Motore delle formule (B5a, D-42, D-84–D-86, D-96, D-103, architettura §5). PURO: istantanea "prima" e "dopo"
 * le modifiche dell'utente, orologio e giorno di Roma iniettati. Restituisce i valori ricalcolati, i metadati
 * delle formule, i controlli una tantum delle integrazioni, Fatturabile, i toast (solo a valore cambiato) e le
 * modifiche di SISTEMA da scrivere nello storico con il loro motivo.
 */
import engineBindings from "@/data/engine-bindings.json";
import { isValidIsoDate, type IsoDate } from "@/lib/calendario";
import type { FieldValue, SelectValue, TemplateDTO, TemplateId, ToastDTO } from "@/lib/contract";
import { isEmpty } from "@/lib/engines/conditions";
import {
  dataScattoFatturabile,
  forecastGeologica,
  forecastOttenimentoPermessi,
  forecastOttenimentoPermessiBase,
  forecastProtocolloIliad,
  tipologiaAttivitaPE,
  verificaSpostamento,
  type ControlloSpostamento,
} from "@/lib/formule-date";
import type { ConstraintRowDoc, FormulaMetaDoc, RepeatRowDoc, TransversalDoc } from "@/lib/store/types";
import type { TemplateBindings } from "@/lib/templates/compiler";
import type { ObjectId } from "mongodb";

/* ---------- ingressi ---------- */

/** Metadati di riga visti dai motori: come RepeatRowDoc["metadata"], ma con id in forma di stringa. */
export interface EngineRowMetadata {
  origin?: { groupKey: string; rowId: string };
  locked?: boolean;
  warning?: string;
  integrationCheck?: NonNullable<RepeatRowDoc["metadata"]["integrationCheck"]>;
  /** Voce Ente: nome generato dal sistema (D-126 M-02/M-03); null = generata senza ente. */
  generatedName?: string | null;
  /** Riga ARPA: il ciclo successivo è già stato aperto (una volta per riga, D-126 §3.2). */
  arpaOpened?: boolean;
}

export interface EngineRow {
  rowId: string;
  ordinal: number;
  values: Record<string, FieldValue | undefined>;
  metadata?: EngineRowMetadata;
  constraint?: ConstraintRowDoc;
}

export interface EngineSnapshot {
  values: Record<string, FieldValue | undefined>;
  repeats: Record<string, EngineRow[]>;
  /** Chiave = flowId del calcolato, oppure "TRASV.FATTURABILE". */
  formulaMeta: Record<string, FormulaMetaDoc>;
  transversal: TransversalDoc;
}

export interface FormulaContext {
  templateId: TemplateId;
  template: TemplateDTO;
  bindings: TemplateBindings;
  /** Prima delle modifiche dell'utente (stato salvato). */
  before: EngineSnapshot;
  /** Dopo le modifiche dell'utente, prima delle formule. */
  after: EngineSnapshot;
  /** Giorno civile a Roma dell'operazione (D-84). */
  today: IsoDate;
  now: Date;
  operationId: string;
  actorId: ObjectId | null;
  /** flowId dei calcolati scritti ESPLICITAMENTE dall'utente in questa operazione. */
  manualWrites: ReadonlySet<string>;
  /** L'utente ha scritto Fatturabile in questa operazione (decisione manuale, D-37). */
  fatturabileWritten: boolean;
}

export interface SystemChange {
  target: { flowId?: string; transversal?: "fatturabile" };
  oldValue: FieldValue;
  newValue: FieldValue;
  reason: string;
}

export interface FormulaResult {
  /** Nuovi valori dei calcolati non ripetibili (solo quelli cambiati). */
  values: Record<string, FieldValue>;
  /** Metadati aggiornati (chiave come in EngineSnapshot.formulaMeta). */
  formulaMeta: Record<string, FormulaMetaDoc>;
  /** Metadati di riga da salvare (controllo una tantum delle integrazioni). */
  rowMetadata: Record<string, Partial<EngineRowMetadata>>;
  transversal: Partial<TransversalDoc>;
  toasts: ToastDTO[];
  systemChanges: SystemChange[];
}

/* ---------- collegamenti ---------- */

interface EngineBindings {
  codes: { esitoPositivo: string; esitoNegativo: string; vincoloPresente: string };
  templates: Record<TemplateId, { ottenimentoPermessi: string; arpa: { parere: string; esito: string; ripresentazione: string }; enteNome: string }>;
}
export const ENGINE_BINDINGS = engineBindings as unknown as EngineBindings;
export const FATTURABILE_META_KEY = "TRASV.FATTURABILE";

/* ---------- utilità ---------- */

const canon = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(canon).join(",")}]`
    : v && typeof v === "object"
      ? `{${Object.keys(v as object)
          .sort()
          .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
          .map((k) => `${k}:${canon((v as Record<string, unknown>)[k])}`)
          .join(",")}}`
      : JSON.stringify(v ?? null);
export const sameValue = (a: FieldValue | undefined, b: FieldValue | undefined) => canon(a ?? null) === canon(b ?? null);

const dateIn = (v: FieldValue | undefined): IsoDate | null => (typeof v === "string" && isValidIsoDate(v) ? v : null);
const codeOf = (v: FieldValue | undefined): string | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as SelectValue).code : null);
const it = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "vuoto");
const show = (v: FieldValue | undefined): string =>
  v === null || v === undefined ? "vuoto" : typeof v === "string" ? (isValidIsoDate(v) ? it(v) : v) : typeof v === "number" ? String(v) : Array.isArray(v) ? v.map((x) => x.code).join(", ") : (v as SelectValue).code;

/* ---------- motore ---------- */

export function computeFormulas(ctx: FormulaContext): FormulaResult {
  const out: FormulaResult = { values: {}, formulaMeta: {}, rowMetadata: {}, transversal: {}, toasts: [], systemChanges: [] };
  const label = (flowId: string) => ctx.template.occurrences.find((o) => o.kind === "MASTER" && o.flowId === flowId)?.label ?? flowId;
  const v = ctx.after.values;
  const set = (flowId: string, next: FieldValue, reason: string, kind: ToastDTO["kind"] = "INFO", message?: string) => {
    const prev = v[flowId] ?? null;
    if (sameValue(prev, next)) return;
    out.values[flowId] = next;
    out.systemChanges.push({ target: { flowId }, oldValue: prev, newValue: next, reason });
    out.toasts.push({ kind, flowId, message: message ?? `${label(flowId)} ricalcolato: ${show(prev)} → ${show(next)}.` });
  };

  for (const c of ctx.bindings.computed) {
    const meta: FormulaMetaDoc = { ...(ctx.after.formulaMeta[c.output] ?? { mode: "AUTO" }) };
    const input = (k: string) => (c.inputs[k] ? v[c.inputs[k]] : undefined);

    if (c.formula === "TIPOLOGIA_ATTIVITA_PE") {
      const sel = (x: FieldValue | undefined) => (x && typeof x === "object" && !Array.isArray(x) ? (x as SelectValue) : null);
      set(c.output, tipologiaAttivitaPE({ templateHaProgetto: !!c.inputs.progetto, progetto: sel(input("progetto")), incaricoLavorazione: sel(input("incarico")) }), "Tipologia attività PE derivata (D-32)");
    } else if (c.formula === "FORECAST_GEOLOGICA") {
      set(c.output, forecastGeologica(dateIn(input("assegnazione"))), "Assegnazione Geologica + 15 giorni (D-34)");
    } else if (c.formula === "FORECAST_PROTOCOLLO_ILIAD") {
      set(c.output, forecastProtocolloIliad(dateIn(input("dataAssegnazione"))), "Data assegnazione + 30 giorni (D-42)");
    } else if (c.formula === "FORECAST_OTTENIMENTO_PERMESSI") {
      permessi(c, meta);
      out.formulaMeta[c.output] = meta;
      continue;
    }
    out.formulaMeta[c.output] = { ...meta, mode: "AUTO", lastCalculatedAt: ctx.now };
  }

  /** Forecast Ottenimento Permessi (D-42, D-84, D-85, D-96). */
  function permessi(c: TemplateBindings["computed"][number], meta: FormulaMetaDoc) {
    const richiestaF = c.inputs.richiestaIntegrazione;
    const invioF = c.inputs.invioIntegrazione;
    const group = "INTEGRAZIONE";
    const base = forecastOttenimentoPermessiBase(ctx.templateId, dateIn(v[c.inputs.protocollo]));

    // Scrittura esplicita dell'utente: da qui il calcolo si ferma (MANUAL), anche se svuota il valore (D-96).
    if (ctx.manualWrites.has(c.output) && meta.mode !== "MANUAL") {
      meta.mode = "MANUAL";
      meta.manual = { actorId: ctx.actorId, at: ctx.now, operationId: ctx.operationId };
    }

    // Controllo una tantum: alla PRIMA compilazione di Invio integrazione di una riga (D-84). Si memorizza anche in MANUAL.
    const rows = [...(ctx.after.repeats[group] ?? [])].sort((a, b) => a.ordinal - b.ordinal);
    const checks = new Map<string, ControlloSpostamento | null>();
    for (const r of rows) {
      const saved = r.metadata?.integrationCheck;
      if (saved) {
        checks.set(r.rowId, { eseguitoIl: saved.checkedAtRomeDate, giorniMancanti: saved.remainingDays ?? Number.NaN, idoneo: saved.eligible });
        continue;
      }
      const prevRow = ctx.before.repeats[group]?.find((x) => x.rowId === r.rowId);
      const firstSend = isEmpty(prevRow?.values[invioF]) && !isEmpty(r.values[invioF]);
      if (!firstSend) {
        checks.set(r.rowId, null);
        continue;
      }
      // Base assente al momento del controllo → non idoneo, esito memorizzato (D-96).
      const chk = verificaSpostamento(base, ctx.today) ?? { eseguitoIl: ctx.today, giorniMancanti: Number.NaN, idoneo: false };
      checks.set(r.rowId, chk);
      out.rowMetadata[r.rowId] = {
        integrationCheck: {
          checkedAtRomeDate: chk.eseguitoIl,
          remainingDays: Number.isFinite(chk.giorniMancanti) ? chk.giorniMancanti : null,
          eligible: chk.idoneo,
          operationId: ctx.operationId,
        },
      };
    }
    if (meta.mode === "MANUAL" || !base) {
      if (!base && meta.mode !== "MANUAL") set(c.output, null, "Forecast base non disponibile (manca il Protocollo)");
      return;
    }
    const res = forecastOttenimentoPermessi(
      base,
      rows.map((r) => ({ richiesta: dateIn(r.values[richiestaF]), invio: dateIn(r.values[invioF]), controllo: checks.get(r.rowId) ?? null }))
    );
    meta.lastCalculatedAt = ctx.now;
    // D-132 P-08: l'avviso (es. delta negativo, D-85) si ricorda nei metadati e si mostra solo quando nasce o cambia.
    const previousWarning = (meta.detail?.avviso as string | undefined) ?? null;
    meta.detail = { base, spostamentoGiorni: res.spostamentoGiorni, ...(res.avviso ? { avviso: res.avviso } : {}) };
    if (res.forecast !== null) set(c.output, res.forecast, res.motivazione, "INFO", res.motivazione);
    if (res.avviso && res.avviso !== previousWarning) out.toasts.push({ kind: "WARNING", flowId: c.output, message: res.avviso });
  }

  fatturabile();

  /** Fatturabile (D-37, D-96): AUTO segue la formula; manuale blocca i ricalcoli positivi; NO forzato per riga ARPA. */
  function fatturabile() {
    const b = ENGINE_BINDINGS.templates[ctx.templateId];
    const codes = ENGINE_BINDINGS.codes;
    const meta: FormulaMetaDoc = { ...(ctx.after.formulaMeta[FATTURABILE_META_KEY] ?? { mode: "AUTO" }) };
    const forced: string[] = [...(((meta.detail?.forcedNegativeRows as string[] | undefined) ?? []))];
    const tr = ctx.after.transversal;
    let manual = tr.fatturabileManual;
    if (ctx.fatturabileWritten) {
      manual = true;
      meta.mode = "MANUAL";
      meta.manual = { actorId: ctx.actorId, at: ctx.now, operationId: ctx.operationId };
    }
    const arpa = [...(ctx.after.repeats.ARPA ?? [])].sort((a, z) => a.ordinal - z.ordinal);
    // La PRIMA volta che l'esito di una riga diventa Negativo: NO forzato, una volta per riga, anche col blocco manuale.
    const newlyNegative = arpa.filter((r) => {
      if (codeOf(r.values[b.arpa.esito]) !== codes.esitoNegativo || forced.includes(r.rowId)) return false;
      const prev = ctx.before.repeats.ARPA?.find((x) => x.rowId === r.rowId);
      return codeOf(prev?.values[b.arpa.esito]) !== codes.esitoNegativo;
    });
    let next: "SI" | "NO" = tr.fatturabile;
    let reason = "";
    if (newlyNegative.length) {
      next = "NO"; // nello stesso salvataggio vince il Negativo (D-96)
      forced.push(...newlyNegative.map((r) => r.rowId));
      reason = "Nuovo esito ARPA Negativo: Fatturabile riportato a NO (D-37)";
    } else if (!manual) {
      const ott = dateIn(ctx.after.values[b.ottenimentoPermessi]);
      const scatto = dataScattoFatturabile(ott);
      const last = arpa[arpa.length - 1];
      const positive = !!last && codeOf(last.values[b.arpa.esito]) === codes.esitoPositivo;
      next = scatto && ctx.today >= scatto && positive ? "SI" : "NO";
      reason = next === "SI" ? "30 giorni dopo Ottenimento Permessi con ultimo esito ARPA Positivo (D-37)" : "Condizioni di Fatturabile automatico non soddisfatte (D-96)";
    }
    out.formulaMeta[FATTURABILE_META_KEY] = { ...meta, mode: manual ? "MANUAL" : "AUTO", lastCalculatedAt: ctx.now, detail: { ...(meta.detail ?? {}), forcedNegativeRows: forced } };
    if (manual !== tr.fatturabileManual) out.transversal.fatturabileManual = manual;
    if (next !== tr.fatturabile) {
      out.transversal.fatturabile = next;
      out.systemChanges.push({ target: { transversal: "fatturabile" }, oldValue: tr.fatturabile, newValue: next, reason });
      out.toasts.push({ kind: newlyNegative.length ? "WARNING" : "INFO", message: `Fatturabile: ${tr.fatturabile} → ${next}. ${reason}.` });
    }
  }

  return out;
}
