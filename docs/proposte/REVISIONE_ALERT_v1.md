# PracticeHub — Revisione avversativa degli alert e del worker v1

Data: 08/10/2026. Incarico: `docs/coordinamento/PROMPT_REVISIONE_ALERT.md`, D-117 e D-131.

## 1. Sintesi

**Difetti: 7 ALTA, 6 MEDIA, 1 BASSA. Giudizio sull'esercizio attuale: no.**

Il catalogo WT8 e il calendario sono sostanzialmente coerenti con la baseline. Restano difetti riprodotti che perdono episodi KO, consentono di chiuderli senza la decisione richiesta, chiedono nuovamente una decisione già presa, duplicano mail con un claim superato, perdono definitivamente mail per guasti SMTP temporanei e consentono scritture con lease scaduta. Il controllo dello stato dell'alert prima del recapito lascia inoltre una finestra nella quale una chiusura già commessa non impedisce l'invio.

Il motore può diventare una base utilizzabile correggendo i rilievi ALTI e collaudando i relativi interleaving. **L'esercizio reale richiede anche il packaging e l'avvio automatico del worker, il replica set di produzione e le misure obbligatorie PR-13…PR-17**, ancora dichiarate da completare. Per questo il giudizio richiesto «si può mettere in esercizio?» è **no**, e non una certificazione implicita delle attività successive al solo B7. Non si propone di riaprire D-134 o di cambiare ambiente.

### Perimetro e prove

- Letti il registro fino a **D-136** (D-136 aggiunta durante la revisione), il contratto, il piano di produzione, Guida §10/§12/§17.10, architettura §6 e revisioni precedenti. Esaminati i file correnti; lo STATO attribuisce la consegna B7 a `5d6e7c5`, senza ricostruzione del checkout. Le correzioni delle revisioni precedenti non sono riproposte come nuovi difetti.
- **Suite server esistente: 26 file, 363 prove superate, nessuna saltata**, compresi transazioni, PATCH, alert, worker e backup. Comando equivalente a `yarn vitest run tests/server`, eseguito con il runner locale Node e una configurazione temporanea che cambia soltanto percorsi/cache, ambiente Node e parallelismo; le prove server dichiarano già l'ambiente Node. Durata: 260,58 s.
- **Suite avversativa aggiuntiva: 17 prove**, con servizi e motori reali; configurazione, sorgente e risultato finale in appendice. Le asserzioni certificano il comportamento difettoso osservato, quindi una prova superata qui non significa comportamento corretto.
- Mongo avviato esclusivamente per questa revisione: container `practicehub-alert-review-20261008-7d9b`, immagine locale `mongo:7`, senza volumi, replica set a un nodo `reviewRs`, **porta 27039 sia sull'host sia nel container**. URI unico `mongodb://127.0.0.1:27039/?directConnection=true`. Tutte le variabili Mongo delle prove puntano a questo server; nessuna connessione alla porta 27017. SMTP_HOST vuoto, mittenti delle riproduzioni finti: nessuna mail reale.
- Prove/cache/log aggiuntivi fuori dal progetto: `C:/Users/mcracchiolo/AppData/Local/Temp/practicehub-alert-review-20261008-7d9b`. Unico file scritto nel progetto: questo rapporto. Nessun messaggio ad altre sessioni. **Deviazione procedurale:** prima di ricevere il contenuto del blocco e conoscere il divieto, era già stato avviato un controllo preliminare `git status --short`; non ha modificato file. Dopo la lettura del blocco non è stato eseguito alcun altro comando git. Quel controllo non è stato usato come evidenza della revisione.

## 2. Difetti, ordinati per gravità

Le ore degli scenari funzionali sono **Europe/Rome**; nelle prove gli istanti terminanti in `Z` sono UTC. Le righe si riferiscono ai file esaminati, con impronte in appendice.

### A-01 — ALTA — Il comando di stato manuale perde ingressi e nuovi episodi KO

**File e riga:** `frontend/src/services/practices-v2/commands.ts:378` e `:382`; confronto degli episodi in `frontend/src/lib/alerts/engine.ts:211` e `:219`.

**Scenario:** INWIT, 08/10/2026 alle 10:00: il PM imposta KO. `changeStato` salva lo stato e il riepilogo, senza riconciliare gli alert: nessun FATTURABILE_KO. Alle 11:00 il PM imposta ASSEGNATO, senza decidere Fatturabile; il job del 09/10 alle 09:00 vede soltanto ASSEGNATO e non crea nulla. **L'episodio KO è perso definitivamente.** Atteso: apertura nella transazione del comando KO e permanenza fino alla decisione su Fatturabile, anche dopo l'uscita da KO.

Secondo caso: un episodio KO già chiuso dalla decisione resta con `resolvedAt = null`; uscita e rientro manuali in KO tra due riconciliazioni non registrano la risoluzione, e il successivo PATCH/job non apre la generazione 2.

**Decisioni violate:** **D-131**, origine manuale inclusa e episodio persistente dopo l'uscita; **D-97**, nuova generazione dopo risoluzione.

**DIMOSTRATO:** **R01** attraversa due comandi reali e il job reale, osservando zero alert; **R01b** attraversa chiusura, uscita, rientro e PATCH, osservando un solo episodio CLOSED.

**Correzione proposta:** eseguire la stessa riconciliazione, con stato definitivo e stesso log/sessione, anche dentro `changeStato`, prima del riepilogo. Registrare le uscite da KO necessarie alla generazione successiva nel momento in cui avvengono.

### A-02 — ALTA — L'endpoint generico chiude FATTURABILE_KO senza decidere Fatturabile

**File e riga:** `frontend/src/services/alerts.ts:128` e `:132`; `frontend/src/lib/engines/access.ts:253`; `frontend/src/data/access-policy.json`, oggetto `alertClose.byRule` (eccezione presente solo per OFFERTA_ODA).

**Scenario:** INWIT in KO, FATTURABILE_KO aperto il 08/10/2026 alle 11:00. Un leader **Permessi** chiama `POST /api/alerts/{id}/close`: riceve 200 e CLOSED/MANUAL; Fatturabile resta NO e `fatturabileManual = false`. L'alert non sollecita più la decisione del PM. Lo stesso bypass è possibile per ADMIN senza scrivere il campo. Atteso: l'episodio si chiude attraverso la decisione autorizzata su Fatturabile, non attraverso la semplice chiusura dell'alert.

**Decisione violata:** **D-131**, «si chiude solo con la decisione manuale del PM su Fatturabile». La facoltà generale D-46 e la forma generica del contratto §8 non cancellano questa condizione successiva e specifica.

**DIMOSTRATO:** **R02**, con alert realmente aperto dalla riconciliazione, chiusura reale da leader Permessi e verifica del documento d'iterazione.

**Correzione proposta:** negare la chiusura generica di FATTURABILE_KO e allineare `canCloseManually` alla stessa regola. Conservare come unico percorso di chiusura la scrittura autorizzata di Fatturabile, incluso NO → NO.

### A-03 — ALTA — La decisione su Fatturabile può creare un alert ancora aperto

**File e riga:** `frontend/src/services/alerts-engine.ts:112–124`; apertura a `:161`; chiamante `frontend/src/services/practices-v2/fields.ts:481`.

**Scenario principale:** 08/10/2026, INWIT; alle 10:00 il PM imposta KO; alle 10:01, prima del job, decide Fatturabile = NO. Non esiste ancora un alert: il ciclo di chiusura controlla solo gli episodi già caricati, poi la riconciliazione vede KO e **apre FATTURABILE_KO**, benché la decisione sia stata appena salvata e il blocco manuale sia attivo. Atteso: nessun episodio pendente per la decisione già resa; eventuale episodio creato per audit deve risultare chiuso nello stesso salvataggio.

La stessa anomalia si verifica senza il comando manuale: PATCH unico INWIT con `F069 = {code:"KO"}`, `F070 = "2026-10-08"` e `{transversal:"fatturabile", value:"NO"}` → stato KO automatico, Fatturabile deciso a mano, alert OPEN. Correggere soltanto A-01 non elimina questo secondo percorso.

**Decisioni violate:** **D-131** e **D-97**, decisione di chiusura nello stesso salvataggio; **D-132 P-10**, snapshot definitivo nella transazione.

**DIMOSTRATO:** **R03b** riproduce la decisione successiva a un ingresso KO; **R03** riproduce KO automatico e decisione nel medesimo PATCH. Entrambe trovano OPEN dopo il commit.

**Correzione proposta:** applicare la decisione manuale anche all'episodio che la riconciliazione identifica o crea in questa operazione. Distinguere la decisione dell'episodio attuale da un blocco manuale ereditato da un episodio precedente.

### A-04 — ALTA — Un claim superato permette ancora l'invio di una mail già SENT

**File e riga:** `frontend/src/lib/jobs/outbox-delivery.ts:76–86`; protezione soltanto dell'esito a `:65–69` e `:97`.

**Scenario:** 08/10/2026 alle 09:00 il worker A prende una mail con lease di un minuto e si blocca **prima di inviare**. Alle 09:02 B riprende il claim scaduto, invia e registra SENT. Alle 09:03 A riparte con il vecchio oggetto e chiama `deliverOne`: destinatario attivo e alert aperto passano i controlli, e **A invia la stessa mail una seconda volta**. Solo l'aggiornamento finale viene rifiutato dal claimToken; il rapporto dice comunque `sent`.

Atteso: A con claim superato/SENT deve essere fermato prima dell'effetto SMTP. Non è il raro doppione accettato da D-90 dopo accettazione SMTP seguita da crash prima di SENT: qui il vecchio worker non aveva ancora tentato l'invio e il nuovo SENT è già persistito.

**Decisioni violate:** **D-97**, presa in carico/lease e fencing; **D-90**, outbox con deduplica degli effetti controllabili; architettura §6.5.

**DIMOSTRATO:** **R07** usa claim e recapito reali, due chiamate al mittente finto e lo stesso Message-ID; la seconda avviene dopo il SENT di B.

**Correzione proposta:** convalidare e rinnovare atomicamente status/claimToken/lease immediatamente prima dell'invio e interrompere il vecchio esecutore se non è più titolare. Limitare la durata dell'invio e gestire il rinnovo della lease durante gli invii lunghi; il solo Message-ID non garantisce deduplica SMTP.

### A-05 — ALTA — Un guasto SMTP temporaneo di poche ore perde definitivamente le mail

**File e riga:** `frontend/src/lib/jobs/outbox-delivery.ts:41`, `:58` e `:88–90`.

**Scenario:** mail FORECAST_UT prevista l'08/10/2026 alle 09:00, destinatario attivo e alert ancora aperto. SMTP risponde 451 per una manutenzione dalle 09:00 alle 12:00. Con i default, i tentativi sono circa alle 09:00, 09:01, 09:03, 09:07, 09:15, 09:31, 10:03 e 11:07; l'ottavo errore porta a FAILED. Alle 12:00 SMTP torna disponibile, ma `claimNext` seleziona soltanto PENDING/SENDING: **la mail non partirà più**, nemmeno il giorno dopo. FORECAST_UT non ha reminder sostitutivi.

**Decisioni violate:** **D-90**, recapito almeno una volta («una perdita no»); **D-46**, mail obbligatoria per UT/AIE. Il numero finito di tentativi prima di una perdita permanente non è una deroga deliberata nel registro.

**DIMOSTRATO:** **R08** genera otto errori 451 con backoff ridotto a zero per la prova, trova FAILED/attempts=8 e verifica zero invii dopo il ripristino del mittente. La durata reale indicata sopra deriva dal backoff predefinito del sorgente.

**Correzione proposta:** mantenere ritentabili gli errori temporanei, con attesa limitata e avviso dopo una soglia. Per errori permanenti prevedere un percorso esplicito e verificabile di segnalazione/ripresa, senza rendere invisibile una mail obbligatoria ancora dovuta.

### A-06 — ALTA — Il fencing accetta scritture dopo la scadenza usando l'ora congelata dell'operazione

**File e riga:** `frontend/src/services/alerts-job.ts:92`, `:119` e `:121`; predicato `frontend/src/lib/jobs/lock.ts:63`; ora fissata in `frontend/src/lib/store/transaction.ts:92` e `:110`.

**Scenario:** 08/10/2026 alle 09:00 `processPractice` riceve l'ora T e una lease fino alle 09:10. Un blocco o un retry del driver rinvia il callback alle 09:11 senza takeover. `assertFence(ctx, lock, ctx.now)` cerca `leaseUntil >= T`, quindi passa; il job aggiorna Fatturabile, revisione, storico e riepilogo **con lease già scaduta**. Atteso: la scrittura si ferma e il lavoro viene ripreso con una lease valida. L'ora funzionale di apertura/storico può restare stabile nei retry; l'ora che autorizza la lease deve essere corrente.

**Decisione violata:** **D-97**, worker con lease e fencing in ogni commit; architettura §6.4. Il confronto di token protegge un takeover già avvenuto, ma non rende valida una lease scaduta.

**DIMOSTRATO:** **R10** acquisisce una lease reale di 300 ms, rallenta di 550 ms la prima lettura di deduplica dopo la cattura dell'ora e poi lascia eseguire Mongo e il servizio reale. Fatturabile passa NO → SI e la ricevuta viene commessa dopo la scadenza. `assertFence` con l'ora corrente sullo stesso handle rifiuta correttamente. La prova non simula un takeover: isola la scadenza senza nuovo proprietario.

**Correzione proposta:** leggere l'ora corrente per il controllo di fencing dentro ogni tentativo del callback, separandola da `ctx.now`, e ricontrollare/rinnovare la lease prima del commit dei lavori lunghi. Non congelare l'autorizzazione temporale insieme all'ora funzionale dell'operazione.

### A-07 — ALTA — Una chiusura commessa dopo il controllo preliminare non impedisce la mail

**File e riga:** `frontend/src/lib/jobs/outbox-delivery.ts:80` e `:86`; `frontend/src/services/alerts-job.ts:182–186`; chiusura `frontend/src/services/alerts.ts:130–144`.

**Scenario:** 08/10/2026 alle 10:01, outbox FORECAST_UT pronta. Il controllo legge OPEN/ACTIVE; prima della chiamata al mittente, ADMIN chiude l'alert e la transazione commette CLOSED. Il worker continua con il risultato del controllo precedente e invia. **Al momento di entrare nel mittente la chiusura è già persistita**, ma la mail parte e risulta SENT. Atteso: una chiusura che precede l'inizio dell'affidamento SMTP deve impedire il recapito.

**Decisioni violate:** **D-97**, chiusure e autorizzazione dell'outbox; architettura §6.5. Il limite accettato nel progetto riguarda la mail già affidata a SMTP prima della chiusura, non questo ordine inverso. Lo stesso intervallo è possibile per sospensione o ripresentazione.

**DIMOSTRATO:** **R13** usa `authorizeAlertMail` e `closeAlert` reali; il wrapper di autorizzazione impone l'interleaving controllo → commit della chiusura → ritorno al recapito. Il mittente finto verifica CLOSED nel database prima di registrare l'invio. Nessuna mail reale e nessuna pretesa di atomicità di un server SMTP nella prova.

**Correzione proposta:** introdurre un protocollo comune tra chiusura/sospensione/sostituzione e autorizzazione finale del recapito, che invalidi le intenzioni non ancora affidate e serializzi la finestra critica. Registrare il confine di emissione; una sola seconda lettura riduce la finestra ma non costituisce una garanzia completa.

### A-08 — MEDIA — Stato e cursore di job_runs non hanno fencing

**File e riga:** `frontend/src/lib/jobs/runs.ts:29–40`; chiamate `frontend/src/services/alerts-job.ts:100`, `:103` e `:106`.

**Scenario:** 08/10/2026 alle 09:00 A esegue il job; la lease scade, B la acquisisce alle 09:02. A può ancora sovrascrivere il cursore di B o chiamare `completeRun`/`failRun` sullo stesso record. Nel job reale la lease può scadere tra l'ultima scansione vuota e il completamento: A marca DONE pur essendo B titolare. `startRun` di una successiva ripresa trova DONE e si ferma; un fail tardivo può invece ribaltare DONE a FAILED. Atteso: cursore ed esito validi soltanto per il token corrente, con avanzamento monotono e stati coerenti.

**Decisione violata:** **D-97**, fencing di ogni scrittura e ripresa dal cursore; architettura §6.4. Gravità MEDIA: è dimostrata la corruzione della gestione della ripresa, non una perdita permanente di un alert in una prova completa con interruzione di due processi.

**DIMOSTRATO:** **R09** sovrascrive il cursore e marca DONE dopo un takeover reale; **R09b** impone il takeover durante l'ultima scansione del `runAlertDaily` reale e osserva DONE dal vecchio titolare.

**Correzione proposta:** associare run/cursore al token e aggiornare il record nella stessa transazione di un controllo di fencing corrente. Condizionare anche DONE/FAILED al titolare e allo stato atteso, evitando regressioni del cursore.

### A-09 — MEDIA — Svuotare l'Offerta interrompe i reminder di un alert ancora aperto

**File e riga:** `frontend/src/lib/alerts/engine.ts:125`, `:198–219`.

**Scenario:** INWIT, Offerta F071 = 01/10/2026, episodio aperto l'08/10 alle 09:00; il 09/10 l'operatore svuota F071. D-133 mantiene OPEN, ma `pending` diventa false e il ramo che calcola i reminder non viene più percorso. Il 15/10 alle 09:00 e tutte le settimane successive il job non produce alcun promemoria. Atteso: l'episodio aperto continua i reminder secondo l'ancora memorizzata fino alla chiusura manuale.

**Decisioni violate:** **D-133**, trigger svuotato non chiude OFFERTA_ODA; **D-97**, reminder settimanali; **D-44**, chiusura solo manuale.

**DIMOSTRATO:** **R04**, motore puro reale con episodio OPEN: zero azioni col trigger vuoto, REMIND con lo stesso episodio e trigger presente.

**Correzione proposta:** separare la condizione di creazione di un episodio dalla condizione di continuazione dei reminder di un episodio aperto a chiusura manuale. Usare l'ancora persistita quando il trigger è stato tolto.

### A-10 — MEDIA — La riprogrammazione conserva il numero di slot della vecchia ancora

**File e riga:** `frontend/src/lib/alerts/engine.ts:202` e `:205`; persistenza `frontend/src/services/alerts-engine.ts:148–153`.

**Scenario:** OFFERTA_ODA aperto con scadenza 08/10/2026; il terzo reminder è stato emesso il 29/10 (`reminderCount = 3`). Il 30/10 il trigger viene corretto a 02/11: nuova scadenza 09/11, stesso episodio. Il codice modifica la scadenza ma conserva count=3 e il vecchio `nextReminderAt`. Il 16/11 alle 09:00, prima ricorrenza dalla nuova scadenza e 18 giorni dopo l'ultimo reminder reale, non emette nulla: parte dal quarto slot, **07/12**, saltando 16/11, 23/11 e 30/11. Atteso: una pianificazione coerente con la nuova ancora e con gli invii già avvenuti, senza settimane perse né arretrati duplicati.

**Decisione violata:** **D-97**, riprogrammazione dell'episodio e periodicità settimanale; architettura §6.5. Il difetto non dipende da un rollover festivo.

**DIMOSTRATO:** **R05** produce RESCHEDULE e verifica il risultato del motore con il documento aggiornato come dal servizio: nessun REMIND il 16/11, nonostante il primo slot della nuova ancora sia dovuto. È una prova pura; la mancata modifica del contatore/nextReminderAt è verificata nel servizio.

**Correzione proposta:** ripianificare insieme scadenza, prossimo reminder e posizione nella ricorrenza, usando anche la data dell'ultima emissione. Un contatore relativo a un'ancora precedente non può essere riutilizzato come indice della nuova.

### A-11 — MEDIA — Il catch-up emette un'apertura e subito dopo un promemoria arretrato

**File e riga:** `frontend/src/lib/alerts/engine.ts:195` e `:205–208`; inizializzazione `frontend/src/services/alerts-engine.ts:188–189`.

**Scenario:** worker fermo a lungo; INWIT con Offerta del 01/09/2026, scadenza 08/09. L'08/10 alle 09:00 un recupero/PATCH apre un solo episodio. Alle 09:01 l'operatore salva Nome Sito: la riconciliazione parte da reminderCount=0 e genera il reminder arretrato del **06/10**, oltre alla notifica appena emessa. Atteso: il recupero assorbe gli slot già trascorsi; il salvataggio immediatamente successivo non manda un secondo sollecito storico per lo stesso episodio.

**Decisione violata:** **D-97**, un solo invio per episodio dopo un fermo; architettura §6.4–§6.5. La suite esistente `alerts-job.test.ts`, prova sul fermo, apre il 23/10 e accetta un reminder del 20/10 al giro successivo: verifica la compressione in un solo slot, ma non che quello slot preceda già l'apertura di recupero.

**DIMOSTRATO:** **R06**, due PATCH reali a un minuto di distanza: OPEN, poi due notifiche REMINDER (PM e leader Permessi), con eventKey del 06/10.

**Correzione proposta:** all'apertura in ritardo considerare consumati i reminder la cui ancora precede l'emissione di recupero. Conservare l'ancora originale per gli slot futuri, senza ripartire dall'ultimo invio né recuperare nuovamente l'arretrato.

### A-12 — MEDIA — Il recapito degli alert funziona anche di notte e nei non lavorativi

**File e riga:** `frontend/src/jobs/worker.ts:32–36`; `frontend/src/services/alerts-job.ts:74` e `:179–186`; `frontend/src/lib/jobs/outbox-delivery.ts:58` e `:86`.

**Scenario:** sabato 10/10/2026 alle 08:00, FORECAST_UT INWIT scaduto il 06/10; un PATCH valorizza/corregge il trigger e apre l'alert arretrato. Il job giornaliero torna NOT_DUE, ma il worker chiama comunque `deliverBatch`: la mail parte sabato alle 08:00. Lo stesso risultato è possibile con una mail PENDING per un retry SMTP durante il weekend o prima delle 09:00. Atteso: recapito degli alert nel prossimo slot lavorativo valido, lunedì 12/10 alle 09:00; le chiusure nel PATCH devono invece restare immediate.

**Decisioni violate:** **D-43** e **D-97**, calendario/orario degli alert e recupero al prossimo slot valido; architettura §6.4. La guardia del solo job non protegge l'outbox. La segnalazione riguarda le mail di alert; non propone di ritardare indiscriminatamente inviti o Assegna.

**DIMOSTRATO:** **R11**, PATCH e recapito reali con ora sabato 08:00, mittente finto chiamato una volta.

**Correzione proposta:** assegnare alle intenzioni di alert un `notBefore` coerente con Roma e il calendario, rispettato anche nei retry, oppure applicare una guardia temporale specifica prima del claim. Non trasformare un differimento temporale in FAILED/cancellazione definitiva.

### A-13 — MEDIA — Il cambio trigger applica una soglia nuova a un episodio emesso con versione vecchia

**File e riga:** `frontend/src/services/alerts-engine.ts:122` e `:150`; `frontend/src/lib/alerts/engine.ts:131–134` e `:202`; versionamento `frontend/src/services/alert-rules.ts:58–70`.

**Scenario:** SOPRALLUOGO INWIT aperto con trigger 01/10/2026, soglia v1=7 lavorativi, scadenza 12/10. Il 20/10 alle 09:00 ADMIN imposta v2=1 giorno; alle 09:01 corregge il trigger a 02/10. La riprogrammazione usa la soglia corrente e salva **05/10**, mantenendo `ruleVersion = 1`. Atteso secondo la congelazione D-97/contratto §6: stesso episodio con soglia v1, scadenza **13/10**; in ogni caso una scadenza prodotta da v2 non può dichiararsi v1.

**Decisioni violate:** **D-97**, nuova soglia valida per alert non ancora emessi; contratto **§6**; **D-44**, log ricostruibile. Il caso combina due operazioni entrambe ammesse: modifica ADMIN e correzione del trigger.

**DIMOSTRATO:** **R12**, apertura, aggiornamento di soglia e secondo PATCH reali; documento finale `ruleVersion:1, dueLocalDate:"2026-10-05"`.

**Correzione proposta:** per gli episodi già emessi ricalcolare il nuovo trigger usando la soglia della loro `ruleVersion`, caricata dal registro versionato. Conservare coerenti versione, input e scadenza nell'audit di riprogrammazione.

### A-14 — BASSA — Il successo di un retry cancella la diagnosi dei tentativi precedenti

**File e riga:** `frontend/src/lib/jobs/outbox-delivery.ts:93` e `:97`; aggregazione diagnostica `frontend/src/jobs/worker.ts:38`.

**Scenario:** 08/10/2026 alle 09:00 errore SMTP 451, memorizzato in `lastError`; alle 09:01 il retry riesce. La riga diventa SENT con `lastError = null` e attempts=2. Non resta un evento append-only di ciascun tentativo con ora/esito/motivo; il worker stampa soltanto i conteggi. Atteso: ricostruire perché il primo tentativo è fallito e quando è avvenuto, anche dopo il successo.

**Decisioni violate:** **D-44**, log completo; **D-97**, architettura §6.5, tentativi/errori nel log di recapito. Nessuna perdita di mail è imputata a questo rilievo: riguarda robustezza e diagnosi.

**DIMOSTRATO:** **R14**, errore e successo reali tramite outbox/mittente finto: motivo presente dopo l'errore, poi cancellato; nessun evento di recapito correlato aggiunto.

**Correzione proposta:** aggiungere eventi di tentativo/esito append-only correlati all'intenzione e all'alert, conservando motivo e timestamp senza contenuti riservati. Il contatore e `lastError` possono restare proiezioni, ma non sostituire lo storico.

## 3. Conflitti con decisioni e casi non coperti dal registro

1. **Conflitto con D-131 nella chiusura generica:** D-46/contratto §8 offrono un comando generale; A-02 dimostra che oggi viene applicato anche alla regola che D-131 vuole chiudere soltanto con la decisione su Fatturabile. Il rapporto segue D-131; occorre allineare autorizzazione, DTO e documentazione della rotta, senza chiedere una nuova decisione di prodotto.
2. **Conflitto con D-90 nella perdita delle mail:** il cutoff a otto errori temporanei non è autorizzato dal compromesso sul raro doppione dopo accettazione SMTP. Il doppione di A-04 e la finestra di A-07 sono effetti prima dell'affidamento o dopo un SENT già noto; non si conteggia come difetto il caso già accettato SMTP accetta → crash → retry incerto.
3. **Soglie e trigger:** D-97/contratto §6 congelano le soglie per alert emessi, mentre il codice congela soltanto finché il trigger non cambia (A-13). Si segnala **conflitto con D-97**; non si introduce una politica nuova. Se il coordinamento desidera una deroga per la correzione del trigger, deve registrarla e rendere coerente l'audit.
4. **Confine di emissione:** l'architettura riconosce che una mail già affidata a SMTP non si può ritirare, ma il codice non registra un confine né coordina il controllo con chiusura/sospensione. Va precisato il punto applicativo che costituisce «affidata», quali comandi possono attendere quel brevissimo intervallo e come si recupera un permesso di emissione dopo un crash. A-07 dimostra la finestra attuale; non si promette una transazione distribuita Mongo/SMTP né exactly-once.
5. **Decisione nel medesimo salvataggio del KO:** R03b è una decisione inequivocabilmente successiva all'ingresso, e dimostra A-03 senza ambiguità. Per un PATCH che produce insieme KO automatico e decisione (R03), è utile rendere esplicito che la decisione vale per l'episodio del risultato finale, non soltanto per quelli caricati prima del salvataggio. Il blocco manuale di un KO precedente non deve invece eliminare una richiesta nuova.
6. **Comportamento su un solo PC:** se è spento alle 09:00 non può inviare; al riavvio il servizio recupera il corrente stato nel primo giorno lavorativo dalle 09:00, come D-97, con i difetti A-01/A-11 se il KO non è stato registrato o gli slot vecchi non sono assorbiti. Non si richiede di ricostruire ogni stato operativo storico dopo il fermo: gli ingressi persistiti dai comandi devono però sopravvivere.
7. **Attività di esercizio note, non nuovi difetti conteggiati:** `docker-compose.yml:8` definisce mongo/app e nessun worker; Mongo non è ancora replica set. `frontend/Dockerfile:34–36` copia il runtime Next, non il bundle worker. `frontend/src/jobs/worker.ts:43–45` fa bootstrap e stampa l'avvio, senza una verifica dello scarto dell'orologio né un presidio esterno; `:51–52` stampa gli errori, senza avviso a M. Lo STATO dichiara il packaging successivo a B9; PR-13, PR-15, PR-16 e PR-17 sono da fare, PR-14 dipende da M. Se il PC ha ora sbagliata il worker segue quell'ora e può anticipare/posticipare o segnare DONE il giorno errato; con Mongo indisponibile all'avvio `main` termina con exit 1, durante un giro registra l'errore e riprova. Riavvio automatico del worker, allarme indipendente, controllo orario e rotazione/spazio **non sono oggi verificati**, e restano condizioni obbligatorie prima dell'esercizio. Non si modifica lo stack beta per questa revisione.

### Controlli senza nuovi rilievi certi

- **Catalogo:** verificati tutti i collegamenti trigger/chiusura contro i MASTER dei sei JSON compilati, con etichette effettive oltre al dtype. Direzione e soglie corrispondono alla Guida/registro: +7 sopralluogo, +3 verbale, −2 UT, −4 PE, −2 AIE, +3 permessi/ARPA, +20 CIL; 7 calendario per CDMS/Offerta; +1 lavorativo per le due ODA FV.
- **Ambiti:** CDMS solo ILIAD con Committente CELLNEX, chiusura EM DATE F109; Offerta ILIAD F099, non F044, esclusi FV/LEONARDO; ODA FV iniziale vuota equivale DA_RICHIEDERE; ARPA per rowId e comprende LEONARDO. I domini controllati Stato ODA rendono coerenti le chiusure sui tre codici previsti. I problemi degli episodi/reminder sono descritti sopra, non errori di identità dei campi.
- **Destinatari:** PM leader del medesimo gestore, leader competenti e DL extra per Forecast PE TIM; persone deduplicate e nessun sostituto; omissioni leader registrate. Mail solo per UT/AIE; i payload degli alert contengono identità sito, label, scadenza e link, senza Note Operative. `alertEmail` usa escapeHtml sui valori interpolati.
- **Calendario:** Pasquetta, 4 ottobre dal 2026, weekend, Capodanno/Epifania e 09:00 Roma con DST verificati dalle suite. Le ancore `dueLocalDate + 7k` non slittano per un rollover successivo; A-10/A-11 riguardano la loro gestione, non l'aritmetica del calendario.
- **Transazioni/idempotenza:** indici unici di episodio, notifica, outbox e ricevuta; hook obbligatorio nel PATCH nella stessa sessione; suite server verde su replica set per replay, concorrenza ordinaria, rollback dei campi, chiusura da compilazione e due worker. Il job scrive la pratica anche senza variazione di Fatturabile, entrando in conflitto con un PATCH concorrente; solo le variazioni delle formule incrementano la revisione. Non è stata dimostrata una perdita di aggiornamento pratica/PATCH.
- **Fatturabile temporale:** stesso `computeFormulas`, ultimo ARPA per ordinal, blocco manuale e NO forzato verificati nei motori/PATCH; il job ordinario registra il cambio SYSTEM e incrementa la revisione. Seleziona pratiche non archiviate e iterazione corrente. Le suite verificano sospensione, ripresa e SUPERSEDED; non risulta un ricalcolo indiscriminato delle iterazioni passate.

## 4. Prove mancanti importanti

Le riproduzioni qui aggiunte coprono singoli interleaving; vanno trasformate in regressioni del comportamento **atteso** e integrate con questi collaudi.

1. **Intero ciclo KO:** manuale/automatico, ingresso e uscita prima delle 09:00, uscita mentre ancora aperto, decisione NO → NO, decisione nello stesso PATCH, ingresso dopo una decisione precedente e nuove generazioni senza salvataggi intermedi estranei. Comando KO seguito immediatamente da archivio non deve perdere l'episodio da sospendere.
2. **Fencing e ripresa con due processi reali:** pause prima/durante la transazione e prima di cursor/DONE/FAILED; scadenza senza takeover, takeover con vecchio worker che torna, heartbeat durante chunk lento, retry del callback dopo la scadenza. Verificare stato del run, cursore monotono, revisioni, ricevute e nessuna scrittura del vecchio titolare.
3. **Outbox con interleaving controllati:** claim scaduto prima di qualsiasi invio, vecchio worker dopo SENT, invio lento oltre la lease, chiusura/PATCH/archivio/ripresentazione/disattivazione tra controllo e affidamento. Distinguere il doppione prevenibile dal crash dopo accettazione SMTP, già accettato da D-90.
4. **SMTP temporaneo prolungato:** indisponibilità oltre 127 minuti e per più giorni, recupero dopo l'ottavo tentativo, errore permanente con avviso/ripresa; verificare che nessuna mail obbligatoria ancora valida scompaia. Una prova col mittente finto non verifica Message-ID/deduplica di un provider reale.
5. **Reminder:** catch-up seguito da PATCH dopo un minuto e dal job successivo; Offerta svuotata; cambio trigger in avanti/indietro dopo più reminder; festività consecutive e cambio anno con ancore diverse; archivio/ripristino dopo settimane, un solo recupero e nessuna raffica di slot passati.
6. **Soglie versionate:** modifica prima dell'apertura, dopo l'apertura a trigger invariato e cambiato; nuova generazione; versione/due coerenti su documento ed eventi. Non limitarsi all'API di configurazione della soglia.
7. **Tempo del recapito:** alert arretrati creati da PATCH prima delle 09:00, sabato/domenica/festivo; retry che attraversa un non lavorativo; clock che salta avanti/indietro e DST. Inviti/Assegna non devono essere bloccati dalla sola guardia degli alert.
8. **Produzione su PC, PR-13…PR-17:** immagine senza devDependencies con worker funzionante, riavvio PC/Docker/worker, database indisponibile all'avvio e durante il job, segnalazione a M, orologio fuori soglia, spazio basso e rotazione log. Uno stack di prova separato deve dimostrare questi punti prima del cutover.
9. **Audit e riservatezza:** eventi di ogni tentativo con correlazione a episodio/intenzione e confine di autorizzazione; test specifici di `alertEmail` con HTML nei nomi/sito/link; assenza delle Note Operative dei gruppi da notifiche, mail e log diagnostici.

## Appendice — Riproducibilità

I test aggiuntivi usano il replica set locale indicato sopra. I repository, i servizi, il driver e le transazioni sono reali. **R04/R05** sono prove pure; **R09b** impone un takeover nel punto finale della scansione sostituendo soltanto il risultato della query del database vuoto; **R10** ritarda una lettura reale; **R13** inserisce la chiusura reale fra controllo e invio. Non sono prove di scheduling del sistema operativo o di un SMTP reale.

Da `frontend/`, con tutte le variabili Mongo indirizzate al solo container temporaneo, DB_NAME/NEW_DB_NAME a un nome di prova e SMTP_HOST vuoto:

```powershell
node node_modules/vitest/vitest.mjs run tests/server --config '<temporanea>/existing.config.mjs' --no-cache
node node_modules/vitest/vitest.mjs run --config '<temporanea>/review.config.mjs' --no-cache
```

I nomi database delle riproduzioni sono `practicehub_test_alert_review_7d9b` e `practicehub_test_alert_review_empty_7d9b`, eliminati dalle prove. Le suite esistenti creano/eliminano i propri database di prova. Il container usa-e-getta viene rimosso al termine della revisione.

### Impronte SHA-256 dei file centrali

```text
frontend/src/lib/alerts/engine.ts              9E9B561F27BD0F692A0EA814E36A28BFF9B890F1D08102B5501A806DB7AC6AC8
frontend/src/services/alerts-engine.ts         4923A6249C1CFB4BD04F9968A30DAF0ECD0B503ABEA8FEA4CF8FDBA640282FE5
frontend/src/services/alerts-job.ts            BC6688DB01035C00A639B59DAC9BF2FC1CE1BF6A58AE72B16B958AD9B536EED2
frontend/src/services/alerts.ts                0CE3AFEFE4AE865638B32658151AE9AAB06FF584803D4503282B1C7E64E4AE2E
frontend/src/lib/jobs/outbox-delivery.ts       DEBBE9309658D6637E2B2BEFECD9220D59CF708844E39A63861472142EE2E7FF
frontend/src/lib/jobs/runs.ts                  242EEF8E1A7491F95563EF15963CD591B62083BC1D21591D67020E4ADC1D3FDA
frontend/src/lib/jobs/lock.ts                  09F5BA386398873E0F7701CEAFA5A14592CCD83BD8C83DD7BB50AA475883C31C
frontend/src/jobs/worker.ts                    DB35D2D4A2B36044D4F3E2C6EA922C4E425F4115E23C1A5A2FEEE21E1FFA8B72
frontend/src/services/practices-v2/commands.ts EB82C2984353172A4CE41EC03E5A3662E57D3FC2C51E40C9EE16F4633B9C0BCC
```

Le configurazioni e la suite eseguita sono incluse di seguito per non dipendere dalla permanenza della cartella temporanea. Adattare soltanto i percorsi assoluti e usare una nuova porta libera diversa da 27017 se 27039 non è disponibile; per le prove con Mongo creare sempre un proprio replica set usa-e-getta.

### existing.config.mjs

```javascript
export default {
 root: 'C:/Users/mcracchiolo/Desktop/MEGADASHBOARD-main/frontend',
 cacheDir: 'C:/Users/mcracchiolo/AppData/Local/Temp/practicehub-alert-review-20261008-7d9b/cache-existing',
 resolve: { alias: { '@': 'C:/Users/mcracchiolo/Desktop/MEGADASHBOARD-main/frontend/src' } },
 test: { environment: 'node', include: ['tests/server/**/*.test.ts'], testTimeout: 30000, hookTimeout: 180000, maxWorkers: 2, fileParallelism: false }
};

```

### review.config.mjs

```javascript
export default {
 root: 'C:/Users/mcracchiolo/Desktop/MEGADASHBOARD-main/frontend',
 cacheDir: 'C:/Users/mcracchiolo/AppData/Local/Temp/practicehub-alert-review-20261008-7d9b/cache-review',
 resolve: { alias: {
  '@': 'C:/Users/mcracchiolo/Desktop/MEGADASHBOARD-main/frontend/src',
  'vitest': 'C:/Users/mcracchiolo/Desktop/MEGADASHBOARD-main/frontend/node_modules/vitest/dist/index.js',
  'mongodb': 'C:/Users/mcracchiolo/Desktop/MEGADASHBOARD-main/frontend/node_modules/mongodb/lib/index.js'
 } },
 server: { fs: { allow: ['C:/Users/mcracchiolo/AppData/Local/Temp/practicehub-alert-review-20261008-7d9b', 'C:/Users/mcracchiolo/Desktop/MEGADASHBOARD-main/frontend'] } },
 test: { environment: 'node', include: ['C:/Users/mcracchiolo/AppData/Local/Temp/practicehub-alert-review-20261008-7d9b/review.test.ts'], testTimeout: 30000, hookTimeout: 180000, fileParallelism: false }
};


```

### review.test.ts

```typescript
import { beforeAll, afterAll, it, expect } from 'vitest';
import { MongoClient, ObjectId } from 'mongodb';
import { bootstrapStore, store, ALERT_RULES } from '@/lib/store/db';
import { runOperation } from '@/lib/store/transaction';
import { enqueueDeliveries } from '@/lib/store/outbox';
import { acquireLock, assertFence } from '@/lib/jobs/lock';
import { startRun, saveCursor, completeRun } from '@/lib/jobs/runs';
import { claimNext, deliverOne, deliverBatch } from '@/lib/jobs/outbox-delivery';
import { createPractice, changeStato } from '@/services/practices-v2/commands';
import { patchFields } from '@/services/practices-v2/fields';
import { getPracticeDetail } from '@/services/practices-v2/read';
import { closeAlert } from '@/services/alerts';
import { updateAlertRule } from '@/services/alert-rules';
import { runAlertDaily, processPractice, authorizeAlertMail } from '@/services/alerts-job';
import { toUserDTO } from '@/services/users-v2';
import { COMPILED_TEMPLATES } from '@/lib/templates/compiled';
import { evaluateTargets, reconcileAlerts, reminderAt } from '@/lib/alerts/engine';

const uri = 'mongodb://127.0.0.1:27039/?directConnection=true';
const client = new MongoClient(uri);
const db = client.db('practicehub_test_alert_review_7d9b');
const at = (s: string) => new Date(s);
const t0 = at('2026-10-08T07:00:00Z');
let pm: any, pp: any, admin: any;
const deps = (s = '2026-10-08T07:00:00Z') => ({ client, db, clock: () => at(s) });
const T = COMPILED_TEMPLATES.INWIT.template;
const set = (flowId: string, value: any) => ({ flowId, occurrenceKey: T.occurrences.find(o => o.kind === 'MASTER' && o.flowId === flowId)!.occurrenceKey, value });
const create = (name: string) => createPractice(deps(), pm, { templateId: 'INWIT', committente: {code:'TODOS'}, clienteFinale: {code:'INWIT'}, codiceG7:'1', codiceSito:name, nomeSito:'N' });
const patch = (d: any, changes: any[], time = '2026-10-08T08:00:00Z') => patchFields(deps(time), admin, d.id, {iteration:d.iteration, revision:d.revision, changes});
const koAlerts = (id: string) => store.alerts(db).find({practiceId:new ObjectId(id),ruleId:'FATTURABILE_KO'}).toArray();
const targets = (values: any, stato = 'CREATA') => evaluateTargets({templateId:'INWIT', values, repeats:{}, stato:stato as any, thresholds:Object.fromEntries(ALERT_RULES.filter(r=>r.templates.includes('INWIT')).map(r=>[r.ruleId,{days:r.days,unit:r.unit,version:1}]))});
const existing = (o: any) => ({ id:'x',ruleId:'OFFERTA_ODA',rowId:null,generation:1,status:'OPEN',closeMode:null,dueAt:t0,dueLocalDate:'2026-10-08',sourceFingerprint:'2026-10-01',resolvedAt:null,reminderCount:0,...o });
beforeAll(async () => {
 await client.connect(); await bootstrapStore(db);
 async function user(name: string, role: string, isAdmin=false) {
  const doc = {_id:new ObjectId(),name,email:name+'@test.local',passwordHash:null,status:'active',isAdmin,memberships:isAdmin?[]:[{templateId:'INWIT',group:'PM_PERMESSI',role,leader:true}],authVersion:1,createdAt:t0,updatedAt:t0};
  await store.users(db).insertOne(doc as any); return toUserDTO(doc as any);
 }
 pm=await user('PM','PM'); pp=await user('PP','PERMESSI'); admin=await user('ADMIN','PM',true);
});
afterAll(async()=> { await db.dropDatabase(); await client.close(); });

it('R01: il comando KO non apre; KO uscito prima del job e perso definitivamente',async()=>{
 const d=await create('R01');
 const k=await changeStato(deps('2026-10-08T08:00:00Z'),pm,d.id,{revision:d.revision,stato:'KO'});
 expect(await koAlerts(d.id)).toHaveLength(0);
 await changeStato(deps('2026-10-08T09:00:00Z'),pm,d.id,{revision:k.revision,stato:'ASSEGNATO'});
 expect((await runAlertDaily({client,db},{owner:'r01',now:()=>at('2026-10-09T07:00:00Z')})).status).toBe('DONE');
 expect(await koAlerts(d.id)).toHaveLength(0);
});
it('R01b: uscita e rientro manuali non abilitano una seconda generazione KO',async()=>{
 let d=await create('R01b');
 d=await changeStato(deps(),pm,d.id,{revision:d.revision,stato:'KO'});
 await patch(d, [set('F003','N2')]); // fa riconciliare il KO
 d=await getPracticeDetail(db,pm,d.id);
 await patch(d,[{transversal:'fatturabile',value:'NO'}]);
 d=await getPracticeDetail(db,pm,d.id);
 d=await changeStato(deps('2026-10-08T09:00:00Z'),pm,d.id,{revision:d.revision,stato:'ASSEGNATO'});
 d=await changeStato(deps('2026-10-08T10:00:00Z'),pm,d.id,{revision:d.revision,stato:'KO'});
 await patch(d,[set('F003','N3')],'2026-10-08T11:00:00Z');
 const alerts=await koAlerts(d.id); expect(alerts).toHaveLength(1); expect(alerts[0].status).toBe('CLOSED');
});
it('R02: leader Permessi chiude FATTURABILE_KO senza decidere Fatturabile',async()=>{
 let d=await create('R02'); d=await changeStato(deps(),pm,d.id,{revision:d.revision,stato:'KO'});
 await patch(d,[set('F003','N2')]);
 const a=(await koAlerts(d.id))[0];
 expect((await closeAlert({client,db},pp,a._id.toHexString())).status).toBe('CLOSED');
 const it=await store.iterations(db).findOne({_id:new ObjectId(d.iterationId)});
 expect(it!.transversal.fatturabileManual).toBe(false);
});
it('R03: KO automatico e decisione Fatturabile nello stesso PATCH lasciano un alert aperto',async()=>{
 const d=await create('R03');
 const r=await patch(d,[set('F069',{code:'KO'}),set('F070','2026-10-08'),{transversal:'fatturabile',value:'NO'}]);
 expect(r.practice.statoAttivita).toBe('KO'); expect(r.practice.transversal.fatturabileManual).toBe(true);
 expect((await koAlerts(d.id))[0].status).toBe('OPEN');
});
it('R03b: decisione manuale successiva al KO prima del job apre un alert che chiede una decisione gia presa',async()=>{
 let d=await create('R03b');
 d=await changeStato(deps('2026-10-08T08:00:00Z'),pm,d.id,{revision:d.revision,stato:'KO'});
 expect(await koAlerts(d.id)).toHaveLength(0);
 const r=await patch(d,[{transversal:'fatturabile',value:'NO'}],'2026-10-08T08:01:00Z');
 expect(r.practice.transversal.fatturabileManual).toBe(true);
 expect((await koAlerts(d.id))[0]).toMatchObject({status:'OPEN',closedAt:null});
});
it('R04: Offerta svuotata resta aperta ma perde tutti i reminder',()=>{
 const a=existing({});
 expect(reconcileAlerts(targets({F071:null}),[a],at('2026-10-29T07:00:00Z'))).toEqual([]);
 expect(reconcileAlerts(targets({F071:'2026-10-01'}),[a],at('2026-10-29T07:00:00Z'))).toEqual(expect.arrayContaining([expect.objectContaining({type:'REMIND'})]));
});
it('R05: riprogrammazione posticipata conserva il contatore e salta reminder dovuti',()=>{
 const a=existing({dueLocalDate:'2026-10-08',sourceFingerprint:'2026-10-01',reminderCount:3});
 const ts=targets({F071:'2026-09-01'});
 const action=reconcileAlerts(ts,[a],at('2026-10-30T08:00:00Z'))[0]; expect(action.type).toBe('RESCHEDULE');
 const earlier=existing({...a,dueLocalDate:'2026-09-08',sourceFingerprint:'2026-09-01'});
 expect(reconcileAlerts(ts,[earlier],at('2026-10-30T08:01:00Z'))[0]).toMatchObject({type:'REMIND',slot:'2026-10-27'});
 const later=existing({...a,dueLocalDate:'2026-11-09',sourceFingerprint:'2026-11-02'});
 expect(reconcileAlerts(targets({F071:'2026-11-02'}),[later],at('2026-11-16T08:00:00Z'))).toEqual([]);
 expect(reminderAt('2026-11-09',1).dueLocalDate).toBe('2026-11-16');
});
it('R06: apertura in catch-up e secondo PATCH subito dopo producono anche un reminder arretrato',async()=>{
 const d=await create('R06');
 const first=await patch(d,[set('F071','2026-09-01')],'2026-10-08T07:00:00Z');
 const before=await store.notifications(db).countDocuments({'link.practiceId':new ObjectId(d.id),kind:'REMINDER'}); expect(before).toBe(0);
 await patch(first.practice,[set('F003','N2')],'2026-10-08T07:01:00Z');
 const reminders=await store.notifications(db).find({'link.practiceId':new ObjectId(d.id),kind:'REMINDER'}).toArray();
 expect(reminders).toHaveLength(2); expect(reminders[0].eventKey).toContain('2026-10-06');
});
async function enqueue(eventKey: string) {
 await runOperation(client,db,{actorId:'review',request:{eventKey},now:t0},ctx=>enqueueDeliveries(ctx,[{eventKey,userId:new ObjectId(pm.id),payload:{to:pm.email,subject:eventKey,html:'<p>x</p>'}}]));
}
it('R07: worker vecchio invia anche dopo che il nuovo ha gia marcato SENT',async()=>{
 await enqueue('R07');
 const old=(await claimNext(db,t0,60_000))!;
 const sent:string[]=[]; const sender=async(m:any)=>{sent.push(m.messageId)};
 expect(await deliverBatch(db,sender,{owner:'new',now:()=>at('2026-10-08T07:02:00Z'),batchSize:1})).toMatchObject({sent:1});
 expect(await deliverOne(db,old,sender,{owner:'old',now:()=>at('2026-10-08T07:03:00Z')})).toBe('sent');
 expect(sent).toHaveLength(2); expect(new Set(sent).size).toBe(1);
});
it('R08: otto errori SMTP temporanei rendono definitivamente irrecapitabile la mail',async()=>{
 await enqueue('R08');
 const fail=async()=>{throw new Error('SMTP 451 temporaneo')};
 for(let i=0;i<8;i++) await deliverBatch(db,fail,{owner:'review',now:()=>at('2026-10-08T07:00:00Z'),backoffMs:()=>0,batchSize:1});
 expect(await store.outbox(db).findOne({eventKey:'R08'})).toMatchObject({status:'FAILED',attempts:8});
 const sent:any[]=[];
 await deliverBatch(db,async m=>{sent.push(m)},{owner:'review',now:()=>at('2026-10-09T07:00:00Z')}); expect(sent).toEqual([]);
});
it('R09: cursore e DONE accettano il vecchio esecutore dopo il takeover',async()=>{
 const old=(await acquireLock(db,'R09','old',60_000,t0))!;
 const run=(await startRun(db,'R09','2026-10-08',t0))!;
 const fresh=(await acquireLock(db,'R09','new',60_000,at('2026-10-08T07:02:00Z')))!;
 await saveCursor(db,run,{after:'new-progress'});
 await saveCursor(db,run,{after:'old-progress'});
 await completeRun(db,run,at('2026-10-08T07:02:10Z'));
 expect(await store.jobRuns(db).findOne({_id:run._id})).toMatchObject({status:'DONE',cursor:{after:'old-progress'}});
 expect(fresh.fencingToken).toBeGreaterThan(old.fencingToken);
 expect(await startRun(db,'R09','2026-10-08',at('2026-10-08T07:03:00Z'))).toBeNull();
});
it('R09b: il job reale marca DONE dopo aver perso la lease tra ultima scansione e completamento',async()=>{
 const emptyDb=client.db('practicehub_test_alert_review_empty_7d9b');
 const originalPractices=store.practices;
 try {
  await bootstrapStore(emptyDb);
  let newLock:any;
  store.practices=((targetDb:any)=>targetDb.databaseName===emptyDb.databaseName ? {
   find:()=>({sort:()=>({limit:()=>({toArray:async()=>{
    newLock=await acquireLock(emptyDb,'alert_daily','new',60_000,at('2026-10-08T07:02:00Z'));
    return [];
   }})})})
  }:originalPractices(targetDb)) as any;
  let calls=0;
  const report=await runAlertDaily({client,db:emptyDb},{owner:'old',leaseMs:60_000,now:()=>calls++===0?t0:at('2026-10-08T07:02:00Z')});
  expect(newLock).toMatchObject({owner:'new',fencingToken:2});
  expect(report.status).toBe('DONE');
  expect(await store.jobRuns(emptyDb).findOne({jobKey:'alert_daily',localDate:'2026-10-08'})).toMatchObject({status:'DONE'});
 } finally {store.practices=originalPractices;await emptyDb.dropDatabase();}
});
it('R10: il fencing della pratica usa il timestamp congelato, non il tempo della scrittura',async()=>{
 const created=await create('R10');
 const patched=await patch(created,[set('F050','2026-09-01'),{repeat:'ARPA',op:'ADD_ROW',clientRowKey:'a',values:{F060:{code:'POSITIVO'}}}],'2026-09-15T08:00:00Z');
 const d=patched.practice; expect(d.transversal.fatturabile).toBe('NO');
 const captured=new Date(); const h=(await acquireLock(db,'R10','old',300,captured))!;
 const originalStore=store.operations; const operations=store.operations(db); const original=operations.findOne;
 store.operations=()=>operations;
 let delayed=false;
 operations.findOne=async function(...args:any[]) {
  if(!delayed) {delayed=true;await new Promise(r=>setTimeout(r,550));}
  return original.apply(this,args as any);
 } as any;
 let r:any;
 try { r=await processPractice({client,db},h,new ObjectId(d.id),'2026-10-08',captured); }
 finally {operations.findOne=original;store.operations=originalStore;}
 expect(new Date().getTime()).toBeGreaterThan(h.leaseUntil.getTime());
 expect(r).toMatchObject({fatturabileChanged:true});
 expect((await getPracticeDetail(db,pm,d.id)).transversal.fatturabile).toBe('SI');
 expect(await store.operations(db).findOne({actorId:'system:alert_daily',practiceId:new ObjectId(d.id)})).not.toBeNull();
 await expect(runOperation(client,db,{actorId:'review',request:{expired:true}},ctx=>assertFence(ctx,h))).rejects.toThrow(/perso/);
});
it('R11: alert arretrato aperto dal PATCH e mail recapitata di sabato alle 08',async()=>{
 const d=await create('R11');
 await patch(d,[set('F092','2026-10-08')],'2026-10-10T06:00:00Z');
 const a=await store.alerts(db).findOne({practiceId:new ObjectId(d.id),ruleId:'FORECAST_UT'}); expect(a!.status).toBe('OPEN');
 const mails:any[]=[]; await deliverBatch(db,async m=>{mails.push(m)},{owner:'weekend',now:()=>at('2026-10-10T06:00:00Z'),authorize:i=>authorizeAlertMail(db,i.eventKey)});
 expect(mails).toHaveLength(1);
});
it('R12: soglia aggiornata cambia un alert gia emesso al cambio trigger ma il record dichiara ancora v1',async()=>{
 const d=await create('R12'); const first=await patch(d,[set('F023','2026-10-01')],'2026-10-20T07:00:00Z');
 const a=await store.alerts(db).findOne({practiceId:new ObjectId(d.id),ruleId:'SOPRALLUOGO'});
 expect(a).toMatchObject({ruleVersion:1,dueLocalDate:'2026-10-12'});
 await updateAlertRule({client,db},admin,'SOPRALLUOGO','INWIT',{days:1,revision:1});
 await patch(first.practice,[set('F023','2026-10-02')],'2026-10-20T07:01:00Z');
 expect(await store.alerts(db).findOne({_id:a!._id})).toMatchObject({ruleVersion:1,dueLocalDate:'2026-10-05'});
});
it('R13: chiusura commessa tra controllo autorizzazione e invio non blocca la mail',async()=>{
 const d=await create('R13');
 await patch(d,[set('F092','2026-10-08')],'2026-10-08T08:00:00Z');
 const a=(await store.alerts(db).findOne({practiceId:new ObjectId(d.id),ruleId:'FORECAST_UT'}))!;
 const mails:any[]=[];
 const report=await deliverBatch(db,async m=>{
  expect((await store.alerts(db).findOne({_id:a._id}))!.status).toBe('CLOSED');
  mails.push(m);
 },{owner:'r13',now:()=>at('2026-10-08T08:01:00Z'),authorize:async item=>{
  const decision=await authorizeAlertMail(db,item.eventKey);
  await closeAlert({client,db},admin,a._id.toHexString());
  return decision;
 }});
 expect(mails).toHaveLength(1); expect(report.sent).toBe(1);
});
it('R14: il recapito riuscito cancella il motivo del tentativo SMTP precedente',async()=>{
 await enqueue('R14');
 await deliverBatch(db,async()=>{throw new Error('SMTP 451 causa-da-conservare')},{owner:'r14',now:()=>t0,backoffMs:()=>0,batchSize:1});
 expect((await store.outbox(db).findOne({eventKey:'R14'}))!.lastError).toContain('causa-da-conservare');
 await deliverBatch(db,async()=>{},{owner:'r14',now:()=>at('2026-10-08T07:01:00Z'),batchSize:1});
 expect(await store.outbox(db).findOne({eventKey:'R14'})).toMatchObject({status:'SENT',lastError:null,attempts:2});
 expect(await store.alertEvents(db).countDocuments({'detail.eventKey':'R14'})).toBe(0);
});

```

### Risultati finali

```text
Suite server esistente (Mongo 27039, SMTP spento):
 Test Files  26 passed (26)
      Tests  363 passed (363)
   Duration  260.58s

Suite avversativa (Mongo 27039, mittente finto):
 Test Files  1 passed (1)
      Tests  17 passed (17)
   Duration  35.10s
```

Il container `practicehub-alert-review-20261008-7d9b` è stato rimosso dopo le prove. Nessun servizio/database preesistente è stato arrestato o modificato.
