# PracticeHub — Revisione dei motori del backend v1

Data: 08/10/2026. Revisione richiesta da `docs/coordinamento/PROMPT_REVISIONE_MOTORI.md` (D-53).

## 1. Sintesi

**Difetti: 4 ALTA, 2 MEDIA, 0 BASSA. Giudizio: sì dopo le correzioni ALTE.**

I motori puri costituiscono una base utilizzabile. Prima di costruire sopra il PATCH occorre correggere il rilascio improprio dello stato manuale e la riconciliazione delle voci Ente; il controllo dei percorsi della guardia evidenzia inoltre un ripristino che può riattivare un gestore senza PM leader. La deduplica impedisce il doppio effetto nello scenario CAS esaminato, ma non garantisce la risposta di replay a tutti i retry concorrenti. Lo storico usa inoltre un ambito dell'operationId diverso da quello contrattuale.

### Perimetro e limiti della verifica

- Riferimento storico indicato dal prompt: **b13c8d7**, con la successiva modifica di tipi **c53b7c8**. Sono stati letti e provati i file presenti nel workspace; non è stata effettuata una ricostruzione del checkout storico. Gli hash dei file centrali esaminati sono riportati in fondo.
- Il registro letto arriva a **D-121** e il contratto è **v0.3.0**; R-16 risulta chiuso da D-120/D-121. Le disposizioni successive prevalgono sui provvisori e sull'architettura originaria.
- **M-04 è un rilievo aggiuntivo sul consumatore B5b attualmente presente**, `services/practices-v2/commands.ts`, ispezionato per verificare tutti i percorsi di `write_guards`. Non se ne attribuisce la presenza a b13c8d7. I restanti cinque rilievi riguardano i motori e l'infrastruttura del perimetro richiesto: **3 ALTA, 2 MEDIA**; totale con M-04: **4 ALTA, 2 MEDIA**.
- Le Note Operative per gruppo sono una modifica dichiaratamente ancora da completare: le lacune di D-121 sono descritte al §3 e non conteggiate come nuovi difetti della consegna b13c8d7.
- Nessuna connessione a MongoDB, nessuna prova sulla porta 27017, nessuna modifica al codice o a `docs/coordinamento/`. L'unico documento prodotto nel progetto è questo rapporto; le riproduzioni sono state scritte nella cartella temporanea esterna indicata nell'appendice.
- Nota di esecuzione: prima di conoscere il vincolo contenuto nel blocco è stato eseguito `git status --short`, in sola lettura; durante la revisione non sono stati eseguiti ulteriori comandi git. Nessun commit o cambiamento dell'indice.

### Prove eseguite

1. Da `frontend/`, `yarn vitest run tests/server --no-cache`, rimuovendo dal solo ambiente del processo **sia `MONGO_TEST_URL` sia `MONGO_RS_TEST_URL`**. Risultato: **213 prove riuscite, 55 saltate; 18 file riusciti, 1 saltato**. Le suite di integrazione del nuovo modello usano in realtà `MONGO_RS_TEST_URL`, oltre a `MONGO_TEST_URL` usata dal backup. Il primo avvio è stato bloccato da `spawn EPERM` di esbuild; l'esecuzione autorizzata fuori dal sandbox è riuscita.
2. Suite isolata esterna al progetto: **10 prove riuscite**, composta da 7 riproduzioni dei sei difetti (due varianti dello stesso M-01), 2 controlli positivi e 1 caso da precisare nel registro. Le asserzioni delle riproduzioni verificano deliberatamente il **comportamento errato osservato**: il verde di questa suite non significa conformità. Sorgente integrale e configurazione sono inclusi nell'appendice.
3. Per transazione e ripristino sono stati usati oggetti in memoria che implementano i metodi chiamati dal codice reale. Questo dimostra il ramo applicativo e la sequenza descritta, **non** il comportamento effettivo di un replica set: le prove concorrenti reali restano da eseguire in una sessione autorizzata a usare un database temporaneo.

## 2. Difetti, ordinati per gravità

### M-01 — ALTA — Il fallback a un evento preesistente con la stessa data cancella lo stato manuale

**File e righe:** `frontend/src/lib/engines/state.ts:112`, in particolare **116** e **144**.

**Scenario:** INWIT con Data assegnazione `F023 = 2026-10-05` e Protocollo `F051 = 2026-10-05`. Per D-109/D-120 vince PROTOCOLLATO. Il PM imposta TERMINATO manualmente, poi svuota soltanto Protocollo. Il motore sceglie l'ASSEGNATO già presente, vede una diversa `ruleId` a parità di data e restituisce **ASSEGNATO/AUTO**, `manualReleased: true`. Atteso: **TERMINATO/MANUAL**, con `autoStato: ASSEGNATO` aggiornato in sottofondo e `manualReleased: false`.

Lo stesso difetto si manifesta eliminando la riga vincente fra due Richieste integrazione con identica data: la riga più vecchia, già presente al comando manuale, viene trattata come evento nuovo.

**Regola violata:** **D-119**, «Svuotare un trigger non rilascia il manuale» e «evento nuovo […] più recente»; D-115; Guida §14. Cambiare identità non prova che l'evento sia nuovo né che la precedenza sia cresciuta.

**DIMOSTRATO:** prove `R1` e `R1b` nell'appendice. R1 restituisce `{ manualReleased: true, next: { stato: "ASSEGNATO", source: "AUTO" } }`; R1b restituisce INTEGRAZIONE_RICHIESTA/AUTO dopo la sola rimozione della riga vincente.

**Correzione proposta:** sostituire la disuguaglianza di identità con un confronto che rispetti la precedenza completa e distingua un nuovo evento da un fallback; conservare il manuale quando lo svuotamento o la rimozione fanno vincere un evento già esistente di precedenza inferiore. Servono almeno rango e ordine stabile della riga nel riferimento memorizzato, oppure informazioni equivalenti ricavate dal confronto prima/dopo.

### M-02 — ALTA — La rimozione della voce Ente può perdere un nome compilato manualmente

**File e riga:** `frontend/src/lib/engines/rows.ts:65` (rimozione a **67**).

**Scenario:** un vincolo MONUMENTALE PRESENTE genera la voce Ente con `F063 = "Soprintendenza"` in INWIT. Il PM cambia il campo TEXT master Nome Ente in `"Soprintendenza - ufficio tutela, referente Rossi"`, lasciando vuoti gli altri campi della voce. Quando il vincolo diventa ASSENTE, `hasData` esclude **qualsiasi** valore di F063 e ordina di eliminare la riga. Atteso: conservarla, sbloccarla e segnalarla, perché il nome contiene dati manuali; si può eliminare la riga con il solo nome predefinito.

`locked` protegge la rimozione della riga, non rende il campo Nome Ente un mirror o un calcolato: il master TEXT resta nel normale perimetro di modifica del PM.

**Regola violata:** **D-35**, conservazione della voce non vuota; **D-89 e architettura §1.3**, che esclude dalla compilazione il solo nome **predefinito** e richiede di conservare le voci con «dati manuali»; D-47. Un eventuale snapshot nello storico non rende corretta la cancellazione del dato operativo.

**DIMOSTRATO:** prova `R2` nell'appendice: `computeRows` inserisce `e1` in `remove` nonostante il testo personalizzato.

**Correzione proposta:** distinguere il nome iniziale generato dal sistema dal nome successivamente scritto dall'utente, conservando il valore originario o una provenienza affidabile. Nel controllo di vuoto escludere soltanto il nome generato rimasto invariato; una personalizzazione deve conservare la riga con l'avviso previsto.

### M-03 — ALTA — Cambiare l'ente del vincolo lascia un Nome Ente automatico incoerente

**File e righe:** `frontend/src/lib/engines/rows.ts:51`, **53** e **62**.

**Scenario:** vincolo PAESAGGISTICO PRESENTE, ente Soprintendenza, voce collegata `e1` con Nome Ente `"Soprintendenza"`, bloccata e senza altri dati. Il PM corregge soltanto l'ente del vincolo in Comune, scelta ammessa dalla tabella. Esiste già la riga collegata e non ha warning: `computeRows` restituisce **nessuna azione**; la voce resta Soprintendenza mentre il vincolo indica Comune. Atteso, almeno per questa voce ancora intatta: stessa `rowId`, nome automatico aggiornato a Comune, collegamento e blocco conservati.

Anche una prima impostazione PRESENTE con ente non ancora scelto può creare la voce senza nome; la successiva scelta dell'ente non la completa.

**Regola violata:** **D-103**, «per le voci Ente nate dai vincoli il nome è l'ente del vincolo»; D-35/D-99, ente selezionabile e voce collegata. Il dato derivato viene riconciliato soltanto alla creazione.

**DIMOSTRATO:** prova `R3` nell'appendice: dopo il cambio Soprintendenza → Comune il risultato è `{ add: [], remove: [], update: [] }` e F063 resta Soprintendenza.

**Correzione proposta:** riconciliare anche il nome generato sulle voci già collegate quando cambia o viene completato l'ente del vincolo, senza cambiare rowId e senza eliminare altri dati. Distinguere le personalizzazioni dell'utente come in M-02; la politica per un cambio ente con una voce già lavorata va esplicitata nel registro (§3), evitando sovrascritture automatiche dei dati manuali.

### M-04 — ALTA — Il ripristino può riattivare un gestore senza PM leader

**Rilievo aggiuntivo sul percorso B5b attuale, non attribuito al commit b13c8d7.**

**File e righe:** `frontend/src/services/practices-v2/commands.ts:394`, scrittura a **405**, esportazione `restorePractice` a **420**. Controllo correlato: `frontend/src/services/users-v2.ts:90` e **100**.

**Scenario:** un gestore ha solo pratiche archiviate. L'ADMIN rimuove il suo ultimo PM leader: `assertPmLeadersKept` lo consente correttamente perché non ci sono pratiche non archiviate. Poi un ADMIN o un PM non leader ripristina una pratica. `setArchived(..., false)` passa i permessi, incrementa la revisione e scrive `archived: false` **senza** verificare il PM leader e **senza** toccare `pm-leader:<template>`. Risultato: gestore attivo senza presidio, destinatari PM degli alert assenti. Atteso: rifiuto 422 finché non viene nominato un PM leader attivo.

In concorrenza, ripristino e rimozione dell'ultimo leader possono inoltre controllare snapshot compatibili separatamente e commettere su documenti diversi: il ripristino non partecipa alla serializzazione dell'invariante.

**Regola violata:** **D-100/D-101**, «ogni gestore attivo deve avere almeno un PM leader», con gestore attivo definito come almeno una pratica non archiviata; D-45 e Guida §10. La guardia copre la perdita del ruolo in `updateUser` e le attuali creazioni/rilavorazioni, ma non tutte le transizioni che rendono attivo un gestore.

**DIMOSTRATO:** prova `R6` nell'appendice, comando reale e repository simulato con zero leader: il ripristino riesce, `archived` diventa false, **0 letture leader e 0 scritture della guardia**. La variante concorrente è dedotta dalla separazione delle scritture e non è stata eseguita su Mongo.

**Correzione proposta:** nel ramo ripristino acquisire la stessa guardia `pm-leader:<template>` e verificare nella medesima transazione l'esistenza di un PM leader attivo prima di rendere la pratica non archiviata. Applicare il requisito a ogni altro percorso che riattiva un gestore, mantenendo l'errore 422 coerente con D-101.

### M-05 — MEDIA — Un retry concorrente della stessa operazione può ricevere REVISION_CONFLICT invece del replay

**File e righe:** `frontend/src/lib/store/transaction.ts:83`, **93**, **112**. Prova esistente che accetta il comportamento errato: `frontend/tests/server/store.test.ts:165`, in particolare **170–173**.

**Scenario:** A e B inviano lo stesso attore, UUID, corpo e revisione 1. Entrambi possono effettuare la lettura preliminare di `operations` prima del commit di A. A commette la revisione 2 e la ricevuta; B entra nel callback, oppure il driver ne ritenta il callback dopo il conflitto di scrittura. `fn` tenta il CAS sulla revisione 1 e lancia `HttpError` 409 REVISION_CONFLICT prima dell'inserimento della ricevuta. Il catch gestisce il replay soltanto per `MongoServerError` 11000. Atteso: B riconosce la ricevuta già commessa, non ripete gli effetti e riceve il successo di replay, dal quale il servizio rilegge lo stato attuale.

Con corpi diversi e stesso UUID, la medesima sequenza può restituire REVISION_CONFLICT anziché il richiesto OPERATION_REUSED. Non è stato dimostrato un doppio storico in questo percorso: la protezione CAS/rollback funziona.

**Regola violata:** **contratto §1**, stessa operationId e stesso corpo → risposta senza effetti ripetuti; diverso corpo → 409 OPERATION_REUSED. **D-90** e architettura §1.4, deduplica prima di eseguire gli effetti.

**DIMOSTRATO:** prova `R4` nell'appendice: la ricevuta diventa disponibile dopo la verifica preliminare e prima del callback; il codice reale restituisce REVISION_CONFLICT e legge la ricevuta **una sola volta**. È un interleaving simulato, non una prova del retry del driver su replica set. La prova esistente a riga 173 ammette esplicitamente il 409 dei perdenti e quindi non verifica il contratto richiesto.

**Correzione proposta:** ricontrollare la ricevuta all'inizio di ogni esecuzione del callback, prima dei controlli e degli effetti, usando la sessione; trattare inoltre gli errori concorrenti verificando se nel frattempo è comparsa una ricevuta commessa per attore/UUID, senza mascherare gli errori quando la ricevuta manca. Rafforzare la prova concorrente: tutti i retry identici devono riuscire, con un unico effetto, e i riusi diversi devono dare OPERATION_REUSED.

### M-06 — MEDIA — L'ambito per utente dell'operationId collide con gli indici globali dello storico

**File e righe:** `frontend/src/lib/store/db.ts:122` e **127**, confronto con **153**; propagazione dell'UUID a `frontend/src/lib/store/transaction.ts:79` e `frontend/src/lib/store/oplog.ts:39`, **63**.

**Scenario:** utente A e utente B usano lo stesso UUID valido per due azioni distinte, anche su pratiche diverse. Il contratto lo ammette perché l'ambito è per utente: `operations` infatti ha l'indice unico `(actorId, operationId)`. Entrambi gli `OpLog` però iniziano con indice 0 e gli indici unici di `value_history` e `practice_events` sono **soltanto** `(operationId, changeIndex/eventIndex)`. Dopo il successo di A, la scrittura di B collide, viene annullata e può emergere come errore Mongo 11000; il replay di B non trova una sua ricevuta. Atteso: due operazioni indipendenti riuscite, con storico separato e deduplica per ciascun attore.

La collisione casuale fra UUID ben generati è estremamente improbabile; il difetto resta raggiungibile tramite due richieste con un UUID scelto esplicitamente, e un UUID di un altro attore è visibile nello storico. Non dipende da una collisione SHA-256.

**Regola violata:** **contratto §1**, «Ambito: per utente»; D-90, idempotenza; D-47, storico delle operazioni consentite.

**DIMOSTRATO:** prova `R5` nell'appendice: due `OpLog` reali con attori diversi producono la stessa chiave dell'indice unico `practice_events`, mentre l'indice `operations` distingue gli attori. La collisione delle chiavi è dimostrata senza database; l'errore e il rollback su Mongo non sono stati eseguiti.

**Correzione proposta:** usare una chiave interna dell'operazione globalmente univoca, distinta dall'UUID client e derivata anche dall'attore, per storico, eventi e altri effetti che richiedono unicità globale; oppure includere l'ambito dell'operazione in tutti gli indici degli effetti. Poiché coinvolge documenti e indici, concordare la forma con la memoria prima dell'implementazione (D-5), conservando la semantica contrattuale per utente.

## 3. Conflitti con decisioni e casi non coperti dal registro

1. **Conflitto con D-119 nell'interpretazione a parità di data:** il commento e il predicato in `state.ts:109–116` traducono «data, poi regola e riga» in «qualunque identità diversa è nuova». Ciò contraddice la clausola esplicita che uno svuotamento non rilascia il manuale (M-01). Il rapporto segnala il conflitto; non adotta una nuova regola di prodotto. La precedenza di stato è già deliberata da D-109/D-120.
2. **ARPA: cancellazione del figlio e nuova compilazione del padre.** `rows.ts:78–80` deduce la prima compilazione dalla transizione vuoto → pieno e dall'esistenza attuale di una riga figlia. Se il figlio già aperto viene rimosso e si svuota/ricompila il padre, nasce un altro figlio. La prova finale dell'appendice riproduce l'azione. D-93 dice che la compilazione apre una nuova riga; non precisa se, dopo aver eliminato quella riga, la prima compilazione debba restare consumata per sempre o se il nuovo ciclo sia voluto. Occorre precisare anche se si possa eliminare una riga ARPA che è origine di un'altra. **Non conteggiato come difetto certo.**
3. **Cambio ente su una voce già lavorata o con nome personalizzato.** La coerenza del nome automatico intatto è richiesta da D-103 (M-03), ma D-35/D-99 non definiscono la destinazione dei pareri, forecast e testi manuali quando cambia l'ente del vincolo: aggiornamento della stessa voce, scollegamento, nuova voce o blocco della modifica. Il rapporto non sceglie fra queste politiche. Serve distinguere comunque nome generato e nome manuale (M-02).
4. **D-121, applicazione dichiaratamente successiva.** La mappa di `access.ts:146` contiene le quattro nuove chiavi, ma `transversalAccess` le tratta ancora tutte come la vecchia nota PM/Permessi e non verifica l'Assegna. La policy `access-policy.json` conserva il provvisorio sulle note. Occorrono ancora proprietà/scrittura del gruppo, visibilità al proprio gruppo e a PM leader/ADMIN, Assegna, filtro nello storico e nell'export; `access` da solo non offre un esito di visibilità. È una lacuna nota della consegna, **non un nuovo difetto attribuito alla sola modifica di tipi c53b7c8**. Fatturato, nei file attuali, è già limitato a PM/ADMIN come D-121(2).
5. **B7 e decorso del tempo:** non è un difetto del motore puro che senza un nuovo salvataggio non cambi Fatturabile al trentesimo giorno. Il job giornaliero deve chiamare lo stesso motore con `romeDate(now)`, ricalcolare anche gli input nascosti, conservare `forcedNegativeRows`, registrare i cambiamenti SYSTEM e rispettare archivio/iterazione corrente. Il job non è incluso nella consegna qui revisionata.

### Punti di attenzione verificati senza nuovi rilievi

- Una riga INTEGRAZIONE creata già con Invio compilato viene trattata come prima compilazione: **dimostrato** dal controllo positivo dell'appendice. Il controllo memorizzato viene riusato; base assente resta non idonea; soglia 15/16, base già trascorsa, ultima integrazione completata per ordinal, delta negativo e blocco MANUAL sono coperti dalle prove esistenti lette.
- Forecast Ottenimento Permessi AUTO senza Protocollo restituisce null; un campo nascosto non blocca il calcolo. Le formule leggono i valori del candidato senza consultare `condition`.
- Fatturabile usa il giorno iniettato, l'ultima riga ARPA per ordinal, il blocco manuale e la memoria dei NO forzati per rowId; nello stesso salvataggio Negativo prevale sul SI manuale. Il risultato include il cambio SYSTEM e il motivo quando il valore cambia. Resta da verificare la sua orchestrazione completa nel PATCH.
- `conditions.ts` rispetta le fixture condivise per vuoto, codici, all/any, stessa riga e aggregazione fra gruppi. `progress.ts` esclude mirror/trasversali/calcolati non modificabili e conta le righe esistenti e gli stati dei Vincoli.
- Le regole attive dello stato sono coerenti con i campi DATE master e con D-115/D-120, inclusi KO INWIT, assenza di IN_APPROVAZIONE automatico e assenza di integrazioni FASTWEB-VODAFONE. Date future partecipano e il fallback automatico senza manuale funziona.
- Il motore dei permessi verifica la stessa appartenenza del template e protegge archivio, passato, mirror e calcolati non modificabili anche dall'ADMIN. Le matrici esistenti passano; non sono emersi altri rilievi su questo perimetro, eccetto le note già rinviate.
- La guardia in `assertPmLeadersKept` è scritta prima di contare gli altri leader e le pratiche; tutti i cambi di stato/appartenenze/flag leader passano da quel controllo in `updateUser`. Per due rimozioni concorrenti su un gestore già attivo il meccanismo elimina il write skew a livello di progetto; la prova Mongo esistente è stata **saltata**, quindi la concorrenza del driver non è stata confermata qui. M-04 identifica il percorso mancante.
- `runOperation` fissa UUID e orologio prima del callback, scrive la ricevuta nella stessa transazione e mantiene il CAS della pratica. Il replay sequenziale funziona. I servizi dei comandi pratica attuali memorizzano una ricevuta piccola e rileggono il dettaglio dopo il commit: non è stato contato come difetto il fatto che `runOperation.result` sia la ricevuta salvata.
- Le prove del calendario verificano bisestili, cambio anno, giorni di calendario/lavorativi, festività nazionali adottate da D-97, Roma contro UTC e cambi d'ora alle 09:00. Non si riapre la decisione sul 4 ottobre.

## 4. Prove mancanti importanti

1. Stato manuale: svuotamento del trigger vincente con fallback alla **stessa data** su regola di rango minore; rimozione della riga vincente con altra riga alla stessa data; distinguere questi casi da una nuova riga pari data di ordinal successivo. Le prove attuali verificano lo svuotamento soltanto con una data precedente e accettano qualunque identità diversa nel test di `isNewerEvent`.
2. Nome Ente: personalizzazione come unico dato della voce, successiva perdita di PRESENTE, conservazione/avviso e storico SYSTEM; nome ancora predefinito da solo → rimozione. Cambio dell'ente scelto su voce intatta, ente inizialmente vuoto poi compilato, ritorno a PRESENTE e stesso rowId; cambio con dati manuali dopo la decisione del §3.
3. PM leader: rimozione dopo l'archiviazione dell'ultima pratica, successivo ripristino senza leader → 422; ripristino concorrente con disattivazione/cambio appartenenze/cambio leader; ripristino e creazione della guardia al primo uso. Confermare su replica set temporaneo che nessuna sequenza lasci pratiche non archiviate senza PM leader.
4. Idempotenza concorrente: stesso attore/UUID/corpo con entrambe le letture preliminari prima del commit; forzare la riesecuzione del callback e verificare successo per **tutti** i retry, unica revisione/storico/outbox. Stesso UUID con corpo diverso nello stesso interleaving → OPERATION_REUSED. Il test `store.test.ts:165` va corretto nell'oracolo, non soltanto ampliato.
5. Ambito operationId: medesimo UUID di due attori, pratiche diverse e indici di storico/eventi effettivamente presenti → entrambi riescono; includere cambiamenti SYSTEM, dove l'autore visibile è null e non può fungere da ambito dell'operazione.
6. Formule: riga creata già piena attraverso un vero ADD_ROW, metadata persistiti e successivo retry; Invio compilato senza Richiesta, poi Richiesta aggiunta; svuotamento/ricompilazione mantenendo il controllo originario; input nascosto e controllo prima/dopo la mezzanotte di Roma.
7. Fatturabile: giro Negativo → Positivo → Negativo sulla stessa rowId già forzata; più righe negative nello stesso batch; negativo su una riga precedente mentre l'ultima è positiva; composizione `computeRows` → `computeFormulas` quando nasce la nuova riga ARPA vuota; stesso salvataggio NO iniziale → SI manuale → NO SYSTEM con tutte le cause nello storico. Il job giornaliero deve usare lo stesso motore.
8. Permessi D-121 dopo implementazione: utenti con più appartenenze sullo stesso template, PM non leader, PM leader su altro template, utenti disattivati, UT/PE senza Assegna, note altrui in dettaglio/history/export e iterazioni passate. Conservare le matrici archivio/mirror/calcolato già presenti.
9. Ripetibili: ordine dell'array diverso da ordinal per entrambi i motori delle formule; rimozione e aggiunta senza riuso di rowId; genitore e figlio ARPA rimossi/ricreati dopo la precisazione del registro. Verificare l'assenza di effetti duplicati al livello della transazione, non soltanto richiamando una funzione pura sullo stesso snapshot.

## Appendice — Riproduzioni senza database

La suite sotto usa funzioni reali, indici reali e, per i due percorsi di servizio/transazione, repository simulati. Il solo mapper finale del ripristino è sostituito per evitare una lettura composita non pertinente al difetto. Nessun `MongoClient.connect()` viene chiamato. Gli identificatori R1/R1b, R2, R3, R6, R4, R5 corrispondono rispettivamente a M-01, M-02, M-03, M-04, M-05, M-06.

Cartella della prova eseguita: `C:/Users/mcracchiolo/AppData/Local/Temp/practicehub-review-40cc805e8fcd42899071a194e8b9f48d`.

Comando, da `frontend/`, con entrambe le variabili Mongo assenti:

```powershell
node node_modules/vitest/vitest.mjs run --config '<cartella-temporanea>/vitest.config.mjs' --no-cache
```

Per ripeterla altrove, copiare sorgente e configurazione in una cartella temporanea e adattare soltanto i percorsi assoluti. Il risultato osservato è `1 passed`, `10 passed`.


### Configurazione (vitest.config.mjs)

```javascript
export default {
    "cacheDir":  "C:/Users/mcracchiolo/AppData/Local/Temp/practicehub-review-40cc805e8fcd42899071a194e8b9f48d/cache",
    "root":  "C:/Users/mcracchiolo/AppData/Local/Temp/practicehub-review-40cc805e8fcd42899071a194e8b9f48d",
    "resolve":  {
                    "alias":  {
                                  "@":  "C:/Users/mcracchiolo/Desktop/MEGADASHBOARD-main/frontend/src",
                                  "vitest":  "C:/Users/mcracchiolo/Desktop/MEGADASHBOARD-main/frontend/node_modules/vitest/dist/index.js",
                                  "mongodb":  "C:/Users/mcracchiolo/Desktop/MEGADASHBOARD-main/frontend/node_modules/mongodb/lib/index.js"
                              }
                },
    "test":  {
                 "cache":  false,
                 "environment":  "node",
                 "include":  [
                                 "*.test.ts"
                             ]
             }
}
```

### Sorgente (motori.test.ts)

```typescript
import { describe, expect, it, vi } from 'vitest';
import { deriveAutomaticState, applyState, newStateMeta } from '@/lib/engines/state';
import { computeRows } from '@/lib/engines/rows';
import { computeFormulas } from '@/lib/engines/formulas';
import { COMPILED_TEMPLATES } from '@/lib/templates/compiled';
import { runOperation, bumpPracticeRevision, requestHash } from '@/lib/store/transaction';
import { STORE_INDEXES } from '@/lib/store/db';
import { OpLog } from '@/lib/store/oplog';
import { ObjectId } from 'mongodb';
import { buildNewPractice } from '@/lib/store/practice-factory';
import { restorePractice } from '@/services/practices-v2/commands';

vi.mock('@/services/practices-v2/read', () => ({
  getPracticeDetail: async (db: any) => ({ archived: (await db.collection('practices').findOne({})).archived }),
}));

const now = new Date('2026-10-08T07:00:00Z');
const row = (rowId: string, ordinal: number, values: any, extra: any = {}) => ({ rowId, ordinal, values, ...extra });
const snap = (values: any = {}, repeats: any = {}, extra: any = {}) => ({ values, repeats, formulaMeta: {}, transversal: { noteOperative: { PM_PERMESSI: '', UT_PE: '', AIE: '', DL: '' }, fatturabile: 'NO', fatturabileManual: false, fatturato: null }, ...extra });
const stateInput = (values: any = {}, repeats: any = {}) => ({ templateId: 'INWIT' as const, values, repeats });
const rows = (before: any, after: any) => computeRows({ templateId: 'INWIT', template: COMPILED_TEMPLATES.INWIT.template, before, after, enteLabel: (e) => e?.code === 'SOPRINTENDENZA' ? 'Soprintendenza' : e?.code === 'COMUNE' ? 'Comune' : e?.code ?? null, newRowId: () => 'new-row' });

describe('riproduzioni: assert sul comportamento errato osservato', () => {
  it('R1: cancellare Protocollo con Assegnazione alla stessa data rilascia il manuale', () => {
    const initial = deriveAutomaticState(stateInput({ F023: '2026-10-05', F051: '2026-10-05' }));
    const manual = applyState(newStateMeta(), initial, { stato: 'TERMINATO', actorId: null, at: now }).next;
    const actual = applyState(manual, deriveAutomaticState(stateInput({ F023: '2026-10-05', F051: null })));
    expect(actual).toMatchObject({ manualReleased: true, next: { stato: 'ASSEGNATO', source: 'AUTO' } });
    // D-119 richiede TERMINATO / MANUAL / manualReleased=false.
  });

  it('R1b: rimuovere l integrazione vincente con altra riga alla stessa data rilascia il manuale', () => {
    const a = row('old', 1, { F055: '2026-10-05' });
    const b = row('latest', 2, { F055: '2026-10-05' });
    const initial = deriveAutomaticState(stateInput({}, { INTEGRAZIONE: [a, b] }));
    const manual = applyState(newStateMeta(), initial, { stato: 'STAND_BY', actorId: null, at: now }).next;
    const actual = applyState(manual, deriveAutomaticState(stateInput({}, { INTEGRAZIONE: [a] })));
    expect(actual).toMatchObject({ manualReleased: true, next: { stato: 'INTEGRAZIONE_RICHIESTA', source: 'AUTO' } });
  });

  it('R2: il Nome Ente personalizzato viene scartato dal controllo dei dati operativi', () => {
    const vincolo = row('v1', 1, {}, { constraint: { code: 'MONUMENTALE', stato: { code: 'PRESENTE' }, ente: { code: 'SOPRINTENDENZA' } } });
    const ente = row('e1', 1, { F063: 'Soprintendenza - ufficio tutela, referente Rossi' }, { metadata: { origin: { groupKey: 'VINCOLI', rowId: 'v1' }, locked: true } });
    const before = snap({}, { VINCOLI: [vincolo], ENTE: [ente] });
    const after = snap({}, { VINCOLI: [{ ...vincolo, constraint: { ...vincolo.constraint, stato: { code: 'ASSENTE' } } }], ENTE: [ente] });
    expect(rows(before, after).remove).toEqual([{ groupKey: 'ENTE', rowId: 'e1', reason: 'Vincolo MONUMENTALE non più Presente: voce Ente vuota tolta (D-35)' }]);
    // Il solo nome PREDEFINITO non conta; questo contiene dati manuali e deve restare.
  });

  it('R3: ente del vincolo cambiato, nome della voce collegata rimane quello precedente', () => {
    const vincolo = row('v1', 1, {}, { constraint: { code: 'PAESAGGISTICO', stato: { code: 'PRESENTE' }, ente: { code: 'SOPRINTENDENZA' } } });
    const ente = row('e1', 1, { F063: 'Soprintendenza' }, { metadata: { origin: { groupKey: 'VINCOLI', rowId: 'v1' }, locked: true } });
    const before = snap({}, { VINCOLI: [vincolo], ENTE: [ente] });
    const after = snap({}, { VINCOLI: [{ ...vincolo, constraint: { ...vincolo.constraint, ente: { code: 'COMUNE' } } }], ENTE: [ente] });
    expect(rows(before, after)).toEqual({ add: [], remove: [], update: [] });
    expect(after.repeats.ENTE[0].values.F063).toBe('Soprintendenza');
  });

  it('R4: ricevuta commessa dopo il controllo preliminare, callback CAS fallisce e non fa replay', async () => {
    const operationId = '33333333-3333-4333-8333-333333333333';
    const practiceId = new ObjectId();
    const request = { revision: 1, stato: 'STAND_BY' };
    let done: any = null;
    let receiptReads = 0;
    const operations = { findOne: async () => { receiptReads++; return done; }, insertOne: async () => { throw new Error('non deve arrivare a inserire'); } };
    const practices = { findOneAndUpdate: async () => null, findOne: async () => ({ revision: 2 }) };
    const db: any = { collection: (name: string) => name === 'operations' ? operations : practices };
    const client: any = { startSession: () => ({
      withTransaction: async (fn: any) => {
        // Interleaving controllato: il concorrente commette dopo findOne e prima del callback del perdente.
        done = { actorId: 'u', operationId, requestHash: requestHash(request), result: { revision: 2 } };
        await fn();
      }, endSession: async () => {},
    }) };
    await expect(runOperation(client, db, { actorId: 'u', operationId, request, practiceId, skipBootstrap: true }, async ctx => ({ revision: await bumpPracticeRevision(ctx, practiceId, 1) }))).rejects.toMatchObject({ status: 409, extra: { code: 'REVISION_CONFLICT', currentRevision: 2 } });
    expect(receiptReads).toBe(1);
    expect(done).not.toBeNull();
    // D-90 e contratto §1 richiedono replay, senza rieseguire il callback.
  });

  it('R5: due attori con la stessa operationId generano chiavi uguali negli indici dello storico', () => {
    const ref = { practiceId: new ObjectId(), iterationId: new ObjectId(), n: 1, templateVersion: 'test' };
    const operationId = '44444444-4444-4444-8444-444444444444';
    const event = (actorId: string) => {
      const log = new OpLog({ db: {} as any, session: {} as any, actorId, operationId, now }, { id: new ObjectId(), name: actorId });
      log.event(ref, { kind: 'STATO', detail: actorId });
      return log.events[0];
    };
    const a = event('attore-A'), b = event('attore-B');
    const unique = STORE_INDEXES.practice_events.find(x => x.unique)!;
    const key = (doc: any) => Object.keys(unique.key).map(k => doc[k]);
    expect(key(a)).toEqual(key(b));
    expect(a.actorId).not.toEqual(b.actorId);
    expect(STORE_INDEXES.operations.find(x => x.unique)!.key).toEqual({ actorId: 1, operationId: 1 });
    // Ambito per utente in operations; ambito globale incompatibile negli effetti.
  });

  it('R6: ripristino riuscito senza PM leader e senza toccare la guardia', async () => {
    const b = buildNewPractice({ practiceId: new ObjectId(), iterationId: new ObjectId(), templateId: 'INWIT', template: COMPILED_TEMPLATES.INWIT.template, identity: { codiceG7: '1', codiceSito: 'S', nomeSito: 'N', committente: { code: 'X' }, clienteFinale: { code: 'INWIT' } }, createdBy: null, now });
    b.practice.archived = true;
    let guardWrites = 0, leaderReads = 0;
    const collections: any = {
      operations: { findOne: async () => null, insertOne: async () => ({}) },
      practices: {
        findOne: async () => b.practice,
        findOneAndUpdate: async () => ({ revision: ++b.practice.revision }),
        updateOne: async (_: any, update: any) => { Object.assign(b.practice, update.$set); return {}; },
      },
      practice_iterations: { findOne: async () => b.iteration, countDocuments: async () => 1 },
      repeat_rows: { find: () => ({ toArray: async () => [] }) },
      practice_events: { insertMany: async () => ({}) },
      users: { countDocuments: async () => { leaderReads++; return 0; } },
      write_guards: { updateOne: async () => { guardWrites++; return {}; } },
    };
    const db: any = { collection: (name: string) => { if (!collections[name]) throw new Error('collezione inattesa: '+name); return collections[name]; } };
    const client: any = { startSession: () => ({ withTransaction: async (fn: any) => fn(), endSession: async () => {} }) };
    // Evita bootstrap: il test simula SOLO l'orchestrazione del comando, mai un server Mongo.
    const storeModule = await import('@/lib/store/db');
    const bootstrap = vi.spyOn(storeModule, 'ensureStoreBootstrapped').mockResolvedValue(undefined);
    try {
      const user: any = { id: new ObjectId().toHexString(), name: 'ADMIN', isAdmin: true, status: 'active', memberships: [] };
      const result = await restorePractice({ client, db, clock: () => now }, user, b.practice._id.toHexString(), { revision: 1, operationId: '66666666-6666-4666-8666-666666666666' });
      expect(result.archived).toBe(false);
      expect(guardWrites).toBe(0);
      expect(leaderReads).toBe(0);
    } finally { bootstrap.mockRestore(); }
  });
});

describe('casi di controllo e lacune del registro', () => {
  it('la prima compilazione di Invio in una riga creata già piena viene catturata', () => {
    const compiled = COMPILED_TEMPLATES.INWIT;
    const after = snap({ F051: '2026-01-01' }, { INTEGRAZIONE: [row('i1', 1, { F055: '2026-02-10', F057: '2026-02-20' })] });
    const result = computeFormulas({ templateId: 'INWIT', template: compiled.template, bindings: compiled.bindings, before: snap(), after, today: '2026-02-25', now, operationId: 'probe', actorId: null, manualWrites: new Set(), fatturabileWritten: false });
    expect(result.rowMetadata.i1.integrationCheck).toMatchObject({ eligible: true, remainingDays: 12 });
    expect(result.values.F052).toBe('2026-03-19');
  });

  it('una prima Ripresentazione in una riga creata già piena apre un ciclo ARPA', () => {
    const result = rows(snap(), snap({}, { ARPA: [row('a1', 1, { F062: '2026-10-05' })] }));
    expect(result.add).toHaveLength(1);
    expect(result.add[0]).toMatchObject({ groupKey: 'ARPA', ordinal: 2, values: {} });
  });

  it('dopo aver cancellato il figlio ARPA, svuotamento e ricompilazione aprono un altro figlio: policy da precisare', () => {
    const before = snap({}, { ARPA: [row('a1', 1, { F062: null })] });
    const after = snap({}, { ARPA: [row('a1', 1, { F062: '2026-10-05' })] });
    expect(rows(before, after).add).toHaveLength(1);
    // Lo snapshot non distingue questa sequenza dalla prima compilazione.
  });
});

```

### Impronte dei file esaminati

SHA-256; consentono di riconoscere il materiale esaminato senza attribuire modifiche successive a un commit non ricostruito.

| File | SHA-256 |
|---|---|
| frontend/src/lib/engines/state.ts | 4DFEFFB6D57927A96BCF8CE331982760A3D6984154AB4F6BB840ABCF5F172DE7 |
| frontend/src/lib/engines/rows.ts | 1B6D7D186D74BDECEB771BA2551ECB6FF66877A0C6354776048DFE3D44C886DA |
| frontend/src/lib/engines/formulas.ts | 0D961089B9A4669DD456765F3EE1AFEC55261FC8D3D2754CE2F0FD2F25A81E21 |
| frontend/src/lib/store/transaction.ts | 2344DDEA3678825FB41CA97C81BEE1F9A7FC5AA11D9BBB708AA40BBA18626B06 |
| frontend/src/lib/store/db.ts | E9A834D80B3AB4E350C73BDB39DE05F1D8D3C781E5530E6527612DD31C49DDDB |
| frontend/src/lib/store/oplog.ts | 50EBAFB1E48BEBC07BC01B5D4717875B46A18951CC8A7692C32914E150169AF8 |
| frontend/src/services/users-v2.ts | 9E874B4E7B306F08014512F12DCEBA5DDDFF26DB41A6E9C2814EE56FD8DA0DA9 |
| frontend/src/services/practices-v2/commands.ts | 6446B922C7A551FECCB3609CC6AA8CC709F551ACF1CE5D1027379391B96426C7 |
