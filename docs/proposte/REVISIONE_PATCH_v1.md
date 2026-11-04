# PracticeHub — Revisione avversativa del PATCH dei campi v1

Data: 08/10/2026. Incarico: `docs/coordinamento/PROMPT_REVISIONE_PATCH.md`, D-117.

## 1. Sintesi

**Difetti: 5 ALTA, 5 MEDIA, 1 BASSA. Giudizio: sì dopo le correzioni ALTE.**

Il PATCH non è pronto per collegare il frontend ai dati reali: la conversione delle righe perde metadati necessari alle correzioni D-126, la cascata ISTAT può salvare combinazioni incompatibili, gli ordinal vengono riusati e possono impedire il rilascio dello stato manuale, l'ente unico può essere cancellato e Codice G7 accetta frazioni. Questi sono difetti dell'orchestrazione e dei suoi consumatori attuali, riprodotti attraverso il servizio reale con repository in memoria.

L'infrastruttura delle operazioni incorpora le correzioni M-05/M-06: la ricevuta è ricontrollata nel callback e dopo gli errori, e gli effetti usano `opKey` per attore. Non sono stati trovati nuovi difetti certi di doppia esecuzione o di fuga del contenuto delle Note Operative. Questo non equivale a certificare concorrenza e rollback su Mongo: tutte le prove che richiedono un database sono state saltate.

Il giudizio riguarda la consegna del PATCH. **Il cutover resta subordinato a D-125 e CUTOVER.md**, quindi anche a B7 e al collaudo completo. P-10 distingue l'assenza dell'aggancio eseguibile richiesto al PATCH dal motore degli alert, dichiarato ancora in lavorazione nello STATO.

### Materiale e prove

- Registro letto fino a **D-130**, contratto **v0.3.3**, CUTOVER, STATO e revisione precedente `REVISIONE_MOTORI_v1.md`. Lo STATO identifica la consegna PATCH come **6bed2d6**; si esaminano i file presenti, senza ricostruire quel commit. Il riepilogo della pipeline è nel commento iniziale di `frontend/src/services/practices-v2/fields.ts`.
- Nessun comando git, nessun messaggio ad altre sessioni, nessuna connessione a database, nessuna prova sulla porta 27017. Unico file scritto nel progetto: questo rapporto. Configurazioni e prove aggiuntive sono nella cartella temporanea dell'appendice.
- Suite esistente, da `frontend/`: `yarn vitest run tests/server --config '<temporanea>/existing.config.mjs' --no-cache`, rimuovendo `MONGO_TEST_URL` e `MONGO_RS_TEST_URL` dal processo. **236 prove riuscite, 82 saltate; 19 file riusciti, 3 saltati, 22 totali.** Configurazione equivalente per ambiente, alias, setup e timeout; cache esterna al progetto. In particolare, tutte le **13 prove di fields.test.ts sono saltate**.
- Suite temporanea: **18 prove riuscite**, di cui **14 riproduzioni dei comportamenti errati** riferite a 11 difetti, più **4 controlli positivi**. Le asserzioni delle riproduzioni verificano deliberatamente il risultato errato: il verde non significa conformità.
- Servizio `patchFields`, schema di richiesta, motori e mapper sono reali. Sono sostituiti bootstrap, accesso finale alla scheda e repository; il mapper finale resta reale. La sessione in memoria **non simula isolamento, retry del driver o rollback**. Una guardia blocca `MongoClient.connect()` nelle prove aggiuntive. La prova P06 attraversa anche la vera rotta, `parseBody` e `handle`, con autenticazione e dipendenze simulate.
- L'avvio nel sandbox ha incontrato `spawn EPERM` di esbuild; l'esecuzione con escalation autorizzata è riuscita, con gli stessi vincoli sui database.

## 2. Difetti ordinati per gravità

### P-01 — ALTA — Lo snapshot omette generatedName e arpaOpened: perdita di dati Ente e secondo ciclo ARPA

**File e riga:** `frontend/src/lib/practice/detail.ts:57`, elenco dei metadati a **63–67**. Consumatore: `frontend/src/services/practices-v2/fields.ts:298` e **303**. Effetti: `frontend/src/lib/engines/rows.ts:79` e **129**.

`toEngineRow` copia origin, locked, warning e integrationCheck, ma omette **generatedName** e **arpaOpened**, benché entrambi siano presenti nel documento e nel tipo EngineRowMetadata. È un unico difetto del convertitore con due conseguenze indipendenti.

**Scenario ARPA:** ADD_ROW ARPA INWIT con Ripresentazione `F062 = 2026-10-01` → nasce il figlio e sul padre viene salvato `arpaOpened: true`. Si elimina il figlio, si svuota F062 e lo si ricompila con `2026-10-02` → lo snapshot perde arpaOpened, non trova più il figlio e il PATCH genera **un secondo figlio**. Atteso: una sola apertura automatica nella vita del padre; dopo la rimozione del figlio la ricompilazione non apre un'altra riga.

**Scenario Ente:** PAESAGGISTICO PRESENTE con Soprintendenza genera una riga Ente, `generatedName = "Soprintendenza"`. Si compila `F064 = 2026-10-01`, poi si cambia l'ente del vincolo in COMUNE: la voce lavorata mantiene Soprintendenza e l'avviso, come D-126. Nel salvataggio successivo si scrive manualmente Nome Ente `F063 = "Comune"`, si svuota F064 e si porta il vincolo ad ASSENTE → il convertitore elimina generatedName; il ripiego usa l'ente precedente del vincolo, ora Comune, e classifica il nuovo nome manuale come generato. Il PATCH **elimina la riga appena personalizzata**. Atteso: conservarla sbloccata e con avviso, perché il nome differisce da quello effettivamente generato. Il ROW_REMOVE nello storico permette di ricostruire il testo ma non rende corretta la cancellazione operativa.

**Decisioni violate:** **D-126 M-02/M-03 e §3.2**, D-35, D-93, D-103. Il difetto reintroduce nel consumatore comportamenti già corretti nei motori puri; non si riaprono le decisioni della revisione precedente.

**DIMOSTRATO:** P01a e P01b. P01a verifica il metadato presente nel documento e assente nello snapshot, poi **2 righe ARPA invece di 1**. P01b verifica generatedName presente/omesso e **0 righe Ente invece di 1** dopo la sequenza descritta.

**Correzione proposta:** trasferire anche generatedName e arpaOpened in `toEngineRow`, conservando correttamente null, false e assenza. Verificare il passaggio completo documento → snapshot → motore → documento con entrambe le sequenze, non soltanto chiamando computeRows su snapshot costruiti a mano.

### P-02 — ALTA — ISTAT viene controllato sullo stato intermedio e soltanto sui codici nuovi

**File e righe:** `frontend/src/services/practices-v2/fields.ts:147`, **238**, **269**, **279**; `frontend/src/services/practices-v2/validation.ts:29–31` e **47–52**.

**Scenario 1:** si salva Regione Piemonte `F006 = {code:"01"}`, Provincia Torino `F007 = {code:"201"}`, Comune Agliè `F008 = {code:"001001"}`; poi si cambia soltanto Regione in Lombardia `{code:"03"}` → il PATCH riesce lasciando **Lombardia / Torino / Agliè**. Atteso: 422 per la cascata finale incompatibile, senza effetti.

**Scenario 2:** su una pratica senza Regione, lo stesso batch `[Provincia Torino, Regione Lombardia]` riesce perché il controllo cattura il genitore prima della seconda modifica. Con l'ordine `[Regione Lombardia, Provincia Torino]` la medesima combinazione viene rifiutata. Atteso: stesso 422 in entrambi gli ordini; il criterio è la cascata finale, non la sequenza dell'array.

**Scenario 3:** partendo da Piemonte/Torino, `[Regione Lombardia, Provincia Torino invariata]` riesce anche nell'ordine apparentemente corretto: il codice della Provincia appartiene a `previous`, viene tolto da `codes` e salta la verifica di parentela.

È la stessa lacuna di validazione finale: non si verificano i figli non toccati, si memorizza il genitore intermedio, e l'esenzione dei codici già salvati viene applicata anche alla coerenza geografica. Inoltre il controllo `if (parentCode && ...)` consente un figlio senza genitore; il rapporto non propone uno svuotamento automatico non deliberato.

**Decisioni/sezioni violate:** **D-40**, D-92, D-106; contratto **§3 e §6**, cascata ISTAT; requisito esplicito della revisione: cascata coerente con 422. L'eccezione per codici disattivati già salvati non autorizza una nuova combinazione geografica errata.

**DIMOSTRATO:** P02a, P02b, P02c, con dataset reale importato. P02b verifica sia il successo errato sia il rifiuto della permutazione opposta.

**Correzione proposta:** applicare prima tutte le modifiche al candidato e convalidare poi ogni catena ISTAT interessata, inclusi i discendenti salvati, usando i genitori finali. Separare l'eccezione per i codici già salvati dal controllo obbligatorio della parentela.

### P-03 — ALTA — Gli ordinal eliminati vengono riusati e una nuova integrazione non rilascia il manuale

**File e riga:** `frontend/src/services/practices-v2/fields.ts:146`, assegnazioni a **250** e **314**, cancellazione fisica a **392**. Effetto sul confronto: `frontend/src/lib/engines/state.ts:125`.

**Scenario:** si crea un'integrazione INWIT con ordinal 1 e Richiesta `F055 = 2026-10-05`; il suo evento è il vincente. Si imposta STAND_BY manuale, si elimina la riga in un PATCH e, in un altro PATCH, si aggiunge una nuova integrazione con la medesima data. La riga ha un rowId nuovo, ma `nextOrdinal` guarda solo le righe ancora presenti e le assegna di nuovo **ordinal 1**. Il confronto col manualBaseline non la considera successiva: lo stato resta **STAND_BY/MANUAL**. Atteso: ordinal 2, nuovo evento vincente strettamente successivo, **INTEGRAZIONE_RICHIESTA/AUTO**.

Il problema esiste anche quando viene rimossa soltanto la riga con ordinal massimo e nelle aggiunte SYSTEM. Nel medesimo batch le righe marcate removed restano nella mappa e proteggono il massimo; il difetto si manifesta fra salvataggi distinti dopo la cancellazione fisica.

**Decisioni/sezioni violate:** **D-96** (ordine di inserimento), **D-119/D-126 M-01** (precedenza completa stabile); requisito della revisione: ordinal deciso dal server e mai riusato. Non si propone di allentare il confronto dello stato per compensare un ordine instabile.

**DIMOSTRATO:** P03: rowId diverso, stesso ordinal e STAND_BY/MANUAL persistente. `frontend/tests/server/fields.test.ts:142` commenta «ordinal successivo» ma a **145–146** verifica soltanto rowId e array, non l'ordinal salvato.

**Correzione proposta:** conservare per iterazione/gruppo un massimo assegnato che sopravviva alle rimozioni, incrementato nella stessa transazione e usato sia per ADD_ROW sia per computeRows. Aggiornare la prova esistente per verificare il documento persistito e il rilascio del manuale dopo rimozione/nuova aggiunta.

### P-04 — ALTA — L'ente unico non modificabile può essere azzerato

**File e riga:** `frontend/src/services/practices-v2/fields.ts:210`, scrittura a **213**.

**Scenario:** MONUMENTALE INWIT, ente unico Soprintendenza, PRESENTE e voce Ente generata con quel nome. Il PM invia `{repeat:"VINCOLI", rowId, constraint:{ente:null}}` → la condizione di protezione richiede `n.ente` truthy, quindi null passa; il vincolo perde l'ente predefinito e la riga collegata intatta perde il Nome Ente, ricalcolato a null. Atteso: rifiuto 422 di un cambiamento dell'ente unico, senza effetti; l'ente deve restare Soprintendenza.

**Decisioni/sezioni violate:** **D-99/D-120**, ente unico predefinito; D-103; contratto **§3, ConstraintDefDTO.enteList = null / defaultEnte**; requisito esplicito della revisione «ente unico non modificabile».

**DIMOSTRATO:** P04 attraversa due PATCH: prima genera la voce, poi salva `constraint.ente = null` e `ENTE.F063 = null`.

**Correzione proposta:** quando enteList è null, ammettere soltanto l'ente predefinito invariato, rifiutando anche null prima del CAS. Applicare la stessa protezione per ogni vincolo a ente unico.

### P-05 — ALTA — Codice G7 accetta numeri frazionari

**File e riga:** `frontend/src/lib/practice/normalize.ts:71–73`; consumatore `frontend/src/services/practices-v2/fields.ts:277`. Schema generico: `frontend/src/lib/validators.ts:121`.

**Scenario:** PATCH del MASTER F001 INWIT con `value: 1.5` → schema e normalizzatore lo accettano come numero finito; il campo salva 1.5 e il riepilogo contiene **codiceG7: "1.5"**. Atteso: 422 perché G7 deve essere intero e la rappresentazione del riepilogo deve essere una stringa di cifre. La creazione usa invece uno schema di cifre, quindi il PATCH può rendere invalida un'identità appena creata correttamente.

**Decisioni/sezioni violate:** **D-93.6/D-120**, G7 NUMBER intero; contratto **§5.1/§5.3**. Non si propone di rendere interi tutti i NUMBER: coordinate e altre misure restano decimali.

**DIMOSTRATO:** P05 invia la richiesta attraverso `fieldChangeRequestSchema` e verifica sia il valore nell'iterazione sia il riepilogo persistito.

**Correzione proposta:** aggiungere la validazione semantica di G7 intero nel percorso condiviso di scrittura, identificando il campo tecnico e mantenendo decimali gli altri NUMBER. Preservare lo stesso dominio in creazione, PATCH e comandi che copiano o ricevono G7.

### P-06 — MEDIA — La rotta applica la validazione dei valori prima di visibilità, iterazione e permessi

**File e riga:** `frontend/src/app/api/practices/[id]/fields/route.ts:13`; `frontend/src/lib/validators.ts:114`, **118–123**, **148–152**; emissione dell'errore a `frontend/src/lib/api.ts:33`.

**Scenario:** utente UT INWIT non autorizzato al MASTER Committente F004, richiesta identificabile con iterazione/revisione valide e `value:{code:""}` → `parseBody` produce **422** prima di entrare in patchFields. Atteso: **403 con rejected**, senza dettagli di validazione. Lo stesso corpo, per un utente senza appartenenza a INWIT, produce 422 invece di 404; per ADMIN con iteration 2 mentre la corrente è 1, produce 422 invece di ITERATION_CONFLICT.

Il servizio da solo rispetta la sequenza dichiarata, ma le prove esistenti lo invocano direttamente e non includono questo filtro precedente. Questo rilievo riguarda la validazione semantica di un valore su una modifica identificabile; non chiede di elaborare JSON malformato senza una validazione strutturale minima.

**Decisioni/sezioni violate:** **D-94**, contratto **§5.2** e ordine esplicito del mandato/commento di fields.ts: **404 → ITERATION_CONFLICT → 403 → 422 → REVISION_CONFLICT**. Non è stata dimostrata una fuga di contenuto riservato, ma vengono rivelati esiti di validazione prima del controllo richiesto.

**DIMOSTRATO:** P06 chiama la vera PATCH e osserva 422 nei tre casi descritti, con autenticazione e repository simulati.

**Correzione proposta:** mantenere in ingresso la validazione della struttura necessaria a identificare le modifiche e differire i vincoli sui valori al passo successivo ai controlli del servizio. Aggiungere prove HTTP dell'ordine degli errori, oltre alle prove dirette di patchFields.

### P-07 — MEDIA — rejected dei Vincoli usa la chiave sbagliata

**File e riga:** `frontend/src/services/practices-v2/fields.ts:156`.

**Scenario:** UT INWIT prova a modificare lo stato di un vincolo → 403 con `rejected: [<occurrenceKey del contenitore Vincoli>]`. Atteso dal contratto v0.3.3: **`rejected: ["repeat:VINCOLI"]`**. Il ramo privilegia vincoliOcc.occurrenceKey, usando la chiave contrattuale soltanto se l'occorrenza non esiste; i template validi hanno quella occorrenza. Il frontend che associa l'errore alla tabella tramite repeat:VINCOLI non trova la chiave ricevuta.

**Sezione violata:** **contratto §5.2, v0.3.3**, chiavi dei rifiuti di ADD_ROW, REMOVE_ROW e vincoli.

**DIMOSTRATO:** P07 verifica il 403 con la chiave dell'occorrenza reale invece di repeat:VINCOLI.

**Correzione proposta:** mantenere occurrenceAccess per decidere il permesso, ma emettere repeat:VINCOLI come identificatore del rifiuto strutturato. Verificare il corpo 403 contro tutte le varianti FieldChange del contratto corrente.

### P-08 — MEDIA — L'avviso di integrazione negativa viene emesso anche senza cambiare il forecast

**File e riga:** `frontend/src/lib/engines/formulas.ts:206`.

**Scenario:** INWIT, Protocollo `F051 = 2026-08-01`, integrazione con Richiesta `F055 = 2026-10-06` e Invio `F057 = 2026-10-01`, controllo idoneo. Il delta è negativo e il forecast resta alla base. Ogni PATCH successivo, anche cambiando soltanto Nome Sito, restituisce di nuovo **WARNING sul forecast**, pur lasciando F052 invariato. Atteso: nessun nuovo toast di ricalcolo per un valore invariato; l'avviso richiesto sul delta negativo deve restare disponibile senza essere riproposto come un cambiamento a ogni salvataggio.

**Decisioni/sezioni violate:** **conflitto con D-96** e contratto **§5.2**, toast solo a valore cambiato. **D-85** richiede comunque un avviso sul delta negativo: va preservato, non soppresso indiscriminatamente.

**DIMOSTRATO:** P08 confronta F052 prima/dopo un PATCH estraneo all'integrazione e trova ancora il WARNING.

**Correzione proposta:** emettere il toast coerentemente con il cambiamento del risultato, conservando l'avviso di delta negativo come diagnostica o presentandolo quando cambia la condizione che lo produce. Chiarire con la memoria la presentazione dell'avviso D-85 se occorre estendere il contratto, senza trattare ogni ricalcolo invariato come un nuovo evento.

### P-09 — MEDIA — ADD_ROW già compilato non registra lo storico per ogni valore iniziale

**File e riga:** `frontend/src/services/practices-v2/fields.ts:256`, popolamento dei valori a **233–241**.

**Scenario:** ADD_ROW INTEGRAZIONE con F055 valorizzato → viene registrata una sola voce USER **ROW_ADD**, con oldValue/newValue null e i valori nel rowSnapshot; manca la voce USER **FIELD F055, null → data**. Per più campi iniziali resta sempre una sola voce strutturale. Atteso dal mandato: una voce USER per ogni valore davvero cambiato, oltre all'aggiunta della riga, come già avviene per i campi della creazione pratica.

**Decisione/sezione violata:** **D-47**, contratto **§7** (storico dei valori con vecchio/nuovo), criterio esplicito della revisione «una voce USER per ogni valore davvero cambiato». Gravità MEDIA: il rowSnapshot conserva il contenuto, quindi non si afferma una perdita irreversibile; manca lo storico per campo, con flowId e valori vecchio/nuovo.

**DIMOSTRATO:** P09 trova solo ROW_ADD fra le voci USER e nessuna voce con target.flowId F055. Per confronto, `frontend/src/services/practices-v2/commands.ts:227` registra i valori della creazione con FIELD.

**Correzione proposta:** oltre al ROW_ADD, registrare i valori iniziali non vuoti come FIELD USER con target di riga/flowId e null → valore normalizzato. Mantenere separate le successive modifiche SYSTEM e non creare FIELD per valori vuoti.

### P-10 — MEDIA — L'aggancio B7 è soltanto un commento e il percorso può sempre saltare la riconciliazione

**File e riga:** `frontend/src/services/practices-v2/fields.ts:381–382`; riepilogo a **406**.

**Scenario:** INWIT con Data assegnazione F023 = 2026-09-01 e alert SOPRALLUOGO aperto; il PATCH compila Data sopralluogo F024 = 2026-10-08, campo di chiusura indicato da alert-bindings.json:9 → tra stato e persistenza attraversa soltanto un commento, senza invocare una funzione, un'interfaccia o un controllo. Le scritture possono terminare e la ricevuta può essere commessa senza alcuna riconciliazione; openAlerts viene copiato dal vecchio riepilogo. Atteso per l'aggancio richiesto a questa consegna: un passaggio eseguibile obbligatorio con ctx/session e candidato finale, nel quale B7 realizzi le chiusure della stessa transazione.

**Decisione/requisito violato:** **D-97**, chiusure da compilazione nel salvataggio; mandato della revisione «punto di aggancio […] esiste e non può essere saltato». Lo STATO dichiara B7 in corso: **non si conteggia come ALTA la mancata implementazione di tutto B7**, né si attribuisce alla consegna un motore completo promesso come già finito. Il difetto MEDIA riguarda la garanzia d'integrazione del PATCH.

**DIMOSTRATO:** P10 salva F024, registra tutte le collezioni attraversate dal servizio reale e osserva zero accessi ad alerts, alert_events, notifications o delivery_outbox; il riepilogo resta a openAlerts = 1 e il segnaposto in memoria resta OPEN. L'assenza di qualsiasi chiamata all'aggancio è verificata nel sorgente; **non è una riproduzione end-to-end di un alert reale**, che richiede B7 e replica set.

**Correzione proposta:** introdurre una chiamata obbligatoria alla riconciliazione, con snapshot definitivo e stessa sessione, e usarne l'esito per il riepilogo prima di scrivere la ricevuta. Finché B7 non è pronto, rendere esplicito lo stato dell'integrazione nel collaudo e completarla prima del cutover previsto da D-125.

### P-11 — BASSA — Alcune clientRowKey valide sono considerate duplicate alla prima aggiunta

**File e riga:** `frontend/src/services/practices-v2/fields.ts:144` e **231**.

**Scenario:** prima ADD_ROW con `clientRowKey: "constructor"` → lo schema accetta la stringa, ma createdRows è `{}` e la lettura trova la proprietà ereditata Object.constructor; arriva **422 «clientRowKey ripetuta: constructor»** senza alcuna precedente aggiunta. Lo stesso problema riguarda altre chiavi ereditate, fra cui __proto__. Atteso: normale aggiunta con la mappa createdRows richiesta dal contratto, oppure un dominio esplicitamente ristretto e convalidato prima, se deliberato.

**Sezione violata:** **contratto §5.2**, clientRowKey è una stringa del client per correlare l'aggiunta; non esiste un elenco di nomi riservati.

**DIMOSTRATO:** P11 passa il normale schema e riceve il falso errore di duplicazione.

**Correzione proposta:** usare una mappa senza prototipo o Map e controllare la presenza della chiave propria, serializzando infine il Record della risposta. Non affidare il controllo di duplicazione alla truthiness di proprietà ereditabili.

## 3. Conflitti con decisioni e casi non coperti dal registro

1. **D-126 è già deliberata e i motori sono corretti nei rami interessati; il consumatore perde i metadati.** P-01 non richiede nuove scelte sul nome generato, sulle voci lavorate o sulla cancellazione del figlio ARPA. Richiede che l'orchestrazione preservi informazioni già introdotte dalla correzione precedente.
2. **Ordine di inserimento e stato manuale:** P-03 segnala il conflitto fra ordine stabile richiesto da D-96/D-126 e un ordinal derivato dai soli sopravvissuti. Cambiare la definizione di evento nuovo per compensare il riuso riaprirebbe inutilmente D-119/D-126/D-127.
3. **Avviso D-85 e toast D-96:** P-08 rende concreto il conflitto della presentazione corrente. Le due esigenze possono convivere, ma l'avviso persistente e un toast che segnala un cambiamento non sono necessariamente lo stesso oggetto; eventuali estensioni del DTO passano da D-5.
4. **Storico ADD_ROW:** il mandato di questa revisione chiede esplicitamente una voce USER per valore. Il contratto ammette ROW_ADD ma descrive rowSnapshot per ROW_REMOVE; non dichiara che uno snapshot su ROW_ADD sostituisca tutte le FIELD. P-09 applica quel criterio senza eliminare la voce strutturale.
5. **Modifiche duplicate allo stesso target nel batch:** lo schema ammette più scritture dello stesso campo; applyOne registra i passaggi intermedi. Il registro non precisa se A → B → A in un unico salvataggio debba generare due FIELD oppure nessuna variazione rispetto al dato salvato iniziale. Non conteggiato come ulteriore difetto: occorre fissare l'oracolo prima di scegliere un comportamento.
6. **Stato manuale rilasciato senza cambiare la stringa dello stato:** applyState può cambiare source MANUAL → AUTO con changed=false; fields.ts registra STATO soltanto con change.changed. D-127 disciplina il rilascio, ma il contratto non precisa se il solo cambio di source abbia una propria voce di timeline. Non conteggiato; manca un caso di collaudo esplicito.
7. **Dataset ISTAT assente:** validation.ts:50 salta il controllo con NOT_LOADED, mentre le rotte ISTAT danno 503 per D-106. Il dataset presente rende questo ramo non necessario alle riproduzioni P-02; l'eventuale accettazione di codici non verificati va fissata per gli ambienti non inizializzati. Non è una ragione per cambiare la fonte ufficiale già deliberata.
8. **Transizione della beta:** le rotte GET/POST/DELETE in collisione restano legacy per CUTOVER.md; non sono conteggiate come difetti della consegna PATCH. Il collegamento del frontend e il cutover richiedono il passaggio coordinato stabilito da D-104/D-105/D-125, non modifiche anticipate in questa revisione.

### Controlli senza nuovi rilievi certi

- Replay sequenziale di ADD_ROW con lo stesso attore/operationId/corpo: stessi createdRows e toast, nessuna nuova riga, revisione o voce di storico; riuso con corpo diverso → OPERATION_REUSED (**C01**).
- Il servizio raccoglie tutti i rifiuti prima di normalizzare valori, e un rifiuto lascia invariati valori, revisione, storico e ricevute in memoria (**C02**). Il difetto d'ordine P-06 è nel filtro precedente della rotta.
- ADMIN non supera mirror o computed non modificabile (**C03**); le matrici pure della suite esistente coprono anche archivio, iterazione passata, gruppo e Assegna.
- Note Operative del proprio gruppo: dopo l'abilitazione il PATCH le salva con noteGroup, il dettaglio esclude le note altrui e il loro testo (**C04**). Il filtro dello storico esclude anche le voci legacy senza noteGroup quando PM_PERMESSI non è visibile. rejected dei trasversali espone chiavi richieste, non il testo delle note.
- snapshotAfter ordina per ordinal e include le righe SYSTEM prima di computeFormulas; manualWrites è alimentato dalle scritture esplicite, e fatturabileWritten resta true anche se il valore è invariato. Le condizioni di visibilità non bloccano scrittura o formule, coerentemente con D-31.
- CAS, valori, righe, storico, eventi e ricevuta vengono scritti con la stessa sessione. La proiezione e il dettaglio calcolano progress con la stessa funzione. Non è emerso un percorso di scrittura di questi effetti senza sessione; il rollback effettivo richiede comunque le prove del §4.
- Le correzioni M-04/M-05/M-06 risultano nei consumatori attuali: ripristino con guardia PM leader, replay ricontrollato e opKey per gli indici degli effetti. Le prove concorrenti su Mongo già presenti non sono state eseguite in questa revisione.

## 4. Prove mancanti importanti

1. **Replica set usa-e-getta creato appositamente, porta diversa da 27017:** eseguire fields.test.ts e store.test.ts. Introdurre un errore dopo CAS, dopo aggiornamento dell'iterazione, dopo insert/delete delle righe, durante flush dello storico e prima della ricevuta; verificare assenza di ogni effetto su valori, righe, revisione, riepilogo, storico, eventi, alert, outbox e operations. Le prove pure e il repository in memoria non certificano questo requisito.
2. **Idempotenza del PATCH concorrente:** stesso UUID/attore/corpo, almeno due ADD_ROW già compilati che producono righe SYSTEM e toast; tutti i retry devono riuscire con stessi createdRows/toasts, unica revisione ed effetti. Forzare un retry del callback dopo conflitto; includere corpi diversi con stesso UUID e due attori con UUID uguale.
3. **Round-trip di tutti i metadati EngineRowMetadata:** generatedName null e valorizzato, arpaOpened true, origin con ObjectId, locked false/true, warning e integrationCheck. Aggiungere le sequenze P01a/P01b sui documenti reali. Le prove dei motori costruiscono snapshot completi a mano e non intercettano un convertitore incompleto.
4. **Ordinal persistente:** rimuovere il massimo e aggiungere nel salvataggio successivo; rimuovere tutte le righe e aggiungere; mescolare righe USER e SYSTEM; verificare il documento Mongo e lo stato manuale a parità di data. Rafforzare fields.test.ts:142 che attualmente non verifica l'ordinal.
5. **Cascate ISTAT finali:** permutazioni dell'array di changes; cambio solo del genitore; figlio invariato esplicitamente rispedito; Regione/Provincia svuotate con figli pieni; provincia cambiata con comune salvato; eventuale dataset assente. Ogni rifiuto deve precedere REVISION_CONFLICT e non lasciare effetti.
6. **Validazione semantica specifica:** G7 frazionario e fuori dal dominio dichiarato; ente unico null, altro codice e stesso codice; lista disattivata già salvata rispetto a codice nuovo; utenti disattivati o di template/ruolo diverso, con selezione già salvata e Nessuno esclusivo.
7. **Rotta HTTP reale:** combinazioni di pratica invisibile, iterazione passata, permessi negati e valori invalidi; tutti i rejected, incluse chiavi repeat:VINCOLI e trasversali; archivio e mirror anche per ADMIN. La suite diretta del servizio non basta per P-06.
8. **Storico completo:** FIELD iniziali di ADD_ROW, valori normalizzati invariati senza FIELD, ROW_REMOVE con snapshot, cambi USER e SYSTEM nello stesso batch, Fatturabile NO iniziale → SI manuale → NO forzato con cause separate. Precisare il trattamento dei target duplicati e del solo rilascio MANUAL → AUTO.
9. **Note Operative D-121 nei flussi completi:** utenti con più appartenenze, PM non leader, PM leader di altro template, revoca dell'appartenenza tra primo salvataggio e retry, storico/timeline ed export di iterazioni passate. Non limitarsi a verificare il DTO del dettaglio.
10. **B7 nel PATCH:** usare un alert aperto reale, compilare il campo di chiusura e verificare chiusura/log/riepilogo nella stessa transazione; errore nell'aggancio → rollback anche del campo; retry → nessun secondo episodio/notifica/mail. Il job giornaliero deve usare lo stesso motore delle formule e i metadati persistiti per D-126.
11. **Toast e chiavi client:** ricalcolo con valore invariato e delta negativo persistente; stessi toast nel replay; clientRowKey constructor, toString e __proto__, oltre ai duplicati reali nello stesso batch.

## Appendice — Riproduzioni senza database

Cartella eseguita: `C:/Users/mcracchiolo/AppData/Local/Temp/practicehub-patch-review-b4bca91249e84e588a59f47054f7a8f3`.

Da `frontend/`, con MONGO_TEST_URL e MONGO_RS_TEST_URL assenti:

```powershell
node node_modules/vitest/vitest.mjs run --config '<temporanea>/vitest.config.mjs' --no-cache
```

Risultato finale: **1 file riuscito, 18 prove riuscite**. P01a/P01b → P-01; P02a/P02b/P02c → P-02; P03…P11 → P-03…P-11. C01…C04 sono i controlli positivi. Gli oggetti in memoria esercitano i rami reali e conservano i documenti fra PATCH, ma non sono un sostituto di un test di transazione Mongo.

Sorgente, configurazioni e impronte sono riportati di seguito per consentire la ripetizione senza dipendere dalla conservazione della cartella temporanea.

### vitest.config.mjs

```javascript
export default {
  "root": "C:/Users/mcracchiolo/AppData/Local/Temp/practicehub-patch-review-b4bca91249e84e588a59f47054f7a8f3",
  "cacheDir": "C:/Users/mcracchiolo/AppData/Local/Temp/practicehub-patch-review-b4bca91249e84e588a59f47054f7a8f3/cache",
  "resolve": {
    "alias": {
      "@": "C:/Users/mcracchiolo/Desktop/MEGADASHBOARD-main/frontend/src",
      "vitest": "C:/Users/mcracchiolo/Desktop/MEGADASHBOARD-main/frontend/node_modules/vitest/dist/index.js",
      "mongodb": "C:/Users/mcracchiolo/Desktop/MEGADASHBOARD-main/frontend/node_modules/mongodb/lib/index.js"
    }
  },
  "test": {
    "environment": "node",
    "include": [
      "*.test.ts"
    ],
    "cache": false,
    "testTimeout": 30000
  }
};

```

### existing.config.mjs

```javascript
export default {
  "root": "C:/Users/mcracchiolo/Desktop/MEGADASHBOARD-main/frontend",
  "cacheDir": "C:/Users/mcracchiolo/AppData/Local/Temp/practicehub-patch-review-b4bca91249e84e588a59f47054f7a8f3/existing-cache",
  "resolve": {
    "alias": {
      "@": "C:/Users/mcracchiolo/Desktop/MEGADASHBOARD-main/frontend/src"
    }
  },
  "test": {
    "environment": "jsdom",
    "include": [
      "tests/server/**/*.{test,spec}.ts"
    ],
    "setupFiles": [
      "C:/Users/mcracchiolo/Desktop/MEGADASHBOARD-main/frontend/vitest.setup.ts"
    ],
    "css": false,
    "testTimeout": 30000,
    "hookTimeout": 180000,
    "cache": false
  }
};

```

### patch-review.test.ts

```typescript

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObjectId, MongoClient } from 'mongodb';
import { COMPILED_TEMPLATES } from '@/lib/templates/compiled';
import { buildNewPractice } from '@/lib/store/practice-factory';
import { patchFields } from '@/services/practices-v2/fields';
import { toDetailDTO, toEngineRow } from '@/lib/practice/detail';
import { applyState, deriveAutomaticState } from '@/lib/engines/state';
import { fieldChangeRequestSchema } from '@/lib/validators';
import { PATCH } from '@/app/api/practices/[id]/fields/route';

const ingress = vi.hoisted(() => ({ user: null as any, deps: null as any }));
vi.mock('@/lib/auth', () => ({ auth: async () => null }));
vi.mock('@/lib/auth-v2', () => ({ requireCurrentUser: async () => ingress.user }));
vi.mock('@/services/users-v2', () => ({ storeDeps: async () => ingress.deps }));
vi.mock('@/lib/store/db', async (original) => ({ ...await original<any>(), ensureStoreBootstrapped: async () => undefined }));
vi.mock('@/services/practices-v2/read', () => ({
  getPracticeDetail: async (db: any, user: any) => {
    const s = db.__state;
    return toDetailDTO({ practice:s.practice, iteration:s.iteration, rows:s.rows, iterations:[s.iteration] }, COMPILED_TEMPLATES.INWIT.template, user);
  }
}));

const now=new Date('2026-10-08T07:00:00Z');
const T=COMPILED_TEMPLATES.INWIT.template;
const key=(f:string)=>T.occurrences.find(o=>o.kind==='MASTER'&&o.flowId===f)!.occurrenceKey;
const set=(f:string,value:any)=>({occurrenceKey:key(f),flowId:f,value});
const rowset=(r:any,f:string,value:any)=>({...set(f,value),repeat:r.groupKey,rowId:r._id.toHexString()});
function fixture() {
 const user:any={id:new ObjectId().toHexString(),name:'PM',email:'pm@test.local',status:'active',isAdmin:true,memberships:[],createdAt:'',updatedAt:''};
 const state:any={...buildNewPractice({practiceId:new ObjectId(),iterationId:new ObjectId(),templateId:'INWIT',template:T,
  identity:{codiceG7:'1',codiceSito:'S',nomeSito:'N',committente:{code:'TODOS'},clienteFinale:{code:'INWIT'}},createdBy:null,now}),history:[],events:[],operations:[],calls:[]};
 const idsame=(a:any,b:any)=>a?.toHexString()===b?.toHexString();
 const collections:any={
  practices:{
   findOne:async()=>state.practice,
   findOneAndUpdate:async(f:any,u:any)=>{if(state.practice.revision!==f.revision)return null; Object.assign(state.practice,u.$set);state.practice.revision++;return {revision:state.practice.revision};},
   updateOne:async(_f:any,u:any)=>Object.assign(state.practice,u.$set)
  },
  practice_iterations:{findOne:async()=>state.iteration,countDocuments:async()=>1,updateOne:async(_f:any,u:any)=>Object.assign(state.iteration,u.$set)},
  repeat_rows:{
   find:()=>({toArray:async()=>state.rows.map((r:any)=>({...r,values:{...r.values},metadata:{...r.metadata},...(r.constraint?{constraint:{...r.constraint}}:{})}))}),
   deleteMany:async(f:any)=>{state.rows=state.rows.filter((r:any)=>!f._id.$in.some((id:any)=>idsame(id,r._id)));},
   insertMany:async(d:any[])=>state.rows.push(...d),
   updateOne:async(f:any,u:any)=>Object.assign(state.rows.find((r:any)=>idsame(r._id,f._id)),u.$set)
  },
  lists:{find:()=>({toArray:async()=>[
   {templateId:null,items:[{code:'PRESENTE',label:'Presente',active:true},{code:'ASSENTE',label:'Assente',active:true},{code:'SOPRINTENDENZA',label:'Soprintendenza',active:true},{code:'COMUNE',label:'Comune',active:true}]}
  ]})},
  value_history:{insertMany:async(d:any[])=>state.history.push(...d)},
  practice_events:{insertMany:async(d:any[])=>state.events.push(...d)},
  operations:{findOne:async(f:any)=>state.operations.find((o:any)=>o.actorId===f.actorId&&o.operationId===f.operationId)??null,insertOne:async(d:any)=>state.operations.push(d)}
 };
 const db:any={__state:state,collection:(name:string)=>{state.calls.push(name);if(!collections[name])throw new Error('collezione inattesa '+name);return collections[name];}};
 const client:any={startSession:()=>({withTransaction:async(fn:any)=>fn(),endSession:async()=>{}})};
 const deps={client,db,clock:()=>now};
 const patch=(changes:any[],by=user,extra:any={})=>patchFields(deps,by,state.practice._id.toHexString(),fieldChangeRequestSchema.parse({iteration:1,revision:state.practice.revision,changes,...extra}));
 return {state,user,deps,patch};
}
beforeEach(()=>{vi.spyOn(MongoClient.prototype,'connect').mockImplementation(()=>{throw new Error('NESSUNA CONNESSIONE DB CONSENTITA');});});
describe('riproduzioni del comportamento errato osservato',()=>{
 it('P01a: arpaOpened persistito sparisce dallo snapshot e un figlio eliminato si riapre',async()=>{
  const x=fixture();
  await x.patch([{repeat:'ARPA',op:'ADD_ROW',clientRowKey:'a',values:{F062:'2026-10-01'}}]);
  let rows=x.state.rows.filter((r:any)=>r.groupKey==='ARPA');
  const parent=rows[0],child=rows[1];
  expect(parent.metadata.arpaOpened).toBe(true);
  expect(toEngineRow(parent).metadata!.arpaOpened).toBeUndefined();
  await x.patch([{repeat:'ARPA',op:'REMOVE_ROW',rowId:child._id.toHexString()}]);
  await x.patch([rowset(parent,'F062',null)]);
  await x.patch([rowset(parent,'F062','2026-10-02')]);
  expect(x.state.rows.filter((r:any)=>r.groupKey==='ARPA')).toHaveLength(2); // atteso 1
 });
 it('P01b: generatedName omesso fa cancellare una voce Ente personalizzata',async()=>{
  const x=fixture(),v=x.state.rows.find((r:any)=>r.constraint?.code==='PAESAGGISTICO');
  const cons=(constraint:any)=>({repeat:'VINCOLI',rowId:v._id.toHexString(),constraint});
  await x.patch([cons({stato:{code:'PRESENTE'},ente:{code:'SOPRINTENDENZA'}})]);
  let e=x.state.rows.find((r:any)=>r.groupKey==='ENTE');
  await x.patch([rowset(e,'F064','2026-10-01')]);
  await x.patch([cons({ente:{code:'COMUNE'}})]);
  e=x.state.rows.find((r:any)=>r.groupKey==='ENTE');
  expect(e.metadata.generatedName).toBe('Soprintendenza');
  expect(toEngineRow(e).metadata!.generatedName).toBeUndefined();
  // Nome scritto a mano nel salvataggio che azzera gli altri dati e toglie PRESENTE.
  await x.patch([rowset(e,'F063','Comune'),rowset(e,'F064',null),cons({stato:{code:'ASSENTE'}})]);
  expect(x.state.rows.filter((r:any)=>r.groupKey==='ENTE')).toHaveLength(0); // atteso nome personalizzato conservato
 });
 it('P02a: cambiare solo Regione conserva Provincia e Comune incompatibili',async()=>{
  const x=fixture();
  await x.patch([set('F006',{code:'01'}),set('F007',{code:'201'}),set('F008',{code:'001001'})]);
  await x.patch([set('F006',{code:'03'})]);
  expect(x.state.iteration.values).toMatchObject({F006:{code:'03'},F007:{code:'201'},F008:{code:'001001'}});
 });
 it('P02b: la coerenza ISTAT dipende dall ordine delle modifiche',async()=>{
  const x=fixture();
  // Provincia di Torino senza genitore ancora applicato: passa, poi Lombardia.
  await x.patch([set('F007',{code:'201'}),set('F006',{code:'03'})]);
  expect(x.state.iteration.values).toMatchObject({F006:{code:'03'},F007:{code:'201'}});
  const y=fixture();
  await expect(y.patch([set('F006',{code:'03'}),set('F007',{code:'201'})])).rejects.toMatchObject({status:422});
 });
 it('P02c: codice ISTAT già salvato evita il controllo anche se il genitore cambia',async()=>{
  const x=fixture();
  await x.patch([set('F006',{code:'01'}),set('F007',{code:'201'})]);
  await x.patch([set('F006',{code:'03'}),set('F007',{code:'201'})]);
  expect(x.state.iteration.values.F007).toEqual({code:'201'});
 });
 it('P03: eliminare e ricreare riusa ordinal e impedisce la fine del manuale',async()=>{
  const x=fixture();
  await x.patch([{repeat:'INTEGRAZIONE',op:'ADD_ROW',clientRowKey:'i',values:{F055:'2026-10-05'}}]);
  const old=x.state.rows.find((r:any)=>r.groupKey==='INTEGRAZIONE');
  const auto=deriveAutomaticState({templateId:'INWIT',values:x.state.iteration.values,repeats:{INTEGRAZIONE:[toEngineRow(old)]}});
  x.state.iteration.stateMeta=applyState(x.state.iteration.stateMeta,auto,{stato:'STAND_BY',actorId:null,at:now}).next;
  await x.patch([{repeat:'INTEGRAZIONE',op:'REMOVE_ROW',rowId:old._id.toHexString()}]);
  await x.patch([{repeat:'INTEGRAZIONE',op:'ADD_ROW',clientRowKey:'new',values:{F055:'2026-10-05'}}]);
  const newer=x.state.rows.find((r:any)=>r.groupKey==='INTEGRAZIONE');
  expect(newer._id.toHexString()).not.toBe(old._id.toHexString());
  expect(newer.ordinal).toBe(old.ordinal);
  expect(x.state.iteration.stateMeta).toMatchObject({stato:'STAND_BY',source:'MANUAL'}); // atteso AUTO
 });
 it('P04: ente unico può essere azzerato e cancella il nome generato',async()=>{
  const x=fixture(),v=x.state.rows.find((r:any)=>r.constraint?.code==='MONUMENTALE');
  await x.patch([{repeat:'VINCOLI',rowId:v._id.toHexString(),constraint:{stato:{code:'PRESENTE'}}}]);
  expect(x.state.rows.find((r:any)=>r.groupKey==='ENTE').values.F063).toBe('Soprintendenza');
  await x.patch([{repeat:'VINCOLI',rowId:v._id.toHexString(),constraint:{ente:null}}]);
  expect(x.state.rows.find((r:any)=>r.constraint?.code==='MONUMENTALE').constraint.ente).toBeNull();
  expect(x.state.rows.find((r:any)=>r.groupKey==='ENTE').values.F063).toBeNull();
 });
 it('P05: Codice G7 frazionario è salvato nel campo e nel riepilogo',async()=>{
  const x=fixture();await x.patch([set('F001',1.5)]);
  expect(x.state.iteration.values.F001).toBe(1.5);
  expect(x.state.practice.currentSummary.codiceG7).toBe('1.5');
 });
 it('P06: la rotta valida i valori prima di 404, iterazione e permessi',async()=>{
  const x=fixture();ingress.deps=x.deps;
  const denied={...x.user,isAdmin:false,memberships:[{templateId:'INWIT',group:'UT_PE',role:'UT',leader:false}]};
  const body={iteration:1,revision:1,changes:[set('F004',{code:''})]};
  const call=()=>PATCH(new Request('http://test/api/practices/'+x.state.practice._id+'/fields',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),{params:{id:x.state.practice._id.toHexString()}});
  ingress.user=denied;
  expect((await call()).status).toBe(422); // atteso 403
  ingress.user={...denied,memberships:[{templateId:'ILIAD',group:'UT_PE',role:'UT',leader:false}]};
  expect((await call()).status).toBe(422); // atteso 404
  ingress.user=x.user;body.iteration=2;
  expect((await call()).status).toBe(422); // atteso 409 ITERATION_CONFLICT
 });
 it('P07: rifiuto dei vincoli usa occurrenceKey anziché repeat:VINCOLI',async()=>{
  const x=fixture(),v=x.state.rows[0],ut={...x.user,isAdmin:false,memberships:[{templateId:'INWIT',group:'UT_PE',role:'UT',leader:false}]};
  await expect(x.patch([{repeat:'VINCOLI',rowId:v._id.toHexString(),constraint:{stato:{code:'PRESENTE'}}}],ut)).rejects.toMatchObject({status:403,extra:{rejected:[T.occurrences.find(o=>o.kind==='MASTER'&&o.repeatGroup==='VINCOLI')!.occurrenceKey]}});
 });
 it('P08: avviso di delta negativo ripetuto con forecast invariato',async()=>{
  const x=fixture();
  await x.patch([set('F051','2026-08-01')]);
  const r=await x.patch([{repeat:'INTEGRAZIONE',op:'ADD_ROW',clientRowKey:'i',values:{F055:'2026-10-06',F057:'2026-10-01'}}]);
  const next=await x.patch([set('F003','Nome diverso')]);
  expect(next.practice.values.F052).toBe(r.practice.values.F052);
  expect(next.toasts.some(t=>t.kind==='WARNING')).toBe(true);
 });
 it('P09: ADD_ROW valorizzato non registra FIELD USER per i valori iniziali',async()=>{
  const x=fixture();
  await x.patch([{repeat:'INTEGRAZIONE',op:'ADD_ROW',clientRowKey:'i',values:{F055:'2026-10-01'}}]);
  expect(x.state.history.filter((h:any)=>h.source==='USER').map((h:any)=>h.kind)).toEqual(['ROW_ADD']);
  expect(x.state.history.some((h:any)=>h.source==='USER'&&h.target.flowId==='F055')).toBe(false);
 });
 it('P10: il salvataggio non attraversa alcun aggancio eseguibile per gli alert',async()=>{
  const x=fixture();x.state.iteration.values.F023='2026-09-01';x.state.practice.currentSummary.openAlerts=1;x.state.alert={status:'OPEN',ruleId:'SOPRALLUOGO'};await x.patch([set('F024','2026-10-08')]);expect(x.state.alert.status).toBe('OPEN');expect(x.state.practice.currentSummary.openAlerts).toBe(1);
  expect(x.state.calls.some((n:string)=>['alerts','alert_events','notifications','delivery_outbox'].includes(n))).toBe(false);
 });
});



describe('robustezza e controlli positivi',()=>{
 it('P11: clientRowKey constructor ammessa dallo schema ma rifiutata come duplicata',async()=>{
  const x=fixture();
  await expect(x.patch([{repeat:'INTEGRAZIONE',op:'ADD_ROW',clientRowKey:'constructor'}])).rejects.toMatchObject({status:422,message:'clientRowKey ripetuta: constructor'});
 });
 it('C01: replay restituisce gli stessi createdRows e toast senza altri effetti',async()=>{
  const x=fixture(),op='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const changes=[set('F051','2026-08-01'),{repeat:'INTEGRAZIONE',op:'ADD_ROW',clientRowKey:'i',values:{F055:'2026-09-20',F057:'2026-09-30'}}];
  const revision=x.state.practice.revision;
  const a=await x.patch(changes,x.user,{operationId:op,revision});
  const count={rows:x.state.rows.length,history:x.state.history.length,events:x.state.events.length,rev:x.state.practice.revision};
  const b=await x.patch(changes,x.user,{operationId:op,revision});
  expect(b.createdRows).toEqual(a.createdRows);expect(b.toasts).toEqual(a.toasts);
  expect({rows:x.state.rows.length,history:x.state.history.length,events:x.state.events.length,rev:x.state.practice.revision}).toEqual(count);
  await expect(x.patch([set('F003','altro')],x.user,{operationId:op,revision})).rejects.toMatchObject({status:409,extra:{code:'OPERATION_REUSED'}});
 });
 it('C02: rifiuto dei permessi raccoglie tutti i rejected e non applica il campo valido',async()=>{
  const x=fixture(),ut={...x.user,isAdmin:false,memberships:[{templateId:'INWIT',group:'UT_PE',role:'UT',leader:false}]};
  const previous=JSON.stringify(x.state.iteration.values);
  await expect(x.patch([set('F002','cambio'),set('F023','data errata'),{transversal:'noteOperative',group:'UT_PE',value:'nota'}],ut)).rejects.toMatchObject({status:403,extra:{rejected:[key('F002'),key('F023'),'TRASV.NOTE_OPERATIVE.UT_PE']}});
  expect(JSON.stringify(x.state.iteration.values)).toBe(previous);expect(x.state.practice.revision).toBe(1);
  expect(x.state.history).toHaveLength(0);expect(x.state.operations).toHaveLength(0);
 });
 it('C03: ADMIN non può scrivere un mirror né un calcolato',async()=>{
  const x=fixture(),mirror=T.occurrences.find(o=>o.kind==='MIRROR')!;
  await expect(x.patch([{occurrenceKey:mirror.occurrenceKey,flowId:mirror.flowId,value:null},set('F074','2026-10-01')])).rejects.toMatchObject({status:403,extra:{rejected:[mirror.occurrenceKey,key('F074')]}});
 });
 it('C04: note non visibili escluse dal dettaglio dopo il salvataggio',async()=>{
  const x=fixture(),ut={...x.user,isAdmin:false,memberships:[{templateId:'INWIT',group:'UT_PE',role:'UT',leader:false}]};
  x.state.practice.enabledGroups.push('UT_PE');
  x.state.iteration.transversal.noteOperative.PM_PERMESSI='riservata';
  const r=await x.patch([{transversal:'noteOperative',group:'UT_PE',value:'propria'}],ut);
  expect(r.practice.transversal.noteOperative).toEqual({UT_PE:'propria'});
  expect(JSON.stringify(r)).not.toContain('riservata');
  expect(x.state.history[0].target).toMatchObject({transversal:'noteOperative',noteGroup:'UT_PE'});
 });
});


```

### Impronte SHA-256 dei file esaminati

| File | SHA-256 |
|---|---|
| frontend/src/services/practices-v2/fields.ts | B6609FED03DF86A9A3297E8E9D6A53190CD65FE6BE3C48C964CE85524BC68C93 |
| frontend/src/services/practices-v2/validation.ts | 0EAE40BD62FE271E667EC78A0DE1B5FF24309EE693D6887AB762C7E41BE90C7E |
| frontend/src/lib/practice/detail.ts | A9D95A569213A8BEE7698F32D4E8934290BCBE22EB2413EA3609191A565BB5EF |
| frontend/src/lib/practice/normalize.ts | 76A39C093B132D0DCFF8B79DD5EF914B6B1E7E88DEA4DDD0E35EBAC6AA3613B7 |
| frontend/src/lib/engines/rows.ts | 2A560AC7CDBE8F29FAA7CE6CC9C58BB7DF215B15B03D48C780431D56E6809AD0 |
| frontend/src/lib/engines/formulas.ts | D68A06B998FA5C16BDD4A96293090E6201C8F7A041D8450D5B604A06F424985F |
| frontend/src/lib/engines/state.ts | 7D1C9BB825806CC0D90627148E14031D137CC5121891D6814FB1FB0327763578 |
| frontend/src/lib/store/transaction.ts | F68A59DA4AEE64DCC7BB17CD986B8509BDA97C19828CD2882DA432C2F71DF4A8 |
| frontend/src/lib/store/oplog.ts | C5276308D03974F6B991C833FA71EB2FD33219E3DBAC594C112EF8BD76BA4593 |
| frontend/src/lib/store/db.ts | 723A6FEC3F12FCC3A94DC0FB605A058D9B46AA427FD8A29A865135408D464110 |
| frontend/src/lib/validators.ts | CC85688A401EFCD7F040E158D66C697C56CA589E3D5C9FEDB4F9FC58CC13FB74 |
| frontend/src/app/api/practices/[id]/fields/route.ts | 98EF3FE4ED5C1476F712397AC3FB16B8D71B1C95D244A228999FB8822352F5D8 |
| docs/coordinamento/DECISIONI.md | EB3C0BF3947ED0D1475A6FEDD1B7396E1721AA5D184C7BF2AA77BEE02CFA6DEA |
| docs/coordinamento/CONTRATTO_DATI.md | FD4361FFED0A5645EE56024DB698A90102800ABFC83A298C61FCF7F989093201 |

