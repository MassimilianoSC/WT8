/**
 * Accesso al database del modello nuovo (D-91, D-104): un secondo database logico sullo stesso server
 * Mongo della beta (NEW_DB_NAME, default "<DB_NAME>_v2"), con i nomi definitivi delle collezioni.
 *
 * Regola (D-104): nessuna lettura crea il database, gli indici o gli snapshot. `getStoreDb()` non fa alcun
 * setup; `bootstrapStore()` (indici + snapshot dei template) parte solo dagli script espliciti o prima della
 * prima scrittura del modello nuovo (`ensureStoreBootstrapped`, usata da runOperation).
 */
import type { AnyBulkWriteOperation, Collection, Db, Document, IndexDescription } from "mongodb";
import { MongoBulkWriteError, ObjectId } from "mongodb";
import type { ConditionDTO, TemplateDTO, TemplateId } from "@/lib/contract";
import { getClient } from "@/lib/db";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";
import type { InitialList } from "@/lib/lists/catalog";
import initialLists from "@/data/templates/lists-initial.json";
import alertRules from "@/data/alert-rules.json";

/** Liste iniziali (B6) generate col compilatore. */
export const INITIAL_LISTS = (initialLists as unknown as { lists: InitialList[] }).lists;

/** Catalogo delle soglie degli alert con i default (G §17.10, D-97). */
export const ALERT_RULES = (alertRules as unknown as {
  rules: Array<{ ruleId: string; label: string; days: number; unit: "WORKING_DAYS" | "CALENDAR_DAYS"; templates: TemplateId[] }>;
}).rules;
import type {
  AlertDoc,
  AlertEventDoc,
  AssistantLogDoc,
  AssistantSettingsDoc,
  AssistantUsageDoc,
  AuditLogDoc,
  AndamentoSettingsDoc,
  PracticeCommentDoc,
  BackupRunDoc,
  DataVersionDoc,
  AuthTokenDoc,
  DeliveryEventDoc,
  DeliveryOutboxDoc,
  GeographicalUnitDoc,
  ImportPreviewDoc,
  LoginAttemptDoc,
  IterationDoc,
  JobLockDoc,
  JobRunDoc,
  ListDoc,
  NotificationDoc,
  OperationDoc,
  PracticeDoc,
  PracticeEventDoc,
  RepeatRowDoc,
  RuleConfigDoc,
  ServiceHeartbeatDoc,
  StoreUserDoc,
  TemplateSnapshotDoc,
  ValueHistoryDoc,
  WriteGuardDoc,
} from "@/lib/store/types";

export function storeDbName(env: NodeJS.ProcessEnv = process.env): string {
  if (env.NEW_DB_NAME) return env.NEW_DB_NAME;
  if (!env.DB_NAME) throw new Error("DB_NAME is not set");
  return `${env.DB_NAME}_v2`;
}

/** Database del modello nuovo, SENZA alcun setup (nessuna scrittura). */
export async function getStoreDb(): Promise<Db> {
  const client = await getClient();
  return client.db(storeDbName());
}

/** Database di esercizio del nuovo stack (D-158): il seed demo vi è sempre rifiutato. Stessa lista in scripts/db/backup-db.mjs. */
export const PRODUCTION_DB_NAMES: readonly string[] = ["practicehub_prod", "practicehub_prod_legacy"];

/** Accessor tipizzati (nomi definitivi di D-91). */
export const store = {
  practices: (db: Db) => db.collection<PracticeDoc>("practices"),
  iterations: (db: Db) => db.collection<IterationDoc>("practice_iterations"),
  repeatRows: (db: Db) => db.collection<RepeatRowDoc>("repeat_rows"),
  valueHistory: (db: Db) => db.collection<ValueHistoryDoc>("value_history"),
  events: (db: Db) => db.collection<PracticeEventDoc>("practice_events"),
  alerts: (db: Db) => db.collection<AlertDoc>("alerts"),
  alertEvents: (db: Db) => db.collection<AlertEventDoc>("alert_events"),
  notifications: (db: Db) => db.collection<NotificationDoc>("notifications"),
  outbox: (db: Db) => db.collection<DeliveryOutboxDoc>("delivery_outbox"),
  deliveryEvents: (db: Db) => db.collection<DeliveryEventDoc>("delivery_events"),
  lists: (db: Db) => db.collection<ListDoc>("lists"),
  geo: (db: Db) => db.collection<GeographicalUnitDoc>("geographical_units"),
  users: (db: Db) => db.collection<StoreUserDoc>("users"),
  templates: (db: Db) => db.collection<TemplateSnapshotDoc>("templates"),
  ruleConfig: (db: Db) => db.collection<RuleConfigDoc>("rule_config"),
  operations: (db: Db) => db.collection<OperationDoc>("operations"),
  jobRuns: (db: Db) => db.collection<JobRunDoc>("job_runs"),
  jobLocks: (db: Db) => db.collection<JobLockDoc>("job_locks"),
  authTokens: (db: Db) => db.collection<AuthTokenDoc>("auth_tokens"),
  writeGuards: (db: Db) => db.collection<WriteGuardDoc>("write_guards"),
  auditLog: (db: Db) => db.collection<AuditLogDoc>("audit_log"),
  importPreviews: (db: Db) => db.collection<ImportPreviewDoc>("import_previews"),
  heartbeats: (db: Db) => db.collection<ServiceHeartbeatDoc>("service_heartbeats"),
  backupRuns: (db: Db) => db.collection<BackupRunDoc>("backup_runs"),
  meta: (db: Db) => db.collection<DataVersionDoc>("meta"),
  loginAttempts: (db: Db) => db.collection<LoginAttemptDoc>("login_attempts"),
  assistantSettings: (db: Db) => db.collection<AssistantSettingsDoc>("assistant_settings"),
  assistantUsage: (db: Db) => db.collection<AssistantUsageDoc>("assistant_usage"),
  assistantLog: (db: Db) => db.collection<AssistantLogDoc>("assistant_log"),
  practiceComments: (db: Db) => db.collection<PracticeCommentDoc>("practice_comments"),
  andamentoSettings: (db: Db) => db.collection<AndamentoSettingsDoc>("andamento_settings"),
};

/** Collezioni applicative del modello nuovo, nell'ordine in cui le azzera lo script di reset. */
export const STORE_COLLECTIONS = [
  "practices",
  "practice_iterations",
  "repeat_rows",
  "value_history",
  "practice_events",
  "alerts",
  "alert_events",
  "notifications",
  "delivery_outbox",
  "delivery_events",
  "lists",
  "geographical_units",
  "templates",
  "rule_config",
  "operations",
  "job_runs",
  "job_locks",
  "write_guards",
  "audit_log",
  "import_previews",
  "service_heartbeats",
  "meta",
  "login_attempts",
  "assistant_settings",
  "assistant_usage",
  "assistant_log",
  "practice_comments",
  "andamento_settings",
] as const;
export const STORE_USER_COLLECTIONS = ["users", "auth_tokens"] as const;

/** Indici dell'architettura §1.2. Nessun indice unico su G7 o sito (D-24); nessun TTL su storico ed eventi (D-47). */
export const STORE_INDEXES: Record<string, IndexDescription[]> = {
  practices: [
    { key: { templateId: 1, archived: 1, "currentSummary.statoAttivita": 1, updatedAt: -1, _id: 1 } },
    { key: { enabledGroups: 1, archived: 1, updatedAt: -1 } },
    { key: { originPracticeId: 1 } },
    { key: { "currentSummary.codiceG7": 1 } },
    { key: { "currentSummary.codiceSito": 1 } },
  ],
  practice_iterations: [{ key: { practiceId: 1, n: 1 }, unique: true }, { key: { practiceId: 1 } }],
  repeat_rows: [
    { key: { iterationId: 1, groupKey: 1, ordinal: 1 }, unique: true },
    { key: { iterationId: 1, groupKey: 1, _id: 1 } },
    { key: { "metadata.origin.rowId": 1 }, sparse: true },
  ],
  value_history: [
    // D-126 M-06: unicità per operazione dell'attore (opKey), non per il solo operationId del client.
    { key: { opKey: 1, changeIndex: 1 }, unique: true },
    { key: { practiceId: 1, iterationId: 1, timestamp: -1, _id: 1 } },
    { key: { iterationId: 1, "target.flowId": 1, "target.rowId": 1, timestamp: -1 } },
  ],
  practice_events: [
    { key: { opKey: 1, eventIndex: 1 }, unique: true },
    { key: { practiceId: 1, timestamp: -1, _id: 1 } },
    { key: { iterationId: 1, kind: 1, timestamp: 1 } },
    // §15 Andamento: eventi di un tipo in un periodo (passaggi di stato, entrate, rilavorazioni) su tutte le pratiche.
    { key: { kind: 1, timestamp: 1 } },
  ],
  alerts: [
    { key: { episodeKey: 1 }, unique: true },
    { key: { status: 1, dueAt: 1 } },
    { key: { practiceId: 1, iterationId: 1, status: 1 } },
    { key: { status: 1, nextReminderAt: 1 } },
  ],
  alert_events: [{ key: { alertId: 1, eventIndex: 1 }, unique: true }, { key: { alertId: 1, time: 1 } }],
  notifications: [{ key: { userId: 1, eventKey: 1 }, unique: true }, { key: { userId: 1, readAt: 1, createdAt: -1 } }],
  delivery_outbox: [
    { key: { eventKey: 1, userId: 1, channel: 1 }, unique: true },
    { key: { status: 1, nextAttemptAt: 1 } },
    { key: { leaseUntil: 1 } },
    { key: { alertId: 1, status: 1 } },
  ],
  // D-137 A-14: solo aggiunte, nessun TTL.
  delivery_events: [{ key: { outboxId: 1, at: 1 } }, { key: { alertId: 1, at: 1 } }, { key: { at: -1 } }],
  lists: [{ key: { templateId: 1, listId: 1 }, unique: true }],
  geographical_units: [{ key: { version: 1, type: 1, code: 1 }, unique: true }, { key: { version: 1, type: 1, parentCode: 1, name: 1 } }],
  users: [
    { key: { email: 1 }, unique: true },
    { key: { status: 1, "memberships.templateId": 1, "memberships.group": 1, "memberships.role": 1, "memberships.leader": 1 } },
  ],
  templates: [{ key: { templateId: 1, version: 1 }, unique: true }],
  rule_config: [{ key: { templateId: 1, ruleId: 1, version: 1 }, unique: true }],
  operations: [{ key: { actorId: 1, operationId: 1 }, unique: true }],
  job_runs: [{ key: { jobKey: 1, localDate: 1 }, unique: true }],
  auth_tokens: [{ key: { token: 1 }, unique: true }, { key: { expiresAt: 1 }, expireAfterSeconds: 0 }],
  // D-113: solo aggiunte, nessun TTL.
  audit_log: [{ key: { at: -1, _id: 1 } }, { key: { "practice.id": 1 } }, { key: { operationId: 1 } }],
  // B9: anteprime temporanee, eliminate da Mongo alla scadenza (24 h).
  // K4: un giro di copia per notte, letto per data; nessun TTL (storico delle copie).
  // PR-22: tentativi di accesso falliti, eliminati da Mongo alla scadenza della finestra.
  login_attempts: [{ key: { key: 1, at: -1 } }, { key: { expiresAt: 1 }, expireAfterSeconds: 0 }],
  backup_runs: [{ key: { startedAt: -1 } }, { key: { ok: 1, startedAt: -1 } }],
  import_previews: [{ key: { expiresAt: 1 }, expireAfterSeconds: 0 }, { key: { actorId: 1, createdAt: -1 } }],
  // Assistente AI: contatori per persona e giorno (TTL dopo due giorni) e registro di soli metadati (TTL 30 giorni, D-170).
  assistant_usage: [{ key: { expiresAt: 1 }, expireAfterSeconds: 0 }, { key: { userId: 1, day: -1 } }],
  assistant_log: [{ key: { expiresAt: 1 }, expireAfterSeconds: 0 }, { key: { userId: 1, at: -1 } }, { key: { at: -1 } }],
  // Commenti (§14): per pratica e iterazione in ordine di scrittura; risposte per principale. Nessun TTL.
  practice_comments: [{ key: { practiceId: 1, n: 1, createdAt: 1, _id: 1 } }, { key: { parentId: 1 } }],
};

/**
 * Upsert "solo se manca" in blocco (una sola andata e ritorno per collezione). Se un altro processo inserisce lo
 * stesso documento nello stesso istante (indice unico, 11000) il documento c'è già: va bene così.
 */
async function insertMissing<T extends Document>(coll: Collection<T>, ops: AnyBulkWriteOperation<T>[]): Promise<number> {
  if (ops.length === 0) return 0;
  try {
    return (await coll.bulkWrite(ops, { ordered: false })).upsertedCount;
  } catch (e) {
    if (e instanceof MongoBulkWriteError && e.writeErrors && (Array.isArray(e.writeErrors) ? e.writeErrors : [e.writeErrors]).every((w) => w.code === 11000)) {
      return e.result.upsertedCount;
    }
    throw e;
  }
}

/** Crea gli indici, registra gli snapshot immutabili dei template e le liste iniziali mancanti. Idempotente. */
/** Indici unici superati (D-126 M-06): globali sul solo operationId del client. Si tolgono dove esistono. */
export const LEGACY_INDEXES: ReadonlyArray<[collection: string, name: string]> = [
  ["value_history", "operationId_1_changeIndex_1"],
  ["practice_events", "operationId_1_eventIndex_1"],
];

/**
 * Versione dei dati che questo programma sa usare (K6, PR-27). Si alza SOLO insieme a una migrazione esplicita
 * (comando dedicato, prima dell'avvio della versione nuova): l'avvio non migra mai i dati da sé.
 */
export const DATA_VERSION = 1;

export class DataVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataVersionError";
  }
}

/** Confronto tra la versione dei dati e quella del programma: null se compatibili, altrimenti il motivo. */
export function dataVersionProblem(dataVersion: number, codeVersion: number = DATA_VERSION): string | null {
  if (dataVersion > codeVersion) {
    return `I dati sono alla versione ${dataVersion}, più recente di questo programma (${codeVersion}): si è tornati a un'immagine precedente senza ripristinare la copia fatta prima dell'aggiornamento (deploy/README.md, ritorno indietro).`;
  }
  if (dataVersion < codeVersion) {
    return `I dati sono alla versione ${dataVersion}, questo programma richiede la ${codeVersion}: eseguire prima la migrazione esplicita (deploy/README.md, aggiornamento).`;
  }
  return null;
}

/**
 * Controlla la versione dei dati; su un database senza versione la registra: quella del programma se è nuovo, 1 se
 * contiene già pratiche (creato prima della versione dei dati). DataVersionError se non compatibile.
 */
export async function assertDataVersion(db: Db, now: Date = new Date(), codeVersion: number = DATA_VERSION): Promise<number> {
  let doc = await store.meta(db).findOne({ _id: "data_version" });
  if (!doc) {
    const existing = (await store.practices(db).estimatedDocumentCount()) > 0;
    const start = existing ? 1 : codeVersion;
    await store.meta(db).updateOne(
      { _id: "data_version" },
      { $setOnInsert: { version: start, setAt: now, history: [{ version: start, at: now, by: existing ? "rilevata (dati esistenti)" : "database nuovo" }] } },
      { upsert: true }
    );
    doc = (await store.meta(db).findOne({ _id: "data_version" }))!;
  }
  const problem = dataVersionProblem(doc.version, codeVersion);
  if (problem) throw new DataVersionError(problem);
  return doc.version;
}

/** Codici citati (EQ / NEQ / IN) dalle condizioni del template corrente sui campi con quella lista. */
function conditionCodes(templateId: string, listId: string): Set<string> {
  const compiled = (COMPILED_TEMPLATES as Record<string, { template: TemplateDTO } | undefined>)[templateId];
  const out = new Set<string>();
  if (!compiled) return out;
  const t = compiled.template;
  const flows = new Set(t.occurrences.filter((o) => o.kind === "MASTER" && o.list?.listId === listId && o.flowId).map((o) => o.flowId!));
  const walk = (c: ConditionDTO | null | undefined): void => {
    if (!c) return;
    if ("all" in c) return c.all.forEach(walk);
    if ("any" in c) return c.any.forEach(walk);
    if ("value" in c && flows.has(c.flowId)) for (const v of Array.isArray(c.value) ? c.value : [c.value]) out.add(v);
  };
  t.occurrences.forEach((o) => walk(o.condition));
  return out;
}

export async function bootstrapStore(db: Db, now: Date = new Date()): Promise<{ templatesInserted: number; listsInserted: number }> {
  // K6, PR-27: prima di qualunque altra scrittura, dati e programma devono essere della stessa versione.
  await assertDataVersion(db, now);
  for (const [name, index] of LEGACY_INDEXES) {
    // 26 = collezione inesistente, 27 = indice inesistente: niente da togliere.
    await db.collection(name).dropIndex(index).catch((e: { code?: number }) => {
      if (e.code !== 26 && e.code !== 27) throw e;
    });
  }
  await Promise.all(Object.entries(STORE_INDEXES).map(([name, indexes]) => db.collection(name).createIndexes(indexes)));
  const templatesInserted = await insertMissing(
    store.templates(db),
    Object.values(COMPILED_TEMPLATES).map(({ template, bindings }) => ({
      updateOne: {
        filter: { templateId: template.id, version: template.version },
        update: { $setOnInsert: { templateId: template.id, version: template.version, baseline: template.baseline, compiled: template, bindings, createdAt: now } },
        upsert: true,
      },
    }))
  );
  // Liste iniziali: solo quelle mancanti, mai sopra le modifiche dei leader.
  const listsInserted = await insertMissing(
    store.lists(db),
    INITIAL_LISTS.map((l) => ({
      updateOne: { filter: { templateId: l.templateId, listId: l.listId }, update: { $setOnInsert: { ...l, revision: 1, updatedAt: now } }, upsert: true },
    }))
  );
  // D-207: un codice citato da una condizione dei template correnti deve esistere nella lista anche in un database già
  // seminato (es. TOWERNET Incarico: VERIFICA_STATICA…). Si aggiunge SOLO il codice mancante, dalla lista iniziale;
  // nient'altro della lista dei leader cambia (etichette, ordine, voci disattivate restano come sono).
  for (const l of INITIAL_LISTS) {
    if (!l.templateId) continue;
    const needed = conditionCodes(l.templateId, l.listId);
    for (const item of l.items.filter((i) => needed.has(i.code))) {
      await store.lists(db).updateOne(
        { templateId: l.templateId, listId: l.listId, "items.code": { $ne: item.code } },
        { $push: { items: item }, $inc: { revision: 1 }, $set: { updatedAt: now } }
      );
    }
  }
  // Soglie degli alert: versione 1 con i default, solo se manca.
  await insertMissing(
    store.ruleConfig(db),
    ALERT_RULES.flatMap((r) =>
      r.templates.map((templateId) => ({
        updateOne: {
          filter: { templateId, ruleId: r.ruleId, version: 1 },
          update: { $setOnInsert: { _id: new ObjectId(), templateId, ruleId: r.ruleId, version: 1, days: r.days, unit: r.unit, enabled: true, revision: 1, updatedAt: now, updatedBy: null } },
          upsert: true,
        },
      }))
    )
  );
  return { templatesInserted, listsInserted };
}

const globalForStore = global as unknown as { _storeBootstrap?: Map<string, Promise<unknown>> };
const bootstrapped = globalForStore._storeBootstrap ?? (globalForStore._storeBootstrap = new Map());

/** bootstrapStore una sola volta per processo e per database: da chiamare solo prima di una SCRITTURA. */
export function ensureStoreBootstrapped(db: Db): Promise<unknown> {
  const key = db.databaseName;
  if (!bootstrapped.has(key)) {
    bootstrapped.set(
      key,
      bootstrapStore(db).catch((e) => {
        bootstrapped.delete(key);
        throw e;
      })
    );
  }
  return bootstrapped.get(key)!;
}
