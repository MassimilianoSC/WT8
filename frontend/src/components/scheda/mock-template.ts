import type {
  ConstraintCode,
  ConstraintDefDTO,
  FieldOccurrenceDTO,
  GroupId,
  FieldValue,
  ListRefDTO,
  OccurrenceAccessDTO,
  PraticaDetailDTO,
  RepeatRowDTO,
  TemplateDTO,
} from "@/lib/contract";
import type { Option } from "@/components/scheda/fields/format";

/**
 * Small but representative demo template (shape of a TemplateDTO compiled
 * from an MD), used by tests and by the sheet preview until B2/B5 exist.
 */

type Occ = Omit<FieldOccurrenceDTO, "occurrenceKey" | "required" | "kind" | "ownerGroup"> &
  Partial<Pick<FieldOccurrenceDTO, "required" | "kind" | "ownerGroup">>;

function occ(o: Occ, group: GroupId): FieldOccurrenceDTO {
  return {
    required: false,
    kind: "MASTER",
    ownerGroup: group,
    ...o,
    occurrenceKey: o.flowId ? `${o.flowId}@${o.sectionKey}` : o.sectionKey,
  };
}

const CORE = "PM_PERMESSI.CORE_ANAGRAFICA_SITO";
const PREL = "PM_PERMESSI.FASE_PRELIMINARE";
const ITER = "PM_PERMESSI.ITER_AUTORIZZATIVO";
const UT = "UT_PE.UT";
const PE = "UT_PE.PE";
const AIE = "AIE.FASE_AIE";
const DL = "DL.DIREZIONE_LAVORI";

const SINO = { listId: "SI_NO", kind: "CONTROLLED" as const, allowOther: false };
const list = (listId: string, kind: ListRefDTO["kind"] = "CONTROLLED"): ListRefDTO => ({ listId, kind, allowOther: false });

/** The 11 fixed rows of the common Vincoli table (D-35), as the backend sends them. */
const CONSTRAINTS: ConstraintDefDTO[] = [
  { code: "MONUMENTALE", label: "Monumentale", stateList: list("STATO_VINCOLO_NP"), enteList: null, defaultEnte: "SOPRINTENDENZA", defaultEnteLabel: "Soprintendenza" },
  { code: "ARCHEOLOGICO", label: "Archeologico", stateList: list("STATO_VINCOLO_NP"), enteList: null, defaultEnte: "SOPRINTENDENZA", defaultEnteLabel: "Soprintendenza" },
  { code: "PAESAGGISTICO", label: "Paesaggistico", stateList: list("STATO_VINCOLO_ASSOLTO"), enteList: list("ENTE_PAESAGGISTICO"), defaultEnte: null, defaultEnteLabel: null },
  { code: "PARCO", label: "Parco", stateList: list("STATO_VINCOLO_ASSOLTO"), enteList: list("ENTE_PARCO", "CONFIGURABLE"), defaultEnte: null, defaultEnteLabel: null },
  { code: "AEROPORTUALE", label: "Aeroportuale", stateList: list("STATO_VINCOLO_NP"), enteList: list("ENTE_AEROPORTUALE"), defaultEnte: null, defaultEnteLabel: null },
  { code: "IDROGEOLOGICO", label: "Idrogeologico", stateList: list("STATO_VINCOLO_NP"), enteList: null, defaultEnte: "COMUNE", defaultEnteLabel: "Comune" },
  { code: "FASCIA_CIMITERIALE", label: "Fascia di rispetto — Cimiteriale", stateList: list("STATO_VINCOLO_NP"), enteList: null, defaultEnte: "COMUNE", defaultEnteLabel: "Comune" },
  { code: "FASCIA_POZZI", label: "Fascia di rispetto — Pozzi", stateList: list("STATO_VINCOLO_NP"), enteList: null, defaultEnte: "COMUNE", defaultEnteLabel: "Comune" },
  { code: "FASCIA_CORSI_ACQUA", label: "Fascia di rispetto — Corsi d'acqua", stateList: list("STATO_VINCOLO_NP"), enteList: null, defaultEnte: "COMUNE", defaultEnteLabel: "Comune" },
  { code: "ALTRO", label: "Altro", stateList: list("STATO_VINCOLO_TUTTI"), enteList: list("ENTE_PARCO", "CONFIGURABLE"), defaultEnte: null, defaultEnteLabel: null },
  { code: "AMBIENTALI_NATURALISTICI", label: "Vincoli Ambientali Naturalistici", stateList: list("STATO_VINCOLO_NP"), enteList: list("ENTE_AMBIENTALI"), defaultEnte: null, defaultEnteLabel: null },
];
const popupUt = { key: `${PREL}.POPUP_UT`, label: "Pop-up UT", sourceGroup: "UT_PE" as const };

export const MOCK_TEMPLATE: TemplateDTO = {
  id: "INWIT",
  label: "INWIT",
  baseline: "2026-10-08",
  version: "INWIT@2026-10-08.1",
  constraints: CONSTRAINTS,
  sections: [
    { key: CORE, label: "Core Anagrafica Sito", group: "PM_PERMESSI", order: 1 },
    { key: PREL, label: "Fase Preliminare", group: "PM_PERMESSI", order: 2 },
    { key: ITER, label: "Iter Autorizzativo", group: "PM_PERMESSI", order: 3 },
    { key: UT, label: "UT", group: "UT_PE", subsection: "UT", order: 4 },
    { key: PE, label: "PE", group: "UT_PE", subsection: "PE", order: 5 },
    { key: AIE, label: "Fase AIE", group: "AIE", order: 6 },
    { key: DL, label: "Direzione Lavori", group: "DL", order: 7 },
  ],
  occurrences: [
    occ({ flowId: "F001", label: "Codice G7", sectionKey: CORE, order: 1, dataType: "TEXT", required: true }, "PM_PERMESSI"),
    occ({ flowId: "F002", label: "Codice Sito", sectionKey: CORE, order: 2, dataType: "TEXT", required: true }, "PM_PERMESSI"),
    occ({ flowId: "F003", label: "Nome Sito", sectionKey: CORE, order: 3, dataType: "TEXT", required: true }, "PM_PERMESSI"),
    occ({ flowId: "F006", label: "Tipologia sito", sectionKey: CORE, order: 4, dataType: "SELECT", list: { listId: "TIPOLOGIA_SITO", kind: "CONTROLLED", allowOther: false } }, "PM_PERMESSI"),
    occ({ flowId: "F007", label: "Regione", sectionKey: CORE, order: 5, dataType: "SELECT", list: { listId: "ISTAT_REGIONI", kind: "ISTAT", allowOther: false } }, "PM_PERMESSI"),
    occ({ flowId: "F008", label: "Provincia", sectionKey: CORE, order: 6, dataType: "SELECT", list: { listId: "ISTAT_PROVINCE", kind: "ISTAT", allowOther: false, parentFlowId: "F007" } }, "PM_PERMESSI"),
    occ({ flowId: "F009", label: "Latitudine", sectionKey: CORE, order: 7, dataType: "NUMBER" }, "PM_PERMESSI"),
    occ({ flowId: "F010", label: "Longitudine", sectionKey: CORE, order: 8, dataType: "NUMBER" }, "PM_PERMESSI"),
    occ({ flowId: "F011", label: "Proprietà / Host", sectionKey: CORE, order: 9, dataType: "MULTISELECT", list: { listId: "PROPRIETA_HOST", kind: "CONFIGURABLE", allowOther: true } }, "PM_PERMESSI"),
    occ({ flowId: "F020", label: "Data assegnazione", sectionKey: PREL, order: 1, dataType: "DATE" }, "PM_PERMESSI"),
    occ({ flowId: "F021", label: "Tecnico PP", sectionKey: PREL, order: 2, dataType: "USER", list: { listId: "USERS", kind: "USERS", allowOther: false, userRole: "PERMESSI", allowNone: true } }, "PM_PERMESSI"),
    occ({ flowId: "F022", label: "Note assegnazione", sectionKey: PREL, order: 3, dataType: "LONGTEXT" }, "PM_PERMESSI"),
    occ({ flowId: "F102", label: "Forecast Invio Caratterizzazione", sectionKey: PREL, order: 4, dataType: "DATE", kind: "MIRROR", ownerGroup: "UT_PE", popup: popupUt }, "UT_PE"),
    occ({ flowId: "F103", label: "Tecnico Caratterizzazione", sectionKey: PREL, order: 5, dataType: "USER", kind: "MIRROR", ownerGroup: "UT_PE", popup: popupUt, list: { listId: "USERS", kind: "USERS", allowOther: false, userRole: "UT" } }, "UT_PE"),
    occ({ flowId: "F050", label: "Data protocollo", sectionKey: ITER, order: 1, dataType: "DATE" }, "PM_PERMESSI"),
    occ({ flowId: "F051", label: "Forecast Ottenimento Permessi", sectionKey: ITER, order: 2, dataType: "DATE", computed: { formula: "FORECAST_OTTENIMENTO_PERMESSI", description: "Protocollo + 67 giorni di calendario", manualOverride: true } }, "PM_PERMESSI"),
    occ({ flowId: "F058", label: "Forecast Parere Arpa", sectionKey: ITER, order: 3, dataType: "DATE", repeatGroup: "ARPA" }, "PM_PERMESSI"),
    occ({ flowId: "F059", label: "Parere Arpa", sectionKey: ITER, order: 4, dataType: "DATE", repeatGroup: "ARPA" }, "PM_PERMESSI"),
    occ({ flowId: "F060", label: "Esito parere Arpa", sectionKey: ITER, order: 5, dataType: "SELECT", repeatGroup: "ARPA", list: { listId: "ESITO_ARPA", kind: "CONTROLLED", allowOther: false }, condition: { flowId: "F059", op: "FILLED" } }, "PM_PERMESSI"),
    occ({ flowId: "F065", label: "Vincoli", sectionKey: ITER, order: 6, dataType: "TEXT", repeatGroup: "VINCOLI" }, "PM_PERMESSI"),
    occ({ flowId: "F067", label: "Forecast Geologica", sectionKey: ITER, order: 7, dataType: "DATE", computed: { formula: "FORECAST_GEOLOGICA", description: "Assegnazione Geologica + 15 giorni di calendario", manualOverride: false } }, "PM_PERMESSI"),
    occ({ flowId: "F080", label: "Invio AS/VS", sectionKey: UT, order: 1, dataType: "DATE" }, "UT_PE"),
    occ({ flowId: "F081", label: "PE", sectionKey: UT, order: 2, dataType: "SELECT", list: SINO }, "UT_PE"),
    occ({ flowId: "F082", label: "Assegnazione PE", sectionKey: PE, order: 1, dataType: "DATE", condition: { flowId: "F081", op: "EQ", value: "SI" } }, "UT_PE"),
    occ({ flowId: "F083", label: "Invio PE", sectionKey: PE, order: 2, dataType: "DATE" }, "UT_PE"),
    occ({ flowId: "F090", label: "Forecast AIE", sectionKey: AIE, order: 1, dataType: "DATE" }, "AIE"),
    occ({ flowId: "F091", label: "Approvazione AIE", sectionKey: AIE, order: 2, dataType: "DATE" }, "AIE"),
    occ({ flowId: "F095", label: "Forecast CIL", sectionKey: DL, order: 1, dataType: "DATE" }, "DL"),
    occ({ flowId: "F096", label: "Data FL", sectionKey: DL, order: 2, dataType: "DATE" }, "DL"),
  ],
  transversal: [
    // One Note Operative per group (v0.3.0, D-121), owned by that group.
    ...(["PM_PERMESSI", "UT_PE", "AIE", "DL"] as GroupId[]).map((g, i) =>
      occ({ flowId: null, label: "Note Operative", sectionKey: `TRASV.NOTE_OPERATIVE.${g}`, order: 1 + i / 10, dataType: "LONGTEXT" }, g)
    ),
    occ({ flowId: null, label: "Fatturabile", sectionKey: "TRASV.FATTURABILE", order: 2, dataType: "SELECT", computed: { formula: "FATTURABILE", description: "SI 30 giorni dopo Ottenimento Permessi con ultimo esito ARPA Positivo", manualOverride: true } }, "PM_PERMESSI"),
    occ({ flowId: null, label: "Fatturato", sectionKey: "TRASV.FATTURATO", order: 3, dataType: "SELECT" }, "PM_PERMESSI"),
  ],
  repeatGroups: [
    { key: "ARPA", label: "Ciclo ARPA", flowIds: ["F058", "F059", "F060"], rowPolicy: "DYNAMIC", schemaKind: "FIELDS" },
    { key: "VINCOLI", label: "Vincoli", flowIds: ["F065"], rowPolicy: "FIXED", schemaKind: "VINCOLI" },
  ],
};

export const MOCK_OPTIONS: Record<string, Option[]> = {
  // Global lists (templateId = null, v0.1.1): union of all clients + Altro.
  CLIENTE_FINALE: [
    { code: "ILIAD", label: "ILIAD" },
    { code: "WIND3", label: "WIND 3" },
    { code: "ZEFIRO", label: "ZEFIRO" },
    { code: "INWIT", label: "Inwit" },
    { code: "TOWERNET", label: "TowerNet" },
    { code: "TIM_FIBERCOP", label: "TIM/Fibercop" },
    { code: "VODAFONE", label: "Vodafone" },
    { code: "FASTWEB", label: "FASTWEB" },
    { code: "LEONARDO", label: "Leonardo" },
    { code: "ALTRO", label: "Altro" },
  ],
  COMMITTENTE: [
    { code: "TODOS", label: "Todos" },
    { code: "TELEBIT", label: "Telebit" },
    { code: "SIRTI", label: "Sirti" },
    { code: "FASTWEB", label: "Fastweb" },
    { code: "ALTRO", label: "Altro" },
  ],
  SI_NO: [
    { code: "SI", label: "SÌ" },
    { code: "NO", label: "NO" },
  ],
  TIPOLOGIA_SITO: [
    { code: "RAW_LAND", label: "Raw Land" },
    { code: "ROOF_TOP", label: "Roof Top" },
    { code: "TRALICCIO", label: "Traliccio" },
  ],
  // List ids of the real templates (B2); codes as in LISTE_VALORI_INIZIALI.
  ESITO_PARERE_ARPA: [
    { code: "POSITIVO", label: "Positivo" },
    { code: "NEGATIVO", label: "Negativo" },
  ],
  STATO_ODA: [
    { code: "DA_RICHIEDERE", label: "Da richiedere" },
    { code: "RICHIESTI", label: "Richiesti" },
    { code: "PRESENTI", label: "Presenti" },
  ],
  STATO_VINCOLO_PAN: [
    { code: "PRESENTE", label: "Presente" },
    { code: "ASSENTE", label: "Assente" },
    { code: "NON_PERTINENTE", label: "Non pertinente" },
  ],
  STATO_VINCOLO_PAA: [
    { code: "PRESENTE", label: "Presente" },
    { code: "ASSENTE", label: "Assente" },
    { code: "ASSOLTO", label: "Assolto" },
  ],
  STATO_VINCOLO_ALTRO: [
    { code: "PRESENTE", label: "Presente" },
    { code: "ASSENTE", label: "Assente" },
    { code: "ASSOLTO", label: "Assolto" },
    { code: "NON_PERTINENTE", label: "Non pertinente" },
  ],
  STATO_VINCOLO_NATURALISTICI: [
    { code: "PRESENTE", label: "Presente" },
    { code: "ASSENTE", label: "Assente" },
    { code: "NON_PERTINENTE", label: "Non pertinente" },
  ],
  ENTE_VINCOLO_PAESAGGISTICO: [
    { code: "SOPRINTENDENZA", label: "Soprintendenza" },
    { code: "COMUNE", label: "Comune" },
  ],
  ENTE_VINCOLO_AEROPORTUALE: [
    { code: "ENAC", label: "ENAC" },
    { code: "ENAV", label: "ENAV" },
  ],
  ENTE_VINCOLO_NATURALISTICI: [
    { code: "SIC", label: "SIC" },
    { code: "NATURA2000", label: "Natura2000" },
    { code: "ALTRO", label: "Altro" },
  ],
  ESITO_ARPA: [
    { code: "POSITIVO", label: "Positivo" },
    { code: "NEGATIVO", label: "Negativo" },
  ],
  STATO_VINCOLO_NP: [
    { code: "PRESENTE", label: "Presente" },
    { code: "ASSENTE", label: "Assente" },
    { code: "NON_PERTINENTE", label: "Non pertinente" },
  ],
  STATO_VINCOLO_ASSOLTO: [
    { code: "PRESENTE", label: "Presente" },
    { code: "ASSENTE", label: "Assente" },
    { code: "ASSOLTO", label: "Assolto" },
  ],
  STATO_VINCOLO_TUTTI: [
    { code: "PRESENTE", label: "Presente" },
    { code: "ASSENTE", label: "Assente" },
    { code: "ASSOLTO", label: "Assolto" },
    { code: "NON_PERTINENTE", label: "Non pertinente" },
  ],
  ENTE_PAESAGGISTICO: [
    { code: "SOPRINTENDENZA", label: "Soprintendenza" },
    { code: "COMUNE", label: "Comune" },
  ],
  ENTE_AEROPORTUALE: [
    { code: "ENAC", label: "ENAC" },
    { code: "ENAV", label: "ENAV" },
  ],
  ENTE_PARCO: [{ code: "ENTE_PARCO_SUD_MILANO", label: "Parco Agricolo Sud Milano" }],
  ENTE_AMBIENTALI: [
    { code: "SIC", label: "SIC" },
    { code: "NATURA2000", label: "Natura2000" },
    { code: "ALTRO", label: "Altro" },
  ],
  PROPRIETA_HOST: [
    { code: "INWIT", label: "Inwit" },
    { code: "FASTWEB_VODAFONE", label: "Fastweb-Vodafone" },
    { code: "PRIVATO", label: "Privato" },
  ],
  ISTAT_REGIONI: [
    { code: "03", label: "Lombardia" },
    { code: "01", label: "Piemonte" },
  ],
};

/** Provinces by region code (ISTAT cascade demo). */
export const MOCK_PROVINCE: Record<string, Option[]> = {
  "03": [
    { code: "015", label: "Milano" },
    { code: "016", label: "Bergamo" },
  ],
  "01": [
    { code: "001", label: "Torino" },
    { code: "004", label: "Cuneo" },
  ],
};

export const MOCK_USERS: Option[] = [
  { code: "u-pp-1", label: "Giulia Rossi" },
  { code: "u-ut-1", label: "Marco Bianchi" },
];

function accessFor(t: TemplateDTO, editableGroups: GroupId[]): Record<string, OccurrenceAccessDTO> {
  const access: Record<string, OccurrenceAccessDTO> = {};
  for (const o of [...t.occurrences, ...t.transversal]) {
    if (o.computed && o.flowId && !o.computed.manualOverride) access[o.occurrenceKey] = { editable: false, reason: "COMPUTED" };
    else if (o.kind === "MIRROR") access[o.occurrenceKey] = { editable: false, reason: "MIRROR" };
    else if (!editableGroups.includes(o.ownerGroup)) access[o.occurrenceKey] = { editable: false, reason: "NOT_MY_GROUP" };
    else access[o.occurrenceKey] = { editable: true };
  }
  return access;
}

/** Vincoli rows: the first six compiled, Paesaggistico Presente. */
function vincoliRows(filled: boolean): RepeatRowDTO[] {
  return CONSTRAINTS.map((c, i) => ({
    rowId: `vinc-${c.code}`,
    values: {},
    constraint: {
      code: c.code as ConstraintCode,
      stato: filled && i < 6 ? { code: c.code === "PAESAGGISTICO" ? "PRESENTE" : "ASSENTE" } : null,
      ente: filled && c.code === "PAESAGGISTICO" ? { code: "SOPRINTENDENZA" } : null,
    },
  }));
}

export const MOCK_VINCOLI_EMPTY = (): RepeatRowDTO[] => vincoliRows(false);

export const MOCK_DETAIL: PraticaDetailDTO = {
  id: "mock-0",
  templateId: "INWIT",
  codiceSito: "MI1000",
  nomeSito: "Milano Centro",
  committente: { code: "TODOS" },
  clienteFinale: { code: "INWIT" },
  codiceG7: "400000",
  iteration: 1,
  statoAttivita: "PROTOCOLLATO",
  enabledGroups: ["PM_PERMESSI", "UT_PE"],
  archived: false,
  archivedAt: null,
  originPracticeId: null,
  openAlerts: 1,
  progress: {
    PM_PERMESSI: { filled: 8, total: 16 },
    UT_PE: { filled: 1, total: 4 },
    AIE: { filled: 0, total: 2 },
    DL: { filled: 0, total: 2 },
  },
  createdAt: "2026-09-01T09:00:00+02:00",
  updatedAt: "2026-10-07T17:30:00+02:00",
  revision: 7,
  iterationId: "it-mock-0-1",
  templateVersion: "INWIT@2026-10-08.1",
  statoSource: "AUTO",
  manualLocks: [],
  transversal: {
    // PM/Permessi (editable) and UT/PE (read-only: other group) are visible; AIE and DL are not.
    noteOperative: { PM_PERMESSI: "", UT_PE: "[demo] Sopralluogo da fissare con il custode" },
    fatturabile: "NO",
    fatturabileManual: false,
    fatturato: null,
  },
  values: {
    F001: "400000",
    F002: "MI1000",
    F003: "Milano Centro",
    F006: { code: "RAW_LAND" },
    F007: { code: "03" },
    F009: 45.4642,
    F010: 9.19,
    F020: "2026-09-02",
    F050: "2026-09-20",
    F051: "2026-11-26",
    F102: "2026-10-15",
    F081: { code: "NO" },
  },
  repeats: {
    ARPA: [
      { rowId: "arpa-1", values: { F058: "2026-09-25", F059: "2026-09-30", F060: { code: "NEGATIVO" } } },
      { rowId: "arpa-2", values: { F058: "2026-10-20", F059: null } },
    ],
    VINCOLI: vincoliRows(true),
  },
  access: accessFor(MOCK_TEMPLATE, ["PM_PERMESSI"]),
  repeatAccess: {
    ARPA: { canAddRows: true, canRemoveRows: true },
    VINCOLI: { canAddRows: false, canRemoveRows: false },
  },
  actions: {
    assignableGroups: ["UT_PE", "AIE", "DL"],
    canAssign: true,
    canChangeStato: true,
    canArchive: false,
    canRestore: false,
    canDelete: false,
    canRework: true,
    canResubmit: true,
  },
  iterations: [{ id: "it-mock-0-1", n: 1, codiceG7: "400000", createdAt: "2026-09-01T09:00:00+02:00", current: true }],
  alerts: [
    {
      id: "al-1",
      practiceId: "mock-0",
      iteration: 1,
      rule: "SOPRALLUOGO",
      label: "Data sopralluogo non compilata a 7 giorni dalla Data assegnazione",
      flowId: "F020",
      openedAt: "2026-09-11T09:00:00+02:00",
      dueAt: "2026-09-11",
      status: "OPEN",
      executionStatus: "ACTIVE",
      canCloseManually: false,
    },
  ],
};

/** Placeholder items for lists the fixtures do not know: marked "[demo]". */
export function placeholderOptions(listId: string): Option[] {
  return [1, 2, 3].map((n) => ({ code: `${listId}_DEMO_${n}`, label: `[demo] Valore dimostrativo ${n}` }));
}

/** Fixture options of a list for the tests (the app uses the real lists). */
export function mockOptions(list: ListRefDTO, parentValue: FieldValue | undefined): Option[] {
  if (list.kind === "USERS") return MOCK_USERS;
  if (list.parentFlowId) {
    const parent = parentValue && typeof parentValue === "object" && !Array.isArray(parentValue) ? parentValue.code : null;
    return parent ? MOCK_PROVINCE[parent] ?? placeholderOptions(list.listId) : [];
  }
  return MOCK_OPTIONS[list.listId] ?? placeholderOptions(list.listId);
}
