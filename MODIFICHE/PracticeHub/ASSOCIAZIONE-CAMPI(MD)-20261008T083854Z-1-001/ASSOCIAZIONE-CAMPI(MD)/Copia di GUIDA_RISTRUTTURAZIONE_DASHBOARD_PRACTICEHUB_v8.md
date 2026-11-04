# Guida per la ristrutturazione delle sezioni della dashboard PracticeHub

**Versione 8 — baseline funzionale consolidata e governance fonti (08/10/2026)**

## 1. Scopo del documento

Questa guida costituisce la **baseline di implementazione** per la ristrutturazione e la manutenzione delle sezioni della dashboard PracticeHub.

Alla data dell'**8 ottobre 2026** il confronto sui campi, sulle sezioni, sulle relazioni master/mirror e sulle principali regole funzionali è considerato consolidato nella baseline implementativa. L'inventario corrente non deve quindi essere trattato come una bozza da ricostruire o ampliare liberamente: eventuali aggiunte successive sono modifiche esplicite di requisito e devono seguire il processo di change control descritto più avanti.

L'obiettivo NON è rifare il mapping semantico dei dati e NON è ridefinire il modello dati da zero.

L'obiettivo è implementare e mantenere un'organizzazione della dashboard aderente al flusso operativo reale delle pratiche, differenziata per:

1. cliente;
2. team;
3. fase operativa;
4. visibilità/modificabilità del campo;
5. eventuali condizioni di comparsa;
6. relazioni master/mirror tra sezioni e pop-up;
7. ordine operativo rappresentato da `id_flusso`.

La dashboard beta esiste già e raccoglie i diversi gestionali e i relativi campi. I sei file `ASSOCIAZIONI_CAMPI_<CLIENTE>.md` sono la **fonte primaria e canonica per l'implementazione dei template cliente**. I documenti `Organizzazione Campi - <CLIENTE>` restano fonti operative storiche e di tracciabilità del confronto con i team: una loro modifica non prevale automaticamente sugli MD, ma costituisce una change request da valutare e incorporare. Il foglio di mapping rimane una fonte secondaria per la riconciliazione semantica e la provenienza dei dati.

La guida non deve essere usata per reintrodurre campi assenti dagli MD canonici né per riaprire decisioni già consolidate. Le fonti operative storiche servono alla tracciabilità, non a sovrascrivere la baseline.

A partire dalla versione 7 questo documento raccoglie anche le **specifiche implementative consolidate** che in precedenza erano distribuite nelle `Note Implementazione`. La versione 8 recepisce il consolidamento WT8 e i chiarimenti finali fino all'8 ottobre 2026: alert e scadenze, assegnazioni/notifiche, timeline, carichi di lavoro, statistiche, assistente AI in sola lettura e blocco DL comune ai sei gestori. Le note storiche non devono quindi essere richieste come contesto ordinario: restano utili soltanto come traccia storica. Quando una vecchia nota o un documento sorgente contraddice la baseline corrente, prevalgono la presente Guida per le regole trasversali e il relativo `ASSOCIAZIONI_CAMPI_<CLIENTE>.md` per la configurazione cliente-specifica.

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

La baseline adotta una gerarchia definitiva che separa **autorità implementativa**, **regole trasversali**, **tracciabilità storica** e **mapping semantico**.

### 3.1 Fonte primaria cliente — `ASSOCIAZIONI_CAMPI_<CLIENTE>.md`

Per ogni cliente il relativo MD è la **source of truth implementativa**. Determina:

- inventario dei campi e delle occorrenze;
- team e sezione;
- ordine operativo e `id_flusso`;
- identità master/mirror e sola lettura;
- condizioni di interfaccia;
- `dtype` quando consolidato;
- note e regole cliente-specifiche.

Se il relativo documento `Organizzazione Campi - <CLIENTE>` diverge dall'MD, **prevale l'MD**. Non è quindi ammessa una riconciliazione automatica a runtime tra le due fonti.

### 3.2 Regole trasversali — questa Guida

La Guida definisce le regole comuni ai clienti: workflow, autorizzazioni generali, stato attività, alert, assegnazioni, campi trasversali, change control e metodo di interpretazione. Guida e MD devono essere mantenuti coerenti; una regola cliente-specifica esplicitamente rappresentata nell'MD non deve essere sostituita per analogia con un altro cliente.

### 3.3 Fonti operative storiche — `Organizzazione Campi - <CLIENTE>`

I documenti `Organizzazione Campi` conservano il valore di **evidenza del confronto operativo** e di tracciabilità. Sono usati per:

- ricostruire l'origine di una decisione;
- valutare una change request;
- verificare il significato storico di un campo.

Una modifica successiva del sorgente **non aggiorna automaticamente la baseline** e non prevale sull'MD: deve essere valutata, approvata e incorporata nel file canonico.

### 3.4 Fonte secondaria — `Tabella_Mapping_Completa+SchemaDB`

Il mapping serve esclusivamente alla riconciliazione semantica e alla provenienza dei dati. Non decide esistenza, team, sezione, condizioni o `id_flusso`.

### 3.5 Matrice terminologica

`MATRICE_COERENZA_TERMINOLOGICA_CAMPI_DASHBOARD(1).md` è un artefatto **derivato** dai sei MD canonici. Serve a controllare la coerenza dei nomi tra clienti e non può introdurre, rimuovere o spostare campi.

### Regola sintetica di precedenza

> **MD cliente per la struttura concreta; Guida per le regole trasversali; sorgenti per tracciabilità; mapping per semantica; matrice come controllo derivato.**

In caso di dubbio non si ricostruisce il template dal sorgente: si apre una change request sull'MD.

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

## 10. Assegnazione tra team, accesso alla pratica e persistenza delle modifiche

Il workflow non deve assumere una sequenza rigida PM → AIE → UT+PE → DL.

Il comando applicativo si chiama **`Assegna`**. La precedente denominazione `Assegna` è superata in interfaccia, notifiche e documentazione. `Assegna`:

- può coinvolgere uno o più gruppi nella stessa operazione;
- rende raggiungibile la pratica nella dashboard dei gruppi destinatari;
- non trasferisce in modo esclusivo la proprietà e non blocca il mittente;
- invia una notifica in-app e una mail **a ogni Assegna** a tutti gli utenti del gruppo destinatario associati al gestore;
- può includere data/forecast/note di assegnazione previsti dal flusso.

Le card dei gruppi non ancora coinvolti restano visibili ma disattivate. La sezione AIE diventa operativa per il gruppo AIE dopo `Assegna`, indipendentemente dal flag AIE.

La compilazione della `Data assegnazione` della Fase Preliminare non equivale al comando `Assegna`: essa determina invece il passaggio dello `Stato attività` da `CREATA` ad `ASSEGNATO`.

**Editabilità:** il completamento di una fase o della pratica non rende automaticamente read-only i campi. L'editabilità dipende da ruolo/team, master/mirror e regole della visuale principale. Una pratica archiviata è invece in sola lettura fino al ripristino; durante l'archiviazione gli alert si fermano.

Il PM mantiene la visibilità di coordinamento per l'intero ciclo. Quando una regola parla del **PM della pratica** come destinatario di un alert, si intendono i **PM leader del gestore**. Se il gruppo destinatario di una notifica per leader non ha alcun team leader configurato, la quota destinata al leader non viene inviata; resta la componente destinata ai PM quando prevista.

Il DL eredita il Core compilato dal PM in sola lettura. **Il DL non crea pratiche**: la creazione è riservata a PM e ADMIN. Il DL riceve le pratiche tramite il flusso applicativo, compila esclusivamente i campi di propria competenza e riceve gli alert previsti dalle relative regole.

La visuale secondaria di avanzamento resta consultabile cross-team; la ristrutturazione deve rappresentare una rete di fasi e dipendenze, non un wizard strettamente lineare.

## 11. Condizioni di interfaccia

Le condizioni riportate nei MD sono **condizioni di UI**: determinano se una specifica occorrenza viene mostrata, ma non disattivano il dato master, gli alert o le automazioni.

Regole consolidate:

- sono eliminate tutte le condizioni di visibilità basate su `Incarico / Lavorazione`;
- `Incarico / Lavorazione` è una lista configurabile a **scelta singola** per tutti i gestori;
- `Progetto` è una lista configurabile e non governa la visibilità dei campi;
- `Tipologia attività PE` è valorizzata automaticamente: usa `Progetto` quando il campo esiste nel template ed è valorizzato; se `Progetto` è vuoto o assente dal template, usa `Incarico / Lavorazione`. Non coincide con `Stato attività`;
- il blocco **Geologica** è sempre collocato nella sezione PM `Ufficio Tecnico / Progettazione Esecutiva`, senza condizioni di visibilità; il flag `Geologica` è informativo e `Forecast Geologica = Assegnazione Geologica + 15 giorni di calendario`;
- la condizione `PE = SI` vale soltanto per `Assegnazione PE` e `Note Assegnazione PE`;
- restano valide le condizioni basate su altri dati esplicitamente consolidate negli MD, ad esempio `AIE`, `Deposito sismico`, Regione, Revit, MW, CARATTERIZZAZIONE, Committente, Tipologia sito, PSC, All. 18 e presenza di un campo padre;
- se una condizione diventa falsa, il valore del campo nascosto **resta salvato** e riappare quando la condizione torna vera.

I valori dei campi nascosti per condizione **restano inclusi nell'export e considerati nei KPI finché sono memorizzati**: la condizione di visibilità agisce soltanto sulla UI e non annulla il dato.

Il blocco di caratterizzazione UT rimane cliente-specifico come descritto nei singoli MD; non deve essere propagato per simmetria.

## 12. Campi trasversali

Sono consolidati tre campi globali, validi per tutti i gestori e non associati a un singolo `id_flusso`:

1. **`Note Operative`** — campo libero, evidenziato nella parte alta della pratica; nella Ripresentazione totale resta invariato.
2. **`Fatturabile`** — dominio `SI / NO`, default `NO`. Diventa automaticamente `SI` 30 giorni dopo `Ottenimento Permessi` se l'ultimo esito ARPA è `Positivo`. Una modifica manuale del PM blocca i successivi ricalcoli positivi; un nuovo ciclo ARPA con esito `Negativo` forza comunque il ritorno a `NO`. Con `Stato attività = KO` compare l'alert per la valorizzazione manuale. Nella Ripresentazione totale riparte da `NO`.
3. **`Fatturato`** — dominio `SI / NO`, valorizzato solo manualmente e indipendente da `Stato ODA`; nella Ripresentazione totale viene azzerato.

Le eventuali occorrenze degli stessi campi presenti nelle righe sorgente ILIAD restano soltanto per tracciabilità e non generano duplicazioni in UI.

## 13. Forecast e campi calcolati

I forecast sono milestone distinte e non devono essere fusi in un `Forecast Generale`.

### Forecast Ottenimento Permessi

- la formula base `Protocollo + 67 giorni di calendario` vale **solo per TOWERNET, INWIT e LEONARDO**; negli altri gestori il forecast è manuale, salvo diversa regola esplicita nell'MD;
- quando viene compilato `Invio integrazione`, si controlla **una sola volta** se in quel momento mancano 15 giorni o meno al forecast base;
- se la condizione è vera, il forecast viene spostato della durata dell'ultima integrazione: `Invio integrazione - Richiesta integrazione`;
- il ricalcolo automatico continua finché il forecast non viene modificato manualmente; una modifica manuale lo blocca;
- ogni ricalcolo automatico del `Forecast Ottenimento Permessi` genera un **toast informativo** per l'operatore, così che la modifica non avvenga in modo silenzioso.

### Altri calcoli consolidati

- `Forecast Geologica = Assegnazione Geologica + 15 giorni di calendario`;
- ILIAD: `Forecast Protocollo = Data assegnazione + 30 giorni di calendario`;
- le altre formule riportate negli MD restano cliente-specifiche.

Le formule usano giorni di calendario; le soglie degli alert usano giorni lavorativi. Le regole di alert sono nella sezione 17.10.

## 14. Stato attività

`Stato attività` è una proprietà trasversale della pratica. Il dominio consolidato è:

- `CREATA`;
- `ASSEGNATO`;
- `IN APPROVAZIONE`;
- `PROTOCOLLATO`;
- `INTEGRAZIONE RICHIESTA`;
- `AUTORIZZATO`;
- `DINIEGATO`;
- `TAR`;
- `REALIZZATO`;
- `TERMINATO`;
- `STAND-BY`;
- `KO`.

Regole consolidate:

- alla creazione, e all'apertura di una nuova iterazione tramite Ripresentazione totale, lo stato è `CREATA`;
- `ASSEGNATO` scatta quando viene valorizzata la `Data assegnazione` della Fase Preliminare;
- gli altri eventi automatici seguono i trigger esplicitamente definiti nella baseline;
- se esistono più eventi automatici, prevale quello con la **data più recente scritta nei campi trigger**, indipendentemente dal momento in cui il valore è stato inserito;
- se un campo trigger viene svuotato, lo stato torna all'ultimo evento ancora valido;
- ogni nuova `Richiesta integrazione` porta lo stato a `INTEGRAZIONE RICHIESTA`;
- completare la pratica significa impostare `TERMINATO`; possono farlo PM e ADMIN;
- una pratica può essere cancellata da PM o ADMIN soltanto mentre è `CREATA`.

Non deve essere reintrodotto lo stato `IN LAVORAZIONE`.

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

Il confronto sui campi è considerato concluso. I sei file di associazione consolidati all'8 ottobre 2026 costituiscono la baseline cliente-specifica da implementare; i documenti operativi e la matrice sono rispettivamente riferimenti storici e artefatti derivati.

Eventuali campi con `Campo Universale = DA VERIFICARE` o confidenza `BASSA` possono avere ancora un'associazione semantica non definitiva, ma ciò non mette in discussione la loro esistenza operativa quando il campo è presente nell'MD canonico.

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

La matrice terminologica è un artefatto derivato dai sei MD canonici. Serve come controllo di coerenza delle etichette e non ha autorità su inventario, sezione, condizioni o `id_flusso`. Dopo una variazione strutturale degli MD deve essere riallineata prima di essere usata come fotografia terminologica corrente.

### Regola di aggiornamento

Una futura modifica del documento `Organizzazione Campi - <CLIENTE>` non prevale automaticamente. Dopo il freeze, qualsiasi differenza è una change request: la baseline cambia soltanto quando la decisione approvata viene incorporata nel relativo MD canonico secondo la sezione 20.5.

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

Usare il file `ASSOCIAZIONI_CAMPI_<CLIENTE>.md` corrente come fonte storica. Consultare `Organizzazione Campi - <CLIENTE>` soltanto per tracciabilità o per valutare una change request; una modifica del sorgente non sovrascrive l'MD.

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

Quando l'MD specifica che un campo è compilato da un altro team, di sola lettura o mostrato tramite pop-up, preservare tale comportamento senza creare una seconda identità dati.

### Step 4 - Applicare le condizioni già esplicitate

Conservare soltanto le condizioni presenti nell'MD canonico. Le vecchie condizioni di visibilità basate su `Incarico / Lavorazione` sono eliminate e non devono essere recuperate dai sorgenti storici.

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
- AIE, UT e PE ricevono le pratiche nella propria dashboard quando il flusso le coinvolge tramite `Assegna`.
- La visuale secondaria di avanzamento resta disponibile per consultare sinteticamente il lavoro degli altri team.
- Le attività ancora aperte/in corso devono avere priorità visiva rispetto a quelle concluse.

### 17.2 Autorizzazioni ed editabilità

**CONSOLIDATO**

- Il completamento non rende automaticamente i campi read-only; fanno eccezione le pratiche archiviate, in sola lettura finché non vengono ripristinate.
- I mirror e i pop-up dichiarati di sola visualizzazione restano non modificabili nell'occorrenza mirror.
- PM/Permessi condividono il perimetro di modifica previsto dalla baseline; UT e PE appartengono allo stesso gruppo operativo e possono lavorare sulle rispettive due sezioni secondo gli MD.
- AIE e UT/PE vedono Core e Dati Secondari in sola lettura.
- Il DL vede il Core ereditato in sola lettura e compila i soli campi di propria competenza.
- La creazione di nuove pratiche è riservata a PM e ADMIN; il DL non crea pratiche.
- I team leader sono configurati dall'ADMIN come attributo della coppia `(cliente, gruppo, ruolo)` dell'utente.

### 17.3 Creazione, rilavorazione, Ripresentazione totale e import

**CONSOLIDATO / DA IMPLEMENTARE**

- `Codice G7` non è una chiave tecnica univoca: una rilavorazione o una nuova iterazione può mantenere lo stesso G7 oppure riceverne uno nuovo.
- Pratiche, iterazioni e relazioni di rilavorazione sono identificate da ID interni.
- La rilavorazione può essere avviata da chi è autorizzato a creare una pratica, quindi **PM o ADMIN**, anche se la pratica di origine è ancora aperta; deve mantenere un riferimento esplicito alla pratica di origine.
- L'import non sovrascrive campi già compilati manualmente e, se più pratiche risultano compatibili con la stessa riga, richiede selezione manuale.
- La **Ripresentazione totale** può essere avviata da PM leader o ADMIN su pratiche non archiviate. Crea una nuova iterazione: le sezioni operative ripartono vuote, `Fatturabile = NO`, `Fatturato` si azzera, `Note Operative` resta e i gruppi già abilitati restano abilitati. Lo `Stato attività` riparte da `CREATA`.
- Le iterazioni restano tutte consultabili nello storico.
- Il dato sorgente `Coordinate` è implementato come **due campi decimali WGS84: `Latitudine` e `Longitudine`**.
- `N° protocollo ...` e `N° sismica` sono campi testuali, per ammettere barre e lettere.
- I campi obbligatori alla creazione nella baseline sono `Codice G7`, `Codice Sito`, `Nome Sito`, `Committente` e `Cliente Finale`; `Committente` è obbligatorio per tutti i gestori anche quando precompilato.
- Selezione template alla creazione: il `Cliente Finale` determina il template (`ILIAD/WIND 3/ZEFIRO → ILIAD`, `Inwit → INWIT`, `TowerNet → TOWERNET`, `TIM/Fibercop → TIM/FIBERCOP`, `Vodafone → FASTWEB-VODAFONE`, `Leonardo → LEONARDO`). Con `Cliente Finale = FASTWEB`, `Committente = Fastweb` seleziona FASTWEB-VODAFONE; negli altri casi la combinazione può ricadere su ILIAD. Con `Altro` o combinazione ambigua, chi crea la pratica seleziona manualmente il template.
- `Committente` è obbligatorio alla creazione per tutti i gestori; i valori precompilati restano modificabili.

### 17.4 Configurazione amministrativa

**DA IMPLEMENTARE / MANTENERE**

- Le liste configurabili sono governate per gestore dai team leader del gruppo e dall'ADMIN, secondo le autorizzazioni applicative.
- `Altro` deve essere disponibile su tutti i menu configurabili e controllati; il valore manuale associato resta valido solo sulla singola pratica e non alimenta automaticamente la lista globale.
- I menu devono supportare ricerca/autocomplete quando utile.
- Le configurazioni non modificano semantica, ownership o `id_flusso` del campo.
- Le liste iniziali vanno ricavate dai dati sorgente dove possibile. Per i valori mancanti o da integrare, **l'inserimento è in carico ai team leader** del relativo gestore/gruppo; questo vale per Gestore Tenant, referenti, Assistente/Progettista TIM, fornitori, Tecnico Misure di fondo, Direttore Lavori/Collaudatore, enti non derivati dai vincoli e valori cliente-specifici come `Incarico/Lavorazione` TOWERNET.

### 17.5 Assegna, notifiche e collaborazione

**CONSOLIDATO / DA IMPLEMENTARE**

- Il comando si chiama `Assegna` e può selezionare uno o più gruppi destinatari senza bloccare il mittente.
- La notifica va a **tutti gli utenti del gruppo destinatario associati al gestore**, sia in-app sia via mail, a ogni `Assegna`.
- `Incarico PE` e `Incarico VS/AS` ricevono la data del giorno al momento dell'`Assegna` verso UT/PE soltanto se il campo è vuoto.
- Gli alert seguono invece i destinatari PM/team leader definiti dalle singole regole; se manca il leader del gruppo, la componente destinata al leader non viene inviata.
- Le card dei gruppi non ancora coinvolti sono visibili ma disattivate.
- La lettura di una notifica non chiude l'alert.

### 17.6 Campi e componenti con comportamento speciale

**CONSOLIDATO / DA IMPLEMENTARE**

- `ODA` e relative note supportano occorrenze multiple; in FASTWEB-VODAFONE `Stato ODA = DA RICHIEDERE / RICHIESTI / PRESENTI`.
- `Richiesta integrazione` e relativi dettagli sono ripetibili; per lo spostamento del forecast si considera l'ultima integrazione.
- Il ciclo ARPA è un **gruppo ripetibile**: le vecchie etichette separate di seconda ripresentazione non generano nuove famiglie logiche di campi.
- `Esito parere Arpa` usa il dominio `Positivo / Negativo`.
- `Incarico / Lavorazione` è a **scelta singola** per tutti i gestori.
- `Tipologia attività PE` viene compilata automaticamente da `Progetto` se presente e valorizzato; in caso contrario usa `Incarico / Lavorazione`.
- `Fatturazione` resta una sezione specifica ILIAD; `Fatturabile` e `Fatturato` sono invece trasversali.
- I mirror Geologica e Invio Scheda Palo della sezione PE restano in TIM/FIBERCOP, LEONARDO, TOWERNET e INWIT come indicato nei rispettivi MD.
- INWIT mantiene il blocco di caratterizzazione UT; l'occorrenza PM di `Invio report caratterizzazione` è mirror del master UT.
- TIM/FIBERCOP mantiene `Invio PE` master DL e mirror PE; nella vista PM non compare. FASTWEB-VODAFONE mantiene `Invio PE` in PM/Permessi.
- LEONARDO mantiene il mirror `Forecast CIL` nella sezione PE, master DL, visibile con `Deposito sismico = SI`.

### 17.7 Stato attività

**CONSOLIDATO / DA IMPLEMENTARE**

Applicare il dominio e le regole della sezione 14. In particolare `CREATA` sostituisce definitivamente `IN LAVORAZIONE`; `ASSEGNATO` scatta dalla `Data assegnazione` della Fase Preliminare; tra eventi automatici prevale la data trigger più recente e la cancellazione di un trigger ripristina l'ultimo evento ancora valido.

### 17.8 G7 e import

**FUTURO / OPZIONALE**

- Non esiste oggi una sincronizzazione diretta con G7.
- `Codice G7` è un dato operativo e può essere riutilizzato tra rilavorazioni/iterazioni; non identifica tecnicamente la pratica.
- Un futuro import può precompilare dati, ma non sovrascrive campi manuali già valorizzati.
- Se la riga non identifica univocamente la pratica destinataria, l'associazione deve essere manuale.
- Ogni import deve essere tracciabile nello storico/audit.

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

Gli alert sono regole di workflow, non nuovi campi. Le soglie espresse in giorni usano **giorni lavorativi**, considerando soltanto le festività nazionali italiane; se una scadenza cade in un giorno non lavorativo, l'invio avviene il primo giorno lavorativo successivo alle **09:00 ora italiana**. Reminder e controllo giornaliero degli alert operano alle 09:00.

| Trigger | Condizione / regola | Chiusura / destinatari | Ambito |
|---|---|---|---|
| `Data sopralluogo` | 7 giorni dopo `Data assegnazione` se vuota | compilazione `Data sopralluogo`; destinatari secondo regola PM/leader | tutti |
| `Invio verbale di sopralluogo` | 3 giorni dopo `Data sopralluogo` se vuoto | compilazione campo; destinatari secondo regola PM/leader | tutti |
| `Forecast UT` | 2 giorni prima se `Invio AS/VS` vuoto | `Invio AS/VS`; PM + leader UT/PE | tutti |
| `Forecast PE` | 4 giorni prima se `Invio PE` vuoto | `Invio PE`; PM + leader UT/PE; in TIM/FIBERCOP anche leader DL | tutti, con eccezione TIM |
| `Forecast AIE` | 2 giorni prima | `Approvazione AIE`; PM + leader AIE | tutti |
| `Forecast Ottenimento Permessi` | 3 giorni dopo forecast se `Ottenimento Permessi` vuoto | `Ottenimento Permessi`; PM | tutti |
| `Forecast Parere Arpa` | 3 giorni dopo forecast se `Parere Arpa` vuoto | `Parere Arpa` dell'occorrenza corrente | tutti i gestori che hanno il blocco ARPA, **incluso LEONARDO** |
| `Invio CDMS` | una settimana dopo; reminder settimanale | compilazione `EM` data | ILIAD / CELLNEX |
| `Data Invio Offerta` / `Invio Offerta` | una settimana dopo; reminder settimanale | chiusura manuale da leader PM/Permessi o ADMIN dopo gli ODA previsti | gestori con Offerta; escluso LEONARDO |
| ODA FASTWEB-VODAFONE | trigger previsti da `Data assegnazione` e `Invio Pacchetto Permessi` | il secondo trigger si chiude con `Stato ODA = PRESENTI` | FASTWEB-VODAFONE |
| Fine lavori DL | `Forecast CIL + 20 giorni` con `Data FL` vuota | `Data FL`; **PM + leader DL** | tutti |
| `Fatturabile` con pratica KO | `Stato attività = KO` | compilazione manuale `Fatturabile`; PM | tutti |

Regole generali:

- gli alert sono idempotenti e non si duplicano al refresh;
- la lettura della notifica non equivale alla chiusura;
- quando una regola prevede leader e per il gestore non esiste un leader configurato, non viene scelto automaticamente un sostituto;
- i PM destinatari sono i PM leader del gestore;
- il log registra almeno pratica, regola, timestamp apertura, destinatario e timestamp/modalità di chiusura.

### 17.11 Utenti, assegnazioni e carico di lavoro

**DA IMPLEMENTARE**

- I campi di tecnico/assegnatario che alimentano carichi di lavoro e responsabilità devono riferirsi a **utenti reali registrati sulla piattaforma**, non a testo libero.
- La selezione deve supportare ricerca/autocomplete e, dove utile, filtraggio per team/ruolo.
- L'utente deve essere collegato all'account/email applicativo per evitare duplicazioni dovute a varianti nominali.
- Il carico di lavoro deve essere calcolabile per utente/tecnico sulla base delle pratiche e attività realmente assegnate.
- Le statistiche sui carichi non devono dipendere da confronti lessicali tra stringhe compilate manualmente.

Mappatura ruolo consolidata per i campi utente:

| Campo | Ruolo/gruppo da cui selezionare |
|---|---|
| Tecnico PP | Permessi |
| Tecnico AIE | AIE |
| Responsabile interno AIE | AIE |
| Tecnico UT | UT |
| VS/AS incaricata da | UT |
| Tecnico PE | PE |
| PE incaricato da | PE |
| Tecnico PSC | PE |
| Tecnico deposito sismico | DL |
| Tecnico Caratterizzazione | UT |

### 17.12 Timeline e audit della pratica

**DA IMPLEMENTARE / MANTENERE**

Ogni pratica deve avere una timeline/audit trail consultabile che registri almeno:

- azione effettuata;
- utente/autore;
- data e ora;
- assegnazioni tra team;
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

Il primo rilascio comprende almeno: pratiche attive totali, pratiche per Stato attività, per gestore, per gruppo/assegnatario, alert attivi, alert scaduti, scadenze prossime, TERMINATE/KO nel periodo e tempo medio/mediano `Data assegnazione → TERMINATO`. `Alert scaduti` significa alert ancora aperti oltre la data di trigger; `Scadenze prossime` usa una finestra di 7 giorni; con Ripresentazione totale il tempo pratica si misura dalla prima Data assegnazione all'ultimo TERMINATO.

L'**export CSV** richiede un gestore filtrato e contiene le colonne del suo template. I valori dei campi nascosti per condizione restano inclusi nell'export e continuano a concorrere ai KPI finché sono memorizzati; la sola visibilità UI non li azzera né li esclude.

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
- la scelta del modello, l'eventuale uso di servizi esterni/interni e gli altri aspetti tecnici dell'implementazione **non sono fissati da questa baseline funzionale** e devono essere definiti con Massimiliano;
- qualunque scelta tecnica dovrà comunque rispettare le autorizzazioni applicative e mantenere l'assistente in sola lettura.

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
| TOWERNET | `F001-F117` |
| TIM/FIBERCOP | `F001-F118` |
| INWIT | `F001-F127` |
| FASTWEB-VODAFONE | `F001-F108` |
| LEONARDO | `F001-F118` |

Questi range sono uno snapshot di baseline: se un nuovo campo master viene formalmente introdotto, la sequenza può cambiare tramite reindicizzazione controllata.

### C. Matrice terminologica

`MATRICE_COERENZA_TERMINOLOGICA_CAMPI_DASHBOARD(1).md` è un controllo terminologico derivato dai sei MD canonici. Va aggiornata dopo il QA degli MD e non possiede autorità per introdurre, rimuovere o spostare campi.

### D. Stato di chiusura

Il chiarimento v3 del 7 ottobre 2026 chiude le questioni funzionali residue della baseline: trattamento dei campi nascosti, ruolo di `Tecnico Caratterizzazione`, ownership delle liste iniziali e perimetro di creazione delle pratiche sono definiti. Restano fuori dal contratto funzionale soltanto le scelte tecniche/architetturali dell'assistente AI, da definire con Massimiliano.

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

Le seguenti regole sono vincoli della baseline:

1. I sei `ASSOCIAZIONI_CAMPI_<CLIENTE>.md` sono la fonte primaria cliente-specifica; dove divergono dai documenti `Organizzazione Campi`, prevalgono gli MD.
2. La Guida governa le regole trasversali e deve restare coerente con gli MD.
3. `Assegna` sostituisce definitivamente il precedente comando `Passa`; può coinvolgere più gruppi, non blocca il mittente e notifica tutti gli utenti del gruppo/gestore via in-app + mail.
4. `Codice G7` non è un identificatore tecnico univoco; pratica, iterazioni e rilavorazioni usano ID interni.
5. `CREATA` sostituisce definitivamente `IN LAVORAZIONE`; `ASSEGNATO` scatta dalla Data assegnazione della Fase Preliminare.
6. La Ripresentazione totale e la rilavorazione sono processi distinti e seguono le regole della sezione 17.3.
7. Le condizioni di visibilità basate su `Incarico / Lavorazione` sono eliminate; restano solo le condizioni dati esplicitamente presenti negli MD.
8. `Incarico / Lavorazione` è a scelta singola per tutti i gestori; `Tipologia attività PE` viene valorizzata automaticamente da `Progetto` se il campo esiste ed è valorizzato, altrimenti da `Incarico / Lavorazione`, ed è distinta da `Stato attività`.
9. Geologica è sempre nel blocco PM Progettazione esecutiva senza condizione di visibilità; i mirror PE previsti dagli MD restano.
10. `Note Operative`, `Fatturabile` e `Fatturato` sono campi trasversali e non consumano `id_flusso`.
11. Il ciclo ARPA è ripetibile; LEONARDO adotta il blocco ARPA consolidato.
12. Il blocco DL comune e l'ownership sismica DL sono consolidati.
13. Storico modifiche: valore vecchio, valore nuovo, autore e data, senza limite di conservazione; tutte le iterazioni restano consultabili.
14. L'assistente AI del primo rilascio è read-only; modello, hosting e scelte tecniche vengono definiti separatamente con Massimiliano.
15. L'export CSV opera sul gestore filtrato e contiene le colonne del suo template.

### 20.2 Questioni ancora aperte

**Nessuna questione funzionale aperta nella baseline corrente.** Il chiarimento v3 è chiuso. Le sole decisioni ancora da prendere riguardano aspetti tecnici/architetturali dell'assistente AI e non modificano inventario, workflow o autorità degli MD; tali decisioni vanno definite con Massimiliano.

### 20.3 Regole da non riaprire

Non riaprire autonomamente: inventario dei campi; team/ownership già negli MD; master/mirror; eliminazione delle condizioni Incarico; comando `Assegna`; dominio Stato attività; riuso del Codice G7; struttura DL; struttura AIE/UT/PE; campi trasversali; cicli ARPA; regole di Fatturabile/Fatturato; autorità primaria degli MD.

### 20.4 Gerarchia della baseline

1. **`ASSOCIAZIONI_CAMPI_<CLIENTE>.md`** — fonte primaria del template cliente.
2. **Questa Guida** — regole trasversali della piattaforma.
3. **`Organizzazione Campi - <CLIENTE>`** — evidenza storica/operativa e input per change request.
4. **Mapping** — supporto semantico.
5. **Matrice terminologica** — artefatto derivato di controllo.

Un campo presente nel mapping o nel sorgente storico ma assente dall'MD non entra automaticamente nella dashboard.

### 20.5 Change control dopo il freeze

Dopo il freeze una modifica strutturale segue questo ordine:

1. registrare l'evidenza o la richiesta di modifica (anche se nasce da `Organizzazione Campi`);
2. validare la decisione funzionale;
3. aggiornare **prima il relativo MD canonico**, che è il momento in cui la baseline cambia;
4. distinguere nuovo master, rimozione master, mirror o sola variazione di condizione;
5. se necessario, reindicizzare gli `id_flusso` e tutti i mirror collegati;
6. eseguire QA su continuità ID, collisioni, master/mirror e condizioni;
7. propagare ad altri clienti solo ciò che è esplicitamente trasversale;
8. aggiornare Guida e matrice quando la modifica incide sulle rispettive regole/viste;
9. allineare eventualmente il documento sorgente per tracciabilità, senza attribuirgli autorità superiore all'MD.

Una modifica terminologica non altera `id_flusso`, ownership o sezione se non cambia l'identità operativa del campo.

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
