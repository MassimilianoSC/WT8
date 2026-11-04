# PracticeHub — Contratto dei dati tra backend (o2) e frontend (o3)

**Versione:** 0.6.9 — 11/10/2026
**Proprietario:** sessione di memoria (penna unica). `frontend/src/lib/contract.ts` lo scrive **o2** e **segue** questo documento, non lo precede (D-5).
**Per cambiarlo:** o2 o o3 chiedono alla memoria, che aggiorna il documento, alza la versione e annota la modifica in fondo; solo dopo o2 modifica il codice.
**Copertura:** v0.1 = template, utenti, pratiche e iterazioni, lettura e scrittura dei campi, comandi della pratica, liste, storico, notifiche e alert; **v0.2** = statistiche (KPI), carichi di lavoro, export CSV, import (§9–§12). **v0.4** = assistente AI (§13); **v0.5** = commenti con menzioni (§14); **v0.6** = Andamento e profilo Direzione (§15, dietro interruttore).

---

## 1. Convenzioni

- Tutto in JSON. Gli **errori** mantengono la forma attuale dell'app: `{ "error": "<messaggio in italiano>" }` (eventualmente con campi aggiuntivi, es. `rejected` nel 403 di §5.2) con lo status HTTP appropriato (400 richiesta errata, 401 non autenticato, 403 non autorizzato, 404 non trovato, 409 conflitto di stato, 422 validazione).
- **ID** delle entità: stringhe (ObjectId esadecimale). Non hanno significato per l'utente.
- **Timestamp** (creazione, modifica, alert): ISO 8601 con fuso, es. `2026-10-08T09:00:00+02:00`.
- **Campi data** dell'utente: stringa `YYYY-MM-DD` nel trasporto; l'interfaccia mostra `gg/mm/aaaa` (D-38).
- **Codici dei domini controllati:** `UPPER_SNAKE_CASE` stabili (es. `DA_RICHIEDERE`). L'etichetta mostrata si legge dalla lista, non si deduce dal codice.
- Tutte le rotte sono sotto `/api/` e richiedono la sessione, tranne quelle di autenticazione.
- **422 di riga (v0.5.3):** `{ error, code, rowId }`. `ROW_NOT_FOUND` ("Riga non trovata": inesistente, già tolta, di un'altra pratica), `ROW_REMOVED` (tolta nello stesso PATCH), `ROW_GROUP_MISMATCH` (riga di un altro gruppo), `ROW_OTHER_ITERATION` (di un'altra iterazione): il testo inizia sempre con "Riga non trovata"; il client scarta le modifiche di quella riga, ricarica e salva il resto. `ROW_LOCKED`: riga Ente collegata a un vincolo Presente, non si toglie (messaggio mostrato così com'è).
- **409 (v0.1.7):** corpo `{ error: string; code: "REVISION_CONFLICT" | "ITERATION_CONFLICT" | "OPERATION_REUSED"; currentRevision?: number }`. REVISION_CONFLICT → il client ricarica la pratica; ITERATION_CONFLICT → ricarica sull'iterazione corrente; OPERATION_REUSED → stessa `operationId` usata con un corpo diverso.
- **`operationId` (v0.1.7):** stringa (UUID) **facoltativa** in `POST /api/practices`, nel PATCH dei campi, in tutti i comandi di §5.3 (per `DELETE` come `?operationId=`) e nella chiusura manuale degli alert. Il client la genera **una volta per azione dell'utente** e la riusa nei tentativi successivi. Stessa `operationId` e stesso corpo → nessun effetto ripetuto e risposta con lo stato **attuale** della risorsa (v0.2.3: non una copia della prima risposta) (niente doppio storico, doppia notifica o doppia mail); stessa `operationId` con corpo diverso → 409 `OPERATION_REUSED`. Ambito: per utente.

## 2. Enumerazioni

```ts
type TemplateId = "ILIAD" | "TOWERNET" | "TIM_FIBERCOP" | "INWIT" | "FASTWEB_VODAFONE" | "LEONARDO";
type GroupId    = "PM_PERMESSI" | "UT_PE" | "AIE" | "DL";
type RoleId     = "PM" | "PERMESSI" | "UT" | "PE" | "AIE" | "DL";          // ADMIN è un flag dell'utente, non un ruolo di gruppo
type StatoAttivita = "CREATA" | "ASSEGNATO" | "IN_APPROVAZIONE" | "PROTOCOLLATO" | "INTEGRAZIONE_RICHIESTA"
                   | "AUTORIZZATO" | "DINIEGATO" | "TAR" | "REALIZZATO" | "TERMINATO" | "STAND_BY" | "KO";
type DataType = "TEXT" | "LONGTEXT" | "NUMBER" | "DATE" | "SELECT" | "MULTISELECT" | "USER" | "USERS";   // v0.1.4: tolto LATLON
```

Corrispondenza ruolo → gruppo: PM, PERMESSI → `PM_PERMESSI`; UT, PE → `UT_PE`; AIE → `AIE`; DL → `DL` (D-17).

## 3. Template (struttura dei campi, in sola lettura per il frontend)

Generato da o2 a partire dai sei MD canonici (D-29). Endpoint: `GET /api/templates` → `TemplateSummaryDTO[]` (v0.1.2) e `GET /api/templates/{templateId}` → `TemplateDTO`.

```ts
interface TemplateSummaryDTO { id: TemplateId; label: string; baseline: string }   // v0.1.2
```

```ts
interface TemplateDTO {
  id: TemplateId;
  label: string;                    // es. "TIM / FIBERCOP"
  baseline: string;                 // data della baseline, es. "2026-10-08"
  version: string;                  // v0.1.7: versione immutabile del template compilato; ogni iterazione ricorda la propria
  sections: SectionDTO[];           // in ordine di visualizzazione
  occurrences: FieldOccurrenceDTO[];// v0.1.5: TUTTE le occorrenze delle sezioni, lista piatta ordinata per (ordine della sezione, order dell'occorrenza); il raggruppamento si fa con sectionKey
  transversal: FieldOccurrenceDTO[];// Note Operative (una occorrenza per gruppo, v0.3.0), Fatturabile, Fatturato (D-37, D-121): senza flowId
  repeatGroups: RepeatGroupDTO[];
  constraints: ConstraintDefDTO[];  // v0.1.7: le 11 voci fisse della tabella Vincoli (D-35), in ordine
}

interface SectionDTO {
  key: string;                      // slug stabile, es. "PM_PERMESSI.FASE_PRELIMINARE"
  label: string;                    // come nell'MD, es. "Fase Preliminare"
  group: GroupId;                   // gruppo a cui la sezione appartiene
  subsection?: "UT" | "PE";         // solo per UT_PE
  order: number;
}

interface FieldOccurrenceDTO {
  occurrenceKey: string;            // univoca nel template: `${flowId}@${sectionKey}`; trasversali: "TRASV.NOTE_OPERATIVE.<GroupId>" (v0.3.0, una per gruppo, ownerGroup = quel gruppo) | "TRASV.FATTURABILE" | "TRASV.FATTURATO" (v0.1.2)
  flowId: string | null;            // "F001"… (D-30); null solo per i trasversali
  label: string;                    // etichetta dell'MD (NON è una chiave)
  sectionKey: string;
  order: number;                    // posizione nella sezione (riga # dell'MD)
  kind: "MASTER" | "MIRROR";        // un solo MASTER per flowId
  ownerGroup: GroupId;              // gruppo che possiede il MASTER (per i mirror: quello del master)
  dataType: DataType;
  list?: ListRefDTO;                // per SELECT / MULTISELECT / USER / USERS
  required: boolean;                // obbligatorio alla creazione (D-38)
  repeatGroup?: string;             // chiave del gruppo ripetibile a cui appartiene
  condition?: ConditionDTO | null;  // condizione di interfaccia (D-31); null = sempre visibile
  computed?: ComputedDTO | null;    // campo calcolato (D-42)
  universal?: string;               // Campo Universale (solo informativo)
  popup?: PopupRefDTO;              // l'occorrenza fa parte di un pop-up (blocco di mirror di un altro gruppo) (v0.1.1)
}

interface PopupRefDTO {
  key: string;                      // univoca nel template, es. "PM_PERMESSI.FASE_PRELIMINARE.POPUP_UT"
  label: string;                    // es. "Da UT+PE"
  sourceGroup: GroupId;             // gruppo che possiede i master mostrati nel pop-up
}

interface ListRefDTO {
  listId: string;                   // es. "STATO_ODA", "TIPOLOGIA_STRUTTURA"
  kind: "CONTROLLED" | "CONFIGURABLE" | "ISTAT" | "USERS";
  allowOther: boolean;              // "Altro" con testo manuale (perimetro: R-1 D1)
  userRole?: RoleId;                // per kind = USERS (D-39)
  parentFlowId?: string;            // v0.1.3: campo da cui dipende la cascata (ISTAT: Provincia → Regione, Comune → Provincia)
  allowNone?: boolean;              // v0.1.7: USER/USERS con la voce "Nessuno" (codice "NESSUNO", esclusivo: in USERS non si combina con altri)
}

type ConditionDTO =
  | { all: ConditionDTO[] } | { any: ConditionDTO[] }
  | { flowId: string; op: "EQ" | "NEQ" | "IN"; value: string | string[] }   // confronto con codici
  | { flowId: string; op: "FILLED" | "EMPTY" };

interface ComputedDTO {
  formula: string;                  // identificatore, es. "FORECAST_GEOLOGICA", "FORECAST_OTTENIMENTO_PERMESSI"
  description: string;              // testo leggibile per l'utente
  manualOverride: boolean;          // v0.1.7: true = l'utente può sovrascriverlo e da quel momento il calcolo si ferma (Forecast Ottenimento Permessi, D-42);
                                    // false = mai modificabile a mano (Tipologia attività PE, Forecast Geologica, Forecast Protocollo ILIAD)
}

interface RepeatGroupDTO {
  key: string;                      // es. "TENANT", "INTEGRAZIONE", "ENTE", "ODA", "ARPA", "VINCOLI"
  label: string;
  flowIds: string[];                // campi che si ripetono insieme (VINCOLI: il solo flowId contenitore dell'MD)
  rowPolicy: "DYNAMIC" | "FIXED";   // v0.1.7: FIXED = righe fisse (solo VINCOLI)
  schemaKind: "FIELDS" | "VINCOLI"; // v0.1.7: VINCOLI = righe strutturate (ConstraintValueDTO), non valori per flowId
}

interface ConstraintDefDTO {        // v0.1.7
  code: string;                     // stabile: MONUMENTALE, ARCHEOLOGICO, PAESAGGISTICO, PARCO, AEROPORTUALE, IDROGEOLOGICO,
                                    // FASCIA_CIMITERIALE, FASCIA_POZZI, FASCIA_CORSI_ACQUA, ALTRO, AMBIENTALI_NATURALISTICI
  label: string;                    // come nella tabella degli MD
  stateList: ListRefDTO;            // stati ammessi per quel vincolo (es. PRESENTE / ASSENTE / NON_PERTINENTE)
  enteList: ListRefDTO | null;      // enti tra cui scegliere (es. SOPRINTENDENZA / COMUNE); null = ente unico predefinito
  defaultEnte: string | null;       // codice dell'ente predefinito, se unico
  defaultEnteLabel: string | null;  // v0.2.1: sua etichetta (es. "Soprintendenza")
}
```

**Semantica delle condizioni (v0.1.5, vincolante per frontend e backend):**
- **vuoto** = `null`, stringa vuota **o di soli spazi**, array vuoto, `SelectValue` con `code` vuoto, array di soli codici vuoti (v0.1.12, allinea client e server); `FILLED` = non vuoto, `EMPTY` = vuoto. In scrittura il backend salva come `null` una stringa di soli spazi e rifiuta con 422 un `SelectValue` con `code` vuoto: i dati salvati non contengono mai questi casi.
- `EQ` / `IN` confrontano i **codici** (`SelectValue.code`); su un `MULTISELECT` sono veri se **almeno un** codice coincide. `NEQ` è vero anche se il campo è vuoto.
- `all: []` è vero, `any: []` è falso.
- **flowId dello stesso gruppo ripetibile** dell'occorrenza → si valuta **sulla stessa riga** (v0.1.1).
- **flowId di un gruppo ripetibile diverso** (oppure citato da un'occorrenza non ripetibile) → la condizione elementare è vera se è vera su **almeno una riga** di quel gruppo: `FILLED` = almeno una riga compilata; `EQ`/`IN` = almeno una riga con quel codice; `EMPTY` = nessuna riga compilata; `NEQ` = nessuna riga con quel codice. Caso reale: ILIAD, Forecast Ottenimento "Nome ente" (gruppo ENTE) visibile "se Vincoli è compilato" (gruppo VINCOLI).
- **flowId non ripetibile** → si legge sui valori non ripetibili della pratica.
**Pop-up (v0.1.1):** la regola "pop-up con soli campi PE visibile con PE = SI" (D-33) viaggia come `condition` delle occorrenze del pop-up.
**Coordinate (v0.1.4, corregge la v0.1.1):** negli MD Latitudine e Longitudine sono **due** occorrenze distinte, ciascuna con il proprio flowId e tipo `NUMBER` (decimali WGS84, D-38). Il frontend le mostra affiancate.
**Vincoli (v0.1.1, struttura v0.1.7):** il gruppo ripetibile `VINCOLI` ha righe **fisse** (tabella comune D-35): niente `ADD_ROW` / `REMOVE_ROW`. Ogni riga porta un `constraint` (§5.1) con stato ed ente, senza flowId inventati. Nelle condizioni, `FILLED(<flowId contenitore Vincoli>)` è vero se almeno un vincolo ha uno stato compilato.

**Regola:** la visibilità per condizione la calcola il **frontend** con `condition` sui valori correnti (per reattività). Il backend usa la stessa semantica per `progress` e diagnostica, ma **non rifiuta** una scrittura perché la condizione è falsa: la condizione agisce solo sull'interfaccia e il valore nascosto resta salvato (D-31; v0.1.7, sostituisce "il backend la ricontrolla in scrittura"). L'editabilità la calcola **solo il backend** (vedi §5.2).

## 4. Utente e sessione

```ts
interface MembershipDTO { templateId: TemplateId; group: GroupId; role: RoleId; leader: boolean; }

interface UserDTO {
  id: string; name: string; email: string;
  status: "active" | "invited" | "deactivated";
  isAdmin: boolean;
  memberships: MembershipDTO[];     // una o più coppie (cliente, gruppo, ruolo) (D-19)
  createdAt: string; updatedAt: string;
}
```

- **v0.4.1 (D-173):** `MeDTO` ha anche `mustChangePassword: boolean`. Finché è vero, tutte le `/api/*` rispondono 403 `{ error, code: "CAMBIO_PASSWORD" }`, tranne `GET /api/me`, `POST /api/auth/change-password` e le rotte di NextAuth; il cambio password lo rimette a falso.
- `GET /api/me` → `UserDTO & { canCreate: TemplateId[] }` dell'utente in sessione (v0.1.7: `canCreate` = template in cui può creare pratiche: membership PM, oppure tutti se ADMIN; D-20).
- `GET /api/users` (ADMIN) → `{ items: UserDTO[]; templatesWithoutPmLeader: TemplateId[] }` (v0.1.8; prima `UserDTO[]`).
- `POST /api/users` (ADMIN, invito) `{ name: string; email: string; isAdmin?: boolean; memberships: MembershipDTO[] }` → `UserDTO` (201). `name` ed `email` obbligatori; almeno una appartenenza se `isAdmin` è falso (v0.1.2).
- **v0.5.4:** una modifica utente (PATCH) che lascerebbe **zero ADMIN attivi** (togliere `isAdmin` o disattivare l'ultimo) → 422 `{ error: "Serve almeno un amministratore attivo", code: "LAST_ADMIN" }`; vale anche per l'ADMIN su sé stesso e per il passaggio a "invited"; nome e appartenenze dell'ultimo ADMIN restano modificabili (o2 `3c842d2`).
- `POST /api/users/{id}/resend-invite` (ADMIN, v0.1.11) → `UserDTO`: solo per utenti `invited`, altrimenti 409; annulla il token precedente e rimanda la mail d'invito (D-108).
- `PATCH /api/users/{id}` (ADMIN) `{ name?; status?; isAdmin?; memberships? }` → `UserDTO`; `memberships` sostituisce l'elenco intero (v0.1.2).
- Il backend **rifiuta con 422** le appartenenze con coppia gruppo/ruolo incoerente con la tabella del §2 (v0.1.2).
- **PM leader (v0.1.8, D-101):** 422 anche quando una modifica (disattivazione, appartenenze, leader) lascerebbe senza PM leader attivo un template con pratiche non archiviate. `GET /api/users` restituisce anche `templatesWithoutPmLeader: TemplateId[]` per l'avviso nella gestione utenti: la risposta diventa `{ items: UserDTO[]; templatesWithoutPmLeader: TemplateId[] }`.
- `GET /api/users/assignable?templateId=&role=` → `{ id, name }[]` per i campi utente (D-39). Nei valori dei campi USER/USERS `SelectValue.code` è l'**id dell'utente** (v0.1.7); un utente poi disattivato resta leggibile nei valori già salvati.
- **Lato server (v0.1.1):** o2 espone il servizio importabile `getCurrentUser(): Promise<UserDTO | null>` (pagine server e layout di o3 lo chiamano, D-4). La sessione NextAuth contiene solo `session.user = { id, name, email, isAdmin }`; appartenenze e leader si leggono da `getCurrentUser()`.

## 5. Pratica

### 5.1 Lettura

```ts
interface PraticaSummaryDTO {
  id: string;
  templateId: TemplateId;
  codiceSito: string; nomeSito: string;
  committente: SelectValue; clienteFinale: SelectValue;
  codiceG7: string | null;          // dell'iterazione corrente (D-24)
  iteration: number;                // numero dell'iterazione corrente (1, 2, …)
  statoAttivita: StatoAttivita;
  enabledGroups: GroupId[];         // gruppi abilitati dall'Assegna (+ PM_PERMESSI dalla creazione)
  archived: boolean;
  archivedAt: string | null;        // v0.1.9: istante dell'archiviazione (ISO); null se non archiviata
  originPracticeId: string | null;  // rilavorazione (D-26)
  openAlerts: number;
  progress: Record<GroupId, { filled: number; total: number }>;  // v0.1.1: occorrenze MASTER del gruppo visibili per condizione, esclusi i trasversali
  createdAt: string; updatedAt: string;
}

interface PraticaDetailDTO extends PraticaSummaryDTO {
  revision: number;                                      // v0.1.4; v0.1.7: revisione della PRATICA intera: cresce a ogni modifica (anche resubmit), non riparte con la nuova iterazione
  iterationId: string;                                   // v0.1.7: id interno dell'iterazione mostrata
  templateVersion: string;                               // v0.1.7: versione del template con cui leggere questa iterazione
  statoSource: "AUTO" | "MANUAL";                        // v0.1.7: Stato attività dagli automatismi o da un comando manuale di PM/ADMIN
  manualLocks: string[];                                 // v0.1.7: flowId dei campi calcolati bloccati da una modifica manuale (ComputedDTO.manualOverride)
  transversal: { noteOperative: Partial<Record<GroupId, string>>; fatturabile: "SI" | "NO"; fatturabileManual: boolean; fatturato: "SI" | "NO" | null };
  // v0.3.0 (D-121): noteOperative contiene SOLO i gruppi le cui note l'utente può vedere: il proprio gruppo (o i propri, con più appartenenze sul gestore); tutti per PM leader del gestore e ADMIN. Chiave assente = nota non visibile, "" = visibile ma vuota.
  values: Record<string, FieldValue>;                    // chiave = flowId (valori non ripetibili)
  repeats: Record<string, RepeatRowDTO[]>;               // chiave = RepeatGroupDTO.key
  access: Record<string, OccurrenceAccessDTO>;           // chiave = occurrenceKey; un'occorrenza senza voce è in sola lettura
  repeatAccess: Record<string, { canAddRows: boolean; canRemoveRows: boolean }>; // v0.1.6: chiave = RepeatGroupDTO.key; calcolato dal backend. Le righe con `locked` non si rimuovono in ogni caso; VINCOLI ha sempre false/false (righe fisse)
  actions: PraticaActionsDTO;
  iterations: { id: string; n: number; codiceG7: string | null; createdAt: string; current: boolean }[];   // id: v0.1.7
  alerts: AlertDTO[];                                    // aperti dell'iterazione corrente
}

interface RepeatRowDTO {
  rowId: string;
  values: Record<string, FieldValue>;
  origin?: { repeat: string; rowId: string };            // v0.1.1: riga creata automaticamente da un'altra (es. voce Ente da un vincolo "Presente")
  locked?: boolean;                                      // non rimovibile (es. finché il vincolo d'origine è "Presente")
  warning?: string;                                      // es. "Il vincolo d'origine non è più Presente"
  constraint?: ConstraintValueDTO;                       // v0.1.7: solo nelle righe di VINCOLI
}

interface ConstraintValueDTO { code: string; stato: SelectValue | null; ente: SelectValue | null }   // v0.1.7; code = ConstraintDefDTO.code

type FieldValue =
  | null
  | string                          // TEXT, LONGTEXT, DATE ("YYYY-MM-DD")
  | number                          // NUMBER
  | SelectValue                     // SELECT, USER
  | SelectValue[]                   // MULTISELECT, USERS

interface SelectValue { code: string; otherText?: string }  // code = "ALTRO" quando l'utente usa "Altro"

interface OccurrenceAccessDTO { editable: boolean; reason?: "ARCHIVED" | "PAST_ITERATION" | "MIRROR" | "COMPUTED" | "NOT_MY_GROUP" | "NOT_ASSIGNED" }
// v0.1.7: aggiunto PAST_ITERATION; il backend riporta il PRIMO motivo nell'ordine qui sopra. L'ADMIN supera gruppo e Assegna,
// ma non modifica mirror, pratiche archiviate, iterazioni passate né calcolati con manualOverride = false.

interface PraticaActionsDTO {      // calcolate dal backend per l'utente corrente
  assignableGroups: GroupId[];     // v0.1.1: gruppi verso cui l'utente può fare Assegna
  canAssign: boolean; canChangeStato: boolean; canArchive: boolean; canRestore: boolean;
  canDelete: boolean; canRework: boolean; canResubmit: boolean;
}
```

- `GET /api/practices?templateId=&stato=&archived=&q=&scope=&sort=&page=&from=&to=` → `{ items: PraticaSummaryDTO[]; total: number; page: number; pageSize: number }`
  - Visibilità (v0.1.1): pratiche dei template su cui l'utente ha appartenenze (ADMIN: tutte). `scope=assigned` (default): per PM/Permessi tutte quelle del template, per gli altri gruppi quelle in cui il loro gruppo è in `enabledGroups`; `scope=all`: tutte quelle dei propri template (le non assegnate restano in sola lettura secondo `access`/`actions`).
  - `from`/`to` (v0.3.2, D-129): intervallo sulla **data di creazione** della pratica, `YYYY-MM-DD`, estremi compresi (giorno di Roma); ciascuno facoltativo.
  - `archived` (v0.1.9): `false` se omesso (elenco principale); `true` = sezione Storico / Archivio. Archiviate e non archiviate non si chiedono mai insieme.
  - `sort` (v0.1.1): default `open_first` = non TERMINATO/KO prima, poi `updatedAt` decrescente; ammessi anche `updated_desc`, `created_desc`.
- `GET /api/practices/{id}` → `PraticaDetailDTO` (iterazione corrente).
- `GET /api/practices/{id}/iterations/{n}` → `PraticaDetailDTO` di un'iterazione passata (sempre in sola lettura).
  - **Iterazione passata (v0.1.7):** `values`, `repeats`, `transversal`, `statoAttivita`, `statoSource`, `codiceG7`, `progress`, `templateVersion` e `alerts` (vuoto) sono quelli **di quell'iterazione**; `archived`, `originPracticeId`, `enabledGroups`, `iterations` e `revision` sono quelli **attuali della pratica**. `access` con **ogni occorrenza in sola lettura** e motivo `PAST_ITERATION` (o `ARCHIVED` se la pratica è archiviata, secondo l'ordine dei motivi; v0.4.2, prima era vuoto), `repeatAccess` tutto falso, `actions` tutte false. Le Note Operative dei gruppi non visibili restano escluse.
- **`progress` (v0.1.7, precisa la v0.1.1):** per gruppo, `total` = occorrenze MASTER del gruppo visibili per condizione, esclusi mirror, trasversali e calcolati con `manualOverride = false`; nei gruppi ripetibili si conta ogni riga esistente (nessuna riga = nessun contributo); VINCOLI conta le 11 righe (compilata = stato presente); `filled` = di queste, quelle non vuote.

### 5.2 Scrittura dei campi

`PATCH /api/practices/{id}/fields`

```ts
interface FieldChangeRequest {
  iteration: number;                // deve essere l'iterazione corrente, altrimenti 409
  revision: number;                 // v0.1.4: revisione letta dal client; se nel frattempo è cambiata → 409 (nessuna modifica applicata)
  operationId?: string;             // v0.1.7, vedi §1
  changes: Array<
    | { occurrenceKey: string; flowId: string; value: FieldValue }                    // campo semplice (occurrenceKey: v0.1.7)
    | { occurrenceKey: string; repeat: string; rowId: string; flowId: string; value: FieldValue }   // riga esistente
    | { repeat: string; op: "ADD_ROW"; clientRowKey: string; values?: Record<string, FieldValue> }  // nuova riga con valori iniziali facoltativi (v0.1.7)
    | { repeat: string; op: "REMOVE_ROW"; rowId: string }
    | { repeat: "VINCOLI"; rowId: string; constraint: { stato?: SelectValue | null; ente?: SelectValue | null } }   // v0.1.7
    | { transversal: "noteOperative"; group: GroupId; value: string }   // v0.3.0: nota del gruppo indicato (D-121)
    | { transversal: "fatturabile"; value: "SI" | "NO" }
    | { transversal: "fatturato"; value: "SI" | "NO" | null }        // v0.1.2
  >;
}
interface FieldChangeResponse { practice: PraticaDetailDTO; toasts: ToastDTO[]; createdRows?: Record<string, string> }   // createdRows (v0.1.7): clientRowKey → rowId
interface ToastDTO { kind: "INFO" | "WARNING"; message: string; flowId?: string }      // es. ricalcolo Forecast Ottenimento Permessi (D-42)
```

Il backend: verifica i permessi per ogni occorrenza (gruppo, Assegna ricevuto, mirror, archiviata, iterazione), controlla che `occurrenceKey` sia il MASTER di quel `flowId` (una richiesta che cita un mirror è rifiutata), applica le formule, aggiorna lo Stato attività automatico, scrive lo storico e restituisce la pratica aggiornata, **tutto o niente** (v0.1.7). I `toasts` segnalano un campo calcolato il cui valore è **cambiato** (nessun toast se il ricalcolo dà lo stesso valore). Una modifica non permessa → 403 con corpo `{ error: string; rejected?: string[] }`, dove `rejected` elenca le `occurrenceKey` rifiutate (v0.1.2); per le operazioni di riga (ADD_ROW, REMOVE_ROW, vincoli) la chiave è `repeat:<RepeatGroupDTO.key>`, per i trasversali la loro occurrenceKey (`TRASV.*`) (v0.3.3). Nessuna modifica viene applicata se una è rifiutata.

### 5.3 Comandi

**`operationId` (v0.1.7):** facoltativa nel corpo di ogni comando (per `DELETE` come `?operationId=`), vedi §1.
**Locking ottimistico (v0.1.4):** tutti i comandi che modificano una pratica esistente (`assign`, `stato`, `archive`, `restore`, `resubmit`, `DELETE`) accettano anche `revision: number` nel corpo (per `DELETE` come parametro `?revision=`); se non coincide con quella corrente → 409 `REVISION_CONFLICT` (v0.1.7: con `code` e `currentRevision`), e il client ricarica la pratica.

| Metodo e rotta | Corpo | Risposta | Note |
|---|---|---|---|
| `POST /api/practices/resolve-template` | `{ committente: SelectValue; clienteFinale: SelectValue }` | `{ templateId: TemplateId \| null; candidates: TemplateId[] }` | `null` se serve la scelta manuale (D-16) |
| `POST /api/practices` | `{ templateId; committente; clienteFinale; codiceG7; codiceSito; nomeSito }` | `PraticaDetailDTO` (201) | Solo PM e ADMIN (D-20); Stato attività = CREATA; 422 se il template non ha alcun PM leader attivo (v0.1.8, D-101) |
| `POST /api/practices/{id}/assign` | `{ groups: GroupId[]; note?: string }` | `PraticaDetailDTO` | Notifica in-app + mail (D-21). Data, forecast e note di assegnazione sono campi della sezione PM e si salvano prima con `PATCH /fields`; `note` va nella mail. `groups` ⊆ `actions.assignableGroups`. Nella stessa operazione (v0.1.7) Incarico PE e Incarico VS/AS vuoti ricevono la data del giorno se tra i destinatari c'è UT_PE (D-21) |
| `POST /api/practices/{id}/stato` | `{ stato: StatoAttivita }` | `PraticaDetailDTO` | Solo PM e ADMIN (D-23) |
| `POST /api/practices/{id}/archive` | — | `PraticaDetailDTO` | Solo con TERMINATO o KO |
| `POST /api/practices/{id}/restore` | — | `PraticaDetailDTO` | Solo PM e ADMIN |
| `DELETE /api/practices/{id}` | — | 204 | Solo in CREATA e con **una sola** iterazione (D-27; R-1 D2, provvisorio) |
| `POST /api/practices/{id}/rework` | `{ codiceG7?: string }` | `PraticaDetailDTO` della **nuova** pratica | Rilavorazione (D-26), anche da pratica archiviata (v0.1.7) |
| `POST /api/practices/{id}/resubmit` | `{ codiceG7?: string }` | `PraticaDetailDTO` (nuova iterazione) | Ripresentazione totale (D-25) |

## 6. Liste (Configurazione)

```ts
interface ListDTO {
  listId: string; label: string;
  kind: "CONTROLLED" | "CONFIGURABLE";
  templateId: TemplateId | null;    // null = comune a tutti i gestori
  group: GroupId | null;            // gruppo i cui leader la gestiscono (null = solo ADMIN)
  items: { code: string; label: string; active: boolean; order: number }[];
  editable: boolean;                // calcolato per l'utente corrente
  revision: number;                 // v0.1.7: locking ottimistico come per le pratiche
}
```

- `GET /api/lists?templateId=&group=` → `ListDTO[]`
- `PUT /api/lists/{listId}?templateId=` `{ items; revision }` → `ListDTO` (team leader del gruppo o ADMIN; le liste `CONTROLLED` non sono modificabili, al massimo si cambia l'etichetta). v0.1.7: `revision` diversa → 409 `REVISION_CONFLICT`; un codice già usato in una pratica non si toglie né si cambia (422): si disattiva con `active: false` e i valori salvati restano leggibili; l'etichetta si può correggere (D-106).
- **Soglie degli alert (v0.1.7, D-46):** `GET /api/alert-rules?templateId=` → `AlertRuleConfigDTO[]`; `PUT /api/alert-rules/{ruleId}?templateId=` `{ days; revision }` → `AlertRuleConfigDTO` (GET: chi ha appartenenze sul template e ADMIN; PUT: solo ADMIN). `interface AlertRuleConfigDTO { templateId: TemplateId; ruleId: string; label: string; days: number; unit: "WORKING_DAYS" | "CALENDAR_DAYS"; revision: number }`. Si cambiano solo le soglie, non destinatari né chiusure; la nuova soglia vale per gli alert non ancora emessi.
- **Liste globali (v0.1.1):** `CLIENTE_FINALE` e `COMMITTENTE` hanno `templateId = null` e contengono l'unione dei valori di tutti i gestori più "Altro"; servono a `resolve-template`.
- `GET /api/istat/regioni` · `GET /api/istat/province?regione=` · `GET /api/istat/comuni?provincia=` → `{ code; label }[]`. v0.1.10: 503 `{ error: "Dataset ISTAT non caricato" }` finché il dataset non è importato (R-13); `code` = codice ISTAT.

## 7. Storico e timeline

```ts
interface HistoryEntryDTO {
  id: string; practiceId: string; iteration: number;
  kind: "FIELD" | "ROW_ADD" | "ROW_REMOVE" | "ASSIGN" | "STATO" | "ARCHIVE" | "RESTORE" | "CREATE" | "REWORK" | "RESUBMIT" | "ALERT_OPEN" | "ALERT_CLOSE" | "IMPORT";   // ROW_*: v0.1.2
  flowId?: string; repeat?: string; rowId?: string;
  transversal?: "noteOperative" | "fatturabile" | "fatturato";   // v0.1.7: modifica di un campo trasversale
  noteGroup?: GroupId;              // v0.3.0: gruppo della nota operativa; le voci delle note di gruppi non visibili all'utente NON vengono restituite (D-121)
  oldValue?: FieldValue; newValue?: FieldValue;
  rowSnapshot?: Record<string, FieldValue>;                       // v0.1.7: valori della riga rimossa (ROW_REMOVE)
  source: "USER" | "SYSTEM" | "IMPORT";                           // v0.1.7
  operationId?: string;                                           // v0.1.7: raggruppa le voci di uno stesso salvataggio
  detail?: string;                  // testo leggibile
  userId: string | null; userName: string | null;   // null = sistema (automatismi)
  timestamp: string;
}
```

`GET /api/practices/{id}/history?iteration=&page=&view=` → `{ items: HistoryEntryDTO[]; total: number; page: number; pageSize: number }` (v0.1.2). `view` (v0.1.7, facoltativo): `fields` = storico dei valori (FIELD, ROW_ADD, ROW_REMOVE), `events` = timeline (tutti gli altri tipi); senza `view`, tutto (D-47). La cancellazione di una pratica non ha storico consultabile: resta solo nel log di audit lato server.

## 8. Notifiche e alert (forma di base)

```ts
interface AlertDTO {
  id: string; practiceId: string; iteration: number;
  rule: string;                     // es. "FORECAST_UT", "SOPRALLUOGO", "OFFERTA_ODA" (G §17.10)
  label: string;                    // v0.1.1: testo leggibile prodotto dal backend
  flowId?: string;                  // campo da evidenziare
  repeat?: string; rowId?: string; sectionKey?: string;   // v0.1.7: riga e sezione (es. due cicli ARPA con lo stesso flowId)
  executionStatus: "ACTIVE" | "SUSPENDED" | "SUPERSEDED"; // v0.1.7: SUSPENDED = pratica archiviata; SUPERSEDED = iterazione sostituita. Non è una chiusura
  openedAt: string; dueAt: string | null;
  status: "OPEN" | "CLOSED";
  closedAt?: string; closeMode?: "AUTO" | "MANUAL"; closedBy?: string; closedByName?: string;   // closedBy = id utente (v0.1.2)
  canCloseManually: boolean;        // calcolato per l'utente corrente
}

interface NotificationDTO {
  id: string; createdAt: string; read: boolean;
  kind: "ASSIGN" | "ALERT" | "REMINDER" | "MENTION" | "SYSTEM";
  title: string; body: string;
  link: { practiceId: string; iteration?: number; flowId?: string; occurrenceKey?: string; sectionKey?: string; repeat?: string; rowId?: string } | null;   // porta al punto interessato (v0.1.7: iteration, occurrenceKey, repeat, rowId)
}
```

- `GET /api/notifications?unread=&limit=` → `{ items: NotificationDTO[]; unread: number }` ordinate per `createdAt` decrescente, `limit` predefinito 50, senza paginazione (v0.1.1/v0.1.2) · `PATCH /api/notifications/{id}` `{ read: true }` → `NotificationDTO` · `POST /api/notifications/read-all` (v0.1.1) → `{ items; unread }` aggiornato (v0.3.1). `limit` massimo 200, 400 se non valido; una notifica altrui → 404. La lettura **non** chiude l'alert.
- `POST /api/alerts/{id}/close` `{ operationId? }` → `AlertDTO` (chiusura manuale: team leader competenti e ADMIN, D-46; OFFERTA_ODA: solo leader PM_PERMESSI e ADMIN). v0.1.7: idempotente, un alert già chiuso restituisce 200 con l'`AlertDTO` invariato; un alert chiuso a mano non si riapre da solo. v0.3.5 (D-137): FATTURABILE_KO **non** si chiude con questa rotta (403; `canCloseManually` sempre false): si chiude solo con la decisione su Fatturabile nel PATCH dei campi.

## 9. Statistiche — KPI del primo rilascio (v0.2, D-48, G §17.13)

`GET /api/stats?templateId=&from=&to=` → `StatsDTO`. `templateId` facoltativo (assente = tutti i gestori visibili); `from`/`to` = date `YYYY-MM-DD` del periodo (default: ultimi 30 giorni fino a oggi, ora di Roma). Accesso: PM del template e ADMIN (D-23); per gli altri 403.

```ts
interface StatsDTO {
  period: { from: string; to: string };
  activeTotal: number;                              // pratiche attive = non archiviate e con Stato attività diverso da TERMINATO e KO
  byStato: Record<StatoAttivita, number>;           // pratiche non archiviate, per stato (TERMINATO e KO compresi)
  byTemplate: Partial<Record<TemplateId, number>>;  // attive, per gestore
  byGroup: Record<GroupId, number>;                 // attive in cui il gruppo è in enabledGroups
  byAssignee: { userId: string; name: string; count: number }[];   // attive in cui l'utente compare in un campo USER/USERS (D-39, G §17.11); ordinate per nome, MAI per numero (no classifiche, G §17.13)
  alertsOpen: number;                               // alert OPEN e ACTIVE delle iterazioni correnti
  alertsOverdue: number;                            // di questi, con dueAt già passato ("aperti oltre la data di trigger")
  upcoming: { count: number; items: { practiceId: string; codiceSito: string; templateId: TemplateId; rule: string; label: string; dueAt: string }[] };  // alert OPEN e ACTIVE con dueAt nei prossimi 7 giorni; items al massimo 50, per dueAt crescente
  closedInPeriod: { terminato: number; ko: number };   // pratiche entrate in TERMINATO / KO nel periodo (evento di stato)
  leadTime: { count: number; meanDays: number | null; medianDays: number | null };  // pratiche entrate in TERMINATO nel periodo: giorni di calendario dalla PRIMA Data assegnazione (prima iterazione) all'ULTIMO TERMINATO (pratica intera, risposta C C9)
}
```
I valori dei campi nascosti per condizione contano (D-31). Pratiche archiviate: escluse da `activeTotal`, `byStato`, `byTemplate`, `byGroup`, `byAssignee` e dagli alert; contano in `closedInPeriod` e `leadTime`.

## 10. Carichi di lavoro (v0.2, D-23, G §17.11)

`GET /api/workload?templateId=&group=` → `{ items: WorkloadItemDTO[] }`. Accesso: PM del template e ADMIN per tutti i gruppi; il team leader solo per il proprio gruppo in quel template (D-23); altrimenti 403.

```ts
interface WorkloadItemDTO {
  userId: string; name: string;
  templateId: TemplateId; group: GroupId; role: RoleId;   // l'appartenenza per cui l'utente compare
  activePractices: number;                                 // pratiche attive (§9) in cui compare in un campo USER/USERS del proprio ruolo (D-39)
  byStato: Partial<Record<StatoAttivita, number>>;
}
```
Ordinamento per nome; nessuna classifica (G §17.13). I campi utente con "Nessuno" non contano.

## 11. Export CSV (v0.2, D-48)

`GET /api/export?templateId=&stato=&archived=&q=&from=&to=&scope=` → `text/csv` (allegato `PracticeHub_<TEMPLATE>_<AAAA-MM-GG>.csv`). `templateId` **obbligatorio** (400 senza). Stessi filtri e stessa visibilità dell'elenco (§5.1), compreso `scope` (v0.3.4: default `assigned` come l'elenco; l'export contiene esattamente le pratiche che l'utente vede con quei filtri); iterazione corrente. Accesso (v0.3.2, D-128): ogni utente con un'appartenenza sul template e l'ADMIN; esporta solo le pratiche che vede nell'elenco e solo ciò che vede nella scheda (Note Operative dei soli gruppi visibili); senza appartenenza 403.
- Formato per Excel in italiano: UTF-8 con BOM, separatore `;`, date `gg/mm/aaaa`, decimali con la virgola, menu con l'**etichetta** (testo di "Altro" se usato), utenti con il nome.
- Colonne, in quest'ordine: `ID pratica`, `Iterazione`, `Stato attività`, `Archiviata`, poi **un'occorrenza MASTER per colonna** nell'ordine del template, intestazione `<flowId> <etichetta>` (D-30: etichette uguali restano distinguibili), poi `Note Operative <gruppo>` per ogni gruppo le cui note l'utente può vedere (v0.3.0, D-121), `Fatturabile`, `Fatturato`, poi una colonna per vincolo `Vincolo <etichetta>` con `stato (ente)`.
- Gruppi ripetibili: una colonna per flowId; i valori delle righe uniti con ` | ` nell'ordine delle righe.
- Inclusi i valori dei campi nascosti per condizione (D-31).

## 12. Import (v0.2, D-49, G §17.8)

Solo ADMIN. Due passi: anteprima senza scritture, poi conferma.

`POST /api/import/preview` (multipart: `file` .xlsx, `templateId`) → `ImportPreviewDTO`.
```ts
interface ImportPreviewDTO {
  importId: string;                         // valido 24 h; il file non viene conservato oltre
  templateId: TemplateId;
  columns: { header: string; flowId: string | null; note?: string }[];   // intestazione → campo; null = non riconosciuta
  rows: ImportRowDTO[];
}
interface ImportRowDTO {
  rowIndex: number;                         // riga del foglio (1 = prima riga di dati)
  outcome: "NEW_PRACTICE" | "UPDATE" | "REWORK" | "AMBIGUOUS" | "ERROR";
  practiceId?: string;                      // UPDATE / REWORK: pratica trovata (per REWORK quella d'origine)
  candidates?: PraticaSummaryDTO[];         // AMBIGUOUS: pratiche compatibili, scelta manuale (D-49)
  changes: { flowId: string; label: string; value: FieldValue }[];          // campi VUOTI che verrebbero compilati
  skipped: { flowId: string; label: string; reason: "ALREADY_FILLED" | "INVALID" | "NOT_IMPORTABLE"; detail?: string }[];   // detail (v0.3.6): motivo leggibile, es. "data non riconosciuta: 31/02/2026"  // ALREADY_FILLED: non sovrascrive (D-49)
  errors: string[];                         // es. obbligatori D-38 mancanti per una nuova pratica
}
```
- **Riconoscimento delle colonne:** intestazione uguale al `flowId` (`F012`) oppure all'etichetta dell'MD quando nel template è **unica**; etichette ripetute o sconosciute → `flowId: null` con nota (D-30). Non importabili: campi calcolati, mirror, trasversali, Vincoli, gruppi ripetibili (`NOT_IMPORTABLE`); v0.2.2: il motivo preciso sta nella `note` della colonna (es. "campo calcolato", "mirror: si compila in <gruppo>", "gruppo ripetibile").
- **Abbinamento (D-49):** chiave Codice G7 + Codice Sito + Nome Sito sull'iterazione corrente: una pratica → UPDATE; più pratiche → AMBIGUOUS; sito esistente (Codice Sito + Nome Sito) con G7 nuovo → REWORK (nuova pratica collegata, D-26); nessuna → NEW_PRACTICE.
- Valori convalidati come nel PATCH (§5.2): tipi, liste, date reali; il valore non valido va in `skipped` con INVALID, non blocca la riga.

`POST /api/import/{importId}/commit` `{ operationId; choices?: { rowIndex: number; action: "APPLY" | "SKIP"; practiceId?: string }[] }` → `ImportResultDTO`. Per le righe AMBIGUOUS serve una scelta (`practiceId` o SKIP), altrimenti 422. Ogni riga è una transazione a sé (una riga in errore non annulla le altre); storico e timeline con `source: "IMPORT"` e un evento `IMPORT` (D-47).
```ts
interface ImportResultDTO { created: number; updated: number; reworks: number; skipped: number; failed: { rowIndex: number; error: string }[] }
```

---

## 13. Assistente AI (v0.4.0, D-50, D-165…D-171)

Fonte: `docs/proposte/PROGETTO_ASSISTENTE_AI_v1.md` §8 (versione snella D-166) e `docs/proposte/NOTA_UX_ASSISTENTE_O3.md`. Sola lettura: nessuna rotta di questa sezione modifica dati operativi (pratiche, iterazioni, righe, storico, alert, notifiche, outbox). Tutte le rotte: sessione obbligatoria, utente riletto dal database, `Cache-Control: no-store`.

### 13.1 Stato e impostazioni

```ts
interface AssistantStatusDTO {
  enabled: boolean;              // interruttore ADMIN (D-169) e PH_AI_ENABLED entrambi accesi
  availability: "READY" | "DISABLED" | "UNAVAILABLE";  // UNAVAILABLE = configurazione assente/errata o circuito aperto
  dailyLimit: number;            // D-171
  usedToday: number;
  remainingToday: number;
  resetAt: string;               // ISO, mezzanotte successiva di Roma
  perMinuteLimit: number;
}
interface AssistantSettingsDTO {     // D-169, D-171
  enabled: boolean;
  dailyLimit: number;                // intero 1..100, iniziale 30
  perMinuteLimit: number;            // intero 1..10, iniziale 4
  technicalEnabled: boolean;         // PH_AI_ENABLED (sola lettura): se falso, enabled non ha effetto
  updatedAt: string | null; updatedBy: string | null;   // nome dell'ADMIN
}
```

- `MeDTO.assistant?: AssistantStatusDTO`: assente = assistente non disponibile (il client nasconde "Chiedi"). La lettura di `/api/me` non crea contatori.
- `GET /api/assistant/status` → `AssistantStatusDTO` dell'utente in sessione; nessuna inferenza, nessuna scrittura.
- `GET /api/assistant/settings` (ADMIN) → `AssistantSettingsDTO`.
- `PUT /api/assistant/settings` (ADMIN) `{ enabled?: boolean; dailyLimit?: number; perMinuteLimit?: number }` → `AssistantSettingsDTO`. Effetto immediato su tutte le richieste successive (nessuna cache oltre pochi secondi), evento di audit con valori vecchio → nuovo. Fuori intervallo → 422. Non ADMIN → 403.

### 13.2 Domanda e risposta in streaming

`POST /api/assistant/messages` — corpo JSON (massimo 16 KiB), risposta `application/x-ndjson; charset=utf-8` (una riga JSON per evento, `\n` finale, UTF-8, massimo 16 KiB per riga), senza compressione e senza buffering nel proxy.

```ts
interface AssistantMessageRequest {
  requestId: string;           // UUID generato dal client, per correlazione (nessuna deduplica, D-166)
  conversationId?: string;     // UUID restituito da "start"; assente = nuova conversazione
  text: string;                // trim, 1..2000 caratteri
  context?: {
    page: "list" | "sheet" | "stats" | "other";
    practiceId?: string;       // obbligatorio con "sheet"
    iteration?: number;        // solo con "sheet"
    templateId?: TemplateId;
    listQuery?: PracticeListQuery;   // solo con "list"
  };
}
```

- Il contesto è un suggerimento: non autorizza nulla. Pratica non visibile → 404 indistinguibile da inesistente.
- Una sola domanda in corso per persona: una seconda → 409 `BUSY_USER`.
- Conversazione solo in memoria del server (D-170): scade dopo 15 minuti di inattività o 2 ore, massimo 8 domande. Id sconosciuto o di altri → 404 `CONVERSATION_NOT_FOUND`; scaduto → 409 `CONVERSATION_EXPIRED` (il client offre "Nuova conversazione", nessun reinvio automatico).
- Chiusura della richiesta dal client (Interrompi, chiusura del pannello) → il server ferma la generazione.

```ts
type AssistantEvent = { seq: number } & (      // seq cresce da 1 per domanda
  | { type: "start"; requestId: string; conversationId: string; messageId: string;
      serverNow: string; todayRome: string; timezone: "Europe/Rome" }
  | { type: "status"; phase: "READING" | "ANSWERING"; text: string;      // testo del server, non del modello
      period?: { from: string; to: string } }
  | { type: "source"; index: number; source: AssistantSourceDTO }        // prima dei delta che la citano
  | { type: "facts"; items: AssistantFactDTO[] }
  | { type: "delta"; text: string }                                      // i rimandi [n] = index delle fonti
  | { type: "heartbeat" }                                                // ogni 5 s di silenzio
  | { type: "done"; finishReason: "STOP" | "NO_ANSWER" | "CLARIFY" | "OUT_OF_SCOPE" | "LENGTH";
      answerState: "ANSWER" | "NO_DATA" | "INSUFFICIENT_EVIDENCE" | "PARTIAL" | "CLARIFY" | "OUT_OF_SCOPE";
      asOf: string; readStartedAt: string; truncated: boolean; usage: AssistantStatusDTO }
  | { type: "error"; code: AssistantErrorCode; message: string;          // message in italiano
      retryAfterSeconds?: number; resetAt?: string; requestId: string }
);
```

Un solo evento terminale (`done` oppure `error`), poi nessun altro evento. Chiusura senza terminale → il client mostra "Risposta interrotta". Nessun token di ragionamento, costo o dato del progetto nel browser.

### 13.3 Fonti e fatti

```ts
type AssistantSourceDTO =
  | { kind: "PRACTICE"; practiceId: string; codiceSito: string; nomeSito: string;
      templateId: TemplateId; iteration: number; sectionKey?: string; occurrenceKey?: string;
      flowId?: string; rowId?: string; historyEntryId?: string; label: string; readAt: string }
  | { kind: "LIST"; label: string; query: PracticeListQuery; readAt: string }
  | { kind: "STATS"; label: string; query: StatsQuery; readAt: string }
  | { kind: "WORKLOAD"; label: string; query: { templateId: TemplateId; group?: GroupId }; readAt: string }
  | { kind: "QUERY"; label: string; question: string; readAt: string };  // riapre /assistente con la domanda precompilata
interface AssistantFactDTO {
  key: string; label: string; value: number | null; unit?: string;
  scopeLabel: string; period?: { from: string; to: string }; sourceIndex: number;
}
```

- Le fonti le genera il server dai soli risultati autorizzati; nessun `href`: i collegamenti li costruisce il client dal tipo (scheda: `/pratiche/{id}?iterazione=&sezione=&campo=&riga=` come le notifiche).
- I numeri istituzionali arrivano in `facts`, calcolati dall'app; il testo li descrive ma non li produce.

### 13.4 Errori

Prima dello stream: `{ error, code, requestId?, retryAfterSeconds?, resetAt? }` con lo status indicato; dopo l'apertura: evento `error` con lo stesso `code` (HTTP resta 200).

```ts
type AssistantErrorCode =
  | "UNAUTHENTICATED" | "AUTH_CHANGED"            // 401
  | "NOT_ENABLED" | "ORIGIN_DENIED"               // 403 (spento dall'ADMIN o tecnicamente)
  | "NOT_FOUND" | "CONVERSATION_NOT_FOUND"        // 404
  | "BUSY_USER" | "CONVERSATION_EXPIRED" | "DATA_CHANGED"   // 409
  | "BODY_TOO_LARGE"                              // 413
  | "INVALID_REQUEST" | "QUERY_TOO_BROAD"         // 422 (anche come evento)
  | "QUOTA_USER_MINUTE" | "QUOTA_USER_DAY" | "BUSY"   // 429 (BUSY: concorrenza dello stack piena, retry 2 s)
  | "PROVIDER_QUOTA" | "UNAVAILABLE"              // 503 (Google, l'app funziona)
  | "TIMEOUT"                                     // 504
  | "BLOCKED"                                     // filtro di Google, di norma come evento
  | "INTERNAL";                                   // 500
```

"Nessun dato", "precisazione" e "fuori ambito" sono `done`, non errori. Nessun tetto monetario nell'app (D-167): il budget è sul progetto Google.

## 14. Commenti con menzioni (v0.5.0, D-183, D-184, D-185)

Commenti sotto la pratica, legati all'iterazione in cui sono scritti. **Testo semplice**, mai HTML: il client rende a capo ed elenchi `- `; le menzioni sono dati strutturati, non testo da interpretare. Li legge **chiunque vede la pratica** (D-185); le Note Operative restano per gruppo (D-121). Pratica non visibile → 404 come inesistente.

```ts
type CommentMention =
  // v0.5.2: label comprende la "@" ("@UT/PE", "@tutti", "@Nome Cognome"); la ricalcola il server
  | { kind: "group"; id: GroupId; label: string }      // tutto il gruppo sul cliente della pratica
  | { kind: "all"; label: string }                     // tutti gli utenti attivi con un'appartenenza sul cliente
  | { kind: "user"; id: string; label: string };       // persona attiva che vede la pratica
interface CommentDTO {
  id: string; practiceId: string; iteration: number;
  parentId: string | null;                 // null = commento; altrimenti id del commento principale (un solo livello)
  author: { id: string; name: string };
  body: string;                            // testo semplice, max 10.000 caratteri; "" se eliminato
  mentions: CommentMention[];              // max 20, ricontrollate dal server
  createdAt: string; editedAt: string | null;
  deleted: boolean; deletedByName?: string; // "Commento eliminato da …"
  canEdit: boolean; canDelete: boolean;    // autore modifica; autore o ADMIN elimina (D-185)
  replies: CommentDTO[];                   // solo nei commenti principali
}
interface CommentListResponse { items: CommentDTO[]; canComment: boolean; reason?: "ARCHIVED" | "PAST_ITERATION" }
interface CommentCreateRequest { body: string; mentions: CommentMention[]; parentId?: string; operationId?: string }
interface CommentUpdateRequest { body: string; mentions: CommentMention[]; operationId?: string }
interface MentionableDTO {               // candidati per il menu "@", senza email
  groups: { id: GroupId; label: string }[]; all: { label: string };
  people: { id: string; name: string; groups: GroupId[] }[];
}
```

- `GET /api/practices/{id}/comments?iteration=&all=` → `CommentListResponse` (default: iterazione corrente; `all=1` tutte le iterazioni).
- `POST /api/practices/{id}/comments` `CommentCreateRequest` → `CommentDTO` (201). Solo sull'iterazione corrente di una pratica non archiviata (altrimenti 409 con `code` `ARCHIVED`/`PAST_ITERATION`); scrive chiunque vede la pratica, anche se il suo gruppo non è abilitato. Testo vuoto o menzione non valida → 422.
- `PATCH /api/practices/{id}/comments/{commentId}` `CommentUpdateRequest` → `CommentDTO`. Solo l'autore (403); le versioni precedenti restano salvate sul server; `editedAt` valorizzato. Commento eliminato → 409 `code: "DELETED"` (v0.5.1). Link della mail e della notifica: `/pratiche/{id}?iterazione={n}&commento={commentId}`.
- `DELETE /api/practices/{id}/comments/{commentId}?operationId=` → 204. Autore o ADMIN; cancellazione logica (le risposte restano).
- `GET /api/practices/{id}/mentionable` → `MentionableDTO`.
- **Notifiche:** `NotificationDTO.kind = "MENTION"`, una per destinatario e commento, mai all'autore; in una modifica solo le menzioni nuove; solo a chi vede la pratica. `link` ha in più `commentId?: string`. **Mail** a ogni menzione (D-185), subito (non solo in orario lavorativo), **senza il testo del commento** ("X ti ha menzionato sulla pratica Y" + collegamento).
- **Storico:** `HistoryEntryDTO.kind` aggiunge `"COMMENT_ADD" | "COMMENT_EDIT" | "COMMENT_DELETE"`, senza testo (autore e ora).
- Esclusi da export CSV, import e assistente (v1); inclusi nelle copie e nell'azzeramento "solo pratiche" (A13).

## 15. Andamento e profilo Direzione (v0.6.0, D-191, D-192)

Progetto: `docs/proposte/PAGINA_ANDAMENTO_v1.md`; UX: `docs/proposte/NOTA_UX_ANDAMENTO_O3.md`. **Mai nomi né id di persone** nelle risposte di questa sezione.

### 15.1 Interruttore
- Variabile d'ambiente `PH_ANDAMENTO=true`; assente o diversa = **spento** (default).
- `MeDTO.features: { andamento: boolean }` e `UserDTO.direzione: boolean` sempre presenti nella risposta (nel tipo facoltativi solo per i dati di prova).
- Spento: `/api/andamento*` → 404; `direzione` nell'invito o nel PATCH utenti (anche solo presente) → 422 `code: "FEATURE_DISABLED"`; un `direzione: true` già nel database non dà nessun permesso; `MeDTO.features.andamento = false` → il frontend nasconde menu, pagina `/andamento` e casella Direzione.
- Spento, il comportamento dell'app è identico a oggi (le prove lo verificano). Si accende con `deploy/.env` + riavvio, dopo la partenza o quando M decide.

### 15.2 Profilo Direzione
- `StoreUserDoc.direzione?: true`; `UserDTO.direzione: boolean`. Si rilegge dal database a ogni richiesta (come stato e appartenenze), **non** nel JWT; cambiarlo incrementa `authVersion`.
- `POST /api/users` (invito) e `PATCH /api/users/{id}` con `{ direzione }`: solo ADMIN. Con `direzione` l'appartenenza non è obbligatoria (come ADMIN); togliere Direzione a chi non ha appartenenze né ADMIN → 422 «Serve almeno un'appartenenza». La Direzione pura non ha l'assistente (`MeDTO.assistant` assente, 403 `NOT_ENABLED`). ADMIN e Direzione insieme: il frontend disattiva la casella; il backend accetta (ADMIN vince).
- **Si somma** alle appartenenze (D-193): i capi sono di solito membri dei gruppi e continuano a lavorare con i permessi delle loro appartenenze; Direzione **aggiunge** soltanto la lettura di Andamento, Statistiche (§9) e Carichi di lavoro (§10) di **tutti** i template e di tutti i gruppi. Non aggiunge scritture, commenti, assistente, export di pratiche, liste né schede di pratiche fuori dalle sue appartenenze (`canSeePractice` non cambia, D-192).
- Rilettura dei permessi (o2, 11/10): l'assistente di chi ha Direzione **e** appartenenze legge statistiche e carichi di **tutti** i template, a interruttore acceso (D-196; spento: solo appartenenze); chi non ha appartenenze né ADMIN non ha l'assistente, a interruttore acceso o spento; una Direzione già salvata vale per il solo controllo «almeno un'appartenenza» anche a interruttore spento (senza dare permessi), e la disattivazione è sempre permessa; `StatsUpcomingItemDTO.canOpen: boolean` (§9, link solo se vero); `AndamentoSettingsDTO.updatedBy` = `null` per chi non è ADMIN; `practiceId` nelle ferme resta anche senza `canOpen` (id opaco, la scheda risponde 404).
- Senza appartenenze (Direzione pura) l'utente ha solo quelle letture. Menu: le voci delle appartenenze più Andamento e Statistiche; la Direzione pura vede Andamento, Statistiche, Notifiche e dopo l'accesso apre `/andamento`.

### 15.3 Rotte (ADMIN o Direzione; altri 403; interruttore spento 404)
- `GET /api/andamento/<blocco>?templateId=&from=&to=&granularity=week|month[&format=csv]` — un endpoint per blocco: `/stati` (`AndamentoStatiDTO`: 12 righe con `gruppoStato`, `candidabile`, `pochiDati`, `perDataDelFatto`; `piuLenti[]` con pari merito; `complessivo` = tempo operativo delle TERMINATE), `/gruppi`, `/flussi`, `/rilavorazioni`, `/scadenze`; forma esatta in `contract.ts` sotto «§15.3 blocchi» (o2 `2af0906`). Predefiniti: tutti i template, ultimi 12 mesi, `month`; 400 su valori non validi. Base comune `AndamentoBaseDTO` (`asOf`, `dataFrom`, `query`, `confronto`, `buckets[]`); durate `AndamentoDurataDTO` in giorni a un decimale, `null` se vuote. Ogni nuova iterazione parte da CREATA; una permanenza conta solo se entrata e uscita sono fuori da operazioni di import. Ogni risposta ha `asOf`, `dataFrom` («dati dal …»), `query` e `confronto { periodoPrecedente, annoPrecedente | null }`.
- `GET /api/andamento/ferme?templateId=&stato=` → `{ soglia, perStato[], perCliente[], items[], truncated }` (al massimo 200 elementi). Elemento: `practiceId`, `codiceSito`, `nomeSito`, `templateId`, `stato`, `gruppoStato`, `since`, `giorni`, `fromImport`, `gruppi` (abilitati), `canOpen`; ordine per giorni decrescenti. Collegamento alla scheda solo se l'utente può già vederla (ADMIN o appartenenza, `canSee` per elemento); altrimenti solo codice e nome (D-192).
- CSV: `&format=csv` sulle stesse rotte (facoltativo `&tabella=` per le tabelle secondarie: `stati` `serie`; `rilavorazioni` `daStato`, `ritorni`; `scadenze` `milestone`), generato dal server: BOM, separatore «;», date gg/mm/aaaa, decimali con la virgola, «sì»/«no», etichette degli stati come l'export delle pratiche; nome `andamento-<blocco>[-<tabella>]_<templateId|tutti>_<da>_<a>.csv` (ferme: `_<oggi>`) da `Content-Disposition`; 400 su `format` o `tabella` non validi. Il CSV delle ferme contiene tutte le ferme, senza il limite di 200. Colonne: consegna di o2 `4945db8`.
- `GET` / `PUT /api/andamento/settings`: `AndamentoSettingsDTO { sogliaFermeGiorni, updatedAt, updatedBy }` (default 30); PUT `{ sogliaFermeGiorni }` intero 1–365, campi in più o fuori intervallo → 422; GET ADMIN e Direzione, PUT solo ADMIN (403), audit `ANDAMENTO_SETTINGS`; in UI dentro Configurazione → Soglie.

- **Assistente (D-198):** strumento `get_andamento { blocco, templateId?, periodo? }` per ADMIN e Direzione a interruttore acceso, stessa porta e cache della pagina; risultato ridotto (ferme ≤ 20 più totale e `nonDatabili`; mai persone); `AssistantSourceDTO.kind` aggiunge `"ANDAMENTO"` con il link a `/andamento` con i filtri (§13). Forma (o2 `f04bdaa`): parametri `blocco`, `templateId?`, `period?`, `granularity?`; serie ≤ 20 secchi, ritorni ≤ 10; mai persone né id di pratica; fonte `{ kind: "ANDAMENTO"; label; blocco; query: AndamentoQueryDTO; readAt }`; istruzioni `ph-assistente-2026-10-11.3`. Domande di prova: `ACCENSIONE_ANDAMENTO.md`.

### 15.4 Regole di calcolo
- **Tempi in giorni di calendario** (ora di Roma; settimana dal lunedì). Giorni lavorativi eventualmente in seguito.
- **Permanenza in uno stato:** da `STATO` a `STATO` successivo, esclusi i `sourceOnly`. Media e mediana sulle permanenze **concluse** nel periodo; quelle in corso a parte (numero ed età). Uno stato è «più lento» solo con almeno 5 passaggi; TERMINATO e KO esclusi.
- **Import:** i passaggi di stato con lo stesso `operationId` dell'evento `IMPORT` non contano; la permanenza iniziale di una pratica importata è aperta a sinistra e non si conta. Le ferme senza passaggi dopo l'import sono «ferme da import, dal …», separate.
- **`autoEventDate`:** gli eventi `STATO` automatici registrano in `structuredDetail.autoEventDate` la data del campo che li ha generati (da subito, anche a interruttore spento). Andamento mostra il tempo «nell'app» e, dove c'è, quello «per data del fatto».
- **Identità dei flussi (o2 `4af298d`):** inizio + entrate + entrateImport + rientri + ripristinate − terminate − ko − archiviate = fine, sul periodo e su ogni secchio; `AndamentoFlussoValoriDTO.archiviate` e `.ripristinate` (sempre presenti). Uscite solo da uno stato aperto (KO → TERMINATO non conta due volte); importate già chiuse né entrate né uscite; uscite dentro un import che aggiorna una pratica esistente contano; prima del primo evento d'archivio vale lo stato opposto a quell'evento.
- **Entrate:** `CREATE` (fonte utente o import, distinte). **Uscite:** `STATO` verso TERMINATO o KO. **Arretrato** a fine secchio ricostruito dagli eventi (ARCHIVE/RESTORE compresi); TERMINATO → altro conta come rientro.
- **Rilavorazioni:** `REWORK`, `RESUBMIT` con lo stato del momento; matrice dei ritorni di stato all'indietro (da → a).
- **Scadenze:** 60 coppie forecast/completamento del catalogo (entro/oltre); forecast originale contro ultimo dallo storico dei valori; alert aperti, scaduti, ripetuti (generazione > 1 o promemoria), tempo medio di chiusura; esclusi SUPERSEDED, SUSPENDED a parte.
- **Tempo per gruppo (D-195):** non esiste un evento di fine lavoro del gruppo (Assegna aggiunge soltanto) e non se ne introduce uno. Due misure: **tempo per partire** = Assegna al gruppo → prima modifica (fonte utente) di un campo del gruppo; **tempo per consegnare** = Assegna → data di completamento delle milestone del gruppo (catalogo forecast/completamento). Il gruppo del campo si ricava dal template, mai dalla persona. Media, mediana e in corso come per gli stati. Precisazioni (o2 `2af0906`, confermate): «consegna» = la **prima** data di completamento di una milestone del gruppo dopo l'Assegna (in pagina: «tempo per la prima consegna»); contano solo le Assegna che aggiungono il gruppo; Assegna dentro un import escluse.
- **Attese esterne e sospensioni** (DINIEGATO, TAR, STAND_BY, D-194): tempi calcolati come gli altri ma mostrati in un riquadro a parte («Attese esterne e sospensioni») e **mai** candidati al «più lento» né sommati alla fase operativa; ogni stato porta `gruppoStato: "OPERATIVO" | "ESTERNO"`. IN_APPROVAZIONE e PROTOCOLLATO restano operativi.
- **Prestazioni:** calcolo al momento in sola lettura; indice `practice_events {kind, timestamp}`; cache di processo di 5 minuti per richiesta uguale; prova con ~5000 pratiche e ~300 mila eventi su database usa e getta; riepiloghi mensili dal worker solo se si superano ~2 s, sempre ricalcolabili dagli eventi.
- **Regole applicate (o2 `b5cb05b`):** archiviate comprese nei tempi, escluse dall'arretrato dalla data dell'archivio; «in corso» = permanenze aperte alla fine del periodo (o adesso), con la loro età; ritorni all'indietro solo tra stati operativi non finali, le riaperture da TERMINATO/KO sono «rientri»; ferme = giorni interi dall'ingresso nello stato attuale, `> soglia`; le pratiche il cui stato attuale non si può datare dagli eventi non spariscono: si contano a parte: `AndamentoFermeDTO.nonDatabili { totale, perStato[] { stato, count } }` (attive, stessi filtri, fuori dagli `items` e indipendenti dalla soglia; o2 `a929215`).
- **Scadenze (o2 `68f7026`):** un completamento conta nel periodo della sua data (del campo, non del salvataggio); «entro» se completamento ≤ ultimo forecast; 60 coppie del catalogo, righe ripetibili comprese; «rinviate» = forecast cambiato almeno una volta (valore vecchio non vuoto); `forecastScadutiAperti` = forecast passato senza completamento, iterazione corrente di pratiche attive; alert SUPERSEDED mai contati; scaduti e sospesi = aperti a fine periodo (o adesso).
- **Gruppi (o2 `68f7026`):** righe solo per UT_PE, AIE e DL (PM_PERMESSI è abilitato dalla creazione e non si assegna: i suoi tempi sono quelli degli stati); «per partire» = Assegna → prima modifica utente di un campo del gruppo dopo l'Assegna; Assegna ripetute o dentro un import escluse; `pochiDati` se entrambe le misure hanno meno di 5 conclusi.
- Dopo l'azzeramento «solo pratiche» della partenza, «dati dal …» = data della partenza: nei primi mesi i tempi per stato hanno pochi dati (va detto ai capi).

## Registro delle modifiche al contratto

| Versione | Data | Modifica | Richiesta da |
|---|---|---|---|
| 0.1 | 08/10/2026 | Prima stesura | memoria |
| 0.1.1 | 08/10/2026 | Pop-up (`popup`), condizioni nei gruppi ripetibili valutate sulla riga, Coordinate = una occorrenza LATLON, Vincoli a righe fisse, metadati di riga (`origin`, `locked`, `warning`), `progress` nel Summary, `scope` e `sort` nell'elenco, `assignableGroups`, `AlertDTO.label`, forma di `GET /api/notifications` e `read-all`, liste globali CLIENTE_FINALE e COMMITTENTE, `getCurrentUser()` e forma della sessione | o3 (F0, punti C1–C10) |
| 0.1.2 | 08/10/2026 | `TemplateSummaryDTO` per l'elenco template; corpi di invito e modifica utente; 422 sulle appartenenze incoerenti; valori tipizzati dei trasversali nel PATCH e loro `occurrenceKey`; 403 con `rejected`; history paginata; `ROW_ADD`/`ROW_REMOVE`; `closedBy` + `closedByName`; `limit` nelle notifiche | o2 (B1, punti 1–11) |
| 0.1.3 | 08/10/2026 | `ListRefDTO.parentFlowId` per le cascate ISTAT | o3 (F2) |
| 0.1.4 | 08/10/2026 | `revision` (locking ottimistico) in `PraticaDetailDTO`, `FieldChangeRequest` e comandi; coordinate = due occorrenze `NUMBER` (tolto `LATLON` da `DataType` e `FieldValue`), correzione della v0.1.1 verificata sugli MD | o2 (analisi: R2, B-a) |
| 0.1.5 | 08/10/2026 | `TemplateDTO.occurrences` (lista piatta delle occorrenze, prima mancante); semantica completa delle condizioni (vuoto, NEQ, all/any vuoti, regola "almeno una riga" per i flowId di altro gruppo ripetibile) | o3 (F2) |
| 0.1.6 | 08/10/2026 | `PraticaDetailDTO.repeatAccess` (permesso di aggiungere e rimuovere righe per gruppo ripetibile, deciso dal backend) | o3 (F2) |
| 0.3.6 | 08/10/2026 | `ImportRowDTO.skipped[].detail` (D-138) | o2 (B9) |
| 0.3.5 | 08/10/2026 | FATTURABILE_KO non chiudibile con la chiusura manuale generica (§8, D-137) | revisione alert |
| 0.3.4 | 08/10/2026 | `scope` anche nell'export (default `assigned`), così esporta esattamente l'elenco visto (D-128) | o2 (export) |
| 0.3.3 | 08/10/2026 | Chiavi di `rejected` per le operazioni di riga e i trasversali (§5.2) | o2 (PATCH) |
| 0.3.2 | 08/10/2026 | Filtro `from`/`to` sulla data di creazione in elenco ed export (D-129); export per tutti gli utenti del gestore (D-128) | collaboratore (R-18) |
| 0.3.1 | 08/10/2026 | Risposte di PATCH notifica e read-all; limiti di `limit` (§8) | o2 (notifiche v2) |
| 0.3.0 | 08/10/2026 | **Note Operative per gruppo** (D-121): occorrenze `TRASV.NOTE_OPERATIVE.<GroupId>`, `transversal.noteOperative` come mappa per gruppo filtrata per visibilità, PATCH con `group`, storico con `noteGroup` e filtro di visibilità; export con una colonna per gruppo visibile. Cambio incompatibile con la v0.2 | collaboratore (R-16) |
| 0.2.3 | 08/10/2026 | Ritentativo con la stessa operationId: risposta con lo stato attuale (§1) | o2 (B5b) |
| 0.2.2 | 08/10/2026 | Motivo preciso di NOT_IMPORTABLE nella `note` della colonna (§12) | o3 (F7) |
| 0.2.1 | 08/10/2026 | `ConstraintDefDTO.defaultEnteLabel` | o3 (F6) |
| 0.2.0 | 08/10/2026 | §9 statistiche (KPI D-48), §10 carichi di lavoro, §11 export CSV, §12 import in due passi (D-49) (D-111) | memoria (M1) |
| 0.1.12 | 08/10/2026 | Definizione di "vuoto" estesa a stringhe di soli spazi e codici vuoti; normalizzazione in scrittura (D-110). Casi di prova condivisi in `frontend/tests/fixtures/conditions-cases.json` | o2 (B5a) |
| 0.1.11 | 08/10/2026 | `POST /api/users/{id}/resend-invite` (D-108) | o3 (inventario del cutover) |
| 0.1.10 | 08/10/2026 | 503 delle rotte ISTAT senza dataset; precisato che il codice di una voce di lista non cambia, l'etichetta sì (D-106); `GET /api/alert-rules` leggibile da chi ha appartenenze sul template, `PUT` solo ADMIN | o2 (B6) |
| 0.1.9 | 08/10/2026 | `PraticaSummaryDTO.archivedAt`; default `archived=false` nell'elenco | o3 (sezione Archivio) |
| 0.1.8 | 08/10/2026 | Vincolo "almeno un PM leader": 422 in creazione pratica e nelle modifiche utenti; `GET /api/users` con `templatesWithoutPmLeader` (D-101) | memoria (risposta C, R-1 D3) |
| 0.1.7 | 08/10/2026 | Dall'architettura backend v1 (D-98): 409 con `code`/`currentRevision`; `operationId`; `TemplateDTO.version` e `constraints`, struttura VINCOLI (`ConstraintDefDTO`, `ConstraintValueDTO`, `rowPolicy`, `schemaKind`); `ComputedDTO.manualOverride`; `ListRefDTO.allowNone`; la condizione non vieta la scrittura; `canCreate` in /api/me; id utente come codice nei campi USER/USERS; revisione della pratica intera, `iterationId`, `templateVersion`, `statoSource`, `manualLocks`; motivo `PAST_ITERATION` e ordine dei motivi; semantica dell'iterazione passata e di `progress`; `occurrenceKey` nel PATCH, `ADD_ROW` con valori e `createdRows`, modifica dei vincoli; toast solo a valore cambiato; Assegna compila gli Incarichi; cancellazione con una sola iterazione; rilavorazione da archiviata; `revision` delle liste e codici disattivabili; soglie degli alert per ADMIN; storico con trasversali, `source`, `rowSnapshot`, `view`; alert con riga/sezione/`executionStatus`, link più precisi, chiusura idempotente | memoria (architettura) |
| 0.4.0 | 09/10/2026 | §13 Assistente AI: stato e impostazioni ADMIN (interruttore e limiti, D-169/D-171), `POST /api/assistant/messages` in NDJSON, eventi, fonti, fatti, errori; versione snella senza deduplica né tetto monetario (D-166, D-167); registro solo metadati (D-170) | memoria (progetto del modello potente + nota UX di o3) |
| 0.4.1 | 09/10/2026 | `MeDTO.mustChangePassword` e 403 `CAMBIO_PASSWORD` per il primo ADMIN (D-173, PR-19) | o2 (cutover 3.5) |
| 0.4.2 | 10/10/2026 | Iterazione passata: `access` con ogni occorrenza in sola lettura e motivo `PAST_ITERATION`/`ARCHIVED` invece di vuoto | o3 (prova generale) via o2 (`77506ad`) |
| 0.5.0 | 11/10/2026 | §14 Commenti con menzioni: CommentDTO in testo semplice, menzioni strutturate (gruppo, tutti, persona), rotte, MENTION con `commentId`, mail senza testo, eventi COMMENT_* nello storico (D-183, D-184, D-185) | memoria (studi di o2 e o3) |
| 0.5.1 | 11/10/2026 | Commenti: 409 `DELETED` modificando un commento eliminato; link `?commento=` per aprire la scheda sul commento | o2 (`d81e845`) |
| 0.5.2 | 11/10/2026 | Commenti: l'etichetta delle menzioni comprende la "@" | o3 (prova sull'installazione) |
| 0.5.3 | 11/10/2026 | 422 con `code: "ROW_NOT_FOUND"` per le righe ripetibili inesistenti | o3 (difetto L11) |
| 0.5.4 | 11/10/2026 | Vincolo "almeno un ADMIN attivo" nelle modifiche utente | memoria (rilettura di users-v2) |
| 0.6.0 | 11/10/2026 | §15 Andamento e profilo Direzione dietro interruttore `PH_ANDAMENTO` (spento di default); `autoEventDate` negli eventi STATO; scheda pratica non aperta dalla Direzione in v1 | memoria (D-191, D-192; verifica dati di o2, nota UX di o3) |
| 0.6.1 | 11/10/2026 | Direzione si somma alle appartenenze e vede anche i Carichi di lavoro di tutti i gruppi; link alle ferme con `canSee` per elemento | M (i capi sono interni ai gruppi, D-193) |
| 0.6.2 | 11/10/2026 | Attese esterne e sospensioni (DINIEGATO, TAR, STAND_BY) a parte, fuori dal «più lento» | M (D-194) |
| 0.6.3 | 11/10/2026 | Tempo per gruppo: tempo per partire e tempo per consegnare, nessun nuovo evento | M (D-195) |
| 0.6.4 | 11/10/2026 | Forma implementata: `features`, `direzione` nell'invito, 422 `FEATURE_DISABLED`, `AndamentoSettingsDTO`, Direzione pura senza assistente | o2 (`e999e45`) |
| 0.6.5 | 11/10/2026 | DTO dei blocchi (`contract.ts` §15.3), filtri e predefiniti, `canOpen`, regole di calcolo e «prima consegna» | o2 (`2af0906`) |
| 0.6.6 | 11/10/2026 | Correzioni della rilettura dei permessi: assistente solo sulle appartenenze, Direzione pura e interruttore spento, `canOpen` nelle scadenze delle Statistiche, `updatedBy` solo all'ADMIN | o2 (rilettura avversativa) |
| 0.6.7 | 11/10/2026 | L'assistente dei capi con Direzione legge statistiche e carichi di tutti i template (annulla la correzione 2 della v0.6.6) | M (D-196) |
| 0.6.8 | 11/10/2026 | Flussi: `archiviate`, `ripristinate` e identità esatta dell'arretrato | o2 (`4af298d`, segnalazione di o3) |
| 0.6.9 | 11/10/2026 | Strumento `get_andamento` dell'assistente e fonte ANDAMENTO | M (D-198) |
