# Guida per la ristrutturazione delle sezioni della dashboard PracticeHub

**Versione 8 — baseline funzionale + specifiche implementative WT8 consolidate (02/10/2026)**

## 1. Scopo del documento

Questa guida costituisce la **baseline di implementazione** per la ristrutturazione e la manutenzione delle sezioni della dashboard PracticeHub.

Alla data del **2 ottobre 2026** il confronto con i team operativi sui campi, sulle sezioni, sulle relazioni master/mirror e sulle principali regole di visibilità è considerato concluso. L'inventario corrente non deve quindi essere trattato come una bozza da ricostruire o ampliare liberamente: eventuali aggiunte successive sono modifiche esplicite di requisito e devono seguire il processo di change control descritto più avanti.

L'obiettivo NON è rifare il mapping semantico dei dati e NON è ridefinire il modello dati da zero.

L'obiettivo è implementare e mantenere un'organizzazione della dashboard aderente al flusso operativo reale delle pratiche, differenziata per:

1. cliente;
2. team;
3. fase operativa;
4. visibilità/modificabilità del campo;
5. eventuali condizioni di comparsa;
6. relazioni master/mirror tra sezioni e pop-up;
7. ordine operativo rappresentato da `id_flusso`.

La dashboard beta esiste già e raccoglie i diversi gestionali e i relativi campi. I documenti `Organizzazione Campi - <CLIENTE>` rappresentano la fonte operativa primaria. I sei file `ASSOCIAZIONI_CAMPI_<CLIENTE>.md` ne costituiscono la trasposizione strutturata e verificata per l'implementazione. Il foglio di mapping rimane una fonte secondaria per la riconciliazione semantica e la provenienza dei dati.

La guida non deve essere usata per reintrodurre campi assenti dalle fonti operative né per riaprire decisioni già consolidate durante il confronto con i team.

A partire dalla versione 7 questo documento raccoglie anche le **specifiche implementative consolidate** che in precedenza erano distribuite nelle `Note Implementazione`. La versione 8 recepisce inoltre il consolidamento WT8 del 2 ottobre 2026: alert e scadenze, assegnazioni/notifiche, timeline, carichi di lavoro, statistiche, assistente AI in sola lettura e blocco DL comune ai sei gestori. Le note storiche non devono quindi essere richieste come contesto ordinario: restano utili soltanto come traccia storica. Quando una vecchia nota contraddice questa guida o la baseline corrente, prevale questa guida insieme alle fonti operative più recenti.

---

## 2. Principio fondamentale: separare i livelli logici

Durante il lavoro devono essere mantenuti distinti almeno **sette livelli**.

### Livello A - Campo sorgente

È il nome effettivo del campo proveniente da uno specifico gestionale, file o documento operativo.

Esempi:
- CODICE SITO
- PROTOCOLLO
- INVIO PDM
- AGORA

Il campo sorgente non deve essere rinominato o eliminato arbitrariamente.

### Livello B - Campo Universale / mapping semantico

È il concetto comune definito nel foglio di mapping.

Serve per riconciliare campi semanticamente equivalenti o correlati provenienti da fonti diverse.

Il mapping risponde alla domanda:

> Che cosa significa questo dato?

Non deve essere usato automaticamente per decidere dove il campo debba essere mostrato nella dashboard.

### Livello C - Cliente

La dashboard è organizzata principalmente per cliente, non per gestionale.

Configurazioni correnti:
- TOWERNET
- TIM / FIBERCOP
- FASTWEB / VODAFONE
- ILIAD
- INWIT
- LEONARDO

Un cliente può essere alimentato da più gestionali, fogli o tracker.

### Livello D - Team operativo

I team principali considerati sono:

- PM / Permessi
- AIE
- UT + PE
- Direzione Lavori / Sicurezza

UT e PE appartengono allo stesso team operativo, ma nella UI mantengono sezioni distinte. PM e Permessi sono trattati come un dominio operativo fortemente integrato.

Il PM mantiene un perimetro di coordinamento più ampio: apre la pratica, alimenta i passaggi tra team, visualizza numerosi output degli altri team tramite pop-up o sotto-sezioni e gestisce la chiusura del processo.

### Livello E - Fase del workflow

La posizione del campo nella pagina deve riflettere il momento operativo in cui l'informazione viene utilizzata.

#### PM / Permessi

Struttura base consolidata:

1. Core Anagrafica Sito
2. Dati Anagrafici Secondari
3. Fase Preliminare
4. Pacchetto Permessi
5. Iter Autorizzativo
6. Ufficio Tecnico / Progettazione Esecutiva

Sono ammesse estensioni cliente-specifiche già presenti nelle fonti. ILIAD, ad esempio, contiene anche la sezione autonoma `Fatturazione`.

#### AIE

Struttura consolidata:

1. Core Anagrafica Sito
2. Dati Anagrafici Secondari
3. Fase AIE

Il blocco operativo AIE è stato allineato tra i gestori. La sequenza corrente comprende, ove applicabile, `Assegnazione AIE`, `Forecast AIE`, misure di fondo, `Tecnico AIE`, stato assegnazione, responsabile interno, `Stato AIE`, `Invio CEM`, fine attività, riduzione/approvazione, invio/approvazione AIE e note. `Assegnazione AIE` è sempre compilato da PM/Permessi: l'occorrenza AIE è un mirror in sola visualizzazione con lo stesso `id_flusso`. In ILIAD anche `Forecast AIE` ha master PM/Permessi e viene ereditato dal team AIE in sola visualizzazione. Le occorrenze ereditate non sono nuovi campi logici.

#### UT + PE

Struttura consolidata:

1. Core Anagrafica Sito
2. Dati Anagrafici Secondari
3. Ufficio Tecnico e Progettazione Esecutiva
   - UT
   - PE

La sezione **UT** ospita il flusso operativo tecnico. Il blocco di caratterizzazione formato da `Forecast Invio Caratterizzazione`, `Tecnico Caratterizzazione`, `Fornitore Caratterizzazione` e `Invio Report Caratterizzazione` appartiene alla baseline **solo di ILIAD e INWIT**. Non deve essere propagato a TIM/FIBERCOP, TOWERNET, FASTWEB-VODAFONE o LEONARDO in assenza di una corrispondente fonte operativa. Le condizioni di attivazione restano specifiche del cliente e devono essere lette nei rispettivi file `ASSOCIAZIONI_CAMPI_<CLIENTE>.md`.

La sezione **PE** contiene i campi operativi PE e può mostrare informazioni compilate da PM/Permessi come pop-up in sola lettura. Il modello corrente prevede, quando applicabile, il mirror di `Assegnazione Geologica`, `Forecast Geologica` e `Arrivo Geologica`, senza duplicare il campo master `Geologica`. Ulteriori mirror PM, come Scheda Palo o Approvazione PE, rimangono cliente-specifici.

I pop-up PM/Permessi dedicati a UT+PE espongono soltanto un sottoinsieme dei campi operativi necessari al PM e non generano nuove identità di flusso.

#### Direzione Lavori / Sicurezza

Il blocco **Direzione Lavori** è ora parte della baseline comune di tutti e sei i gestori. L'ownership dei campi sismici appartiene al team DL: eventuali visualizzazioni PM sono mirror/pop-up e non costituiscono master alternativi.

La sequenza comune consolidata comprende:

1. `Deposito sismico` — dominio SI/NO;
2. `Forecast Deposito Sismico`;
3. `Data deposito sismico` / etichetta sorgente equivalente;
4. `Tecnico deposito sismico`;
5. `Direttore Lavori`;
6. `Collaudatore`;
7. `Protocollo deposito sismico`;
8. `N° protocollo deposito sismico`;
9. `N° sismica`;
10. `Forecast CIL`;
11. `Data IL`;
12. `Data FL`.

I campi condizionati dal flag `Deposito sismico = SI` devono rispettare le condizioni riportate nei rispettivi MD. La presenza di questa struttura comune non autorizza comunque a propagare altri campi DL non attestati dalle fonti.

Le sezioni di un team non devono essere replicate meccanicamente sugli altri team.

### Livello F - Comportamento UI e autorizzazioni

Per ogni campo vanno tenuti distinti:

- visibile;
- modificabile;
- sola lettura;
- compilato da un altro team;
- sempre visibile;
- visibile solo a una condizione;
- ripetibile;
- calcolato automaticamente;
- derivato da G7;
- valorizzato da un'altra fonte.

Queste proprietà NON sono categorie semantiche.

### Livello G - Identità operativa (`id_flusso`)

Ogni campo operativo master è identificato da un `id_flusso` nel formato `Fxxx`.

Regole consolidate:

- l'ID rappresenta l'identità operativa del campo, non il numero di riga della tabella;
- la colonna `#` identifica invece la singola occorrenza nel file di associazione;
- un campo master determina l'`id_flusso`;
- una stessa informazione mostrata in un pop-up o in sola lettura eredita l'ID del master;
- un mirror non consuma un nuovo ID;
- l'inserimento o la rimozione di un vero campo master richiede la reindicizzazione coerente degli ID successivi e di tutti i relativi mirror;
- due campi semanticamente diversi non devono condividere lo stesso `id_flusso`.

Questa distinzione è fondamentale per non confondere duplicazioni di visualizzazione con nuovi dati.

---

## 3. Gerarchia delle fonti

In caso di conflitto usare questa gerarchia, distinguendo **esistenza/struttura del campo** da **mapping semantico**.

### 3.1 Fonte primaria - `Organizzazione Campi - <CLIENTE>`

I documenti di organizzazione determinano:

- se un campo esiste nella configurazione corrente;
- il team;
- la sezione;
- l'ordine operativo;
- le condizioni di comparsa;
- le relazioni di sola visualizzazione e pop-up;
- le regole operative esplicitamente descritte.

Un campo assente dal documento operativo non deve essere aggiunto soltanto perché compare nel mapping o in un altro cliente.

### 3.2 Baseline strutturata - `ASSOCIAZIONI_CAMPI_<CLIENTE>.md`

I sei file di associazione sono la trasposizione implementativa verificata dei documenti operativi. Contengono, per ogni occorrenza:

- team e sezione;
- campo sorgente;
- `dtype` quando esplicito;
- `id_flusso`;
- Campo Universale proposto;
- confidenza;
- evidenza/nota;
- condizione documentata.

Per il lavoro applicativo corrente questi file devono essere preferiti alla ricostruzione manuale della struttura a partire dai documenti sorgente, purché non esista una modifica successiva nel documento `Organizzazione Campi`.

### 3.3 Fonte secondaria - `Tabella_Mapping_Completa+SchemaDB`

Il foglio `Mapping_Dati_Completo` viene interrogato **dopo** aver censito il campo operativo.

Serve per:

- proporre o confermare il `Campo Universale`;
- mantenere la tracciabilità semantica;
- usare le evidenze G7 secondo la relativa precedenza;
- distinguere equivalenze dirette da proxy o associazioni deboli.

Non è autorizzato a introdurre campi assenti dalla fonte operativa.

### 3.4 Matrice di coerenza terminologica

`MATRICE_COERENZA_TERMINOLOGICA_CAMPI_DASHBOARD.md` è un controllo trasversale sui nomi adottati tra clienti.

La matrice:

- confronta campi già presenti nei file di associazione;
- evidenzia terminologia coerente, da uniformare o specifica;
- NON stabilisce l'esistenza del campo;
- NON modifica ownership, sezione o `id_flusso`;
- NON deve creare equivalenze non validate.

Snapshot definitivo al 2 ottobre 2026: **188 righe**, di cui **138 COERENTE**, **0 DA UNIFORMARE** e **50 SPECIFICO**.

### 3.5 Regole trasversali e decisioni progettuali

Fonti:

- `Note Implementazione`
- `Check PraticeHub`

Questi documenti restano utili per regole generali, autorizzazioni, passaggi tra team e decisioni architetturali. Eventuali note storiche formulate come `da capire`, `da chiedere`, `valutare`, `verificare`, `parlare con`, `da consolidare` non prevalgono su una decisione successivamente recepita nei documenti operativi e nei file di associazione.

### 3.6 Flusso operativo aziendale

Quando presente una descrizione esplicita del flusso aziendale, essa ha priorità sulla semplice vicinanza semantica dei campi.

Il macro-flusso di riferimento è:

1. Assegnazione
2. Apertura / registrazione della pratica
3. Esecuzione
4. Controllo di qualità
5. Consegna / protocollo
6. Chiusura amministrativa

Le attività dei vari team possono essere parallele, iterative o condizionali.

---

## 4. Regola principale per la ristrutturazione

NON categorizzare un campo chiedendosi soltanto:

> A quale concetto assomiglia?

Chiedersi invece, nell'ordine:

1. In quale momento del processo viene utilizzato?
2. Chi lo compila?
3. Chi deve poterlo modificare?
4. Chi deve soltanto visualizzarlo?
5. È necessario per far partire una fase successiva?
6. È prodotto da un altro team?
7. È un output di una fase precedente?
8. È una milestone?
9. È un dato anagrafico stabile oppure un dato relativo a una specifica attività/pratica?
10. Compare sempre oppure soltanto in determinate lavorazioni?
12. È ripetibile?
13. È calcolato o derivato?
14. È amministrativo e quindi successivo alla fase tecnica?
15. In caso di dubbio, esiste una regola esplicita nei documenti?

Solo dopo queste verifiche assegnare la sezione.

---

## 5. Mapping semantico e workflow non devono coincidere necessariamente

Uno stesso Campo Universale può essere:

- semanticamente identico tra più gestionali;
- visualizzato in sezioni diverse a seconda del cliente;
- compilato da team diversi;
- in sola lettura per alcuni team;
- richiesto in momenti diversi del workflow.

Quindi:

`Campo Universale != Sezione dashboard`

La sezione dashboard è una proprietà contestuale:

`Sezione = f(cliente, team, tipo pratica, stato workflow, permessi, condizione)`

Il mapping semantico deve rimanere stabile anche se cambia la disposizione della UI.

---

## 6. Gestione dei duplicati, dei mirror e delle occorrenze

Non eliminare automaticamente campi duplicati o apparentemente duplicati.

Distinguere almeno quattro casi.

### Caso 1 - stesso concetto in gestionali diversi

È normale. Il mapping serve a riconciliarli.

### Caso 2 - stesso Campo Universale usato in team o fasi diverse

Può essere corretto. Un campo può essere compilato da un team, visualizzato da un altro e usato come input per una fase successiva.

### Caso 3 - mirror / sola visualizzazione / pop-up

Non è un duplicato logico.

Il mirror:

- rappresenta lo stesso dato del master;
- mantiene lo stesso `id_flusso`;
- può avere una condizione di visualizzazione contestuale diversa;
- non introduce un nuovo campo nel modello dati;
- non consuma un nuovo identificativo di flusso.

Esempi consolidati sono le assegnazioni PM visualizzate in AIE o UT+PE e gli output UT/PE mostrati nei pop-up PM/Permessi.

### Caso 4 - duplicato reale nello stesso contesto operativo

Segnalarlo come possibile ridondanza e confrontarlo con la fonte corrente. Se la duplicazione è stata esplicitamente rimossa durante il consolidamento, non deve essere reintrodotta da versioni storiche o per analogia con altri clienti.

---

## 7. G7

G7 non deve essere considerato automaticamente la fonte autorevole di tutti i campi.

Le evidenze raccolte indicano che va trattato come fonte forte soprattutto per:

- denominazione / identificazione della pratica;
- Codice / Nome sito quando supportati;
- Num Doc / codice commessa;
- Data Doc / riferimento temporale di assegnazione;
- stati amministrativi e milestone soltanto quando la corrispondenza è esplicitamente dimostrata.

Non promuovere un proxy G7 a equivalenza diretta senza evidenza.

---

## 8. Etichette operative temporanee escluse dalla tassonomia dashboard

Eventuali etichette utilizzate nei materiali di coordinamento interno per indicare priorità operative non fanno parte dell'organizzazione o della tassonomia della dashboard.

L'LLM incaricata della ristrutturazione deve ignorarle completamente e non deve usarle per:

- definire sezioni;
- ordinare i campi;
- stabilire ownership;
- determinare visibilità o modificabilità;
- produrre classificazioni o output.

La struttura della dashboard deve essere ricavata esclusivamente dal cliente, dal team, dalla fase del workflow, dalle regole di visibilità/modifica e dalle condizioni operative già definite.

## 9. Proprietà operative, visibilità e ownership

Per ogni occorrenza di campo la baseline strutturata deve mantenere almeno queste proprietà:

| Proprietà | Significato |
|---|---|
| Cliente | Cliente a cui appartiene la configurazione |
| Team | Team della specifica occorrenza |
| Sezione | Sezione operativa della dashboard |
| Campo | Nome del campo nel documento operativo |
| dtype | Tipo esplicitamente indicato dalla fonte, se presente |
| # | Progressivo dell'occorrenza nel file di associazione |
| id_flusso | Identità operativa condivisa tra master e mirror |
| Campo Universale | Riferimento semantico proposto, se supportato |
| Confidenza | ALTA / MEDIA / BASSA |
| Evidenza / nota | Motivazione dell'associazione o ruolo dell'occorrenza |
| Condizione | Regola documentata che determina comparsa/comportamento |
| Tipo occorrenza | Master operativo, mirror, sola visualizzazione, pop-up |

Regole sul `dtype`:

- riportare il tipo quando è esplicitato dalla fonte;
- `data` viene normalizzato come `DATE (gg/mm/aaaa)` nella baseline corrente;
- `(SI, NO)` da solo non autorizza a inferire automaticamente un menu a tendina se il documento non lo dichiara;
- un mirror conserva il tipo del dato master quando la fonte lo consente.

Le regole di ruolo e permesso applicative possono essere modellate separatamente, ma non devono contraddire le indicazioni di sola lettura/modifica già consolidate nelle fonti.

La visibilità complessiva della pratica è organizzata su **due livelli distinti**:

1. **Visuale principale operativa**: contiene i campi di competenza del team, le sezioni ereditate e i pop-up definiti nella baseline. È qui che valgono le regole di modifica, sola lettura e ownership descritte nei file di associazione.
2. **Visuale secondaria di avanzamento**: finestra sintetica, già presente nella beta, che permette a tutti i team di consultare lo stato di compilazione/avanzamento degli altri team anche quando quei campi non appartengono alla loro visuale principale.

La regola di fondo è quindi **visibilità globale dell'avanzamento, editabilità contestuale nella visuale principale**.

---

## 10. Passaggio tra team, accesso alla pratica e persistenza delle modifiche

Il workflow non deve assumere a priori una sequenza rigida PM -> AIE -> UT+PE -> DL.

Non esiste un team Sopralluoghi che alimenta autonomamente il gestionale.

Il PM è il principale punto di coordinamento della pratica: avvia la pratica, inserisce e aggiorna i dati preliminari e alimenta i passaggi verso gli altri team. La sua visibilità estesa non deve essere implementata come eccezione artificiale «PM vede tutto»: deriva dal fatto che il PM avvia e coordina l'intero flusso e mantiene quindi la pratica nella propria dashboard per tutto il ciclo di vita.

La funzionalità `Passa`, già presente nella beta, ha una semantica precisa:

- notifica uno o più team destinatari;
- rende raggiungibile la pratica nella dashboard del team destinatario;
- apre la relativa attività presso il team destinatario;
- può coinvolgere più team nella stessa operazione;
- non trasferisce in modo esclusivo la proprietà della pratica e non blocca il team mittente;
- non rende non modificabili i campi già compilati.

**Regola consolidata di editabilità:** una pratica e i relativi campi rimangono modificabili anche dopo `Passa` e anche dopo che la pratica è stata completata. L'editabilità dipende esclusivamente dalle autorizzazioni del ruolo/team e dalle regole master/mirror/sola lettura della visuale principale, non dallo stato di completamento della pratica.

Esempio: il team AIE non deve necessariamente avere la pratica nella propria dashboard fin dall'apertura. La pratica compare nella sua visuale operativa quando il PM la passa ad AIE; da quel momento AIE vede le sezioni ereditate previste e lavora sui propri campi. Il PM continua comunque a mantenere la pratica nella propria dashboard.

La finestra secondaria di avanzamento consente invece a tutti i team di vedere sinteticamente lo stato degli altri team, indipendentemente dall'ownership della visuale principale.

Le pratiche concluse restano accessibili e modificabili secondo le stesse autorizzazioni. La dashboard deve però **dare priorità visiva alle attività ancora aperte/in corso**, senza perdere la consultabilità dello storico operativo corrente.

`Assegna`, `In lavorazione` e `Passa` rappresentano stati o azioni differenti del flusso e non devono essere reinterpretati dall'LLM se già definiti nel sistema corrente.

Per UT, PE e AIE l'assegnazione deve essere trattata come un'azione esplicita: la compilazione di `Data assegnazione`, forecast ed eventuali note prepara il passaggio, ma la notifica/assegnazione effettiva deve avvenire tramite una conferma intenzionale (`Conferma` / `Invia` / `Passa`). La sola modifica di una data non deve assegnare accidentalmente una pratica.

La ristrutturazione deve quindi rispettare una rete di fasi e dipendenze, non un wizard strettamente lineare.

---

## 11. Condizioni dipendenti dalla lavorazione

Le regole collegate a `Incarico / Lavorazione`, alla tipologia sito e ad altri campi discriminanti sono strutturali.

Esempi presenti nelle configurazioni:

- Caratterizzazione;
- Verifica Statica;
- Caratterizzazione + VS;
- Progetto Esecutivo;
- PE + VS;
- New Site;
- Collocato;
- Applicabilità;
- altre lavorazioni cliente-specifiche.

Nella baseline UT+PE corrente il blocco di caratterizzazione è presente **soltanto per ILIAD e INWIT** ed è semanticamente allineato attraverso i campi `Forecast Invio Caratterizzazione`, `Tecnico Caratterizzazione`, `Fornitore Caratterizzazione` e `Invio Report Caratterizzazione`. Le condizioni restano cliente-specifiche: ILIAD e INWIT possono usare trigger differenti. Il blocco non deve essere propagato a TIM/FIBERCOP, TOWERNET, FASTWEB-VODAFONE o LEONARDO senza una nuova evidenza operativa esplicita.

Anche una stessa identità di flusso può avere condizioni di visualizzazione diverse tra vista owner e mirror. Per esempio, una condizione del pop-up PM può essere diversa da quella dell'occorrenza operativa UT: ciò non crea un nuovo campo.

L'LLM deve:

1. identificare le condizioni esplicite;
2. separarle dalla categorizzazione del campo;
3. non rendere sempre visibile un campo indicato come condizionale;
4. non inventare condizioni mancanti;
5. preservare la condizione della singola occorrenza quando master e mirror hanno comportamenti UI diversi.

---

## 12. Campi trasversali

Alcuni campi non appartengono naturalmente a una sola fase.

Esempi tipici:

- Stato attività;
- **Note Operative**;
- Note specifiche di fase/team;
- Forecast;
- ODA;
- Fatturabile;
- Fatturato;
- BEF;
- dati economici;
- riferimenti di commessa.

Per questi campi non forzare automaticamente una collocazione.

Valutare se debbano essere:

- header della pratica;
- card riepilogativa;
- sezione amministrativa;
- timeline;
- dettaglio di approfondimento;
- campo trasversale sempre visibile.

### Campi trasversali di pratica consolidati

Sono consolidati tre campi globali, validi per **tutti i gestori** e non appartenenti a una singola fase/team:

1. **`Note Operative`**
   - campo libero;
   - deve comparire **in cima alla visuale principale della pratica**;
   - serve a gestire eccezioni e lavorazioni straordinarie non rappresentabili adeguatamente dai campi strutturati;
   - non sostituisce le note specialistiche di AIE, UT, PE, ODA, assegnazione o altre fasi.

2. **`Fatturabile`**
   - dominio funzionale `SI / NO`;
   - è un campo trasversale di pratica e deve essere messo in evidenza nella parte alta della visuale principale;
   - la valorizzazione automatica scatta **30 giorni dopo `Ottenimento Permessi`**, purché `Esito parere Arpa = positivo`;
   - se `Stato attività = KO`, deve comparire un alert per ricordare al PM la compilazione manuale di `Fatturabile`.

3. **`Fatturato`**
   - dominio funzionale `SI / NO`;
   - è un campo trasversale di pratica e deve essere messo in evidenza nella parte alta della visuale principale;
   - la fonte ILIAD corrente non specifica una regola automatica ulteriore di valorizzazione/completamento: non va inventata.

Questi tre campi sono metadati globali della pratica. Sono registrati nei sei MD in una sezione separata di **baseline implementativa** e **non consumano `id_flusso`**, perché non costituiscono tappe del workflow cliente-specifico.

In ILIAD `Fatturabile` e `Fatturato` restano anche censiti nelle righe sorgente della sezione `Fatturazione` per tracciabilità; in UI devono però essere rappresentati una sola volta come campi trasversali, senza duplicazione.

Se il documento non consente una decisione sicura per altri campi trasversali, classificare come `DA VERIFICARE`.

---

## 13. Forecast

I Forecast sono **milestone operative distinte** e non devono essere consolidati in un unico campo generico. Il precedente concetto di `Forecast Generale` è superato e non fa più parte della baseline corrente.

Tra i forecast consolidati o cliente-specifici rientrano, secondo la fonte del singolo gestore:

- `Forecast AIE`;
- `Forecast PE`;
- `Forecast UT`;
- `Forecast Ottenimento Permessi`;
- `Forecast Parere Arpa` nei gestori che prevedono l'iter ARPA;
- `Forecast Ottenimento “Nome ente”`;
- `Forecast Deposito Sismico`;
- `Forecast CIL`;
- forecast specialistici come `Forecast Geologica`, `Forecast Protocollo`, `Forecast PSC` e `Forecast Invio Caratterizzazione` dove presenti.

I Forecast non sono soltanto dati informativi: alcuni alimentano alert, scadenze e priorità operative. Per questo:

- non introdurre un campo generico `Urgenza`;
- la priorità di una lavorazione deve essere espressa principalmente attraverso la data di forecast/scadenza pertinente;
- l'anticipazione di un forecast deve essere concordata con il team che esegue l'attività quando comporta una variazione reale delle priorità;
- se l'anticipo di una pratica richiede lo slittamento di un'altra, anche il forecast della pratica impattata deve essere aggiornato e tracciato;
- gli SLA/tempi standard non devono essere hard-coded come valore globale se la fonte non definisce una soglia comune.

Le regole di alert associate ai Forecast sono consolidate nella sezione 17.10.

---

## 14. Stato attività

Lo `Stato attività` è una proprietà trasversale della pratica.

Sono previste condizioni automatiche e stati manuali.

Tra gli stati citati:

- ASSEGNATO
- IN LAVORAZIONE
- IN APPROVAZIONE
- PROTOCOLLATO
- INTEGRAZIONE RICHIESTA
- AUTORIZZATO
- DINIEGATO
- TAR
- REALIZZATO
- TERMINATO
- STAND-BY
- KO

L'LLM NON deve inferire autonomamente una macchina a stati definitiva. Le regole annotate per gli aggiornamenti automatici dello `Stato attività` sono requisiti di implementazione, ma la precedenza formale tra aggiornamento automatico e modifica manuale resta una decisione tecnica da formalizzare.

Deve invece:

- riportare le regole esplicite;
- individuare conflitti;
- segnalare transizioni non definite;
- distinguere stato tecnico, autorizzativo e amministrativo quando necessario;
- usare lo stato/attività aperta come uno dei segnali per dare priorità visiva alle pratiche ancora in corso, senza impedire l'accesso o la modifica delle pratiche concluse.

---

## 15. Campi ripetibili

Alcuni concetti devono supportare più occorrenze.

Esempi:

- ODA + Note ODA;
- richieste integrazione;
- enti;
- pareri;
- tenant;
- eventuali ripresentazioni.

Non trasformarli in un singolo valore scalare se il documento indica ripetibilità.

---

## 15.1 Stato consolidato delle fonti correnti

### Baseline operativa

Il confronto con i team sui campi è considerato concluso. I documenti operativi, i sei file di associazione e la matrice definitiva del 2 ottobre 2026 costituiscono una baseline da implementare, non un inventario esplorativo.

Eventuali campi con `Campo Universale = DA VERIFICARE` o confidenza `BASSA` possono avere ancora un'associazione semantica non definitiva, ma ciò non mette in discussione la loro esistenza operativa quando il campo è presente nella fonte primaria.

### AIE

La sezione AIE è allineata tra i sei gestori. `Assegnazione AIE` è master PM/Permessi e mirror AIE in sola visualizzazione; `Forecast AIE` segue la relazione master/mirror definita dal singolo gestore.

La regola funzionale WT8 è comune: `Forecast AIE` genera un alert **2 giorni prima** e l'alert si considera risolto quando viene compilato `Approvazione AIE`. Le occorrenze mirror mantengono l'`id_flusso` del master.

### UT + PE

La sezione operativa UT+PE e i relativi pop-up sono allineati sui sei file di associazione.

Punti consolidati:

- UT e PE rimangono un unico team con due sotto-sezioni;
- `Invio AS/VS` è il campo operativo di chiusura/riferimento del flusso UT per gli alert collegati a `Forecast UT`;
- `Invio PE` è il campo di chiusura/riferimento del flusso PE per gli alert collegati a `Forecast PE`; ownership e mirror devono seguire il singolo MD;
- il blocco di caratterizzazione (`Forecast Invio Caratterizzazione`, `Tecnico Caratterizzazione`, `Fornitore Caratterizzazione`, `Invio Report Caratterizzazione`) è previsto solo per ILIAD e INWIT;
- non propagare tale blocco a TIM/FIBERCOP, TOWERNET, FASTWEB-VODAFONE o LEONARDO;
- nella sezione PE i campi provenienti da PM rimangono mirror in sola visualizzazione quando così definiti;
- i mirror mantengono sempre l'`id_flusso` del relativo master.

### Direzione Lavori

Tutti e sei i gestori condividono il blocco DL consolidato descritto nella sezione 2. L'ownership della sismica è esclusivamente DL. `Forecast CIL`, `Data IL` e `Data FL` fanno parte della baseline comune e alimentano anche la regola di alert DL descritta nella sezione 17.10.

### ILIAD

ILIAD rimane un riferimento importante per la struttura operativa UT/PE e per i pop-up, ma non è un template da propagare automaticamente. Mantiene inoltre la sezione PM/Permessi `Fatturazione`, con campi come Offerta, ODA, `Fatturabile`, `Fatturato`, WCN, CDMS, EM e AGORA' e relative condizioni.

La presenza di una regola, di una sezione o di un campo in ILIAD non autorizza a propagarlo agli altri clienti se manca una corrispondente regola operativa.

### Matrice terminologica

La matrice definitiva di coerenza è stata riallineata dopo la validazione dei sei MD. Lo snapshot corrente contiene:

- **188** righe complessive;
- **138** `COERENTE`;
- **0** `DA UNIFORMARE`;
- **50** `SPECIFICO`.

La matrice non presenta quindi questioni terminologiche aperte nella baseline corrente.

### Regola di aggiornamento

Una futura modifica del documento `Organizzazione Campi - <CLIENTE>` prevale per quel cliente. Tuttavia, dopo il freeze corrente, ogni modifica deve essere trattata come change request e propagata in modo controllato secondo la procedura della sezione 20.5.

---

## 16. Procedura operativa per ogni cliente

Il lavoro ordinario non parte più da un inventario da costruire: i campi sono già censiti nei sei file `ASSOCIAZIONI_CAMPI_<CLIENTE>.md`.

L'LLM NON deve:

- identificare da zero il team owner;
- rifare il mapping semantico;
- ricostruire l'inventario a partire dai gestionali sorgente;
- riallineare autonomamente un cliente agli altri senza una modifica esplicita della fonte;
- rinumerare gli `id_flusso` senza una variazione strutturale che lo richieda.

### Step 1 - Partire dal file di associazione corrente

Usare il file `ASSOCIAZIONI_CAMPI_<CLIENTE>.md` più recente come baseline implementativa e verificare il documento `Organizzazione Campi - <CLIENTE>` quando esiste una modifica successiva o un dubbio di tracciabilità.

### Step 2 - Preservare struttura e identità

Per ciascuna occorrenza mantenere:

- team;
- sezione;
- ordine;
- `dtype`;
- `id_flusso`;
- mapping/confidenza;
- condizioni;
- relazione master/mirror.

### Step 3 - Rispettare visibilità e modificabilità consolidate

Quando il documento specifica che un campo è compilato da un altro team, di sola lettura o mostrato tramite pop-up, preservare tale comportamento senza creare una seconda identità dati.

### Step 4 - Applicare le condizioni già esplicitate

Conservare le regole dipendenti da lavorazione, cliente, valore di altri campi, passaggio ad altri team o eventi del workflow. Non inventare nuove condizioni.

### Step 5 - Distinguere dubbio semantico da dubbio operativo

Un campo può essere operativo e consolidato anche se il `Campo Universale` è ancora `DA VERIFICARE`. In tal caso non rimuoverlo e non spostarlo: mantenere l'incertezza soltanto sul mapping.

### Step 6 - Validare gli `id_flusso`

Dopo qualsiasi variazione strutturale verificare:

- sequenza `F001...Fxxx` senza buchi non intenzionali;
- assenza di collisioni tra campi diversi;
- stesso ID per master e relativi mirror;
- nessun nuovo ID per occorrenze di sola visualizzazione.

### Step 7 - Aggiornare gli artefatti derivati

Solo dopo aver validato il file di associazione aggiornare, se necessario:

1. gli altri MD quando la modifica è realmente trasversale;
2. la matrice terminologica;
3. questa guida, soltanto se cambia una regola strutturale o metodologica.

---

## 17. Specifiche implementative consolidate della dashboard

Questa sezione assorbe le indicazioni ancora valide provenienti dalle precedenti `Note Implementazione`. Gli appunti storici non elencati qui non devono essere considerati requisiti attivi.

### 17.1 Navigazione e organizzazione generale

**CONSOLIDATO**

- La divisione principale della dashboard è per **cliente**, non per gestionale.
- La visuale principale della pratica segue il flusso operativo e le sezioni definite negli MD, non la vecchia categorizzazione del mapping.
- UT e PE costituiscono un unico team operativo ma mantengono due sezioni distinte nella visuale principale; gli operatori del team possono consultare entrambe.
- AIE, UT e PE ricevono le pratiche nella propria dashboard quando il flusso le coinvolge tramite `Passa`.
- La visuale secondaria di avanzamento resta disponibile per consultare sinteticamente il lavoro degli altri team.
- Le attività ancora aperte/in corso devono avere priorità visiva rispetto a quelle concluse.

### 17.2 Autorizzazioni ed editabilità

**CONSOLIDATO**

- Nessun completamento di fase o della pratica rende automaticamente i campi read-only.
- I campi restano editabili nel tempo in base a ruolo/team e alle regole specifiche della visuale principale.
- I mirror e i pop-up dichiarati di sola visualizzazione restano non modificabili nell'occorrenza mirror, anche se il master è modificabile dal team owner.
- La matrice autorizzativa deve essere configurabile per ruolo/team/cliente; eventuali eccezioni individuali non devono essere hard-coded nella struttura dei campi.
- PM e DL sono i ruoli previsti per la creazione autonoma di nuove pratiche, secondo la configurazione applicativa corrente.

### 17.3 Creazione, rilavorazione e duplicazione della pratica

**DA IMPLEMENTARE / MANTENERE**

- Una rilavorazione deve generare una nuova pratica/riga con nuovo identificativo, preservando il collegamento concettuale al sito originario.
- Deve essere possibile duplicare la parte di **Core Anagrafica Sito** per avviare una nuova lavorazione sullo stesso sito senza duplicare automaticamente date, iter autorizzativi o dati di fase che appartengono alla singola pratica.

### 17.4 Configurazione amministrativa

**DA IMPLEMENTARE / MANTENERE**

- Deve esistere una pagina di configurazione visibile agli admin per gestire i valori dei menu a tendina.
- I menu a tendina devono supportare ricerca dinamica quando il numero di valori lo rende utile.
- Clienti, committenti, proprietà e liste analoghe devono essere gestiti come configurazioni riusabili; gli admin devono poter selezionare quali valori rendere disponibili nei relativi menu.
- Le configurazioni non devono modificare la semantica o l'`id_flusso` dei campi: cambiano soltanto il dominio dei valori ammessi.

### 17.5 Passaggio, assegnazioni, notifiche e collaborazione

**DA IMPLEMENTARE / MANTENERE**

- `Passa` deve consentire di selezionare più team destinatari nella stessa operazione e non trasferisce in modo esclusivo la proprietà della pratica.
- Per UT, PE e AIE l'azione di assegnazione deve essere esplicita: `Data assegnazione` + forecast + eventuali `Note Assegnazione` vengono preparati prima della conferma; la notifica parte dopo un comando intenzionale di conferma/invio, non al semplice inserimento della data.
- L'assegnazione/passaggio deve poter produrre una mail contenente almeno pratica, data di assegnazione, forecast e note di assegnazione quando previste.
- Le note associate al passaggio della pratica devono essere incluse nella notifica relativa al passaggio.
- Gli alert ordinari devono essere **principalmente in-app**, per evitare sovraccarico della posta. Le email sono obbligatorie per i passaggi/assegnazioni dove previste e possono essere abilitate per eventi critici/configurati.
- Le notifiche in-app devono essere visibili tramite un centro notifiche/campanella e devono portare direttamente alla pratica interessata.
- La lettura della notifica non equivale alla risoluzione dell'alert: l'alert resta attivo finché la condizione che lo genera non viene risolta o finché viene usata un'azione di risoluzione prevista.
- I campi/scadenze che generano alert possono essere evidenziati visivamente, ad esempio in rosso, mantenendo distinta l'evidenza grafica dalla logica di stato.
- Le card/indicatori relativi a un team nella visuale operativa devono diventare rilevanti/attivi quando la pratica viene passata a quel team, evitando di sovraccaricare la visuale con attività non ancora avviate.
- Eventuali notifiche al team DL collegate all'assegnazione PE devono essere indirizzate al **ruolo/team DL**, non hard-coded sul nome di una persona.

### 17.6 Campi e componenti con comportamento speciale

**CONSOLIDATO / DA IMPLEMENTARE**

- `ODA` e relative note supportano occorrenze multiple.
- `Richiesta integrazione` e relativi dettagli devono preservare la ripetibilità prevista dalle fonti correnti.
- `Incarico / Lavorazione` deve supportare selezione multipla dove esplicitamente previsto dal cliente.
- `Fatturazione` resta una sezione cliente-specifica di ILIAD e **non** va propagata integralmente agli altri clienti.
- Fanno eccezione `Fatturabile` e `Fatturato`, promossi esplicitamente a **campi trasversali di pratica per tutti i gestori**.
- `Fatturabile`, `Fatturato` e `Note Operative` devono essere messi in evidenza nella parte alta della visuale principale.
- La logica automatica di `Fatturabile` è quella derivata dalla fonte ILIAD; per `Fatturato` non è definita un'automazione ulteriore e non deve essere inferita.
- Le condizioni di `Invio AS/VS`, `Tipologia attività PE`, caratterizzazione, geologica e relativi pop-up sono quelle già consolidate negli MD e non vanno ricostruite da vecchi appunti.

### 17.7 Stato attività

**DA IMPLEMENTARE**

Lo `Stato attività` è trasversale e può essere aggiornato sia da eventi automatici sia manualmente. Le regole storicamente annotate includono, a titolo di baseline funzionale:

- `ASSEGNATO` quando è valorizzata la data di assegnazione;
- `IN LAVORAZIONE` quando l'attività viene assegnata/passata al team operativo;
- `IN APPROVAZIONE` come stato manuale quando si attende un'approvazione;
- `PROTOCOLLATO` quando viene valorizzato il relativo protocollo;
- `INTEGRAZIONE RICHIESTA` quando viene registrata una richiesta di integrazione;
- `AUTORIZZATO / DINIEGATO / TAR` in funzione dell'esito autorizzativo esplicito;
- `REALIZZATO` quando viene registrata la milestone di fine lavori prevista dal flusso DL;
- `TERMINATO`, `STAND-BY` e `KO` come stati manuali.

Queste regole devono essere verificate contro i campi effettivi del cliente prima di essere codificate. La precedenza tra aggiornamento automatico e override manuale resta una decisione tecnica aperta.

### 17.8 G7

**FUTURO / OPZIONALE**

- Non esiste oggi una sincronizzazione diretta con G7.
- È possibile valutare in futuro la lettura/import dell'export G7 per precompilare campi supportati da evidenza forte.
- Un eventuale import deve definire esplicitamente regole di precedenza, conflitto, aggiornamento e tracciabilità; non può sovrascrivere automaticamente dati manuali senza una policy approvata.

### 17.9 Indicazioni storiche da non trattare come requisito attivo

Non devono essere reintrodotte automaticamente:

- la generica voce `Attività particolari`, ormai considerata appunto storico;
- split storici di campi come `Configuratore` se il campo non compare nelle fonti operative correnti;
- la vecchia modellazione generica `Ottenimento Enti / Permessi` quando i documenti correnti descrivono già campi autorizzativi più specifici;
- proposte di propagare a tutti i clienti sezioni o campi presenti soltanto in uno di essi;
- richieste di «uniformare i fogli» già assorbite dal lavoro di consolidamento degli MD e della matrice terminologica.

---

### 17.10 Alert e scadenze operative WT8

**CONSOLIDATO / DA IMPLEMENTARE**

Gli alert sono regole di workflow, non nuovi campi. Devono essere parametrizzati sul campo sorgente corretto e chiusi dalla condizione esplicita indicata.

| Trigger | Condizione di alert / scadenza | Chiusura / destinatario | Ambito |
|---|---|---|---|
| `Data sopralluogo` | 7 giorni dopo `Data assegnazione` se `Data sopralluogo` è ancora vuota | compilazione `Data sopralluogo` | tutti i gestori |
| `Invio verbale di sopralluogo` | 3 giorni dopo `Data sopralluogo` se il verbale non è compilato | compilazione `Invio verbale di sopralluogo` | tutti i gestori |
| `Forecast UT` | 2 giorni prima del forecast se `Invio AS/VS` non è compilato | compilazione `Invio AS/VS` | tutti i gestori |
| `Forecast PE` | 4 giorni prima del forecast se `Invio PE` non è compilato | compilazione `Invio PE` | tutti i gestori |
| `Forecast AIE` | 2 giorni prima del forecast | compilazione `Approvazione AIE` | tutti i gestori |
| `Forecast Ottenimento Permessi` | 3 giorni dopo il forecast se `Ottenimento Permessi` è ancora vuoto | compilazione `Ottenimento Permessi` | tutti i gestori |
| `Forecast Parere Arpa` | 3 giorni dopo il forecast se `Parere Arpa` è ancora vuoto | compilazione `Parere Arpa` | tutti i gestori che prevedono l'iter ARPA; escluso LEONARDO |
| `Invio CDMS` | 1 settimana dopo la data indicata; reminder settimanale | compilazione di `EM` **data** | ILIAD, quando ricorrono le condizioni del campo |
| `Data Invio Offerta` / `Invio Offerta` | 1 settimana dopo se `ODA` non è compilato; reminder settimanale | compilazione `ODA` | TOWERNET, TIM/FIBERCOP, INWIT, ILIAD |
| ODA FASTWEB/VODAFONE | 1 giorno dopo `Data assegnazione` se `Stato ODA = DA RICHIEDERE`; inoltre 1 giorno dopo `Invio Pacchetto Permessi` se `Stato ODA = DA RICHIEDERE` o `RICHIESTI` | avanzamento `Stato ODA` / arrivo ODA | FASTWEB-VODAFONE |
| Fine lavori DL | `Forecast CIL + 20 giorni` con `Data FL` ancora vuota | compilazione `Data FL`; destinatari **PM** | tutti i gestori |
| `Fatturabile` con pratica KO | se `Stato attività = KO` e serve la valorizzazione manuale | compilazione manuale `Fatturabile`; destinatario PM | tutti i gestori |

Nota terminologica: nelle fonti WT8 l'alert DL di fine lavori è espresso come **`Forecast CIL + 20 gg` con `Data FL` vuota**. Non deve essere creato un nuovo campo `Forecast FL` se tale campo non esiste nella baseline.

Regole generali:

- un alert deve essere idempotente e non duplicarsi a ogni refresh;
- la persistenza dell'alert dipende dalla condizione di chiusura, non dalla lettura della notifica;
- i reminder ricorrenti devono essere generati solo dove la regola lo prevede esplicitamente;
- le soglie devono essere configurabili senza cambiare l'identità del campo;
- il log dell'alert deve registrare almeno pratica, regola, timestamp di apertura, destinatario e timestamp/modalità di chiusura.

### 17.11 Utenti, assegnazioni e carico di lavoro

**DA IMPLEMENTARE**

- I campi di tecnico/assegnatario che alimentano carichi di lavoro e responsabilità devono riferirsi a **utenti reali registrati sulla piattaforma**, non a testo libero.
- La selezione deve supportare ricerca/autocomplete e, dove utile, filtraggio per team/ruolo.
- L'utente deve essere collegato all'account/email applicativo per evitare duplicazioni dovute a varianti nominali.
- Il carico di lavoro deve essere calcolabile per utente/tecnico sulla base delle pratiche e attività realmente assegnate.
- Le statistiche sui carichi non devono dipendere da confronti lessicali tra stringhe compilate manualmente.

### 17.12 Timeline e audit della pratica

**DA IMPLEMENTARE / MANTENERE**

Ogni pratica deve avere una timeline/audit trail consultabile che registri almeno:

- azione effettuata;
- utente/autore;
- data e ora;
- passaggi/assegnazioni tra team;
- modifiche significative ai campi;
- apertura e chiusura degli alert;
- riferimenti a documenti o link associati quando applicabile.

La timeline non sostituisce lo storico dei valori quando è necessaria una vera versionizzazione del dato; i due concetti devono poter essere distinti a livello di modello.

### 17.13 Statistiche, KPI ed export

**DA IMPLEMENTARE**

La dashboard deve poter sfruttare date, forecast, assegnazioni e alert per produrre analisi operative. KPI utili includono:

- numero di verbali inviati oltre soglia;
- attività completate entro/fuori forecast;
- tempo da assegnazione a chiusura;
- pratiche assegnate per tecnico/utente;
- carico di lavoro e volumi per team/utente;
- forecast e scadenze per periodo;
- pratiche con alert aperti, risolti o ripetuti.

Deve essere previsto un **export CSV** dei dati coerente con i filtri applicati.

Non introdurre classifiche semplicistiche `top/flop` degli operatori come requisito di prodotto: l'obiettivo è monitorare volumi, tempi, scadenze e carichi, non produrre ranking personali.

### 17.14 Assistente AI in sola lettura

**DA IMPLEMENTARE / VALUTARE**

L'assistente AI è un livello conversazionale **read-only** sopra i dati autorizzati della dashboard. Non deve modificare campi, cambiare stati, risolvere alert o eseguire azioni operative in autonomia.

Casi d'uso previsti:

- interrogare forecast e scadenze di un periodo;
- chiedere cosa è previsto per una settimana/data;
- contare pratiche per cliente, team o tecnico;
- individuare consegne o attività entro una certa data;
- individuare pratiche con problemi/ritardi;
- spiegare, quando le note lo consentono, perché una pratica non è avanzata;
- sintetizzare situazione, carico e criticità senza dover costruire manualmente filtri complessi.

Vincoli:

- deve rispettare le stesse autorizzazioni dell'utente che lo interroga;
- le risposte devono essere riconducibili ai dati della piattaforma e non sostituire i KPI strutturati quando una statistica deterministica è disponibile;
- l'eventuale scelta tra modello esterno o modello ospitato internamente è una decisione infrastrutturale separata dal contratto funzionale;
- costi, rate limit e disponibilità del modello devono essere gestiti dall'architettura, senza alterare i dati canonici.

### 17.15 Documenti e allegati

**CONSOLIDATO**

PracticeHub non deve diventare automaticamente un repository documentale duplicando file già presenti nei sistemi/cartelle aziendali. Per il passaggio o l'assegnazione di una pratica è preferibile usare:

- link alle cartelle/repository esistenti;
- note descrittive quando necessario;
- riferimenti documentali tracciabili nella pratica.

Un eventuale caricamento diretto di allegati è una funzione separata da approvare e progettare esplicitamente.

## 18. Artefatti di riferimento e output applicativo

La fase di discovery dei campi è chiusa. L'output principale non è più una nuova proposta di riorganizzazione, ma l'implementazione coerente della baseline esistente.

### A. Struttura dashboard

Per ogni cliente rispettare le sezioni riportate nei file di associazione, senza imporre un unico template a tutti i team.

PM/Permessi, AIE, UT+PE e DL hanno una struttura operativa consolidata. Il blocco DL comune ai sei gestori è quello definito nella baseline corrente; eventuali estensioni restano cliente-specifiche e non devono essere propagate per simmetria.

### B. File di associazione

I riferimenti correnti sono:

- `ASSOCIAZIONI_CAMPI_ILIAD.md`
- `ASSOCIAZIONI_CAMPI_TOWERNET.md`
- `ASSOCIAZIONI_CAMPI_TIM-FIBERCOP.md`
- `ASSOCIAZIONI_CAMPI_INWIT.md`
- `ASSOCIAZIONI_CAMPI_FASTWEB-VODAFONE.md`
- `ASSOCIAZIONI_CAMPI_LEONARDO.md`

Snapshot degli ID di flusso correnti:

| Cliente | Range `id_flusso` |
|---|---:|
| ILIAD | `F001-F161` |
| TOWERNET | `F001-F118` |
| TIM/FIBERCOP | `F001-F118` |
| INWIT | `F001-F129` |
| FASTWEB-VODAFONE | `F001-F109` |
| LEONARDO | `F001-F109` |

Questi range sono uno snapshot di baseline: se un nuovo campo master viene formalmente introdotto, la sequenza può cambiare tramite reindicizzazione controllata.

### C. Matrice terminologica

`MATRICE_COERENZA_TERMINOLOGICA_CAMPI_DASHBOARD(1).md` è la matrice definitiva corrente: 188 righe, 138 `COERENTE`, 0 `DA UNIFORMARE`, 50 `SPECIFICO`. Deve essere aggiornata soltanto dopo la validazione degli MD e non deve modificare campi già consolidati per ottenere artificialmente una maggiore uniformità.

### D. Questioni aperte

Le questioni residue devono essere distinte dai campi. In particolare non devono riaprire il censimento operativo già concluso. Restano ammissibili dubbi su aspetti tecnici come permessi fini, retention/versionizzazione dello storico, delivery degli alert, automazioni, performance dell'assistente AI o integrazione G7; non sono invece aperti i trigger WT8 già consolidati.

### E. Impatto sulla beta

Per ogni change request futura indicare se comporta:

- solo riordino UI;
- modifica visibilità;
- modifica permessi;
- nuova condizione;
- campo ripetibile;
- nuovo campo master;
- nuovo mirror;
- split o merge esplicitamente approvato;
- reindicizzazione `id_flusso`;
- modifica del modello dati;
- modifica della logica di workflow.

---

## 19. Operazioni vietate senza conferma

L'LLM NON deve:

1. eliminare campi perché sembrano duplicati;
2. cambiare il Campo Universale solo per adattarlo alla UI;
3. inventare mapping;
4. promuovere G7 a fonte autorevole senza evidenza;
5. modificare il significato o il ruolo operativo di un campo sulla base di etichette temporanee di coordinamento;
6. dedurre automaticamente ownership dal nome del campo;
7. assumere che tutte le pratiche attraversino tutti i team;
8. assumere un workflow strettamente lineare;
9. inventare condizioni di comparsa;
10. fondere forecast differenti solo perché condividono la parola `Forecast`;
11. trasformare appunti `da verificare` in requisiti;
12. perdere la provenienza del dato;
13. rimuovere duplicati cross-gestionale;
14. spostare un campo ambiguo in una sezione solo per completare la classificazione.

---

## 20. Decisioni consolidate, questioni residue e change control

### 20.1 Decisioni consolidate

Le seguenti regole devono essere considerate vincoli del progetto:

1. `Passa` notifica il team destinatario e apre/rende raggiungibile la pratica nella sua visuale dashboard.
2. Il passaggio può aprire attività contemporanee presso più team.
3. Una pratica può avere più owner di fase nello stesso momento.
4. `Passa` non blocca il team mittente e non rende i campi non modificabili.
5. La pratica resta modificabile anche dopo il completamento, secondo le autorizzazioni di ruolo/team.
6. La UI distingue una visuale principale operativa da una visuale secondaria di avanzamento cross-team.
7. La visuale secondaria consente a tutti di vedere sinteticamente l'avanzamento degli altri team; le limitazioni modifica/sola lettura riguardano la visuale principale.
8. Il PM mantiene la pratica nella propria dashboard per tutto il ciclo di vita perché la avvia e coordina il flusso; gli altri team la ricevono nella propria dashboard quando vengono coinvolti tramite `Passa`.
9. Le attività ancora in corso hanno priorità visiva, senza rendere inaccessibili o immodificabili quelle concluse.
10. Permessi e PM lavorano in modo fortemente integrato.
11. UT e PE costituiscono un unico team operativo, pur mantenendo sezioni distinte.
12. La pratica è identificata da un `Num Doc / Codice Commessa / Codice G7` univoco.
13. Una rilavorazione genera una nuova riga e quindi una nuova pratica con nuovo identificativo.
14. I campi contrassegnati con `*` sono obbligatori.
15. Campi omonimi o simili ma presenti separatamente restano distinti finché non esiste una decisione esplicita di consolidamento.
16. Le configurazioni dei menu a tendina sono specifiche e devono poter essere amministrate senza cambiare il significato del campo.
17. `Note Operative`, `Fatturabile` e `Fatturato` sono campi trasversali di pratica validi per tutti i gestori e non consumano `id_flusso`.
18. `Fatturabile` segue la regola consolidata: valorizzazione automatica 30 giorni dopo `Ottenimento Permessi` se `Esito parere Arpa = positivo`; con `Stato attività = KO` viene mostrato un alert al PM per la compilazione manuale.
19. Per `Fatturato` non è definita una regola automatica ulteriore: resta un campo SI/NO trasversale evidenziato in alto.
20. Al momento non esiste una comunicazione diretta con G7: i dati sono inseriti manualmente.
21. Un eventuale futuro import dell'export G7 è una funzione separata e richiede una policy di precedenza/conflitto.
22. La visibilità e le relazioni di sola lettura/pop-up documentate nelle fonti correnti costituiscono la baseline da implementare.
23. La struttura delle sezioni varia da team a team e da cliente a cliente quando esplicitamente previsto.
24. Il blocco DL comune ai sei gestori è consolidato; l'ownership della sismica appartiene a DL e i campi `Forecast CIL`, `Data IL` e `Data FL` sono parte della baseline condivisa.
25. `Assegna`, `In lavorazione` e `Passa` non sono sinonimi e non devono essere reinterpretati dall'LLM.
26. La sezione AIE è allineata nella baseline corrente, inclusa la presenza di `Invio CEM`.
27. La struttura UT+PE, i pop-up e il blocco di caratterizzazione sono allineati secondo gli ultimi MD validati.
28. I mirror mantengono l'`id_flusso` del master e non generano nuovi ID.
29. Il confronto con i team sui campi è concluso: l'inventario corrente è da considerare congelato salvo change request esplicita.
30. Non esiste più un campo `Forecast Generale`: i forecast sono specifici per fase/attività.
31. Non introdurre un generico campo `Urgenza`: la priorità operativa viene governata principalmente dai forecast e dalle scadenze pertinenti.
32. Gli alert WT8 e le relative condizioni di chiusura sono quelli della sezione 17.10; la semplice lettura di una notifica non risolve l'alert.
33. L'alert DL di fine lavori è `Forecast CIL + 20 giorni` con `Data FL` vuota e ha come destinatari i PM.
34. I tecnici/assegnatari usati per responsabilità e carichi devono essere utenti registrati, non stringhe libere.
35. La pratica deve disporre di timeline/audit e le statistiche devono privilegiare KPI operativi, non ranking personali.
36. L'assistente AI è in sola lettura e non esegue modifiche o azioni operative autonome.
37. La generica voce storica `Attività particolari` non rappresenta un requisito attivo.


### 20.2 Questioni ancora aperte

Le questioni residue sono tecniche o di governance applicativa, non richiedono un nuovo censimento dei campi né, allo stato attuale, un nuovo confronto con i team per definire la struttura operativa:

1. Formalizzare la precedenza tra aggiornamento automatico dello `Stato attività` e override manuale.
2. Definire quali informazioni debbano essere storicizzate anziché sovrascritte e con quale granularità.
3. Stabilire se la pagina admin debba governare altre funzioni oltre ai domini dei menu a tendina e alle liste configurabili già previste.
4. Definire processo, regole di precedenza e audit di un eventuale futuro popolamento tramite export G7.
5. Definire i dettagli tecnici di delivery, retry, escalation e preferenze utente per gli alert/notifiche, mantenendo come baseline l'uso in-app e le mail di assegnazione/passaggio previste.

Le eventuali voci `DA UNIFORMARE` della matrice sono questioni terminologiche, non richieste di nuovi campi.

### 20.3 Regole da non riaprire

L'LLM non deve riaprire autonomamente discussioni già chiuse su:

- esistenza di un team Sopralluoghi;
- separazione UT e PE come team distinti;
- unicità della pratica rispetto a Num Doc/Codice Commessa/Codice G7;
- possibilità di avere più owner di fase;
- funzione del comando `Passa`;
- obbligatorietà dei campi marcati `*`;
- necessità di identificare nuovamente team o ownership dei campi;
- struttura operativa AIE appena consolidata;
- struttura UT/PE e relazioni di pop-up appena consolidate;
- struttura DL comune e ownership DL della sismica;
- inventario dei campi, salvo modifica esplicita delle fonti operative;
- persistenza dell'editabilità della pratica dopo `Passa` o completamento;
- distinzione tra visuale principale e visuale secondaria di avanzamento;
- natura trasversale di `Note Operative`, `Fatturabile` e `Fatturato`;
- regola di valorizzazione di `Fatturabile` e assenza di automazione aggiuntiva documentata per `Fatturato`;
- necessità di riaprire con i team il confronto sui campi già congelati;
- reintroduzione di `Forecast Generale` o di un generico campo `Urgenza`;
- trasformazione dell'assistente AI in un agente con permessi di scrittura senza una nuova decisione esplicita.

## 20.4 Fonti usate per la baseline implementativa

La compilazione segue una gerarchia esplicita:

1. **Fonte primaria — `Organizzazione Campi - <CLIENTE>`**: determina esistenza del campo, team, sezione, ordine operativo, visibilità/modifica e condizioni.
2. **Baseline strutturata — `ASSOCIAZIONI_CAMPI_<CLIENTE>.md`**: rappresenta la versione pronta per l'implementazione con `dtype`, `id_flusso`, mapping, confidenza, note e condizioni.
3. **Fonte secondaria — `Tabella_Mapping_Completa+SchemaDB` / `Mapping_Dati_Completo`**: propone o valida il `Campo Universale` e mantiene la continuità semantica.
4. **Matrice terminologica**: verifica la coerenza dei nomi tra operatori dopo la validazione degli MD.
   - I valori ammessi di un campo (per esempio `50%`, `80%`, `100%` di `EM`) non sono campi e non devono comparire come righe autonome della matrice.

Regola fondamentale:

> Un campo presente nel mapping ma assente dal documento operativo del cliente non deve essere aggiunto alla dashboard per il solo fatto di esistere nel mapping.

In caso di differenza terminologica, non scegliere automaticamente il nome più simile. Se il supporto semantico non è sufficiente, mantenere il campo operativo e indicare l'incertezza sul mapping, senza alterare la struttura validata.

### 20.5 Change control dopo il freeze dei campi

Dopo la chiusura del confronto con i team, una modifica strutturale deve seguire questo ordine:

1. aggiornare il documento `Organizzazione Campi - <CLIENTE>` interessato;
2. aggiornare il relativo `ASSOCIAZIONI_CAMPI_<CLIENTE>.md`;
3. distinguere se la modifica introduce un nuovo master, elimina un master oppure modifica soltanto un mirror/condizione;
4. se necessario, reindicizzare gli `id_flusso` dal punto di variazione e aggiornare tutti i mirror collegati;
5. validare continuità degli ID, assenza di collisioni e coerenza master/mirror;
6. propagare agli altri gestori soltanto le modifiche esplicitamente stabilite come trasversali;
7. aggiornare la matrice terminologica dopo il QA degli MD;
8. aggiornare questa guida soltanto se cambia una regola generale, la struttura comune o il metodo di interpretazione.

Una semplice modifica terminologica non deve alterare `id_flusso`, ownership o sezione se l'identità operativa del campo non cambia.

---

## 21. Obiettivo finale

La ristrutturazione è corretta quando la dashboard consente di leggere una pratica come un processo aziendale e non come una semplice raccolta di colonne provenienti da gestionali diversi.

Il modello finale deve mantenere contemporaneamente:

- tracciabilità verso il dato sorgente;
- coerenza con il mapping semantico;
- organizzazione per cliente;
- responsabilità per team;
- sequenza e dipendenze del workflow;
- identità operativa tramite `id_flusso`;
- distinzione tra master e mirror;
- visibilità e permessi;
- condizioni cliente-specifiche;
- alert/scadenze tracciabili e risolvibili;
- timeline/audit della pratica;
- carichi di lavoro basati su utenti reali;
- statistiche ed export coerenti;
- assistente AI in sola lettura;
- possibilità di evolvere il modello senza perdere la provenienza storica.

Questa guida, insieme ai sei MD di associazione e alla matrice terminologica, deve essere considerata il **documento principale di contesto per l'implementazione**. Le vecchie `Note Implementazione` non sono necessarie nel normale handoff a Codex/LLM, salvo audit storico.

La baseline corrente deve essere considerata **stabile per l'implementazione**. Non è più richiesto cercare nuovi campi o riorganizzare liberamente quelli esistenti. Le variazioni future devono essere puntuali, tracciate e originate da una modifica esplicita delle fonti operative.

In caso di conflitto tra completezza della classificazione e affidabilità della decisione, preferire sempre:

`NON CATEGORIZZATO / DA VERIFICARE`

piuttosto che una classificazione arbitraria.
