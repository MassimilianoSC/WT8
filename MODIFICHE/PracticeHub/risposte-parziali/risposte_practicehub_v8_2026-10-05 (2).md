# PracticeHub — Risposte alle domande aperte v8

**Compilato da:** —  
**Data:** —  
**Completamento:** 25/61 domande

---

# Parte A — Decisioni trasversali (una risposta vale per tutti i gestori)

## A1 · Struttura e modello dati

### A1.1 — Chiave univoca dei campi: etichette duplicate [BLOCCANTE]
- **Accetti le rinomine "Data deposito sismico" (come nella Guida §2), "EM data" / "EM %" e le etichette "… (ripresentazione)" per il secondo ciclo ARPA?**  
  → Sì
- **Per alert e KPI serve una chiave comune a tutti i clienti. Quale adottiamo?**  
  → (b) Etichetta della Matrice resa univoca, senza id_flusso

### A1.2 — Gruppi di campi ripetibili [BLOCCANTE]
- **Confermi questi gruppi? Ogni gruppo si ripete per intero a ogni occorrenza.**  
  → (a) Sì, così come sono
- **In LEONARDO, TIM e FASTWEB-VODAFONE "Forecast Ottenimento 'Nome ente'" non ha la condizione "compare solo se compilato Nome Ente", che invece hanno gli altri campi del gruppo. Fa parte del gruppo e compare solo con Nome Ente?**  
  → Sì
- **Ci sono gruppi con un numero massimo di ripetizioni?**  
  → (a) No, sono tutti illimitati

### A1.3 — Ripresentazione della pratica ARPA [BLOCCANTE]
- **Come va modellata la ripresentazione?**  
  → (a) Gruppo ripetibile senza limite {Ripresentazione, Forecast Parere Arpa, Parere Arpa, Esito, N° protocollo}, che si ripete finché l'esito è Negativo
- **ILIAD: "Ripresentazione Pratica" che tipo di campo è?**  
  → (a) Data
- **Per Fatturabile e per gli alert quale esito conta?**  
  → (a) L'ultimo esito registrato

### A1.4 — Vincoli: la tabella in fondo ai sorgenti [BLOCCANTE]
- **Il modello è questo? Per ogni vincolo uno stato a scelta singola, più un campo Ente visibile solo se lo stato è "Presente".**  
  → Sì
- **La frase "Se presente e non pertinente nessun campo ente" accosta due stati che si escludono. Va letta come "con Assente / Non pertinente / Assolto nessun campo ente"?**  
  → Sì
- **Il campo Ente è:**  
  → (a) Precompilato e modificabile
- **Paesaggistico, "SOPRINTENDENZA o COMUNE":**  
  → (a) Si sceglie uno dei due
- **"ENAC / ENAV":**  
  → (b) È un ente unico
- **Per Parco e ALTRO, l'Ente è testo libero?**  
  → Sì
- **Un vincolo "Presente" crea in automatico una voce nel gruppo Ente dell'Iter Autorizzativo? (TOWERNET: "Nome Ente si autocompila in base al tipo di vincolo")**  
  → Sì
- **La colonna NOTE della tabella è un campo da compilare?**  
  → No
- **TOWERNET e INWIT: "vincoli ambientali naturalistici (SIC, Natura2000…) → chiedere ad Antonella". Qual è la risposta? Indica sottotipi, stati ed ente.**  
  → * Tipologia di vincolo: "Vincoli Ambientali Paesaggistici"
* Dichiarazione: "Presente/Assente/Non pertinente"
* Note: idem al Paesaggistico
* Ente: "SIC", "Natura2000", "Altro".
- **Con vincolo idrogeologico "Presente", i campi Geologica "devono comparire nel box fase preliminare dopo i vincoli" (TIM, TOWERNET, INWIT). Gli MD non riportano la regola. Cosa succede?**  
  → (a) I campi si spostano in Fase Preliminare

### A1.5 — Valori dei menu a tendina [BLOCCANTE]
- **(i) I valori presenti nei sorgenti sono quelli definitivi?**  
  → No
- **(ii) Per ogni menu della tabella indica i valori, oppure scrivi "dinamico" o "utenti". Puoi anche allegare un file a parte.**  
  → vedi file allegato.
- **Regione / Provincia / Comune: si usa l'elenco ISTAT con filtro a cascata?**  
  → Sì
- **Gestore Tenant, "tutti i clienti", significa:**  
  → (c) Un'anagrafica dedicata
- **Progetto: l'elenco tra parentesi è**  
  → (a) L'elenco dei valori di un menu
- **Nome Ente è**  
  → Altro: Menu (indica l'elenco degli enti) + si autocompila sulla base del vincolo selezionato in Fase preliminare.
- **(iii) Nei menu dinamici i nuovi valori li inserisce**  
  → (b) Solo l'admin
- **(iii) Le liste dinamiche sono**  
  → (b) Separate per cliente
- **(iv) La voce "altro (campo libero)" in Tipologia Struttura e Proprietà/Host apre un campo di testo aggiuntivo?**  
  → No
- **(v) Il valore Host si chiama "Fastweb" in ILIAD e "Vodafone-fastweb" in TIM, LEONARDO e FASTWEB-VODAFONE. Lo uniformiamo?**  
  → (a) Sì (scrivi il nome in "Altro")
- _Note:_ Fastweb-Vodafone.

### A1.6 — Tecnici e assegnatari: utenti della piattaforma o liste? [BLOCCANTE]
- **Classifica ogni campo**  
  → 
  - Tecnico AIE: Utente
  - Tecnico Misure di fondo: Lista
  - Tecnico UT: Utente
  - Tecnico PE: Utente
  - Tecnico PP: Utente
  - Tecnico PSC: Utente
  - Tecnico Caratterizzazione: Utente
  - Tecnico deposito sismico: Utente
  - Responsabile interno AIE: Utente
  - VS/AS incaricata da: Utente
  - PE incaricato da: Utente
  - Progettista / Tecnico: Utente
  - Referente: Lista
  - Acquisitore: Lista
  - Direttore Lavori: Lista
  - Collaudatore: Lista
  - Fornitori (tutti): Lista
- **I fornitori esterni vanno**  
  → (b) Tenuti come lista configurabile
- _Note:_ Progettista/tecnico è un riferimento superato: quello nuovo è esattamente Tecnico PP.

### A1.7 — Identificativo della pratica e rilavorazione [BLOCCANTE]
- **Codice G7 = Num Doc = codice commessa?**  
  → Sì
- **L'unicità del codice è**  
  → (a) Globale
- **Una rilavorazione ha**  
  → Altro: guardare file allegato.
- **Se la pratica la crea il team DL, il Codice G7 è obbligatorio?**  
  → Sì
- **Codice G7 è**  
  → (a) Solo numerico
- **In 5 clienti ODA, Note ODA e Stato ODA stanno nel Core. Quando si duplica il Core per una rilavorazione, vanno esclusi?**  
  → Sì
- **Serve un'entità "Sito" separata dalla pratica, con chiave Codice Sito?**  
  → No

### A1.8 — Cliente, gestionale e mappatura dei dati esistenti [BLOCCANTE]
- **Cliente Finale**  
  → (a) Sostituisce del tutto il gestionale
- **Il cliente di una pratica (quale dei 6 template usa) è**  
  → (b) Ricavato da Committente + Cliente Finale
- **Una pratica con Cliente Finale = FASTWEB usa**  
  → (a) Il template ILIAD se il Committente è Consorzio, Cellnex, Sirti…; FASTWEB-VODAFONE se è Fastweb diretto
- **Puoi fornire una tabella foglio/gestionale attuale → cliente? I fogli senza cliente vanno esclusi?**  
  → (c) No
- **Dati già presenti nell'app**  
  → (b) Azzeramento e nuovo caricamento
- **L'import da Excel resta? Se sì, con quale chiave si uniscono le righe dei fogli PM, AIE, UT+PE e DL in un'unica pratica?**  
  → Altro: Sì, chiave codice G7 + Codice Sito + Nome Sito.

### A1.9 — Tipi di dato (dtype) [DA CHIARIRE] ⚠ incompleta
- **Coordinate**  
  → _(nessuna risposta)_
- **N° protocollo (deposito sismico, Arpa, Ente) e N° sismica diventano testo, per ammettere barre e lettere?**  
  → _(nessuna risposta)_
- **Data Autorizzazione finale (dtype vuoto in tutti e 6) è una data?**  
  → _(nessuna risposta)_
- **Data Autorizzazione finale rispetto a Ottenimento Permessi**  
  → _(nessuna risposta)_
- **LEONARDO, Data assegnazione (senza dtype): è una data? Serve all'alert del sopralluogo.**  
  → _(nessuna risposta)_
- **Tutte le date nel formato gg/mm/aaaa? I sorgenti scrivono "gg/mm/aa".**  
  → _(nessuna risposta)_
- **ILIAD: XML, Offerta Inviata, AGORA', Fatturabile e Fatturato sono menu con i valori del sorgente?**  
  → _(nessuna risposta)_

### A1.10 — Campi obbligatori * [DA CHIARIRE] ⚠ incompleta
- **Quando vale l'obbligo?**  
  → _(nessuna risposta)_
- **FASTWEB-VODAFONE: il valore "TITOLO IV*" di Applicabilità è**  
  → _(nessuna risposta)_

## A2 · Condizioni di visibilità

### A2.1 — "Invio AS/VS": condizioni opposte in tutti i gestori [BLOCCANTE]
- **Nella sezione UT, Invio AS/VS compare**  
  → (a) Sempre
- **Il pop-up PM segue la stessa regola?**  
  → Sì
- **Per i New Site l'alert Forecast UT**  
  → (c) Si chiude comunque con Invio AS/VS

### A2.2 — Assegnazione UT: per quali lavorazioni [BLOCCANTE]
- **Assegnazione UT compare anche con**  
  → (c) Entrambi

### A2.3 — Geologica: condizioni aggiunte dall'MD [BLOCCANTE]
- **Condizione corretta per cliente**  
  → 
  - TIM/FIBERCOP: Raw Land + New Site (come l'MD)
  - LEONARDO: Raw Land + New Site (come l'MD)
  - TOWERNET: Raw Land + New Site (come l'MD)
  - INWIT: Raw Land + New Site (come l'MD)
- **A TOWERNET e INWIT va aggiunto il flag "Geologica SI/NO"?**  
  → Sì

### A2.4 — Pop-up UT+PE nella vista PM e condizione "PE = SI" [BLOCCANTE] ⚠ incompleta
- **La condizione PE = SI vale**  
  → _(nessuna risposta)_
- **LEONARDO: il pop-up compare**  
  → Altro: vedi nota su A2.4
- **Il pop-up UT+PE nella vista PM è (in ILIAD contiene campi con valore predefinito "data del giorno")**  
  → (a) In sola lettura
- **FASTWEB-VODAFONE, "Pop-up PE (tutti i campi)" e "Sezione UT (Pop-up UT ove presente)": il PM vede**  
  → (a) Tutti i campi delle sezioni PE e UT in sola lettura
- _Note:_ Nuova regola consolidata:

Il campo `PE (SI/NO)` deve essere presente per tutti i gestori; attualmente va aggiunto anche a LEONARDO.

`PE` governa esclusivamente la visibilità dei due campi master PM/Permessi:

- `Assegnazione PE`
- `Note Assegnazione PE`

che compaiono quando `PE = SI`.

La condizione NON deve essere propagata ai campi del team UT+PE né alle relative automazioni.

In particolare, `Forecast UT`, `Forecast PE` e gli altri campi master dei team UT e PE mantengono le proprie logiche e i propri alert indipendentemente dal valore di `PE`.

Per i pop-up:

- pop-up misto UT+PE → non subordinato a `PE`;
- pop-up esclusivamente PE → può essere visualizzato solo con `PE = SI`.

La condizione di visibilità di un pop-up è esclusivamente una regola UI e NON deve essere interpretata come condizione di esistenza, compilazione o attivazione degli alert dei campi master rappresentati al suo interno.

In sintesi: `PE` controlla l'esposizione PM del ramo PE, non il workflow operativo dei team UT/PE.

### A2.5 — "Si compila solo se" e "compare solo se" [DA CHIARIRE] ⚠ incompleta
- **"Si compila solo se X": se X è falso il campo è**  
  → _(nessuna risposta)_

### A2.6 — Condizioni asimmetriche (probabili dimenticanze) [DA CHIARIRE] ⚠ incompleta
- **Forecast Deposito Sismico e Data deposito sismico non hanno la condizione "deposito sismico = SI", che hanno invece gli altri campi DL. Compaiono solo se SI?**  
  → _(nessuna risposta)_
- **"Tecnico Misure di fondo: non compare se Regione = Piemonte". Va nascosto anche "Stato misure di fondo"?**  
  → _(nessuna risposta)_
- **Con AIE = NO, la sezione Fase AIE del team AIE è**  
  → _(nessuna risposta)_

### A2.7 — Incarico/Lavorazione a scelta multipla [DA CHIARIRE] ⚠ incompleta
- **La scelta multipla vale**  
  → _(nessuna risposta)_

## A3 · Master/mirror e ownership

### A3.1 — Campi AIE presenti sia nella vista PM sia in quella AIE [BLOCCANTE]
- **Chi è il master?**  
  → (a) AIE, con il PM in sola lettura (pop-up)
- **Il pop-up AIE nella vista PM finisce ad "Approvazione AIE"? Dopo, i sorgenti proseguono con Note Pacchetto Permessi, Invio Pacchetto Permessi e Ottenimento Permessi senza separatore.**  
  → Sì
- **Forecast AIE nella vista AIE è in sola lettura, con master PM, come dicono i sorgenti? L'MD non lo dichiara in 5 clienti.**  
  → Sì

### A3.2 — Pop-up Direzione Lavori nella vista PM [BLOCCANTE]
- **Il PM vede**  
  → (a) Tutti i 12 campi DL in sola lettura, con le stesse condizioni

### A3.3 — Sola lettura per i Permessi dentro il team PM/Permessi [BLOCCANTE] ⚠ incompleta
- **Serve un sotto-ruolo PM / Permessi con permessi diversi?**  
  → _(nessuna risposta)_
- **Se non serve, i campi "non modificabili da Permessi" li modifica**  
  → (a) Tutto il team PM/Permessi
- **Un utente deve poter appartenere a più team?**  
  → Sì
- _Note:_ separare Ruolo PM e ruolo Permessi: i due possono modificare/vedere campi di competenza del team pm/permessi. il PM può, in più rispetto all'utente Permessi: confi. più che un unico team sono due figure che collaborano: i primi hanno una visuale globale della pratica, dall'apertura alla chiusura, mentre i secondi operano nella parte iniziale.

### A3.4 — Core Anagrafica e Dati Secondari nelle viste degli altri team [DA CHIARIRE] ⚠ incompleta
- **Core e Dati Secondari sono**  
  → _(nessuna risposta)_

### A3.5 — Mirror aggiunti dall'MD ma assenti nel sorgente [DA CHIARIRE] ⚠ incompleta
- **Teniamo i mirror Geologica nella sezione PE?**  
  → _(nessuna risposta)_
- **Teniamo il mirror Invio Scheda Palo nella sezione PE?**  
  → _(nessuna risposta)_

## A4 · Regole importate da altri gestori

### A4.1 — Regole importate da altri gestori: teniamo o togliamo? [BLOCCANTE]
- **Tipologia attività UT, valori "VS, AS, Dimensionamento plinto, VS plinto, fattibilità, correzione PE"**  
  → 
  - TIM/FIBERCOP: Tenere
  - TOWERNET: Tenere
  - INWIT: Tenere
  - FASTWEB/VODAFONE: Tenere
  - LEONARDO: Tenere
- **Tipologia attività PE "si compila automaticamente da Incarico/Lavorazione o Progetto" (FASTWEB-VODAFONE non ha il campo Progetto)**  
  → 
  - TIM/FIBERCOP: Tenere
  - TOWERNET: Tenere
  - INWIT: Tenere
  - FASTWEB/VODAFONE: Tenere
  - LEONARDO: Tenere
- **Tecnico PE "possibilità di inserire più tecnici"**  
  → 
  - TIM/FIBERCOP: Tenere
  - TOWERNET: Tenere
  - INWIT: Tenere
  - FASTWEB/VODAFONE: Tenere
  - LEONARDO: Tenere
- **Note su Costo UT ("pagamento di un esterno") e Costo PE ("utile solo se collegato con G7")**  
  → 
  - TIM/FIBERCOP: Tenere
  - TOWERNET: Tenere
  - INWIT: Tenere
  - FASTWEB/VODAFONE: Tenere
  - LEONARDO: Tenere
- **2° Forecast Parere Arpa "compare solo se compilato Ripresentazione Pratica"**  
  → 
  - TIM/FIBERCOP: Tenere
  - TOWERNET: Tenere
  - INWIT: Tenere

## A5 · Formule e campi calcolati

### A5.1 — Forecast Ottenimento Permessi: formula con le integrazioni [BLOCCANTE]
- **I "giorni" sono**  
  → (b) I giorni che mancano al forecast
- **Con più integrazioni si sommano tutti i ritardi?**  
  → No
- **Finché Invio integrazione è vuoto, il forecast resta invariato?**  
  → Sì
- **Il forecast si può modificare a mano?**  
  → Sì
- **LEONARDO: quanti giorni per la SCIA?**  
  → (a) 67
- **LEONARDO: con "Comunicazione" il forecast è**  
  → Altro: 67 gg

### A5.2 — Protocollo autocertificazione: ">= 67" [BLOCCANTE] ⚠ incompleta
- **La condizione corretta è**  
  → Altro: Il campo calcolato è un riferimento deprecato. L'inserimento della data è manuale e non è previsto un alert associato.
- **Chi riceve l'alert?**  
  → Altro: nessuno, vedi prima.
- **L'alert si chiude**  
  → _(nessuna risposta)_
- **Va aggiunto alla tabella alert della Guida §17.10?**  
  → No
- _Note:_ per A5.3, vedi nota A5.2

### A5.3 — Forecast PSC si calcola da se stesso [BLOCCANTE]
- **Il valore predefinito corretto è**  
  → (d) Nessuno: il campo è manuale

### A5.4 — Comportamento dei campi calcolati [DA CHIARIRE] ⚠ incompleta
- **I campi calcolati sono**  
  → _(nessuna risposta)_
- **Il Committente compilato in automatico è fisso, non modificabile?**  
  → _(nessuna risposta)_
- **"Di base viene inserita la data del giorno" (Incarico PE, Incarico VS/AS): la data si scrive**  
  → _(nessuna risposta)_
- **I calcoli e gli alert usano giorni di calendario?**  
  → _(nessuna risposta)_

## A6 · Stato attività, completamento, Fatturabile

### A6.1 — "Stato attività" non esiste come campo [BLOCCANTE]
- **Stato attività è**  
  → (a) Un unico campo per pratica, nell'intestazione
- **Il dominio è quello di 12 valori della Guida §14, uguale per tutti i clienti?**  
  → Sì
- **REALIZZATO scatta con "Data FL"?**  
  → Sì
- **Per ogni stato automatico indica il campo che lo fa scattare, cliente per cliente (PROTOCOLLATO, AUTORIZZATO/DINIEGATO/TAR, INTEGRAZIONE RICHIESTA, ASSEGNATO, IN LAVORAZIONE).**  
  → * PROTOCOLLATO: attivato da 'Protocollo' all'inizio della sezione 'Iter autorizzativo'.
* AUTORIZZATO / DINIEGATO / TAR: segue la regola valida per TOWERNET/INWIT. Non è applicato nei gestori in cui non compare.
* INTEGRAZIONE RICHIESTA: per Fastweb-Vodafone non è applicato.
* ASSEGNATO: quella corretta per ILIAD è Data Assegnazione F026
*  IN LAVORAZIONE:
- **Una modifica manuale dello stato**  
  → (b) Viene sovrascritta dal prossimo evento automatico

### A6.2 — Completamento della pratica [BLOCCANTE]
- **Lo stato attuale dell'app viene**  
  → (a) Sostituito da Stato attività
- **Il completamento riguarda**  
  → (a) La pratica intera
- **Chi può completare?**  
  → il PM con ruolo di leader (vedi allegato per riferimento)
- **Esiste un "Passa" di ritorno verso il PM?**  
  → No

### A6.3 — Fatturabile: regola automatica [BLOCCANTE]
- **Per LEONARDO vale**  
  → Altro: Estendere i campi riferiti ad Arpa anche a Leonardo, seguendo il posizionamento consolidato negli altri gestori.
- **LEONARDO con All. 18 = SI, quando il percorso Permessi scompare:**  
  → Altro: non chiaro.
- **Per le lavorazioni senza iter Permessi o ARPA (VS, PE, Caratterizzazione), Fatturabile è solo manuale?**  
  → Sì
- **L'automatismo scrive**  
  → (b) Anche "NO"
- **Dopo l'automatismo il PM può modificare il valore?**  
  → Sì
- **TOWERNET: Autorizzazione finale = KO imposta Stato attività = KO?**  
  → Sì
- **Servono in dashboard i flag G7 "Lavorato" (per team) ed "Eseguito" (per pratica) citati nel Check?**  
  → No

### A6.4 — Fatturato e Stato ODA "FATTURATO"; id_flusso dei campi trasversali [DA CHIARIRE] ⚠ incompleta
- **FASTWEB-VODAFONE: con Stato ODA = FATTURATO, il campo Fatturato va impostato in automatico a SI?**  
  → _(nessuna risposta)_
- **In ILIAD Fatturabile e Fatturato hanno id_flusso F104/F105, ma la Guida dice che i campi trasversali non consumano id_flusso. Li togliamo e rinumeriamo?**  
  → _(nessuna risposta)_

## A7 · Alert e notifiche

### A7.1 — Ambito degli alert WT8 [BLOCCANTE]
- **Questi alert valgono per**  
  → (a) Tutti e 6 i clienti

### A7.2 — Destinatari, giorni, risoluzione degli alert [BLOCCANTE] ⚠ incompleta
- **Destinatario predefinito**  
  → (c) PM della pratica
- **Destinatari per regola, se diversi dal predefinito**  
  → 
  - Forecast UT: PM + team owner
  - Forecast PE: PM + team owner
  - Forecast AIE: PM + team owner
  - Invio CDMS: PM + team owner
  - Offerta → ODA: PM + team owner
  - Sopralluogo / verbale: PM + team owner
- **Le soglie si contano in giorni**  
  → _(nessuna risposta)_
- **Un alert si può risolvere a mano? Se sì, da chi?**  
  → (b) Sì (indica chi)
- **In che giorno e a che ora partono i reminder settimanali?**  
  → _(nessuna risposta)_
- **Le soglie le configura**  
  → (b) L'admin, per cliente
- **Forecast UT e Forecast AIE: le Note dicono "alert/mail". Si manda**  
  → (b) In-app + mail
- **Se un campo è nascosto da una regola di sezione, l'alert che lo riguarda va soppresso? (es. Invio verbale con Incarico = Caratterizzazione in INWIT)**  
  → No
- _Note:_ Rispetto ad A7.2.4: dai team leader (vedi allegato)

### A7.3 — Campi di chiusura ambigui [BLOCCANTE]
- **ILIAD, alert Offerta → ODA: da quale campo parte?**  
  → (a) F099 "Invio Offerta" (data, Fatturazione)
- **ILIAD: F043 e F098 sono lo stesso dato?**  
  → No
- **ILIAD, reminder CDMS: si chiude con**  
  → (a) EM data (come dice la Guida)
- **ODA ripetibile: l'alert si chiude quando c'è almeno un ODA?**  
  → No
- **FASTWEB-VODAFONE: il trigger 1 (DA RICHIEDERE) si chiude quando lo stato è diverso da DA RICHIEDERE?**  
  → Sì
- **FASTWEB-VODAFONE: il trigger 2 (DA RICHIEDERE / RICHIESTI) si chiude con**  
  → (a) Stato PRESENTI o FATTURATO
- **FASTWEB-VODAFONE: lo Stato ODA è uno solo per pratica anche con più ODA?**  
  → Sì
- **ILIAD, Protocollo AIE di collaudo ("valutare alert"): serve un alert?**  
  → (a) No

## A8 · Permessi, passaggi tra team, perimetro

### A8.1 — Team [BLOCCANTE]
- **Confermi i 4 team PM/Permessi, AIE, UT+PE e DL?**  
  → No
- **Gli utenti oggi nei team "PM" e "PM/Permessi" vanno uniti in PM/Permessi?**  
  → No
- **Etichetta del team DL**  
  → (a) Direzione Lavori
- _Note:_ vedi allegato per nuova suddivisione e gerarchia team.

### A8.2 — Matrice autorizzativa [BLOCCANTE]
- **Va bene il modello utente → più coppie (cliente, team, ruolo)?**  
  → Sì
- **Le eccezioni individuali (Maragno, Sandrini) si gestiscono**  
  → (b) Con un'eccezione sul singolo utente
- **Chi sono gli admin?**  
  → vedi allegato per nuova gerarchia e schema ruoli.
- **Un team può modificare i propri campi prima di aver ricevuto il "Passa"?**  
  → No
- **La visibilità è filtrata per committente? Il Check dice che su ILIAD tutti vedono tutto "a prescindere dalla committenza".**  
  → (a) No
- **Il team DL crea pratiche**  
  → (a) In tutti i clienti
- **La pratica creata dal DL entra in automatico nella dashboard del PM?**  
  → Sì

### A8.3 — Assegnazione, card, notifiche [DA CHIARIRE] ⚠ incompleta
- **L'assegnazione esplicita a UT, PE e AIE (§17.5) è**  
  → _(nessuna risposta)_
- **La mail di assegnazione va**  
  → _(nessuna risposta)_
- **Le card dei team non ancora coinvolti sono**  
  → _(nessuna risposta)_
- **Notifica al team DL quando il PM assegna il PE (le Note la citano per LEONARDO)**  
  → _(nessuna risposta)_
- **Nel "Passa" serve poter scegliere tra chat e mail (Note r.78)?**  
  → _(nessuna risposta)_

### A8.4 — Perimetro del primo rilascio [DA CHIARIRE] ⚠ incompleta
- **Quali KPI servono nel primo rilascio?**  
  → _(nessuna risposta)_
- **Colonne dell'export CSV**  
  → _(nessuna risposta)_
- **L'assistente AI è**  
  → _(nessuna risposta)_
- **Chi fornisce le "liste G7" di clienti, committenti e proprietà (Note r.37), e in che formato?**  
  → _(nessuna risposta)_
- **La configurazione dei menu è**  
  → _(nessuna risposta)_
- **Storico dei valori: basta registrare il valore vecchio e quello nuovo a ogni modifica?**  
  → _(nessuna risposta)_
- **Per quanto tempo si conserva lo storico?**  
  → _(nessuna risposta)_
- **La classificazione dei campi del Check (PRIMARIO / SECONDARIO / FACOLTATIVO) è superata dalle sezioni degli MD?**  
  → _(nessuna risposta)_

---

# Parte B — Domande specifiche per gestore

## B1 · ILIAD

### B1.1 — Regole di sezione per Incarico/Lavorazione [BLOCCANTE] ⚠ incompleta
- **Per New Site, Collocato New Site, Collocato Esistente, Demolizione, Ponte Radio e Pacchetto permessi si mostra tutto?**  
  → Sì
- **Con più valori selezionati si mostra**  
  → (a) L'unione delle sezioni previste da ciascun valore
- **"PE+VS" e "caratterizzazione + VS" sono valori a sé ma si possono ottenere anche selezionando due valori singoli. Cosa teniamo?**  
  → (a) I valori combinati (niente scelta multipla per questi)
- **Per ogni regola, elenca esattamente i campi visibili, con i nomi come nel documento.**  
  → _(nessuna risposta)_
- **I campi master necessari (Assegnazione UT/PE nella vista PM, flag CARATTERIZZAZIONE, blocco caratterizzazione) restano sempre visibili quando servono?**  
  → Sì
- **La caratterizzazione si attiva da**  
  → (b) Incarico/Lavorazione
- **Il pop-up UT in Fase Preliminare ha la condizione Caratterizzazione = SI?**  
  → No

### B1.2 — Significato di "New Site" con la scelta multipla [BLOCCANTE]
- **"Incarico = New Site" significa**  
  → (b) New Site è l'unico valore selezionato

### B1.3 — Tipologia attività PE (F142) [BLOCCANTE] ⚠ incompleta
- **La regola va invertita? Cioè Progetto se l'incarico non è New Site, altrimenti Incarico.**  
  → No
- **Quali sono i valori del menu?**  
  → _(nessuna risposta)_
- **Con più valori di Incarico**  
  → (c) Si compila a mano
- _Note:_ chiarimento B1.3.1: Tipologia attività PE = valore in 'Progetto'. Se 'Progetto' è vuoto/assente allora è = valore in 'Incarico/Lavorazione'.

### B1.4 — Condizioni del sorgente perse nell'MD [DA CHIARIRE] ⚠ incompleta
- **Ripristiniamo le condizioni del sorgente?**  
  → _(nessuna risposta)_
- **Tutta la sezione AIE va mostrata solo se AIE = SI?**  
  → _(nessuna risposta)_

### B1.5 — Note di dubbio rimaste nel sorgente [DA CHIARIRE] ⚠ incompleta
- **AGORA', "solo se Committente = Cellnex → verificare":**  
  → _(nessuna risposta)_
- **Forecast Protocollo, "dato placeholder": la formula +30 gg è definitiva?**  
  → _(nessuna risposta)_
- **Costo PE, "utile solo se collegato con G7":**  
  → _(nessuna risposta)_

### B1.6 — Numerazione del sorgente [MINORE] ⚠ incompleta
- **I numeri 91 e 132 corrispondono a campi rimossi?**  
  → _(nessuna risposta)_

## B2 · TOWERNET

### B2.1 — Il menu Incarico/Lavorazione ha un solo valore [BLOCCANTE] ⚠ incompleta
- **Elenco completo dei valori di Incarico/Lavorazione**  
  → _(nessuna risposta)_
- **La scelta è**  
  → _(nessuna risposta)_
- **Ci sono sezioni da nascondere in base alla lavorazione?**  
  → _(nessuna risposta)_
- **"Caratterizzazione + VS" attiva solo Assegnazione UT e Note UT, senza blocco di caratterizzazione (la Guida lo esclude per TOWERNET)?**  
  → _(nessuna risposta)_

### B2.2 — "Pop-up AIE → chiedere per AIE congiunte" [DA CHIARIRE] ⚠ incompleta
- **Le AIE congiunte richiedono**  
  → _(nessuna risposta)_

## B3 · TIM / FIBERCOP

### B3.1 — Chi compila Invio PE [BLOCCANTE] ⚠ incompleta
- **Il master è**  
  → (b) Maragno / DL
- **L'occorrenza PM fuori dal pop-up va tenuta?**  
  → _(nessuna risposta)_

### B3.2 — TIM e Fibercop [BLOCCANTE]
- **È un unico cliente TIM/FIBERCOP, con Cliente Finale come attributo?**  
  → No
- **Assistente TIM e Progettista TIM compaiono anche con Cliente Finale = Fibercop?**  
  → Sì
- _Note:_ B3.2.1: Commitente = FIBERCOP; Cliente Finale = TIM, FIBERCOP.

### B3.3 — Campi PM in più [DA CHIARIRE] ⚠ incompleta
- **Le eliminiamo?**  
  → _(nessuna risposta)_

### B3.4 — Campo "Rinforzo" [MINORE] ⚠ incompleta
- **È una richiesta di modifica da applicare?**  
  → _(nessuna risposta)_

## B4 · INWIT

### B4.1 — Regole di sezione per Incarico/Lavorazione [BLOCCANTE] ⚠ incompleta
- **Con Caratterizzazione, Progetto Esecutivo, Verifica Statica, Caratt.+VS e PE+VS vanno nascoste per intero le sezioni Pacchetto Permessi, Iter Autorizzativo e DL, e anche i campi di Fase Preliminare non elencati?**  
  → _(nessuna risposta)_
- **Le regole valgono**  
  → _(nessuna risposta)_
- **Con Progetto Esecutivo e PE+VS il flag PE è**  
  → _(nessuna risposta)_
- **"Deposito sismico" indica**  
  → _(nessuna risposta)_
- **Elenca esattamente i campi di "pop-up PE" e "pop-up UT".**  
  → _(nessuna risposta)_
- **I valori corretti sono quelli del menu a r.46?**  
  → _(nessuna risposta)_
- **"new site raw land" vuol dire Incarico = New Site e Tipologia sito = Raw Land?**  
  → _(nessuna risposta)_

### B4.2 — Blocco di caratterizzazione [BLOCCANTE] ⚠ incompleta
- **Il blocco UT di caratterizzazione va confermato per INWIT?**  
  → _(nessuna risposta)_
- **F025 e F107 sono**  
  → _(nessuna risposta)_

### B4.3 — Forecast Ottenimento Permessi solo per New Site [DA CHIARIRE] ⚠ incompleta
- **Per le altre lavorazioni l'alert sui permessi non è previsto?**  
  → _(nessuna risposta)_

## B5 · FASTWEB / VODAFONE

### B5.1 — Lavorazione "Applicabilità" [BLOCCANTE] ⚠ incompleta
- **Con Incarico = Applicabilità restano visibili solo Core, Dati Secondari, Applicabilità e Invio Applicabilità?**  
  → Sì
- **Restano visibili anche Data assegnazione e Data sopralluogo, che servono agli alert?**  
  → Sì
- **Applicabilità e Invio Applicabilità sono visibili anche con altre lavorazioni?**  
  → Sì
- **Gli altri valori (New Site, Collocato, Demolizione, Ponte Radio, Bonifica, Rewatt, VRUC) nascondono qualcosa?**  
  → _(nessuna risposta)_
- **La scelta è singola?**  
  → _(nessuna risposta)_

### B5.2 — Fastweb e Vodafone [DA CHIARIRE] ⚠ incompleta
- **Sono un unico cliente con le stesse regole?**  
  → _(nessuna risposta)_
- **Cliente Finale ammette anche "Vodafone"? Oggi il sorgente ha solo "Fastweb".**  
  → _(nessuna risposta)_

## B6 · LEONARDO

### B6.1 — All. 18 [BLOCCANTE] ⚠ incompleta
- **Confermi le 4 condizioni?**  
  → _(nessuna risposta)_
- **Ottenimento Permessi**  
  → _(nessuna risposta)_
- **Con All. 18 = SI l'alert su Forecast Ottenimento Permessi va soppresso?**  
  → _(nessuna risposta)_

### B6.2 — Campo mancante "Forecast inizio lavori" [BLOCCANTE] ⚠ incompleta
- **Confermi il campo?**  
  → _(nessuna risposta)_
- **In quale sottosezione?**  
  → (a) PE
- **È diverso da Forecast CIL del DL?**  
  → _(nessuna risposta)_
- **Genera un alert?**  
  → _(nessuna risposta)_

### B6.3 — Oneri [DA CHIARIRE] ⚠ incompleta
- **Oneri è**  
  → _(nessuna risposta)_

### B6.4 — ODA e Stato attività [DA CHIARIRE] ⚠ incompleta
- **ODA è**  
  → _(nessuna risposta)_
- **Serve un alert per ODA mancante?**  
  → _(nessuna risposta)_
- **Stato attività e l'alert Fatturabile/KO valgono anche per LEONARDO?**  
  → _(nessuna risposta)_

### B6.5 — Ordine dei campi UT+PE [DA CHIARIRE] ⚠ incompleta
- **Seguiamo l'ordine del sorgente e confermi la ripartizione dell'MD?**  
  → _(nessuna risposta)_

---

# Parte C — Correzioni minori

## C · Correzioni minori

### C.1 — Correzioni minori: approvazione in blocco [MINORE] ⚠ incompleta
- **Approvi in blocco?**  
  → _(nessuna risposta)_
