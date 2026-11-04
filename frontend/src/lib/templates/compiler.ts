/**
 * Compilatore dei template (B2, D-92). Funzione PURA: riceve i testi degli MD e i dati curati
 * (bindings, formulazioni delle condizioni, correzioni, liste iniziali) e restituisce i TemplateDTO,
 * i collegamenti interni per i motori e la diagnostica. Nessun accesso a file, rete o orologio.
 *
 * Regole: nessuna ricerca "fuzzy" per etichetta a runtime; ogni collegamento è per #riga/flowId e viene
 * verificato contro l'MD. Una formulazione di condizione non tradotta è un ERRORE, mai "sempre visibile".
 */
import { createHash } from "node:crypto";
import {
  CONSTRAINT_CODES,
  GROUP_IDS,
  noteOperativeKey,
  type ComputedDTO,
  type ConditionDTO,
  type ConstraintDefDTO,
  type DataType,
  type FieldOccurrenceDTO,
  type GroupId,
  type ListRefDTO,
  type PopupRefDTO,
  type RepeatGroupDTO,
  type RoleId,
  type SectionDTO,
  type TemplateDTO,
  type TemplateId,
} from "@/lib/contract";
import { GROUP_LABELS } from "@/lib/practice/labels";
import { parseAssociations, type SourceRow } from "@/lib/templates/source";

export const COMPILER_VERSION = "1.0.0";

/* ---------- dati curati in ingresso ---------- */

type RowRef = string; // "#12/F012"

export interface BindingsData {
  version: string;
  templates: Record<TemplateId, { label: string; file: string }>;
  teams: Record<string, GroupId>;
  sections: Record<string, string>;
  required: { flowIds: Record<string, string> };
  parents: Record<string, Partial<Record<TemplateId, RowRef>>>;
  repeatGroups: Record<string, { label: string; fixed?: boolean; members: Partial<Record<TemplateId, RowRef[]>> }>;
  computed: Record<
    string,
    {
      description: string;
      manualOverride: boolean;
      bindings: Partial<Record<TemplateId, { output: RowRef; inputs: Record<string, RowRef> }>>;
    }
  >;
  userFields: { labels: Record<string, RoleId> };
  constraints: Array<{
    code: string;
    label: string;
    stateList: string;
    enteList: { listId: string; kind: "CONTROLLED" | "CONFIGURABLE" } | null;
    defaultEnte: string | null;
    /** Etichetta dell'ente predefinito (contratto v0.2.1). */
    defaultEnteLabel: string | null;
  }>;
  constraintStateLists: Record<string, { kind: "CONTROLLED" | "CONFIGURABLE"; values: string[] }>;
}

export interface ConditionSpec {
  parent: string;
  op: "EQ" | "NEQ" | "IN" | "FILLED" | "EMPTY";
  value?: string | string[];
}

export interface ConditionsData {
  version: string;
  formulations: Array<{
    n: number;
    text: string;
    condition: ConditionSpec | null;
    mirrorHint?: boolean;
    effects?: string[];
    warning?: string;
    /** Decisione che ha introdotto la formulazione, se successiva all'architettura. */
    source?: string;
  }>;
}

export interface OverridePatch {
  kind?: "MASTER" | "MIRROR";
  exclude?: boolean;
  dropMirrorHint?: boolean;
  condition?: null;
  noAlert?: boolean;
  dataType?: DataType;
  list?: Partial<ListRefDTO>;
  transversalAlias?: string;
}

export interface OverridesData {
  version: string;
  overrides: Array<{
    id: string;
    templateId: TemplateId;
    sourceRow: number;
    expectedFlowId: string;
    expectedLabel?: string;
    expectedSourceHash: string;
    patch: OverridePatch;
    decision: string;
    provisional?: boolean;
  }>;
}

/** Una riga di LISTE_VALORI_INIZIALI.csv. */
export interface InitialListRow {
  gestore: string;
  gruppo: string;
  campo: string;
  tipo_lista: string;
  valore: string;
  codice_proposto: string;
  fonte: string;
  note: string;
}

export interface CompilerInput {
  baseline: string;
  /** Nome file → contenuto dei sei MD. */
  markdown: Record<string, string>;
  bindings: BindingsData;
  conditions: ConditionsData;
  overrides: OverridesData;
  lists: InitialListRow[];
}

/* ---------- uscite ---------- */

export type Severity = "ERROR" | "WARNING" | "INFO";

export interface Diagnostic {
  severity: Severity;
  code: string;
  templateId?: TemplateId;
  row?: number;
  flowId?: string;
  message: string;
}

/** Collegamenti per i motori (non fanno parte del TemplateDTO servito al frontend). */
export interface TemplateBindings {
  computed: Array<{ formula: string; output: string; inputs: Record<string, string>; manualOverride: boolean }>;
  /** flowId delle occorrenze escluse (alias di trasversali, duplicati eliminati). */
  excluded: Array<{ row: number; flowId: string; reason: string; transversalAlias?: string }>;
  /** Effetti non di visibilità dichiarati nelle celle condizione (alert, valori predefiniti, liste…). */
  effects: Array<{ row: number; flowId: string; effects: string[] }>;
}

export interface CompiledTemplate {
  template: TemplateDTO;
  bindings: TemplateBindings;
  source: { file: string; sha256: string; rows: number; flowIds: number };
}

export interface CompileResult {
  templates: Partial<Record<TemplateId, CompiledTemplate>>;
  diagnostics: Diagnostic[];
  manifest: {
    compilerVersion: string;
    baseline: string;
    bindingsVersion: string;
    conditionsVersion: string;
    overridesVersion: string;
    sources: Record<string, string>;
    lists: string;
    templates: Record<string, { version: string; occurrences: number; flowIds: number; sourceRows: number }>;
  };
}

/* ---------- utilità ---------- */

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** JSON con chiavi ordinate: serializzazione deterministica. */
/**
 * D-182: etichetta mostrata, senza i segnaposto tra virgolette tipografiche degli MD (regola del compilatore, gli MD
 * non si toccano, D-92). Es. "Forecast Ottenimento “Nome ente”" → "Forecast Ottenimento"; "Cliente Finale (DA
 * SOSTITUIRE A “GESTIONALE”)" → "Cliente Finale". Il contesto lo dà la riga (campo "Nome ente").
 */
export function displayLabel(label: string): string {
  return label
    .replace(/\s*\([^()]*“[^”]*”[^()]*\)/g, "")
    .replace(/\s*“[^”]*”/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function stableStringify(value: unknown, indent = 2): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.keys(v as object)
          .sort()
          .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
          .map((k) => [k, sort((v as Record<string, unknown>)[k])])
      );
    }
    return v;
  };
  return JSON.stringify(sort(value), null, indent);
}

/** Normalizza un'etichetta per i soli controlli di coerenza (mai per collegare campi). */
export function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .toLowerCase()
    .replace(/[“”"'`’]/g, "")
    .replace(/[^a-z0-9°%+]+/g, " ")
    .trim();
}

export const snake = (s: string) =>
  norm(s)
    .replace(/[°%+]/g, " ")
    .trim()
    .replace(/\s+/g, "_")
    .toUpperCase();

function parseRef(ref: RowRef): { row: number; flowId: string } {
  const m = /^#(\d+)\/(F\d{3})$/.exec(ref);
  if (!m) throw new Error(`Riferimento non valido: ${ref}`);
  return { row: Number(m[1]), flowId: m[2] };
}

/* ---------- regole di tipo e lista ---------- */

const ISTAT: Record<string, { listId: string; parentLabel?: string }> = {
  regione: { listId: "ISTAT_REGIONI" },
  provincia: { listId: "ISTAT_PROVINCE", parentLabel: "regione" },
  comune: { listId: "ISTAT_COMUNI", parentLabel: "provincia" },
};

/** DataType dal dtype testuale dell'MD (D-72, §2.5). null = dtype vuoto o non riconosciuto. */
function dataTypeFromMd(dtype: string): DataType | null {
  const d = norm(dtype);
  if (!d) return null;
  if (d.startsWith("date")) return "DATE";
  if (d.includes("selezione multipla")) return "MULTISELECT";
  if (d.includes("menu a tendina")) return "SELECT";
  if (d === "integer" || d === "decimal" || d === "campo numerico") return "NUMBER";
  if (d.includes("libero")) return "LONGTEXT";
  if (d === "text" || d.includes("varchar")) return "TEXT";
  return null;
}

const LIST_KIND: Record<string, ListRefDTO["kind"] | undefined> = {
  CONTROLLATO: "CONTROLLED",
  CONFIGURABILE: "CONFIGURABLE",
  MANCANTE: "CONFIGURABLE",
  INCOMPLETA: "CONFIGURABLE",
  UTENTI: "USERS",
  ISTAT: "ISTAT",
};

/* ---------- compilazione ---------- */

export function compileTemplates(input: CompilerInput): CompileResult {
  const diagnostics: Diagnostic[] = [];
  const templates: CompileResult["templates"] = {};
  const manifestTemplates: CompileResult["manifest"]["templates"] = {};
  const sources: Record<string, string> = {};

  const formulationByText = new Map(input.conditions.formulations.map((f) => [f.text, f]));
  const usedFormulations = new Set<number>();
  const usedOverrides = new Set<string>();

  // Liste iniziali: (gestore|campo normalizzato) → righe.
  const listIndex = new Map<string, InitialListRow[]>();
  for (const l of input.lists) {
    const names = new Set([norm(l.campo), ...l.campo.split(" / ").map(norm)]);
    for (const n of names) {
      const k = `${l.gestore}|${n}`;
      if (!listIndex.has(k)) listIndex.set(k, []);
      listIndex.get(k)!.push(l);
    }
  }
  const siNoRow = input.lists.find((l) => /^SI \/ NO/.test(l.campo));
  const siNoFields = new Set(
    (siNoRow?.note.match(/Usato da:\s*(.*)$/)?.[1] ?? "")
      .split(",")
      .map((s) => norm(s))
      .filter(Boolean)
  );

  for (const templateId of Object.keys(input.bindings.templates) as TemplateId[]) {
    const tpl = input.bindings.templates[templateId];
    const md = input.markdown[tpl.file];
    const diag = (severity: Severity, code: string, message: string, row?: number, flowId?: string) =>
      diagnostics.push({ severity, code, templateId, row, flowId, message });
    if (md === undefined) {
      diag("ERROR", "SOURCE_MISSING", `MD assente: ${tpl.file}`);
      continue;
    }
    sources[tpl.file] = sha256(md.replace(/\r\n/g, "\n"));

    let rows: SourceRow[];
    try {
      rows = parseAssociations(md, tpl.file);
    } catch (e) {
      diag("ERROR", "SOURCE_PARSE", (e as Error).message);
      continue;
    }

    /* 1. inventario: righe continue, flowId validi e continui */
    rows.forEach((r, i) => {
      if (r.row !== i + 1) diag("ERROR", "ROW_SEQUENCE", `riga #${r.row} in posizione ${i + 1}`, r.row);
      if (!/^F\d{3}$/.test(r.flowId)) diag("ERROR", "FLOWID_INVALID", `flowId non valido "${r.flowId}"`, r.row);
    });
    const flowNums = [...new Set(rows.map((r) => Number(r.flowId.slice(1))))].sort((a, b) => a - b);
    const maxFlow = flowNums[flowNums.length - 1] ?? 0;
    for (let n = 1; n <= maxFlow; n++) {
      if (!flowNums.includes(n)) diag("ERROR", "FLOWID_GAP", `manca F${String(n).padStart(3, "0")} nella sequenza`);
    }
    const byRow = new Map(rows.map((r) => [r.row, r]));
    const resolveRef = (ref: RowRef, what: string): SourceRow | null => {
      const { row, flowId } = parseRef(ref);
      const r = byRow.get(row);
      if (!r || r.flowId !== flowId) {
        diag("ERROR", "BINDING_MISMATCH", `${what}: ${ref} non corrisponde all'MD (trovato ${r?.flowId ?? "nessuna riga"})`, row, flowId);
        return null;
      }
      return r;
    };

    /* 2. correzioni con precondizione */
    const patchOf = new Map<number, OverridePatch>();
    for (const ov of input.overrides.overrides.filter((o) => o.templateId === templateId)) {
      const r = byRow.get(ov.sourceRow);
      if (!r || r.flowId !== ov.expectedFlowId || r.hash !== ov.expectedSourceHash) {
        diag(
          "ERROR",
          "OVERRIDE_PRECONDITION",
          `${ov.id} non applicata: la riga #${ov.sourceRow} non è più quella attesa (${ov.expectedFlowId}, impronta ${ov.expectedSourceHash}); trovato ${r ? `${r.flowId}, impronta ${r.hash}` : "nessuna riga"}`,
          ov.sourceRow,
          ov.expectedFlowId
        );
        continue;
      }
      usedOverrides.add(ov.id);
      patchOf.set(ov.sourceRow, { ...patchOf.get(ov.sourceRow), ...ov.patch });
    }

    const excluded: TemplateBindings["excluded"] = [];
    const live = rows.filter((r) => {
      const p = patchOf.get(r.row);
      if (p?.exclude) {
        excluded.push({ row: r.row, flowId: r.flowId, reason: "correzione", transversalAlias: p.transversalAlias });
        return false;
      }
      return true;
    });

    /* 3. sezioni e gruppi */
    const sectionOf = new Map<number, string>();
    const sections: SectionDTO[] = [];
    for (const r of live) {
      const group = input.bindings.teams[r.team];
      if (!group) {
        diag("ERROR", "TEAM_UNKNOWN", `team sconosciuto "${r.team}"`, r.row, r.flowId);
        continue;
      }
      const key = input.bindings.sections[`${group}|${r.section}`];
      if (!key) {
        diag("ERROR", "SECTION_UNKNOWN", `sezione sconosciuta "${r.section}" per ${group}`, r.row, r.flowId);
        continue;
      }
      sectionOf.set(r.row, key);
      if (!sections.some((s) => s.key === key)) {
        sections.push({
          key,
          label: r.section,
          group,
          ...(group === "UT_PE" && (r.section === "UT" || r.section === "PE") ? { subsection: r.section as "UT" | "PE" } : {}),
          order: sections.length + 1,
        });
      }
    }
    const groupOf = (r: SourceRow) => input.bindings.teams[r.team];

    /* 4. formulazioni delle celle condizione */
    const formulationOf = new Map<number, ConditionsData["formulations"][number]>();
    for (const r of live) {
      if (!r.condition) continue;
      const f = formulationByText.get(r.condition);
      if (!f) {
        diag("ERROR", "CONDITION_UNTRANSLATED", `formulazione non tradotta: "${r.condition}"`, r.row, r.flowId);
        continue;
      }
      usedFormulations.add(f.n);
      formulationOf.set(r.row, f);
    }
    const mirrorHint = (r: SourceRow) => !!formulationOf.get(r.row)?.mirrorHint && !patchOf.get(r.row)?.dropMirrorHint;

    /* 5. master / mirror */
    // La nota dichiara QUESTA riga master: "master" senza parlare di mirror ("Campo master compilato da PM…"),
    // oppure "master PM con mirror PE", oppure una nota che si apre dichiarando il ruolo (baseline corretta, D-114:
    // "Master operativo PM/Permessi; alimenta il mirror AIE…"). Le note dei mirror citano il master ("Mirror in sola
    // lettura del master…", "Sola visualizzazione; mirror di…").
    const isExplicitMaster = (r: SourceRow) =>
      /^\s*master\b/i.test(r.note) ||
      (/\bmaster\b/i.test(r.note) && (!/\bmirror\b/i.test(r.note) || /\bmaster\b[^.;]*\bcon mirror\b/i.test(r.note)));
    const mirrorEvidence = (r: SourceRow): string | null => {
      if (isExplicitMaster(r)) return null;
      if (mirrorHint(r)) return "sola visualizzazione (condizione)";
      for (const [rx, kw] of [
        [/\bmirror\b/i, "mirror"],
        [/sola visualizzazione/i, "sola visualizzazione"],
        [/sola lettura/i, "sola lettura"],
        [/\bpop-up\b/i, "pop-up"],
        [/ereditato da/i, "ereditato da"],
      ] as const) {
        if (rx.test(r.note)) return kw;
      }
      return null;
    };
    const kindOf = new Map<number, "MASTER" | "MIRROR">();
    const byFlow = new Map<string, SourceRow[]>();
    for (const r of live) {
      if (!byFlow.has(r.flowId)) byFlow.set(r.flowId, []);
      byFlow.get(r.flowId)!.push(r);
    }
    for (const [flowId, list] of byFlow) {
      // Inferenza dall'evidenza, poi le correzioni hanno l'ultima parola.
      const notMirror = list.filter((r) => !mirrorEvidence(r));
      const explicit = list.filter(isExplicitMaster);
      const inferred = notMirror.length === 1 ? notMirror[0] : explicit.length === 1 ? explicit[0] : null;
      for (const r of list) kindOf.set(r.row, r === inferred ? "MASTER" : "MIRROR");
      if (list.length === 1 && !inferred) kindOf.set(list[0].row, "MIRROR");
      for (const r of list) {
        const k = patchOf.get(r.row)?.kind;
        if (k) kindOf.set(r.row, k);
      }
      const masters = list.filter((r) => kindOf.get(r.row) === "MASTER");
      if (masters.length !== 1) {
        diag(
          "ERROR",
          masters.length === 0 ? "MASTER_MISSING" : "MASTER_MULTIPLE",
          `${flowId}: ${masters.length} master tra le righe ${list.map((r) => `#${r.row}`).join(", ")}`,
          list[0].row,
          flowId
        );
      }
    }
    const masterRow = new Map<string, SourceRow>();
    for (const [flowId, list] of byFlow) {
      const m = list.find((r) => kindOf.get(r.row) === "MASTER");
      if (m) masterRow.set(flowId, m);
    }

    /* 6. gruppi ripetibili (§2.6) */
    const repeatOfFlow = new Map<string, string>();
    const repeatGroups: RepeatGroupDTO[] = [];
    for (const [key, g] of Object.entries(input.bindings.repeatGroups)) {
      const members = g.members[templateId];
      if (!members) continue;
      const flowIds: string[] = [];
      for (const ref of members) {
        const r = resolveRef(ref, `gruppo ${key}`);
        if (!r) continue;
        if (!masterRow.has(r.flowId)) diag("ERROR", "REPEAT_MEMBER_EXCLUDED", `${key}: ${ref} non è un campo del template`, r.row, r.flowId);
        if (repeatOfFlow.has(r.flowId)) diag("ERROR", "REPEAT_DUPLICATE", `${r.flowId} in due gruppi ripetibili`, r.row, r.flowId);
        repeatOfFlow.set(r.flowId, key);
        flowIds.push(r.flowId);
      }
      repeatGroups.push({
        key,
        label: g.label,
        flowIds,
        rowPolicy: g.fixed ? "FIXED" : "DYNAMIC",
        schemaKind: key === "VINCOLI" ? "VINCOLI" : "FIELDS",
      });
    }

    /* 7. padri delle condizioni (§2.3) */
    const parentFlow = new Map<string, string>();
    for (const [parent, perTemplate] of Object.entries(input.bindings.parents)) {
      const ref = perTemplate[templateId];
      if (!ref) continue;
      const r = resolveRef(ref, `padre "${parent}"`);
      if (!r) continue;
      if (!norm(r.label).startsWith(norm(parent))) {
        diag("WARNING", "PARENT_LABEL", `padre "${parent}" collegato a ${ref} con etichetta "${r.label}"`, r.row, r.flowId);
      }
      parentFlow.set(parent, r.flowId);
    }

    /* 8. campi calcolati (§5.1) */
    const computedOf = new Map<string, ComputedDTO>();
    const computedBindings: TemplateBindings["computed"] = [];
    for (const [formula, c] of Object.entries(input.bindings.computed)) {
      const b = c.bindings[templateId];
      if (!b) continue;
      const out = resolveRef(b.output, `formula ${formula}`);
      const inputs: Record<string, string> = {};
      for (const [k, ref] of Object.entries(b.inputs)) {
        const r = resolveRef(ref, `formula ${formula} (${k})`);
        if (r) inputs[k] = r.flowId;
      }
      if (!out) continue;
      computedOf.set(out.flowId, { formula, description: c.description, manualOverride: c.manualOverride });
      computedBindings.push({ formula, output: out.flowId, inputs, manualOverride: c.manualOverride });
    }

    /* 9. tipi e liste sul master; i mirror ereditano (D-93.2) */
    const userFieldRole = new Map(Object.entries(input.bindings.userFields.labels).map(([l, role]) => [norm(l), role]));
    const effectsOf = (r: SourceRow) => formulationOf.get(r.row)?.effects ?? [];
    const typeOf = new Map<string, { dataType: DataType; list?: ListRefDTO }>();
    for (const [flowId, m] of masterRow) {
      const p = patchOf.get(m.row);
      const l = norm(m.label);
      const mdType = dataTypeFromMd(m.dtype);
      let dataType: DataType;
      let list: ListRefDTO | undefined;
      const role = userFieldRole.get(l);

      if (role && !p?.list) {
        dataType = effectsOf(m).includes("MULTIPLE_USERS") ? "USERS" : "USER";
        list = { listId: "USERS", kind: "USERS", allowOther: false, userRole: role, ...(effectsOf(m).includes("NONE_OPTION") ? { allowNone: true } : {}) };
      } else {
        if (p?.dataType) dataType = p.dataType;
        else if (flowId === "F001") dataType = "NUMBER"; // D-93(6): Codice G7 intero
        else if (/^(committente|cliente finale|progetto)\b/.test(l)) {
          dataType = "SELECT"; // D-76: liste anche dove l'MD dice TEXT
          if (mdType !== "SELECT") diag("INFO", "TYPE_NORMATIVE", `"${m.label}": ${m.dtype || "dtype vuoto"} → SELECT (D-76)`, m.row, flowId);
        } else if (mdType) dataType = mdType;
        else {
          dataType = "TEXT";
          diag("WARNING", "DTYPE_FALLBACK", `"${m.label}": dtype ${m.dtype ? `"${m.dtype}" non riconosciuto` : "vuoto"} → TEXT (D-72)`, m.row, flowId);
        }

        if (repeatOfFlow.get(flowId) === "VINCOLI") {
          // Contenitore della tabella Vincoli: stato ed ente sono strutturati (ConstraintDefDTO), nessuna lista.
          diag("INFO", "VINCOLI_CONTAINER", `"${m.label}": contenitore VINCOLI, valori strutturati in constraints (D-99)`, m.row, flowId);
        } else if (dataType === "SELECT" || dataType === "MULTISELECT") {
          if (p?.list?.listId) {
            const kind = p.list.kind ?? "CONFIGURABLE";
            list = { listId: p.list.listId, kind, allowOther: kind === "CONFIGURABLE" };
          } else {
            list = resolveList(m, flowId);
            if (p?.list?.kind) list = { ...list, kind: p.list.kind, allowOther: p.list.kind === "CONFIGURABLE" };
          }
        } else {
          const csv = findCsv(m.label);
          if (csv) diag("INFO", "LIST_IGNORED", `"${m.label}" ha una lista nel CSV ma è ${dataType} nell'MD: lista non collegata`, m.row, flowId);
        }
      }
      typeOf.set(flowId, { dataType, list });
    }

    function findCsv(label: string) {
      const rowsCsv = listIndex.get(`${templateId}|${norm(label)}`) ?? listIndex.get(`TUTTI|${norm(label)}`);
      return rowsCsv && rowsCsv.length ? rowsCsv : null;
    }

    function resolveList(m: SourceRow, flowId: string): ListRefDTO {
      const l = norm(m.label);
      if (ISTAT[l]) {
        const parentLabel = ISTAT[l].parentLabel;
        const parent = parentLabel ? live.find((r) => norm(r.label) === parentLabel && kindOf.get(r.row) === "MASTER") : undefined;
        if (parentLabel && !parent) diag("ERROR", "ISTAT_PARENT", `"${m.label}": campo "${parentLabel}" assente per la cascata`, m.row, flowId);
        return { listId: ISTAT[l].listId, kind: "ISTAT", allowOther: false, ...(parent ? { parentFlowId: parent.flowId } : {}) };
      }
      if (computedOf.get(flowId)?.formula === "TIPOLOGIA_ATTIVITA_PE") {
        return { listId: "TIPOLOGIA_ATTIVITA_PE", kind: "CONTROLLED", allowOther: false };
      }
      if (/^committente\b/.test(l)) return { listId: "COMMITTENTE", kind: "CONTROLLED", allowOther: true };
      if (/^cliente finale\b/.test(l)) return { listId: "CLIENTE_FINALE", kind: "CONTROLLED", allowOther: true };
      const csv = findCsv(m.label);
      if (csv) {
        const kind = LIST_KIND[csv[0].tipo_lista] ?? "CONFIGURABLE";
        if (csv[0].tipo_lista === "MANCANTE" || csv[0].tipo_lista === "INCOMPLETA") {
          diag("WARNING", "LIST_VALUES_MISSING", `"${m.label}": lista ${csv[0].tipo_lista} nel CSV (valori da completare in Configurazione)`, m.row, flowId);
        }
        const listId = snake(csv[0].campo.split(" / ")[0]);
        return { listId, kind: kind === "USERS" || kind === "ISTAT" ? "CONFIGURABLE" : kind, allowOther: kind === "CONFIGURABLE" };
      }
      const isSiNo = siNoFields.has(l) || effectsOf(m).includes("VALUES:SI|NO") || [...parentFlow.entries()].some(([, f]) => f === flowId && usesSiNo(f));
      if (isSiNo) return { listId: "SI_NO", kind: "CONTROLLED", allowOther: false };
      diag(
        "WARNING",
        "LIST_NOT_FOUND",
        `"${m.label}": nessuna lista in LISTE_VALORI_INIZIALI (${m.dtype || "dtype vuoto"}); creata lista CONFIGURABLE vuota`,
        m.row,
        flowId
      );
      return { listId: snake(m.label), kind: "CONFIGURABLE", allowOther: true };
    }

    function usesSiNo(parentFlowId: string): boolean {
      for (const r of live) {
        const c = formulationOf.get(r.row)?.condition;
        if (c && parentFlow.get(c.parent) === parentFlowId && (c.value === "SI" || c.value === "NO")) return true;
      }
      return false;
    }

    /* 10. condizioni per occorrenza */
    const conditionOf = (r: SourceRow): ConditionDTO | null => {
      const p = patchOf.get(r.row);
      if (p && "condition" in p && p.condition === null) return null;
      const f = formulationOf.get(r.row);
      if (!f) return null;
      if (f.warning) diag("WARNING", "CONDITION_NOTE", f.warning, r.row, r.flowId);
      if (!f.condition) return null;
      const parent = parentFlow.get(f.condition.parent);
      if (!parent) {
        diag("ERROR", "CONDITION_PARENT_MISSING", `padre "${f.condition.parent}" assente in ${templateId} (formulazione n.${f.n})`, r.row, r.flowId);
        return null;
      }
      const { op, value } = f.condition;
      if (op === "FILLED" || op === "EMPTY") return { flowId: parent, op };
      if (value === undefined) {
        diag("ERROR", "CONDITION_VALUE", `formulazione n.${f.n}: valore mancante`, r.row, r.flowId);
        return null;
      }
      const list = typeOf.get(parent)?.list;
      const codes = Array.isArray(value) ? value : [value];
      if (list && list.kind !== "ISTAT") {
        const known = knownCodes(list.listId);
        const missing = known ? codes.filter((c) => !known.has(c)) : [];
        if (missing.length) diag("WARNING", "CONDITION_CODE_UNKNOWN", `codici ${missing.join(", ")} assenti dalla lista ${list.listId}`, r.row, r.flowId);
      }
      return { flowId: parent, op, value };
    };

    function knownCodes(listId: string): Set<string> | null {
      if (listId === "SI_NO") return new Set(["SI", "NO"]);
      const rowsCsv = input.lists.filter((l) => (l.gestore === templateId || l.gestore === "TUTTI") && snake(l.campo.split(" / ")[0]) === listId);
      return rowsCsv.length ? new Set(rowsCsv.map((l) => l.codice_proposto).filter(Boolean)) : null;
    }

    /* 11. valori dichiarati nelle celle ("Valori: …") rispetto alla lista */
    for (const r of live) {
      for (const e of effectsOf(r)) {
        if (!e.startsWith("VALUES:") || kindOf.get(r.row) !== "MASTER") continue;
        const list = typeOf.get(r.flowId)?.list;
        if (!list) continue;
        const csvValues = input.lists
          .filter((l) => (l.gestore === templateId || l.gestore === "TUTTI") && snake(l.campo.split(" / ")[0]) === list.listId)
          .map((l) => norm(l.valore));
        const missing = e
          .slice(7)
          .split("|")
          .filter((v) => list.listId !== "SI_NO" && !csvValues.includes(norm(v)));
        if (missing.length) diag("WARNING", "LIST_VALUES_MISSING", `"${r.label}": valori dell'MD assenti dalla lista ${list.listId}: ${missing.join(", ")}`, r.row, r.flowId);
      }
    }

    /* 12. occorrenze */
    const requiredFlows = input.bindings.required.flowIds;
    for (const [flowId, expected] of Object.entries(requiredFlows)) {
      const m = masterRow.get(flowId);
      if (!m) diag("ERROR", "REQUIRED_MISSING", `campo obbligatorio ${flowId} (${expected}) assente`, undefined, flowId);
      else if (!norm(m.label).startsWith(norm(expected))) diag("ERROR", "REQUIRED_LABEL", `${flowId} è "${m.label}", atteso "${expected}"`, m.row, flowId);
    }

    const occurrences: FieldOccurrenceDTO[] = [];
    const effects: TemplateBindings["effects"] = [];
    const sectionOrder = new Map(sections.map((s) => [s.key, s.order]));
    for (const r of live) {
      const sectionKey = sectionOf.get(r.row);
      const master = masterRow.get(r.flowId);
      const type = typeOf.get(r.flowId);
      if (!sectionKey || !master || !type) continue;
      const kind = kindOf.get(r.row)!;
      const pop = popupOf(r, sectionKey);
      const computed = computedOf.get(r.flowId);
      const label = displayLabel(r.label);
      if (label !== r.label) diag("INFO", "LABEL_PLACEHOLDER", `etichetta "${r.label}" → "${label}" (segnaposto tolto, D-182)`, r.row, r.flowId);
      const occ: FieldOccurrenceDTO = {
        occurrenceKey: `${r.flowId}@${sectionKey}`,
        flowId: r.flowId,
        label,
        sectionKey,
        order: r.row,
        kind,
        ownerGroup: groupOf(master),
        dataType: type.dataType,
        ...(type.list ? { list: type.list } : {}),
        required: kind === "MASTER" && r.flowId in requiredFlows,
        ...(repeatOfFlow.has(r.flowId) ? { repeatGroup: repeatOfFlow.get(r.flowId) } : {}),
        condition: conditionOf(r),
        computed: computed ?? null,
        ...(r.universal && r.universal !== "DA VERIFICARE" ? { universal: r.universal } : {}),
        ...(pop ? { popup: pop } : {}),
      };
      occurrences.push(occ);
      const eff = effectsOf(r).filter((e) => !(patchOf.get(r.row)?.noAlert && e.startsWith("ALERT:")));
      if (eff.length) effects.push({ row: r.row, flowId: r.flowId, effects: eff });
      if (kind === "MIRROR" && dataTypeFromMd(r.dtype) && dataTypeFromMd(r.dtype) !== type.dataType && !(dataTypeFromMd(r.dtype) === "LONGTEXT" && type.dataType === "TEXT")) {
        diag("INFO", "MIRROR_TYPE", `mirror "${r.label}" dichiarato ${r.dtype}, eredita ${type.dataType} dal master #${master.row}`, r.row, r.flowId);
      }
    }
    occurrences.sort((a, b) => sectionOrder.get(a.sectionKey)! - sectionOrder.get(b.sectionKey)! || a.order - b.order);
    const keys = new Set<string>();
    for (const o of occurrences) {
      if (keys.has(o.occurrenceKey)) diag("ERROR", "OCCURRENCE_KEY_DUPLICATE", `occurrenceKey duplicata ${o.occurrenceKey}`, o.order, o.flowId ?? undefined);
      keys.add(o.occurrenceKey);
    }
    // Ogni condizione e ogni formula cita flowId presenti; ogni flowId ripetuto sta in un solo gruppo.
    for (const o of occurrences) {
      const refs = (c: ConditionDTO | null | undefined): string[] =>
        !c ? [] : "all" in c ? c.all.flatMap(refs) : "any" in c ? c.any.flatMap(refs) : [c.flowId];
      for (const f of refs(o.condition)) if (!masterRow.has(f)) diag("ERROR", "CONDITION_DANGLING", `condizione su ${f} assente`, o.order, o.flowId ?? undefined);
    }

    function popupOf(r: SourceRow, sectionKey: string): PopupRefDTO | undefined {
      const m = /\bPop-up\s+([^;.]+?)\s*(?:[;.]|$)/i.exec(r.note);
      if (!m) return undefined;
      const who = m[1].trim();
      const sourceGroup: GroupId | null = /PM/i.test(who) ? "PM_PERMESSI" : /UT|PE/i.test(who) ? "UT_PE" : /AIE/i.test(who) ? "AIE" : /DL/i.test(who) ? "DL" : null;
      if (!sourceGroup) {
        diag("WARNING", "POPUP_SOURCE", `pop-up "${who}" senza gruppo riconoscibile`, r.row, r.flowId);
        return undefined;
      }
      return { key: `${sectionKey}.POPUP_${snake(who)}`, label: `Da ${who}`, sourceGroup };
    }

    /* 13. trasversali, vincoli, versione */
    const transversal: FieldOccurrenceDTO[] = [
      // Note Operative: una per gruppo, del gruppo stesso (contratto v0.3.0, D-121).
      ...GROUP_IDS.map((g, i): FieldOccurrenceDTO => ({ occurrenceKey: noteOperativeKey(g), flowId: null, label: `Note Operative ${GROUP_LABELS[g]}`, sectionKey: "TRASV", order: i + 1, kind: "MASTER", ownerGroup: g, dataType: "LONGTEXT", required: false, condition: null, computed: null })),
      { occurrenceKey: "TRASV.FATTURABILE", flowId: null, label: "Fatturabile", sectionKey: "TRASV", order: GROUP_IDS.length + 1, kind: "MASTER", ownerGroup: "PM_PERMESSI", dataType: "SELECT", list: { listId: "SI_NO", kind: "CONTROLLED", allowOther: false }, required: false, condition: null, computed: null },
      { occurrenceKey: "TRASV.FATTURATO", flowId: null, label: "Fatturato", sectionKey: "TRASV", order: GROUP_IDS.length + 2, kind: "MASTER", ownerGroup: "PM_PERMESSI", dataType: "SELECT", list: { listId: "SI_NO", kind: "CONTROLLED", allowOther: false }, required: false, condition: null, computed: null },
    ];
    const constraints: ConstraintDefDTO[] = input.bindings.constraints.map((c) => {
      if (!(CONSTRAINT_CODES as readonly string[]).includes(c.code)) diag("ERROR", "CONSTRAINT_CODE", `codice vincolo sconosciuto ${c.code}`);
      const state = input.bindings.constraintStateLists[c.stateList];
      if (!!c.defaultEnte !== !!c.defaultEnteLabel) diag("ERROR", "CONSTRAINT_ENTE_LABEL", `vincolo ${c.code}: ente predefinito ed etichetta vanno indicati insieme`);
      return {
        code: c.code as ConstraintDefDTO["code"],
        label: c.label,
        stateList: { listId: c.stateList, kind: state?.kind ?? "CONTROLLED", allowOther: false },
        enteList: c.enteList ? { listId: c.enteList.listId, kind: c.enteList.kind, allowOther: c.enteList.kind === "CONFIGURABLE" } : null,
        defaultEnte: c.defaultEnte,
        defaultEnteLabel: c.defaultEnteLabel ?? null,
      };
    });

    const body = {
      id: templateId,
      label: tpl.label,
      baseline: input.baseline,
      sections,
      occurrences,
      transversal,
      repeatGroups,
      constraints,
    };
    const bindings: TemplateBindings = { computed: computedBindings, excluded, effects };
    // D-187: la versione copre tutto ciò che il motore usa, non solo il template mostrato. Cambiando solo un collegamento
    // (calcolati, esclusioni, effetti) la versione cambia, quindi lo snapshot immutabile di una versione (D-91,
    // $setOnInsert in bootstrapStore) non può mai restare con collegamenti diversi da quelli del codice.
    const version = `${input.baseline}.${sha256(stableStringify({ template: body, bindings }, 0)).slice(0, 12)}`;
    const template: TemplateDTO = { ...body, version };
    templates[templateId] = {
      template,
      bindings,
      source: { file: tpl.file, sha256: sources[tpl.file], rows: rows.length, flowIds: flowNums.length },
    };
    manifestTemplates[templateId] = { version, occurrences: occurrences.length, flowIds: masterRow.size, sourceRows: rows.length };
  }

  for (const f of input.conditions.formulations) {
    if (!usedFormulations.has(f.n)) diagnostics.push({ severity: "WARNING", code: "FORMULATION_UNUSED", message: `formulazione n.${f.n} mai incontrata negli MD` });
  }
  for (const o of input.overrides.overrides) {
    if (!usedOverrides.has(o.id) && !diagnostics.some((d) => d.code === "OVERRIDE_PRECONDITION" && d.row === o.sourceRow && d.templateId === o.templateId)) {
      diagnostics.push({ severity: "ERROR", code: "OVERRIDE_UNUSED", templateId: o.templateId, row: o.sourceRow, message: `${o.id} non applicata` });
    }
  }

  const sevOrder: Record<Severity, number> = { ERROR: 0, WARNING: 1, INFO: 2 };
  diagnostics.sort(
    (a, b) =>
      sevOrder[a.severity] - sevOrder[b.severity] ||
      (a.templateId ?? "").localeCompare(b.templateId ?? "") ||
      (a.row ?? 0) - (b.row ?? 0) ||
      a.code.localeCompare(b.code)
  );

  return {
    templates,
    diagnostics,
    manifest: {
      compilerVersion: COMPILER_VERSION,
      baseline: input.baseline,
      bindingsVersion: input.bindings.version,
      conditionsVersion: input.conditions.version,
      overridesVersion: input.overrides.version,
      sources,
      lists: sha256(JSON.stringify(input.lists)),
      templates: manifestTemplates,
    },
  };
}
