/**
 * Documenti MongoDB del modello nuovo (D-91, architettura §1.2). Solo lato server: non vanno mai inviati
 * al client, si mappano sempre sui DTO di lib/contract.ts. Date operative come stringhe "YYYY-MM-DD";
 * istanti come Date UTC.
 */
import type { ObjectId } from "mongodb";
import type {
  ConstraintCode,
  FieldValue,
  GroupId,
  GroupProgressDTO,
  HistoryKind,
  ImportOutcome,
  ImportSkipReason,
  ListItemDTO,
  MembershipDTO,
  NotificationKind,
  SelectValue,
  StatoAttivita,
  TemplateDTO,
  TemplateId,
  UserStatus,
} from "@/lib/contract";
import type { TemplateBindings } from "@/lib/templates/compiler";

export type Source = "USER" | "SYSTEM" | "IMPORT";

export interface TransversalDoc {
  /** Una nota per gruppo (D-121), sempre con le quattro chiavi; "" = vuota. */
  noteOperative: Record<GroupId, string>;
  fatturabile: "SI" | "NO";
  fatturabileManual: boolean;
  fatturato: "SI" | "NO" | null;
}

/** Proiezione per l'elenco, aggiornata nella stessa transazione dell'iterazione corrente. */
export interface PracticeSummaryDoc {
  codiceSito: string;
  nomeSito: string;
  committente: SelectValue;
  clienteFinale: SelectValue;
  codiceG7: string | null;
  statoAttivita: StatoAttivita;
  statoSource: "AUTO" | "MANUAL";
  transversal: TransversalDoc;
  openAlerts: number;
  /** Avanzamento per gruppo dell'iterazione corrente, ricalcolato a ogni scrittura (per l'elenco). */
  progress?: Record<GroupId, GroupProgressDTO>;
}

export interface PracticeDoc {
  _id: ObjectId;
  templateId: TemplateId;
  currentIterationId: ObjectId;
  currentIterationN: number;
  /** Revisione della pratica intera (D-67, D-90). */
  revision: number;
  archived: boolean;
  archivedAt: Date | null;
  originPracticeId: ObjectId | null;
  enabledGroups: GroupId[];
  currentSummary: PracticeSummaryDoc;
  createdBy: ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FormulaMetaDoc {
  mode: "AUTO" | "MANUAL";
  manual?: { actorId: ObjectId | null; at: Date; operationId: string };
  lastCalculatedAt?: Date;
  /** Dati specifici della formula (es. base e integrazione applicata del Forecast Ottenimento Permessi). */
  detail?: Record<string, unknown>;
}

/** Identità di un evento automatico dello Stato attività (regola, data del trigger, riga se ripetibile). */
export interface AutoEventRef {
  ruleId: string;
  date: string;
  /** Stato prodotto (D-127: stesso trigger con esito diverso = evento nuovo). */
  stato?: StatoAttivita;
  /** Rango dello stato e ordinal della riga: ordine completo del vincente (D-126 M-01). */
  rank?: number;
  ordinal?: number;
  rowId?: string;
}

export interface StateMetaDoc {
  /** Stato mostrato. */
  stato: StatoAttivita;
  source: "AUTO" | "MANUAL";
  /** Stato calcolato dagli automatismi, memorizzato anche quando vale il manuale (D-95). */
  autoStato: StatoAttivita;
  /** Evento automatico vincente dell'ultimo calcolo (null = nessun trigger valido). */
  autoEvent?: AutoEventRef | null;
  /**
   * Evento automatico vincente al momento dell'ultimo comando manuale (D-119): il manuale si rilascia solo quando
   * vince un evento strettamente successivo a questo nell'ordine completo (data, rango, ordinal; D-126 M-01).
   */
  manualBaseline?: AutoEventRef | null;
  manualAt: Date | null;
  manualBy: ObjectId | null;
}

export interface IterationDoc {
  _id: ObjectId;
  practiceId: ObjectId;
  n: number;
  templateVersion: string;
  /** Valori non ripetibili, chiave = flowId. */
  values: Record<string, FieldValue>;
  transversal: TransversalDoc;
  stateMeta: StateMetaDoc;
  /** Chiave = flowId del campo calcolato. */
  formulaMeta: Record<string, FormulaMetaDoc>;
  /**
   * Ultimo ordinal assegnato per gruppo ripetibile (D-132 P-03): non scende mai, anche dopo la rimozione fisica delle
   * righe, così un ordinal non si riusa e l'ordine d'inserimento resta stabile.
   */
  rowSeq?: Record<string, number>;
  createdAt: Date;
  closedAt: Date | null;
}

export interface ConstraintRowDoc {
  code: ConstraintCode;
  stato: SelectValue | null;
  ente: SelectValue | null;
}

export interface RepeatRowDoc {
  /** = rowId */
  _id: ObjectId;
  practiceId: ObjectId;
  iterationId: ObjectId;
  groupKey: string;
  /** Ordine assegnato dal server, mai l'indice dell'array ricevuto. */
  ordinal: number;
  values: Record<string, FieldValue>;
  /** Solo nelle righe VINCOLI. */
  constraint?: ConstraintRowDoc;
  metadata: {
    /** Riga creata da un'altra (voce Ente da vincolo PRESENTE, D-35). */
    origin?: { groupKey: string; rowId: ObjectId };
    locked?: boolean;
    warning?: string;
    /** Controllo una tantum dello spostamento del Forecast (D-84, D-85). */
    integrationCheck?: { checkedAtRomeDate: string; remainingDays: number | null; eligible: boolean; operationId: string };
    /** Voce Ente: nome generato dal sistema, per distinguerlo da un nome scritto dall'utente (D-126 M-02/M-03). */
    generatedName?: string | null;
    /** Riga ARPA: ciclo successivo già aperto dalla Ripresentazione (una volta per riga, D-126 §3.2). */
    arpaOpened?: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface ValueHistoryDoc {
  _id: ObjectId;
  /** operationId del client (raggruppamento opaco, unico solo per attore). */
  operationId: string;
  /** Chiave interna dell'operazione, unica in assoluto: attore + operationId (D-126 M-06). */
  opKey: string;
  changeIndex: number;
  practiceId: ObjectId;
  iterationId: ObjectId;
  n: number;
  templateVersion: string;
  kind: Extract<HistoryKind, "FIELD" | "ROW_ADD" | "ROW_REMOVE">;
  target: {
    flowId?: string;
    transversal?: "noteOperative" | "fatturabile" | "fatturato";
    /** Gruppo della nota operativa (D-121): decide chi vede la voce. */
    noteGroup?: GroupId;
    groupKey?: string;
    rowId?: ObjectId;
  };
  oldValue: FieldValue;
  newValue: FieldValue;
  rowSnapshot?: Record<string, FieldValue>;
  /** Motivo leggibile delle modifiche di SISTEMA (formule, Assegna, ereditarietà). */
  detail?: string;
  actorId: ObjectId | null;
  actorName: string | null;
  source: Source;
  timestamp: Date;
  revision: number;
}

export interface PracticeEventDoc {
  _id: ObjectId;
  operationId: string;
  /** Chiave interna dell'operazione, unica in assoluto: attore + operationId (D-126 M-06). */
  opKey: string;
  eventIndex: number;
  practiceId: ObjectId;
  iterationId: ObjectId;
  n: number;
  kind: Exclude<HistoryKind, "FIELD" | "ROW_ADD" | "ROW_REMOVE">;
  actorId: ObjectId | null;
  actorName: string | null;
  source: Source;
  timestamp: Date;
  detail: string;
  structuredDetail?: Record<string, unknown>;
}

export interface AlertDoc {
  _id: ObjectId;
  practiceId: ObjectId;
  iterationId: ObjectId;
  ruleId: string;
  /** Gruppo competente (chi può chiuderlo a mano, D-46); assente = quello del master del campo. */
  ownerGroup?: GroupId;
  subject: { flowId?: string; groupKey?: string; rowId?: ObjectId; sectionKey?: string };
  /** Chiave idempotente dell'episodio (pratica, iterazione, regola, riga, generazione). */
  episodeKey: string;
  generation: number;
  sourceFingerprint: string;
  ruleVersion: number;
  calendarVersion: string;
  dueLocalDate: string | null;
  dueAt: Date | null;
  status: "OPEN" | "CLOSED";
  executionStatus: "ACTIVE" | "SUSPENDED" | "SUPERSEDED";
  openedAt: Date;
  closedAt: Date | null;
  closeMode: "AUTO" | "MANUAL" | null;
  closedBy: ObjectId | null;
  closeReason: string | null;
  recipientsSnapshot: ObjectId[];
  nextReminderAt: Date | null;
  /** Promemoria settimanali già inviati (k dell'ancora scadenza + 7k). */
  reminderCount?: number;
  /** Ultima emissione (apertura o promemoria): base della ripianificazione dei promemoria (D-137 A-10). */
  lastReminderAt?: Date | null;
  /** Situazione risolta dopo (o con) la chiusura: abilita un nuovo episodio (D-97). */
  resolvedAt?: Date | null;
}

export interface AlertEventDoc {
  _id: ObjectId;
  alertId: ObjectId;
  eventIndex: number;
  kind: "OPEN" | "REMIND" | "CLOSE" | "SUSPEND" | "RESUME" | "SKIP_RECIPIENT" | "DELIVERY" | "RESCHEDULE" | "RESOLVED" | "UNRESOLVED";
  actorId: ObjectId | null;
  time: Date;
  detail?: Record<string, unknown>;
}

export interface NotificationDoc {
  _id: ObjectId;
  userId: ObjectId;
  kind: NotificationKind;
  /** Chiave idempotente dell'evento che ha prodotto la notifica. */
  eventKey: string;
  title: string;
  body: string;
  link: {
    practiceId: ObjectId;
    iteration?: number;
    flowId?: string;
    occurrenceKey?: string;
    sectionKey?: string;
    repeat?: string;
    rowId?: ObjectId;
    /** v0.5.0: notifica MENTION, il commento da mostrare. */
    commentId?: ObjectId;
  } | null;
  createdAt: Date;
  readAt: Date | null;
}

export interface DeliveryOutboxDoc {
  _id: ObjectId;
  eventKey: string;
  userId: ObjectId;
  channel: "EMAIL";
  payload: { to: string; subject: string; html: string; actionLink?: string };
  /**
   * PENDING → CLAIMED (presa in carico con lease) → SENDING (confine di emissione, D-137: transazione che ricontrolla
   * claim, destinatario e alert) → SENT. CANCELLED: annullata prima dell'emissione (alert chiuso, sospeso, sostituito,
   * destinatario non attivo). FAILED: errore permanente (5xx), si rimette in coda solo con outbox:requeue.
   */
  status: "PENDING" | "CLAIMED" | "SENDING" | "SENT" | "FAILED" | "CANCELLED";
  /** Alert a cui appartiene la mail (annullamento nelle transazioni di chiusura, sospensione, sostituzione). */
  alertId?: ObjectId | null;
  /** Mail degli alert: solo nei giorni lavorativi dalle 09:00 di Roma, anche nei ritentativi (D-137 A-12). */
  businessHoursOnly?: boolean;
  sendingAt?: Date | null;
  /** Primo errore della serie in corso (avviso dopo un'ora, D-137 A-05). */
  firstErrorAt?: Date | null;
  warnedAt?: Date | null;
  attempts: number;
  nextAttemptAt: Date;
  leaseUntil: Date | null;
  claimToken: string | null;
  lastError: string | null;
  sentAt: Date | null;
  createdAt: Date;
}

/** Eventi di recapito, solo in aggiunta (D-137 A-14): uno per passaggio, senza contenuti della mail. */
export interface DeliveryEventDoc {
  _id: ObjectId;
  outboxId: ObjectId;
  eventKey: string;
  alertId: ObjectId | null;
  userId: ObjectId;
  /** Tentativi di invio fatti fino a questo evento. */
  attempt: number;
  at: Date;
  outcome: "DEFERRED" | "CANCELLED" | "SENDING" | "SENT" | "RETRY" | "FAILED" | "LOST" | "REQUEUED";
  /** Worker o comando che ha registrato l'evento. */
  by: string | null;
  reason?: string;
}

export interface ListDoc {
  _id: ObjectId;
  templateId: TemplateId | null;
  listId: string;
  label: string;
  group: GroupId | null;
  kind: "CONTROLLED" | "CONFIGURABLE";
  revision: number;
  items: ListItemDTO[];
  provenance: string;
  updatedAt: Date;
}

export interface GeographicalUnitDoc {
  _id: ObjectId;
  version: string;
  type: "REGIONE" | "PROVINCIA" | "COMUNE";
  code: string;
  name: string;
  parentCode: string | null;
  active: boolean;
}

export interface StoreUserDoc {
  _id: ObjectId;
  /** Normalizzata in minuscolo. */
  email: string;
  name: string;
  passwordHash: string | null;
  status: UserStatus;
  isAdmin: boolean;
  memberships: MembershipDTO[];
  /** Cresce a ogni cambio di appartenenze o stato: invalida autorizzazioni memorizzate. */
  authVersion: number;
  notificationPrefs?: { inApp: boolean; email: boolean };
  /** D-173: primo ADMIN creato dall'ambiente; vero finché non cambia la password (assente = falso). */
  mustChangePassword?: boolean;
  /** Utente della prova di carico (ops/utenti-prova, dominio prova.invalid): si riconosce e si disattiva in blocco. */
  testAccount?: true;
  /** §15.2: profilo Direzione (sola lettura di Andamento e Statistiche); vale solo con PH_ANDAMENTO acceso. */
  direzione?: true;
  createdAt: Date;
  updatedAt: Date;
}

/** Istantanea immutabile di un template compilato: una versione = un documento. */
export interface TemplateSnapshotDoc {
  _id: ObjectId;
  templateId: TemplateId;
  version: string;
  baseline: string;
  compiled: TemplateDTO;
  bindings: TemplateBindings;
  createdAt: Date;
}

export interface RuleConfigDoc {
  _id: ObjectId;
  templateId: TemplateId;
  ruleId: string;
  version: number;
  days: number;
  unit: "WORKING_DAYS" | "CALENDAR_DAYS";
  enabled: boolean;
  revision: number;
  updatedAt: Date;
  updatedBy: ObjectId | null;
}

/** Ricevuta di un'operazione con operationId: deduplica i tentativi ripetuti (§1, D-90). */
export interface OperationDoc {
  _id: ObjectId;
  actorId: string;
  operationId: string;
  requestHash: string;
  practiceId: ObjectId | null;
  /** PARTIAL: operazione a più transazioni (conferma dell'import) con righe da ritentare; il risultato è provvisorio. */
  status: "DONE" | "PARTIAL";
  /** Risultato restituito ai tentativi ripetuti (piccolo e serializzabile). */
  result: unknown;
  createdAt: Date;
}

export interface JobRunDoc {
  _id: ObjectId;
  jobKey: string;
  localDate: string;
  status: "RUNNING" | "DONE" | "FAILED";
  cursor: unknown;
  /** Token del titolare del lock che ha avviato o ripreso l'esecuzione (D-137 A-08). */
  fencingToken?: number;
  attempts: number;
  startedAt: Date;
  endedAt: Date | null;
  error: string | null;
}

export interface JobLockDoc {
  _id: string;
  owner: string;
  leaseUntil: Date;
  fencingToken: number;
  /** Ultima verifica del token in una transazione (assertFence). */
  lastFenceAt?: Date;
}

export interface AuthTokenDoc {
  _id: ObjectId;
  userId: ObjectId;
  type: "invite" | "reset";
  token: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

/**
 * Documento-guardia per evitare il "write skew" nelle transazioni: due operazioni che controllano lo stesso
 * invariante (es. almeno un PM leader per gestore, D-101) scrivono la stessa guardia e quindi entrano in
 * conflitto invece di passare entrambe.
 */
export interface WriteGuardDoc {
  _id: string;
  version: number;
  updatedAt: Date;
}

/**
 * Registro di audit lato server (D-113): solo aggiunte, nessuna scadenza. Traccia le operazioni che non lasciano
 * uno storico consultabile, a partire dalla cancellazione di una pratica. Distinto da `operations`, che serve
 * solo alla deduplica e potrà essere ripulito.
 */
export interface PracticeDeleteAuditDoc {
  _id: ObjectId;
  kind: "PRACTICE_DELETE";
  actorId: ObjectId | null;
  actorName: string | null;
  at: Date;
  operationId: string;
  practice: {
    id: ObjectId;
    templateId: TemplateId;
    codiceSito: string;
    nomeSito: string;
    codiceG7: string | null;
    iterations: number;
  };
}

/** Assistente AI (D-169, D-171): modifica delle impostazioni globali, con i valori vecchi e nuovi. */
export interface AssistantSettingsAuditDoc {
  _id: ObjectId;
  kind: "ASSISTANT_SETTINGS";
  actorId: ObjectId | null;
  actorName: string | null;
  at: Date;
  operationId: string;
  changes: { field: "enabled" | "dailyLimit" | "perMinuteLimit"; oldValue: boolean | number; newValue: boolean | number }[];
}

/** Commento eliminato da un ADMIN che non ne è l'autore (D-185): resta traccia di chi e quando, senza testo. */
export interface CommentDeleteAuditDoc {
  _id: ObjectId;
  kind: "COMMENT_DELETE";
  actorId: ObjectId | null;
  actorName: string | null;
  at: Date;
  operationId: string;
  comment: { id: ObjectId; practiceId: ObjectId; authorId: ObjectId; authorName: string };
}

/** Utenti di prova creati o disattivati in blocco dal comando operativo (nessuna password). */
export interface TestUsersAuditDoc {
  _id: ObjectId;
  kind: "TEST_USERS";
  action: "CREATE" | "DISABLE";
  actorId: null;
  actorName: string;
  at: Date;
  operationId: string;
  users: ObjectId[];
  count: number;
}

/** §15: soglia delle pratiche ferme di Andamento cambiata da un ADMIN. */
export interface AndamentoSettingsAuditDoc {
  _id: ObjectId;
  kind: "ANDAMENTO_SETTINGS";
  actorId: ObjectId | null;
  actorName: string | null;
  at: Date;
  operationId: string;
  changes: { field: "sogliaFermeGiorni"; oldValue: number; newValue: number }[];
}

/** Registro di audit (D-113): solo aggiunte, nessun TTL. */
export type AuditLogDoc = PracticeDeleteAuditDoc | AssistantSettingsAuditDoc | CommentDeleteAuditDoc | TestUsersAuditDoc | AndamentoSettingsAuditDoc;

/**
 * Anteprima di un import (B9, D-135): dato TEMPORANEO, non storico. Scade dopo 24 ore (indice TTL su expiresAt);
 * il file non si conserva, solo il piano delle righe. Il commit rifà abbinamento e controllo dei campi vuoti.
 */
export interface ImportPreviewRowDoc {
  rowIndex: number;
  outcome: ImportOutcome;
  key: { codiceG7: number; codiceSito: string; nomeSito: string } | null;
  /** UPDATE: pratica da aggiornare; REWORK: origine (null se l'origine è creata da una riga precedente del file). */
  practiceId: ObjectId | null;
  /** REWORK da una pratica creata da una riga precedente dello stesso file. */
  originRow: number | null;
  candidateIds: ObjectId[];
  changes: { flowId: string; label: string; value: FieldValue }[];
  skipped: { flowId: string; label: string; reason: ImportSkipReason; detail?: string }[];
  errors: string[];
}

export interface ImportPreviewDoc {
  _id: ObjectId;
  templateId: TemplateId;
  templateVersion: string;
  actorId: ObjectId;
  fileName: string | null;
  columns: { header: string; index: number; flowId: string | null; importable: boolean; note?: string }[];
  rows: ImportPreviewRowDoc[];
  createdAt: Date;
  expiresAt: Date;
}

/** Battito di un servizio dello stack (K5, PR-15/PR-16): lo scrive il servizio, lo legge /api/health. */
export interface ServiceHeartbeatDoc {
  _id: "worker" | "backup";
  owner: string;
  at: Date;
  startedAt: Date;
  /** Scarto tra l'orologio del servizio e quello del database all'avvio (ms, positivo = servizio avanti). */
  clockSkewMs?: number;
  /** Spazio della cartella delle copie (servizio backup). */
  disk?: { path: string; freeBytes: number; totalBytes: number };
}

/** Un giro delle copie notturne (K4, scripts/db/backup-service.mjs). */
export interface BackupRunDoc {
  _id: ObjectId;
  startedAt: Date;
  endedAt: Date;
  ok: boolean;
  databases: Array<{ db: string; ok: boolean; folder?: string; documents?: number; removed?: number; error?: string }>;
}

/** Versione dei dati del database (K6, PR-27): una sola riga, _id "data_version". */
export interface DataVersionDoc {
  _id: "data_version";
  version: number;
  setAt: Date;
  history: Array<{ version: number; at: Date; by: string }>;
}

/** Tentativo di accesso fallito (PR-22): chiave "email:<email>" o "ip:<indirizzo>"; scade da solo (TTL). */
export interface LoginAttemptDoc {
  _id: ObjectId;
  key: string;
  at: Date;
  expiresAt: Date;
}

/* ---------- Assistente AI (§13 del contratto, D-166…D-172) ---------- */

/**
 * Impostazioni globali dell'assistente, un solo documento (_id "global"): interruttore degli ADMIN (D-169) e limiti
 * personali (D-171). Assente = valori iniziali da deploy/.env; si crea solo alla prima modifica di un ADMIN.
 */
export interface AssistantSettingsDoc {
  _id: "global";
  enabled: boolean;
  dailyLimit: number;
  perMinuteLimit: number;
  revision: number;
  updatedAt: Date;
  updatedBy: ObjectId | null;
  updatedByName: string | null;
}

/**
 * Domande ammesse per persona e giorno civile di Roma (D-171). `recent`: ultime ammissioni, per il limite al minuto.
 * Contatore tecnico: niente testo. Eliminato da Mongo dopo `expiresAt` (due giorni dopo il giorno contato).
 */
export interface AssistantUsageDoc {
  /** "<userId>:<YYYY-MM-DD>" */
  _id: string;
  userId: ObjectId;
  day: string;
  count: number;
  recent: Date[];
  expiresAt: Date;
}

/** Registro dell'assistente (D-170): SOLO metadati, nessun testo di domande, risposte, note o nomi di siti; 30 giorni. */
export interface AssistantLogDoc {
  _id: ObjectId;
  requestId: string;
  userId: ObjectId;
  at: Date;
  promptVersion: string;
  catalogVersion: number;
  provider: string;
  model: string | null;
  region: string | null;
  /** Strumenti usati e righe restituite, senza argomenti testuali. */
  tools: { name: string; rows: number; ok: boolean }[];
  outcome: "DONE" | "ERROR" | "CANCELLED";
  answerState: string | null;
  errorCode: string | null;
  firstTextMs: number | null;
  totalMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  sources: number;
  limitsHit: string[];
  expiresAt: Date;
}

/* ---------- Commenti con menzioni (contratto §14, D-183…D-185) ---------- */

/** Menzione salvata: già ricontrollata, con l'etichetta calcolata dal server. */
export type StoredMention =
  | { kind: "group"; id: GroupId; label: string }
  | { kind: "all"; label: string }
  | { kind: "user"; id: ObjectId; label: string };

/**
 * Commento sotto la pratica, nell'iterazione in cui è scritto. Testo semplice, mai interpretato (D-184). Separato dalla
 * revisione della pratica: scriverlo non entra in conflitto con il salvataggio dei campi. Le versioni precedenti restano
 * in `revisions` (al massimo 20); l'eliminazione è logica (D-185).
 */
export interface PracticeCommentDoc {
  _id: ObjectId;
  practiceId: ObjectId;
  iterationId: ObjectId;
  n: number;
  /** null = commento principale; altrimenti il principale (un solo livello). */
  parentId: ObjectId | null;
  authorId: ObjectId;
  authorName: string;
  body: string;
  mentions: StoredMention[];
  createdAt: Date;
  editedAt: Date | null;
  revisions: { body: string; mentions: StoredMention[]; at: Date }[];
  deletedAt: Date | null;
  deletedBy: ObjectId | null;
  deletedByName: string | null;
}


/* ---------- Andamento (contratto §15) ---------- */

/** Impostazioni di Andamento: un solo documento "global"; assente = valori iniziali. */
export interface AndamentoSettingsDoc {
  _id: "global";
  sogliaFermeGiorni: number;
  revision: number;
  updatedAt: Date;
  updatedBy: ObjectId | null;
  updatedByName: string | null;
}
