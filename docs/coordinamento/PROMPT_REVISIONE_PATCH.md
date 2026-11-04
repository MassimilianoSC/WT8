# Prompt per il modello più potente — Revisione avversativa del salvataggio dei campi (D-117)

**Uso:** quando la memoria lo dice, M chiede al modello più potente, aperto su questa cartella: «Leggi `docs/coordinamento/PROMPT_REVISIONE_PATCH.md` ed esegui il compito descritto nel blocco di testo al suo interno».
**Esito atteso:** il file `docs/proposte/REVISIONE_PATCH_v1.md`. La memoria lo confronta con il registro, decide le correzioni (D-n) e le passa a o2.

---

```
Sei il revisore avversativo del salvataggio dei campi di PracticeHub (cartella MEGADASHBOARD-main): PATCH /api/practices/{id}/fields, il punto in cui si incontrano permessi, normalizzazione, righe ripetibili, formule, Stato attività, storico e transazioni. Il tuo compito è TROVARE DIFETTI, non riscrivere.

VINCOLI
- Non modificare nessun file del progetto, non eseguire git, non scrivere ad altre sessioni.
- Scrivi UN SOLO file: docs/proposte/REVISIONE_PATCH_v1.md.
- Puoi eseguire le prove esistenti (da frontend/: `yarn vitest run tests/server`) e scrivere prove tue SOLO in una cartella temporanea fuori dal progetto. Nessuna connessione a database salvo un Mongo usa-e-getta che avvii tu su una porta libera diversa da 27017; mai la porta 27017.
- Non riaprire decisioni prese (docs/coordinamento/DECISIONI.md, CONTRATTO_DATI.md). Se una decisione produce un comportamento sbagliato o impossibile, segnalalo come "conflitto con D-n".
- Italiano. Per ogni difetto: file e riga; scenario concreto (input → risultato sbagliato → atteso); decisione o sezione violata; gravità (ALTA = dato sbagliato o perso, permesso sbagliato, effetto doppio, informazione riservata esposta; MEDIA = caso limite reale; BASSA = robustezza); correzione proposta in una o due frasi. Niente stile.

DA LEGGERE
1. docs/coordinamento/DECISIONI.md (in particolare D-18…D-47, D-74, D-84…D-130), CONTRATTO_DATI.md (§1, §3, §5, §7), CUTOVER.md
2. docs/proposte/REVISIONE_MOTORI_v1.md: la revisione precedente dei motori e le sue correzioni (D-126, D-127)
3. Il messaggio di consegna di o2 riportato dalla memoria nel registro o nello STATO, e il riepilogo del flusso che o2 ha scritto per te (vedi il commit di consegna dell'orchestrazione del PATCH: `git log` non puoi usarlo, quindi cerca in frontend/src/services/practices-v2/ il file del salvataggio e i suoi commenti)
4. Il codice: frontend/src/services/practices-v2/ (salvataggio e comandi), frontend/src/lib/practice/ (normalizzazione, dettaglio, note), frontend/src/lib/engines/ (permessi, righe, formule, stato, condizioni, progress), frontend/src/lib/store/ (transazioni, oplog, db), le rotte in frontend/src/app/api/practices/, e le prove in frontend/tests/server/

COSA CERCARE
- Tutto-o-niente: un rifiuto o un errore a metà non deve lasciare nessun effetto (valori, righe, storico, eventi, outbox, ricevuta, revisione).
- Ordine degli errori: 404 → 409 ITERATION_CONFLICT → 403 con TUTTI i rejected → 422 → 409 REVISION_CONFLICT. Un utente senza permesso non deve scoprire dettagli di validazione.
- Permessi per ogni tipo di modifica: campo semplice (solo il MASTER, mai un mirror anche conoscendone il flowId), campo di riga, ADD_ROW, REMOVE_ROW (righe locked, VINCOLI), vincoli (ente unico non modificabile), trasversali (Fatturabile/Fatturato PM+ADMIN; Note Operative del proprio gruppo dopo l'Assegna, D-121), calcolati non modificabili (rejected COMPUTED). ADMIN: mai mirror, archiviate, iterazioni passate.
- Riservatezza D-121: le Note Operative di gruppi non visibili non devono uscire da risposta, rejected, toast, storico o messaggi d'errore.
- Normalizzazione D-110, liste (codici attivi o già salvati), utenti assegnabili, cascata ISTAT coerente (422).
- Composizione dei motori: righe di sistema (voce Ente, nuova riga ARPA) → formule → stato; formule anche su campi nascosti (D-31); manualWrites (D-96); NO forzato una volta per riga (D-96, D-109); fine dello stato manuale (D-119, D-126, D-127); toast solo a valore cambiato.
- Idempotenza: un retry (anche concorrente) con la stessa operationId non produce secondi effetti, e risponde con gli stessi toast e createdRows.
- Ripetibili: rowId e ordinal decisi dal server, mai riusati; ordine dell'array diverso dall'ordinal; createdRows.
- Storico: una voce USER per ogni valore davvero cambiato, SYSTEM con motivo per righe e formule, ROW_REMOVE con rowSnapshot, noteGroup per le note; nessuna voce per valori invariati.
- Riepilogo e progress coerenti con il dettaglio.
- Punto di aggancio per la chiusura automatica degli alert da compilazione (D-97): esiste e non può essere saltato.

FORMATO DEL RAPPORTO
1. Sintesi: difetti per gravità; giudizio (si può pubblicare il PATCH e collegarci il frontend? sì / sì dopo le correzioni ALTE / no).
2. Difetti ordinati per gravità, con "DIMOSTRATO" e la prova quando l'hai riprodotto.
3. Conflitti con decisioni e casi non coperti dal registro.
4. Prove mancanti importanti.

Alla fine rispondi in chat solo con: percorso del file, difetti per gravità, giudizio.
```
