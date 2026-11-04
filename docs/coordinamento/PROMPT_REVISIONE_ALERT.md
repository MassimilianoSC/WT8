# Prompt per il modello più potente — Revisione avversativa degli alert e del worker (D-117, D-131)

**Uso:** M chiede al modello più potente, aperto su questa cartella: «Leggi `docs/coordinamento/PROMPT_REVISIONE_ALERT.md` ed esegui il compito descritto nel blocco di testo al suo interno».
**Esito atteso:** il file `docs/proposte/REVISIONE_ALERT_v1.md`. La memoria lo confronta con il registro, decide le correzioni (D-n) e le passa a o2.

---

```
Sei il revisore avversativo del motore degli alert di PracticeHub (cartella MEGADASHBOARD-main): regole WT8, calendario lavorativo, job giornaliero delle 09:00 in un processo worker separato, lease e fencing, recapito delle mail tramite outbox, riconciliazione dentro il salvataggio dei campi. Gira da solo ogni mattina e manda mail a persone reali: un errore qui significa alert persi, doppi, sbagliati o mai chiusi. Il tuo compito è TROVARE DIFETTI, non riscrivere.

VINCOLI
- Non modificare nessun file del progetto, non eseguire git, non scrivere ad altre sessioni.
- Scrivi UN SOLO file: docs/proposte/REVISIONE_ALERT_v1.md.
- Puoi eseguire le prove esistenti (da frontend/: `yarn vitest run tests/server`) e scrivere prove tue SOLO in una cartella temporanea fuori dal progetto. Database: solo un Mongo usa-e-getta che avvii tu, in replica set a un nodo, su una porta libera diversa da 27017; mai la porta 27017. Nessun invio di mail reali (SMTP spento).
- Non riaprire decisioni prese (docs/coordinamento/DECISIONI.md, CONTRATTO_DATI.md). Se una decisione produce un comportamento sbagliato o impossibile, segnalalo come "conflitto con D-n".
- Italiano. Per ogni difetto: file e riga; scenario concreto (input, giorno e ora → risultato sbagliato → atteso); decisione violata; gravità (ALTA = alert perso, doppio, a destinatario sbagliato o mai chiuso, mail duplicata o mandata dopo la chiusura, dato modificato per errore dal job; MEDIA = caso limite reale; BASSA = robustezza); correzione proposta in una o due frasi. Niente stile.

DA LEGGERE
1. docs/coordinamento/DECISIONI.md (in particolare D-37, D-43…D-46, D-70, D-90, D-96, D-97, D-109, D-115…D-116, D-119, D-126, D-131…D-133), CONTRATTO_DATI.md §6 (soglie) e §8 (alert e notifiche), PIANO_PRODUZIONE.md (voci PR-13…PR-17)
2. docs/baseline/2026-10-08/GUIDA_RISTRUTTURAZIONE_DASHBOARD_PRACTICEHUB_v8.md §10, §12, §17.10
3. docs/proposte/ARCHITETTURA_BACKEND_v1.md §6 (progetto originale; dove contrasta con il registro vale il registro), REVISIONE_MOTORI_v1.md e REVISIONE_PATCH_v1.md (revisioni precedenti, già corrette)
4. Il codice, tutto in frontend/: src/data/alert-bindings.json, src/data/alert-rules.json, src/lib/alerts/ (motore puro e destinatari), src/services/alerts-engine.ts, src/services/alerts-job.ts (il commento iniziale riassume il flusso), src/services/practices-v2/alert-hook.ts e il suo uso in fields.ts, src/services/alerts.ts (chiusura manuale, sospensione e ripresa), src/lib/jobs/ (lock, runs, outbox-delivery), src/jobs/worker.ts, src/lib/calendario.ts, src/lib/engines/formulas.ts (Fatturabile temporale), e le prove in tests/server/

COSA CERCARE
- Catalogo: ogni regola di G §17.10 per ogni gestore, con trigger, chiusura, direzione, soglia, ambito (CDMS solo ILIAD con CELLNEX; Offerta esclusi FV e LEONARDO; ODA FV con Stato ODA vuoto = DA_RICHIEDERE; ARPA per riga) e destinatari (PM leader + leader competenti, TIM Forecast PE anche DL; nessun sostituto). Ogni flowId deve essere quello giusto nel template compilato attuale.
- Tempo: giorni lavorativi con festività nazionali (Pasquetta, 4 ottobre dal 2026), rinvio al primo lavorativo alle 09:00 di Roma, ora legale/solare, fine anno, "una settimana" = 7 giorni di calendario, promemoria settimanali solo CDMS_EM e OFFERTA_ODA con ancore che non slittano, job solo nei giorni lavorativi dalle 09:00.
- Episodi: nessun doppione (chiave unica, refresh, retry, due worker), riprogrammazione quando cambia il trigger, chiusura automatica nel salvataggio e nel job, chiusura manuale definitiva, nuova generazione solo dopo una risoluzione (D-97), FATTURABILE_KO secondo D-131, alert di iterazioni sostituite e pratiche archiviate (sospesi, mai riaperti in raffica al ripristino).
- Concorrenza e guasti: lease scaduta, fencing in ogni scrittura, worker che perde la lease a metà, crash prima/dopo il commit, ripresa dal cursore, job_runs, catch-up dopo giorni di fermo (un solo invio per episodio), salvataggio di un utente in contemporanea al job sulla stessa pratica (revision).
- Recapito: outbox con claim e lease, ritentativi, mail solo dove previsto (D-46), nessuna mail per alert chiuso, sospeso o sostituito prima dell'invio, destinatario disattivato, escape HTML, nessun dato riservato (es. Note Operative di altri gruppi, D-121) nel testo.
- Fatturabile temporale nel job: stesso motore delle formule, blocco manuale, NO forzato, storico SYSTEM, nessun ricalcolo su archiviate o iterazioni passate.
- Esercizio su un solo PC (D-134): cosa succede se il PC è spento alle 09:00, se l'orologio è sbagliato, se il database non risponde; il worker si riavvia da solo e lo segnala?

FORMATO DEL RAPPORTO
1. Sintesi: difetti per gravità; giudizio (si può mettere in esercizio? sì / sì dopo le correzioni ALTE / no).
2. Difetti ordinati per gravità, con "DIMOSTRATO" e la prova quando l'hai riprodotto.
3. Conflitti con decisioni e casi non coperti dal registro.
4. Prove mancanti importanti.

Alla fine rispondi in chat solo con: percorso del file, difetti per gravità, giudizio.
```
