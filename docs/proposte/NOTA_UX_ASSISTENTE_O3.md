# PracticeHub — Assistente AI: proposta di interfaccia (o3, 09/10/2026)

*Salvata dalla memoria dal messaggio di o3. Riferimenti: D-50, D-165, baseline §17.14, R-3. Solo proposta: nessun codice finché M non decide modello, dati e budget. Input per `PROMPT_PROGETTO_ASSISTENTE_AI.md`.*

## 1. Dove sta

Proposta: un pannello laterale, disponibile in ogni pagina, più una pagina dedicata che riusa lo stesso componente.

- **Pannello.** Si apre dal pulsante "Chiedi" nell'intestazione, accanto alla campanella (scorciatoia Ctrl+K). Si apre a destra, largo 420 px; a tutta larghezza su telefono.
  - Resta aperto mentre si naviga: cliccando una fonte si apre la pratica e la conversazione resta lì.
  - Conosce il contesto della pagina e lo mostra in alto, e si può togliere: "Su questa pratica: IL-TO-0001", oppure "Elenco: ILIAD, stato ASSEGNATO".
- **Pagina /assistente.** Stessa conversazione, a tutta larghezza, per domande lunghe e per rileggere le risposte. Lo storico delle conversazioni compare solo se M decide di tenerlo (R-3, "registro delle conversazioni").
- Per la prima versione basta il pannello; la pagina costa poco, perché è lo stesso componente.

## 2. Risposte, fonti, "non lo so", errori

- **Streaming.** Il testo compare man mano.
  - Prima del testo, una riga di stato scritta dal server, non dal modello: "Cerco le pratiche ILIAD con scadenza entro il 17/10…", "Leggo le note di IL-TO-0001…". Così l'attesa di 2–4 s non sembra un blocco.
  - Il pulsante "Interrompi" ferma la generazione, anche lato server, per i costi.
- **Fonti.**
  - Nel testo, rimandi numerati [1] [2] cliccabili.
  - Sotto la risposta, un blocco FONTI con una riga per fonte: "IL-TO-0001 · Torino Lingotto · ILIAD · Forecast Protocollo". Porta alla scheda, alla sezione e al campo, come i link delle notifiche (`?sezione=&campo=&riga=`).
  - Per gli elenchi: "Apri l'elenco filtrato" porta a /pratiche con gli stessi filtri.
  - Per i numeri: se esiste un KPI deterministico (§17.14), la cifra viene dallo strumento, non dal modello, con il collegamento "Vedi in Statistiche".
  - In fondo: "Dati letti alle 10:42".
- **"Non lo so"** è uno stato distinto, non un errore. Riquadro con bordo neutro: "Non trovo dati per rispondere", con il motivo ("nessuna pratica visibile a te soddisfa la richiesta", oppure "l'informazione non è registrata in PracticeHub") e 2 domande suggerite per riformulare. Mai risposte senza fonti sui dati delle pratiche.
- **Errori**, sempre con "L'app funziona normalmente" e, dove ha senso, "Riprova":
  - Google non risponde o va in timeout: "L'assistente non è disponibile in questo momento." Riprova.
  - Quota del progetto esaurita: "Limite di domande raggiunto per oggi per tutta l'azienda. Riprova domani o scrivi a operations@hqe.it."
  - Limite personale: "Hai usato 30 domande su 30 oggi; il conteggio riparte domani." Il contatore discreto ("12/30") sta sotto il campo di scrittura.
  - Risposta interrotta a metà: il testo già arrivato resta, marcato "Risposta interrotta", con Riprova.
  - Contenuto bloccato dal filtro di Google: "Non posso rispondere a questa domanda."
  - Sessione scaduta: rimando al login.
- **Avvertenza fissa** in basso: "Sola lettura · Le risposte possono contenere errori: verifica sulla scheda."

## 3. Domande suggerite per ruolo

Cambiano con il ruolo (dal MeDTO) e con il contesto. Sono pulsanti; al clic la domanda entra nel campo di scrittura, non parte da sola.

- **PM e PM leader:**
  - "Quali pratiche [cliente] hanno il Forecast Ottenimento Permessi entro fine mese?"
  - "Quali sopralluoghi sono in ritardo questa settimana?"
  - "Quante pratiche sono in INTEGRAZIONE RICHIESTA, per cliente?"
  - "Riassumi le criticità di [cliente]."
- **Team leader (UT/PE, AIE, DL):**
  - "Cosa scade per il mio gruppo nei prossimi 7 giorni?"
  - "Quali Forecast UT sono a 2 giorni senza Invio AS/VS?"
  - "Alert aperti del mio gruppo, per pratica."
  - "Su quali pratiche lavora [collega]?" Mai "chi ha più pratiche": niente classifiche (G §17.13).
- **Tecnico (UT, PE, AIE, DL):**
  - "Le mie pratiche con una scadenza entro venerdì."
  - "Su quali pratiche sono indicato come tecnico?"
  - "Cosa manca per chiudere il sopralluogo di [pratica]?"
- **ADMIN:** come il PM, su tutti i clienti.
- **Sulla scheda di una pratica, per tutti:**
  - "Riassumi questa pratica."
  - "Perché è ferma?" (dalle note che l'utente può vedere)
  - "Cosa è cambiato nell'ultima settimana?" (dallo storico)

## 4. Coerenza con il design Swiss

- Stessi token: raggio 0, bordi di 1 px, etichette mono maiuscole, tipografia e colori dell'app. Niente bolle arrotondate, avatar, emoji, sfumature o "scintille AI".
- Messaggi come blocchi impilati a tutta larghezza:
  - etichetta "DOMANDA · 10:42" sopra il testo dell'utente;
  - etichetta "RISPOSTA · 10:42" sopra la risposta, in tipografia normale e leggibile, con elenchi e tabelle semplici solo se servono.
- Fonti come chip mono con bordo, come i codici sito nell'elenco.
- Colori di stato solo per gli errori (rosso) e per l'avviso di limite (giallo); il "non lo so" è neutro.
- Titolo del pannello: "ASSISTENTE · SOLA LETTURA".
- Tastiera: Invio invia, Maiusc+Invio va a capo, Esc chiude. Il focus torna al pulsante "Chiedi"; la regione delle risposte è aria-live per gli screen reader.

## 5. Cosa serve dal contratto (proposta per o2)

- `POST /api/assistant/messages`
  - Corpo: `{ conversationId?, text, context?: { page: "list" | "sheet" | "stats" | "other", practiceId?, iteration?, templateId?, listQuery?: PracticeListQuery } }`.
  - Risposta in streaming: NDJSON su fetch (una riga JSON per evento; stessa origine, con i cookie, funziona anche dietro il proxy). In alternativa SSE.
- Eventi:
  - `{ type: "start", conversationId, messageId }`
  - `{ type: "status", text }` (passo dello strumento, già leggibile)
  - `{ type: "delta", text }` (i rimandi [n] si riferiscono all'ordine delle fonti)
  - `{ type: "source", index, source: SourceDTO }`
  - `{ type: "done", finishReason: "STOP" | "NO_ANSWER" | "LENGTH", asOf, usage: { usedToday, dailyLimit } }`
  - `{ type: "error", code: "UNAVAILABLE" | "TIMEOUT" | "QUOTA_PROJECT" | "QUOTA_USER" | "BLOCKED" | "INTERNAL", message, retryAfter? }`
- SourceDTO:
  - `{ kind: "PRACTICE", practiceId, codiceSito, nomeSito, templateId, iteration?, sectionKey?, occurrenceKey?, flowId?, rowId?, label }`
  - `{ kind: "LIST", label, query: PracticeListQuery }`
  - `{ kind: "STATS", label, query: StatsQuery }`
  - Il server garantisce che ogni fonte sia visibile all'utente (D-50).
- Errori prima dello streaming: 401; 403 (assistente non abilitato); 429 con code `QUOTA_USER` o `QUOTA_PROJECT` e `resetAt`; 503 `UNAVAILABLE`.
- Interruzione: quando il client chiude la richiesta, il server ferma la generazione.
- Abilitazione e limiti: nel MeDTO, `assistant: { enabled, dailyLimit, usedToday }`, così il pulsante "Chiedi" e il contatore non chiedono altre rotte.
- Domande suggerite: proposta lato client, statiche per ruolo e contesto. Una rotta `GET /api/assistant/suggestions` serve solo se M vuole cambiarle senza rilascio.
- Da decidere con R-3: storico delle conversazioni (`GET /api/assistant/conversations`), giudizio sulle risposte, durata di conservazione.

**Stima del frontend**, dopo le decisioni di M e con il contratto pronto: 2–3 giorni (pannello, streaming, fonti, stati, suggerimenti, prove).
