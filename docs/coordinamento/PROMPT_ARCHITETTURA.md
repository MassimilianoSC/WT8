# Prompt per il modello più potente — Architettura del backend PracticeHub

**Uso:** Massimiliano apre una sessione con il modello più potente disponibile su questa cartella di progetto e incolla il blocco qui sotto. Tutto il necessario è nei file indicati: non serve incollare altro.
**Esito atteso:** un file di proposta in `docs/proposte/`. La memoria lo rivede contro il registro delle decisioni, registra le scelte adottate come D-n e ne ricava i compiti per o2. Il modello **non** scrive codice, **non** usa git, **non** scrive alle altre sessioni e **non** modifica `docs/coordinamento/`.

---

```
Sei l'architetto del backend di PracticeHub (cartella MEGADASHBOARD-main). Il tuo compito è PROGETTARE, non programmare: produci un documento di architettura che una sessione di sviluppo (o2) userà per scrivere il codice.

VINCOLI
- Non modificare nessun file del progetto, non eseguire git, non scrivere ad altre sessioni.
- Scrivi UN SOLO file: docs/proposte/ARCHITETTURA_BACKEND_v1.md (crea la cartella se manca).
- Non riaprire decisioni già prese e non proporre funzioni nuove. Le decisioni vincolanti sono in docs/coordinamento/DECISIONI.md (D-1…). Se trovi un conflitto reale tra decisioni, o una decisione impossibile da implementare così com'è scritta, segnalalo in una sezione apposita senza risolverlo tu.
- Stack fisso (riusare ciò che c'è): Next.js 14 App Router (route handler + servizi), MongoDB con driver ufficiale, NextAuth v5 (Credentials + JWT), Zod, TypeScript, Docker Compose. Niente nuovi database o servizi esterni senza motivarlo come rischio.
- Scrivi in italiano. Cita sempre le decisioni (D-n), le sezioni della Guida (G §n) e le righe degli MD (cliente, #riga, id_flusso) su cui ti basi.

DA LEGGERE (in quest'ordine)
1. docs/coordinamento/DECISIONI.md, RINVII.md, PIANO.md, CONTRATTO_DATI.md, STATO.md
2. docs/baseline/2026-10-08/GUIDA_RISTRUTTURAZIONE_DASHBOARD_PRACTICEHUB_v8.md (integrale)
3. I sei docs/baseline/2026-10-08/ASSOCIAZIONI_CAMPI_<CLIENTE>.md (integrali: sono la fonte canonica dei template)
4. docs/baseline/derivati/LISTE_VALORI_INIZIALI.csv e LISTE_VALORI_REPORT.md
5. MODIFICHE/PracticeHub/ESITO_CONTROLLO_FINALE.txt (correzioni master/mirror e punti in attesa: R-1)
6. Il codice attuale del server: CLAUDE.md, frontend/src/lib/ (db.ts, auth.ts, api.ts, mappers.ts, registry.ts, validators.ts, constants.ts), frontend/src/services/, frontend/src/app/api/
7. docs/coordinamento/ANALISI_SERVER_O2.md: analisi del server attuale fatta dalla sessione backend, con rischi e stime; le risposte già date sono tra parentesi quadre e in DECISIONI.md (D-66…D-73)
8. Se esiste, frontend/src/data/_inventario/ (condizioni.csv, dtype.csv, master_mirror.csv, ripetibili_liste.csv): inventario estratto dagli MD da usare come base per la sezione 2 invece di rifarlo da zero

COSA DEVE CONTENERE IL DOCUMENTO
1. Modello dati MongoDB: collezioni, forma dei documenti, indici, cosa è incorporato e cosa è separato. Decidi esplicitamente tra "documento unico per l'iterazione corrente aggiornato con un updateOne condizionato sulla revisione" e "Mongo replica set a un nodo con transazioni" (rischio R3 dell'analisi), motivando la scelta. Pratiche, iterazioni (ID interni, G7 non univoco: D-24/D-25), valori per id_flusso, righe dei gruppi ripetibili (D-36), campi trasversali (D-37), storico dei valori distinto dalla timeline (D-47), alert, notifiche, liste, utenti con appartenenze (cliente, gruppo, ruolo, leader) (D-19). Concorrenza: locking ottimistico con `revision` (D-67, contratto v0.1.4). Azzeramento dei dati attuali e seed demo (D-14).
2. Compilatore dei template (B2): come trasformare i sei MD nella forma TemplateDTO del contratto. Inventario di TUTTE le formulazioni di condizione presenti negli MD e per ciascuna la traduzione in ConditionDTO; quelle non traducibili vanno elencate. Gestione master/mirror, sezioni, ordine, dtype → DataType, liste (ListRefDTO), gruppi ripetibili, campi calcolati. Tabella di correzioni separata per applicare R-1 B1–B4 senza toccare gli MD. Prove automatiche di struttura (un solo MASTER per flowId, mirror con master esistente, sequenze continue).
3. Motore dei permessi: calcolo di OccurrenceAccessDTO per occorrenza e di PraticaActionsDTO per pratica (gruppo, ruolo, leader, ADMIN, Assegna ricevuto, mirror, archiviata, iterazione passata) (D-18–D-23, D-28).
4. Motore dello Stato attività (D-41): per ogni gestore, quali id_flusso sono trigger di quale stato; ordinamento per data scritta nel campo; ritorno all'ultimo evento valido quando un trigger viene svuotato; rapporto con le modifiche manuali di PM/ADMIN; comportamento all'apertura di una nuova iterazione. Pseudocodice + tabella di casi di prova, compresi i casi limite.
5. Motore delle formule e dei campi calcolati (D-32, D-37, D-42): Tipologia attività PE, Forecast Geologica, Forecast Ottenimento Permessi (base per gestore, spostamento per integrazione con controllo unico alla compilazione di Invio integrazione, blocco dopo modifica manuale, toast), ILIAD Forecast Protocollo, Fatturabile (default NO, SI automatico, blocco manuale, NO forzato da nuovo ciclo ARPA negativo). Quando si ricalcola, cosa si memorizza per sapere che un valore è stato modificato a mano.
6. Motore degli alert (D-43–D-46, G §17.10): per ogni regola e gestore, campi trigger e di chiusura (id_flusso); calendario dei giorni lavorativi con festività nazionali italiane (incluse quelle mobili); esecuzione giornaliera alle 09:00 Europe/Rome in un'app Next.js containerizzata (dove gira lo scheduler e come si evita la doppia esecuzione); idempotenza; reminder settimanali; risoluzione dei destinatari (PM leader del gestore + leader di gruppo, nessun sostituto); chiusura automatica e manuale; comportamento con pratiche archiviate e iterazioni precedenti; log.
7. Modifiche necessarie al contratto dati v0.1: elenco puntuale (cosa e perché). Le decide la memoria: tu le proponi soltanto.
8. Sequenza di implementazione per o2: lavori in ordine, ciascuno con file coinvolti, dipendenze, stima indicativa e prove. Strategia di prova OFFLINE per i motori (le prove attuali in backend/tests puntano a una preview online e non vanno usate per questo).
9. Rischi e punti da decidere: solo problemi reali, ciascuno con la decisione che serve e da chi (memoria, Massimiliano o collaboratore).

Alla fine, rispondi in chat solo con: percorso del file scritto, numero di pagine/sezioni, elenco dei punti della sezione 9.
```

