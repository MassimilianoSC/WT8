# Prompt per il modello più potente — Revisione dei motori del backend (D-53)

**Uso:** Massimiliano apre una sessione con il modello più potente disponibile su questa cartella di progetto e incolla il blocco qui sotto. Non serve incollare altro.
**Esito atteso:** un file `docs/proposte/REVISIONE_MOTORI_v1.md`. La memoria lo confronta con il registro, decide quali correzioni adottare (D-n) e le passa a o2. Il modello **non** modifica il codice, **non** usa git, **non** scrive alle altre sessioni e **non** modifica `docs/coordinamento/`.

---

```
Sei il revisore del codice dei motori del backend di PracticeHub (cartella MEGADASHBOARD-main). Il tuo compito è TROVARE DIFETTI, non riscrivere: produci un rapporto che la sessione di sviluppo (o2) userà per correggere.

VINCOLI
- Non modificare nessun file del progetto, non eseguire git, non scrivere ad altre sessioni.
- Scrivi UN SOLO file: docs/proposte/REVISIONE_MOTORI_v1.md.
- Puoi eseguire le prove esistenti (da frontend/: `yarn vitest run tests/server`) e scrivere prove tue SOLO in una cartella temporanea fuori dal progetto, per dimostrare un difetto. Nessuna connessione a database: le prove d'integrazione si saltano senza MONGO_TEST_URL, ed è giusto così. Mai la porta 27017.
- Non riaprire decisioni prese: sono vincolanti quelle in docs/coordinamento/DECISIONI.md (D-1…) e il contratto docs/coordinamento/CONTRATTO_DATI.md. Se una decisione produce un comportamento sbagliato o impossibile, segnalalo come "conflitto con D-n" senza risolverlo tu.
- Scrivi in italiano. Per ogni difetto: file e riga, scenario concreto (input → risultato sbagliato → risultato atteso), decisione o sezione violata, gravità (ALTA = dato sbagliato o perso, permesso sbagliato, effetto doppio; MEDIA = caso limite reale; BASSA = robustezza/chiarezza), correzione proposta in una o due frasi. Niente stile, niente refactoring estetici.

DA LEGGERE (in quest'ordine)
1. docs/coordinamento/DECISIONI.md (in particolare D-18…D-47, D-74, D-84…D-119; D-115 e D-119 sostituiscono la regola provvisoria D-95 sullo stato manuale), CONTRATTO_DATI.md, RINVII.md (R-16: regole provvisorie)
2. docs/proposte/ARCHITETTURA_BACKEND_v1.md §1.4, §3, §4, §5 (progetto originale; dove contrasta con il registro vale il registro)
3. docs/baseline/2026-10-08/GUIDA_RISTRUTTURAZIONE_DASHBOARD_PRACTICEHUB_v8.md §9–§15, §17.2–§17.7, §17.10
4. Il codice da rivedere (tutto in frontend/):
   a. src/lib/engines/conditions.ts + tests/fixtures/conditions-cases.json
   b. src/lib/engines/state.ts + src/data/state-rules.json
   c. src/lib/engines/formulas.ts + src/data/engine-bindings.json, sopra src/lib/calendario.ts e src/lib/formule-date.ts
   d. src/lib/engines/rows.ts (Vincoli → voce Ente; Ripresentazione Pratica → nuova riga ARPA)
   e. src/lib/engines/progress.ts
   f. src/lib/engines/access.ts + src/data/access-policy.json (permessi)
   g. src/lib/store/transaction.ts (runOperation: deduplica operationId, compare-and-swap della revision) e la protezione write_guards in src/services/users-v2.ts (ultimo PM leader, D-101)
   h. le prove in tests/server/ che coprono questi file

VERSIONE DA RIVEDERE: commit b13c8d7. Dopo quel commit c53b7c8 ha cambiato in src/lib/engines/access.ts SOLO i tipi (la chiave "TRASV.NOTE_OPERATIVE" diventa quattro chiavi "TRASV.NOTE_OPERATIVE.<GroupId>", stessa regola): le Note Operative diventano una per gruppo (D-121) e la loro regola di visibilità arriverà dopo questa revisione. Segnala pure ciò che vedi, ma tienine conto.

PUNTI DI ATTENZIONE SEGNALATI DALLO SVILUPPO (verificali, non darli per buoni)
- Formule: la "prima compilazione" di Invio integrazione si deduce dal confronto prima/dopo della riga; una riga creata già piena conta come prima compilazione.
- Un controllo memorizzato con base assente resta "non idoneo" per sempre per quella riga (D-96).
- Forecast Ottenimento Permessi in AUTO senza Protocollo diventa null.
- Le formule si calcolano anche sui campi nascosti dalle condizioni (D-31).
- Fatturabile dipende dal giorno di Roma passato dal chiamante; il job giornaliero degli alert (B7, non ancora scritto) dovrà usare lo stesso motore.
- write_guards: secondo lo sviluppo, senza la guardia due ADMIN che tolgono insieme due PM leader dello stesso gestore passerebbero entrambi (write skew). Verifica che la guardia copra TUTTI i percorsi che possono togliere l'ultimo PM leader.
- runOperation: id e orologio fuori dal callback di withTransaction; ricevuta in operations nella stessa transazione; collisione concorrente sulla ricevuta trattata come replay.

COSA CERCARE IN PIÙ
- Fusi orari: date civili YYYY-MM-DD contro istanti; giorno di Roma contro UTC; ora legale; anni bisestili; fine anno.
- Ripetibili: rowId stabili, ordine per ordinal, righe tolte e riaggiunte, righe create dal sistema; stessa riga contro "almeno una riga" nelle condizioni (contratto §3).
- Stato attività: tutte le date valide dell'iterazione, svuotamento del trigger vincente, date future, parità di data (D-109), regole "per valore" su Autorizzazione finale (TOWERNET/INWIT), fine dello stato manuale al primo evento automatico NUOVO e più recente (D-115, D-119), nuova iterazione.
- Fatturabile: AUTO/MANUAL, NO forzato una volta per riga, Negativo e SI manuale nello stesso salvataggio (D-96, D-109).
- Permessi: la stessa appartenenza (template + gruppo) mai combinata con un'altra; ADMIN che non modifica mirror, archiviate, iterazioni passate o calcolati non modificabili; utenti disattivati; ordine dei motivi (contratto §5.1).
- Idempotenza: un retry non deve produrre due effetti (storico, outbox, toast, NO forzato, nuova riga ARPA, voce Ente).
- Coerenza fra motori: per esempio, una voce Ente creata da rows.ts e il progress; il NO forzato e lo storico SYSTEM.

FORMATO DEL RAPPORTO
1. Sintesi: numero di difetti per gravità; giudizio complessivo (si può costruire sopra questi motori? sì / sì dopo le correzioni ALTE / no).
2. Difetti, ordinati per gravità, con il formato indicato sopra; per ognuno, se l'hai dimostrato con una prova scrivi "DIMOSTRATO" e riporta la prova nel testo.
3. Conflitti con decisioni (D-n) e casi che il registro non copre: elenco, senza risolverli.
4. Prove mancanti importanti: elenco dei casi da aggiungere.

Alla fine, rispondi in chat solo con: percorso del file scritto, numero di difetti per gravità, giudizio complessivo.
```
