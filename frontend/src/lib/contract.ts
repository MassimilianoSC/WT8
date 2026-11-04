/**
 * Contratto dei dati tra backend (o2) e frontend (o3).
 *
 * Segue docs/coordinamento/CONTRATTO_DATI.md — versione 0.3.6 (08/10/2026).
 * Il documento precede questo file (D-5): per cambiare la forma di un dato si aggiorna
 * prima il contratto, poi questo file. Solo tipi e costanti, nessuna logica né import
 * dal resto dell'app (utilizzabile sia dal server sia dal client).
 */

export const CONTRACT_VERSION = "0.6.4";

// ─── §1 Convenzioni ──────────────────────────────────────────────────────────

/** Codici del 409 (v0.1.7). */
export const CONFLICT_CODES = ["REVISION_CONFLICT", "ITERATION_CONFLICT", "OPERATION_REUSED"] as const;
export type ConflictCode = (typeof CONFLICT_CODES)[number];

/** Corpo di ogni risposta d'errore (status 400/401/403/404/409/422). */
export interface ErrorDTO {
  error: string;
  /**
   * Solo nel 403 di PATCH /fields (§5.2): tutte le modifiche rifiutate, come occurrenceKey; per i trasversali la loro
   * chiave TRASV.* e per ADD_ROW / REMOVE_ROW "repeat:<KEY>" (v0.3.3).
   */
  rejected?: string[];
  /**
   * Solo nel 409: REVISION_CONFLICT → ricaricare la pratica; ITERATION_CONFLICT → ricaricare
   * sull'iterazione corrente; OPERATION_REUSED → stessa operationId con un corpo diverso.
   */
  code?: ConflictCode;
  /** Nel 409 REVISION_CONFLICT: revisione corrente della pratica. */
  currentRevision?: number;
}

/**
 * operationId facoltativa (UUID): il client la genera una volta per azione dell'utente e la riusa nei
 * tentativi. Stessa operationId e stesso corpo → nessun effetto ripetuto e risposta con lo stato ATTUALE della
 * risorsa (v0.2.3), non una copia della prima risposta; corpo diverso → 409 OPERATION_REUSED. Ambito: per utente. Per DELETE viaggia come ?operationId=.
 */
export interface OperationRequest {
  operationId?: string;
}

/** Elenco paginato (practices, history). */
export interface PagedDTO<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Timestamp ISO 8601 con fuso, es. "2026-10-08T09:00:00+02:00". */
export type IsoTimestamp = string;
/** Data utente nel trasporto: "YYYY-MM-DD" (l'interfaccia mostra gg/mm/aaaa). */
export type IsoDate = string;

// ─── §2 Enumerazioni ─────────────────────────────────────────────────────────

export const TEMPLATE_IDS = ["ILIAD", "TOWERNET", "TIM_FIBERCOP", "INWIT", "FASTWEB_VODAFONE", "LEONARDO"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const GROUP_IDS = ["PM_PERMESSI", "UT_PE", "AIE", "DL"] as const;
export type GroupId = (typeof GROUP_IDS)[number];

/** ADMIN è un flag dell'utente (UserDTO.isAdmin), non un ruolo di gruppo. */
export const ROLE_IDS = ["PM", "PERMESSI", "UT", "PE", "AIE", "DL"] as const;
export type RoleId = (typeof ROLE_IDS)[number];

/** Corrispondenza ruolo → gruppo (D-17). Le appartenenze incoerenti sono rifiutate con 422. */
export const ROLE_GROUP: Readonly<Record<RoleId, GroupId>> = {
  PM: "PM_PERMESSI",
  PERMESSI: "PM_PERMESSI",
  UT: "UT_PE",
  PE: "UT_PE",
  AIE: "AIE",
  DL: "DL",
};

export const STATI_ATTIVITA = [
  "CREATA",
  "ASSEGNATO",
  "IN_APPROVAZIONE",
  "PROTOCOLLATO",
  "INTEGRAZIONE_RICHIESTA",
  "AUTORIZZATO",
  "DINIEGATO",
  "TAR",
  "REALIZZATO",
  "TERMINATO",
  "STAND_BY",
  "KO",
] as const;
export type StatoAttivita = (typeof STATI_ATTIVITA)[number];

export const DATA_TYPES = ["TEXT", "LONGTEXT", "NUMBER", "DATE", "SELECT", "MULTISELECT", "USER", "USERS"] as const;
export type DataType = (typeof DATA_TYPES)[number];

// ─── §3 Template ─────────────────────────────────────────────────────────────

/** GET /api/templates → TemplateSummaryDTO[] */
export interface TemplateSummaryDTO {
  id: TemplateId;
  label: string;
  baseline: string;
}

/** GET /api/templates/{templateId}[?version=] → TemplateDTO */
export interface TemplateDTO {
  id: TemplateId;
  label: string;
  /** Data della baseline, es. "2026-10-08". */
  baseline: string;
  /** Versione immutabile del template compilato; ogni iterazione ricorda la propria. */
  version: string;
  /** In ordine di visualizzazione. */
  sections: SectionDTO[];
  /**
   * Tutte le occorrenze delle sezioni, lista piatta ordinata per (ordine della sezione, order
   * dell'occorrenza). Il raggruppamento per sezione si fa con sectionKey.
   */
  occurrences: FieldOccurrenceDTO[];
  /** Note Operative, Fatturabile, Fatturato (D-37): senza flowId. */
  transversal: FieldOccurrenceDTO[];
  repeatGroups: RepeatGroupDTO[];
  /** Le 11 voci fisse della tabella Vincoli (D-35), in ordine. */
  constraints: ConstraintDefDTO[];
}

export interface SectionDTO {
  /** Slug stabile, es. "PM_PERMESSI.FASE_PRELIMINARE". */
  key: string;
  /** Come nell'MD, es. "Fase Preliminare". */
  label: string;
  group: GroupId;
  /** Solo per UT_PE. */
  subsection?: "UT" | "PE";
  order: number;
}

/** Note Operative: una occorrenza per gruppo (v0.3.0, D-121), ownerGroup = quel gruppo. */
export type NoteOperativeOccurrenceKey = `TRASV.NOTE_OPERATIVE.${GroupId}`;
export const noteOperativeKey = (group: GroupId): NoteOperativeOccurrenceKey => `TRASV.NOTE_OPERATIVE.${group}`;
export const TRANSVERSAL_OCCURRENCE_KEYS = [...GROUP_IDS.map(noteOperativeKey), "TRASV.FATTURABILE", "TRASV.FATTURATO"] as const;
export type TransversalOccurrenceKey = NoteOperativeOccurrenceKey | "TRASV.FATTURABILE" | "TRASV.FATTURATO";

export interface FieldOccurrenceDTO {
  /** Univoca nel template: `${flowId}@${sectionKey}`; per i trasversali una di TRANSVERSAL_OCCURRENCE_KEYS. */
  occurrenceKey: string;
  /** "F001"… (D-30); null solo per i trasversali. */
  flowId: string | null;
  /** Etichetta dell'MD: NON è una chiave. */
  label: string;
  sectionKey: string;
  /** Posizione nella sezione (riga # dell'MD). */
  order: number;
  /** Un solo MASTER per flowId. */
  kind: "MASTER" | "MIRROR";
  /** Gruppo che possiede il MASTER (per i mirror: quello del master). */
  ownerGroup: GroupId;
  dataType: DataType;
  /** Per SELECT / MULTISELECT / USER / USERS. */
  list?: ListRefDTO;
  /** Obbligatorio alla creazione (D-38). */
  required: boolean;
  /** Chiave del gruppo ripetibile a cui appartiene. */
  repeatGroup?: string;
  /** Condizione di interfaccia (D-31); null = sempre visibile. Semantica: vedi ConditionDTO. */
  condition?: ConditionDTO | null;
  /** Campo calcolato (D-42). */
  computed?: ComputedDTO | null;
  /** Campo Universale (solo informativo). */
  universal?: string;
  /** L'occorrenza fa parte di un pop-up (blocco di mirror di un altro gruppo). */
  popup?: PopupRefDTO;
}

export interface PopupRefDTO {
  /** Univoca nel template, es. "PM_PERMESSI.FASE_PRELIMINARE.POPUP_UT". */
  key: string;
  /** Es. "Da UT+PE". */
  label: string;
  /** Gruppo che possiede i master mostrati nel pop-up. */
  sourceGroup: GroupId;
}

export interface ListRefDTO {
  /** Es. "STATO_ODA", "TIPOLOGIA_STRUTTURA". */
  listId: string;
  kind: "CONTROLLED" | "CONFIGURABLE" | "ISTAT" | "USERS";
  /** "Altro" con testo manuale (perimetro: R-1 D1). */
  allowOther: boolean;
  /** Per kind = USERS (D-39). */
  userRole?: RoleId;
  /** Cascata (ISTAT): flowId del campo da cui dipendono i valori (Provincia → Regione, Comune → Provincia). */
  parentFlowId?: string;
  /** USER/USERS con la voce "Nessuno" (codice NONE_CODE, esclusivo: in USERS non si combina con altri). */
  allowNone?: boolean;
}

/** Codice della voce "Nessuno" dei campi utente (ListRefDTO.allowNone). */
export const NONE_CODE = "NESSUNO";

/**
 * Condizione di interfaccia. Semantica (v0.1.5, identica su frontend e backend):
 * - vuoto (D-110) = null, stringa vuota o di soli spazi, array vuoto, codice vuoto ({code: ""}), array di soli
 *   codici vuoti; FILLED = non vuoto, EMPTY = vuoto;
 * - EQ / IN confrontano i codici (SelectValue.code); su un MULTISELECT basta un codice; NEQ è vero anche a campo vuoto;
 * - all: [] è vero, any: [] è falso;
 * - flowId dello stesso gruppo ripetibile dell'occorrenza → stessa riga;
 * - flowId di un altro gruppo ripetibile (o citato da un'occorrenza non ripetibile) → vera se vera su almeno
 *   una riga (FILLED / EQ / IN); EMPTY = nessuna riga compilata, NEQ = nessuna riga con quel codice;
 * - flowId non ripetibile → valori non ripetibili della pratica;
 * - FILLED(flowId contenitore di VINCOLI) è vero se almeno un vincolo ha uno stato compilato (v0.1.7).
 * Agisce solo sull'interfaccia: il backend non rifiuta una scrittura perché la condizione è falsa (D-31).
 */
export type ConditionDTO =
  | { all: ConditionDTO[] }
  | { any: ConditionDTO[] }
  /** Confronto con codici (nelle liste ISTAT: codice ISTAT, es. Piemonte = "01"). */
  | { flowId: string; op: "EQ" | "NEQ" | "IN"; value: string | string[] }
  | { flowId: string; op: "FILLED" | "EMPTY" };

export interface ComputedDTO {
  /** Identificatore, es. "FORECAST_GEOLOGICA", "FORECAST_OTTENIMENTO_PERMESSI". */
  formula: string;
  /** Testo leggibile per l'utente. */
  description: string;
  /**
   * true = l'utente può sovrascriverlo e da quel momento il calcolo si ferma (Forecast Ottenimento
   * Permessi, D-42); false = mai modificabile a mano (Tipologia attività PE, Forecast Geologica,
   * Forecast Protocollo ILIAD).
   */
  manualOverride: boolean;
}

export interface RepeatGroupDTO {
  /** Es. "TENANT", "INTEGRAZIONE", "ENTE", "ODA", "ARPA", "VINCOLI". */
  key: string;
  label: string;
  /** Campi che si ripetono insieme (VINCOLI: il solo flowId contenitore dell'MD). */
  flowIds: string[];
  /** FIXED = righe fisse, niente ADD_ROW / REMOVE_ROW (solo VINCOLI). */
  rowPolicy: "DYNAMIC" | "FIXED";
  /** VINCOLI = righe strutturate (ConstraintValueDTO), non valori per flowId. */
  schemaKind: "FIELDS" | "VINCOLI";
}

/** Codici stabili delle 11 voci della tabella Vincoli (D-35, D-99). */
export const CONSTRAINT_CODES = [
  "MONUMENTALE",
  "ARCHEOLOGICO",
  "PAESAGGISTICO",
  "PARCO",
  "AEROPORTUALE",
  "IDROGEOLOGICO",
  "FASCIA_CIMITERIALE",
  "FASCIA_POZZI",
  "FASCIA_CORSI_ACQUA",
  "ALTRO",
  "AMBIENTALI_NATURALISTICI",
] as const;
export type ConstraintCode = (typeof CONSTRAINT_CODES)[number];

export interface ConstraintDefDTO {
  code: ConstraintCode;
  /** Come nella tabella degli MD. */
  label: string;
  /** Stati ammessi per quel vincolo (es. PRESENTE / ASSENTE / NON_PERTINENTE). */
  stateList: ListRefDTO;
  /** Enti tra cui scegliere (es. SOPRINTENDENZA / COMUNE); null = ente unico predefinito. */
  enteList: ListRefDTO | null;
  /** Codice dell'ente predefinito, se unico. */
  defaultEnte: string | null;
  /** Etichetta dell'ente predefinito, es. "Soprintendenza" (v0.2.1). */
  defaultEnteLabel: string | null;
}

// ─── §4 Utente e sessione ────────────────────────────────────────────────────

export interface MembershipDTO {
  templateId: TemplateId;
  group: GroupId;
  role: RoleId;
  leader: boolean;
}

export type UserStatus = "active" | "invited" | "deactivated";

/** Elemento di GET /api/users, risposta di POST/PATCH /api/users. */
export interface UserDTO {
  id: string;
  name: string;
  email: string;
  status: UserStatus;
  isAdmin: boolean;
  /** Una o più coppie (cliente, gruppo, ruolo) (D-19). */
  memberships: MembershipDTO[];
  /**
   * v0.6.0 §15.2: profilo Direzione (sola lettura di Andamento e Statistiche). Sempre presente nelle risposte del
   * server; falso con l'interruttore PH_ANDAMENTO spento. Facoltativo nel tipo solo per i dati di prova esistenti.
   */
  direzione?: boolean;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

/**
 * GET /api/users (ADMIN). templatesWithoutPmLeader: template senza alcun PM leader attivo (D-101); creare
 * pratiche lì, o lasciare senza PM leader un template con pratiche non archiviate, dà 422.
 */
export interface UserListResponse {
  items: UserDTO[];
  templatesWithoutPmLeader: TemplateId[];
}

/**
 * GET /api/me: l'utente in sessione con i template in cui può creare pratiche (membership PM; ADMIN: tutti; D-20).
 * mustChangePassword (v0.4.1, D-173): vero per il primo ADMIN creato dall'ambiente finché non cambia la password;
 * nel frattempo tutte le /api/* (tranne GET /api/me, POST /api/auth/change-password e NextAuth) rispondono 403 con
 * code "CAMBIO_PASSWORD". Il server lo manda SEMPRE (booleano); obbligatorio nel tipo (punto 4 della D-173).
 */
export type MeDTO = UserDTO & {
  canCreate: TemplateId[];
  mustChangePassword: boolean;
  /** §13.1: assente = assistente non disponibile (PH_AI_ENABLED spento), il client nasconde "Chiedi". */
  assistant?: AssistantStatusDTO;
  /** v0.6.0 §15.1: funzioni dietro interruttore. Sempre presente nelle risposte del server. */
  features?: FeaturesDTO;
};

/** v0.6.0 §15.1: interruttori delle funzioni in preparazione (spente = il frontend nasconde menu e pagine). */
export interface FeaturesDTO {
  andamento: boolean;
}

/** POST /api/users (ADMIN, invito) → UserDTO (201). Almeno una appartenenza se isAdmin è falso. */
export interface UserInviteRequest {
  name: string;
  email: string;
  isAdmin?: boolean;
  /** v0.6.0 §15.2: solo con l'interruttore acceso (altrimenti 422); con direzione le appartenenze possono mancare. */
  direzione?: boolean;
  memberships: MembershipDTO[];
}

/** PATCH /api/users/{id} (ADMIN) → UserDTO. memberships sostituisce l'elenco intero. */
// POST /api/users/{id}/resend-invite (ADMIN) → UserDTO: solo utenti "invited" (altrimenti 409); annulla il
// token precedente e rimanda la mail d'invito (v0.1.11, D-108).
export interface UserUpdateRequest {
  name?: string;
  status?: UserStatus;
  isAdmin?: boolean;
  /** v0.6.0 §15.2: solo con l'interruttore acceso (altrimenti 422). */
  direzione?: boolean;
  memberships?: MembershipDTO[];
}

/**
 * GET /api/users/assignable?templateId=&role= → AssignableUserDTO[] (D-39). Nei valori dei campi
 * USER/USERS SelectValue.code è l'id dell'utente; un utente disattivato resta leggibile nei valori salvati.
 */
export interface AssignableUserDTO {
  id: string;
  name: string;
}

/** Contenuto di session.user (NextAuth). Appartenenze e leader si leggono da getCurrentUser(). */
export interface SessionUserDTO {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
}

// ─── §5 Pratica ──────────────────────────────────────────────────────────────

export interface SelectValue {
  /** "ALTRO" quando l'utente usa "Altro"; nei campi USER/USERS è l'id dell'utente (o NONE_CODE). */
  code: string;
  otherText?: string;
}

export type FieldValue =
  | null
  /** TEXT, LONGTEXT, DATE ("YYYY-MM-DD"). */
  | string
  /** NUMBER. */
  | number
  /** SELECT, USER. */
  | SelectValue
  /** MULTISELECT, USERS. */
  | SelectValue[];
// Latitudine e Longitudine sono due occorrenze NUMBER distinte (decimali WGS84), non un tipo composto.

/**
 * Per gruppo: total = occorrenze MASTER del gruppo visibili per condizione, esclusi mirror, trasversali e
 * calcolati con manualOverride = false; nei gruppi ripetibili si conta ogni riga esistente; VINCOLI conta
 * le 11 righe (compilata = stato presente); filled = di queste, quelle non vuote.
 */
export interface GroupProgressDTO {
  filled: number;
  total: number;
}

export interface PraticaSummaryDTO {
  id: string;
  templateId: TemplateId;
  codiceSito: string;
  nomeSito: string;
  committente: SelectValue;
  clienteFinale: SelectValue;
  /** Dell'iterazione corrente (D-24). */
  codiceG7: string | null;
  /** Numero dell'iterazione corrente (1, 2, …). */
  iteration: number;
  statoAttivita: StatoAttivita;
  /** Gruppi abilitati dall'Assegna (+ PM_PERMESSI dalla creazione). */
  enabledGroups: GroupId[];
  archived: boolean;
  /** Istante dell'archiviazione; null se non archiviata. */
  archivedAt: IsoTimestamp | null;
  /** Rilavorazione (D-26). */
  originPracticeId: string | null;
  openAlerts: number;
  progress: Record<GroupId, GroupProgressDTO>;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface TransversalValuesDTO {
  /**
   * v0.3.0 (D-121): una nota per gruppo, SOLO dei gruppi le cui note l'utente può vedere (il proprio gruppo, o i
   * propri con più appartenenze sul gestore; tutti per PM leader del gestore e ADMIN). Chiave assente = nota non
   * visibile; "" = visibile ma vuota.
   */
  noteOperative: Partial<Record<GroupId, string>>;
  fatturabile: "SI" | "NO";
  fatturabileManual: boolean;
  fatturato: "SI" | "NO" | null;
}

export interface IterationRefDTO {
  id: string;
  n: number;
  codiceG7: string | null;
  createdAt: IsoTimestamp;
  current: boolean;
}

/**
 * GET /api/practices/{id} (iterazione corrente) e /iterations/{n} (iterazione passata). In un'iterazione
 * passata values, repeats, transversal, statoAttivita, statoSource, codiceG7, progress, templateVersion e
 * alerts (vuoto) sono di quell'iterazione; archived, originPracticeId, enabledGroups, iterations e revision
 * sono quelli attuali della pratica; access con ogni occorrenza in sola lettura e motivo PAST_ITERATION (ARCHIVED se
 * la pratica è archiviata, ordine di ACCESS_DENIED_REASONS) (v0.4.2), repeatAccess tutto falso, actions tutte false.
 */
export interface PraticaDetailDTO extends PraticaSummaryDTO {
  /** Revisione della PRATICA intera: cresce a ogni modifica (anche resubmit), va rimandata nelle modifiche. */
  revision: number;
  /** Id interno dell'iterazione mostrata. */
  iterationId: string;
  /** Versione del template con cui leggere questa iterazione. */
  templateVersion: string;
  /** Stato attività dagli automatismi o da un comando manuale di PM/ADMIN. */
  statoSource: "AUTO" | "MANUAL";
  /** flowId dei campi calcolati bloccati da una modifica manuale (ComputedDTO.manualOverride). */
  manualLocks: string[];
  transversal: TransversalValuesDTO;
  /** Chiave = flowId (valori non ripetibili). */
  values: Record<string, FieldValue>;
  /** Chiave = RepeatGroupDTO.key. */
  repeats: Record<string, RepeatRowDTO[]>;
  /** Chiave = occurrenceKey; un'occorrenza senza voce è in sola lettura. */
  access: Record<string, OccurrenceAccessDTO>;
  /**
   * Chiave = RepeatGroupDTO.key; calcolato dal backend. Le righe `locked` non si rimuovono in ogni caso;
   * VINCOLI ha sempre false/false (righe fisse).
   */
  repeatAccess: Record<string, RepeatAccessDTO>;
  actions: PraticaActionsDTO;
  iterations: IterationRefDTO[];
  /** Aperti dell'iterazione corrente. */
  alerts: AlertDTO[];
}

export interface RepeatRowDTO {
  rowId: string;
  /** Chiave = flowId. */
  values: Record<string, FieldValue>;
  /** Riga creata automaticamente da un'altra (es. voce Ente da un vincolo "Presente"). */
  origin?: { repeat: string; rowId: string };
  /** Non rimovibile (es. finché il vincolo d'origine è "Presente"). */
  locked?: boolean;
  /** Es. "Il vincolo d'origine non è più Presente". */
  warning?: string;
  /** Solo nelle righe di VINCOLI. */
  constraint?: ConstraintValueDTO;
}

export interface ConstraintValueDTO {
  /** = ConstraintDefDTO.code */
  code: ConstraintCode;
  stato: SelectValue | null;
  ente: SelectValue | null;
}

export interface RepeatAccessDTO {
  canAddRows: boolean;
  canRemoveRows: boolean;
}

/**
 * Motivi di sola lettura, nell'ordine in cui il backend li valuta: si riporta il PRIMO che si applica.
 * L'ADMIN supera gruppo e Assegna, ma non modifica mirror, pratiche archiviate, iterazioni passate né
 * calcolati con manualOverride = false.
 */
export const ACCESS_DENIED_REASONS = ["ARCHIVED", "PAST_ITERATION", "MIRROR", "COMPUTED", "NOT_MY_GROUP", "NOT_ASSIGNED"] as const;
export type AccessDeniedReason = (typeof ACCESS_DENIED_REASONS)[number];

export interface OccurrenceAccessDTO {
  editable: boolean;
  reason?: AccessDeniedReason;
}

/** Calcolate dal backend per l'utente corrente. */
export interface PraticaActionsDTO {
  /** Gruppi verso cui l'utente può fare Assegna. */
  assignableGroups: GroupId[];
  canAssign: boolean;
  canChangeStato: boolean;
  canArchive: boolean;
  canRestore: boolean;
  canDelete: boolean;
  canRework: boolean;
  canResubmit: boolean;
}

export type PracticeScope = "assigned" | "all";
export type PracticeSort = "open_first" | "updated_desc" | "created_desc";

/**
 * GET /api/practices?templateId=&stato=&archived=&q=&scope=&sort=&page=&from=&to= → PagedDTO<PraticaSummaryDTO>.
 * Default: scope = "assigned", sort = "open_first".
 */
export interface PracticeListQuery {
  templateId?: TemplateId;
  stato?: StatoAttivita;
  /** Omesso = false: l'elenco mostra le pratiche non archiviate. */
  archived?: boolean;
  q?: string;
  scope?: PracticeScope;
  sort?: PracticeSort;
  page?: number;
  /** v0.3.2 (D-129): data di CREAZIONE della pratica, "YYYY-MM-DD", estremi compresi (giorno di Roma); ciascuno facoltativo. */
  from?: IsoDate;
  to?: IsoDate;
}

export type PracticeListResponse = PagedDTO<PraticaSummaryDTO>;

// §5.2 Scrittura dei campi — PATCH /api/practices/{id}/fields

export type FieldChange =
  /** Campo semplice: occurrenceKey deve essere il MASTER di quel flowId (un mirror è rifiutato). */
  | { occurrenceKey: string; flowId: string; value: FieldValue }
  /** Riga esistente di un gruppo ripetibile. */
  | { occurrenceKey: string; repeat: string; rowId: string; flowId: string; value: FieldValue }
  /** Nuova riga, con valori iniziali facoltativi; clientRowKey torna in FieldChangeResponse.createdRows. */
  | { repeat: string; op: "ADD_ROW"; clientRowKey: string; values?: Record<string, FieldValue> }
  | { repeat: string; op: "REMOVE_ROW"; rowId: string }
  /** Stato ed ente di una riga di VINCOLI. */
  | { repeat: "VINCOLI"; rowId: string; constraint: { stato?: SelectValue | null; ente?: SelectValue | null } }
  /** v0.3.0: nota del gruppo indicato (D-121). */
  | { transversal: "noteOperative"; group: GroupId; value: string }
  | { transversal: "fatturabile"; value: "SI" | "NO" }
  | { transversal: "fatturato"; value: "SI" | "NO" | null };

export interface FieldChangeRequest extends OperationRequest {
  /** Deve essere l'iterazione corrente, altrimenti 409 ITERATION_CONFLICT. */
  iteration: number;
  /** Revisione letta dal client; se nel frattempo è cambiata → 409 REVISION_CONFLICT (nessuna modifica). */
  revision: number;
  /** Tutte o nessuna: se una modifica è rifiutata → 403 con ErrorDTO.rejected. */
  changes: FieldChange[];
}

/** Toast solo se il valore di un campo calcolato è cambiato. */
export interface ToastDTO {
  kind: "INFO" | "WARNING";
  message: string;
  flowId?: string;
}

export interface FieldChangeResponse {
  practice: PraticaDetailDTO;
  toasts: ToastDTO[];
  /** clientRowKey → rowId delle righe create con ADD_ROW. */
  createdRows?: Record<string, string>;
}

// §5.3 Comandi (operationId facoltativa in tutti; per DELETE come ?operationId=)

/** POST /api/practices/resolve-template */
export interface ResolveTemplateRequest extends OperationRequest {
  committente: SelectValue;
  clienteFinale: SelectValue;
}
/** templateId = null se serve la scelta manuale (D-16). */
export interface ResolveTemplateResponse {
  templateId: TemplateId | null;
  candidates: TemplateId[];
}

/** POST /api/practices → PraticaDetailDTO (201). Solo PM e ADMIN (D-20); 422 se il template non ha un PM leader attivo (D-101). */
export interface CreatePracticeRequest extends OperationRequest {
  templateId: TemplateId;
  committente: SelectValue;
  clienteFinale: SelectValue;
  codiceG7: string;
  codiceSito: string;
  nomeSito: string;
}

/**
 * Corpo minimo dei comandi che modificano una pratica esistente (locking ottimistico):
 * revision ≠ corrente → 409 REVISION_CONFLICT con currentRevision, nessuna modifica applicata.
 */
export interface RevisionRequest extends OperationRequest {
  revision: number;
}

/**
 * POST /api/practices/{id}/assign → PraticaDetailDTO. groups ⊆ actions.assignableGroups; note va nella mail.
 * Se tra i destinatari c'è UT_PE, Incarico PE e Incarico VS/AS vuoti ricevono la data del giorno (D-21).
 */
export interface AssignRequest extends RevisionRequest {
  groups: GroupId[];
  note?: string;
}

/** POST /api/practices/{id}/stato → PraticaDetailDTO. Solo PM e ADMIN (D-23). */
export interface ChangeStatoRequest extends RevisionRequest {
  stato: StatoAttivita;
}

/**
 * POST /api/practices/{id}/rework → PraticaDetailDTO della nuova pratica (D-26), anche da pratica
 * archiviata. Senza revision: non modifica l'origine.
 */
export interface ReworkRequest extends OperationRequest {
  codiceG7?: string;
}

/** POST /api/practices/{id}/resubmit → PraticaDetailDTO (nuova iterazione, D-25). */
export interface ResubmitRequest extends RevisionRequest {
  codiceG7?: string;
}

/** POST /api/practices/{id}/archive · POST /api/practices/{id}/restore → PraticaDetailDTO. */
export type ArchiveRequest = RevisionRequest;
export type RestoreRequest = RevisionRequest;

// DELETE /api/practices/{id}?revision=&operationId= → 204. Solo in CREATA e con una sola iterazione.

// ─── §6 Liste (Configurazione) ───────────────────────────────────────────────

export interface ListItemDTO {
  code: string;
  label: string;
  active: boolean;
  order: number;
}

/** GET /api/lists?templateId=&group= → ListDTO[]. CLIENTE_FINALE e COMMITTENTE: templateId = null. */
export interface ListDTO {
  listId: string;
  label: string;
  kind: "CONTROLLED" | "CONFIGURABLE";
  /** null = comune a tutti i gestori. */
  templateId: TemplateId | null;
  /** Gruppo i cui leader la gestiscono (null = solo ADMIN). */
  group: GroupId | null;
  items: ListItemDTO[];
  /** Calcolato per l'utente corrente. */
  editable: boolean;
  /** Locking ottimistico come per le pratiche. */
  revision: number;
}

/**
 * PUT /api/lists/{listId}?templateId= → ListDTO. revision diversa → 409 REVISION_CONFLICT; un codice già
 * usato in una pratica non si toglie né si rinomina (422): si disattiva con active = false.
 */
export interface ListUpdateRequest {
  items: ListItemDTO[];
  revision: number;
}

/**
 * GET /api/istat/regioni · /province?regione= · /comuni?provincia= → IstatItemDTO[] (code = codice ISTAT).
 * 503 { error: "Dataset ISTAT non caricato" } finché il dataset non è importato (v0.1.10).
 */
export interface IstatItemDTO {
  code: string;
  label: string;
}

/** GET /api/alert-rules?templateId= → AlertRuleConfigDTO[] (soglie degli alert, D-46). */
export interface AlertRuleConfigDTO {
  templateId: TemplateId;
  ruleId: string;
  label: string;
  days: number;
  unit: "WORKING_DAYS" | "CALENDAR_DAYS";
  revision: number;
}

/** PUT /api/alert-rules/{ruleId}?templateId= (solo ADMIN) → AlertRuleConfigDTO. Vale per gli alert non ancora emessi. */
export interface AlertRuleUpdateRequest {
  days: number;
  revision: number;
}

// ─── §7 Storico e timeline ───────────────────────────────────────────────────

export type HistoryKind =
  | "FIELD"
  | "ROW_ADD"
  | "ROW_REMOVE"
  | "ASSIGN"
  | "STATO"
  | "ARCHIVE"
  | "RESTORE"
  | "CREATE"
  | "REWORK"
  | "RESUBMIT"
  | "ALERT_OPEN"
  | "ALERT_CLOSE"
  | "IMPORT"
  /** v0.5.0 (§14): commenti, senza testo nello storico (autore e ora). */
  | "COMMENT_ADD"
  | "COMMENT_EDIT"
  | "COMMENT_DELETE";

export interface HistoryEntryDTO {
  id: string;
  practiceId: string;
  iteration: number;
  kind: HistoryKind;
  flowId?: string;
  repeat?: string;
  rowId?: string;
  /** Modifica di un campo trasversale. */
  transversal?: "noteOperative" | "fatturabile" | "fatturato";
  /** v0.3.0: gruppo della nota operativa; le voci delle note di gruppi non visibili all'utente non vengono restituite (D-121). */
  noteGroup?: GroupId;
  oldValue?: FieldValue;
  newValue?: FieldValue;
  /** Valori della riga rimossa (ROW_REMOVE). */
  rowSnapshot?: Record<string, FieldValue>;
  source: "USER" | "SYSTEM" | "IMPORT";
  /** Raggruppa le voci di uno stesso salvataggio. */
  operationId?: string;
  /** Testo leggibile. */
  detail?: string;
  /** null = sistema (automatismi). */
  userId: string | null;
  userName: string | null;
  timestamp: IsoTimestamp;
}

/** fields = storico dei valori (FIELD, ROW_ADD, ROW_REMOVE); events = timeline (gli altri tipi); assente = tutto. */
export type HistoryView = "fields" | "events";

/** GET /api/practices/{id}/history?iteration=&page=&view= */
export type HistoryResponse = PagedDTO<HistoryEntryDTO>;

// ─── §8 Notifiche e alert ────────────────────────────────────────────────────

export interface AlertDTO {
  id: string;
  practiceId: string;
  iteration: number;
  /** Es. "FORECAST_UT", "SOPRALLUOGO", "OFFERTA_ODA" (G §17.10). */
  rule: string;
  /** Testo leggibile prodotto dal backend. */
  label: string;
  /** Campo da evidenziare. */
  flowId?: string;
  /** Riga e sezione (es. due cicli ARPA con lo stesso flowId). */
  repeat?: string;
  rowId?: string;
  sectionKey?: string;
  /** SUSPENDED = pratica archiviata; SUPERSEDED = iterazione sostituita. Non è una chiusura. */
  executionStatus: "ACTIVE" | "SUSPENDED" | "SUPERSEDED";
  openedAt: IsoTimestamp;
  dueAt: IsoTimestamp | null;
  status: "OPEN" | "CLOSED";
  closedAt?: IsoTimestamp;
  closeMode?: "AUTO" | "MANUAL";
  /** Id utente. */
  closedBy?: string;
  closedByName?: string;
  /** Calcolato per l'utente corrente. */
  canCloseManually: boolean;
}

export type NotificationKind = "ASSIGN" | "ALERT" | "REMINDER" | "MENTION" | "SYSTEM";

export interface NotificationLinkDTO {
  practiceId: string;
  iteration?: number;
  flowId?: string;
  occurrenceKey?: string;
  sectionKey?: string;
  repeat?: string;
  rowId?: string;
  /** v0.5.0 (§14): notifica MENTION, il commento da mostrare. */
  commentId?: string;
}

export interface NotificationDTO {
  id: string;
  createdAt: IsoTimestamp;
  read: boolean;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Porta al punto interessato. */
  link: NotificationLinkDTO | null;
}

/** GET /api/notifications?unread=&limit= (limit predefinito 50, massimo 200), ordinate per createdAt decrescente. */
export interface NotificationListResponse {
  items: NotificationDTO[];
  unread: number;
}

/**
 * PATCH /api/notifications/{id} → NotificationDTO (404 se non è dell'utente). POST /api/notifications/read-all, senza corpo,
 * → NotificationListResponse aggiornata (unread = 0). limit massimo 200, 400 se non valido (v0.3.1).
 */
export interface NotificationUpdateRequest {
  read: true;
}

/**
 * POST /api/alerts/{id}/close → AlertDTO (chiusura manuale: team leader competenti e ADMIN, D-46;
 * OFFERTA_ODA: solo leader PM_PERMESSI e ADMIN). Idempotente: un alert già chiuso torna invariato (200).
 */
export type AlertCloseRequest = OperationRequest;

// ─── §9 Statistiche (v0.2, D-48) ─────────────────────────────────────────────

/** GET /api/stats?templateId=&from=&to= (PM del template e ADMIN; altri 403). Periodo predefinito: ultimi 30 giorni. */
export interface StatsQuery {
  templateId?: TemplateId;
  from?: IsoDate;
  to?: IsoDate;
}

export interface StatsUpcomingItemDTO {
  practiceId: string;
  codiceSito: string;
  templateId: TemplateId;
  rule: string;
  label: string;
  dueAt: IsoTimestamp;
  /** v0.6.5 (D-193): l'utente può aprire la scheda (falso per la Direzione su template senza appartenenza: niente link). Sempre presente dal server. */
  canOpen?: boolean;
}

export interface StatsDTO {
  period: { from: IsoDate; to: IsoDate };
  /** Non archiviate e con Stato attività diverso da TERMINATO e KO. */
  activeTotal: number;
  /** Non archiviate, per stato (TERMINATO e KO compresi). */
  byStato: Record<StatoAttivita, number>;
  /** Attive, per gestore. */
  byTemplate: Partial<Record<TemplateId, number>>;
  /** Attive in cui il gruppo è in enabledGroups. */
  byGroup: Record<GroupId, number>;
  /** Attive in cui l'utente compare in un campo USER/USERS; ordinate per nome, mai per numero (G §17.13). */
  byAssignee: { userId: string; name: string; count: number }[];
  /** Alert OPEN e ACTIVE delle iterazioni correnti. */
  alertsOpen: number;
  /** Di questi, con dueAt già passato. */
  alertsOverdue: number;
  /** Alert OPEN e ACTIVE con dueAt nei prossimi 7 giorni; items al massimo 50, per dueAt crescente. */
  upcoming: { count: number; items: StatsUpcomingItemDTO[] };
  /** Pratiche entrate in TERMINATO / KO nel periodo. */
  closedInPeriod: { terminato: number; ko: number };
  /** Giorni dalla prima Data assegnazione all'ultimo TERMINATO, per le pratiche terminate nel periodo. */
  leadTime: { count: number; meanDays: number | null; medianDays: number | null };
}

// ─── §10 Carichi di lavoro (v0.2, D-23) ──────────────────────────────────────

/** GET /api/workload?templateId=&group= → WorkloadResponse (PM e ADMIN tutti i gruppi; team leader il proprio). */
export interface WorkloadItemDTO {
  userId: string;
  name: string;
  /** Appartenenza per cui l'utente compare. */
  templateId: TemplateId;
  group: GroupId;
  role: RoleId;
  /** Pratiche attive in cui compare in un campo USER/USERS del proprio ruolo ("Nessuno" escluso). */
  activePractices: number;
  byStato: Partial<Record<StatoAttivita, number>>;
}
export interface WorkloadResponse {
  items: WorkloadItemDTO[];
}

// ─── §11 Export CSV (v0.2, D-48) ─────────────────────────────────────────────

/**
 * GET /api/export?templateId=&stato=&archived=&q=&from=&to=&scope= → text/csv (PracticeHub_<TEMPLATE>_<AAAA-MM-GG>.csv),
 * UTF-8 con BOM, separatore ";". templateId obbligatorio (400). v0.3.2 (D-128): ogni utente con un'appartenenza sul
 * template e l'ADMIN, solo le pratiche che vede e solo ciò che vede nella scheda (Note Operative dei gruppi visibili).
 */
export interface ExportQuery {
  templateId: TemplateId;
  stato?: StatoAttivita;
  archived?: boolean;
  q?: string;
  /** v0.3.2 (D-129): data di creazione, come nell'elenco. */
  from?: IsoDate;
  to?: IsoDate;
  /** v0.3.4: lo stesso scope dell'elenco che l'utente sta guardando; default "assigned". */
  scope?: PracticeScope;
}

// ─── §12 Import (v0.2, D-49) ─────────────────────────────────────────────────

export type ImportOutcome = "NEW_PRACTICE" | "UPDATE" | "REWORK" | "AMBIGUOUS" | "ERROR";
export type ImportSkipReason = "ALREADY_FILLED" | "INVALID" | "NOT_IMPORTABLE";

export interface ImportRowDTO {
  /** Riga del foglio (1 = prima riga di dati). */
  rowIndex: number;
  outcome: ImportOutcome;
  /** UPDATE / REWORK: pratica trovata (per REWORK quella d'origine). */
  practiceId?: string;
  /** AMBIGUOUS: pratiche compatibili, scelta manuale (D-49). */
  candidates?: PraticaSummaryDTO[];
  /** Campi VUOTI che verrebbero compilati. */
  changes: { flowId: string; label: string; value: FieldValue }[];
  /** detail (v0.3.6, D-138): motivo leggibile, es. "data non riconosciuta: 31/02/2026". */
  skipped: { flowId: string; label: string; reason: ImportSkipReason; detail?: string }[];
  errors: string[];
}

/** POST /api/import/preview (multipart: file .xlsx, templateId; solo ADMIN) → ImportPreviewDTO, senza scritture. */
export interface ImportPreviewDTO {
  /** Valido 24 ore. */
  importId: string;
  templateId: TemplateId;
  /** Intestazione → campo; null = non riconosciuta. note: il motivo (v0.2.2: per NOT_IMPORTABLE quello preciso, es. "campo calcolato"). */
  columns: { header: string; flowId: string | null; note?: string }[];
  rows: ImportRowDTO[];
}

/** POST /api/import/{importId}/commit → ImportResultDTO. Le righe AMBIGUOUS richiedono una scelta (altrimenti 422). */
export interface ImportCommitRequest {
  operationId: string;
  choices?: { rowIndex: number; action: "APPLY" | "SKIP"; practiceId?: string }[];
}

export interface ImportResultDTO {
  created: number;
  updated: number;
  reworks: number;
  skipped: number;
  failed: { rowIndex: number; error: string }[];
}

// ─── §13 Assistente AI (v0.4.0, D-50, D-165…D-173) ───────────────────────────
// Sola lettura: nessuna rotta di questa sezione modifica dati operativi. Tutte le rotte: sessione obbligatoria,
// utente riletto dal database, Cache-Control: no-store.

export interface AssistantStatusDTO {
  enabled: boolean;
  availability: "READY" | "DISABLED" | "UNAVAILABLE";
  dailyLimit: number;
  usedToday: number;
  remainingToday: number;
  resetAt: string;
  perMinuteLimit: number;
}

export interface AssistantSettingsDTO {
  enabled: boolean;
  dailyLimit: number;
  perMinuteLimit: number;
  technicalEnabled: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface AssistantSettingsUpdateRequest {
  enabled?: boolean;
  dailyLimit?: number;
  perMinuteLimit?: number;
}

export type AssistantPage = "list" | "sheet" | "stats" | "other";

/** Contesto della pagina: un suggerimento che non autorizza niente (pratica non visibile → 404). */
export interface AssistantRequestContext {
  page: AssistantPage;
  /** Obbligatorio con "sheet". */
  practiceId?: string;
  /** Solo con "sheet". */
  iteration?: number;
  templateId?: TemplateId;
  /** Solo con "list". */
  listQuery?: PracticeListQuery;
}

/** POST /api/assistant/messages: corpo JSON di al massimo 16 KiB. */
export interface AssistantMessageRequest {
  /** UUID generato dal client, per correlazione (nessuna deduplica, D-166). */
  requestId: string;
  /** UUID restituito da "start"; assente = nuova conversazione. */
  conversationId?: string;
  /** Dopo il trim, 1..2000 caratteri. */
  text: string;
  context?: AssistantRequestContext;
}

export type AssistantSourceDTO =
  | {
      kind: "PRACTICE";
      practiceId: string;
      codiceSito: string;
      nomeSito: string;
      templateId: TemplateId;
      iteration: number;
      sectionKey?: string;
      occurrenceKey?: string;
      flowId?: string;
      rowId?: string;
      historyEntryId?: string;
      label: string;
      readAt: string;
    }
  | { kind: "LIST"; label: string; query: PracticeListQuery; readAt: string }
  | { kind: "STATS"; label: string; query: StatsQuery; readAt: string }
  | { kind: "WORKLOAD"; label: string; query: { templateId: TemplateId; group?: GroupId }; readAt: string }
  | { kind: "QUERY"; label: string; question: string; readAt: string }
  /** v0.6.9 (D-198): un blocco della pagina Andamento con i suoi filtri (le ferme: periodo predefinito). Mai persone. */
  | {
      kind: "ANDAMENTO";
      label: string;
      blocco: "stati" | "gruppi" | "ferme" | "flussi" | "rilavorazioni" | "scadenze";
      query: AndamentoQueryDTO;
      readAt: string;
    };

export interface AssistantFactDTO {
  key: string;
  label: string;
  value: number | null;
  unit?: string;
  scopeLabel: string;
  period?: { from: string; to: string };
  sourceIndex: number;
}

export type AssistantErrorCode =
  | "UNAUTHENTICATED"
  | "AUTH_CHANGED"
  | "NOT_ENABLED"
  | "ORIGIN_DENIED"
  | "NOT_FOUND"
  | "CONVERSATION_NOT_FOUND"
  | "BUSY_USER"
  | "CONVERSATION_EXPIRED"
  | "DATA_CHANGED"
  | "BODY_TOO_LARGE"
  | "INVALID_REQUEST"
  | "QUERY_TOO_BROAD"
  | "QUOTA_USER_MINUTE"
  | "QUOTA_USER_DAY"
  | "BUSY"
  | "PROVIDER_QUOTA"
  | "UNAVAILABLE"
  | "TIMEOUT"
  | "BLOCKED"
  | "INTERNAL";

export type AssistantAnswerState = "ANSWER" | "NO_DATA" | "INSUFFICIENT_EVIDENCE" | "PARTIAL" | "CLARIFY" | "OUT_OF_SCOPE";
export type AssistantFinishReason = "STOP" | "NO_ANSWER" | "CLARIFY" | "OUT_OF_SCOPE" | "LENGTH";

export type AssistantEvent = { seq: number } & (
  | { type: "start"; requestId: string; conversationId: string; messageId: string; serverNow: string; todayRome: string; timezone: "Europe/Rome" }
  | { type: "status"; phase: "READING" | "ANSWERING"; text: string; period?: { from: string; to: string } }
  | { type: "source"; index: number; source: AssistantSourceDTO }
  | { type: "facts"; items: AssistantFactDTO[] }
  | { type: "delta"; text: string }
  | { type: "heartbeat" }
  | {
      type: "done";
      finishReason: AssistantFinishReason;
      answerState: AssistantAnswerState;
      asOf: string;
      readStartedAt: string;
      truncated: boolean;
      usage: AssistantStatusDTO;
    }
  | { type: "error"; code: AssistantErrorCode; message: string; retryAfterSeconds?: number; resetAt?: string; requestId: string }
);

/** Corpo d'errore prima dello stream (§13.4); dopo l'apertura lo stesso code arriva come evento "error". */
export interface AssistantErrorBody {
  error: string;
  code: AssistantErrorCode;
  requestId?: string;
  retryAfterSeconds?: number;
  resetAt?: string;
}

// ─── §14 Commenti con menzioni (v0.5.0, D-183, D-184, D-185) ─────────────────
// Testo semplice, mai HTML (il client rende a capo ed elenchi "- "); le menzioni sono dati strutturati. Li legge chiunque
// vede la pratica (D-185); le Note Operative restano per gruppo (D-121). Pratica non visibile → 404 come inesistente.

export type CommentMention =
  /** Tutto il gruppo sul cliente della pratica. */
  | { kind: "group"; id: GroupId; label: string }
  /** Tutti gli utenti attivi con un'appartenenza sul cliente. */
  | { kind: "all"; label: string }
  /** Persona attiva che vede la pratica. */
  | { kind: "user"; id: string; label: string };

export interface CommentDTO {
  id: string;
  practiceId: string;
  iteration: number;
  /** null = commento; altrimenti id del commento principale (un solo livello). */
  parentId: string | null;
  author: { id: string; name: string };
  /** Testo semplice, max 10.000 caratteri; "" se eliminato. */
  body: string;
  /** Max 20, ricontrollate dal server. */
  mentions: CommentMention[];
  createdAt: IsoTimestamp;
  editedAt: IsoTimestamp | null;
  deleted: boolean;
  /** "Commento eliminato da …". */
  deletedByName?: string;
  /** L'autore modifica; autore o ADMIN elimina (D-185). */
  canEdit: boolean;
  canDelete: boolean;
  /** Solo nei commenti principali. */
  replies: CommentDTO[];
}

/** GET /api/practices/{id}/comments?iteration=&all= (default: iterazione corrente; all=1 tutte le iterazioni). */
export interface CommentListResponse {
  items: CommentDTO[];
  canComment: boolean;
  reason?: "ARCHIVED" | "PAST_ITERATION";
}

/** POST /api/practices/{id}/comments → CommentDTO (201). 409 ARCHIVED/PAST_ITERATION; testo vuoto o menzione non valida → 422. */
export interface CommentCreateRequest {
  body: string;
  mentions: CommentMention[];
  parentId?: string;
  operationId?: string;
}

/** PATCH /api/practices/{id}/comments/{commentId} → CommentDTO. Solo l'autore (403). */
export interface CommentUpdateRequest {
  body: string;
  mentions: CommentMention[];
  operationId?: string;
}

/** GET /api/practices/{id}/mentionable: candidati per il menu "@", senza email. */
export interface MentionableDTO {
  groups: { id: GroupId; label: string }[];
  all: { label: string };
  people: { id: string; name: string; groups: GroupId[] }[];
}


// ─── §15 Andamento e profilo Direzione (v0.6.0, D-191, D-192) ───────────────

/** GET /api/andamento/settings (ADMIN e Direzione), PUT (solo ADMIN, con audit). Interruttore spento: 404. */
export interface AndamentoSettingsDTO {
  /** Soglia delle «pratiche ferme» in giorni di calendario (1–365, iniziale 30). */
  sogliaFermeGiorni: number;
  updatedAt: IsoTimestamp | null;
  /** Nome dell'ADMIN dell'ultima modifica: solo per gli ADMIN (null per la Direzione, «mai nomi» §15). */
  updatedBy: string | null;
}

export interface AndamentoSettingsUpdateRequest {
  sogliaFermeGiorni: number;
}

/* ---------- §15.3 blocchi di Andamento (v0.6.4) ---------- */

/**
 * Filtri comuni dei blocchi: GET /api/andamento/<blocco>?templateId=&from=&to=&granularity=week|month[&format=csv].
 * Predefiniti: tutti i template, ultimi 12 mesi fino a oggi (ora di Roma), granularity month. 400 su valori non validi.
 * Tempi in giorni di calendario con un decimale (§15.4). Mai nomi né id di persone.
 */
export type AndamentoGranularity = "week" | "month";

export interface AndamentoQueryDTO {
  templateId: TemplateId | null;
  from: IsoDate;
  to: IsoDate;
  granularity: AndamentoGranularity;
}

export interface AndamentoPeriodDTO {
  from: IsoDate;
  to: IsoDate;
}

/** Parte comune di ogni blocco con confronto. */
export interface AndamentoBaseDTO {
  asOf: IsoTimestamp;
  /** «Dati dal …»: giorno del primo evento utile (null = nessun dato). Prima di questa data non ci sono tempi. */
  dataFrom: IsoDate | null;
  query: AndamentoQueryDTO;
  /** Periodo precedente di uguale durata; stesso periodo dell'anno prima solo se ci sono dati (altrimenti null). */
  confronto: { periodoPrecedente: AndamentoPeriodDTO; annoPrecedente: AndamentoPeriodDTO | null };
  /** Secchi del periodo secondo granularity (settimana da lunedì; mese di calendario), tagliati agli estremi. */
  buckets: AndamentoPeriodDTO[];
}

/**
 * Durate di un insieme di permanenze. Media e mediana sulle permanenze CONCLUSE nel periodo; quelle ancora in corso
 * alla fine del periodo a parte (numero ed età mediana a quella data). null = nessuna permanenza.
 */
export interface AndamentoDurataDTO {
  conclusi: number;
  mediaGiorni: number | null;
  medianaGiorni: number | null;
  inCorso: number;
  etaMedianaInCorsoGiorni: number | null;
}

/** D-194: OPERATIVO = fase di lavoro; ESTERNO = attese esterne e sospensioni (DINIEGATO, TAR, STAND_BY). */
export type AndamentoGruppoStato = "OPERATIVO" | "ESTERNO";

/** GET /api/andamento/stati → tempo per Stato attività. */
export interface AndamentoStatiDTO extends AndamentoBaseDTO {
  /** Tutti i 12 stati, nell'ordine dell'app. */
  righe: AndamentoStatoRigaDTO[];
  /** Stati «più lenti» (mediana più alta; pari merito = più di uno): solo candidabili con almeno 5 conclusi. */
  piuLenti: StatoAttivita[];
  /**
   * Tempo complessivo delle pratiche TERMINATE nel periodo, dalla creazione (o rilavorazione) al TERMINATO, contando
   * solo gli stati OPERATIVO. Escluse quelle con la storia aperta da un import (contate in esclusePerImport).
   */
  complessivo: AndamentoDurataDTO & { esclusePerImport: number };
  complessivoPrecedente: AndamentoDurataDTO & { esclusePerImport: number };
  /** Serie per secchio: mediana dei conclusi per stato (solo stati con almeno un concluso nel secchio). */
  serie: { periodo: AndamentoPeriodDTO; perStato: Partial<Record<StatoAttivita, { conclusi: number; medianaGiorni: number }>> }[];
}

export interface AndamentoStatoRigaDTO {
  stato: StatoAttivita;
  gruppoStato: AndamentoGruppoStato;
  /** Può essere «più lento»: OPERATIVO e non TERMINATO né KO (D-194). */
  candidabile: boolean;
  /** Ingressi nello stato durante il periodo (passaggi). */
  passaggi: number;
  /** Tempo «nell'app»: da un passaggio di stato al successivo, con l'ora di registrazione. */
  periodo: AndamentoDurataDTO;
  precedente: AndamentoDurataDTO & { passaggi: number };
  annoPrecedente: (AndamentoDurataDTO & { passaggi: number }) | null;
  /** Tempo «per data del fatto» (autoEventDate) sulle sole permanenze con le due date note; null = nessuna. */
  perDataDelFatto: { conclusi: number; mediaGiorni: number | null; medianaGiorni: number | null } | null;
  /** Meno di 5 conclusi nel periodo: valore poco indicativo (il frontend lo attenua). */
  pochiDati: boolean;
}

/**
 * GET /api/andamento/gruppi → tempo per gruppo (D-195). Per ogni Assegna che abilita un gruppo (gruppo aggiunto):
 * - perPartire: dall'Assegna alla prima modifica USER di un campo del gruppo (gruppo del campo dal template);
 * - perConsegnare: dall'Assegna alla prima data di completamento di una milestone del gruppo (catalogo delle date)
 *   successiva all'Assegna. Assegna dentro un import: esclusa.
 */
export interface AndamentoGruppiDTO extends AndamentoBaseDTO {
  /** UT_PE, AIE, DL: PM_PERMESSI è abilitato dalla creazione e non si «assegna», quindi non ha righe. */
  righe: AndamentoGruppoRigaDTO[];
}

export interface AndamentoGruppoRigaDTO {
  group: GroupId;
  /** Assegna al gruppo nel periodo. */
  assegnazioni: number;
  perPartire: AndamentoDurataDTO;
  perConsegnare: AndamentoDurataDTO;
  precedente: { assegnazioni: number; perPartire: AndamentoDurataDTO; perConsegnare: AndamentoDurataDTO };
  /** Vero se per partire e per consegnare hanno entrambi meno di 5 conclusi nel periodo. */
  pochiDati: boolean;
}

/** GET /api/andamento/ferme?templateId=&stato= → pratiche attive nello stesso stato da più di soglia giorni (oggi). */
export interface AndamentoFermeDTO {
  asOf: IsoTimestamp;
  dataFrom: IsoDate | null;
  query: { templateId: TemplateId | null; stato: StatoAttivita | null };
  soglia: number;
  totale: number;
  perStato: { stato: StatoAttivita; gruppoStato: AndamentoGruppoStato; count: number }[];
  perCliente: { templateId: TemplateId; count: number }[];
  /** Ordinate per giorni decrescenti; al massimo 200. */
  items: AndamentoFermaDTO[];
  truncated: boolean;
  /**
   * Pratiche attive (con gli stessi filtri) di cui non si può datare l'ingresso nello stato attuale (storia più
   * vecchia degli eventi o incoerente): non sono nell'elenco ma non spariscono, si contano qui (§15.4).
   */
  nonDatabili: { totale: number; perStato: { stato: StatoAttivita; count: number }[] };
}

export interface AndamentoFermaDTO {
  practiceId: string;
  codiceSito: string;
  nomeSito: string;
  templateId: TemplateId;
  stato: StatoAttivita;
  gruppoStato: AndamentoGruppoStato;
  /** Ingresso nello stato attuale (ora di registrazione). */
  since: IsoTimestamp;
  giorni: number;
  /** Nessun passaggio dopo l'import: «ferma da import, dal …» (since = ora dell'import). */
  fromImport: boolean;
  /** Gruppi abilitati («in carico»). */
  gruppi: GroupId[];
  /** D-193: vero se l'utente può già aprire la scheda (canSeePractice); falso = solo codice e nome, nessun link. */
  canOpen: boolean;
}

/**
 * Valori di flusso di un periodo o di un secchio. L'arretrato quadra sempre (v0.6.7):
 * arretrato all'inizio + entrate + entrateImport + rientri + ripristinate − terminate − ko − archiviate = arretratoFine.
 */
export interface AndamentoFlussoValoriDTO {
  /** Pratiche create a mano o da rilavorazione. */
  entrate: number;
  /** Pratiche create dall'import ancora aperte dopo l'import (quelle importate già chiuse non sono lavoro e non contano). */
  entrateImport: number;
  /** Passaggi da uno stato aperto a TERMINATO (anche dentro un import che aggiorna una pratica esistente). */
  terminate: number;
  /** Passaggi da uno stato aperto a KO. */
  ko: number;
  /** Uscite da TERMINATO o KO verso un altro stato (riaperture). */
  rientri: number;
  /** v0.6.7: pratiche aperte archiviate nel periodo (escono dall'arretrato). Sempre presente dal server. */
  archiviate?: number;
  /** v0.6.7: pratiche aperte ripristinate dall'archivio nel periodo (rientrano nell'arretrato). Sempre presente dal server. */
  ripristinate?: number;
  /** Pratiche attive (non TERMINATO né KO, non archiviate) a fine periodo o secchio. */
  arretratoFine: number;
}

/** GET /api/andamento/flussi → entrate, uscite, arretrato. */
export interface AndamentoFlussiDTO extends AndamentoBaseDTO {
  attiveOra: number;
  /** Arretrato all'inizio del periodo (per la variazione «+5»). */
  arretratoInizio: number;
  periodo: AndamentoFlussoValoriDTO;
  precedente: AndamentoFlussoValoriDTO;
  annoPrecedente: AndamentoFlussoValoriDTO | null;
  serie: ({ periodo: AndamentoPeriodDTO } & AndamentoFlussoValoriDTO)[];
}

/** GET /api/andamento/rilavorazioni → rilavorazioni, ripresentazioni e ritorni di stato all'indietro. */
export interface AndamentoRilavorazioniDTO extends AndamentoBaseDTO {
  periodo: { rework: number; resubmit: number; ritorni: number };
  precedente: { rework: number; resubmit: number; ritorni: number };
  annoPrecedente: { rework: number; resubmit: number; ritorni: number } | null;
  /** Stato della pratica (o iterazione) d'origine al momento della rilavorazione o ripresentazione. */
  daStato: { stato: StatoAttivita; rework: number; resubmit: number }[];
  /** Passaggi verso uno stato precedente nell'ordine dell'app (es. AUTORIZZATO → INTEGRAZIONE_RICHIESTA), esclusi gli import. */
  ritorni: { from: StatoAttivita; to: StatoAttivita; count: number }[];
  serie: { periodo: AndamentoPeriodDTO; rework: number; resubmit: number; ritorni: number }[];
}

/** Scadenze di un periodo: attività completate nel periodo confrontate col forecast. */
export interface AndamentoScadenzeValoriDTO {
  /** Completamento entro l'ultimo forecast. */
  entro: number;
  oltre: number;
  /** Di quelle completate, con il forecast cambiato almeno una volta (originale ≠ ultimo). */
  rinviate: number;
  alert: {
    /** Alert aperti nel periodo (esclusi SUPERSEDED). */
    aperti: number;
    chiusi: number;
    /** Aperti con scadenza superata (oggi, per il periodo corrente; a fine periodo, per i confronti). */
    scaduti: number;
    /** Generazione > 1 o almeno un promemoria. */
    ripetuti: number;
    sospesi: number;
    mediaChiusuraGiorni: number | null;
    medianaChiusuraGiorni: number | null;
  };
}

/** GET /api/andamento/scadenze → forecast rispettati e alert. */
export interface AndamentoScadenzeDTO extends AndamentoBaseDTO {
  periodo: AndamentoScadenzeValoriDTO;
  precedente: AndamentoScadenzeValoriDTO;
  annoPrecedente: AndamentoScadenzeValoriDTO | null;
  /** Per milestone del catalogo (coppie forecast/completamento), nel periodo. */
  perMilestone: { semanticId: string; label: string; ownerGroup: GroupId; entro: number; oltre: number; rinviate: number }[];
  /** Forecast ancora aperti (senza completamento) con data già passata, oggi. */
  forecastScadutiAperti: number;
  serie: { periodo: AndamentoPeriodDTO; entro: number; oltre: number; alertAperti: number; alertChiusi: number }[];
}
