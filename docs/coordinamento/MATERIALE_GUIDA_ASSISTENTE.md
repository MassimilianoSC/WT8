# Materiale per la guida — Assistente AI, Configurazione → Assistente AI, link condivisibili

*Inviato da o3 il 09/10/2026 (ramo `assistente-o3`), salvato dalla memoria con la correzione successiva di o3. I testi tra virgolette sono quelli a schermo. Esempi: contatore 12/30, codice IL-TO-0001, ora 10:42. L'assistente compare solo dopo il collegamento delle rotte di o2.*

## Assistente AI

### Come si apre
- Pulsante "Chiedi" (icona a fumetto) nell'intestazione, accanto alla campanella; sul telefono solo l'icona. Per tutti gli utenti attivi. Anche Ctrl+K (⌘K su Mac), non mentre si scrive in un campo.
- Pannello a destra "ASSISTENTE · SOLA LETTURA": affianca la pagina sugli schermi molto larghi, le sta sopra su quelli più stretti, a tutto schermo sul telefono. Resta aperto navigando, con la conversazione.
- Pulsanti: "Nuova conversazione" (+); "Apri a tutta pagina" (/assistente, titolo "Assistente", sottotitolo "Domande sulle pratiche che puoi vedere. Sola lettura: non modifica nulla."); "Chiudi l'assistente" (X). Esc chiude; chiudere ferma anche una risposta in corso.
- Spento dall'amministratore: "Chiedi" resta, il pannello dice solo "Assistente disattivato dall'amministratore." senza campo di scrittura.

### Come si chiede
- Campo "Chiedi sulle pratiche che puoi vedere…"; Invio invia, Maiusc+Invio va a capo; massimo 2000 caratteri ("Massimo 2000 caratteri (2001).").
- Una domanda alla volta: durante la risposta "Invia" diventa "Interrompi".
- Contesto sopra il campo, segue la pagina: "Pratica IL-TO-0001 · iterazione 2", "Elenco: ILIAD · stato ASSEGNATO · ricerca "Roma"", "Archivio: …", "Statistiche: ILIAD" / "Statistiche: tutti i clienti", "Carichi di lavoro: ILIAD". X "Togli il contesto"; "Usa il contesto della pagina" lo rimette.
- Fino a 8 domande per conversazione ("Questa conversazione ha raggiunto 8 domande." + "Nuova conversazione"). Nessuno storico: si perde chiudendo il browser o dopo ~15 minuti di inattività.

### Domande suggerite
- Pannello vuoto: "DOMANDE SUGGERITE"; il clic mette la domanda nel campo senza inviarla.
- PM e amministratori: "Quali pratiche ILIAD hanno il Forecast Ottenimento Permessi entro fine mese?"; "Quante pratiche ILIAD ci sono per stato?"; "Quali sono le criticità della settimana su ILIAD?"; "Carichi di lavoro per gruppo su ILIAD."
- Permessi: "Forecast e scadenze delle pratiche ILIAD."; "Quali sopralluoghi ILIAD hanno alert scaduti?"
- Team leader UT/PE, AIE, DL: "Carico del mio gruppo su ILIAD."; "Consegne previste nei prossimi 7 giorni."; "Forecast scaduti su pratiche non concluse."
- Tecnici: "Le pratiche in cui sono indicato come tecnico."; "Le mie consegne previste entro venerdì."
- Sulla scheda, per tutti: "Riassumi questa pratica."; "Perché non è avanzata, dalle note visibili?"; "Cosa è cambiato nell'ultima settimana?"; "Forecast e stato dell'iterazione che sto vedendo."
- Senza cliente nella pagina: "per cliente" al posto del nome.

### La risposta
- "DOMANDA · 10:42" con il contesto usato, poi "RISPOSTA". Prima del testo una riga dell'app ("Cerco le pratiche ILIAD con forecast entro il 31/10…", "Invio della domanda…", "Leggo i dati…"), poi il testo man mano.
- Rimandi numerati cliccabili. "FONTI": pratica ("Forecast Ottenimento Permessi · IL-TO-0001 · Torino Lingotto · ILIAD · iterazione 2", apre scheda, sezione e campo); elenco (stessi filtri, scritti anche per esteso); Statistiche e Carichi (cliente, periodo, gruppo già scelti); "Apri come nuova domanda". La fonte lascia aperto il pannello (sul telefono lo chiude).
- "DATI DELL'APP": cifre calcolate dall'app, non dall'AI, con cliente, periodo e rimando.
- In fondo "Dati letti alle 10:42" (o "tra le 10:41 e le 10:42") e "Sola lettura. Le risposte possono contenere errori: verifica sulla scheda." (anche sotto il campo).
- Contatore "12/30 oggi", riparte a mezzanotte (Roma).

### Esiti senza errore (riquadro grigio)
"Non trovo dati per rispondere." + "Nessuna pratica visibile a te corrisponde alla richiesta."; "Le informazioni registrate non bastano per rispondere con certezza."; "Risposta parziale: non tutti i dati richiesti sono stati letti."; "Serve una precisazione: rispondi qui sotto."; "Rispondo solo sui dati di PracticeHub."; "Risposta troncata: restringi la domanda per averla completa."; "Non posso rispondere a questa domanda."; "La domanda riguarda troppe pratiche: restringi a un cliente, uno stato o un periodo."

### Interruzioni
"Risposta interrotta da te." / "Risposta interrotta." + "Il testo arrivato resta qui sopra. L'app funziona normalmente."; etichetta "RISPOSTA · INCOMPLETA"; "Riprova" conta come una domanda in più; l'app non riprova mai da sola.

### Errori tecnici (bordo rosso, con "L'app funziona normalmente. Se il problema continua scrivi a operations@hqe.it." e "Riprova")
"L'assistente non è disponibile in questo momento."; "L'assistente non ha risposto in tempo."; "Il servizio AI è al limite in questo momento: riprova più tardi."; "Errore dell'assistente."

### Limiti personali (bordo giallo)
"Hai usato 30 domande su 30 oggi." + "Il conteggio riparte domani (10/10/2026, ore 00:00)."; "Hai fatto 4 domande nell'ultimo minuto." + "Riprova tra 40 secondi."; "L'assistente è molto richiesto: riprova tra 2 secondi."

### Altri messaggi
"La conversazione è scaduta." + "Inizia una nuova conversazione: la domanda resta nel campo."; "Sessione scaduta: accedi di nuovo."; "Hai già una domanda in corso, anche in un'altra scheda del browser: attendi la risposta."; "I dati sono cambiati durante la lettura."; "La pratica del contesto non è disponibile: togli il contesto e riprova."; "Domanda non valida: scrivi da 1 a 2000 caratteri."; "Richiesta non consentita: ricarica la pagina."; pulsante "Vai in fondo".

## Configurazione → Assistente AI (solo amministratori)
- Menu "Notifiche e configurazione" → "Assistente AI": "Acceso o spento per tutti, e quante domande può fare ciascuno."
- Interruttore "Assistente attivo per tutti" (vale subito): "Assistente spento per tutti." / "Assistente acceso per tutti."; se spento nel server: "L'assistente è spento nella configurazione del server: finché resta così, questo interruttore non ha effetto."
- "Limiti per persona": "Domande al giorno" 1–100 (iniziale 30, "Il conteggio riparte a mezzanotte (ora di Roma).") e "Domande al minuto" 1–10 (iniziale 4, "Evita raffiche di domande."); fuori intervallo "Da 1 a 100." / "Da 1 a 10."; "Salva" → "Limiti salvati.".
- "Ultima modifica: 09/10/2026 alle 10:00, Nome Cognome." oppure "Valori iniziali: 30 al giorno, 4 al minuto." Ogni modifica è registrata.
- Errori: "Valori non ammessi: domande al giorno da 1 a 100, al minuto da 1 a 10."; "Solo gli amministratori possono cambiare l'assistente."; "Sessione scaduta: accedi di nuovo."; "Non è stato possibile salvare. Riprova tra poco."; "Impostazioni dell'assistente non disponibili."

## Link condivisibili
- **Elenco e archivio:** Cliente, Stato attività, Cerca, Creata dal / fino al, Ordina per, Anche non assegnate finiscono nell'indirizzo (es. `/pratiche?template=ILIAD&stato=ASSEGNATO&da=2026-10-01&tutte=1`; archivio `/pratiche/archivio?…` senza "Anche non assegnate"). Chi riceve il link vede lo stesso elenco con i propri permessi. La ricerca si aggiorna nell'indirizzo un attimo dopo aver smesso di scrivere. Cambiare un filtro non aggiunge passaggi alla cronologia del browser: "Indietro" torna alla pagina precedente, non al filtro precedente. Valori sbagliati nell'indirizzo vengono ignorati senza errore.
- **Statistiche:** un link può aprire Statistiche su cliente e periodo (`/statistiche?template=ILIAD&da=2026-10-01&a=2026-10-31`) o i Carichi su cliente e gruppo; cambiare i filtri nella pagina non aggiorna l'indirizzo. Cliente o gruppo non consentiti vengono ignorati.
- **Menu laterale (cambiamento):** un cliente nel menu apre l'elenco senza gli altri filtri; per cambiare cliente tenendo i filtri si usa il campo "Cliente" della barra dei filtri.
