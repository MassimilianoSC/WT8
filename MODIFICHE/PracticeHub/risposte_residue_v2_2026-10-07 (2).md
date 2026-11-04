# PracticeHub — Risposte alle questioni residue v2

**Compilato da:** —  
**Data:** —  
**Completamento:** 25/26 questioni

---

## BLOCCANTE

### B1 — Come si ricava il template dai dati della pratica (ex A1.8, B3.2, B5.2)
- **Fornisci la tabella (Committente, Cliente Finale) → template, oppure almeno i valori di Cliente Finale per INWIT, TOWERNET e LEONARDO e come si distinguono le pratiche SIRTI e TELEBIT tra ILIAD e INWIT.**  
  → * LEONARDO: Committente: Leonardo; Cliente Finale: Leonardo
* INWIT: Committente: Inwit, Todos, Telebit, Sirti; Cliente Finale: Inwit
* TOWERNET: Committente: TowerNet; Cliente Finale: TowerNet

Dal momento che, a fronte di combinazione ambigua o sconosciuta verrà inserita la selezione manuale del template (vedi successiva), lasciare a tutti i gestori, per entrambi i campi, il valore 'Altro' che permette l'inserimento manuale.
- **Se la combinazione è ambigua o sconosciuta:**  
  → (a) Chi crea la pratica sceglie il template a mano
- **TIM / FIBERCOP:**  
  → (c) Un solo template; Cliente Finale distingue TIM da Fibercop
- **FASTWEB / VODAFONE:**  
  → (a) Un solo template; Cliente Finale ammette Fastweb e Vodafone
- **LEONARDO, che non ha Committente: il template si ricava dal solo Cliente Finale?**  
  → No
- _Note:_ su B1.5: Il Committente è stato esplicitato e aggiunto come campo in B1.1, allineando il template LEONARDO agli altri.

### B2 — Ripresentazione totale: regole operative (ex A1.7, P1 §9)
- **Chi può avviare una Ripresentazione totale?**  
  → (c) PM leader e ADMIN
- **Nella nuova iterazione, oltre ai due blocchi anagrafici, ricomincia da zero**  
  → (a) Tutto il resto: ogni sezione operativa riparte vuota
- **Note Operative, Fatturabile e Fatturato sono**  
  → (c) Misto (indica quali)
- **Stato attività all'inizio della nuova iterazione**  
  → (a) Riparte vuoto, fino al primo evento automatico
- **I gruppi abilitati dal Passa nell'iterazione precedente**  
  → (b) Restano abilitati
- **Si può avviare una Ripresentazione totale su una pratica archiviata (TERMINATO o KO)?**  
  → (b) No: prima va ripristinata dall'Archivio (PM o ADMIN)
- _Note:_ su B2.3: Note Operative rimangono, gli altri due si resettano.

### B3 — Rilavorazione e import: riconoscere pratica e iterazione (ex A1.7, A1.8)
- **Riga di import con un G7 nuovo ma con Codice Sito e Nome Sito di una pratica già esistente:**  
  → (a) Diventa una nuova pratica (rilavorazione)
- **Se una riga riguarda un G7 esistente e i valori differiscono da quelli inseriti a mano:**  
  → (a) L'import non sovrascrive i campi già compilati
- **Il collegamento della rilavorazione alla pratica di origine si registra**  
  → (a) Con un riferimento esplicito "pratica di origine", oltre allo stesso Codice Sito
- **Chi può avviare una rilavorazione?**  
  → (a) Chi può avviare una pratica (PM, DL, ADMIN)
- **Per avviare una rilavorazione la pratica di origine deve essere TERMINATO, KO o archiviata?**  
  → No
- _Note:_ `Codice G7` è un dato operativo e non costituisce la chiave tecnica univoca della pratica: una rilavorazione può ricevere un nuovo G7 oppure mantenere quello precedente. Pratiche, iterazioni e relazioni di rilavorazione devono quindi essere identificate tramite ID tecnici interni indipendenti dal Codice G7.

In fase di import, se la combinazione dei dati non consente di distinguere univocamente tra più pratiche compatibili con lo stesso G7/sito, non effettuare associazioni automatiche: richiedere una selezione manuale della pratica destinataria.

### B4 — Valori dei domini controllati (ex A1.5 (i), C2 §8)
- **Conferma i valori (correzioni nella nota)**  
  → 
  - SI / NO: Confermo
  - Stato attività: ASSEGNATO, IN LAVORAZIONE, IN APPROVAZIONE, PROTOCOLLATO, INTEGRAZIONE RICHIESTA, AUTORIZZATO, DINIEGATO, TAR, REALIZZATO, TERMINATO, STAND-BY, KO: Correggo (vedi nota)
  - Stato ODA: DA RICHIEDERE, RICHIESTI, PRESENTI, FATTURATO: Correggo (vedi nota)
  - Esito parere Arpa / Esito "nome ente": Positivo, Negativo: Confermo
  - Autorizzazione finale: AUTORIZZATO, DINIEGATO, TAR, KO (KO presente solo in TOWERNET): Confermo
  - Tipologia sito: Raw Land, Roof Top, Traliccio (Traliccio presente solo in ILIAD): Confermo
  - Stato dei vincoli: Presente, Assente, Non pertinente, Assolto: Confermo
  - Committenti usati nelle condizioni: CELLNEX (CDMS, Invio CDMS, AGORA'), CONSORZIO (ERICSSON) (WCN): Confermo
- **Autorizzazione finale: lo stesso dominio, con KO, vale anche per INWIT?**  
  → Sì
- **Tipologia sito: "Traliccio" vale per tutti i gestori o solo per ILIAD?**  
  → (b) Solo per ILIAD
- _Note:_ * vedi nota in C5 per valori finali di Stato ODA
* per Stato attività: sostituire 'IN LAVORAZIONE' con 'CREATA'. Questo è lo stato di una pratica fino a quando scatta l'assegnazione.

### B5 — Alert Offerta → ODA: quando si chiude (ex A7.3)
- **L'alert si chiude**  
  → (b) Quando il team leader o l'ADMIN lo risolve a mano, dopo che sono arrivati tutti gli ODA previsti
- **In una pratica possono esserci più Offerte?**  
  → No

---

## DA CHIARIRE

### C1 — Giorni di calendario o lavorativi, orari dei reminder (ex A5.4, A7.2)
- **Soglie degli alert e formule si contano in giorni**  
  → (b) Lavorativi per gli alert, di calendario per le formule
- **Giorno e ora dei reminder settimanali (es. CDMS, Offerta → ODA) e ora del controllo giornaliero degli alert**  
  → I reminder settimanali arrivano alla mattina, alle 9:00 ora italiana, del giorno della scadenza dell'alert. Quindi se l'offerta è stata inviata alla sera del giorno della settimana precedente, il reminder arriva comunque alla mattina, ovvero arriva anche se non sono trascorsi l'equivalente esatto in ore di una settimana.

### C2 — Notifiche del Passa e delle assegnazioni (ex A8.3)
- **L'assegnazione esplicita a UT, PE e AIE (data, forecast, note, conferma) è**  
  → (a) Il comando Passa stesso, con i dati di assegnazione
- **La notifica del Passa va a**  
  → (a) Tutti gli utenti del gruppo destinatario
- **La mail parte**  
  → (a) A ogni Passa
- **Notifica al gruppo DL quando il PM assegna il PE**  
  → (b) Tutti i gestori
- **Le card dei gruppi non ancora coinvolti nella vista della pratica sono**  
  → (b) Visibili ma disattivate
- **Nel Passa serve poter scegliere tra chat e mail?**  
  → (a) No
- _Note:_ Importante: il termine 'Passa' deve essere sostituito da 'Assegna': le funzioni rimangono le medesime.

### C3 — Stato attività: quale evento fa scattare IN LAVORAZIONE (ex A6.1)
- **IN LAVORAZIONE scatta**  
  → Altro: IN LAVORAZIONE deve essere sostituito dal termine 'CREATA' come da nota in B4. Nella stessa nota è definita anche la regola.

### C4 — Completamento, TERMINATO e Archiviazione (ex A6.2, P1 §3)
- **"Completare" la pratica significa**  
  → (a) Impostare Stato attività = TERMINATO (lo possono fare PM e ADMIN): nessuna azione separata
- **Una pratica archiviata è**  
  → (a) In sola lettura finché non viene ripristinata
- **Gli alert di una pratica archiviata si fermano?**  
  → Sì

### C5 — Fatturabile e Fatturato: automatismi da completare (ex A6.3, A6.4, B6.1)
- **L'automatismo scrive Fatturabile = NO quando**  
  → Altro: Fatturabile = NO è lo stato di default. Quando sono passati 30gg da Ottenimento permessi e l'ultimo esito ARPA è Positivo, allora diventa SI. 
- **LEONARDO con All. 18 = SI, quando il percorso Permessi scompare: Fatturabile**  
  → Altro: vedi sopra, non è collegato
- **FASTWEB-VODAFONE: con Stato ODA = FATTURATO, Fatturato diventa SI in automatico?**  
  → (b) No, sono indipendenti
- _Note:_ Nuova linea: i valori che può assumere Stato ODA sono:  DA RICHIEDERE, RICHIESTI, PRESENTI. Fatturato rimarrà come campo trasversale così come definito, spuntabile SI/NO solo manualmente.

### C6 — Formule e campi calcolati: comportamento (ex A5.1, A5.4)
- **Con più richieste di integrazione, lo spostamento del forecast si calcola su**  
  → (b) L'ultima integrazione
- **I "giorni che mancano al forecast" (≤ 15) si misurano alla data della Richiesta integrazione?**  
  → No
- **In generale, i campi calcolati sono**  
  → (a) Modificabili, e ricalcolati solo se vuoti
- **Il Committente compilato in automatico è fisso, non modificabile?**  
  → No
- **"Di base viene inserita la data del giorno" (Incarico PE, Incarico VS/AS): la data si scrive**  
  → (a) Al Passa verso UT/PE
- _Note:_ su C6.2: Il controllo dei 15 giorni riguarda il tempo residuo alla data corrente di `Forecast Ottenimento Permessi`: quando mancano 15 giorni o meno al Forecast ed esiste una `Richiesta integrazione`, il Forecast può essere posticipato della durata dell'integrazione, pari a `Invio integrazione - Richiesta integrazione`.
Il controllo non misura quindi la distanza tra `Richiesta integrazione` e Forecast. Il Forecast base resta `Protocollo + 67 giorni di calendario`; in caso di più integrazioni si considera l'ultima, come già stabilito.
La logica dietro è allungare la data di forecast a fronte di un'integrazione, ma di quanto? Di un periodo che sia pari alla differenza tra il giorno dell'invio e il giorno in cui è stato fatta la richiesta.

### C7 — Tipi di dato e obbligatorietà (ex A1.9, A1.10)
- **Coordinate**  
  → (a) Due campi decimali, latitudine e longitudine (WGS84)
- **N° protocollo e N° sismica sono testo, per ammettere barre e lettere?**  
  → Sì
- **Data Autorizzazione finale è**  
  → (a) Una data distinta da Ottenimento Permessi
- **Tutte le date nel formato gg/mm/aaaa (i sorgenti scrivono gg/mm/aa)?**  
  → Sì
- **L'obbligo dei campi con * vale**  
  → (a) Alla creazione della pratica

### C8 — Condizioni che restano: come si applicano (ex A2.5, A2.6, B1.4)
- **Se la condizione è falsa, il campo è**  
  → (a) Nascosto
- **Forecast Deposito Sismico e Data deposito sismico compaiono solo con Deposito sismico = SI, come gli altri campi DL?**  
  → Sì
- **Con Regione = Piemonte si nasconde anche "Stato misure di fondo", oltre a "Tecnico Misure di fondo"?**  
  → Sì
- **Con AIE = NO, la sezione Fase AIE del gruppo AIE è**  
  → (c) Sempre visibile, perché decide il Passa

### C9 — Incarico/Lavorazione: scelta singola o multipla (ex A2.7, B2.1, B5.1)
- **La scelta multipla vale per**  
  → (b) Tutti i gestori

### C10 — Core e Dati Secondari: chi li modifica fuori da PM/Permessi (ex A3.4)
- **Il DL può modificare il Core**  
  → (a) Solo quando crea la pratica
- **AIE e UT/PE vedono Core e Dati Secondari in sola lettura?**  
  → Sì

### C11 — Geologica: posizione con vincolo idrogeologico (ex A1.4)
- **Il blocco Geologica**  
  → (b) Sta sempre nella sezione PM "Progettazione esecutiva"

### C12 — Invio PE compilato da un gruppo diverso da UT/PE (ex B3.1, A7.2)
- **TIM: l'occorrenza di Invio PE nella vista PM, fuori dal pop-up, va tenuta come mirror in sola lettura?**  
  → No
- **TIM: nella sezione PE del gruppo UT/PE, Invio PE diventa un mirror in sola lettura del master DL?**  
  → Sì
- **FASTWEB-VODAFONE: chi possiede Invio PE?**  
  → (a) Il gruppo PM/Permessi (come dice il sorgente)
- **Se Invio PE non appartiene a UT/PE, l'alert Forecast PE va a**  
  → (a) PM + leader UT/PE (come per gli altri gestori)
- _Note:_ Eccezione TIM/FIBERCOP: poiché `Invio PE` ha master nel gruppo DL e nella sezione UT/PE è soltanto un mirror, l'alert `Forecast PE` deve essere inviato a **PM + leader UT/PE + leader DL**.
Il leader DL viene incluso perché appartiene al gruppo che può valorizzare direttamente il campo master che determina la chiusura dell'alert.

### C13 — INWIT: blocco di caratterizzazione (ex B4.2)
- **Il blocco UT di caratterizzazione esiste in INWIT?**  
  → Sì
- **F025 e F107 sono**  
  → (a) Lo stesso dato, con master UT (F025 diventa mirror)

### C14 — LEONARDO: All. 18, Forecast inizio lavori, Oneri (ex B6.1, B6.2, B6.3)
- **Con All. 18 = SI, Ottenimento Permessi**  
  → (a) Resta visibile
- **Con All. 18 = SI, l'alert su Forecast Ottenimento Permessi va soppresso?**  
  → No
- **Forecast inizio lavori è diverso da Forecast CIL del DL?**  
  → No
- **Forecast inizio lavori genera un alert?**  
  → (a) No
- **Oneri è**  
  → (a) Una scelta multipla del solo tipo
- _Note:_ Per chiarire definitivamente: Forecast CIL, Forecast inizio lavori, Forecast IL indicano tutti lo stesso dato. Mantenere il primo per coerenza tra tutti.

### C15 — Perimetro del primo rilascio (ex A8.4)
- **Quali KPI servono nel primo rilascio?**  
  → Pratiche attive totali, Pratiche per Stato attività, Pratiche per gestore, Pratiche per gruppo/assegnatario, Alert attivi, Alert scaduti, Scadenze prossime, Pratiche TERMINATE nel periodo, Pratiche KO nel periodo, Tempo medio/mediano Data assegnazione → TERMINATO.
- **Colonne dell'export CSV**  
  → (b) Quelle del gestore filtrato
- **L'assistente AI in sola lettura è**  
  → (a) Nel primo rilascio
- **Chi fornisce le liste iniziali (clienti, committenti, proprietà, enti…) e in che formato?**  
  → Dove possibile, ricavare i valori delle liste dai file sorgente. Segnalare cosa effettivamente manca.
- **Per lo storico dei valori basta registrare valore vecchio, valore nuovo, autore e data a ogni modifica?**  
  → Sì
- **Per quanto tempo si conservano storico e audit?**  
  → (a) Senza limite

### C16 — TOWERNET e ILIAD: punti rimasti in sospeso nei sorgenti (ex B2.2, B1.5)
- **TOWERNET, AIE congiunte: servono**  
  → (c) Nulla di speciale
- **ILIAD, AGORA' ("solo se Committente = Cellnex → verificare"): compare**  
  → (a) Solo con Committente CELLNEX
- **ILIAD, Forecast Protocollo = Data assegnazione + 30 gg ("dato placeholder"): la formula è definitiva?**  
  → (a) Sì

---

## MINORE

### M1 — Correzioni documentali: approvazione in blocco (ex C.1, B1.6, B3.3, B6.5, A6.4, A1.10)
- **Approvi in blocco?**  
  → (a) Sì, tutte

### M2 — TIM: campo "Rinforzo" (ex B3.4)
- **Aggiungiamo Rinforzo a TIM?**  
  → Sì

### M3 — Mirror di Geologica e Scheda Palo nella sezione PE (ex A3.5)
- **Teniamo i mirror Geologica nella sezione PE?**  
  → Sì
- **Teniamo il mirror Invio Scheda Palo nella sezione PE?**  
  → Sì
- _Note:_ Gli md sono in alcuni punti più aggiornati dei sorgente. Essendo nello specifico questi due elementi strettamente legati al gruppo UT/PE, direi che ha senso tenerli.

### M4 — Nome del nuovo vincolo ambientale (ex A1.4)
- **Nome del vincolo**  
  → (a) Vincoli Ambientali Naturalistici
- **SIC, Natura2000, Altro sono**  
  → (b) Valori del campo Ente (come da risposta)

### M5 — ILIAD: numeri mancanti nel sorgente (ex B1.6) ⚠ incompleta
- **I numeri 91 e 132 corrispondono a campi rimossi di proposito?**  
  → _(nessuna risposta)_
- _Note:_ non rilevante per l'implementazione; conservare il gap della numerazione sorgente senza creare nuove occorrenze.

---

## Interpretazioni applicate
- **I1** — ✅ Confermo  
  _Ordine di precedenza: chiarimenti del 06/10 > prompt del 06/10 > risposte del 05/10 > Guida, MD e sorgenti._
- **I2** — ✅ Confermo  
  _"Vedi file allegato" nelle risposte va letto come rinvio alle direttive del 06/10; non esiste un altro file._
- **I3** — ✅ Confermo  
  _La risposta A1.5(iii) "le liste dinamiche le gestisce solo l'admin" è superata: le gestiscono i team leader del gruppo, per gestore, insieme all'ADMIN._
- **I4** — ✅ Confermo  
  _Diventano sempre visibili, perché erano condizionati da Incarico: Invio AS/VS (UT e pop-up PM), Assegnazione UT e Note UT (TOWERNET, INWIT), Progetto, Acquisitore, Report e Invio report caratterizzazione (INWIT), blocco caratterizzazione e pop-up UT (ILIAD), Applicabilità e Invio Applicabilità (FASTWEB-VODAFONE), Forecast Ottenimento Permessi (INWIT, che era "solo New Site"). Cadono tutte le regole di sezione di ILIAD, INWIT e FASTWEB-VODAFONE._
- **I5** — ✅ Confermo  
  _Assegnazione, Rilievo e Invio rilievo topografico e georadar (ILIAD, "new site raw land"), Invio Scheda Palo e Scheda Scarichi palo (ILIAD, "Raw Land + New Site"): resta solo la condizione Tipologia sito = Raw Land._
- **I6** — ✅ Confermo  
  _Blocco Geologica: nessuna condizione di visibilità, nemmeno sui singoli campi. Il flag Geologica è un dato informativo e "Si compila solo se Geologica = SI" non nasconde nulla. Il calcolo Forecast Geologica = Assegnazione + 15 gg resta._
- **I7** — ✅ Confermo  
  _Restano le condizioni basate su altri dati, come nei sorgenti: AIE = SI (campi AIE del Pacchetto Permessi), Deposito sismico = SI, Regione = Piemonte (Tecnico Misure di fondo), Regione = Liguria (blocco ILIAD F057–F064), Revit = SI, MW = SI, CARATTERIZZAZIONE (F042) = SI → Invio/Conferma offerta (ILIAD), Committente = CELLNEX → CDMS e Invio CDMS, CONSORZIO (ERICSSON) → WCN, Tipologia sito = Traliccio → Altezza traliccio, PSC = SI → Forecast PSC, All. 18 = SI (4 campi LEONARDO), "compare se compilato" (Tenant, Integrazione, Ente, Vincoli → Forecast Ottenimento "Nome ente")._
- **I8** — ✅ Confermo  
  _ILIAD, APPROVAZIONE PE ("se PE = SI") e Assegnazione PE / Note Assegnazione PE negli altri sorgenti: la condizione PE vale solo per Assegnazione PE e Note Assegnazione PE; APPROVAZIONE PE è sempre visibile._
- **I9** — ✅ Confermo  
  _Ogni condizione (incluse quelle del punto I7) agisce solo sull'interfaccia: non disattiva alert, automazioni o master._
- **I10** — ✅ Confermo  
  _Le diciture "compilato da …" cadono solo dentro lo stesso gruppo. Tra gruppi diversi master e mirror restano: per esempio i campi del Core mostrati in UT/PE restano mirror in sola lettura, e i campi AIE nella vista PM restano un pop-up in sola lettura._
- **I11** — ✅ Confermo  
  _I team leader li nomina l'ADMIN tramite la gestione degli utenti; la nomina è un attributo della coppia (cliente, gruppo, ruolo) dell'utente._
- **I12** — ✅ Confermo  
  _"Il PM" con visibilità globale e poteri superiori significa qualunque utente con ruolo PM, non solo il PM leader (tranne per il completamento, vedi C4)._
- **I13** — ✅ Confermo  
  _L'alert DL di fine lavori (Forecast CIL + 20 gg con Data FL vuota) va a PM + leader DL, non solo al PM come diceva la Guida._
- **I14** — ✅ Confermo  
  _L'alert Forecast Parere Arpa vale anche per LEONARDO, perché lì si aggiungono i campi ARPA; il ciclo ripetibile si chiude con il Parere Arpa del ciclo corrente._
- **I15** — ✅ Confermo  
  _Gli alert sul sopralluogo usano "Data assegnazione" della Fase Preliminare in tutti i gestori (in LEONARDO è una data)._
- **I16** — ✅ Confermo  
  _LEONARDO non ha l'alert Offerta → ODA (non ha il campo Offerta); ODA è comunque ripetibile come negli altri gestori._
- **I17** — ✅ Confermo  
  _ASSEGNATO scatta con "Data assegnazione" della Fase Preliminare in tutti i gestori (in ILIAD il campo F026)._
- **I18** — ✅ Confermo  
  _Tra più eventi automatici vince il più recente. Ogni nuova Richiesta integrazione riporta lo stato a INTEGRAZIONE RICHIESTA._
- **I19** — ✅ Confermo  
  _Stato attività e l'alert "Fatturabile con pratica KO" valgono anche per LEONARDO._
- **I20** — ✅ Confermo  
  _Tipologia attività PE è un menu configurabile che contiene i valori di Progetto e di Incarico. FASTWEB-VODAFONE, che non ha Progetto, prende sempre il valore da Incarico._
- **I21** — ✅ Confermo  
  _Incarico/Lavorazione e Progetto sono liste configurabili (Configurazione), non domini controllati: servono solo alla derivazione per copia._
- **I22** — ✅ Confermo  
  _PE (SI/NO) in LEONARDO va nella sezione PM "Progettazione esecutiva", subito prima di Assegnazione PE, come negli altri gestori. Il blocco ARPA di LEONARDO va nell'Iter Autorizzativo, con la stessa struttura di TIM e TOWERNET._
- **I23** — ✅ Confermo  
  _Il flag Geologica in TOWERNET e INWIT va nella stessa posizione di TIM (all'inizio del blocco Geologica)._
- **I24** — ✅ Confermo  
  _Le etichette "(ripresentazione)" di A1.1 non servono più: il secondo ciclo ARPA è un'occorrenza del gruppo ripetibile._
- **I25** — ✅ Confermo  
  _Le note "pagamento di un esterno" (Costo UT) e "utile solo se collegato con G7" (Costo PE) sono informative: non producono nessun comportamento._
- **I26** — ✅ Confermo  
  _La classificazione dei campi del Check (PRIMARIO / SECONDARIO / FACOLTATIVO) è superata dalle sezioni del template e dalle sezioni apribili e chiudibili._
- **I27** — ✏️ Correggi: a volte si inserisce uno nuovo, altre lo stesso. bisogna lasciare la possibilità anche di reinserire lo stesso.  
  _Codice G7 è univoco su tutte le iterazioni di tutte le pratiche; per una rilavorazione serve sempre un nuovo G7._
- **I28** — ✏️ Correggi: 'Altro' permette di inserire il valore manualmente.  
  _"Altro" in Tipologia Struttura e Proprietà/Host è un valore semplice, senza testo aggiuntivo._

---

**Riepilogo:** 5 bloccanti · 16 da chiarire · 5 minori (totale 26).
