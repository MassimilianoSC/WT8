# PracticeHub — Decisioni consolidate (base per lo sviluppo)

**Aggiornato al:** 07/10/2026, con le risposte v2
**Scopo:** raccogliere in un solo punto tutte le decisioni prese dopo la Guida v8, così lo sviluppo parte da qui e non deve ricostruirle dai singoli documenti.
**Questioni ancora aperte:** `DOMANDE_CHIARIMENTI_v3.html`. Le voci che dipendono da una domanda v3 sono marcate ⏳ con l'ID della domanda.
**Liste dei menu:** `LISTE_VALORI_INIZIALI.csv` + `LISTE_VALORI_REPORT.md`.

## Fonti e precedenza

Quando due fonti sono in conflitto, prevale quella più alta in questo elenco:

1. **Risposte v2** (`risposte_residue_v2_2026-10-07 (2).md`), comprese le interpretazioni confermate o corrette. Indicate come `[v2 …]`.
2. **Chiarimenti del collaboratore del 06/10** (C2, C3) e **prompt del 06/10** (P1, le nove direttive).
3. **Risposte v1** (`risposte-parziali/…2026-10-05 (2).md`). Indicate come `[R …]`.
4. **Guida v8, file `ASSOCIAZIONI_CAMPI_<CLIENTE>.md`, documenti `Organizzazione Campi`.** Se un file MD e il suo sorgente divergono vale il sorgente, salvo le eccezioni dichiarate (⏳ v3 C13).

---

## 1. Visibilità

| # | Decisione | Fonte |
|---|---|---|
| 1.1 | **Nessuna** condizione di visibilità dipende da Incarico/Lavorazione, né per le sezioni né per i singoli campi. Ogni template mostra tutte le sue sezioni e tutti i suoi campi. | P1 §1, C2 §1 |
| 1.2 | Incarico/Lavorazione resta un dato della pratica, **a scelta multipla in tutti i gestori**, e alimenta la derivazione di Tipologia attività PE. | C2 §1, [v2 C9] |
| 1.3 | Nelle condizioni composte si toglie la parte che dipende da Incarico. Rilievi topografico e georadar, Invio Scheda Palo, Scheda Scarichi palo, Ricezione Esecutivo Palo: resta solo **Tipologia sito = Raw Land**. | C2 §1, [v2 I5] |
| 1.4 | **Invio AS/VS** è sempre visibile e chiude l'alert Forecast UT. | C2 §1 |
| 1.5 | **Caratterizzazione ILIAD:** il blocco è sempre visibile. **INWIT:** il blocco caratterizzazione UT esiste; F025 è un mirror di F107, che ha master UT. | C3 §3, [v2 C13] |
| 1.6 | **Geologica:** il blocco non ha condizioni di visibilità e sta **sempre nella sezione PM "Progettazione esecutiva"**. La regola che lo spostava in Fase Preliminare con il vincolo idrogeologico è eliminata. Il flag Geologica è informativo e si aggiunge a TOWERNET e INWIT. | C3 §4, [v2 C11], [v2 I6] |
| 1.7 | Condizioni che restano, perché basate su dati diversi da Incarico: AIE = SI · Deposito sismico = SI, **inclusi** Forecast Deposito Sismico e Data deposito sismico · Regione = Piemonte (Tecnico **e** Stato misure di fondo) · Regione = Liguria (ILIAD F057–F064) · Revit · MW · CARATTERIZZAZIONE (F042) → Invio e Conferma offerta · CELLNEX → CDMS, Invio CDMS, **AGORA'** · CONSORZIO (ERICSSON) → WCN · Traliccio → Altezza traliccio · PSC · All. 18 (4 campi LEONARDO; Ottenimento Permessi resta visibile) · Proprietà/Host = Inwit → SR INWIT (FASTWEB-VODAFONE) · campi "compare se compilato". | [v2 I7], [v2 C8], [v2 C14], [v2 C16] |
| 1.8 | Se la condizione è falsa il campo è **nascosto**. ⏳ v3 C2: cosa succede al valore già compilato. | [v2 C8] |
| 1.9 | La sezione Fase AIE è sempre visibile al gruppo AIE dopo l'Assegna, qualunque sia il flag AIE. | [v2 C8] |
| 1.10 | Le condizioni agiscono solo sull'interfaccia: non disattivano alert, automazioni o master. Aprire o chiudere una sezione è solo un fatto di interfaccia. | P1 §1, [v2 I9] |
| 1.11 | **PE (SI/NO)** c'è in tutti i gestori (si aggiunge a LEONARDO, prima di Assegnazione PE) e condiziona **solo** Assegnazione PE e Note Assegnazione PE. APPROVAZIONE PE è sempre visibile. Un pop-up con soli campi PE compare con PE = SI; un pop-up misto UT+PE è sempre visibile. Il pop-up UT+PE nella vista PM è in sola lettura. | P1 §7, [v2 I8], [v2 I22] |

---

## 2. Ruoli, gruppi, permessi

| # | Decisione | Fonte |
|---|---|---|
| 2.1 | **Ruoli:** PM, Permessi, UT, PE, AIE, DL, ADMIN. **Gruppi:** PM/Permessi, UT/PE, AIE, DL. | P1 §2 |
| 2.2 | Dentro un gruppo, i due ruoli vedono e modificano tutti i campi del gruppo; le diciture "compilato da …" non sono vincoli. Tra gruppi diversi master e mirror restano. Il controllo avviene tramite audit. | C3 §2, [v2 I10] |
| 2.3 | Ogni utente ha più coppie (cliente, gruppo, ruolo). I team leader li nomina l'ADMIN. La visibilità delle pratiche non è filtrata per committente. | [R A8.2], [v2 I11] |
| 2.4 | Il comando **"Passa" si chiama "Assegna"**, con le stesse funzioni: si assegna a un gruppo (anche a più gruppi insieme), il mittente non viene bloccato, prima dell'Assegna il gruppo non modifica i propri campi, l'assegnazione a UT, PE e AIE avviene con lo stesso comando, completo dei dati di assegnazione. | [v2 C2] |
| 2.5 | Non esiste un'Assegna "di ritorno" al PM. Una pratica creata dal DL è subito visibile a PM/Permessi. Il DL può modificare il Core solo in fase di creazione (⏳ v3 C7: fino a quando). AIE e UT/PE vedono Core e Dati Secondari in sola lettura. | [R A6.2], C2 §4, [v2 C10] |

### Matrice dei permessi
| Azione | Chi |
|---|---|
| Avviare una pratica o una **rilavorazione** | PM, DL, ADMIN |
| Avviare una **Ripresentazione totale** | **PM leader**, ADMIN (solo su pratiche non archiviate) |
| Assegna | PM, Permessi, AIE, UT, PE, DL, ADMIN |
| Modificare lo Stato attività a mano (anche **completare = TERMINATO**) | PM, ADMIN |
| Archiviare (con stato TERMINATO o KO) | PM, DL, ADMIN |
| Ripristinare dall'Archivio | PM, ADMIN |
| Statistiche e carichi di tutti i gruppi | PM, ADMIN |
| Carichi del proprio gruppo | team leader |
| Configurazione (per gruppo e per gestore) | team leader del gruppo, ADMIN |
| Risolvere a mano un alert | team leader competenti, ADMIN |
| Cancellare una pratica | ⏳ v3 C10 |

---

## 3. Identità, template, iterazioni

| # | Decisione | Fonte |
|---|---|---|
| 3.1 | Pratiche, iterazioni e rilavorazioni hanno **ID interni**. **Codice G7 non è univoco:** una rilavorazione o un'iterazione possono avere lo stesso G7 o uno nuovo. G7 è solo numerico. | C2 §2, [v2 B3], [v2 I27] |
| 3.2 | **Template:** si ricava dal Cliente Finale (ILIAD/WIND 3/ZEFIRO → ILIAD; Inwit → INWIT; TowerNet → TOWERNET; TIM/Fibercop → **un solo** template TIM/FIBERCOP; Fastweb/Vodafone → **un solo** template FASTWEB-VODAFONE; Leonardo → LEONARDO). Con Cliente Finale = FASTWEB: Committente Fastweb → FASTWEB-VODAFONE, altrimenti ILIAD. Con "Altro" o una combinazione ambigua, **chi crea la pratica sceglie il template a mano**. | [v2 B1] |
| 3.3 | **Committente** in LEONARDO: campo nuovo (valore Leonardo). Committente e Cliente Finale hanno l'opzione "Altro" con inserimento manuale. Committente precompilato ma modificabile. ⏳ v3 C12: obbligatorio per tutti? | [v2 B1], [v2 C6] |
| 3.4 | **Ripresentazione totale:** nuova iterazione della stessa pratica, con storico intatto. Le sezioni operative ripartono vuote. Core e Dati Secondari si ereditano, tranne G7, ODA, Note ODA e Stato ODA. **Note Operative resta**; **Fatturabile e Fatturato si azzerano**. Lo Stato attività riparte (⏳ v3 B3: da CREATA?). I gruppi già abilitati **restano abilitati**. Gli alert riguardano l'iterazione corrente. Non si avvia su pratiche archiviate. | P1 §9, C2 §2, [v2 B2] |
| 3.5 | **Rilavorazione:** nuova pratica con un **riferimento esplicito alla "pratica di origine"** e lo stesso Codice Sito. La pratica di origine non deve per forza essere chiusa. Duplicando il Core si escludono ODA, Note ODA e Stato ODA. Non c'è un'entità Sito. | [v2 B3], [R A1.7] |
| 3.6 | **Import:** chiave G7 + Codice Sito + Nome Sito. Un G7 nuovo con un sito esistente crea una nuova pratica (rilavorazione). L'import **non sovrascrive** i campi già compilati. Se la riga è compatibile con più pratiche, chiede di scegliere a mano. I dati attuali dell'app si azzerano. | [v2 B3], [R A1.8] |
| 3.7 | **Ripresentazione ARPA:** gruppo ripetibile senza limite; conta l'ultimo esito. | [R A1.3] |

---

## 4. Modello dei campi

| # | Decisione | Fonte |
|---|---|---|
| 4.1 | La chiave comune a tutti i clienti è l'etichetta della Matrice resa univoca; l'id_flusso resta per cliente. Rinomine: "Data deposito sismico", "EM data" / "EM %". | [R A1.1] |
| 4.2 | Gruppi ripetibili senza limite: Tenant · Integrazione · Ente · ODA · Ciclo ARPA · Vincoli. In una pratica c'è **una sola Offerta**. | [R A1.2], [v2 B5] |
| 4.3 | **Vincoli** (TIM, TOWERNET, INWIT): 10 voci più "Vincoli ambientali naturalistici" (TOWERNET, INWIT; Ente: SIC, Natura2000, Altro). Gli stati dipendono dal vincolo. Il campo Ente compare solo con "Presente", precompilato e modificabile. Un vincolo "Presente" crea una voce nel gruppo Ente. ⏳ v3 B5: ILIAD, FASTWEB-VODAFONE, LEONARDO. ⏳ v3 C11: cosa succede se il vincolo cambia. | [R A1.4], [v2 M4] |
| 4.4 | Nome Ente è un menu compilato in automatico dal vincolo. "Altro" permette di inserire un valore a mano (⏳ v3 C1: su quali menu, e se il valore entra in lista). Host diventa "Fastweb-Vodafone". | [R A1.5], [v2 I28] |
| 4.5 | **Utenti registrati:** Tecnico AIE, UT, PE, PP, PSC, Caratterizzazione, deposito sismico, Responsabile interno AIE, VS/AS incaricata da, PE incaricato da (⏳ v3 C6: da quale ruolo). **Liste:** Tecnico Misure di fondo, Referente, Acquisitore, Direttore Lavori, Collaudatore, fornitori. | [R A1.6] |
| 4.6 | Regole ILIAD estese a tutti: valori di Tipologia attività UT, derivazione di Tipologia attività PE (= Progetto; se vuoto, Incarico; con più valori di Incarico si compila a mano), Tecnico PE multiplo, note Costo UT/PE (solo informative). | [R A4.1], [R B1.3] |
| 4.7 | **LEONARDO:** si aggiungono i campi ARPA (stessa struttura di TIM e TOWERNET) e PE. "Forecast inizio lavori" coincide con **Forecast CIL** (⏳ v3 C3: mirror nella sezione PE o eliminato). Oneri a scelta multipla. | [R A6.3], [v2 C14] |
| 4.8 | **TIM:** si aggiunge Rinforzo (SI/NO). Invio PE ha master **DL**; nella sezione PE di UT/PE è un mirror in sola lettura; nella vista PM non compare. **FASTWEB-VODAFONE:** Invio PE appartiene a PM/Permessi. | [v2 M2], [v2 C12] |
| 4.9 | Master e mirror: i campi AIE nella vista PM sono un pop-up in sola lettura (master AIE); Forecast AIE ha master PM; il PM vede i 12 campi DL in sola lettura. Si tengono i mirror Geologica e Scheda Palo nella sezione PE. | [R A3.1], [R A3.2], [v2 M3] |
| 4.10 | **Tipi:** Coordinate = due decimali latitudine/longitudine (WGS84) · N° protocollo e N° sismica = testo · Data Autorizzazione finale = data distinta da Ottenimento Permessi · date in gg/mm/aaaa · i campi con * sono obbligatori **alla creazione**. | [v2 C7] |
| 4.11 | ILIAD: AGORA' compare solo con CELLNEX; Forecast Protocollo = Data assegnazione + 30 gg (definitivo). TOWERNET: le AIE congiunte non richiedono nulla di speciale. | [v2 C16] |

---

## 5. Domini controllati

Valori confermati in [v2 B4]; elenco completo in `LISTE_VALORI_INIZIALI.csv` (tipo `CONTROLLATO`).
- **Stato attività:** CREATA, ASSEGNATO, IN APPROVAZIONE, PROTOCOLLATO, INTEGRAZIONE RICHIESTA, AUTORIZZATO, DINIEGATO, TAR, REALIZZATO, TERMINATO, STAND-BY, KO. *(IN LAVORAZIONE eliminato.)*
- **Stato ODA** (FASTWEB-VODAFONE): DA RICHIEDERE, RICHIESTI, PRESENTI. *(FATTURATO eliminato.)*
- **Autorizzazione finale** (TOWERNET, INWIT): AUTORIZZATO, DINIEGATO, TAR, KO.
- **Tipologia sito:** Raw Land, Roof Top; più Traliccio **solo in ILIAD**.
- SI/NO · Esiti (Positivo/Negativo) · Stati dei vincoli · Committente e Cliente Finale (usati per derivare il template e nelle condizioni) · EM %.

---

## 6. Formule e campi calcolati

| # | Decisione | Fonte |
|---|---|---|
| 6.1 | Regola generale: i campi calcolati sono **modificabili e ricalcolati solo se vuoti**. ⏳ v3 B1: eccezioni per Forecast Ottenimento Permessi e Fatturabile. | [v2 C6] |
| 6.2 | Le **formule** si contano in **giorni di calendario**: Forecast Geologica +15, Protocollo +67, Forecast Protocollo +30, Scadenza permessi +12 mesi. | [v2 C1] |
| 6.3 | **Forecast Ottenimento Permessi:** base Protocollo + 67 (⏳ v3 B1: per quali gestori). Se mancano ≤ 15 giorni al forecast ed esiste una Richiesta integrazione, si sposta di (Invio − Richiesta) dell'**ultima** integrazione (⏳ v3 B1: quando si fa il controllo). Si può modificare a mano. | [v2 C6] |
| 6.4 | "Data del giorno" per Incarico PE e Incarico VS/AS: si scrive al momento dell'**Assegna** verso UT/PE. | [v2 C6] |
| 6.5 | Protocollo autocertificazione: data manuale, senza alert. Forecast PSC: manuale. | [R A5.2], [R A5.3] |

---

## 7. Stato attività, completamento, archivio, fatturazione

| # | Decisione | Fonte |
|---|---|---|
| 7.1 | Stato attività è **unico** per la pratica e sostituisce lo stato attuale dell'app. Gli aggiornamenti automatici restano; una modifica manuale viene sovrascritta dal successivo evento automatico (⏳ v3 B4: ordine degli eventi e campi svuotati). | [R A6.1], C2 §5 |
| 7.2 | Eventi automatici: **CREATA** alla creazione · **ASSEGNATO** con la Data assegnazione (⏳ v3 B3) · **PROTOCOLLATO** con il campo Protocollo dell'Iter autorizzativo · **AUTORIZZATO / DINIEGATO / TAR / KO** dal menu Autorizzazione finale (TOWERNET, INWIT) · **INTEGRAZIONE RICHIESTA** a ogni nuova richiesta (tranne FASTWEB-VODAFONE) · **REALIZZATO** con la Data FL. | [R A6.1], [v2 B4], [v2 I17], [v2 I18] |
| 7.3 | **Completare = impostare TERMINATO** (PM, ADMIN); non c'è un comando separato. Archiviare richiede TERMINATO o KO. Una pratica archiviata è **in sola lettura** e i suoi **alert si fermano**. | [v2 C4] |
| 7.4 | **Fatturabile:** vale **NO per default**; diventa SI 30 giorni dopo Ottenimento Permessi se l'ultimo esito ARPA è Positivo (⏳ v3 B1: rapporto con le modifiche manuali). All. 18 non c'entra. Se lo Stato attività è KO parte un alert al PM. Per le lavorazioni senza iter Permessi si compila a mano. | [v2 C5], [R A6.3] |
| 7.5 | **Fatturato:** SI/NO solo manuale, indipendente dallo Stato ODA. | [v2 C5] |

---

## 8. Alert e notifiche

| # | Decisione | Fonte |
|---|---|---|
| 8.1 | Gli alert WT8 valgono per tutti i gestori, dove i campi coinvolti esistono (compreso Forecast Parere Arpa per LEONARDO). | [R A7.1], [v2 I14] |
| 8.2 | Destinatari: **PM della pratica** (⏳ v3 B2: chi è) + team leader del gruppo che possiede il campo, per Forecast UT, Forecast PE, Forecast AIE, Invio CDMS, Offerta → ODA, Sopralluogo/Verbale; gli alert DL vanno a PM + leader DL. **TIM:** l'alert Forecast PE va a PM + leader UT/PE + **leader DL**. (⏳ v3 C5: gruppi senza leader.) | [R A7.2], C2 §7, [v2 C12] |
| 8.3 | Forecast UT e Forecast AIE generano notifica in-app e mail. Le soglie le configura l'ADMIN per gestore. Gli alert si risolvono a mano solo da parte dei team leader e dell'ADMIN. | [R A7.2], C2 §6 |
| 8.4 | Le **soglie degli alert** si contano in **giorni lavorativi** (⏳ v3 C4: festività). Reminder e controllo giornaliero alle **9:00 ora italiana** del giorno di scadenza. | [v2 C1] |
| 8.5 | **Assegna:** la notifica va a **tutti gli utenti** del gruppo destinatario, con **mail a ogni Assegna**. Quando il PM assegna il PE si notifica anche il gruppo DL, in tutti i gestori. Le card dei gruppi non ancora coinvolti sono visibili ma disattivate. Non c'è la scelta chat/mail. | [v2 C2] |
| 8.6 | **Offerta → ODA:** reminder settimanali finché un team leader o l'ADMIN non chiude l'alert a mano, quando sono arrivati tutti gli ODA (⏳ v3 C8: quale leader). FASTWEB-VODAFONE: il trigger 1 si chiude quando lo stato è diverso da DA RICHIEDERE, il trigger 2 con **PRESENTI**. ILIAD: l'alert parte da F099; il reminder CDMS si chiude con EM data. | [v2 B5], [R A7.3] |

---

## 9. Perimetro del primo rilascio

| # | Decisione | Fonte |
|---|---|---|
| 9.1 | **KPI:** pratiche attive totali · per Stato attività · per gestore · per gruppo o assegnatario · alert attivi · alert scaduti · scadenze prossime · TERMINATE nel periodo · KO nel periodo · tempo medio e mediano da Data assegnazione a TERMINATO (⏳ v3 C9: definizioni). | [v2 C15] |
| 9.2 | **Export CSV** con le colonne del gestore filtrato. | [v2 C15] |
| 9.3 | **Assistente AI** in sola lettura **nel primo rilascio** (⏳ v3 B6: modello e dati). | [v2 C15] |
| 9.4 | **Liste iniziali:** ricavate dai sorgenti (`LISTE_VALORI_INIZIALI.csv`); quelle mancanti sono elencate in `LISTE_VALORI_REPORT.md` (⏳ v3 M1). | [v2 C15] |
| 9.5 | **Storico:** a ogni modifica si registrano valore vecchio, valore nuovo, autore e data, **senza limite di conservazione**. | [v2 C15] |

---

## 10. Correzioni documentali approvate

Tutte quelle di [v2 M1]:
- note superate;
- Campo Universale errato impostato a DA VERIFICARE ed escluso dall'import;
- nomi e ordine delle sezioni allineati ai sorgenti;
- duplicati PM di Assegnazione UT eliminati (TIM, FASTWEB-VODAFONE);
- Fatturabile e Fatturato ILIAD resi campi trasversali senza id_flusso;
- "TITOLO IV*" trattato come refuso;
- rinumerazione degli id_flusso dopo le aggiunte (PE, ARPA e Committente in LEONARDO, flag Geologica in TOWERNET e INWIT, Rinforzo in TIM, vincolo naturalistico);
- refusi della Guida e della Matrice.

ILIAD, numeri 91 e 132: si lascia il buco nella numerazione, senza creare nuove occorrenze [v2 M5].
