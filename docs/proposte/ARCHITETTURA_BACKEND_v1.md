# PracticeHub — Proposta di architettura backend v1

Data: 08/10/2026. Destinatari: memoria/coordinamento per revisione; o2 per implementazione dopo adozione. **Proposta, non nuovo registro di decisioni.** Le scelte tecniche suggerite e le interpretazioni da confermare sono identificate come tali. Stack invariato: Next.js 14.2.30 App Router, TypeScript, MongoDB 7 e driver 6.9.0, NextAuth v5 Credentials/JWT, Zod, Docker Compose; SMTP/Nodemailer già presente.

Fonti lette: DECISIONI D-1–D-75, RINVII, PIANO, CONTRATTO_DATI famiglia v0.1, verificato fino a v0.1.5, STATO; Guida v8 integrale; sei MD integrali; CSV e report delle liste; ESITO_CONTROLLO_FINALE; CLAUDE e librerie/servizi/route handler attuali. **L'allegato nel prompt resta un segnaposto**, ma è disponibile docs/coordinamento/ANALISI_SERVER_O2.md: è stato letto e confrontato con l'ispezione diretta. Durante il lavoro sono state recepite le nuove decisioni fino a D-75; le indicazioni datate di STATO non prevalgono sul registro/contratto aggiornati. Nessun reset, test online o cambiamento del codice è stato eseguito per questa consegna.

Convenzioni di citazione: **G §n** = Guida canonica in docs/baseline/2026-10-08; **cliente #n Fxxx** = colonna "#" del relativo ASSOCIAZIONI_CAMPI, non riga fisica del file. FV = FASTWEB-VODAFONE nelle tabelle compatte; TIM = TIM/FIBERCOP. Per i trasversali e i Vincoli, la fonte è il preambolo normativo del singolo MD, dove non esiste una riga con id_flusso. I numeri P-1…P-14 in §9 sono riferimenti interni a questa proposta e non nuovi R-n.

## 1. Modello dati, atomicità e sostituzione della beta

### 1.1 Confini applicativi e riuso

Conservare la catena route handler → servizio → repository Mongo → mapper DTO. Separare dal servizio i motori puri: condizioni, accesso, stato, formule e valutazione alert. I motori ricevono template compilato, snapshot dei valori, attore e orologio esplicito; restituiscono modifiche ed eventi, senza aprire connessioni né inviare mail. Le pagine server che chiamano servizi ricevono gli stessi controlli dei route handler (D-3–D-5, D-9; G §9, §17.2).

| Parte attuale verificata | Riuso / sostituzione necessaria |
|---|---|
| lib/db.ts: MongoClient globale, getDb, accessor tipizzati | Riusare connessione; separare setup indici/bootstrap dal seed demo e dal reset. Oggi getDb avvia seed con effetti collaterali. |
| lib/auth.ts e api.ts | Riusare Credentials/JWT, handle, HttpError, parseBody; caricare l'utente attivo dal DB per ogni operazione autorizzata. JWT attuale mantiene role/team del login e non rileva revoche. |
| lib/registry.ts e mappers.ts | Sostituire slug dell'etichetta e deduplica "first wins" con (templateVersion, flowId), master e occorrenze. Il progresso sui 418 campi non descrive i template (D-13). |
| services/practices.ts | Sostituire currentTeam e passaggio esclusivo con enabledGroups e Assegna; eliminare l'indice univoco code per G7. Oggi updateSection scrive audit prima del salvataggio e senza versione. |
| services/notifications.ts | Riusare trasporto mail, rivedere destinatari e persistenza: oggi team globale, esclusione dell'attore e preferenze possono escludere destinatari obbligatori di D-21. |
| services/import.ts e stats.ts | Non adattare automaticamente: import attuale sovrascrive valori e usa G7 come identità; statistiche misurano createdAt→completedAt e currentTeam. Riscrittura B8/B9 su D-48/D-49. |
| auth/password/token e sanitizzazione | Conservare e adattare autorizzazione/identità. Commenti/menzioni restano legacy in attesa R-7; non implementarli nel nuovo modello per deduzione (D-51/D-60/D-68). |
| backend/server.py e backend/tests/backend_test.py | Proxy preview e test online legacy, non motori né suite offline (CLAUDE; D-9). |

### 1.2 Forma dei documenti

Proposta: incorporare soltanto insiemi di dimensione strutturalmente limitata. Separare iterazioni, righe ripetibili, storico ed eventi: D-36/D-47 escludono array illimitati dentro un singolo documento. Un mirror legge lo stesso valore e non genera copie. Nessun indice univoco su G7 (D-24/D-30; G §2G, §6, §17.3).

| Collezione | Documento e relazioni | Indici principali |
|---|---|---|
| practices | _id, templateId, currentIterationId/n, revision, archived/archivedAt, originPracticeId, enabledGroups, currentSummary, createdAt/updatedAt. currentSummary è una proiezione di sito, G7, stato, trasversali e conteggio alert, aggiornata nella stessa transazione. | (templateId,archived,currentSummary.statoAttivita,updatedAt DESC,_id); (enabledGroups,archived,updatedAt DESC); originPracticeId. Nessun unique G7/sito. |
| practice_iterations | _id, practiceId, n, templateVersion, values:{Fxxx:FieldValue}, transversal, stateMeta, formulaMeta, createdAt, closedAt. Valori scalari bounded dai template; row values esclusi. Copia dei dati Core/Secondari per preservare ogni iterazione. | unique(practiceId,n); practiceId; indice non unique sui valori identità necessari all'import. |
| repeat_rows | _id=rowId, practiceId, iterationId, groupKey, ordinal, values:{Fxxx:FieldValue}, metadata, createdAt/updatedAt. metadata per ARPA attivo, valutazione integrazione e collegamento Vincolo→Ente. | unique(iterationId,groupKey,ordinal); (iterationId,groupKey,_id); metadata.sourceConstraintRowId dove pertinente. |
| value_history | _id, operationId, changeIndex, practiceId, iterationId/n, templateVersion, target:{flowId oppure transversal,groupKey?,rowId?}, oldValue,newValue, actorId/nameSnapshot, source, timestamp, revision. Una entry per variazione effettiva. Rimozione riga registra tutti i valori precedenti e identità della riga. | unique(operationId,changeIndex); (practiceId,iterationId,timestamp DESC,_id); (iterationId,target.flowId,target.rowId,timestamp DESC). **Nessun TTL**. |
| practice_events | _id, operationId,eventIndex, practiceId,iterationId/n, kind, actor, timestamp, structuredDetail, historyEntryIds. Timeline/audit di azioni, assegnazioni, cambi stato, apertura/chiusura alert. | unique(operationId,eventIndex); (practiceId,timestamp DESC,_id); (iterationId,kind,timestamp). Nessun TTL. |
| alerts | _id, practiceId,iterationId,ruleId,subject:{flowId,rowId?,sectionKey}, episodeKey, generation, sourceFingerprint, ruleVersion, calendarVersion, dueLocalDate,dueAt, status, openedAt,closedAt,closeMode,closedBy,closeReason, recipientsSnapshot, nextReminderAt. | unique(episodeKey); (status,dueAt); (practiceId,iterationId,status); (status,nextReminderAt). |
| alert_events | alertId, eventIndex, kind OPEN/REMIND/CLOSE/SUSPEND/RESUME/SKIP_RECIPIENT/DELIVERY, actor, time, destinatari e risultato. Non confondere con notifica letta. | unique(alertId,eventIndex); (alertId,time); nessun TTL. |
| notifications | _id,userId,kind,eventKey,title,body,link:{practiceId,iterationId/n,flowId?,rowId?,sectionKey?},createdAt,readAt. | unique(userId,eventKey); (userId,readAt,createdAt DESC). |
| delivery_outbox | _id,eventKey,userId,channel,payload,status,attempts,nextAttemptAt,leaseUntil,claimToken,lastError,sentAt. Intenzioni mail scritte insieme al comando. | unique(eventKey,userId,channel); (status,nextAttemptAt); leaseUntil. |
| lists | templateId/listId, group,kind,revision, items:{code,label,active,order}[], provenance. Vocabolari limitati; record geografici e utenti esclusi. | unique(templateId,listId), con templateId=null per liste comuni. |
| geographical_units | version,type,code,name,parentCode,active. Snapshot ISTAT locale e versionato, nessuna dipendenza HTTP durante compilazione/salvataggio. | unique(version,type,code); (version,type,parentCode,name). |
| users | _id,email normalizzata,name,passwordHash,status,isAdmin,memberships:[{templateId,group,role,leader}],authVersion,createdAt,updatedAt. Preferenze beta conservate separatamente dalle regole di destinatario. | unique(email); (status,memberships.templateId,memberships.group,memberships.role,memberships.leader), query con $elemMatch sulla stessa appartenenza. |
| templates | _id,templateId,version,baseline,sourceHashes,overrideVersion,compiledDTO,logicalFields,sourceManifest,diagnostics. Snapshot immutabile; nuova versione con nuovo documento. | unique(templateId,version); hash unico del compilato facoltativo. |
| rule_config | templateId,ruleId,version,days,unit,channels,enabled; policy di workflow approvate e parametri ADMIN. Non rendere modificabile il codice delle regole. | unique(templateId,ruleId,version). |
| operations | operationId,actorId,practiceId,requestHash,status,resultReference,createdAt. Deduplica del retry del comando. | unique(actorId,operationId). |
| job_runs / job_locks | jobKey,localDate,status,cursor,attempts,start/end,error; lock con owner,leaseUntil,fencingToken. | unique(jobKey,localDate); unique lock _id. |
| auth_tokens / comments | Conservare token invito/reset con TTL già presente; commenti con practiceId e riferimento iterazione per contestualizzare lo storico. | token unique/expiresAt TTL; (practiceId,iterationId,createdAt). |

Mongo salva ObjectId e timestamp Date UTC; trasporto converte ID in stringa e istanti ISO con fuso. Date operative restano stringhe YYYY-MM-DD validate come date reali; non convertirle in mezzanotte del fuso del server. In tutti i MD #1–#5/F001–F005 rappresentano l'identità visualizzata, non l'identità DB. Gli ID flow sono locali al template e fissati alla versione: F072 ILIAD è Protocollo, F072 FV è Invio AS/VS (D-24/D-30/D-38).

### 1.3 Ripetibilità e trasversali

Tenant, Integrazione, Ente, ODA, ARPA e Vincoli sono righe separate; rowId è ObjectId stabile, ordinal è ordine assegnato dal server, mai indice dell'array ricevuto. Nessun limite di numero di righe di business; paginare le letture e dimensionare i batch per limiti tecnici, senza troncare i valori (D-36; G §15, §17.6; composizione completa §2.6).

Vincoli richiede una struttura speciale: codice vincolo, stato, scelta Ente, sourceConstraintRowId e segnalazione ente scollegato. Non inventare nuovi Fxxx per questi componenti: il flow Vincoli resta il contenitore attestato dall'MD. Preambolo "Tabella Vincoli comune" dei sei MD e D-35 prevalgono sulle lacune del report liste del 07/10. Se Presente, creare una voce Ente collegata a quella riga in modo idempotente. Quando non più Presente, cancellare l'Ente solo se privo di dati operativi; il solo nome predefinito e il collegamento non contano come compilazione. Se ha forecast, parere, esito, protocollo o dati manuali, conservarlo e segnalarlo. Per i vincoli con due possibili enti serve scelta prevista dalla tabella, non deduzione dal nome. Gli stati di Vincoli Ambientali Naturalistici non sono definiti nel preambolo: P-10.

| Vincolo fisso (proposta codice stabile) | Stati attestati | Ente attestato |
|---|---|---|
| MONUMENTALE | PRESENTE / ASSENTE / NON_PERTINENTE | Soprintendenza |
| ARCHEOLOGICO | PRESENTE / ASSENTE / NON_PERTINENTE | Soprintendenza |
| PAESAGGISTICO | PRESENTE / ASSENTE / ASSOLTO | Soprintendenza o Comune |
| PARCO | PRESENTE / ASSENTE / ASSOLTO | Configurabile |
| AEROPORTUALE | PRESENTE / ASSENTE / NON_PERTINENTE | ENAC / ENAV |
| IDROGEOLOGICO | PRESENTE / ASSENTE / NON_PERTINENTE | Comune; nessuno spostamento del blocco Geologica |
| FASCIA_CIMITERIALE | PRESENTE / ASSENTE / NON_PERTINENTE | Comune |
| FASCIA_POZZI | PRESENTE / ASSENTE / NON_PERTINENTE | Comune |
| FASCIA_CORSI_ACQUA | PRESENTE / ASSENTE / NON_PERTINENTE | Comune |
| ALTRO | PRESENTE / ASSENTE / ASSOLTO / NON_PERTINENTE | Configurabile |
| AMBIENTALI_NATURALISTICI | Secondo configurazione comune, non elenco definito | SIC / Natura2000 / Altro |

Fonte: preambolo Tabella Vincoli comune dei sei MD, D-35/D-40; flow contenitore per cliente in §2.6. I codici dei vincoli sono proposta tecnica; l'ALTRO **vincolo nominato** è diverso dal codice ALTRO con testo libero di un qualunque SELECT. Popolare tutti e undici record fissi all'apertura dell'iterazione con stato non compilato, senza dedurre ASSENTE come default non attestato.


Note Operative, Fatturabile e Fatturato sono incorporati nell'iterazione per lo snapshot storico, proiettati in cima alla pratica; Note Operative viene copiata nella nuova iterazione. formulaMeta conserva l'origine delle modifiche e il blocco manuale: default NO non equivale a NO inserito dal PM. ILIAD #121 F104/#122 F105 sono **alias di tracciabilità** dei trasversali, esclusi dalle occorrenze UI e dai valori per flowId; manifest mantiene entrambe le righe originali. Non rinumerare F106–F161 (D-37; G §12/§20.1.10).

### 1.4 Salvataggio e due utenti concorrenti

Proposta: revision monotona **della pratica intera**; ogni PATCH/comando usa revision già introdotta in v0.1.4; proposta di estensione expectedIterationId e operationId. revision è qui globale alla pratica, da esplicitare rispetto alla descrizione contrattuale di revisione dell'iterazione. Controllo atomico compare-and-swap su practices, dentro transazione multidocumento. Un primo utente salva revisione 12→13; il secondo che invia 12 riceve 409, rilegge e decide quali modifiche ripresentare. Nessuna fusione silenziosa neppure fra gruppi: formule, stato e alert dipendono da campi incrociati (D-18/D-41/D-42/D-47; G §17.12).

Pipeline: autenticare e caricare utente → validare richiesta strict Zod → aprire transazione → deduplicare operationId con hash → leggere pratica/iterazione/righe/template → verificare revisione, archivio, iterazione e permessi → applicare tutte le modifiche su snapshot candidato → validare tipi/liste/righe/condizioni secondo §3 → eseguire formule e stato → riconciliare chiusure alert → salvare pratica/iterazione/righe, storico, eventi, notifiche/outbox e ricevuta comando → commit → restituire DTO/toast. Se una modifica fallisce, rollback dell'intero batch. Un errore SMTP non annulla un salvataggio già commesso; l'outbox ritenta.

Creare ID e orologio dell'operazione prima del callback di transazione, perché il driver può ritentarlo; non eseguire SMTP o altre azioni esterne nel callback. Serializzare le scritture sulla stessa sessione. Il driver supporta withTransaction e retry; parallelismo di operazioni dentro la transazione non supportato. [Driver MongoDB 6.x, transazioni](https://www.mongodb.com/docs/drivers/node/v6.x/crud/transactions/).

La lettura composita del dettaglio usa snapshot transazionale oppure lettura revision prima/dopo con retry; altrimenti potrebbe unire summary nuovo e righe vecchie. Anche il job alert acquisisce la revisione pratica nella transazione: archiviazione/ripresentazione concorrenti fanno fallire e rivalutare il job.

**Prerequisito reale:** il Compose attuale avvia Mongo standalone; le transazioni multidocumento richiedono replica set. Proporre replica set mononodo **solo locale/test**, inizializzazione idempotente e healthcheck PRIMARY; per online valutare topologia e disponibilità con M (R-5, P-12). Resta lo stesso database, non un nuovo servizio dati. Non sostituire con sequenze "best effort" che perdono storico. [Requisiti MongoDB](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/).

### 1.5 Iterazioni e comandi strutturali

Ripresentazione totale: nella transazione creare n+1 e nuovo ID, copiare valori Core/Secondari e Tenant esclusi G7, ODA, Note ODA, Stato ODA; mantenere enabledGroups; copiare Note Operative; azzerare sezioni operative, formule/blocchi manuali, Fatturato; Fatturabile=NO, stato=CREATA. G7 facoltativo del comando viene valorizzato solo se presente, senza inventarne uno. Vecchia iterazione e righe restano consultabili in sola lettura; alert precedenti cessano l'esecuzione con motivo ITERATION_SUPERSEDED, senza cancellare il log (D-24/D-25/D-28; G §12, §14, §17.3).

Rilavorazione: nuova pratica con originPracticeId, nuova iterazione 1 e stato CREATA; duplicare soltanto Core senza ODA/Note ODA/Stato ODA, non importare sezioni operative. PM_PERMESSI abilitato dalla creazione; non ereditare le assegnazioni della pratica origine in assenza di requisito (D-22/D-26; G §17.3). L'archiviazione dell'origine e gli eventuali altri vincoli del comando richiedono esplicitazione P-7; l'origine aperta è ammessa da D-26.

Archivio è flag della pratica, non stato attività. Blocca tutte le scritture utente sui dati e l'esecuzione alert fino al ripristino; TERMINATO senza archivio non blocca campi (D-23/D-28; G §10). Conservare snapshot alert sospesi, rivalutare alla riattivazione senza inviare arretrati in raffica (§6). Cancellazione dopo ripresentazione: non scegliere autonomamente fra eliminazione della pratica e conservazione storico; applicare la proposta provvisoria R-1 D2 (una sola iterazione) come configurazione tracciata, P-1.

### 1.6 Reset D-14 e seed demo

Progetto di procedura, **non eseguita**: in ambiente locale esplicitamente identificato, fermare app/job; acquisire conteggi e backup del dataset beta; eseguire dry-run con target e conteggi; applicare reset versionato dell'insieme di collezioni applicative legacy; rimuovere il vincolo unique code; creare indici nuovi; caricare template/liste approvati; seed demo deterministico; registrare schemaVersion e seedVersion; avviare e controllare invarianti. D-69 prescrive script esplicito backup→dry-run→esecuzione e SEED_DEMO=true; non far partire reset/migrazione distruttiva da getDb, Next build o primo login. Ripetere il seed con stessa versione non duplica nulla e non riscrive password/ruoli modificati manualmente.

Proporre utenti demo per ognuno dei sei ruoli e sei template, almeno un PM leader e un leader per gruppo/gestore, più ADMIN e casi multipli di appartenenza; almeno una pratica per gestore e scenari di due iterazioni, G7 ripetuto, rilavorazione, ARPA multiplo, archivio, mirror. Mail dei demo intercettate localmente. I valori mancanti delle liste restano dichiarati, senza persone reali inventate. Il perimetro account/token del reset e l'ambiente reale vanno confermati con M (D-14, R-5/R-6, P-12/P-14). Nessuna prova né scrittura su database online senza via diretto D-9.



## 2. Compilatore dei template B2

### 2.1 Pipeline e artefatti

Compilazione **offline durante sviluppo/build**, senza parsing dei MD nelle richieste. Input: sei MD, vocabolari tecnici, tabella override R-1, binding espliciti formule/stati/alert e CSV dei valori iniziali. Output progettato in src/data/templates/{TEMPLATE}.json con manifest e diagnostica; nessuno di questi file è creato da questa proposta (D-3/D-5/D-12/D-29; G §3/§9/§18).

1. Leggere UTF-8; identificare la tabella Associazioni dalle dieci colonne. Usare parser che rispetta pipe escaped e backtick; distinguere tabella Vincoli e preamboli.
2. Affiancare il riconoscitore a tabella di traduzione curata e DA_TRADURRE validata dalla memoria (D-73); questa sezione ne è proposta di contenuto, non adozione. Costruire SourceOccurrence con template, #, team, sezione, label integrale, dtype, flow, universale, confidenza, nota, condizione. Conservare hash/riga fisica per tracciabilità.
3. Verificare inventario originale e sequenze; applicare override con precondizione hash/#/flow. Fonte cambiata → errore, mai correzione su una riga diversa.
4. Sezioni ordinate dalla prima apparizione; occorrenze ordinate per #, non per Fxxx né alfabeticamente. Chiavi stabili: PM_PERMESSI.CORE, .DATI_SECONDARI, .FASE_PRELIMINARE, .PACCHETTO_PERMESSI, .ITER_AUTORIZZATIVO, .UT_PE, .FATTURAZIONE ove presente; AIE.FASE_AIE, UT_PE.UT, UT_PE.PE, DL.DIREZIONE_LAVORI. Viste Core/Secondari ereditate previste da G §2E/§17.2 referenziano le sezioni PM in sola lettura, senza nuovi master.
5. Risolvere master unico dall'evidenza/override, mai dal Campo Universale o da "prima riga vince"; propagare ownerGroup e tipo ai mirror. Label/condizione restano quelle dell'occorrenza.
6. Scomporre testi misti in condition, computed, list, ownership, repeat e regola alert; normalizzare dtype con override normativi espliciti.
7. Validare grafo dipendenze, produrre TemplateDTO con occurrences piatto, introdotto in v0.1.5; estensioni ancora mancanti proposte in §7.
8. Serializzare deterministicamente con sourceHashes, compilerVersion, overrideVersion e templateVersion immutabile. Runtime usa binding per flowId; label fuzzy vietate.

Inventario: ILIAD 190 occorrenze/161 ID; TOWERNET 133/117; TIM 144/118; INWIT 145/127; FV 124/108; LEONARDO 140/118. Totale **876 occorrenze, 749 ID locali ai template, 304 celle Condizione non vuote e 49 formulazioni distinte**, prima di alias trasversali/esclusioni. Correggere mirror non rinumera ID (D-30; G §18B).

### 2.2 Correzioni R-1 separate dagli MD

Schema suggerito: {templateId,sourceRow,expectedFlowId,expectedSourceHash,patch,sourceDecision,provisional}. ESITO B1–B4 e PIANO B2 definiscono proposte **già utilizzabili provvisoriamente per RINVII R-1**; la risposta di C cambia dati di configurazione. Nessuna modifica agli MD.

| Caso | Riferimenti originali | Risultato provvisorio |
|---|---|---|
| B1 ILIAD | PM #61/F119→AIE #138/F119; #62/F121→#140/F121; #63/F122→#141/F122; #64/F123→#142/F123; #65/F124→#143/F124 | PM MIRROR, AIE MASTER. |
| B1 TOWERNET | PM #37/F037→AIE #89/F037; #38/F038→#90/F038; #39/F039→#91/F039; #40/F040→#92/F040 | PM MIRROR, AIE MASTER. |
| B1 TIM | PM #47/F046→AIE #99/F046; #48/F047→#100/F047; #49/F048→#101/F048; #50/F049→#102/F049 | PM MIRROR, AIE MASTER. |
| B1 INWIT | PM #47/F044→AIE #97/F044; #48/F045→#98/F045; #49/F046→#99/F046; #50/F047→#100/F047 | PM MIRROR, AIE MASTER. |
| B1 FV | PM #42/F041→AIE #79/F041; #43/F042→#80/F042; #44/F043→#81/F043; #45/F044→#82/F044 | PM MIRROR, AIE MASTER. |
| B1 LEONARDO | PM #36/F038→AIE #92/F038; #37/F039→#93/F039 | PM MIRROR, AIE MASTER. Riduzione/Approvazione Riduzione qui assenti: non aggiungerle per analogia. |
| B2 Forecast AIE | TOWERNET PM #36/F036,AIE #80/F036; TIM #46/F045,#90/F045; INWIT #46/F043,#88/F043; FV #41/F040,#70/F040; LEONARDO #35/F035,#81/F035 | PM MASTER, AIE MIRROR. ILIAD #60/#131 F057 già corretto. |
| B3 duplicati UT | TIM master Fase Preliminare #34/F034,#35/F035, altre PM #76/F034,#77/F035; FV master #33/F033,#34/F034, altre PM #61/F033,#62/F034 | ESITO propone eliminazione oppure mirror. Proposta tecnica: conservare seconde PM come MIRROR fino alla scelta memoria/C, senza perdere evidenza. Unica identità dati in entrambi i casi. |
| B4 Invio AS/VS | TIM PM Fase Preliminare #36/F096→UT #115/F096; FV #35/F072→UT #95/F072 | PM MIRROR; TIM tipo DATE ereditato. PM TIM #88/F096 e FV #68/F072 già mirror. |

**Ulteriore incoerenza, fuori B1–B4:** LEONARDO PM #70/F065 Note Assegnazione PE indica master nella nota ma "sola visualizzazione" nella condizione; PE #112/F065 è mirror. Applicando tutto letteralmente, nessun master scrivibile. Non correggere autonomamente: P-5. Un template non si dichiara conforme finché restano collisioni/ownership irrisolte.

### 2.3 ConditionDTO: semantica e binding

Traduzione esplicita, con P sostituito dal flow padre della tabella seguente:
- EQ(P,c) → {flowId: binding(P), op:"EQ", value:c}; NEQ analogo.
- IN(P,codes) → {flowId: binding(P), op:"IN", value:codes}.
- FILLED(P) → {flowId: binding(P), op:"FILLED"}; EMPTY analogo.
- "e" → {all:[…]}, "o" → {any:[…]} solo se attestati. Le celle attuali non attestano ulteriori condizioni composte.
- "Deposito sismico" risolve il flag SELECT, mai la data omonima. Proprietà/Host: TIM #17/F017 e FV #16/F016.
- SELECT confrontato su code; FILLED: null/stringa vuota/array vuoto=false; non introdurre trim semantico diverso da D-74 senza normalizzazione server concordata, numero 0/codice NO=true. NEQ con null=true nella formulazione "non compare se X=Y"; medesima semantica client/server.
- Nei gruppi, FILLED del padre significa **stessa riga**; FILLED(Vincoli) usa la tabella aggregata. La semantica cross-repeat è già deliberata in v0.1.5: FILLED/EQ/IN almeno una riga, EMPTY nessuna compilata, NEQ nessuna con quel codice. VINCOLI strutturato richiede ancora rappresentazione §7.
- Non azzerare campi nascosti; non usare la visibilità per disattivare alert/formule (D-31; G §11).

Esempio concreto: ILIAD #101/F093 Assegnazione PE → {flowId:"F092",op:"EQ",value:"SI"}; TIM #120/F070 mirror PE → {flowId:"F086",op:"EQ",value:"SI"}, con MIRROR separato. ILIAD #82/F074 Note integrazione → {flowId:"F073",op:"FILLED"}, nel rowId corrente.

| Padre | ILIAD | TOWERNET | TIM-FIBERCOP | INWIT | FASTWEB-VODAFONE | LEONARDO |
|---|---|---|---|---|---|---|
| Tipologia sito | #10/F010 | #10/F010 | #10/F010 | #10/F010 | #10/F010 | #10/F010 |
| Gestore Tenant | #20/F020 | #15/F015 | #21/F021 | #18/F018 | #20/F020 | #16/F016 |
| AIE | #55/F052 | assente | #43/F042 | assente | #38/F037 | #32/F032 |
| Parere Arpa | #85/F077 | #52/F052 | #60/F059 | #62/F059 | #52/F051 | #50/F052 |
| Esito parere Arpa | #86/F078 | #53/F053 | #61/F060 | #63/F060 | #53/F052 | #51/F053 |
| Nome Ente | #88/F080 | #56/F056 | #64/F063 | #66/F063 | #55/F054 | #54/F056 |
| PE | #100/F092 | #72/F072 | #78/F086 | #81/F078 | #63/F060 | #68/F063 |
| Regione | #6/F006 | #6/F006 | #6/F006 | #6/F006 | #6/F006 | #6/F006 |
| PSC | assente | assente | assente | assente | #99/F074 | #115/F093 |
| Deposito sismico | #179/F150 | #122/F106 | #133/F107 | #134/F116 | #113/F097 | #129/F107 |
| Revit | #32/F032 | assente | #31/F031 | #32/F031 | assente | assente |
| CARATTERIZZAZIONE | #43/F043 | assente | assente | assente | assente | assente |
| MW | #56/F053 | assente | assente | assente | assente | assente |
| Richiesta integrazione | #81/F073 | #48/F048 | #56/F055 | #58/F055 | assente | #46/F048 |
| Vincoli | #31/F031 | #23/F023 | #30/F030 | #28/F027 | #32/F032 | #24/F024 |
| Committente | #4/F004 | assente | #4/F004 | assente | #4/F004 | #4/F004 |
| ODA | #119/F102 | #13/F013 | #16/F016 | #14/F014 | #15/F015 | #14/F014 |
| All. 18 | assente | assente | assente | assente | assente | #38/F040 |

Inventario completo delle **49 formulazioni non vuote distinte** della colonna Condizione documentata, incluse quelle che descrivono altri comportamenti. Ogni stringa è riportata integralmente e con tutte le occorrenze; cella vuota → condition=null. Norme del preambolo (nessuna condizione Incarico, Geologica sempre visibile, abilitazione AIE dopo Assegna) applicate separatamente (D-29–D-34; G §11/§17.6).

| N. | Formulazione integrale | Traduzione / responsabilità separate | Occorrenze canoniche |
|---:|---|---|---|
| 1 | possibilità di aggiungere più ODA | condition=null; repeatGroup=ODA. | FASTWEB-VODAFONE #15 F015; TOWERNET #13 F013 |
| 2 | compare solo se Proprietà / Host = Inwit | EQ(Proprietà / Host, INWIT) | FASTWEB-VODAFONE #17 F017 |
| 3 | appare solo se viene inserito un valore nel campo “Gestore Tenant” | FILLED(Gestore Tenant), stessa riga TENANT | FASTWEB-VODAFONE #21 F021; FASTWEB-VODAFONE #22 F022; ILIAD #21 F021; ILIAD #22 F022; INWIT #19 F019; INWIT #20 F020; LEONARDO #17 F017; LEONARDO #18 F018; TIM-FIBERCOP #22 F022; TIM-FIBERCOP #23 F023; TOWERNET #16 F016; TOWERNET #17 F017 |
| 4 | compare solo se AIE=SI | EQ(AIE, SI) | FASTWEB-VODAFONE #39 F038; FASTWEB-VODAFONE #40 F039; FASTWEB-VODAFONE #42 F041; FASTWEB-VODAFONE #43 F042; FASTWEB-VODAFONE #44 F043; FASTWEB-VODAFONE #45 F044; ILIAD #57 F054; ILIAD #59 F056; ILIAD #61 F119; ILIAD #62 F121; ILIAD #63 F122; ILIAD #64 F123; ILIAD #65 F124; ILIAD #131 F057; LEONARDO #33 F033; LEONARDO #34 F034; LEONARDO #36 F038; LEONARDO #37 F039; TIM-FIBERCOP #44 F043; TIM-FIBERCOP #45 F044; TIM-FIBERCOP #47 F046; TIM-FIBERCOP #48 F047; TIM-FIBERCOP #49 F048; TIM-FIBERCOP #50 F049 |
| 5 | compare solo se AIE=SI; Alert 2 gg prima; si risolve quando viene compilato il campo “Approvazione AIE” | EQ(AIE, SI); FORECAST_AIE separato (§6) | FASTWEB-VODAFONE #41 F040; ILIAD #60 F057; LEONARDO #35 F035; TIM-FIBERCOP #46 F045 |
| 6 | Forecast manuale; non applicare automaticamente la formula Protocollo + 67 giorni. | condition=null; forecast manuale, nessuna formula Protocollo+67. | FASTWEB-VODAFONE #48 F047; ILIAD #78 F070; TIM-FIBERCOP #53 F052 |
| 7 | compare solo se compilato il campo \`Parere Arpa\` | FILLED(Parere Arpa), stessa riga ARPA | FASTWEB-VODAFONE #53 F052; ILIAD #86 F078; INWIT #63 F060; INWIT #64 F061; LEONARDO #51 F053; LEONARDO #52 F054; TIM-FIBERCOP #61 F060; TIM-FIBERCOP #62 F061; TOWERNET #53 F053; TOWERNET #54 F054 |
| 8 | compare se \`Esito parere Arpa = Negativo\` | EQ(Esito parere Arpa, NEGATIVO), stessa riga ARPA | FASTWEB-VODAFONE #54 F053; ILIAD #87 F079; INWIT #65 F062; LEONARDO #53 F055; TIM-FIBERCOP #63 F062; TOWERNET #55 F055 |
| 9 | compare/si crea quando il Vincolo richiede una voce Ente | Non rappresentabile in v0.1: relazione Vincolo→Ente; separare generazione da visibilità (§2.6, §7). | FASTWEB-VODAFONE #55 F054; ILIAD #88 F080; INWIT #66 F063; LEONARDO #54 F056; TIM-FIBERCOP #64 F063; TOWERNET #56 F056 |
| 10 | compare solo se compilato il campo “Nome Ente” | FILLED(Nome Ente), stessa riga ENTE | FASTWEB-VODAFONE #57 F056; FASTWEB-VODAFONE #58 F057; FASTWEB-VODAFONE #59 F058; ILIAD #90 F082; ILIAD #91 F083; INWIT #68 F065; INWIT #69 F066; INWIT #70 F067; LEONARDO #56 F058; LEONARDO #57 F059; LEONARDO #58 F060; TIM-FIBERCOP #66 F065; TIM-FIBERCOP #67 F066; TIM-FIBERCOP #68 F067; TOWERNET #58 F058; TOWERNET #59 F059; TOWERNET #60 F060 |
| 11 | compare solo se PE = SI | EQ(PE, SI) | FASTWEB-VODAFONE #64 F061; FASTWEB-VODAFONE #65 F062; ILIAD #101 F093; ILIAD #102 F094; INWIT #82 F079; INWIT #83 F080; LEONARDO #69 F064; TIM-FIBERCOP #79 F070; TIM-FIBERCOP #80 F071; TOWERNET #73 F073; TOWERNET #74 F074 |
| 12 | compilato da PM | condition=null; ownership PM_PERMESSI, D-18 permette anche Permessi. | FASTWEB-VODAFONE #66 F073; FASTWEB-VODAFONE #67 F087 |
| 13 | sola visualizzazione | condition=null; kind=MIRROR, non predicato UI. | FASTWEB-VODAFONE #68 F072; FASTWEB-VODAFONE #98 F073; FASTWEB-VODAFONE #112 F087; ILIAD #46 F136; ILIAD #48 F139; ILIAD #111 F135; ILIAD #161 F087; ILIAD #163 F089; ILIAD #178 F097; INWIT #26 F105; INWIT #84 F101; INWIT #118 F073; INWIT #120 F075; LEONARDO #79 F091; LEONARDO #107 F069; LEONARDO #109 F071; TIM-FIBERCOP #88 F096; TIM-FIBERCOP #116 F082; TIM-FIBERCOP #118 F084; TIM-FIBERCOP #131 F106; TOWERNET #76 F095; TOWERNET #106 F067; TOWERNET #108 F069 |
| 14 | non compare se Regione = Piemonte | NEQ(Regione, ISTAT Piemonte=01); Valori:… è dominio lista | FASTWEB-VODAFONE #71 F088; ILIAD #132 F113; INWIT #89 F083; LEONARDO #82 F073; TIM-FIBERCOP #91 F072; TOWERNET #81 F077 |
| 15 | non compare se Regione = Piemonte; Valori: IN ESECUZIONE, OK, STAND BY | NEQ(Regione, ISTAT Piemonte=01); Valori:… è dominio lista | FASTWEB-VODAFONE #72 F089; ILIAD #133 F114; INWIT #90 F084; LEONARDO #83 F074; TIM-FIBERCOP #92 F073; TOWERNET #82 F078 |
| 16 | Valori: OK, DA ASSEGNARE | condition=null; opzioni lista. | FASTWEB-VODAFONE #74 F091; INWIT #92 F086; LEONARDO #85 F076; TIM-FIBERCOP #94 F075; TOWERNET #84 F080 |
| 17 | di base viene inserita la data del giorno | condition=null; default all'Assegna UT_PE se vuoto (D-21). | FASTWEB-VODAFONE #87 F064; FASTWEB-VODAFONE #104 F079; ILIAD #148 F127; ILIAD #167 F141; INWIT #105 F093; INWIT #124 F107; LEONARDO #98 F083; LEONARDO #120 F098; TIM-FIBERCOP #107 F088; TIM-FIBERCOP #123 F098; TOWERNET #97 F087; TOWERNET #112 F097 |
| 18 | possibilità di inserire valore “nessuno” | condition=null; opzione NESSUNO. | FASTWEB-VODAFONE #90 F067; FASTWEB-VODAFONE #108 F083; ILIAD #151 F130; ILIAD #171 F145; INWIT #108 F096; INWIT #128 F111; LEONARDO #101 F086; LEONARDO #124 F102; TIM-FIBERCOP #110 F091; TIM-FIBERCOP #127 F102; TOWERNET #100 F090; TOWERNET #116 F101 |
| 19 | Valori: VS, AS, Dimensionamento plinto, VS plinto, fattibilità, correzione PE | condition=null; opzioni lista. | FASTWEB-VODAFONE #91 F068; ILIAD #152 F131; INWIT #109 F097; LEONARDO #102 F087; TIM-FIBERCOP #111 F092; TOWERNET #101 F091 |
| 20 | compare solo se PE = SI; sola visualizzazione | EQ(PE, SI); MIRROR separato | FASTWEB-VODAFONE #96 F061; FASTWEB-VODAFONE #97 F062; ILIAD #164 F093; ILIAD #165 F094; INWIT #121 F079; INWIT #122 F080; LEONARDO #70 F065; LEONARDO #111 F064; LEONARDO #112 F065; TIM-FIBERCOP #120 F070; TIM-FIBERCOP #121 F071; TOWERNET #109 F073; TOWERNET #110 F074 |
| 21 | compare solo se PSC=SI. Si compila automaticamente con valore=Forecast PSC. Possibilità di modificare la data quando si vuole | EQ(PSC, SI); formula autoreferenziale non traducibile, P-4; modifica manuale ammessa | FASTWEB-VODAFONE #100 F075; LEONARDO #116 F094 |
| 22 | possibilità di inserire valore “nessuno”; possibilità di inserire più tecnici | condition=null; USERS multiplo + NESSUNO esclusivo. | FASTWEB-VODAFONE #107 F082; ILIAD #170 F144; INWIT #127 F110; LEONARDO #123 F101; TIM-FIBERCOP #126 F101; TOWERNET #115 F100 |
| 23 | Valori: SI, NO | condition=null; opzioni lista. | FASTWEB-VODAFONE #113 F097; ILIAD #179 F150; INWIT #134 F116; LEONARDO #129 F107; TIM-FIBERCOP #133 F107; TOWERNET #122 F106 |
| 24 | compare solo se deposito sismico=SI | EQ(Deposito sismico flag, SI) | FASTWEB-VODAFONE #116 F100; FASTWEB-VODAFONE #117 F101; FASTWEB-VODAFONE #118 F102; FASTWEB-VODAFONE #119 F103; FASTWEB-VODAFONE #120 F104; FASTWEB-VODAFONE #121 F105; ILIAD #182 F153; ILIAD #183 F154; ILIAD #184 F155; ILIAD #185 F156; ILIAD #186 F157; ILIAD #187 F158; INWIT #137 F119; INWIT #138 F120; INWIT #139 F121; INWIT #140 F122; INWIT #141 F123; INWIT #142 F124; LEONARDO #132 F110; LEONARDO #133 F111; LEONARDO #134 F112; LEONARDO #135 F113; LEONARDO #136 F114; LEONARDO #137 F115; TIM-FIBERCOP #136 F110; TIM-FIBERCOP #137 F111; TIM-FIBERCOP #138 F112; TIM-FIBERCOP #139 F113; TIM-FIBERCOP #140 F114; TIM-FIBERCOP #141 F115; TOWERNET #125 F109; TOWERNET #126 F110; TOWERNET #127 F111; TOWERNET #128 F112; TOWERNET #129 F113; TOWERNET #130 F114 |
| 25 | compare solo se Tipologia sito= traliccio. <= 30m, >30m | EQ(Tipologia sito, TRALICCIO); <=30m/>30m sono opzioni lista | ILIAD #12 F012 |
| 26 | Forecast Protocollo = Data assegnazione + 30 giorni di calendario | condition=null; computed=FORECAST_PROTOCOLLO_ILIAD (§5). | ILIAD #28 F028 |
| 27 | appare solo se Revit=SI → compilano il team permessi | EQ(Revit, SI); «compilano…» è ownership PM_PERMESSI | ILIAD #33 F033 |
| 28 | compare solo se Tipologia sito = Raw Land | EQ(Tipologia sito, RAW_LAND) | ILIAD #37 F037; ILIAD #38 F038; ILIAD #39 F039; ILIAD #40 F040; ILIAD #41 F041; ILIAD #42 F042; ILIAD #112 F095; ILIAD #113 F096; INWIT #31 F030; INWIT #85 F076; INWIT #86 F077; LEONARDO #65 F072; TIM-FIBERCOP #75 F085; TOWERNET #26 F026; TOWERNET #77 F070; TOWERNET #78 F071 |
| 29 | compare solo se CARATTERIZZAZIONE= SI. SI, NO | EQ(CARATTERIZZAZIONE, SI); SI/NO è dominio lista | ILIAD #44 F044; ILIAD #45 F045 |
| 30 | appare solo se Revit=SI | EQ(Revit, SI); «compilano…» è ownership PM_PERMESSI | ILIAD #54 F051; INWIT #33 F032; INWIT #43 F040; TIM-FIBERCOP #32 F032; TIM-FIBERCOP #42 F041 |
| 31 | compare solo se MW=SI | EQ(MW, SI) | ILIAD #58 F055 |
| 32 | compare solo se compilato il campo “Richiesta integrazione” | FILLED(Richiesta integrazione), stessa riga INTEGRAZIONE | ILIAD #82 F074; ILIAD #83 F075; INWIT #59 F056; INWIT #60 F057; LEONARDO #47 F049; LEONARDO #48 F050; TIM-FIBERCOP #57 F056; TIM-FIBERCOP #58 F057; TOWERNET #49 F049; TOWERNET #50 F050 |
| 33 | compare solo se “Vincoli” è compilato | FILLED(Vincoli), aggregato VINCOLI; scope da aggiungere al DTO | ILIAD #89 F081 |
| 34 | Forecast Geologica = Assegnazione Geologica + 15 giorni di calendario | condition=null; computed=FORECAST_GEOLOGICA; eventuale MIRROR separato. | ILIAD #96 F088; INWIT #77 F074; LEONARDO #63 F070; TIM-FIBERCOP #73 F083; TOWERNET #68 F068 |
| 35 | compare solo se Committente= CONSORZIO (ERICSSON) | EQ(Committente, CONSORZIO_ERICSSON) | ILIAD #123 F106 |
| 36 | compare solo se Committente= Cellnex | EQ(Committente, CELLNEX) | ILIAD #124 F107 |
| 37 | compare solo se Committente=Cellnex; alert 1 settimana dopo la data indicata, ripetuto 1 volta a settimana fino a quando il campo EM (data) non viene compilato | EQ(Committente, CELLNEX); CDMS_EM separato (§6) | ILIAD #125 F108 |
| 38 | compare solo se Committente = CELLNEX | EQ(Committente, CELLNEX) | ILIAD #129 F112 |
| 39 | Forecast Geologica = Assegnazione Geologica + 15 giorni di calendario; sola visualizzazione | condition=null; computed=FORECAST_GEOLOGICA; eventuale MIRROR separato. | ILIAD #162 F088; INWIT #119 F074; LEONARDO #108 F070; TIM-FIBERCOP #117 F083; TOWERNET #107 F068 |
| 40 | compare solo se Tipologia sito = Raw Land; sola visualizzazione | EQ(Tipologia sito, RAW_LAND); MIRROR separato | ILIAD #176 F095; ILIAD #177 F096; INWIT #133 F076; LEONARDO #110 F072; TIM-FIBERCOP #119 F085; TOWERNET #121 F070 |
| 41 | compare solo se compilato campo “ODA”. Un campo Note ODA per ogni ODA compilato | FILLED(ODA), stessa riga ODA; una nota per riga | INWIT #15 F015 |
| 42 | Alert 2 gg prima; si risolve quando viene compilato il campo “Approvazione AIE” | condition=null; regola FORECAST_AIE separata (§6). | INWIT #46 F043; TOWERNET #36 F036 |
| 43 | Base = Protocollo + 67 giorni di calendario. Quando si compila Invio integrazione, se in quel momento mancano <= 15 giorni al forecast base, il forecast viene spostato della durata dell’ultima integrazione (Invio integrazione - Richiesta integrazione). Il ricalcolo continua finché il campo non viene modificato manualmente; una modifica manuale lo blocca. | condition=null; computed=FORECAST_OTTENIMENTO_PERMESSI, manual override (§5). | INWIT #55 F052; LEONARDO #44 F046; TOWERNET #45 F045 |
| 44 | IF “Forecast Ottenimento Permessi” >= 67 SEND Alert. Compare solo se la condizione è avverata | Non traducibile: data/durata senza riferimento e operatore >= assente; P-3. | INWIT #71 F068; TOWERNET #61 F061 |
| 45 | compare solo se All. 18 = SI | EQ(All. 18, SI) | LEONARDO #39 F041 |
| 46 | non compare se All. 18 = SI | NEQ(All. 18, SI) | LEONARDO #40 F042; LEONARDO #41 F043; LEONARDO #42 F044 |
| 47 | compare solo se Deposito sismico = SI; sola visualizzazione | EQ(Deposito sismico flag, SI); MIRROR separato | LEONARDO #114 F116 |
| 48 | compare solo se selezionato proprietà / Host=Inwit | EQ(Proprietà / Host, INWIT) | TIM-FIBERCOP #18 F018 |
| 49 | compare solo se compilato campo “ODA”; un campo Note ODA per ogni ODA compilato | FILLED(ODA), stessa riga ODA; una nota per riga | TOWERNET #14 F014 |


### 2.4 Parti non traducibili

TOWERNET #61/F061 e INWIT #71/F068 confrontano Forecast Ottenimento Permessi con 67 senza ancoraggio temporale; aggiungere GTE non basta. P-3: nessun alert eseguibile finché non definito.

FV #100/F075 e LEONARDO #116/F094: predicate PSC=SI traducibile, formula Forecast PSC autoreferenziale non traducibile. Non inventare copia da Forecast PE. P-4.

Nome Ente nei sei MD: relazione Vincolo→Ente e generazione righe non rappresentabili dal ConditionDTO scalare; generazione nel motore Vincoli, visibilità tramite relazione/metadati proposti in §7. Lo scope per padri ripetuti/aggregati è già coperto da v0.1.5; resta da rappresentare il contenuto strutturato dei Vincoli, non da ridefinire il quantificatore.

Diagnosticare severity, template, #, flow, testo e componente unresolved. Nessun predicato ignoto diventa null/sempre visibile per fallback. I testi su liste/default/MIRROR hanno invece legittimamente condition=null.

### 2.5 dtype, liste e computed

| dtype sorgente | DataType | Regola |
|---|---|---|
| TEXT / campo varchar / campo varchar 50 | TEXT | maxLength 50 ove attestato; N° protocollo/sismica testo D-38. |
| INTEGER / DECIMAL / campo numerico | NUMBER | INTEGER intero; numeri finiti; lat -90…90, lon -180…180. G7 INTEGER in tutti i MD #1/F001 diverge dal DTO stringa: P-6. |
| DATE (gg/mm/aaaa) | DATE | YYYY-MM-DD, data reale inclusi anni bisestili. |
| campo libero / libero | LONGTEXT proposto | Numero Offerta ILIAD #117/F100 → TEXT con override esplicito di presentazione. |
| menù/Menù a tendina, variante "si popola", "con tutti i clienti", "scelta singola" | SELECT | ListRef da regola normativa, senza usare il Campo Universale. |
| menù a tendina con selezione multipla | MULTISELECT | LEONARDO Oneri #59/F061. |
| Campi utente D-39 | USERS secondo D-72 | Tecnico PE esplicitamente multiplo in tutti gli MD, es. ILIAD #170/F144. D-72 dice USERS per gli altri: non convertirli autonomamente a USER; chiarire cardinalità di quelli descritti come singoli in P-6. |
| dtype assente | TEXT + diagnostica | Regola deliberata D-72; eventuali eccezioni normative confliggenti sono P-6, non inferenza automatica dal nome. |

Override normativi: Committente/Cliente Finale #4/F004,#5/F005 dei sei MD → SELECT controllati obbligatori; Progetto ILIAD #16/F016,TIM #15/F015,INWIT #13/F013 → SELECT configurabile; Incarico sempre singolo (D-32/D-40). Coordinate già divise in due NUMBER con due ID: D-66 sostituisce la parte LATLON di D-56 (D-38/D-66; G §17.3).

Dtype vuoti: default TEXT e segnalazione, come D-72. ILIAD #66/F058 XML, #87/F079 Ripresentazione Pratica, #93/F085 DATA SCADENZA PERMESSI, #115/F098 Offerta Inviata, #129/F112 AGORA’; #121/F104 e #122/F105 sono alias trasversali secondo D-37. Il CSV suggerisce liste per XML/Offerta/AGORA, ma non autorizza a scavalcare D-72 senza eccezione adottata. Due collisioni da portare alla memoria: LEONARDO #21/F021 Data assegnazione deve partecipare a D-41 come data mentre D-72 la rende TEXT; TIM #36/F096 dtype vuoto è mirror del master UT DATE #115/F096 (R-1 B4), quindi il tipo unico logico collide con fallback TEXT dell'occorrenza. Proposta eccezione tipizzata per norma/master, da adottare P-6; non dichiararla già decisa. ILIAD Ripresentazione Pratica: TEXT non risolve l'eventuale azione di nuovo ciclo ARPA. 

ListRef CONTROLLED per domini usati da regole, CONFIGURABLE per altri per template/gruppo master, ISTAT per Regione/Provincia/Comune, USERS con ruolo D-39/D-72 e template/active. Tecnico Misure di fondo, Direttore Lavori e Collaudatore restano configurabili. "Progettista / Tecnico" ILIAD #50/F047 e FV #36/F035 non è letteralmente il Tecnico PP di D-39: ruolo P-6, non deduzione autonoma.

CSV: parser ; e quote; codici_proposti conservati con provenance; alias lista associati a flow espliciti. EM ILIAD #126/F111 percentuale distinto da #128/F109 data; Invio offerta #44/F044 SI/NO distinto da #116/F099 data. MANCANTE→configurabile vuota con diagnostica; INCOMPLETA→valori noti e integrazione leader. Note "Scelta multipla" Incarico e "Vincoli mancanti" del CSV 07/10 sono superate da D-32 e preamboli MD 08/10. Nessuna nuova struttura desunta dal CSV (D-12/D-40; G §17.4).

Codici già utilizzati non si rinominano/eliminano: disattivazione preserva valori e label storiche. "Altro" provvisoriamente solo CONFIGURABLE + Committente/Cliente Finale secondo R-1 D1; otherText locale. "Nessuno" è sentinella NESSUNO esclusiva, non utente fittizio; ID utenti esadecimali non diventano UPPER_SNAKE_CASE. Tipologia attività PE computed: unione delle liste sorgenti, non lista da modificare autonomamente; collisioni semantiche di codice P-6.

### 2.6 Composizione dei gruppi ripetibili

Solo campi presenti, senza propagazioni per simmetria (D-35/D-36; G §15/§17.6):

| Gruppo | ILIAD | TOWERNET | TIM-FIBERCOP | INWIT | FASTWEB-VODAFONE | LEONARDO |
|---|---|---|---|---|---|---|
| TENANT | #20/F020; #21/F021; #22/F022 | #15/F015; #16/F016; #17/F017 | #21/F021; #22/F022; #23/F023 | #18/F018; #19/F019; #20/F020 | #20/F020; #21/F021; #22/F022 | #16/F016; #17/F017; #18/F018 |
| INTEGRAZIONE | #81/F073; #82/F074; #83/F075 | #48/F048; #49/F049; #50/F050 | #56/F055; #57/F056; #58/F057 | #58/F055; #59/F056; #60/F057 | assente | #46/F048; #47/F049; #48/F050 |
| ARPA | #84/F076; #85/F077; #86/F078; #87/F079 | #51/F051; #52/F052; #53/F053; #54/F054; #55/F055 | #59/F058; #60/F059; #61/F060; #62/F061; #63/F062 | #61/F058; #62/F059; #63/F060; #64/F061; #65/F062 | #51/F050; #52/F051; #53/F052; #54/F053 | #49/F051; #50/F052; #51/F053; #52/F054; #53/F055 |
| ENTE | #88/F080; #89/F081; #90/F082; #91/F083 | #56/F056; #57/F057; #58/F058; #59/F059; #60/F060 | #64/F063; #65/F064; #66/F065; #67/F066; #68/F067 | #66/F063; #67/F064; #68/F065; #69/F066; #70/F067 | #55/F054; #56/F055; #57/F056; #58/F057; #59/F058 | #54/F056; #55/F057; #56/F058; #57/F059; #58/F060 |
| ODA | #119/F102; #120/F103 | #13/F013; #14/F014 | #16/F016 | #14/F014; #15/F015 | #15/F015 | #14/F014 |
| VINCOLI | #31/F031 | #23/F023 | #30/F030 | #28/F027 | #32/F032 | #24/F024 |

FV non ha campi Richiesta/Invio integrazione: niente nuovi flow o gruppo vuoto. Stato ODA FV #14/F014 resta scalare dell'iterazione, non duplicato per ODA senza requisito. ARPA contiene l'azione/data Ripresentazione Pratica del ciclo, che genera una riga ARPA e **non** un'iterazione pratica; precisazione data/azione P-6.

Offerta unica: ILIAD #115–#118/F098–F101, TOWERNET #65/F065, TIM #70/F069, INWIT #74/F071. FV e LEONARDO non hanno Offerta: non generare una regola con trigger inesistente.

Vincoli: flow contenitore della tabella, righe con codice/stato/ente degli 11 vincoli. RepeatGroupDTO.flowIds v0.1 non descrive stato ed ente strutturati: schema speciale §7, senza Fxxx sintetici.

### 2.7 Prove del compilatore

Input: # continuo 1…N; Fxxx validi; set F001…Fmax continuo; conteggi attesi e hash. Output: un MASTER per flow operativo, mirror con master/tipo esistenti, occurrenceKey unica, owner coerente, condizioni/computed riferiti a flow presenti, ogni flow ripetuto in un solo gruppo, grafo formule aciclico, serializzazione deterministica.

Per ILIAD F104/F105 continuità sul **manifest** sorgente, un solo trasversale UI e nessun valore duplicato: non inventare MASTER UI per soddisfare il conteggio. Test: 49/49 formulazioni coperte; zero gating Incarico/Geologica; AIE abilitata dopo Assegna; Tecnico PE USERS; stesso valore master/mirror, visibilità diversa. Nuova cella non mappata→errore diagnostico. Un compilato parziale è ammesso per sviluppo dichiarato, non per rilascio conforme finché i P pertinenti restano aperti.


## 3. Motore dei permessi

### 3.1 Identità, visibilità e accesso

getCurrentUser() rilegge users per id di sessione, verifica status=active e restituisce UserDTO; JWT non contiene appartenenze autorevoli. Per ogni richiesta si cerca **la stessa appartenenza** con templateId e gruppo richiesti; non combinare cliente di una membership e ruolo di un'altra. ADMIN è un flag globale, leader è locale a cliente/gruppo. Restano Credentials/JWT e getCurrentUser() del contratto, senza cambiare sistema di autenticazione (D-17–D-19; CONTRATTO §4; G §15).

Lettura: ADMIN tutti i template; altri soltanto template delle proprie memberships. scope=assigned: PM/PERMESSI tutte le pratiche del template, gli altri quelle con proprio gruppo abilitato; scope=all tutte del proprio template, anche quelle non assegnate, in sola lettura fuori dal proprio perimetro. Non nascondere l'esistenza di campi di altri gruppi: mirror e viste Core/Secondari devono funzionare. 404 su pratica fuori dalla visibilità per evitare enumerazione; 401 senza sessione, 403 per comando su pratica visibile ma non autorizzato (contratto §5.1; D-18/D-22; G §2E/§15).

### 3.2 OccurrenceAccessDTO e salvataggio

Ordine deterministico dei vincoli, proposto per dare un motivo stabile:

| Condizione | editable | reason proposto |
|---|---|---|
| Pratica archiviata | false | ARCHIVED |
| Iterazione non corrente | false | PAST_ITERATION: manca nel contratto |
| MIRROR, anche per ADMIN | false | MIRROR |
| Formula senza modifica manuale prevista | false | COMPUTED |
| Non ADMIN e nessuna membership nel gruppo owner del master | false | NOT_MY_GROUP |
| Non ADMIN e owner non in enabledGroups | false | NOT_ASSIGNED |
| Tutti i controlli passati | true | assente |

ADMIN supera membership/assegnazione, ma modifica dal master e rispetta archivio, iterazione passata e formula non modificabile. Il privilegio globale D-17 si applica ai comandi consentiti, senza creare un ruolo ADMIN di gruppo. PM e PERMESSI modificano tutti i master PM_PERMESSI; UT e PE tutti i master UT_PE, senza restringere alla sottosezione del ruolo (D-18/D-19/D-22/D-28; G §2E/§15; esempi ILIAD #147/F126 UT e #166/F140 PE).

Forecast Permessi è calcolato ma **modificabile** nei limiti del gruppo owner, come previsto D-42: computed non implica sempre readonly. Tipologia attività PE e Forecast Geologica sono readonly; Forecast Protocollo ILIAD usa la regola prevista in §5, senza estendere automaticamente a tutti i forecast un blocco non deliberato.

condition non è un permesso: D-31 conserva valori nascosti, li include in export/KPI e limita la condizione alla UI. Il backend può ricalcolare condition per progress/diagnostica, non rifiutare una modifica per il solo fatto che è false. Questo contrasta con la frase del contratto §3 “il backend la ricontrolla in scrittura”: modificare il contratto, non introdurre un divieto in più (P-11). La stessa rowId governa le condizioni interne ai repeat; l'accesso eredita master/gruppo dell'occorrenza (D-31/D-36; G §2E/§17.5).

PATCH v0.1 manda flowId e perde l'occorrenza d'origine: aggiungere occurrenceKey per verificare master contro mirror e produrre rejected corretti; chiave, flowId, repeat e rowId devono concordare nel manifest. Il semplice conoscere flowId non deve consentire una richiesta originata da un mirror. ADD/REMOVE verificano gruppo del repeat, pratica corrente, riga esistente e vincoli di origin/locked; VINCOLI non ammette ADD/REMOVE. Richiesta multi-campo: validazione completa, poi transazione; un 403/422/409 lascia invariato tutto, comprese formule, stato e notifiche (D-18/D-35; contratto §5.2; §1).

Trasversali: Fatturabile manuale PM secondo D-37; Fatturato manuale ma il gruppo abilitato a cambiarlo non è esplicitato, così come quello di Note Operative. Non inferire “tutti”: proposta owner PM_PERMESSI per i tre trasversali, da decidere in P-7. In attesa mantenere queste policy esplicite e sostituibili, senza disseminarle nei route handler.

### 3.3 PraticaActionsDTO

Ogni booleano comprende prima visibilità, current iteration e vincoli specifici. La tabella distingue regole deliberate da policy mancanti.

| Azione | Regola |
|---|---|
| Creazione (azione elenco) | ADMIN oppure membership PM del template, non PERMESSI e non DL (D-20) |
| canAssign / assignableGroups | Pratica attiva, assegnazione non esclusiva; **ruoli mittenti e gruppi destinatari per mittente non enumerati** da D-21. Proposta PM/ADMIN verso AIE, UT_PE, DL; decidere P-7. Non autorizzare qualunque membro per deduzione |
| canChangeStato | PM del template oppure ADMIN, pratica non archiviata (D-23/D-28) |
| canArchive | Stato TERMINATO/KO e PM o DL del template oppure ADMIN; non PERMESSI per equivalenza di gruppo (D-23) |
| canRestore | Archiviata, PM del template o ADMIN (D-23) |
| canDelete | PM o ADMIN, CREATA, una sola iterazione secondo R-1 D2; archiviata non cancellabile (D-27/D-28; R-1 provvisorio) |
| canRework | PM o ADMIN; origine può essere ancora aperta (D-26). Origine archiviata non esplicitata: P-7 |
| canResubmit | Non archiviata, PM **leader** del template o ADMIN (D-25) |

Non restringere archivio ai DL leader: D-23 parla di ruolo DL. Il cambio a TERMINATO è manuale PM/ADMIN; TERMINATO e KO non rendono i campi readonly finché la pratica non viene archiviata (D-28). “Assegna” abilita un insieme per unione, non rimuove gli altri: niente currentTeam, passaggio esclusivo o auto-completamento del gruppo precedente. Ogni comando Assegna, anche verso un gruppo già abilitato, notifica tutti i membri attivi della destinazione, incluso l'attore se membro; idempotenza evita solo la replica della **stessa** richiesta (D-21/D-22; G §15).

Oltre ai DTO, leader di template/gruppo gestisce liste configurabili di quel perimetro, ADMIN tutte; liste CONTROLLED mantengono codici normativi. Letture carichi proprio gruppo ai leader, statistica globale PM/ADMIN; non usare canChangeStato come permesso per KPI/configurazione (D-23/D-40/D-48; G §18A). I route handler chiamano gli stessi policy service usati per produrre i DTO: pulsante assente e rifiuto server hanno la stessa origine.


## 4. Motore dello Stato attività

### 4.1 Registro trigger per gestore e limite reale delle fonti

D-41 e G §14/§17.7 definiscono inequivocabilmente solo due associazioni campo→stato: Data assegnazione preliminare→ASSEGNATO; nuova Richiesta integrazione→INTEGRAZIONE_RICHIESTA. CREATA è evento di creazione/ripresentazione, TERMINATO è manuale. Gli MD identificano date operative, **non dichiarano gli altri abbinamenti allo stato**. Non convertire una label semanticamente simile in una nuova regola deliberata. Tabella seguente: prime due colonne operative; restanti sono binding già disponibili per una proposta da decidere P-2, non automatismi autorizzati.

| Gestore | ASSEGNATO: deliberato | INTEGRAZIONE_RICHIESTA: deliberato | PROTOCOLLATO: candidato | IN_APPROVAZIONE: candidato | Autorizzazione: candidati | REALIZZATO: candidato |
|---|---|---|---|---|---|---|
| ILIAD | #27/F027 | #81/F073 (per riga) | #80/F072 | #75/F067 | assente / data #92/F084 / permessi #79/F071 | #190/F161 |
| TOWERNET | #20/F020 | #48/F048 (per riga) | #44/F044 | #42/F042 | #62/F062 / data #64/F064 / permessi #43/F043 | #133/F117 |
| TIM-FIBERCOP | #26/F026 | #56/F055 (per riga) | #55/F054 | #52/F051 | assente / data #69/F068 / permessi #54/F053 | #144/F118 |
| INWIT | #23/F023 | #58/F055 (per riga) | #54/F051 | #52/F049 | #72/F069 / data #73/F070 / permessi #53/F050 | #145/F127 |
| FASTWEB-VODAFONE | #25/F025 | assente (per riga) | #50/F049 | #47/F046 | assente / data #60/F059 / permessi #49/F048 | #124/F108 |
| LEONARDO | #21/F021 | #46/F048 (per riga) | #43/F045 | #42/F044 | assente / data #60/F062 / permessi #45/F047 | #140/F118 |

TOWERNET #62/F062 e INWIT #72/F069 sono SELECT con AUTORIZZATO/DINIEGATO/TAR/KO: hanno una data finale distinta, ma non una data separata per ogni esito. Negli altri quattro MD manca quel SELECT: la data Autorizzazione finale da sola non distingue diniego/TAR/KO. Invio Pacchetto Permessi FV/LEONARDO ha un possibile percorso alternativo All.18 LEONARDO #39/F041; nemmeno questa sostituzione è definita per lo stato. Non usare Approvazione AIE come stato generale IN_APPROVAZIONE per deduzione. Fino alla decisione tutti gli stati dell'enum sono raggiungibili con il comando manuale PM/ADMIN, senza inventare trigger (D-23/D-41; G §14; P-2).

LEONARDO #21/F021 ha dtype vuoto: l'eccezione alla normalizzazione TEXT di D-72 va adottata in P-6; il binding stato è certo, il renderer/validator DATE non ancora autorizzato dall'eccezione.

Registro tecnico StateRule: ruleId, templateId, status, dateFlowId, optional predicate, repeatGroup, sourceDecision, tiePriority. Il compilatore richiede DATE per il trigger e vieta soglie/stati basati su timestamp di aggiornamento. StateMeta conserva automaticState, selectedRule/row/date, manual {status,actor,at,revision} e effectiveSource; eventi dello stato separati dallo storico dei campi (§1, D-47).

### 4.2 Precedenza, fallback e manuale

Per eventi automatici usare **tutte le date attualmente valide della corrente iterazione**. Non l'ultimo record storico e non l'ultima riga modificata. La massima YYYY-MM-DD valida vince; cancellazione di un campo/riga elimina il candidato, quindi ricalcolo completo torna al massimo rimasto oppure CREATA. Date future valide partecipano all'ordinamento perché D-41 parla della data scritta, non della data già trascorsa. A parità di data serve priorità deliberata; ultima modifica non è un criterio accettabile (P-2).

Conflitto effettivo: nuova integrazione retrodatata rispetto a un protocollo più recente, quando sarà abilitato quel trigger. “Ogni nuova Richiesta integrazione porta ...” e “vince la data più recente” possono dare risultati diversi. Proposta: precedenza temporale generale, integrazione solo se massima; il collaboratore deve confermare o chiedere un'eccezione esplicita. Non mascherare l'eccezione con editedAt.

D-23 autorizza il manuale ma non specifica durata/precedenza rispetto ai futuri salvataggi automatici. Proposta da adottare in P-2: manuale esplicito persistente, automaticState continua ad aggiornarsi in sottofondo; nessun campo secondario fa uscire involontariamente da STAND_BY/KO/TERMINATO. Comando per tornare a gestione automatica richiede variazione contrattuale §7 e approvazione: non è già una funzione deliberata. Alternativa da decidere: prossimo evento trigger rilevante rilascia il manuale. Non scegliere arbitrariamente tra queste politiche nel codice.

Alla ripresentazione StateMeta è nuovo e vuoto, niente manual override ereditato, CREATA, nonostante enabledGroups ereditati; vecchia iterazione è snapshot readonly e non concorre allo stato attuale (D-25). Assegna senza Data assegnazione non cambia stato; incarichi PE/VSAS automatici non sono trigger ASSEGNATO (D-21/D-41).

### 4.3 Pseudocodice del calcolo puro

```text
deriveAutomaticState(template, iteration, repeats, adoptedRules):
    events = []
    for rule in adoptedRules[template]:
        for context in scalarOrRepeatRows(rule):
            if rule.predicate(context) and validCivilDate(context[rule.dateFlowId]):
                events += {status, date, ruleId, rowId, tiePriority}
    if events is empty: return {status: CREATA, source: CREATION}
    return maximum(events, by=(date, ADOPTED_tiePriority, stableRowId))

applyState(before, after, operation):
    auto = deriveAutomaticState(after.template, after.currentIteration, ...)
    if operation is manualStateCommand:
        require PM_or_ADMIN; record manualMeta
    effective = ADOPTED_manualPolicy(auto, manualMeta, operation)
    if before.effectiveState != effective:
        emit StateChanged(old, effective, triggerDate, source)
    persist automaticState, effectiveState, provenance in same transaction
```

stableRowId è solo tie-break tecnico tra eventi **dello stesso stato/priorità**, non risolve un conflitto tra stati. Nessuna regola pending entra in adoptedRules.

### 4.4 Prove offline, prima dell'implementazione dei route handler

| Caso | Risultato atteso |
|---|---|
| Nuova pratica / nuova iterazione | CREATA; nessun residuo manuale/automatico precedente |
| Assegna UT_PE con Data assegnazione vuota | Gruppo abilitato, stato ancora CREATA |
| Data assegnazione valorizzata | ASSEGNATO |
| Richiesta integrazione con data successiva | INTEGRAZIONE_RICHIESTA |
| Modifica oggi una richiesta più vecchia, esiste richiesta successiva | Vince data successiva, non il salvataggio odierno |
| Svuotamento della richiesta vincente | Fallback altra richiesta/assegnazione/CREATA |
| Eliminazione riga repeat vincente | Stesso fallback, storico ROW_REMOVE preservato |
| Trigger nel 2027 salvato nel 2026 | Vince data 2027 secondo D-41 |
| Due stati automatici con stessa data | Diagnostica/policy adottata, mai editedAt arbitrario |
| Nuova integrazione più vecchia di protocollo | Fixture P-2, esito da approvare; non dichiarare un test verde senza decisione |
| Manuale STAND_BY, poi salvataggio di nota | Nessun evento automatico nuovo; secondo policy proposta STAND_BY resta |
| Manuale KO/TERMINATO, poi nuovo trigger | Fixture di precedenza P-2; persistente solo se adottato |
| Trigger cancellato dopo stato manuale | automaticState fa fallback; effectiveState segue policy manuale adottata |
| PATCH iterazione precedente / archiviata | 409 / 403, nessun evento |
| Data invalida o timezone in campo DATE | 422, niente ricalcolo |
| Retry operationId già riuscita | Stessa risposta, nessun secondo StateChanged |

Per mapping candidati PROTOCOLLATO/IN_APPROVAZIONE/AUTORIZZATO/DINIEGATO/TAR/REALIZZATO aggiungere fixture per **ognuno dei sei template** dopo adozione, inclusi campi assenti, percorso All.18, diniego senza data e parità temporale. Non dichiarare completato l'intero motore di stato quando sono implementati soltanto i due trigger certi.


## 5. Motore delle formule e dei campi calcolati

### 5.1 Binding e metadati

Motori puri su snapshot candidato, orologio iniettato, niente DB/SMTP/UI nel calcolo. Grafo dipendenze compilato e ordinamento topologico; persistono valori materializzati per export/KPI, con value_history anche per modifiche SYSTEM. Stesse formule indipendenti dalla condition UI e dall'Assegna, nessun ricalcolo su vecchie iterazioni/archiviate (D-31/D-32/D-34/D-37/D-42; G §11–§13/§17.6).

| Gestore | PE: Incarico / Progetto → tipo | Geologica: assegnazione → forecast | Permessi: Protocollo → forecast | Integrazione richiesta → invio | Fatturabile: permessi / esito ARPA |
|---|---|---|---|---|---|
| ILIAD | #15/F015 / #16/F016 → #168/F142 | #95/F087 → #96/F088 | #80/F072 → #78/F070 (manuale) | #81/F073 → #83/F075 | #79/F071 / #86/F078 |
| TOWERNET | #12/F012 / assente → #113/F098 | #67/F067 → #68/F068 | #44/F044 → #45/F045 (AUTO +67) | #48/F048 → #50/F050 | #43/F043 / #53/F053 |
| TIM-FIBERCOP | #14/F014 / #15/F015 → #124/F099 | #72/F082 → #73/F083 | #55/F054 → #53/F052 (manuale) | #56/F055 → #58/F057 | #54/F053 / #61/F060 |
| INWIT | #12/F012 / #13/F013 → #125/F108 | #76/F073 → #77/F074 | #54/F051 → #55/F052 (AUTO +67) | #58/F055 → #60/F057 | #53/F050 / #63/F060 |
| FASTWEB-VODAFONE | #13/F013 / assente → #105/F080 | assente → assente | #50/F049 → #48/F047 (manuale) | assente → assente | #49/F048 / #53/F052 |
| LEONARDO | #13/F013 / assente → #121/F099 | #62/F069 → #63/F070 | #43/F045 → #44/F046 (AUTO +67) | #46/F048 → #48/F050 | #45/F047 / #51/F053 |

Gli output usano il master deliberato, i mirror leggono lo stesso valore: non aggiornamenti duplicati. Le due formule PSC e l'alert autocertificazione non risolti sono separati dalle formule implementabili (§2, P-3/P-4). La mancanza Geologica FV non autorizza aggiunta di nuovi flow: G §11 dice come comportare il blocco presente, D-29 conserva l'inventario.

formulaMeta per output: formulaId/version, inputHash, mode=AUTO|MANUAL, manual {actorId,at,operationId}, lastCalculatedAt, lastSystemReason. Per Permessi: baseDate, appliedIntegrationRowId e capturedDurationDays. Per ciascuna riga integrazione: check {version,checkedAtRomeDate,inputRequest,inputSend,baseAtCheck,remainingDays,eligible,operationId}. Fatturabile aggiunge lastForcedNegativeCycleId e manualDecisionAt; tipo PE e Geologica non ammettono mode MANUAL.

È una **proposta tecnica**, non campi utente aggiuntivi. Non dedurre manuale da valore diverso dalla formula: una scrittura esplicita del PM può scegliere proprio il valore calcolato; viceversa un import/system non crea automaticamente il blocco manuale. Origine USER/IMPORT/SYSTEM verificata server-side, non accettata come privilegio dal payload.

### 5.2 Tipologia attività PE, Geologica e Protocollo ILIAD

PE_TYPE = Progetto se quel flow è presente nel template e valorizzato; altrimenti Incarico/Lavorazione; null se entrambi vuoti. Progetto non presente TOWERNET/FV/LEONARDO: fallback senza inventare campo. Si copia il codice stabile, non l'etichetta; il dominio PE_TYPE deve contenere l'unione degli input pertinenti, senza trasformare in “Altro” un codice valido (§2, P-6). Ricalcolo quando uno degli input cambia; campo output mai compilabile manualmente (D-32; G §11/§20.1.8).

GEOL_FORECAST = addCalendarDays(AssegnazioneGeologica,15); input vuoto→null, flag Geologica=NO non spegne calcolo o visibilità. ILIAD PROTOCOL_FORECAST = addCalendarDays(DataAssegnazione,30), binding ILIAD #27/F027→#28/F028, non protocollo #80/F072. Input vuoto→null; nessuna formula equivalente per TIM #27/F027 o FV #26/F026, che restano manuali (D-34/D-42; G §13; condizioni esatte §2). Proposta readonly ILIAD coerente con formula senza override esplicito; non introdurre un blocco manuale permanente non previsto dal testo.

### 5.3 Forecast Ottenimento Permessi e controllo unico

Solo TOWERNET, INWIT e LEONARDO: base = Protocollo +67 **giorni di calendario**. ILIAD/TIM/FV: semplice valore manuale e nessuno spostamento automatico per integrazione. Manuale AUTO→MANUAL alla scrittura diretta del forecast; da quel momento cambiare Protocollo o integrazione non lo sovrascrive. Nessun reset manual lock nell'interfaccia è già deliberato; azzerare il valore non deve sbloccarlo implicitamente (P-8). Nuova iterazione riparte AUTO con input vuoti.

Controllo unico: intercettare transizione Invio integrazione EMPTY→FILLED nella riga. Valutare il batch candidato completo, anche se Richiesta e Invio arrivano nella stessa PATCH; validare ordine date. Fissare checkedAt, base e risultato, così il passaggio del tempo non rende eleggibile una riga prima non eleggibile. Soglia **≤15**, base non forecast già spostato. La data con cui confrontare la base (“in quel momento”: giorno del salvataggio Roma oppure data Invio) e il trattamento di base già scaduta non sono precisati: P-8. Proposta verificabile: remaining=base−giorno civile Roma dell'operazione, eleggibile 0≤remaining≤15; questa aggiunge un limite inferiore e quindi richiede approvazione, non è spacciata per D-42.

“Ultima integrazione”: D-42/G §13/§17.6 non dice se ultima per ordine di creazione, Richiesta o Invio. Proposta ultima per data Richiesta, poi ordinal come spareggio; calcolo **base + durata dell'ultima**, non somma di tutte le durate, per rispettare il testo. Se l'ultima non è ancora inviata/eleggibile, resta da decidere se conservare lo spostamento precedente o tornare alla base. Anche cancellazione/correzione di Invio già controllato richiede una policy: conservare esito unico e aggiornare durata? riaprire controllo? Non decidere in silenzio, fixture P-8.

Protocollo compilato dopo Invio: al primo check base assente si registra diagnostic NO_BASE; se questo esaurisce il controllo o lo differisce è P-8. Righe con durata negativa non devono produrre un forecast anticipato per errore; proposta 422 sul batch (P-8). Dopo manual lock si può conservare la diagnostica dell'integrazione senza applicare l'output.

Pseudocodice subordinato alle scelte P-8:

```text
onCandidateSave(before, after, operationClock):
    recalc PE_TYPE, GEOL_FORECAST, ILIAD_PROTOCOL_FORECAST if inputsChanged
    if template in {TOWERNET,INWIT,LEONARDO}:
        base = protocol ? addCalendarDays(protocol,67) : null
        for row whose Invio changed EMPTY -> FILLED:
            if no prior check:
                validate request/send
                persist check using ADOPTED_referenceDate and eligibility
        chosen = ADOPTED_latestIntegration(after.rows)
        if forecastMeta.mode == AUTO:
            duration = ADOPTED_applicableShift(chosen, savedChecks)
            target = base == null ? null : addCalendarDays(base,duration)
            setComputedIfChanged(target, PERMITS_FORECAST)
    evaluateFatturabile(after, operationClock)
    emit history + toast for each actual recalculation output change
```

Il toast torna in FieldChangeResponse.toasts nello stesso comando, con flowId, vecchia/nuova data leggibili e motivo, anche quando si ritorna alla base; idempotent retry restituisce la ricevuta senza nuova modifica. Se input cambia ma risultato rimane uguale, proposta nessun toast duplicato; “ogni ricalcolo” può essere interpretato più letteralmente, da confermare con la policy P-8. Non inviare mail per toast (D-42; contratto §5.2).

### 5.4 Fatturabile: default, calcolo temporale e nuovo negativo

Default NO. Se data OttenimentoPermessi presente, oggi Roma ≥data+30 calendario e **ultimo ciclo ARPA** ha esito POSITIVO, impostare SI solo se !fatturabileManual. Non basta un esito positivo storico quando l'ultima riga è negativa o senza esito. Ricalcolare dopo modifica dei due input e nel job giornaliero, perché il decorso dei 30 giorni non dipende da un nuovo salvataggio. Se un input viene svuotato prima dell'automatismo, non si produce SI; revoca di SI già automatico per cancellazione/rettifica input non è esplicitata: P-9 (D-37; G §12).

Scrittura manuale PM di SI o NO, anche uguale al corrente, marca fatturabileManual=true, autore e data: blocca **i ricalcoli positivi**. Nuovo ciclo ARPA con NEGATIVO forza NO anche in presenza del blocco manuale; non cancellare il manual flag per deduzione. Definire una chiave di evento ciclo-negativo, registrarla una sola volta per non impedire ogni successiva compilazione manuale PM. La correzione della stessa riga da POSITIVO a NEGATIVO non è letteralmente “nuovo ciclo”: esito P-9. Ordine del batch manuale SI + nuovo negativo: proposta prevale negativo, history conserva entrambe le cause, da confermare. Ordinamento ultimo ciclo proposta ordinal di apertura, non ultimo aggiornamento (P-9).

KO non forza NO da solo: genera alert PM, chiuso da una decisione **manuale** di Fatturabile nella relativa fase KO. Default NO, SI automatico o decisione di un KO precedente non lo chiudono (§6, D-37/D-44). Fatturato è soltanto manuale SI/NO; la nuova iterazione lo resetta null (D-25/D-37).

### 5.5 Prove offline delle formule

| Input/evento | Atteso |
|---|---|
| Progetto valorizzato + incarico diverso | PE_TYPE da Progetto; svuotando Progetto torna a incarico |
| Template senza Progetto | PE_TYPE da incarico; output manuale rifiutato |
| Assegnazione Geologica 2026-12-20 | Forecast 2027-01-04, senza skip festività |
| ILIAD assegnazione 2026-01-31 | Protocollo forecast 2026-03-02 (+30 calendario) |
| Protocollo 2026-01-01 in TWN/INWIT/LEO | Base 2026-03-09 (+67); stesso protocollo ILIAD/TIM/FV non calcola forecast |
| Integrazione richiesta 2026-02-10, invio 2026-02-20; check 2026-02-25 | remaining 12, durata 10, forecast 2026-03-19 secondo proposta |
| Check a 15 / 16 giorni dalla base | Eleggibile / non eleggibile, non rivalutato il giorno successivo |
| Due integrazioni eleggibili durata 10 e 4 | Base+4 se ultima è seconda secondo policy; non Base+14 |
| Forecast modificato manualmente, poi protocollo cambia | Valore manuale invariato, nessun toast di sovrascrittura |
| Negativa durata, invio prima richiesta, base assente, overdue | Fixture P-8; rifiuto/diagnostica adottati esplicitamente |
| Clearing e ri-compilazione Invio stesso rowId | Non duplicare check; fixture di policy P-8 |
| Cambio formula automatico nascosto dalla UI | Valore e storico aggiornati comunque |
| Permessi oggi−29 / oggi−30, ultimo ARPA POSITIVO | NO / SI automatico, salvo blocco manuale |
| Positivo vecchio + ultimo ARPA NEGATIVO o vuoto | Nessun SI automatico |
| PM sceglie NO a soglia già superata | Resta NO dopo job e salvataggi |
| Nuova riga ARPA negativa dopo SI manuale | NO forzato una volta; flag manuale conservato |
| Solo stato KO, default Fatturabile NO | Alert aperto, non chiuso dal default |
| Ripresentazione | Fatturabile NO, Fatturato null, formulaMeta nuovo |
| Retry / conflitto revision | Un solo storico/toast o zero modifiche, rispettivamente |

Inserire clock fisso, timezone Roma e date bisestili; non usare festività nel calcolo calendario. Le fixture con decisione pendente sono test di diagnostica finché la memoria adotta la policy, non aspettative arbitrarie.


## 6. Motore degli alert WT8 e scheduler

### 6.1 Catalogo delle regole, soglie e destinatari

PM significa utenti attivi con membership(template,PM_PERMESSI,PM,leader=true). Leader di gruppo significa utenti attivi con membership dello **stesso template**, gruppo richiesto, leader=true. Deduplicare per userId, anche se più ruoli soddisfano la regola. Nessun sostituto se una quota non ha leader; log MISSING_LEADER per quota, senza deviare ad ADMIN o all'autore. PM leader e leader PM_PERMESSI possono essere insiemi diversi (D-45; G §10/§17.10; R-1 D3).

| ruleId | Scadenza / condizione di apertura | Chiusura | Destinatari / canali |
|---|---|---|---|
| SOPRALLUOGO | Data assegnazione +7 lavorativi, sopralluogo vuoto | Sopralluogo compilato | PM + leader PM_PERMESSI; in-app |
| VERBALE | Sopralluogo +3 lavorativi, verbale vuoto | Verbale compilato | PM + leader PM_PERMESSI; in-app |
| FORECAST_UT | Forecast UT −2 lavorativi, Invio AS/VS vuoto | Invio AS/VS compilato | PM + leader UT_PE; in-app **e mail** |
| FORECAST_PE | Forecast PE −4 lavorativi, Invio PE vuoto | Invio PE compilato | PM + leader UT_PE; TIM anche leader DL; in-app |
| FORECAST_AIE | Forecast AIE −2 lavorativi, Approvazione AIE vuota | Approvazione AIE compilata | PM + leader AIE; in-app **e mail** |
| PERMESSI | Forecast Ottenimento Permessi +3 lavorativi, Ottenimento vuoto | Ottenimento compilato | PM; in-app |
| PARERE_ARPA | Forecast Parere Arpa +3 lavorativi, parere della stessa riga vuoto | Parere stessa riga compilato | PM + leader gruppo owner PM_PERMESSI secondo D-45; in-app; include LEONARDO |
| CDMS_EM | Invio CDMS +una settimana, EM data vuota; reminder settimanali | EM **data** compilata | PM + leader PM_PERMESSI secondo D-45; ILIAD/CELLNEX; in-app |
| OFFERTA_ODA | Invio Offerta +una settimana; reminder settimanali | **Manuale** leader PM_PERMESSI/ADMIN dopo ODA previsti; non basta primo ODA | PM + leader PM_PERMESSI secondo D-45; in-app |
| ODA_FV_ASSEGNAZIONE | Data assegnazione; soglia/condizione non definite | Non specificata | PM + leader PM_PERMESSI secondo D-45; binding disponibile, policy P-3 |
| ODA_FV_PACCHETTO | Invio Pacchetto Permessi; soglia non definita; Stato ODA diverso da PRESENTI | Stato ODA=PRESENTI | PM + leader PM_PERMESSI secondo D-45; policy P-3 |
| FINE_LAVORI_DL | Forecast CIL +20 lavorativi, Data FL vuota | Data FL compilata | PM + leader DL; in-app |
| FATTURABILE_KO | Ingresso nello stato KO; Fatturabile non deciso manualmente per questo episodio | Decisione manuale Fatturabile del PM per episodio KO | PM; in-app |

Fonti: D-37/D-43–D-46, G §12/§17.10. Dove G dice soltanto “secondo regola PM/leader”, la tabella esplicita l'applicazione di D-45 al gruppo proprietario, senza inventare altre mail. Soglie numericizzate in configurazione ADMIN per cliente, con versione effettiva e audit; non modificare arbitrariamente destinatari/chiusure tramite configurazione.

### 6.2 Binding completi per i sei template

Ogni cella è cliente della colonna + #riga/id_flusso; per UT/PE/DL riporta il **master**, non il popup PM. AIE: forecast PM dopo B2, chiusura master AIE dopo B1 (§2.2). ARPA: sempre stessa rowId.

| Regola: trigger → chiusura | ILIAD | TOWERNET | TIM-FIBERCOP | INWIT | FASTWEB-VODAFONE | LEONARDO |
|---|---|---|---|---|---|---|
| SOPRALLUOGO | #27/F027 → #29/F029 | #20/F020 → #21/F021 | #26/F026 → #28/F028 | #23/F023 → #24/F024 | #25/F025 → #27/F027 | #21/F021 → #22/F022 |
| VERBALE | #29/F029 → #30/F030 | #21/F021 → #22/F022 | #28/F028 → #29/F029 | #24/F024 → #27/F026 | #27/F027 → #28/F028 | #22/F022 → #23/F023 |
| FORECAST_UT | #147/F126 → #156/F135 | #96/F086 → #105/F095 | #106/F087 → #115/F096 | #104/F092 → #113/F101 | #86/F063 → #95/F072 | #97/F082 → #106/F091 |
| FORECAST_PE | #166/F140 → #175/F149 | #111/F096 → #120/F105 | #122/F097 → #132/F106 | #123/F106 → #132/F115 | #66/F073 → #67/F087 | #113/F092 → #128/F106 |
| FORECAST_AIE | #60/F057 → #143/F124 | #36/F036 → #92/F040 | #46/F045 → #102/F049 | #46/F043 → #100/F047 | #41/F040 → #82/F044 | #35/F035 → #93/F039 |
| PERMESSI | #78/F070 → #79/F071 | #45/F045 → #43/F043 | #53/F052 → #54/F053 | #55/F052 → #53/F050 | #48/F047 → #49/F048 | #44/F046 → #45/F047 |
| PARERE_ARPA | #84/F076 → #85/F077 | #51/F051 → #52/F052 | #59/F058 → #60/F059 | #61/F058 → #62/F059 | #51/F050 → #52/F051 | #49/F051 → #50/F052 |
| FINE_LAVORI_DL | #188/F159 → #190/F161 | #131/F115 → #133/F117 | #142/F116 → #144/F118 | #143/F125 → #145/F127 | #122/F106 → #124/F108 | #138/F116 → #140/F118 |

| Regola specifica | Cliente, trigger | Chiusura / riferimento |
|---|---|---|
| CDMS_EM | ILIAD #125/F108 Invio CDMS, solo Committente CELLNEX #4/F004 | ILIAD #128/F109 EM DATE; **non** #126/F111 EM SELECT e **non** #127/F110 Numero EM |
| OFFERTA_ODA | ILIAD #116/F099 Invio Offerta DATE | Manuale; ODA #119/F102 e Note #120/F103 sono evidenza, non chiusura automatica |
| OFFERTA_ODA | TOWERNET #65/F065 Data Invio Offerta | Manuale; ODA #13/F013 e Note #14/F014 |
| OFFERTA_ODA | TIM #70/F069 Data Invio Offerta | Manuale; ODA #16/F016 |
| OFFERTA_ODA | INWIT #74/F071 Data Invio Offerta | Manuale; ODA #14/F014 e Note #15/F015 |
| OFFERTA_ODA assente | FV e LEONARDO non hanno Offerta | Non inventare regola FV dal titolo generale; LEONARDO escluso esplicitamente |
| ODA_FV_ASSEGNAZIONE | FASTWEB-VODAFONE #25/F025 Data assegnazione | P-3: prima chiusura mancante nella fonte; Stato ODA #14/F014/ODA #15/F015 disponibili |
| ODA_FV_PACCHETTO | FASTWEB-VODAFONE #47/F046 Invio Pacchetto Permessi | #14/F014 Stato ODA=PRESENTI |
| FATTURABILE_KO | Tutti: statoAttivita trasversale=KO | Trasversale fatturabile, origine manuale PM dopo ingresso episodio; nessun Fxxx, alias ILIAD #121/F104 solo sorgente |
| AUTOCERTIFICAZIONE non definita | TOWERNET #61/F061 e INWIT #71/F068: “Forecast ... >=67” | Nessuna regola WT8 nominata, confronto data/numero non valido: P-3 |

ILIAD #44/F044 Invio offerta è un **altro campo**, non il trigger Offerta F099 della fatturazione. D-30 vieta matching case-insensitive delle label per decidere l'identità. D-31 vieta che una condizione UI disattivi gli alert; il filtro ILIAD/CELLNEX è invece ambito **esplicito della regola**, non un effetto collaterale di una condition.

ODA FV non è implementabile completa dalla sola tabella: nessun default “+0” o “+7” non dichiarato. Configurare regola PENDING_POLICY e diagnostica, non produrre alert di scadenza falsi. La memoria può far avanzare gli altri alert mentre il collaboratore chiude P-3.

### 6.3 Calendario lavorativo, festività mobili e Roma

Proposta business calendar: lunedì–venerdì esclusi giorni nazionali; definizione del sabato non è esplicitata da D-43 e va ratificata in P-3. Mai festività patronali locali. Distinguerlo da addCalendarDays usato dalle formule.

Calendario versionato per anno: 1 gennaio, 6 gennaio, 25 aprile, 1 maggio, 2 giugno, 15 agosto, **4 ottobre dal 2026**, 1 novembre, 8 dicembre, 25 e 26 dicembre; Pasqua gregoriana e lunedì di Pasqua calcolati per anno. Non reintrodurre festività soppresse né spostare festività al lunedì per sostituzione. Pasqua è già domenica ma si registra come festività per completezza; controllare feste sovrapposte senza contarle due volte. L'elenco istituzionale preesistente va integrato con la legge 151/2025: San Francesco d'Assisi è festa nazionale dal 1 gennaio 2026. [Calendario della Presidenza del Consiglio](https://presidenza.governo.it/ufficio_cerimoniale/cerimoniale/giornate.html), [legge 151/2025, articolo 1](https://www.gazzettaufficiale.it/atto/serie_generale/caricaArticolo?art.codiceRedazionale=25G00153&art.dataPubblicazioneGazzetta=2025-10-10&art.flagTipoArticolo=0&art.idArticolo=1&art.idGruppo=0&art.idSottoArticolo=1&art.idSottoArticolo1=10&art.progressivo=0&art.versione=1), [pubblicazione ed entrata in vigore](https://www.gazzettaufficiale.it/eli/id/2025/10/10/25G00153/SG).

addBusinessDays esclude il giorno di partenza e conta n giorni nella direzione richiesta, quindi rollForwardBusinessDay e ore 09:00 Europe/Rome. Per soglie “prima” sottrarre giorni lavorativi, poi applicare comunque la policy del roll. Memorizzare dueDate civile, dueAt UTC, calendarVersion e ruleVersion; non calcolare l'anno solo dal trigger, perché +20 può attraversare Capodanno.

“Una settimana” iniziale e reminder settimanale non dicono esplicitamente 5 lavorativi o 7 calendario. Proposta da confermare P-3: prima soglia =5 lavorativi; ricorrenza =7 calendario dall'ancora del reminder, roll al primo lavorativo successivo. Non sommare ogni settimana 5 lavorativi né lasciare che un rollover faccia slittare progressivamente l'ancora. Solo CDMS_EM e OFFERTA_ODA hanno reminder settimanali deliberati: non estenderli agli altri alert.

Usare timezone esplicita via Intl/utility del progetto, date civili come tuple Y/M/D e conversione Roma→UTC; non affidarsi a TZ del container, offset fisso +01:00 o timer di 24 ore. Alle 09 Roma corrispondono 08 UTC d'inverno e 07 UTC d'estate. DST non deve spostare l'orario locale (D-43; G §17.10).

### 6.4 Dove gira il job e doppia esecuzione

Proposta: **processo worker separato della stessa applicazione**, immagine Docker condivisa app/worker, servizio Compose worker con restart unless-stopped e comando Node del bundle compilato. Resta Node/Mongo già in uso, niente Redis, cron SaaS o timer in un route handler. Il timer in Next/instrumentation viene duplicato tra processi/repliche e non garantisce che sia attivo quando non arrivano richieste.

Entry point proposto frontend/src/jobs/worker.ts; costruire dist/jobs/worker.js e includere dipendenze runtime nel runner. Il Dockerfile attuale copia soltanto .next/standalone, static/public: il sorgente TS e tsx devDependency **non ci sono**; node src/jobs/worker.ts nel runner attuale non funzionerebbe. Usare compilazione TS dedicata più dependency closure oppure bundle verificato nel build; non copiare tutte le devDependencies. Non cambiare frontend/src/lib/client.ts, che è di o3 (D-3/D-4; §8).

D-70 indica endpoint protetto da segreto con cron/container worker. Proposta di affinamento consentita dall'indicazione: worker importando il job service direttamente, senza endpoint pubblico necessario; se l'ambiente R-5 richiede invocazione HTTP, endpoint solo POST con segreto server-side, rate/lock e stessa orchestrazione, mai sessione utente come credenziale cron.

Worker fa tick breve, individua localDate/localTime Roma; per alert_daily il giorno è eseguibile alle 09:00, con ripresa nello stesso giorno se il processo parte dopo quell'ora. Se il giorno non è lavorativo, non consegnare gli alert: le dueDate sono già rolled. Al riavvio dopo più giorni, rivalutare il corrente stato e inviare al prossimo slot valido un solo alert/reminder dovuto per episodio, senza una mail per ogni giorno saltato. L'istante reale di recupero viene registrato; nessuno può garantire consegna alle 09 se l'host è spento (P-12).

Schema acquisizione atomica: job_locks._id=alert_daily, ownerId casuale, leaseUntil e fencingToken crescente; update solo con lease scaduta o stesso owner. job_runs unique(jobKey,localDate) passa READY→RUNNING→DONE; errore lascia cursor/retry e non DONE. Heartbeat mantiene lease; ogni commit controlla token/lease corrente e revisione pratica. Il job segnato RUNNING non è “già concluso”: takeover dopo crash deve riprenderlo. Chunk/cursor per non scandire tutte le pratiche in una transazione.

Nelle transazioni per pratica: leggere corrente iterazione e archive; formule temporali Fatturabile; riconciliare alert; creare notifiche/outbox; CAS revision e commit. Il vecchio worker che ha perso lease non può commettere grazie al controllo fencing effettuato nello stesso commit. Conflitto archive/resubmit→retry che scarta l'episodio non più eseguibile. Query candidati indicizzate su dueAt/status/archived, senza filtering dei campi nascosti.

### 6.5 Idempotenza, episodi, chiusure e recapito

Chiave episodio = (practiceId,iterationId,ruleId,repeatRowId|null,generation). generation cambia solo per nuova fase documentata: nuova riga ARPA, nuovo KO, nuovo trigger dopo cancellazione/chiusura secondo policy P-3; **non** a ogni tick o aggiornamento irrilevante. Finché un episodio resta aperto, cambiare forecast aggiorna dueAt e audit, non crea alert paralleli. Chiusura manuale mantiene tombstone per l'episodio: il prossimo job non lo riapre automaticamente.

Notifica apertura unique(alertId,userId,OPEN); reminder unique(alertId,userId,REMINDER,slotDate). Snapshot dei destinatari per ogni emissione; nuovi leader valgono per emissioni successive, senza modificare lo storico delle precedenti. Indici unique e transazione sono l'autorità, non la sola lettura “esiste già?”.

Chiusure da compilazione avvengono nel salvataggio campi, non soltanto alle 09; job riconcilia le eventuali inconsistenze. Chiusura manuale endpoint verifica leader competente dello stesso template/gruppo o ADMIN, con eccezione più stretta OFFERTA_ODA leader PM_PERMESSI/ADMIN. Lettura notifica/read-all non chiude. Fatturabile KO si chiude per evento di compilazione manuale anche NO→NO, distinto dalla normale detection “value changed”. Alert chiuso da salvataggio manuale Fatturabile registra autore e causa FIELD_MANUAL, pur essendo la riconciliazione automatica dell'alert (D-37/D-44/D-46; G §17.10).

Archivio: nessuna nuova apertura/reminder, nessuna modifica dei dati congelati da job; conservare gli alert e marca sospensione tecnica, openAlerts del lavoro attivo li esclude. Ripristino: rivalutare input, chiudere se già risolto, riprendere senza arretrati multipli; non spostare per il solo archivio la data trigger. Ripresentazione: stop definitivo episodi dell'iterazione precedente con motivo SUPERSEDED, log preservato; non inviare reminder né ricalcolare vecchia iterazione (D-25/D-28).

Outbox separa transaction e SMTP: claim con lease, stato PENDING/SENDING/SENT/FAILED, tentativi e backoff; controllare ancora archive/corrente prima di autorizzare l'emissione. Una mail già affidata al server SMTP non può essere ritirata se subito dopo viene archiviata: confine temporale dell'autorizzazione registrato nel log. D-21 mail obbligatorie Assegna e D-46 UT/AIE non devono essere soppresse dalle preference attuali del notificationService né dall'esclusione dell'attore. Deduplicare appartenenze, non persone distinte.

Notifica a DL quando PM assegna PE: evento semantico esplicito, da collegare al salvataggio Assegnazione PE (ILIAD #101/F093; TOWERNET #73/F073; TIM #79/F070; INWIT #82/F079; FV #64/F061; LEONARDO #69/F064) o al comando secondo decisione P-7; non confonderlo con auto-fill Incarico PE. Destinatari gruppo DL del template secondo D-46, senza attivare automaticamente DL. Assegna gruppi D-21 resta evento separato.

SMTP non garantisce exactly-once se il processo muore dopo accettazione ma prima di SENT: chiavi stabili e Message-ID limitano duplicati, non provano deduplica del provider. Proposta consegna at-least-once con rischio residuo dichiarato, da accettare P-13; idempotenza dei record alert/notifiche è invece garantita nel DB. Nessun nuovo provider viene proposto.

Log alert_events append-only: pratica/iterazione/regola/row/episodio, inputHash, dueDate/dueAt, timezone/calendarVersion/ruleVersion, apertura, snapshot destinatari, omissioni leader, reminder slot, outbox/tentativi/errori, chiusura AUTO/MANUAL con autore/campo, sospensione/ripresa/superseded. Mai token/password o contenuti non necessari (D-44/D-47; G §17.10/§17.12).

### 6.6 Prove offline del calendario e del worker

| Caso | Atteso |
|---|---|
| Venerdì +1 lavorativo | Lunedì non festivo, ore 09 Roma |
| 2026-04-03 +1 lavorativo | 2026-04-07: sabato/domenica/Pasquetta esclusi |
| 2026-12-24 +1 lavorativo | 2026-12-28: Natale, S.Stefano, domenica esclusi |
| 2027-10-01 +1 lavorativo | 2027-10-05: 4 ottobre nazionale dal 2026 |
| 2025-10-03 +1 lavorativo | 2025-10-06: 4 ottobre non ancora festa nazionale, comunque sabato |
| 29 febbraio / fine anno / Pasqua coincidente con altra festa | Date vere, festività deduplicate, anno successivo caricato |
| 09 Roma prima/dopo cambio DST | Stessa ora locale, offset UTC corretto |
| Forecast UT a 2 giorni / PE a4 / AIE a2; output già compilato | Apertura alla soglia / nessuna apertura se risolto |
| ARPA due righe | Una chiusura non risolve l'altra; ultimo ciclo per formula è calcolato separatamente |
| ILIAD EM SELECT o Numero EM compilati | CDMS resta aperto finché EM DATE non è valorizzata |
| ILIAD F044 valorizzato, F099 vuoto | Nessun alert Offerta da F044 |
| ODA presente ma offerta non chiusa manualmente | Alert Offerta resta aperto, reminder dovuto |
| Nessun leader AIE | Quota AIE omessa e loggata; quota PM inviata se presente |
| PM con più memberships / attore destinatario | Una notifica per persona; attore incluso |
| Due worker acquisiscono lo stesso giorno | Uno proprietario; unique impedisce duplicati |
| Crash prima commit / dopo commit / dopo SMTP | Retry atomico / nessun doppio record / rischio mail P-13 tracciato |
| Lease scaduta, vecchio worker continua | Fencing rifiuta commit; nuovo worker riprende cursor |
| Lettura notifica / chiusura manuale / refresh | Lettura non chiude; chiusura non riapre stesso episodio |
| Pratica archiviata / nuova iterazione | Zero nuove emissioni per archivio/iterazione precedente |
| Restore dopo tre settimane | Stato attuale rivalutato, una emissione dovuta, niente raffica arretrata |
| KO nuovo con default NO / PM salva NO | Aperto / chiuso da decisione manuale anche senza cambio valore |
| Soglie ADMIN cambiate | RuleVersion nuova e riconciliazione adottata, test P-3 per episodi aperti |
| Host spento alle09 | Catch-up singolo e log ritardo, non promessa di puntualità falsa |

Usare calendario puro, clock finto, repository in memoria e SMTP finto; concurrency/lease richiedono anche replica set Mongo **locale** (§8). Nessun invio email reale nelle prove.


## 7. Modifiche proposte al contratto dati della famiglia v0.1

### 7.1 Base verificata e ordine di adozione

Durante la ricognizione il contratto è passato da v0.1.2 a **v0.1.5**; ultima verifica del documento e di lib/contract.ts allineata a v0.1.5. Questa proposta recepisce gli aggiornamenti senza modificarli. **Già risolti, non da richiedere di nuovo**: parentFlowId ISTAT (0.1.3), revision nei salvataggi/comandi e due coordinate NUMBER (0.1.4), TemplateDTO.occurrences e quantificatori delle condizioni cross-repeat (0.1.5).

Le estensioni seguenti sono proposte: memoria decide e aggiorna il documento; poi o2 aggiorna contract.ts e Zod; o3 adegua UI/client.ts nel proprio perimetro. Nessun endpoint o campo qui proposto è approvato dalla sola presenza in questa architettura (D-3–D-5; G §20.5). P-11 raccoglie i cambi strutturali; i punti funzionali mantengono il proprio P-n.

### 7.2 Elenco puntuale delle estensioni ancora necessarie

| ID interno | Punto del contratto | Proposta concreta | Perché / fonte |
|---|---|---|---|
| C-01 | §3 TemplateDTO, §5 dettaglio | templateVersion immutabile e iterationId in dettaglio e IterationRefDTO; sourceVersion/overrideVersion almeno nel manifest server | Leggere iterazioni vecchie con il proprio schema, ID interni D-24/D-29/D-47; §1 |
| C-02 | §5 revision | Esplicitare revision globale pratica, sempre crescente anche dopo resubmit; expectedIterationId nei comandi sensibili alla corrente iterazione, oltre a iteration nel PATCH | Evita collisione revision 1 vecchia/nuova; schema §1, D-25/D-41/D-42 |
| C-03 | §5 creazione, PATCH, comandi, §8 close | operationId o Idempotency-Key validato, ambito utente e hash payload; retry identico stessa ricevuta, stessa chiave con payload diverso409; errore 409 con currentRevision/currentIteration e codice stabile | Assegna “a ogni comando” non equivale “a ogni retry”; D-21/D-44/D-47 |
| C-04 | §5.2 FieldChange | occurrenceKey per modifica campo; flowId coerente, controllo MASTER; trasversali usano chiavi già previste. In alternativa dichiarare formalmente scrittura per campo logico sempre al master e non per occorrenza | Il payload attuale non distingue MIRROR da MASTER, mentre il testo chiede verifica per occorrenza; D-18/D-30, §3 |
| C-05 | §3 ComputedDTO e §5 access | writableMode=NEVER/MANUAL_LOCK/MANUAL_OVERRIDE secondo formula; dettaglio espone solo mode/manualLocked/lastReason utili alla UI | Forecast Permessi calcolato ma modificabile; “computed” non basta a stabilire accesso; D-32/D-34/D-42 |
| C-06 | §5 OccurrenceAccessDTO | Aggiungere PAST_ITERATION; definire ordine dei reason e che ADMIN non modifica mirror/archivio/passato; policy trasversali esplicita | Lettura delle vecchie iterazioni è readonly ma manca motivo; D-18/D-23/D-28/D-47, P-7 |
| C-07 | §3 condizioni | Riscrivere “backend ricontrolla in scrittura” come valutazione informativa/progress, senza negare permesso solo per condition=false; adottare stesso evaluatore semantico v0.1.5 | Conflitto reale con D-31/G §11; non cambiare quantificatori già adottati |
| C-08 | §3 RepeatGroupDTO, §5 repeat | schemaKind=FIELDS/VINCOLI e rowPolicy=DYNAMIC/FIXED; ConstraintRowDTO con constraintCode,stateCode,ente (lista/scelta), origin/warning; richiesta discriminata per aggiornarlo | flow Vincoli TEXT e FieldValue attuale non rappresentano 11 stati ed enti senza flow inventati; D-35/G preamboli MD, P-10 |
| C-09 | §5 dettaglio/repeats | Letture ripetibili paginabili per gruppo e cursore, total/hasMore; dettaglio indica completezza. Accesso e progress calcolati sul dataset completo | D-36 senza limite, non obbliga risposta JSON infinita; §1.2/§2.6. Non troncare silenziosamente l'array |
| C-10 | §5 ADD_ROW | Possibilità di initialValues validati oppure risposta con mapping clientRowKey→rowId; ordinal server e DELETE senza rinumerare. Per ARPA precisare Ripresentazione Pratica data/azione | Permette nuovo repeat e valori atomici; evitare rowId inventati/client index; D-36/D-47, P-6 |
| C-11 | §3 ListRefDTO, §4 assignable | Identità dei valori utente come SelectValue.code=id utente, sentinella NESSUNO esclusiva; filtri ruolo/template/active; chiarire ruolo multiplo se necessario e domain derivato PE_TYPE | D-39/D-72; UPPER_SNAKE_CASE per domini non è applicabile a ObjectId. P-6, §2.5 |
| C-12 | §6 liste | listRevision e locking su PUT; codici usati disattivabili, non cancellabili/rinominabili; etichetta storica conservata; rule/calendar config DTO con soglie e revision per ADMIN | Evitare due leader che si sovrascrivono o invalidano dati; D-40/D-46 |
| C-13 | §5.3 stato | Provenienza automatica/manuale e policy adottata; eventuale comando/richiamo “automatico” solo se memoria adotta P-2 | Precedenza manuale non definita; non far apparire reset già deliberato, D-23/D-41 |
| C-14 | §5 iterazione passata | Definire quali campi sono snapshot della selezionata (values, repeats, stato, G7, trasversali, progress), quali globali (archive/origin/identità pratica); actions tuttefalse, revision corrente identificata separatamente | PraticaDetailDTO eredita summary corrente ma restituisce storico: può mescolare epoche; D-25/D-47 |
| C-15 | §7 storico | Distinguere endpoint/DTO di valore e timeline; target trasversale, source USER/SYSTEM/IMPORT, operationId, reason formula; ROW_REMOVE con snapshot tipizzato o entries per valori | HistoryEntryDTO.flowId non identifica NoteOperative/Fatturabile/Fatturato, detail libero non sostituisce dato; D-37/D-47 |
| C-16 | §8 alert/notifiche | link con iterationId/n, rowId, repeat e occurrenceKey/sectionKey; closeReason e suspension/superseded separati da risoluzione; log paginato autorizzato per tutte le iterazioni | Due ARPA stesso flow hanno destinazioni diverse; archivio non è risoluzione, D-25/D-28/D-44/D-47 |
| C-17 | §8 chiusura alert | Definire policy competenza per regola, idempotenza episodio e risposta su CLOSED; revision episodio/operationId per evitare chiusura di evento sostituito; restituzione currentRevision se aggiorna pratica | Allineare canCloseManually con server; eccezione Offerta leader PM_PERMESSI, D-44/D-46 |
| C-18 | §5.3 assign | Tenere PATCH prima di Assegna come già concordato; Assegna auto-fill incarichi vuoti nella sua transazione e aggiorna revision. Stabilire evento notifica DL all'assegnazione PE e attore/gruppi abilitati | D-21/D-46; binding §6.5, P-7. Eventuale assegnazione campi+comando atomica solo se memoria cambia contratto |
| C-19 | §5 azioni/create | Policy canAssign/assignableGroups, rework archiviata e trasversali scrivibili; proposta canCreate per elenco o API server equivalente | Non inferire permessi dai pulsanti o dal gruppo; D-18–D-23/D-26/D-37, P-7 |
| C-20 | §5.1 progress | Definire conteggio master per riga repeat esistente e comportamento righe fisse, output readonly e field nullable; escludere mirror e trasversali | Formula filled/total deve essere uguale API/UI; requisito attuale non chiarisce repeat, D-29/G §9 |
| C-21 | copertura rinviata v0.2 | Proporre contratti separati KPI/export/carichi/import prima di B8/B9, senza introdurli furtivamente nella v0.1 | Rinviati nel contratto ma richiesti nel primo rilascio D-48/D-49; planifica adozione, non elimina requisiti |

C-12 soglie non aggiunge la possibilità di cambiare regole di chiusura o destinatari: D-46 autorizza le soglie. C-16 conserva OPEN/CLOSED del v0.1 se opportuno aggiungendo executionStatus, invece di inventare stati utente per sospensione tecnica.

### 7.3 Validazione e compatibilità

Validators strict sulle union, numeri finiti, data reale, code esistente/list kind, users ancora selezionabili e cascata ISTAT; altri valori già salvati ma disattivati restano leggibili e conservabili senza riscrittura. Nessun cast generico “FieldValue quindi valido per qualunque campo”. Nuova versione contrattuale adottata in blocco per DTO/validator/mapper; source manifest e snapshot template rendono interpretabili le vecchie iterazioni.

Regione/Provincia/Comune: parentFlowId già adottato; server controlla la coppia rispetto allo snapshot geografico. Cambio genitore con figlio incoerente deve proporre cancellazione o rifiutare422, non trasformare il dato in una città diversa in silenzio; policy da formalizzare C-12/P-14 (D-40; G §17.4).

Non mantenere in parallelo due identità operative slug e Fxxx dopo reset D-14: compatibilità di transizione solo per chiamate legacy dell'app, esplicita e temporanea, concordata sul confine o2/o3; nuovo DTO resta l'unico contratto definitivo (D-3/D-5/D-13).


## 8. Sequenza di implementazione per o2 e prove offline

### 8.1 Ordine, file e stime

PIANO B0/B1 già consegnati: non rifarli. Seguire B2→B3→B4→B6→B5→B7→B8/B9; i motori puri di B5/B7 si possono preparare prima dei route handler, senza parallelismo di scrittura sugli stessi file. Le stime sotto sono ore effettive indicative, prove incluse, **non durata di calendario**; assumono adozione dei punti pertinenti e riuso dell'inventario preparatorio o2. Sono più ampie delle 45–65h B2–B7 dell'analisi o2 perché includono transazioni, outbox, recovery e revisione dei casi limite. La memoria deve ricavare incarichi adottati, non avviare tutto con un unico compito (D-3/D-5/D-7/D-53/D-58/D-63; G §18/§20.5).

Percorsi proposti nuovi identificati come tali; nessuno è creato da questa consegna.

| Ordine / lavoro PIANO | File coinvolti | Dipendenze / risultato verificabile | Stima | Prove richieste |
|---|---|---|---|---|
| 0. Adottare estensioni B1 | memoria: contratto; poi o2 lib/contract.ts, lib/validators.ts, src/types/ e next-auth.d.ts | §7 adottato; conservare legacy D-60 finché cutover | 3–5h | Tipi e schema Zod coerenti, DTO fixture, build legacy resta verde |
| 1. B2 compilatore e diagnostica | nuovi scripts/compile-templates.ts, lib/templates/compiler.ts, src/data/templates/, src/data/template-overrides.json; riuso _inventario | D-73: riconoscitore + traduzioni validate memoria; applicare R-1 B1–4 come dati | 10–14h | Conteggi876/749, 49 formulazioni, master/mirror, flow continuo, hash e snapshot per cliente, DA_TRADURRE non nascosti |
| 2. B3 persistenza transazionale | lib/db.ts, nuovi lib/repositories/, src/types/db.ts, docker-compose.yml (replica set/init), scripts/bootstrap-db.ts | Compilati disponibili; M/memoria adotta replica set §1; getDb privo reset | 8–12h | Indici, rollback, compare-and-swap, operationId, incoerenza summary/repeat impossibile |
| 3. B3 script reset/seed | services/seed.ts, scripts/reset-local.ts, file esempio ambiente, fixture demo | D-69: backup→dry-run→run, SEED_DEMO=true, environment esplicito; account produzione R-10 | 4–6h | Dry-run zero scritture, seed due volte stessi ID/conteggi, password manuale preservata, niente seed in production |
| 4. B4 utenti/accesso | services/users.ts, lib/auth.ts, lib/api.ts, src/types/next-auth.d.ts, nuovi lib/engines/access.ts, app/api/me e users/assignable | Modello, policy P-7 adottate; sessione vecchia mantenuta fino D-68 | 6–9h | Matrixtemplate×group×role×leader×admin×archive×iteration, revoca immediata, membership $elemMatch, mirror semprereadonly |
| 5. B6 liste e ISTAT | nuovi services/lists.ts, services/istat.ts, app/api/lists e istat; src/data/istat/ ufficiale con README, lists seed | B3/B4; D-71 dataset/licenza, override D-72; non attendere tutto B5 | 5–8h | CSV parse/provenance, codici stabili, Altro locale, cascata, utenti di ruolo giusto; PUT concorrenti |
| 6. B5 motori stato/formule | nuovi lib/engines/state.ts, formulas.ts, civil-date.ts e fixture; bindings versionati src/data/ | Template/decisioni P-2/P-4/P-6/P-8/P-9 pertinenti; policies pure | 10–16h | Tabelle §4/§5; congelare clock; regressioni su clearing, batch e manual lock; fixture pendenti diagnostiche |
| 7. B5 servizi/API pratiche | nuovo services/pratiche.ts o namespace v2 con repository; mappers/validators; app/api/templates, practices/resolve-template, fields, iterations e comandi | B4/B6/motori; orchestrazione transazione, storico, toasts, recipient events | 12–18h | Tutto-o-niente,403/409/422, gruppi non esclusivi, doppio Assegna, resubmit/rework distinti, G7 duplicato |
| 8. B7 alert e recapito | nuovi lib/engines/alerts.ts, business-calendar.ts, services/alerts.ts, outbox.ts; notifications.ts, email.ts, app/api/alerts/close e notifications | B5; soglie/chiusure P-3 adottate, nessun fallback leader | 10–16h | Tutte12 famiglie WT8 (ODA FV due regole), specificità clienti, holiday2026, destinatari/channel, manual close, HTML escape |
| 9. B7 worker e packaging | src/jobs/worker.ts, scripts/build-worker, Dockerfile, compose, package.json/tsconfig dedicati, env esempio | B7, scelta D-70/R-5, outbox+lease+fencing; bundle e dipendenze runtime inclusi | 5–8h | Due worker, crash/resume, tickDST, host fermo, container nonroot, bundle parte senza tsx/src/devDependencies |
| 10. B8 storico/KPI/export | services/audit.ts, nuovi history/timeline/export, stats.ts; app/api/history, stats/export; contratto v0.2 prima | B5/B7, D-47/D-48; statistiche su pratica intera, ACL per gruppo/cliente | 8–12h | Storico di due iterazioni, trasversali, firstassignment→ultimoTERMINATO, mediane, hidden inclusi, CSV ordinato template |
| 11. B9 import v2 | services/import.ts, app/api/import, validator/DTO v0.2 | B5/B6, D-49; riuso solo parsing xlsx/serialdate | 5–8h | Non sovrascrive compilati, G7 nuovo→rework, più match→scelta, codici e date validi, audit batch |
| 12. Cutover integrato locale | o2 rotte collisioni/sessione/constants/types; o3 pagine/client/components **tramite memoria**; compose/config | D-60/D-62/D-68: nuovo modello e nuove pagine insieme, vecchio modulo non rimosso prima; reset esplicito | 4–6h | Build/lint/prove, smoke dei sei template con account demo, restore locale del backup, URL coerenti3100 |

B2–B7 qui stimati circa **77–118h inclusi adeguamento contratto e cutover**; B8/B9 altri13–20h. Intervalli non sommati a quelli di o2: sono stima alternativa della soluzione più completa, da rivedere dopo decisioni e primo modulo. Correzioni R-1 entrano nei dati del compilatore, non bloccano bootstrap/auth/motori indipendenti. Se si riduce lo scope, dichiarare esplicitamente cosa rinvia la memoria, senza omettere atomicità/storico/alert dal requisito.

B10 AI non avviato: R-3 è aperto, D-50 riguarda comportamento futuro, nessuna dipendenza AI per l'architettura corrente. Commenti/@menzioni non portati automaticamente nel modello nuovo, R-7; file legacy Python non cancellati/archiviati da questa architettura, R-12. Credenziali demo/secret di esempio trattati prima produzione secondo R-10, senza includerli nelle fixture condivise. Node locale20.18.3 ha un rinvio R-11; usare toolchain Docker compatibile o scelta M, non aggiornare autonomamente il sistema.

### 8.2 Prove pure senza rete né database

Usare **Vitest già presente** (D-59/D-63), ambiente node per i test server; nuovi test o2 proposti sotto frontend/src/lib/engines/__tests__/ e frontend/src/services/__tests__/ con annotazione @vitest-environment node, così il runner esistente li vede. È la suite lato server permessa da D-9; non modificare test/componenti di o3 né aggiungere una libreria concorrente.

Motori non importano getDb(), auth runtime o email; fakeClock, repository in memoria, mailSink in memoria e fixture dei sei template. Mock fail-fast per qualsiasi richiesta HTTP/SMTP non prevista. Nessuna dipendenza dalla data attuale o dai valori di .env di root. Coprire comportamento e regressioni, non una copia riga-per-riga dell'implementazione.

Gate per modulo: typecheck con node node_modules/typescript/bin/tsc --noEmit (D-63), test Vitest mirati con yarn, diagnostica compilatore. Gate cutover: yarn lint, yarn test, yarn build, senza reset implicito né bisogno DB online. Il build deve includere JSON compilati già disponibili: Docker build context ./frontend non vede docs/baseline esterna; compilare prima fuori Docker, includere snapshot input autorizzati o cambiare build context esplicitamente. Non copiare cartella root con .env/backup soltanto per raggiungere gli MD.

L'evaluatore client di o3 esiste (D-75): verificare fixture condivise condition v0.1.5/D-74 sul server e sul client, con adozione tramite memoria, evitando due semantiche. Nessuna lettura di un campo nascosto lo elimina.

### 8.3 Integrazione con Mongo soltanto locale

Usare Mongo7 replica set locale su container/test database dedicato, URI obbligatorio senza fallback; allowlist host loopback o servizio mongo del Compose test, DB prefisso practicehub_test e credenziali demo locali. Refuse-run se URI non riconosciuto locale. Confermare health PRIMARY prima di suite transazioni. Il reset della fixture agisce solo su quel DB dedicato, non sul DB beta.

Scenario essenziale: due save sulla stessa revision→uno200/uno409; batch con una voce rifiutata→zero effetti; fault dopo aggiornamento righe ma prima audit→rollback; withTransaction retry→una sola operations/history/outbox; archive/resubmit concorrenti con worker→zero nuovi episodi fuori corrente; perdita lease→fencing; duplicato outbox→una sola intention; caricamento snapshot multicollezione coerente.

Provare anche G7 uguale fra pratiche/iterazioni, nuova iterazione con ODA esclusi, Ente da vincolo PRESENTE idempotente e conservazione quando compilato, autore storico sopravvissuto a disattivazione utente. Nessuna chiamata a provider email, nessun test di login sulla preview.

**Non eseguire backend/tests/backend_test.py o pytest.ini**: fallback attuale alla preview online, account/API legacy; R-12 decide il loro destino. Non cambiarne addopts per far passare questa suite. Prove online solo con autorizzazione diretta M D-9/R-5 e fuori da questa consegna.

### 8.4 Criteri di consegna e limiti della verifica architetturale

Ogni modulo consegna comportamento utente, diagnostica/prove e differenze dal contratto adottato alla memoria secondo D-7; revisione del codice dei quattro motori complessi secondo D-53. Guida utente/checklist si aggiornano dopo funzioni consegnate/verificate, D-55.

Questa consegna è **solo documento**: inventario e riferimenti sono controllati sulle fonti; nessuna suite del progetto, replica set, scheduler, reset o formula implementata è stata eseguita. Le prove elencate sono il piano per o2, non risultati dichiarati. Non inviare a o2/o3 messaggi da questa sessione e non aggiornare PIANO/STATO/RINVII/DECISIONI.


## 9. Rischi e punti da decidere

Questi P-n sono **evidenze e proposte interne al documento**, non un secondo registro operativo dei rinvii. La memoria seleziona quelli da adottare/portare in RINVII; nessun numero R nuovo è assegnato qui. Si riportano problemi concreti, senza rimettere in discussione dominio degli stati, inventario, gruppi, D-31 o le altre regole già deliberate.

| Punto | Problema e decisione necessaria | Responsabile della decisione | Impatto / avanzamento possibile | Evidenza |
|---|---|---|---|---|
| **P-1 — Consolidamento R-1** | Risposta finale alle proposte B1–B4, D1/D2/D3 e conferme del controllo: per B3 decidere eliminazione seconda occorrenza PM o mirror. Applicazione provvisoria già autorizzata, non nuova richiesta di permesso. Non riaprire export/KPI di campi nascosti già D-31 | Collaboratore tramite M; memoria registra/aggiorna override | Solo occorrenze/policy coinvolte; compilatore e modello possono avanzare | R-1/ESITO B1–B4; §2.2 con tutti i #/flow; D-18/D-29–D-31 |
| **P-2 — Stato automatico e manuale** | Adottare mapping mancanti di PROTOCOLLATO/IN_APPROVAZIONE/AUTORIZZATO/DINIEGATO/TAR/REALIZZATO per ogni gestore; precedenza manuale, parità date e nuova integrazione retrodatata. Non inventare data di un SELECT né usare editedAt | Collaboratore definisce la regola; memoria formalizza binding/contratto | Motore generico e due trigger certi pronti indipendentemente; automazioni mancanti non dichiarabili complete | D-23/D-41; G §14; tabella §4.1, TWN #62/F062 e INWIT #72/F069 |
| **P-3 — Alert non determinati** | Soglie/chiusura prima ODA FV, soglia seconda; significato data “>=67” autocertificazione; ratifica lun–ven e settimana/reminder; nuova generazione dopo cancellazione/re-compilazione trigger e effetto soglie ADMIN sugli episodi aperti | Collaboratore per significato operativo; memoria per policy tecnica coerente e configurazione | Le altre WT8 implementabili; niente alert inventati su regole pending | D-43–D-46; G §17.10; FV #25/F025,#47/F046,#14/F014; TWN #61/F061, INWIT #71/F068 |
| **P-4 — Formula Forecast PSC** | Identificare vero input o confermare valore manuale: formula “Forecast PSC=Forecast PSC” è ciclo, non calcolo. Non sostituire automaticamente con Forecast PE | Collaboratore; memoria recepisce | Solo computed PSC interessato; condizione PSC=SI traducibile | FV #100/F075; LEONARDO #116/F094; G §13; §2.4 |
| **P-5 — Note PE LEONARDO** | Risolvere nota MASTER contro condition “sola visualizzazione” dell'unica occorrenza PM, con PE mirror: rendere chiaro quale sia il master scrivibile senza scelta arbitraria | Collaboratore; memoria aggiorna override/fonte secondo change control | Campo specifico in diagnostica; resto LEONARDO può avanzare | LEONARDO #70/F065 e #112/F065; D-18/D-29; G §9 |
| **P-6 — Tipi e domini incompatibili** | Eccezioni a D-72 TEXT per Data assegnazione LEONARDO e mirror AS/VS TIM; G7 INTEGER negli MD contro stringa contratto; cardinalità USERS D-72 per campi singoli; semantica Ripresentazione ARPA e ruolo Progettista/Tecnico non in D-39. Confermare eventuali eccezioni ai dtype vuoti, dominio PE_TYPE e sentinella NESSUNO, senza ripopolare indiscriminatamente da CSV | Memoria risolve contratto/tipi; collaboratore se serve significato operativo | Diagnosticare per campo; vietato scavalcare default D-72 o alterare flow | D-32/D-38–D-40/D-66/D-72; G §9/§17.11; sei MD #1/F001; LEO #21/F021, TIM #36/F096/#115/F096; ILIAD #87/F079,#50/F047; FV #36/F035 |
| **P-7 — Perimetro azioni e trasversali** | Mittenti ammessi di Assegna e gruppi raggiungibili; owner manuale NoteOperative/Fatturato; rework da origine archiviata; evento che significa “PM assegna PE” per notifica DL. ADMIN globale resta deliberato, non si reintroduce un ruolo ADMIN di gruppo | Collaboratore per policy mancante; memoria formalizza action/access e binding evento | Accesso ai master e azioni esplicitate D-23 già implementabili, sole policy mancanti configurate/pending | D-17–D-23/D-26/D-37/D-46; G §10/§17.2/§17.5; AssegnazionePE refs §6.5 |
| **P-8 — Controllo unico integrazione** | Giorno di confronto con base, forecast già scaduto, base assente, ordine “ultima”, clearing/correzione di Invio già controllato e durata negativa; comportamento ultima non eleggibile e lock quando si azzera forecast. Proposta base+durata ultima, mai cumulo tacito; fissare anche quando toast con output invariato | Collaboratore; memoria registra policy/formulaMeta e fixture | +67 e manual lock implementabili; check unico completo aspetta policy, nessun timer cambia eleggibilità ex post | D-42; G §13; TWN #44/F044/#45/F045/#48/F048/#50/F050; INWIT #54/F051/#55/F052/#58/F055/#60/F057; LEO #43/F045/#44/F046/#46/F048/#48/F050 |
| **P-9 — Fatturabile e cicli ARPA** | Ordinamento ultimo ciclo e significato di “nuovo negativo” su correzione stessa riga; batch negativo+manuale e revoca del SI automatico quando input è rettificato/svuotato. Base defaultNO, +30/positivo, lock e nuovo negativo non si riaprono | Collaboratore per casi non descritti; memoria formalizza eventi/versioni | Automazione base e storico pronti; fixture delle rettifiche isolate | D-37; G §12; esito/permessi di tutti i clienti §5.1; ILIAD #86/F078, LEO #51/F053 |
| **P-10 — Vincoli Naturalistici e rappresentazione** | Stati della undicesima voce non elencati nel preambolo; come rappresentare scelta Ente multipla indicata nella tabella, senza inventare nuovi Fxxx. Le 11 righe fisse e generazione Ente restano deliberate | Collaboratore per stati/ente; memoria per DTO strutturato | Schema/relazione implementabili, vocabolario specifico non da indovinare | D-35/D-56; G §17.6; preambolo TabellaVincoli sei MD; contenitori §2.6 |
| **P-11 — Contratto ancora incompleto** | Adottare le estensioni C-01–C-21 pertinenti, in particolare storico trasversali/timeline, Vincoli, identità iterazione, operationId, origine scrittura master/mirror e snapshot passato. Chiarire ricontrollo condition senza divieto dati, coerente D-31; tenere acquisiti gli aggiornamenti fino0.1.5 | Memoria, come proprietaria D-5; o2 implementa soltanto dopo adozione | Blocca solo interfacce coinvolte; motori puri possono avanzare sulle forme interne proposte | D-5/D-31/D-47/D-67/D-74; CONTRATTO §3/§5/§7/§8; §7 della proposta |
| **P-12 — Replica set, cutover e disponibilità** | Adottare replica set per atomicità multidocumento e worker; decidere ambiente/staging/topologia online e finestra reset/cutover/backup. D-68/D-69 già prescrivono transizione coordinata e reset esplicito; qui si definisce la realizzazione. Correggere URL host3100 vs default3000 e package runtime worker; demo soloopt-in prima produzione R-10 | Memoria per disegno locale; M per R-5, ambiente, dati e pubblicazione | Nessuna barriera a prove pure/locali autorizzate; online e reset reale fuori da questa consegna | D-9/D-14/D-60/D-68–D-70; ANALISI_SERVER_O2 R3/R4/R5; Compose/Dockerfile; §1/§6 |
| **P-13 — Garanzia di recapito SMTP** | Accettare limite at-least-once della mail quando SMTP ha accettato ma SENT non è persistito; outbox/Message-ID riducono duplicati. Non promettere exactly-once, non aggiungere provider. Confermare gestione retry/diagnostica mantenendo destinatari obbligatori D-21/D-46 | Memoria per meccanismo; M per requisito operativo di consegna se necessario | Idempotenza alert/in-app garantibile; recapito esterno non transazionale | D-21/D-44/D-46; services/notifications.ts/email.ts; §6.5 |
| **P-14 — Dati operativi per collaudo** | Fornire persone/memberships/leader R-6 e valori mancanti delle liste dai leader; verificare snapshot ISTAT ufficiale/estrazione/licenza come D-71 già prescrive e policy validazione cascata. Non chiedere di nuovo quale fonte geografica usare | M/C per utenti; leader per liste; memoria coordina o2 su dataset/contratto | Demo permettono sviluppo; collaudo reale e tutti i destinatari non dimostrabili con nomi inventati | D-19/D-40/D-45/D-71; R-6/R-1 D3; G §17.4/§17.11; LISTE_VALORI_REPORT |

R-3 AI, R-7 commenti, R-9 scelta visuale/salvataggio UI, R-11 Node e R-12 destino dei test legacy rimangono nel registro ufficiale: non sono nuovi blocchi dell'architettura qui proposta. R-2 file finale del collaboratore non blocca, come già deliberato. La memoria decide quali evidenze necessitano un nuovo D-n, senza trasformare automaticamente ogni dettaglio tecnico in una nuova domanda a M.

