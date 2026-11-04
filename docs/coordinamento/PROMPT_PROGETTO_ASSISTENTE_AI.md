# Prompt per il modello più potente — Progetto dell'assistente AI (D-117, D-165)

**Uso:** M chiede al modello più potente, aperto su questa cartella: «Leggi `docs/coordinamento/PROMPT_PROGETTO_ASSISTENTE_AI.md` ed esegui il compito descritto nel blocco di testo al suo interno».
**Esito atteso:** il file `docs/proposte/PROGETTO_ASSISTENTE_AI_v1.md`. La memoria lo confronta con il registro, porta a M le scelte che spettano a lui (una alla volta), registra le decisioni (D-n) e divide il lavoro tra o2 e o3.

---

```
Sei l'architetto dell'assistente AI di PracticeHub (cartella MEGADASHBOARD-main): un'app web interna (Next.js 14 + MongoDB in replica set, Docker, una sola macchina in sede, HTTPS su rete aziendale, ~20 utenti) che gestisce le pratiche dei siti di telecomunicazioni per sei clienti e quattro gruppi di lavoro. L'assistente deve essere pronto PRIMA del collaudo: fa parte della partenza (D-165). Il tuo compito è PROGETTARLO in modo che o2 (backend) e o3 (frontend) possano costruirlo senza altre domande, e che M possa decidere i punti aperti scegliendo tra opzioni chiare.

VINCOLI
- Non modificare nessun file del progetto, non eseguire git, non scrivere ad altre sessioni, non chiamare servizi esterni o API a pagamento.
- Scrivi UN SOLO file: docs/proposte/PROGETTO_ASSISTENTE_AI_v1.md.
- Puoi leggere tutto il codice e le prove; puoi eseguire le prove esistenti se ti servono, solo su un Mongo usa-e-getta che avvii tu su una porta libera diversa da 27017 (mai 27017).
- Non riaprire decisioni prese (docs/coordinamento/DECISIONI.md, CONTRATTO_DATI.md). Se una decisione rende il progetto sbagliato o impossibile, segnalalo come "conflitto con D-n".
- Italiano. Prezzi, quote, nomi e versioni dei modelli: indica la fonte e la data, oppure scrivi "da verificare sul listino al momento della costruzione". Non inventare numeri.

GIÀ DECISO (non rimettere in discussione)
- Funzione (baseline §17.14, D-50): livello conversazionale in SOLA LETTURA sopra i dati autorizzati; non modifica campi, stati, alert, non esegue azioni; stessi permessi dell'utente che chiede; risposte riconducibili ai dati della piattaforma; per i numeri usa le statistiche deterministiche dell'app quando esistono.
- Tempi (D-165): alla partenza, prima del collaudo.
- Dati (M, 09/10): nessun dato particolarmente sensibile; al modello possono andare dati delle pratiche, note e nomi dei colleghi, SOLO quelli visibili a chi chiede e utili alla domanda.
- Piattaforma proposta da M: Google Vertex AI, regione UE (es. Milano), modello Gemini non troppo pesante (famiglia Flash) adatto a ~20 utenti contemporanei. M crea lui il progetto Google Cloud. Nessun IP pubblico: l'app esce in HTTPS verso Google.
- Orientamento della memoria, da confermare o smentire con argomenti: niente RAG (i dati cambiano di continuo); strumenti (function calling) di sola lettura eseguiti dall'app al momento con i permessi dell'utente; riassunto pronto dell'utente nel contesto per le domande comuni; risposta in streaming; obiettivo 2–4 s, prime parole in 1–2 s.

DA LEGGERE
1. docs/baseline/2026-10-08/GUIDA_RISTRUTTURAZIONE_DASHBOARD_PRACTICEHUB_v8.md §17.14 (casi d'uso e vincoli) e le parti su ruoli, gruppi, alert, statistiche.
2. docs/coordinamento/DECISIONI.md (in particolare D-39, D-45, D-50, D-90, D-105, D-111, D-121, D-140, D-151…D-165), RINVII.md R-3 (discussione con M), CONTRATTO_DATI.md (forme dei DTO, errori, statistiche e carichi), PIANO_PRODUZIONE.md, CUTOVER.md (due tempi, D-161).
3. docs/proposte/ARCHITETTURA_BACKEND_v1.md e le tre revisioni (REVISIONE_MOTORI_v1, REVISIONE_PATCH_v1, REVISIONE_ALERT_v1): stile e rigore attesi.
4. Se esiste, docs/proposte/NOTA_UX_ASSISTENTE_O3.md (proposta di interfaccia di o3): usala come base per la parte frontend.
5. Il codice, in frontend/: src/data/access-policy.json e src/lib/engines/access.ts (permessi per campo e per gruppo), src/services/practices-v2/ (elenco, dettaglio, iterazioni, storico), src/services/stats.ts e le rotte stats/workload/export, src/services/alerts*.ts, src/services/notifications-v2.ts, src/services/users-v2.ts, src/lib/store/ (collezioni e indici), src/app/api/** (forma delle rotte e uso di handle/getSessionUser/parseBody), src/services/health.ts, deploy/ (compose, .env.example, README) e il ramo git cutover-o3 (interfaccia dopo il cutover del codice: niente beta, sessione { id, name, email, isAdmin }).

COSA PRODURRE (sezioni del file)
1. Sintesi in 10 righe per M.
2. Architettura: flusso di una domanda (passi, chi fa cosa, tempi stimati), dove gira il codice (rotta API, servizio, eventuale processo separato), streaming fino al browser attraverso il proxy Caddy, autenticazione verso Vertex (account di servizio, dove sta la chiave: fuori da git, montata in sola lettura come i certificati), regione, isolamento: se Google non risponde il resto dell'app funziona.
3. RAG sì/no: decisione motivata. Se proponi una ricerca nel testo libero (note, storico), dì con cosa (es. indice di testo MongoDB) e quando.
4. Catalogo degli strumenti di sola lettura: per ciascuno nome, scopo, parametri (schema), servizio esistente da riusare, controllo dei permessi applicato, limite di righe e di caratteri restituiti, esempio. Copri tutti i casi d'uso di §17.14 (forecast e scadenze di un periodo, cosa è previsto in una settimana o data, conteggi per cliente/gruppo/tecnico, consegne entro una data, pratiche con problemi o ritardi, perché una pratica non è avanzata dalle note, sintesi di carico e criticità). Nessuno strumento deve poter scrivere.
5. Permessi e sicurezza: come si garantisce che il modello non riceva MAI un dato che l'utente non può vedere (Note Operative di altri gruppi D-121, pratiche fuori dalle appartenenze, gruppi non attivati, iterazioni); difesa dal testo malevolo nelle note e nei campi (prompt injection) e perché la sola lettura limita il danno ma non la fuga di dati; limiti per utente (domande al minuto e al giorno) e tetto di spesa; cosa si scrive nei registri.
6. Comportamento delle risposte: istruzioni di sistema (testo proposto), lingua, date relative ("la prossima settimana", giorni lavorativi con il calendario dell'app), citazione delle pratiche con collegamento, "non lo so", rimando alle statistiche deterministiche, lunghezza.
7. Modello e costi: modello consigliato e alternativa; stima dei token per domanda tipica e del costo mensile con 20 utenti in tre scenari d'uso (basso, medio, alto), con formula esplicita e prezzi "da verificare"; quote Vertex da chiedere.
8. Contratto: rotte nuove, forma dei messaggi in streaming, fonti, errori (quota esaurita, Google non raggiungibile, domanda fuori ambito), da aggiungere a CONTRATTO_DATI.md.
9. Interfaccia: dove sta, come appare, domande suggerite per ruolo, coerenza con il design Swiss (raggio 0, bordi 1 px, colori di stato).
10. Registro delle conversazioni: opzioni (nessuno / solo metadati / testo completo con scadenza), con pro e contro.
11. Messa in esercizio: variabili in deploy/.env, segreti, controllo in /api/health e nel controllo esterno, voci da aggiungere a PIANO_PRODUZIONE.md, effetto sul cutover in due tempi (D-161) e sul collaudo.
12. Prototipo prima della costruzione: cosa misurare (tempi, qualità su 10 domande, costo per domanda), in quanto tempo, criteri per andare avanti o cambiare strada.
13. Prove: elenco di almeno 30 domande di prova con la risposta attesa sui dati del seed (indica i dati usati), divise per caso d'uso e per ruolo; prove sui permessi (domande che NON devono restituire dati); prove di injection; cosa resta alla revisione avversativa finale.
14. Piano di lavoro: compiti per o2 e per o3 in ordine, con dipendenze e stima in ore; cosa si può fare in parallelo al cutover del codice.
15. Domande per M: solo quelle che spettano a lui (budget, chi lo usa all'inizio, registro, ecc.), ognuna con opzioni, conseguenze e raccomandazione.
```
