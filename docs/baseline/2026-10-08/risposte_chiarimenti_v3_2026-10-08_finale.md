# PracticeHub — Risposte ai chiarimenti finali v3

**Compilato da:** —  
**Data:** —  
**Completamento:** 20/20 questioni

---

## BLOCCANTE

### B1 — Campi calcolati: la regola generale blocca due automatismi (ex v2 C6, v2 C5)
- **Forecast Ottenimento Permessi: lo spostamento per integrazione si applica anche se il campo è già compilato?**  
  → (a) Sì: il forecast si ricalcola (base + durata dell'ultima integrazione) finché nessuno lo modifica a mano; una modifica manuale lo blocca
- **Il controllo "mancano ≤ 15 giorni" si fa**  
  → (a) Una sola volta, quando si compila Invio integrazione: se in quel momento mancano ≤ 15 giorni al forecast base, si sposta (consigliato, deterministico)
- **La formula base "Protocollo + 67 giorni" vale per**  
  → (a) Solo TOWERNET, INWIT e LEONARDO (dove c'è nel sorgente); negli altri il forecast è manuale
- **Fatturabile: quando scattano le condizioni (30 giorni da Ottenimento Permessi, ultimo esito ARPA Positivo), l'automatismo**  
  → (b) Non tocca il campo se il PM l'ha modificato a mano
- **Se dopo il SI arriva un nuovo ciclo ARPA con esito Negativo, Fatturabile torna a NO in automatico?**  
  → Sì
- _Note:_ su B1.1: in corrispondenza del ricalcolo automatico del Forecast Ottenimento Permessi si genera un toast che notifica l'operatore. Questo per non rendere l'automatismo una modifica silenziosa.

### B2 — Chi è "il PM della pratica" (ex v2 I13, A7.2)
- **"Il PM della pratica" è**  
  → (d) I PM leader di quel gestore
- **Se la pratica la crea il DL, chi imposta il PM responsabile?**  
  → (c) Non serve: la premessa è superata, perché il DL non crea pratiche; la creazione è riservata a PM e ADMIN

### B3 — CREATA, ASSEGNATO e il comando "Assegna" (ex v2 B4, v2 C2, v2 C3)
- **Da CREATA ad ASSEGNATO si passa**  
  → (a) Quando si compila la Data assegnazione (Fase Preliminare)
- **Una nuova iterazione (Ripresentazione totale) parte da CREATA?**  
  → Sì
- **Il nuovo nome vale solo per il comando, mentre i campi restano "Assegnazione UT / PE / AIE" e "Data assegnazione"?**  
  → Sì

### B4 — Stato attività: ordine degli eventi e campi svuotati (ex v2 I18)
- **"Più recente" significa**  
  → (b) La data più recente scritta nei campi trigger, indipendentemente da quando sono stati inseriti
- **Se un campo trigger viene svuotato (es. Protocollo cancellato), lo stato**  
  → (a) Torna all'ultimo evento ancora valido

### B5 — Vincoli e Nome Ente per ILIAD, FASTWEB-VODAFONE e LEONARDO (ex A1.4, v2 M4)
- **Per ILIAD, FASTWEB-VODAFONE e LEONARDO i Vincoli**  
  → (a) Usano la stessa tabella di TIM/TOWERNET/INWIT (10 voci, stati, Ente, creazione automatica della voce Ente)
- **Il vincolo "Vincoli ambientali naturalistici" (Ente: SIC, Natura2000, Altro) vale per**  
  → (a) Tutti i gestori che usano la tabella
- **Se i Vincoli restano senza tabella, Nome Ente in questi tre gestori è**  
  → (a) Un menu configurabile dai team leader (senza compilazione automatica)

### B6 — Assistente AI nel primo rilascio: modello e dati (ex v2 C15)
- **Modello**  
  → (c) Lo decide l'IT / la direzione (indica chi)
- **Ci sono dati che l'assistente non deve mai inviare a un servizio esterno (es. nomi di persone, importi)?**  
  → vedi nota
- **Budget mensile indicativo per l'uso del modello**  
  → vedi nota
- _Note:_ Sul modello e in generale sull'implementazione e aspetti tecnici: chiedere a Massimiliano.

---

## DA CHIARIRE

### C1 — Valore "Altro" con inserimento manuale (ex v2 B1, v2 I28)
- **"Altro" è disponibile**  
  → Decisione finale: su tutti i menu **configurabili**. Nei domini **controllati** non viene aggiunto in modo generico; è ammesso con inserimento manuale solo dove previsto esplicitamente, in particolare `Committente` e `Cliente Finale`. I valori `Altro` già appartenenti a domini specifici (es. Vincoli/Ente) restano valori ordinari del dominio.
- **Il valore inserito con "Altro"**  
  → (a) Resta solo su quella pratica

### C2 — Valori dei campi che vengono nascosti (ex v2 C8)
- **Il valore di un campo nascosto**  
  → (a) Resta salvato ma non si vede, e riappare se la condizione torna vera
- **Nell'export e nei KPI i valori dei campi nascosti**  
  → (a) Si includono

### C3 — LEONARDO: Forecast CIL nella sezione PE (ex v2 C14)
- **Nella sezione PE di LEONARDO**  
  → (a) Resta un mirror in sola lettura di Forecast CIL (master DL), visibile con Deposito sismico = SI

### C4 — Giorni lavorativi: festività e scadenze nel fine settimana (ex v2 C1)
- **Festività considerate**  
  → (a) Solo le festività nazionali italiane
- **Se un alert o un reminder scade in un giorno non lavorativo, parte il primo giorno lavorativo successivo alle 9:00?**  
  → Sì

### C5 — Gruppi senza team leader (ex C2 §7)
- **Se il gruppo non ha team leader per quel gestore, la notifica destinata ai leader va**  
  → (c) A nessuno: resta solo il PM
- **Vincolo finale di configurazione:** ogni gestore attivo deve avere almeno un **PM leader** configurato. La regola "nessun sostituto automatico" continua a valere per gli altri gruppi.

### C6 — Campi "utente": da quale ruolo si pesca (ex A1.6)
- **Conferma il ruolo proposto (le correzioni vanno nella nota)**  
  → 
  - Tecnico PP → Permessi: Confermo
  - Tecnico AIE → AIE: Confermo
  - Responsabile interno AIE → AIE (Lucera, Gucciardi, Pizzoni, Luo, Lopez da registrare): Confermo
  - Tecnico UT → UT: Confermo
  - VS/AS incaricata da → UT: Confermo
  - Tecnico Caratterizzazione → UT: Confermo
  - Tecnico PE → PE: Confermo
  - PE incaricato da → PE: Confermo
  - Tecnico PSC → PE: Confermo
  - Tecnico deposito sismico → DL: Confermo

### C7 — DL e Core (ex v2 C10)
- **Il DL può modificare il Core**  
  → No: il DL non crea pratiche e vede il Core ereditato in sola lettura; compila soltanto i campi di propria competenza. La creazione di una pratica rimane circoscritta a PM e ADMIN.
- _Note:_ Il DL riceve le pratiche e gli alert previsti dalle regole già consolidate.

### C8 — Alert Offerta → ODA: quale leader lo chiude (ex v2 B5)
- **Chiude l'alert**  
  → (a) Un leader del gruppo PM/Permessi (o l'ADMIN)

### C9 — KPI: definizioni da fissare (ex v2 C15)
- **"Alert scaduti" sono**  
  → (a) Alert ancora aperti oltre la data che li ha fatti scattare (es. oltre il forecast)
- **"Scadenze prossime" guarda in avanti di**  
  → (a) 7 giorni
- **"Tempo da Data assegnazione a TERMINATO" con la Ripresentazione totale si misura**  
  → (b) Sulla pratica intera (dalla prima Data assegnazione all'ultimo TERMINATO)

### C10 — Cancellazione di una pratica (ex P1 §3)
- **Una pratica**  
  → Decisione finale: la possono cancellare `PM` e `ADMIN` solo se ha **una sola iterazione** ed è ancora nello stato `CREATA`. Dopo una Ripresentazione totale non è più cancellabile, anche se la nuova iterazione riparte da `CREATA`.

### C11 — Voce Ente creata dal vincolo: cosa succede se il vincolo cambia (ex A1.4)
- **Se il vincolo non è più "Presente", la voce Ente creata in automatico**  
  → (a) Si elimina se è vuota; se ha dati resta e viene segnalata

### C12 — Committente obbligatorio (ex v2 B1, v2 C7)
- **Committente è obbligatorio alla creazione per tutti i gestori?**  
  → Sì

### C13 — Quando prevale l'MD sul sorgente (ex v2 M3)
- **La nota vale**  
  → (b) In generale: dove MD e sorgente divergono prevale l'MD

---

## MINORE

### M1 — Liste che mancano: chi le compila (ex v2 C15)
- **Per ogni lista**  
  → 
  - Gestore Tenant (tutti): Li inseriscono i team leader
  - Referente (ILIAD, INWIT), Referente Fastweb e RAN Fastweb (FASTWEB-VODAFONE): Li inseriscono i team leader
  - Assistente TIM, Progettista TIM: Li inseriscono i team leader
  - Fornitore PP / Permessi (tutti): Li inseriscono i team leader
  - Fornitore UT, Fornitore PE (tutti, + "Nessuno"): Li inseriscono i team leader
  - Fornitore Caratterizzazione (ILIAD, INWIT): uguale a Fornitore UT?: Li inseriscono i team leader
  - Tecnico Misure di fondo (tutti): Li inseriscono i team leader
  - Direttore Lavori, Collaudatore (tutti): Li inseriscono i team leader
  - Nome Ente: enti non legati ai vincoli (es. ARPA, Regione…): Li inseriscono i team leader
  - Incarico/Lavorazione TOWERNET: oggi solo "New Site": Li inseriscono i team leader

---

## Interpretazioni applicate
- **J1** — ✅ Confermo  
  _"Passa" diventa "Assegna" ovunque (interfaccia, notifiche, documenti). Le funzioni restano quelle del Passa: verso un gruppo, anche verso più gruppi in una volta, senza bloccare il mittente._
- **J2** — ✅ Confermo  
  _Stato attività: CREATA sostituisce IN LAVORAZIONE ed è impostato in automatico alla creazione. Dominio: CREATA, ASSEGNATO, IN APPROVAZIONE, PROTOCOLLATO, INTEGRAZIONE RICHIESTA, AUTORIZZATO, DINIEGATO, TAR, REALIZZATO, TERMINATO, STAND-BY, KO._
- **J3** — ✅ Confermo  
  _Stato ODA (FASTWEB-VODAFONE) = DA RICHIEDERE, RICHIESTI, PRESENTI. Il trigger 2 dell'alert ODA si chiude con PRESENTI._
- **J4** — ✅ Confermo  
  _Completare una pratica = impostare TERMINATO (PM e ADMIN). Non c'è un comando separato e non serve essere PM leader: l'eccezione di I12 non esiste più._
- **J5** — ✅ Confermo  
  _Codice G7 non è univoco: una rilavorazione o una nuova iterazione possono avere lo stesso G7 o uno nuovo. Pratiche, iterazioni e rilavorazioni si identificano solo con ID interni. Se l'import trova più pratiche compatibili con la stessa riga, chiede di scegliere a mano._
- **J6** — ✅ Confermo  
  _Template: lo decide il Cliente Finale (ILIAD/WIND 3/ZEFIRO → ILIAD; Inwit → INWIT; TowerNet → TOWERNET; TIM/Fibercop → TIM/FIBERCOP; Vodafone → FASTWEB-VODAFONE; Leonardo → LEONARDO). Con Cliente Finale = FASTWEB: Committente Fastweb → FASTWEB-VODAFONE, altrimenti ILIAD. Con "Altro" o una combinazione ambigua, chi crea la pratica sceglie il template a mano._
- **J7** — ✅ Confermo  
  _LEONARDO: il nuovo campo Committente (valore "Leonardo") va nel Core, subito dopo Nome Sito, come negli altri gestori. Committente è precompilato dove il sorgente lo prevede, ma resta modificabile._
- **J8** — ✅ Confermo  
  _Ripresentazione totale: la avviano PM leader e ADMIN, solo su pratiche non archiviate. Nella nuova iterazione le sezioni operative ripartono vuote, Fatturabile torna a NO, Fatturato si azzera, Note Operative resta e i gruppi già abilitati restano abilitati._
- **J9** — ✅ Confermo  
  _Rilavorazione: la avviano PM o ADMIN anche se la pratica di origine è ancora aperta. Si registra un riferimento esplicito alla "pratica di origine". L'import non sovrascrive i campi già compilati._
- **J10** — ✅ Confermo  
  _Alert in giorni lavorativi, formule in giorni di calendario (Forecast Geologica +15, Protocollo +67, Forecast Protocollo +30, Scadenza permessi +12 mesi). Reminder e controllo giornaliero degli alert alle 9:00, ora italiana, del giorno di scadenza._
- **J11** — ✅ Confermo  
  _La notifica dell'Assegna va a tutti gli utenti del gruppo destinatario associati a quel gestore, in-app e con mail a ogni Assegna. Gli alert invece vanno al PM e ai team leader (vedi B2, C5)._
- **J12** — ✅ Confermo  
  _La "data del giorno" di Incarico PE e Incarico VS/AS si scrive al momento dell'Assegna verso UT/PE, solo se il campo è vuoto._
- **J13** — ✅ Confermo  
  _Alert Offerta → ODA: dopo la prima settimana manda reminder settimanali finché un leader o l'ADMIN non lo chiude a mano. In una pratica c'è una sola Offerta._
- **J14** — ✅ Confermo  
  _TIM: Invio PE ha master nel gruppo DL; nella sezione PE di UT/PE è un mirror in sola lettura; nella vista PM non compare. L'alert Forecast PE va a PM + leader UT/PE + leader DL. In FASTWEB-VODAFONE Invio PE appartiene a PM/Permessi e l'alert va a PM + leader UT/PE._
- **J15** — ✅ Confermo  
  _Una pratica archiviata è in sola lettura e i suoi alert si fermano. Il ripristino (PM, ADMIN) non cambia lo Stato attività e riattiva gli alert ancora aperti._
- **J16** — ✅ Confermo  
  _Fatturabile vale NO per default e diventa SI 30 giorni dopo Ottenimento Permessi se l'ultimo esito ARPA è Positivo (con le eccezioni di B1). Fatturato è SI/NO solo manuale. All. 18 non c'entra._
- **J17** — ✅ Confermo  
  _INWIT: il blocco caratterizzazione UT esiste. F025 "Invio report caratterizzazione" (PM) diventa un mirror di F107 (master UT)._
- **J18** — ✅ Confermo  
  _Il blocco Geologica sta sempre nella sezione PM "Progettazione esecutiva", in tutti i gestori. La regola del vincolo idrogeologico che lo spostava in Fase Preliminare è eliminata._
- **J19** — ✅ Confermo  
  _TIM: Rinforzo (SI/NO) si aggiunge al Core nella stessa posizione di ILIAD (dopo Altezza traliccio / Tipologia Struttura)._
- **J20** — ✅ Confermo  
  _Si tengono i mirror Geologica e Invio Scheda Palo nella sezione PE (TIM, LEONARDO, TOWERNET, INWIT)._
- **J21** — ✅ Confermo  
  _Il vincolo si chiama "Vincoli ambientali naturalistici"; SIC, Natura2000 e Altro sono i valori del suo campo Ente._
- **J22** — ✅ Confermo  
  _Gli stati possibili dipendono dal vincolo. Monumentale, archeologico, aeroportuale, idrogeologico e fasce di rispetto: Presente / Assente / Non pertinente. Paesaggistico e parco: Presente / Assente / Assolto. Altro: tutti e quattro._
- **J23** — ✅ Correzione definitiva  
  _`Incarico/Lavorazione` è a scelta singola in tutti i gestori. `Tipologia attività PE` si valorizza automaticamente con il valore di `Progetto` quando il campo esiste nel template ed è valorizzato; se `Progetto` è vuoto o non è presente nel template, `Tipologia attività PE` assume il valore di `Incarico/Lavorazione`._
- **J24** — ✅ Confermo  
  _La sezione Fase AIE è visibile al gruppo AIE dopo l'Assegna, qualunque sia il flag AIE._
- **J25** — ✅ Confermo  
  _"Fastweb" e "Vodafone-fastweb" diventano "Fastweb-Vodafone" in Proprietà/Host. Fornitore UT, Fornitore PE e Tecnico PE prevedono il valore "Nessuno"._
- **J26** — ✅ Confermo  
  _FASTWEB-VODAFONE: resta la condizione "SR INWIT compare solo se Proprietà/Host = Inwit", perché dipende da un dato e non da Incarico._
- **J27** — ✅ Confermo  
  _L'export CSV richiede di filtrare un gestore e contiene le colonne del suo template._
- **J28** — ✅ Confermo  
  _Storico: per ogni modifica si registrano valore vecchio, valore nuovo, autore e data, senza limite di conservazione. Le iterazioni restano tutte consultabili._

---

**Riepilogo:** 6 bloccanti · 13 da chiarire · 1 minori (totale 20).

---

## Addendum finale — controllo di coerenza del 08/10/2026

Le seguenti decisioni chiudono i residui emersi dal controllo finale di coerenza e prevalgono su formulazioni precedenti incompatibili.

### Master / mirror
- **B1:** `Riduzione`, `Approvazione Riduzione`, `Invio AIE` e `Approvazione AIE` hanno master operativo **AIE**; le occorrenze PM/Permessi sono mirror in sola lettura con lo stesso `id_flusso`. In ILIAD lo stesso principio vale anche per `Invio CEM`.
- **B2:** `Forecast AIE` ha master **PM/Permessi** in tutti e sei i gestori; l'occorrenza AIE è mirror in sola lettura con lo stesso `id_flusso`.
- **B3:** in TIM/FIBERCOP e FASTWEB-VODAFONE `Assegnazione UT` e `Note Assegnazione UT` hanno master PM/Permessi in **Fase Preliminare**; le precedenti occorrenze duplicate PM nella sezione `Ufficio Tecnico / Progettazione Esecutiva` vengono eliminate. Il mirror UT+PE resta in sola lettura.
- **B4:** `Invio AS/VS` ha master operativo **UT**. In TIM/FIBERCOP e FASTWEB-VODAFONE anche l'occorrenza PM/Permessi in `Fase Preliminare` è un mirror in sola lettura.

### Regole trasversali
- **C1:** i valori dei campi nascosti per condizione restano memorizzati, sono inclusi nell'export e continuano a concorrere ai KPI.
- **D1:** `Altro` con inserimento manuale è disponibile su tutti i menu configurabili. Nei domini controllati non si aggiunge genericamente; è ammesso solo dove previsto esplicitamente, in particolare `Committente` e `Cliente Finale`. I valori `Altro` già appartenenti a uno specifico dominio restano valori ordinari del dominio.
- **D2:** una pratica è cancellabile solo da PM o ADMIN, solo se è `CREATA` e possiede **una sola iterazione**.
- **D3:** ogni gestore attivo deve avere almeno un **PM leader** configurato; per gli altri team non viene scelto automaticamente un sostituto se manca il leader.

### Autorizzazioni, alert e statistiche
- Ruoli applicativi: `PM`, `Permessi`, `UT`, `PE`, `AIE`, `DL`, `ADMIN`; `ADMIN` è supervisore globale. Un utente può avere più associazioni `(cliente, gruppo, ruolo)`.
- Prima dell'`Assegna`, un gruppo non può modificare i propri campi operativi.
- Archiviazione: `PM`, `DL`, `ADMIN`, solo con `Stato attività = TERMINATO` o `KO`; destinazione `Storico / Archivio`. Ripristino: `PM` e `ADMIN`. Modifica manuale dello Stato attività: `PM` e `ADMIN`.
- Statistiche e carichi di tutti i gruppi: `PM` e `ADMIN`; carichi del proprio gruppo: team leader.
- Le soglie degli alert sono configurabili dall'`ADMIN` per gestore; i valori documentati costituiscono la baseline/default.
- La risoluzione manuale di un alert, quando prevista o consentita, è riservata ai team leader competenti e all'`ADMIN`; le condizioni di chiusura automatica restano valide.
- Gli alert `Forecast UT` e `Forecast AIE` inviano sia notifica in-app sia mail.
- Quando il PM esegue `Assegna` verso **PE**, viene notificato anche il gruppo **DL** dello stesso gestore, per tutti i gestori.

### Pulizia documentale
- La precedente denominazione del comando è `Passa`, non `Assegna`.
- Le note `id_flusso da assegnare` su `Invio CEM` sono obsolete: gli ID correnti sono già consolidati.

