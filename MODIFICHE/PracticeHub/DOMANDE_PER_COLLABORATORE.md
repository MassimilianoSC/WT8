# PracticeHub — Domande aperte sulla documentazione v8

**Data:** 03/10/2026 · **Per:** autore della Guida v8 e dei file `ASSOCIAZIONI_CAMPI_<CLIENTE>.md`
**Documenti analizzati:** Guida v8, Matrice terminologica (1), i 6 file ASSOCIAZIONI (MD), i 6 documenti `Organizzazione Campi` (sorgenti), Note Implementazione, Check PraticeHub.

## Perché questo documento

Lo sviluppo non può partire finché non abbiamo risposte su questi punti. Confrontando ogni file MD con il suo documento sorgente sono emersi tre tipi di problemi:

1. **Informazioni perse nell'MD.** I valori dei menu a tendina, le regole che mostrano o nascondono le sezioni in base alla lavorazione, le formule automatiche, i campi ripetibili e i campi obbligatori `*` stanno nei sorgenti ma non negli MD. Con i soli MD queste cose non si possono implementare.
2. **Regole aggiunte nell'MD che il sorgente non ha.** Alcune condizioni, valori e note risultano copiati da altri gestori. La Guida stessa (§3.1, §20.4) vieta queste aggiunte.
3. **Contraddizioni e regole incomplete.** Alcune condizioni sono opposte tra loro, alcune formule fanno riferimento a se stesse, alcuni campi sono citati ma non esistono, alcuni alert non possono chiudersi mai.

## Come rispondere

- Le domande sono numerate. Dove possibile c'è una scelta tra opzioni (a)/(b)/(c): basta scrivere la lettera nella riga **Risposta**, ed eventualmente una nota.
- Gravità: 🔴 **BLOCCANTE** (non si può implementare senza risposta) · 🟠 **DA CHIARIRE** (possiamo partire con un'ipotesi, ma rischiamo di rifare il lavoro) · ⚪ **MINORE** (correzione di testo).
- I riferimenti usano il formato *Cliente, riga MD `#n` / `id_flusso`, riga del sorgente*.
- La **Parte A** raccoglie i problemi presenti in più gestori: una risposta vale per tutti. La **Parte B** contiene i problemi di un solo gestore. La **Parte C** elenca le correzioni minori, che possiamo fare noi con un solo OK.

---

# PARTE A — Decisioni trasversali

## A1. Struttura e modello dati

### A1.1 🔴 Chiave univoca dei campi
In alcuni casi due campi diversi hanno la stessa etichetta. L'app ricava l'identificativo tecnico dall'etichetta, quindi i valori di questi campi si sovrascriverebbero a vicenda:

| Etichette in conflitto | Dove |
|---|---|
| `Deposito sismico` (menu SI/NO) / `Deposito Sismico` (data) | tutti e 6 |
| `Esito parere Arpa` ×2, `Forecast Parere Arpa` ×2, `N° protocollo Arpa` ×2 (ripresentazione) | ILIAD, TOWERNET, TIM, INWIT, FASTWEB-VODAFONE |
| `EM` (menu) / `EM` (data) | ILIAD F111 / F109 |
| `Invio offerta` (menu, Fase Preliminare F043) / `Invio Offerta` (data, Fatturazione F099) / `Offerta Inviata` (F098) | ILIAD |

Il Campo Universale non può fare da chiave, perché lo condividono molti campi diversi (es. "Stato Attività", "Protocollo", "ASSEGNAZIONE PE"). Nemmeno l'`id_flusso` basta, perché cambia da cliente a cliente: per esempio Forecast CIL è F107 in LEONARDO e ha codici diversi negli altri clienti.

**Domande:**
- Accetti queste rinomine: **"Data deposito sismico"** (come già nella Guida §2), **"EM data" / "EM %"** e le etichette di ripresentazione **"… (ripresentazione)"**? (sì / no)
- Per alert e KPI serve una chiave che valga per tutti i clienti. Va bene **id_flusso per cliente + una chiave canonica comune** tratta dal "Nome dashboard consigliato" della Matrice? (sì / no)

**Risposta:** ____

### A1.2 🔴 Gruppi di campi ripetibili
Il sorgente dice "possibilità di inserire più…", ma l'MD tratta questi campi come valori singoli e non dice quali campi si ripetono insieme. Confermi questi gruppi? Ogni gruppo si ripete insieme a ogni sua occorrenza.

| Gruppo | Campi | Clienti |
|---|---|---|
| Tenant | Gestore Tenant, Codice sito Tenant, Nome sito Tenant | tutti |
| Integrazione | Richiesta integrazione, Note integrazione, Invio integrazione | tutti tranne FASTWEB-VODAFONE (che non ha il campo) |
| Ente | Nome Ente, Forecast Ottenimento "Nome ente", Ottenimento "Nome ente", Esito parere "nome ente", N° protocollo / Scadenza "Nome ente" | tutti |
| ODA | ODA, Note ODA | tutti |
| Ciclo ARPA | vedi A1.3 | 5 clienti |
| Vincoli | vedi A1.4 | tutti |

- In LEONARDO, TIM e FASTWEB-VODAFONE "Forecast Ottenimento 'Nome ente'" non ha la condizione "compare solo se compilato Nome Ente", che invece hanno gli altri campi del gruppo. È parte del gruppo? (sì / no)
- Ci sono gruppi con un numero massimo di ripetizioni? (no / sì: quali e quante)

**Risposta:** ____

### A1.3 🔴 Ripresentazione della pratica ARPA
Riguarda ILIAD, TOWERNET, TIM, INWIT e FASTWEB-VODAFONE. I sorgenti hanno un secondo blocco fisso con "Se esito = Negativo → 'Ripresentazione pratica 2'", ma:
- il campo "Ripresentazione pratica 2" non esiste;
- nel secondo giro manca la data "Parere Arpa", quindi l'alert WT8 sul secondo Forecast Parere Arpa non si può mai chiudere;
- in TOWERNET e INWIT anche "Parere Arpa" è dichiarato ripetibile.

**Domande:**
- Modello: (a) un **gruppo ripetibile senza limite** {Ripresentazione, Forecast Parere Arpa, Parere Arpa, Esito, N° protocollo}, che si ripete finché l'esito è Negativo; (b) al massimo N giri (quanti?).
- In ILIAD "Ripresentazione Pratica" è (a) una data o (b) SI/NO?
- Per Fatturabile e per gli alert conta (a) l'**ultimo** esito oppure (b) il primo?

**Risposta:** ____

### A1.4 🔴 Vincoli: la tabella in fondo ai sorgenti
Nell'MD Vincoli è un semplice "menù a tendina", mentre i sorgenti (TIM, TOWERNET, INWIT…) rimandano a una tabella ("## GUARDARE TABELLA IN FONDO"). La tabella prevede 6–7 vincoli più 4 fasce di rispetto. Ogni vincolo ha uno stato (Presente / Assente / Non pertinente oppure Assolto; ALTRO ha 4 stati), un riferimento normativo e un Ente con valore predefinito.

**Domande:**
- Modello: per ogni vincolo uno **stato a scelta singola**, più un campo **Ente visibile solo se lo stato è "Presente"**? (sì / no)
- La frase "Se presente e non pertinente nessun campo ente" accosta due stati che si escludono. Va letta come "con Assente / Non pertinente / Assolto nessun campo ente"? (sì / no)
- Ente: (a) precompilato e modificabile; (b) fisso. Per il vincolo paesaggistico "SOPRINTENDENZA o COMUNE" è (a) una scelta tra i due o (b) entrambi? "ENAC / ENAV" è (a) una scelta o (b) un unico ente? Per Parco e ALTRO l'ente è testo libero? (sì / no)
- Un vincolo "Presente" crea in automatico una voce nel gruppo **Ente** dell'Iter Autorizzativo? TOWERNET dice "Nome Ente si autocompila in base al tipo di vincolo". (sì / no)
- La colonna NOTE della tabella è un campo da compilare? (sì / no)
- TOWERNET e INWIT: **"vincoli ambientali naturalistici (SIC, Natura2000…) → chiedere ad Antonella"**. Qual è la risposta? Servono sottotipi, stati ed ente.
- Con vincolo idrogeologico "Presente" i campi Geologica "devono comparire nel box fase preliminare dopo i vincoli" (TIM, TOWERNET, INWIT). La regola non è riportata nell'MD. I campi (a) si spostano in Fase Preliminare; (b) compaiono lì anche se il sito non è Raw Land; (c) la regola va ignorata?

**Risposta:** ____

### A1.5 🔴 Valori dei menu a tendina
**(i) Valori presenti nel sorgente ma persi nell'MD.** Li recuperiamo noi dai sorgenti: confermi che i valori dei sorgenti sono quelli definitivi? (sì / no)
Riguarda per esempio Tipologia sito, Tipologia Struttura, Area Apparati, Incarico/Lavorazione, Proprietà/Host, Committente, Cliente Finale, Stato ODA, Applicabilità, Esiti, Autorizzazione finale, Oneri, Tipologia pacchetto permessi, Responsabile interno AIE, Stato AIE, Stato misure di fondo, XML, EM e tutti i flag SI/NO.

**(ii) Menu a valori fissi che non hanno valori nemmeno nel sorgente.** Indica i valori, oppure scrivi "dinamico" o "utenti":

| Campo | Clienti |
|---|---|
| Tecnico PP, Fornitore PP | TOWERNET, TIM, INWIT, LEONARDO |
| VS/AS incaricata da, PE incaricato da | tutti |
| Tipologia attività UT | tutti (i valori "VS, AS, Dimensionamento plinto, VS plinto, fattibilità, correzione PE" nell'MD vengono da ILIAD: vedi A4.1) |
| Tipologia attività PE | tutti |
| Tecnico deposito sismico | tutti |
| Tecnico PSC | LEONARDO, FASTWEB-VODAFONE |
| Tecnico / Fornitore Caratterizzazione ("come UT"?) | ILIAD, INWIT |
| Nome Ente (TOWERNET menu, INWIT "chiedere a PM", altri campo libero) | tutti: menu o testo? |
| Vincoli (elenco) | vedi A1.4 |
| Gestore Tenant: "menù con tutti i clienti", di quale lista si tratta? | tutti |
| Regione / Provincia / Comune: elenco ISTAT con filtro a cascata? | tutti |
| Progetto: l'elenco tra parentesi è un menu o solo esempi di testo libero? | ILIAD, TIM, INWIT |

**(iii) Menu "che si popola volta per volta".** Riguarda Referente, Progettista/Tecnico, Tecnici AIE/UT/PE/Misure di fondo, Fornitori UT/PE/Permessi, Direttore Lavori, Collaudatore, Assistente/Progettista TIM, Referente/RAN Fastweb.
- I nuovi valori li inserisce (a) l'operatore al volo oppure (b) solo l'admin?
- La lista è (a) condivisa tra i clienti oppure (b) separata per cliente?

**(iv)** La voce "altro (campo libero)" in Tipologia Struttura e Proprietà/Host apre un campo di testo aggiuntivo? (sì / no)

**(v)** Il valore Host si chiama "Fastweb" in ILIAD e "Vodafone-fastweb" in TIM, LEONARDO e FASTWEB-VODAFONE. Lo uniformiamo? (sì: come si chiama / no)

**Risposta:** ____

### A1.6 🔴 Tecnici e assegnatari: utenti della piattaforma o liste?
La Guida (§17.11) vuole tecnici e assegnatari legati a utenti reali registrati. Molti di questi campi però indicano probabilmente persone esterne o fornitori. Per ciascun campo indica **U** (utente della piattaforma) oppure **L** (lista configurabile):
Tecnico AIE ___ · Tecnico Misure di fondo ___ · Tecnico UT ___ · Tecnico PE ___ · Tecnico PP ___ · Tecnico PSC ___ · Tecnico Caratterizzazione ___ · Tecnico deposito sismico ___ · Responsabile interno AIE ___ · VS/AS incaricata da ___ · PE incaricato da ___ · Progettista/Tecnico ___ · Referente ___ · Acquisitore ___ · Direttore Lavori ___ · Collaudatore ___ · Fornitori (tutti) ___

I fornitori esterni vanno (a) censiti come utenti senza accesso oppure (b) tenuti come lista? **Risposta:** ____

### A1.7 🔴 Identificativo della pratica, rilavorazione, import
- La Guida (§20.1.12) identifica la pratica con "Num Doc / Codice Commessa / Codice G7", ma **in nessun MD esistono i campi Num Doc o Codice Commessa**. Codice G7 = Num Doc = codice commessa? (sì / no)
- L'unicità del codice è (a) globale oppure (b) per cliente?
- Una rilavorazione ha (a) un nuovo Codice G7 obbligatorio oppure (b) lo stesso G7 con un progressivo?
- Se la pratica la crea il team DL, il Codice G7 è obbligatorio? (sì / no)
- Codice G7 è (a) solo numerico oppure (b) alfanumerico? Da (a) dipende il rischio di perdere eventuali zeri iniziali.
- Quando si duplica il Core Anagrafica Sito per una rilavorazione (§17.3), vanno esclusi ODA, Note ODA e Stato ODA, che in 5 clienti stanno nel Core ma sono dati della singola pratica? (sì / no)
- Serve un'entità "Sito" separata dalla pratica, con chiave Codice Sito? (sì / no)

**Risposta:** ____

### A1.8 🔴 Cliente, gestionale e mappatura dei dati esistenti
- I sorgenti dicono "Cliente Finale (**da sostituire a GESTIONALE**)". Nell'app il "gestionale" è oggi un attributo principale della pratica, con circa 50 profili di import (fogli MARAGNO, OPNET, GESTIONALE AIE, GESTIONALE UT+PE…). Cliente Finale (a) sostituisce del tutto il gestionale, oppure (b) è un campo in più?
- Il cliente di una pratica, cioè quale dei 6 template usa, è (a) scelto alla creazione oppure (b) ricavato da Committente e Cliente Finale?
- **Fastweb compare in due template.** Il sorgente ILIAD (file "ILIAD_W3_FASTWEB") ha come Clienti Finali "ILIAD, WIND 3, FASTWEB, ZEFIRO", ma esiste anche il template FASTWEB-VODAFONE. Una pratica con Cliente Finale FASTWEB usa (a) il template ILIAD se il Committente è Consorzio, Cellnex o Sirti, e FASTWEB-VODAFONE se il committente è Fastweb diretto; (b) sempre ILIAD; (c) altro?
- Serve una tabella **foglio/gestionale attuale → cliente**. Puoi fornirla? I fogli che non corrispondono a nessun cliente vanno esclusi? (sì / no)
- Per i dati già presenti nell'app: (a) migrazione con mappatura delle chiavi; (b) azzeramento e nuovo caricamento.
- L'import da Excel resta? (sì / no) Se sì, con quale chiave si uniscono le righe dei fogli PM, AIE, UT+PE e DL in un'unica pratica: Codice G7, Codice Sito o altro?

**Risposta:** ____

### A1.9 🟠 Tipi di dato (dtype)
L'MD dichiara di riportare il dtype "solo quando esplicitato nel sorgente", ma in diversi casi lo inventa (INTEGER, TEXT, DECIMAL). Confermi queste scelte?
- **Coordinate:** (a) due campi decimali latitudine/longitudine (WGS84); (b) un unico testo.
- **N° protocollo** (deposito sismico, Arpa, Ente) e **N° sismica:** testo, per ammettere barre e lettere? (sì / no)
- **Data Autorizzazione finale** (dtype vuoto in tutti e 6): è una data? (sì / no) È distinta da Ottenimento Permessi? (sì / no) Se coincide, va eliminata?
- **Data assegnazione** (LEONARDO, senza dtype): è una data? (sì / no; serve per l'alert del sopralluogo)
- Tutte le date nel formato gg/mm/aaaa? I sorgenti scrivono "gg/mm/aa". (sì / no)
- **XML, Offerta Inviata, AGORA', Fatturabile, Fatturato** (ILIAD, senza dtype): sono tutti menu con i valori del sorgente? (sì / no)

**Risposta:** ____

### A1.10 🟠 Campi obbligatori `*`
I sorgenti marcano con `*` Codice G7, Codice Sito, Nome Sito, Cliente Finale e, in TOWERNET e INWIT, anche Committente. Negli MD l'informazione è andata persa. L'obbligo vale (a) alla creazione della pratica; (b) a ogni salvataggio; (c) è solo un avviso?
In FASTWEB-VODAFONE il valore "TITOLO IV*" di Applicabilità è un valore distinto o un refuso? **Risposta:** ____

---

## A2. Condizioni di visibilità

### A2.1 🔴 "Invio AS/VS": condizioni opposte (tutti e 6)
È il campo che chiude l'alert WT8 su **Forecast UT**, ma oggi le condizioni sono incompatibili:

| Cliente | Pop-up nella vista PM | Campo nella sezione UT (master) |
|---|---|---|
| ILIAD | "sempre tranne New Site" | "compare solo se New Site" |
| TIM | "sempre tranne New Site", più un secondo pop-up in Fase Preliminare senza condizione | sorgente **senza condizione**; l'MD aggiunge "solo se New Site" |
| LEONARDO | "sempre tranne New Site" | sorgente **senza condizione**; l'MD aggiunge "solo se New Site" |
| FASTWEB-VODAFONE | sorgente: un solo pop-up in Fase Preliminare, senza condizione; l'MD ne aggiunge un secondo con "tranne New Site" | sorgente **senza condizione**; l'MD aggiunge "solo se New Site" |
| TOWERNET | sorgente **senza condizione**; l'MD aggiunge "tranne New Site" | "compare solo se New Site", ma Assegnazione UT compare solo per VS e Caratt.+VS: le due condizioni si escludono |
| INWIT | sorgente: "solo se Verifica statica o Caratterizzazione + VS"; l'MD lo riscrive come "tranne New Site" | "compare solo se New Site" |

Con le regole attuali, per le pratiche di Verifica Statica il team UT non vede il campo che deve compilare e l'alert Forecast UT non si chiude mai.

**Domanda:** nella sezione UT, Invio AS/VS compare (a) **sempre**; (b) solo se Incarico ≠ New Site; (c) solo per VS, Caratt.+VS e PE+VS; (d) altro? Il pop-up PM segue la stessa regola? (sì / no) Per i New Site l'alert Forecast UT (a) si chiude con un altro campo (quale?) oppure (b) non va generato?
**Risposta:** ____

### A2.2 🔴 Assegnazione UT: per quali lavorazioni
In TOWERNET e INWIT Assegnazione UT e Note Assegnazione UT compaiono solo per "Verifica statica" e "Caratterizzazione + VS". Però il team UT lavora anche sui New Site (Invio AS/VS) e, in INWIT, sui PE+VS. Assegnazione UT compare anche con (a) PE+VS, (b) New Site, (c) entrambi, (d) nessuno dei due? **Risposta:** ____

### A2.3 🔴 Geologica: condizioni aggiunte dall'MD
In TIM, LEONARDO, TOWERNET e INWIT l'MD aggiunge la condizione "compare solo se Tipologia sito = Raw Land **e** Incarico = New Site", che i sorgenti non contengono:
- TIM e LEONARDO dicono solo "si compila solo se Geologica = SI";
- TOWERNET e INWIT dicono solo "solo se Tipologia sito = Raw Land" e **non hanno il campo flag "Geologica"**, che però l'MD cita.

Per ciascun cliente, qual è la condizione corretta? TIM ___ · LEONARDO ___ · TOWERNET ___ · INWIT ___
Ai clienti TOWERNET e INWIT va aggiunto il flag "Geologica SI/NO"? (sì / no) **Risposta:** ____

### A2.4 🔴 Pop-up UT+PE nella vista PM e condizione "PE = SI"
- TIM, LEONARDO e FASTWEB-VODAFONE: il sorgente dice "Pop-up con informazioni inserite dal team UT+PE. **Si compila solo se PE = SI**". L'MD ha spostato la condizione su Assegnazione PE e Note Assegnazione PE. Il pop-up contiene anche campi UT: la condizione vale (a) per tutto il pop-up oppure (b) solo per i campi PE?
- **LEONARDO non ha il campo "PE" SI/NO.** Il pop-up compare (a) sempre; (b) se Assegnazione PE è compilata; (c) va aggiunto il flag PE (in quale sezione)?
- Il pop-up UT+PE nella vista PM è (a) in sola lettura oppure (b) modificabile dal PM? In ILIAD contiene campi con valore predefinito "data del giorno", che hanno senso solo dove il campo si compila.
- FASTWEB-VODAFONE: "Pop-up PE (tutti i campi)" e "Sezione UT (Pop-up UT ove presente)". Il PM vede (a) tutti i campi della sezione PE e UT in sola lettura oppure (b) solo quelli elencati?

**Risposta:** ____

### A2.5 🟠 "Si compila solo se" e "compare solo se"
I sorgenti usano entrambe le formule. Esempi: Progetto, Assegnazione/Forecast/Arrivo Geologica, Assegnazione PE, Invio PE. "Si compila solo se X" vuol dire che, se X è falso, il campo è (a) **nascosto** oppure (b) **visibile ma non modificabile**? **Risposta:** ____

### A2.6 🟠 Condizioni asimmetriche (probabili dimenticanze)
- Forecast Deposito Sismico e Data deposito sismico non hanno la condizione "deposito sismico = SI", che hanno invece gli altri campi DL (tutti i clienti). Compaiono solo se SI? (sì / no)
- "Tecnico Misure di fondo: non compare se Regione = Piemonte" (LEONARDO, TOWERNET, INWIT, ILIAD). Va nascosto anche "Stato misure di fondo"? (sì / no)
- Con AIE = NO, la sezione Fase AIE del team AIE è (a) nascosta oppure (b) visibile ma vuota?

**Risposta:** ____

### A2.7 🟠 Incarico/Lavorazione a scelta multipla
Negli MD solo ILIAD ha la scelta multipla. Le Note Implementazione invece chiedono di "rendere la voce Incarico/Lavorazione a scelta multipla" in generale. La scelta multipla vale (a) solo per ILIAD oppure (b) per tutti i clienti? **Risposta:** ____

---

## A3. Master e mirror, ownership

### A3.1 🔴 Campi AIE presenti sia nella vista PM sia in quella AIE (tutti e 6)
Invio CEM, Riduzione, Approvazione Riduzione, Invio AIE e Approvazione AIE hanno lo stesso `id_flusso` nella sezione PM/Permessi e nella sezione AIE, ma l'MD non dice chi è master. Nei sorgenti, nel blocco PM, questi campi stanno sotto "Pop-up AIE" (ILIAD: "compilato da AIE"). **Approvazione AIE chiude l'alert Forecast AIE.**
- Il master è (a) **AIE**, con il PM in sola lettura (pop-up); (b) PM, con AIE in sola lettura; (c) entrambi modificabili sullo stesso dato?
- Il pop-up AIE nella vista PM finisce ad "Approvazione AIE"? I sorgenti proseguono con Note Pacchetto Permessi, Invio Pacchetto Permessi e Ottenimento Permessi senza separatore. (sì / no)
- Forecast AIE nella vista AIE è in sola lettura, con master PM, come dicono i sorgenti? L'MD non lo dichiara in TIM, LEONARDO, FASTWEB-VODAFONE, TOWERNET e INWIT. (sì / no)

**Risposta:** ____

### A3.2 🔴 Pop-up Direzione Lavori nella vista PM (tutti e 6)
Tutti i sorgenti prevedono per il PM una sezione "Direzione Lavori — Pop-up DL (tutti i campi)", ma **in nessun MD c'è questa sezione**. Il PM riceve l'alert di fine lavori, ma non vede i campi DL.
Il PM vede (a) tutti i 12 campi DL in sola lettura, con le stesse condizioni; (b) solo Forecast CIL, Data IL e Data FL; (c) nulla? **Risposta:** ____

### A3.3 🔴 Permessi in sola lettura dentro il team PM/Permessi
TIM e FASTWEB-VODAFONE dicono: "Progettazione esecutiva (**visibile ma non modificabile da team Permessi**)". ILIAD distingue molti campi con "compilano il team permessi" oppure "compilato da PM". Nell'app PM/Permessi è un unico team.
- Serve un **sotto-ruolo PM / Permessi** con permessi diversi? (sì / no)
- Se no, quei campi li modifica (a) tutto il team PM/Permessi oppure (b) nessuno del team?
- Alcune persone (es. Romano, Contesi, Ballerio) compaiono sia in PM/Permessi sia in DL. Un utente deve poter appartenere a più team? (sì / no)

**Risposta:** ____

### A3.4 🟠 Core Anagrafica e Dati Secondari nelle viste degli altri team
Per UT+PE il sorgente dice "sola visualizzazione, compilato da PM". Per AIE e DL non dice nulla. Core e Dati Secondari sono (a) in sola lettura per tutti tranne PM/Permessi; (b) modificabili anche da AIE e DL; (c) modificabili dal DL solo quando crea la pratica?
Nota: i sorgenti elencano le sezioni del team DL senza nominare "Direzione Lavori", che però esiste più avanti nel documento. **Risposta:** ____

### A3.5 🟠 Mirror aggiunti dall'MD ma assenti nel sorgente
L'MD aggiunge al team UT+PE, sezione PE, mirror in sola lettura di **Assegnazione, Forecast e Arrivo Geologica** (TIM, LEONARDO, TOWERNET, INWIT) e di **Invio Scheda Palo** (TOWERNET, INWIT). I sorgenti di questi clienti non li prevedono: sembrano copiati dal modello ILIAD. Li teniamo? Geologica (sì / no) · Scheda Palo (sì / no) **Risposta:** ____

---

## A4. Regole importate da altri gestori

### A4.1 🔴 Teniamo o togliamo?
Queste regole compaiono negli MD di clienti i cui sorgenti **non le contengono**. Probabilmente vengono da ILIAD. Per ciascuna indica **T** (tenere: va aggiunta anche al sorgente) oppure **X** (togliere):

| Regola nell'MD | TIM | TOWERNET | INWIT | FASTWEB-VODAFONE | LEONARDO |
|---|---|---|---|---|---|
| Tipologia attività UT, valori "VS, AS, Dimensionamento plinto, VS plinto, fattibilità, correzione PE" | | | | | |
| Tipologia attività PE "si compila automaticamente da Incarico/Lavorazione o Progetto" (FASTWEB-VODAFONE non ha il campo Progetto) | | | | | |
| Tecnico PE "possibilità di inserire più tecnici" | | | | | |
| Nota Costo UT "pagamento di un esterno…" | | | | | |
| Nota Costo PE "utile solo se collegato con G7" | | | | | |
| 2° Forecast Parere Arpa "compare solo se compilato Ripresentazione Pratica" | | | | — | — |

---

## A5. Formule e campi calcolati

### A5.1 🔴 Forecast Ottenimento Permessi: formula con le integrazioni
TOWERNET, INWIT, LEONARDO: "IF giorni <= 15 and 'Richiesta integrazione' allora Forecast = Forecast + (Invio integrazione − Richiesta integrazione)".
- I "giorni" sono (a) i giorni tra Protocollo e Richiesta integrazione; (b) i giorni che mancano al forecast; (c) la durata dell'integrazione; (d) altro?
- Con più integrazioni si sommano tutti i ritardi? (sì / no)
- Finché Invio integrazione è vuoto, il forecast resta invariato? (sì / no)
- Il forecast si può modificare a mano? (sì / no)
- **LEONARDO:** "Istanza → Protocollo + 67 gg" e "SCIA → Protocollo + 67 gg" hanno lo stesso valore. Per la SCIA i giorni sono (a) 67, (b) 30, (c) altro? Per "Comunicazione", terzo valore di Tipologia pacchetto permessi, il forecast è (a) manuale, (b) +N giorni, (c) assente?

**Risposta:** ____

### A5.2 🔴 Protocollo autocertificazione: ">= 67" (TOWERNET, INWIT)
"IF 'Forecast Ottenimento Permessi' >= 67 SEND Alert. Compare solo se la condizione è avverata". Il confronto è tra una data e un numero. La condizione corretta è (a) oggi − Protocollo ≥ 67 giorni con Ottenimento Permessi vuoto; (b) oggi ≥ Forecast Ottenimento Permessi; (c) altro?
Chi riceve l'alert, e l'alert si chiude (a) compilando Protocollo autocertificazione oppure (b) compilando Ottenimento Permessi? Va aggiunto alla tabella alert della Guida §17.10? (sì / no) **Risposta:** ____

### A5.3 🔴 Forecast PSC si calcola da se stesso (LEONARDO, FASTWEB-VODAFONE)
"Si compila automaticamente con valore = **Forecast PSC**". Il valore predefinito corretto è (a) Forecast PE; (b) Forecast UT; (c) un'altra data + N giorni; (d) nessuno, il campo è manuale? **Risposta:** ____

### A5.4 🟠 Comportamento dei campi calcolati
Sono campi calcolati: Forecast Geologica (+15 gg), Forecast Protocollo (ILIAD, +30 gg, "placeholder"), Protocollo AIE di collaudo (ILIAD, +30 gg), DATA SCADENZA PERMESSI (ILIAD, +12 mesi), Codice sito Host (ILIAD, = Codice Sito se Host = Iliad), Tipologia Struttura (= traliccio), Committente (TIM = Fibercop, FASTWEB-VODAFONE = Fastweb, TOWERNET = Towernet).
- Questi campi sono (a) modificabili, ma ricalcolati solo se vuoti; (b) modificabili e mai ricalcolati; (c) in sola lettura e sempre ricalcolati?
- Committente, quando viene compilato in automatico, è fisso? (sì / no)
- "Di base viene inserita la data del giorno" (Incarico PE, Incarico VS/AS): la data si scrive (a) all'apertura della sezione; (b) al "Passa" verso UT+PE; (c) è solo un valore proposto, da confermare?
- I calcoli usano giorni di calendario anche per gli alert? (sì / no)

**Risposta:** ____

---

## A6. Stato attività, completamento, Fatturabile

### A6.1 🔴 "Stato attività" non esiste come campo
La Guida (§12, §14, §17.7, §17.10) costruisce stati e alert su "Stato attività", ma questo campo **non c'è in nessuno dei 6 MD** e non c'è nei sorgenti, dove compare solo dentro la regola di Fatturabile.
- È (a) un unico campo per pratica, nell'intestazione; (b) un campo per ogni team o attività; (c) entrambi?
- Il dominio è quello di 12 valori della Guida §14 per tutti i clienti? (sì / no)
- Per ogni stato automatico serve il campo che lo fa scattare, cliente per cliente. Oggi non si possono agganciare:
  - REALIZZATO: le Note citano "CFL", che non esiste. Va bene "Data FL"?
  - PROTOCOLLATO: quale dei vari "Protocollo"?
  - AUTORIZZATO/DINIEGATO/TAR: il menu "Autorizzazione finale" esiste solo in TOWERNET e INWIT, e in TOWERNET contiene anche "KO".
  - INTEGRAZIONE RICHIESTA: FASTWEB-VODAFONE non ha "Richiesta integrazione".
  - ASSEGNATO: ILIAD ha sia "Data assegnazione" (F026) sia "Assegnazione" (F045).
- Una modifica manuale (a) blocca gli aggiornamenti automatici successivi oppure (b) viene sovrascritta dal prossimo evento?

**Risposta:** ____

### A6.2 🔴 Completamento della pratica
Oggi l'app ha gli stati Creato / In corso / In attesa / Completato / Errore e un'azione "Completa". La Guida parla di pratica "completata" senza definirla.
- Lo stato attuale dell'app viene (a) sostituito da Stato attività oppure (b) mantenuto come stato tecnico separato?
- Il completamento è (a) della pratica oppure (b) della singola attività di ogni team? Chi può farlo?
- Esiste un "Passa" di ritorno verso il PM? (sì / no)

**Risposta:** ____

### A6.3 🔴 Fatturabile: regola automatica
La regola "30 giorni dopo Ottenimento Permessi, se Esito parere Arpa = positivo" viene **solo dal sorgente ILIAD**. Guida e MD la estendono a tutti i clienti, ma:
- **LEONARDO non ha nessun campo ARPA**, quindi la condizione non si verifica mai. Per LEONARDO vale (a) Ottenimento Permessi + 30 gg senza condizione; (b) Ottenimento Permessi + 30 gg se tutti gli Esiti "Nome ente" sono positivi; (c) Data Autorizzazione finale + 30 gg; (d) solo compilazione manuale? E con All. 18 = SI, dove il percorso Permessi scompare?
- Per le lavorazioni senza iter Permessi o ARPA (Verifica Statica, PE, Caratterizzazione), Fatturabile è solo manuale? (sì / no)
- L'automatismo scrive solo "SI" oppure anche "NO"? Dopo l'automatismo il PM può modificare il valore? (sì / no)
- L'alert "Stato attività = KO" richiede il campo di A6.1. In TOWERNET, Autorizzazione finale = KO imposta Stato attività = KO? (sì / no)
- Il Check PraticeHub cita anche i flag G7 "Lavorato" (per team) ed "Eseguito" (per pratica). Servono in dashboard? (sì / no)

**Risposta:** ____

### A6.4 🟠 Fatturato e Stato ODA "FATTURATO" (FASTWEB-VODAFONE)
Con Stato ODA = FATTURATO, il campo Fatturato va impostato in automatico a SI? (sì / no / sono indipendenti)
In ILIAD Fatturabile e Fatturato hanno `id_flusso` F104/F105, mentre la Guida dice che i campi trasversali non consumano `id_flusso`. Li togliamo e rinumeriamo? (sì / no) **Risposta:** ____

---

## A7. Alert e notifiche

### A7.1 🔴 Ambito degli alert WT8
Nelle Note Implementazione gli alert su sopralluogo, verbale, Forecast UT/PE, Ottenimento, ARPA, CDMS e Offerta stanno sotto l'intestazione "**ILIAD (idem Riccardo)**", e solo Forecast CIL è marcato "tutti e 6 i gestori". La Guida §17.10 li estende a tutti i gestori. Questi alert valgono per (a) tutti e 6 i clienti oppure (b) solo ILIAD? **Risposta:** ____

### A7.2 🔴 Destinatari, giorni, risoluzione
Solo 2 regole su 12 indicano il destinatario.
- Destinatario predefinito: (a) l'assegnatario o tecnico del campo; (b) il team owner; (c) il PM della pratica; (d) più di uno (indicare quali).
- Destinatari per regola, se diversi dal predefinito: Forecast UT ___ · Forecast PE ___ (in FASTWEB-VODAFONE e TIM Invio PE lo compila il PM o Maragno) · Forecast AIE ___ · Invio CDMS ___ · Offerta/ODA ___ · Sopralluogo/verbale ___
- Le soglie si contano in giorni (a) di calendario oppure (b) lavorativi?
- Un alert si può risolvere a mano? (no / sì: da chi)
- I reminder settimanali partono in quale giorno e a che ora?
- Le soglie le configura (a) l'admin a livello globale oppure (b) per cliente?
- Forecast UT e Forecast AIE: le Note dicono "alert/mail". Va mandata (a) solo una notifica in-app oppure (b) anche una mail?
- Se un campo è nascosto da una regola di sezione, l'alert che lo riguarda va soppresso? (sì / no). Esempio: Invio verbale di sopralluogo con Incarico = Caratterizzazione in INWIT.

**Risposta:** ____

### A7.3 🔴 Campi di chiusura ambigui
- **ILIAD, alert Offerta → ODA:** il punto di partenza è (a) F099 "Invio Offerta" (data, Fatturazione); (b) F043 "Invio offerta" (menu); (c) F098 "Offerta Inviata"? F043 e F098 sono lo stesso dato? (sì / no)
- **ILIAD, reminder CDMS:** si chiude con (a) EM data (Guida) oppure (b) Numero EM (le Note dicono "compilata con il numero")?
- **ODA ripetibile (INWIT e altri):** l'alert si chiude quando c'è almeno un ODA? (sì / no)
- **FASTWEB-VODAFONE, Stato ODA:** il trigger 1 si chiude quando lo stato è diverso da DA RICHIEDERE? (sì / no). Il trigger 2 si chiude con lo stato PRESENTI o FATTURATO, oppure quando si inserisce un numero ODA? Lo Stato ODA è uno solo per pratica anche con più ODA? (sì / no)
- **ILIAD, Protocollo AIE di collaudo:** il sorgente dice "valutare alert". Serve un alert? (no / sì: soglia e destinatario)

**Risposta:** ____

---

## A8. Permessi, passaggi tra team, notifiche

### A8.1 🔴 Team
Confermi i **4 team** PM/Permessi, AIE, UT+PE e DL? Gli utenti oggi nei team "PM" e "PM/Permessi" vanno uniti in PM/Permessi? (sì / no) L'etichetta del team DL è (a) "Direzione Lavori" oppure (b) "Direzione Lavori / Sicurezza"? **Risposta:** ____

### A8.2 🔴 Matrice autorizzativa
- Il Check indica persone con ruoli diversi per cliente: per esempio Menna è PERMESSI + PM su TIM e INWIT; Bonettini è PERMESSI + PM su FASTWEB e solo PERMESSI su LEONARDO. Le Note chiedono di "dare a Maragno la visuale di PM su TIM e FastWeb" e permessi estesi a Sandrini. Va bene il modello **utente → più coppie (cliente, team, ruolo)**? (sì / no)
- Le eccezioni individuali si gestiscono (a) con un ruolo aggiuntivo per cliente oppure (b) con un'eccezione per singolo utente?
- Chi è admin?
- Un team può modificare i propri campi **prima** di aver ricevuto il "Passa"? (sì / no)
- La visibilità è filtrata per committente? Il Check dice che su ILIAD tutti e 3 vedono tutto ILIAD "a prescindere dalla committenza". (no / sì: dove)
- Il team DL crea pratiche (a) in tutti i clienti oppure (b) solo in alcuni (quali)? La pratica creata dal DL entra in automatico nella dashboard del PM? (sì / no)

**Risposta:** ____

### A8.3 🟠 Assegnazione, card, notifiche
- L'assegnazione esplicita a UT, PE e AIE (§17.5) è (a) lo stesso comando "Passa" con i dati di assegnazione oppure (b) un pulsante "Assegna" separato?
- La mail va (a) a tutto il team; (b) al tecnico selezionato; (c) a entrambi?
- Le card dei team non ancora coinvolti sono (a) nascoste oppure (b) visibili ma disattivate?
- Notifica al team DL quando il PM assegna il PE (le Note la citano per LEONARDO): vale (a) solo per LEONARDO; (b) per tutti; (c) non serve?
- Nel "Passa" serve poter scegliere tra chat e mail (Note r.78)? (no / sì: quale chat)

**Risposta:** ____

### A8.4 🟠 Perimetro del primo rilascio
- Quali KPI servono nel primo rilascio? Le colonne dell'export CSV sono (a) quelle comuni a tutti i clienti oppure (b) quelle del cliente filtrato?
- L'assistente AI è (a) nel primo rilascio oppure (b) rinviato?
- Le "liste G7" di clienti, committenti e proprietà (Note r.37) chi le fornisce, e in che formato?
- La configurazione dei menu è (a) globale; (b) per cliente; (c) per singolo admin?
- Storico dei valori: basta registrare il valore vecchio e quello nuovo a ogni modifica? (sì / no) Per quanto tempo si conserva: illimitato / N anni?
- La classificazione dei campi del Check (PRIMARIO / SECONDARIO / FACOLTATIVO) è superata dalle sezioni degli MD? (sì / no)

**Risposta:** ____

---

# PARTE B — Domande specifiche per gestore

## B1. ILIAD

**B1.1 🔴 Regole di sezione per Incarico/Lavorazione** (sorgente r.50–56, assenti nell'MD)
- Coprono 5 valori su 11. Per New Site, Collocato New Site, Collocato Esistente, Demolizione, Ponte Radio e Pacchetto permessi si mostra tutto? (sì / no)
- Con più valori selezionati si mostra (a) l'unione delle sezioni previste da ciascun valore oppure (b) tutto?
- "PE+VS" e "caratterizzazione + VS" sono valori a sé ma si possono ottenere anche selezionando due valori singoli. Teniamo (a) i valori combinati, (b) la scelta multipla, oppure (c) entrambi, trattandoli come equivalenti?
- Le regole citano elementi che non esistono come campi: "pop-up PE", "pop up informazioni UT/Pe", "Report caratterizzazione", "deposito sismico" dentro UT+PE (è un campo DL). Puoi dare, **per ogni regola, l'elenco esatto dei campi visibili**?
- Le regole mostrano Assegnazione UT/PE dentro "UT+PE", dove sono copie in sola lettura, e **nascondono la sezione PM che contiene il campo master**: nessuno potrebbe compilarle. Con "Caratterizzazione" sparisce il flag CARATTERIZZAZIONE (quindi Invio/Conferma offerta non compaiono mai) e sparisce UT+PE, che contiene il blocco caratterizzazione. I campi master necessari restano sempre visibili? (sì / no)
- La caratterizzazione si attiva da (a) il flag F042; (b) Incarico; (c) entrambi, con F042 compilato in automatico? Il pop-up UT in Fase Preliminare ha la condizione Caratterizzazione = SI? (sì / no)

**Risposta:** ____

**B1.2 🔴 Significato di "New Site"** (Acquisitore, rilievi, Geologica, Scheda Palo, Progetto, Invio AS/VS, Tipologia attività PE)
Con la scelta multipla, "Incarico = New Site" vuol dire (a) contiene New Site; (b) è l'unico valore selezionato; (c) contiene New Site oppure Collocato New Site? **Risposta:** ____

**B1.3 🔴 Tipologia attività PE (F142)**
La regola dice: prendi il valore da Progetto "se Incarico = New Site". Però Progetto con New Site è vuoto per definizione. La regola va invertita, cioè Progetto se *non* è New Site, altrimenti Incarico? (sì / no) Quali sono i valori del menu? Con più valori di Incarico (a) si prende il primo, (b) si prendono tutti, (c) si compila a mano? **Risposta:** ____

**B1.4 🟠 Condizioni del sorgente perse nell'MD.** Le ripristiniamo? (sì / no)
Blocco Liguria F057–F064 ("se Regione = Liguria") · Nome Ente / Ottenimento / Esito ente ("se Vincoli compilato") · Tecnico Misure di fondo ("non se Piemonte") · APPROVAZIONE PE ("se PE = SI").
Inoltre l'MD aggiunge "AIE = SI" a Forecast AIE nella vista AIE: va mostrata tutta la sezione AIE solo se AIE = SI? (sì / no) **Risposta:** ____

**B1.5 🟠 Note di dubbio rimaste nel sorgente**
- AGORA' "solo se Committente = Cellnex → verificare": (a) solo con Cellnex; (b) sempre.
- Forecast Protocollo "dato placeholder": la formula +30 gg è definitiva? (sì / no)
- Costo PE "utile solo se collegato con G7": (a) mostrarlo sempre; (b) solo se c'è il Codice G7; (c) importarlo da G7.

**Risposta:** ____

**B1.6 ⚪ Numerazione del sorgente.** Il sorgente ha una sua numerazione (1–145) con buchi ai numeri 91 e 132. Corrispondono a campi rimossi? (sì / no) **Risposta:** ____

## B2. TOWERNET

**B2.1 🔴 Il menu Incarico/Lavorazione ha un solo valore**
Il dominio è solo "New Site", ma le condizioni di Assegnazione UT citano "Verifica statica" e "Caratterizzazione + verifica statica". Qual è l'elenco completo? La scelta è singola o multipla? Ci sono sezioni da nascondere per lavorazione? (no / sì: quali)
"Caratterizzazione + VS" attiva solo Assegnazione UT e Note UT, senza blocco di caratterizzazione (la Guida lo esclude per TOWERNET)? (sì / no) **Risposta:** ____

**B2.2 🟠 "Pop-up AIE → chiedere per AIE congiunte".** Le AIE congiunte richiedono (a) più blocchi AIE per pratica; (b) un flag "AIE congiunta"; (c) nulla? **Risposta:** ____

## B3. TIM / FIBERCOP

**B3.1 🔴 Chi compila Invio PE.** Nella vista PM il sorgente dice "Invio PE (data) → compilato da maragno" (DL), mentre nella sezione PE di UT+PE c'è un altro "Invio PE (data)". Il master è (a) UT+PE; (b) Maragno/DL; (c) entrambi sullo stesso dato? L'occorrenza PM fuori dal pop-up va tenuta? (sì / no) **Risposta:** ____

**B3.2 🔴 TIM e Fibercop.** Committente compilato in automatico = Fibercop; Cliente Finale = TIM oppure Fibercop. È un unico cliente TIM/FIBERCOP con Cliente Finale come attributo? (sì / no) Assistente TIM e Progettista TIM compaiono anche con Cliente Finale = Fibercop? (sì / no) **Risposta:** ____

**B3.3 🟠 Campi PM in più.** L'MD ripete Assegnazione UT e Note Assegnazione UT (F032/F033) nella sezione Progettazione esecutiva del PM. Nel sorgente stanno solo in Fase Preliminare. Le eliminiamo? (sì / no) Vale lo stesso per FASTWEB-VODAFONE (#62–63). **Risposta:** ____

**B3.4 ⚪ Rinforzo.** Le Note chiedono di aggiungere a TIM il campo "Rinforzo (Sì/No)" e di spostare i Vincoli prima. Oggi è solo in ILIAD. È una richiesta di modifica da applicare? (sì / no) **Risposta:** ____

## B4. INWIT

**B4.1 🔴 Regole di sezione per Incarico/Lavorazione** (sorgente r.48–56)
- Con Caratterizzazione, Progetto Esecutivo, Verifica Statica, Caratt.+VS e PE+VS vanno nascoste **per intero** le sezioni Pacchetto Permessi, Iter Autorizzativo e DL, e anche i campi di Fase Preliminare non elencati? (sì / no)
- Le regole valgono (a) solo nella vista PM oppure (b) per tutti i team?
- Con Progetto Esecutivo e PE+VS compare Assegnazione PE ma non il flag PE, da cui Assegnazione PE dipende. Il flag è (a) visibile oppure (b) impostato in automatico a SI?
- "Deposito sismico" indica (a) solo il flag F118 oppure (b) tutto il blocco DL?
- Elenca esattamente i campi di "pop-up PE" e "pop-up UT".
- I valori corretti sono quelli del menu (r.46)? Il sorgente li scrive in modi diversi ("Verifica statica" / "Verifica Statica", "Caratterizzazione + verifica statica" / "Caratterizzazione + VS", "PE+VS" / "PE + VS"). (sì / no) "new site raw land" vuol dire Incarico = New Site **e** Tipologia sito = Raw Land? (sì / no)

**Risposta:** ____

**B4.2 🔴 Blocco di caratterizzazione.** La Guida dice che il blocco UT di caratterizzazione (Forecast Invio, Tecnico, Fornitore, Invio Report) è previsto "solo per ILIAD e INWIT", ma **il sorgente INWIT non lo contiene**. In più:
- le regole di sezione nasconderebbero UT+PE proprio con le lavorazioni di caratterizzazione;
- in Fase Preliminare ci sono sia "Invio report caratterizzazione" (F025) sia "Invio Report Caratterizzazione" (F107, pop-up).

Il blocco UT va confermato per INWIT? (sì / no) F025 e F107 sono (a) lo stesso dato con master UT; (b) lo stesso dato con master PM; (c) dati diversi? **Risposta:** ____

**B4.3 🟠 Forecast Ottenimento Permessi solo per New Site.** Per le altre lavorazioni l'alert sui permessi non è previsto? (confermato / no) **Risposta:** ____

## B5. FASTWEB / VODAFONE

**B5.1 🔴 Lavorazione "Applicabilità"** (r.47: "se viene selezionato nei box operativi compaiono solo i campi Applicabilità e Invio Applicabilità")
- Con Incarico = Applicabilità restano visibili solo Core, Dati Secondari, Applicabilità e Invio Applicabilità? (sì / no)
- Restano visibili anche Data assegnazione e Data sopralluogo, che servono agli alert? (sì / no)
- Applicabilità e Invio Applicabilità sono visibili anche con altre lavorazioni? (sì / no)
- Gli altri valori (New Site, Collocato, Demolizione, Ponte Radio, Bonifica, Rewatt, VRUC) nascondono qualcosa? (no / sì)
- La scelta è singola? (sì / no)

**Risposta:** ____

**B5.2 🟠 Fastweb e Vodafone.** Sono un unico cliente con le stesse regole? (sì / no) Cliente Finale ammette anche "Vodafone"? Oggi il sorgente ha solo "Fastweb". (sì / no) **Risposta:** ____

## B6. LEONARDO

**B6.1 🔴 All. 18.** Il sorgente dice "scompare se All. 18 = SI" per Note Pacchetto Permessi, Tipologia pacchetto permessi, Invio Pacchetto Permessi e Protocollo. L'MD ha perso le 4 condizioni. Le confermi? (sì / no) Ottenimento Permessi (a) resta visibile oppure (b) scompare anche lui? Con All. 18 = SI l'alert su Forecast Ottenimento Permessi va soppresso? (sì / no) **Risposta:** ____

**B6.2 🔴 Campo mancante "Forecast inizio lavori".** Nel sorgente UT+PE (r.177): "Forecast inizio lavori (data) → compare solo se deposito sismico = SI". Il campo è assente nell'MD. Lo confermi? (sì / no) Sta in (a) PE oppure (b) UT? È diverso da Forecast CIL del DL? (sì / no) Genera un alert? (sì / no) **Risposta:** ____

**B6.3 🟠 Oneri** (menu: diritti di segreteria, marche da bollo, paesaggistica). È (a) una scelta multipla del solo tipo; (b) una voce ripetibile con tipo e importo; (c) una scelta singola? **Risposta:** ____

**B6.4 🟠 ODA e Stato attività.** In LEONARDO ODA sta nel Core e non ha Note ODA. È (a) un valore singolo oppure (b) ripetibile? Serve un alert per ODA mancante? (sì / no) Stato attività e l'alert Fatturabile/KO valgono anche per LEONARDO? (sì / no) **Risposta:** ____

**B6.5 🟠 Ordine dei campi UT+PE.** Nel sorgente i campi PE vengono prima di quelli UT, in un'unica lista. L'MD crea le sottosezioni UT e PE e decide da solo in quale va ciascun campo. Seguiamo l'ordine del sorgente e confermi la ripartizione dell'MD? (sì / no) **Risposta:** ____

---

# PARTE C — Correzioni minori (un solo OK per tutte)

Possiamo correggere noi i punti seguenti senza cambiare la sostanza. **Approvi in blocco?** (sì / no / sì tranne: ___)

1. **Note superate negli MD:** "id_flusso da assegnare" su Invio CEM (TIM, LEONARDO, TOWERNET, INWIT, FASTWEB-VODAFONE: l'ID è già assegnato); "La fonte ILIAD corrente…" nella nota di Fatturato copiata in tutti gli MD; nome sbagliato del file sorgente in testa agli MD di ILIAD e TIM.
2. **Campo Universale palesemente errato** su righe a confidenza BASSA: Assegnazione AIE → "ASSEGNAZIONE PE", Nome Ente → "Nome sito Vodafone", Ripresentazione Pratica → "Pratica Sismica", Invio integrazione → "INVIO VERBALE DI SOPRALLUOGO", Cliente Finale → "ODA LOS A+B", Costo UT → "Richiesta analisi UT", Tipologia pacchetto permessi → "Tipologia Sito", e altri. Le impostiamo a **DA VERIFICARE** e le escludiamo dall'import automatico finché non sono validate.
3. **Nomi e ordine delle sezioni** allineati ai sorgenti, per esempio "Progettazione esecutiva e ufficio tecnico" invece di "Ufficio Tecnico / Progettazione Esecutiva", con l'ordine delle righe come nel sorgente.
4. **Rinumerazione degli `id_flusso`** dopo le correzioni (inserimento dei campi mancanti, ordine AIE prima di UT+PE dove il sorgente lo prevede). Le copie (mirror) mantengono sempre l'ID del campo principale (master).
5. **Matrice:** 10 righe marcate COERENTE hanno in realtà etichette diverse da quelle degli MD (es. Tecnico PP ↔ "Progettista / Tecnico", Fornitore PP ↔ "Fornitore Permessi", Referente ↔ "Referente Fastweb"). In interfaccia usiamo il "Nome dashboard consigliato" della Matrice e conserviamo l'etichetta del sorgente per la tracciabilità.
6. **Guida:** nella §3.4 il nome della Matrice senza "(1)"; nella §4 manca la domanda 11; nella §20.2 c'è ancora un riferimento a voci "DA UNIFORMARE", che oggi sono 0; nella §10 si parla di "Data assegnazione" dove i campi reali sono "Assegnazione UT/PE/AIE".
7. **Refusi nei sorgenti:** una parentesi non chiusa tra Gestore Tenant e Codice sito Tenant; "SI'"; l'alias "Invio verbale di sopralluogo = TSSR" (ILIAD) da conservare come sinonimo.

**Risposta:** ____

---

### Riepilogo

| Parte | Argomento | Domande |
|---|---|---|
| A1 | Struttura e modello dati | 10 |
| A2 | Condizioni di visibilità | 7 |
| A3 | Master/mirror e ownership | 5 |
| A4 | Regole importate da altri gestori | 1 (tabella) |
| A5 | Formule e campi calcolati | 4 |
| A6 | Stato attività, completamento, Fatturabile | 4 |
| A7 | Alert e notifiche | 3 |
| A8 | Permessi, passaggi, perimetro | 4 |
| B | Specifiche per gestore | 21 |
| C | Correzioni minori | 1 (approvazione in blocco) |

Le domande 🔴 delle sezioni **A1, A2, A3 e A6** sono quelle che bloccano l'inizio dello sviluppo. Le altre si possono chiudere anche a lavori avviati.
