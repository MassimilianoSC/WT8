# PracticeHub — Piano di lavoro

**Penna unica:** memoria. Stato dei lavori: `da fare` · `in stima` · `in corso` · `consegnato` (commit indicato) · `verificato` (controllato dalla memoria nel codice).
**Riferimenti:** decisioni `DECISIONI.md` (D-n) · rinvii `RINVII.md` (R-n) · contratto `CONTRATTO_DATI.md` · baseline `docs/baseline/2026-10-08/`.
**Regola di ordine:** prima le fondamenta, per ultime le parti toccate dai rinvii (R-1, R-16), così le risposte del collaboratore entrano senza rifare lavoro.
**Sequenza backend (D-89, architettura §8):** B2 → B3 → B4 → B6 → motori di B5 → API di B5 → B7 (+ worker) → B8/B9 → cutover (D-68).

---

## Backend — o2

| ID | Lavoro | Dipende da | Decisioni | Stato |
|---|---|---|---|---|
| B0 | **Repository git**: `git init` nella root, `.gitignore` (node_modules, .next, .env*, build, file temporanei), commit iniziale `[o2]` dello stato attuale. Verificare che `.env` non entri nel repository. | — | D-6, D-11 | verificato (4cabe1f) |
| B1 | **`src/lib/contract.ts`**: tipi TypeScript fedeli a `CONTRATTO_DATI.md` v0.1, senza logica. | B0 | D-5 | verificato (0a03a77) |
| B2 | **Compilatore dei template**: script che legge i sei MD di `docs/baseline/2026-10-08/` e produce `src/data/templates/<TEMPLATE>.json` nella forma `TemplateDTO` (sezioni, occorrenze, master/mirror, condizioni strutturate, liste, gruppi ripetibili, campi calcolati). Con prove: un solo MASTER per flowId, mirror con master esistente, sequenza continua, condizioni non interpretabili segnalate. I casi R-1 B1–B4 sono applicati secondo la proposta del file `ESITO_CONTROLLO_FINALE.txt` tramite una **tabella di correzioni separata** (facile da cambiare). Comprende `lib/contract.ts` v0.1.7 e le rotte `GET /api/templates[/{id}]`. | B1 | D-29–D-36, D-72, D-73, D-76–D-78, D-92, D-93, D-99, D-100, D-103 | verificato (8a350e8, 8a203fe, 0a762ab, 5aade1e) |
| B3 | **Modello dati e reset**: collezioni di D-91, transazioni su replica set a un nodo, `revision` della pratica, `operationId`, outbox (D-90); script di azzeramento e seed demo (D-69). | B2 | D-13, D-14, D-24, D-36, D-37, D-47, D-69, D-90, D-91, D-104 | verificato (72d1c16) |
| B4 | **Utenti, appartenenze e permessi**: coppie (cliente, gruppo, ruolo, leader), flag ADMIN, sessione NextAuth aggiornata, calcolo di `access` per occorrenza e di `actions` per pratica. | B3 | D-17–D-23, D-39, D-94, D-101, D-105 | verificato (2417f65); write_guards rivisti dal modello potente (D-126, M-04 corretto) |
| B5 | **In due tempi:** B5a motori puri (condizioni, stato, formule, vincoli, progress) → revisione col modello potente (D-53) → B5b servizi e rotte. **API pratiche v2**: elenco, dettaglio, iterazioni passate, scrittura campi (permessi, condizioni ricontrollate, formule, toast), resolve-template e creazione, Assegna (notifiche e mail), Stato attività (motore automatico + manuale), archiviazione, ripristino, cancellazione, rilavorazione, ripresentazione totale. | B4 | D-16, D-20–D-28, D-32, D-37, D-41, D-42, D-95, D-96 | fatto: motori rivisti e corretti (D-126); servizi e rotte consegnati; PATCH dei campi rivisto e corretto (D-132, adb15a1, verificato anche con le riproduzioni del revisore); rotte in collisione al cutover |
| B6 | **Liste e Configurazione**: API liste, seed da `docs/baseline/derivati/LISTE_VALORI_INIZIALI.csv`, soglie degli alert, resolve-template, ISTAT a cascata (dataset: R-13), "Altro". | B3 | D-16, D-40, D-46, D-71, D-86, D-99, D-100, D-103, D-106 | verificato (d183179); dataset ISTAT importato (d049a67) |
| B7 | **Alert e notifiche**: motore delle regole WT8, giorni lavorativi con festività nazionali, esecuzione giornaliera alle 09:00, reminder, destinatari (PM leader + leader di gruppo), chiusura automatica e manuale, mail; worker separato con lease (D-97). | B5 | D-43–D-46, D-97 | consegnato (5d6e7c5), rivisto (D-137) e corretto: C1 fbdb010, C3 802308e, C2 6107bbb, C4 eadfa0e (14/14); packaging del worker da fare (PR-13) |
| B8 | **Storico, KPI, export** (contratto v0.2). | B5 | D-47, D-48, D-111 | consegnato (6335632), export per tutti e filtro date (668e9fc, dee02eb); /api/stats al cutover |
| B9 | **Import v2** (richiede contratto v0.2). | B5, B6 | D-49 | consegnato (aac9e79, 596342c), verificato dal vivo (a5957e8), idempotenza della conferma corretta (6487df1) |
| B10 | **Assistente AI** in sola lettura, **alla partenza** (D-165). | R-3 | D-50, D-165 | progetto ricevuto (`docs/proposte/PROGETTO_ASSISTENTE_AI_v1.md`, stima o2 36–50 h, o3 16–23 h); **fatto su main (`05c5d01`)**: backend, interfaccia, prototipo con Google (gemini-3.5-flash-lite su eu, D-179/D-180); da provare all'installazione: stream HTTPS e provider scollegato; revisione avversativa finale prima della partenza |

## Frontend — o3

| ID | Lavoro | Dipende da | Decisioni | Stato |
|---|---|---|---|---|
| F0 | **Analisi e stima**: lettura dell'interfaccia attuale (pagine, componenti, design system) e stima di F1–F3 rispetto al contratto v0.1. Nessun codice. | — | D-7, D-52 | consegnato |
| F1 | **Struttura dell'app**: navigazione per cliente/template, filtri, elenco pratiche (`PraticaSummaryDTO`), intestazione con Stato attività e campi trasversali; testi in italiano. Può partire con dati finti tipizzati sul contratto. | B1 | D-15, D-37, D-41, D-52 | consegnato (043c620, 5240e2c) |
| F2 | **Scheda pratica**: sezioni apribili/chiudibili per gruppo, campi per `dataType`, mirror e campi non editabili in sola lettura (con il motivo), condizioni valutate dal client, gruppi ripetibili, pop-up, iterazioni passate in sola lettura, storico, indice delle sezioni, toast. | B1 (B5 per i dati veri) | D-29–D-38, D-81 | consegnato su dati finti e sui template veri (61a127d); Note Operative per gruppo (b9ba6f5); cascata ISTAT nel salvataggio (de75279); scelte estetiche definitive (D-122) |
| F3 | **Comandi**: creazione con scelta del template, Assegna (uno o più gruppi), cambio stato, archivia/ripristina, cancella, rilavorazione, ripresentazione; Archivio. | F2, B5 | D-16, D-20–D-28 | consegnato su dati finti (2eb56cf), Archivio (781fbd6), filtro Da/A ed export per tutti (aef60d0, 87a65e6); collegamento alle API al cutover |
| F4 | **Configurazione** (liste per gestore, per team leader e ADMIN) e **gestione utenti** (ADMIN: appartenenze e leader). | B4, B6 | D-19, D-40, D-101 | consegnato su dati finti (b9a52bc), soglie degli alert comprese; collegamento alle API dopo B4/B6 |
| F5 | **Notifiche e alert**: campanella, link al campo/sezione, evidenza dei campi con alert attivi, chiusura manuale. | B7 | D-44–D-46 | consegnato su dati finti (4d03464); campanella nuova accesa al cutover |
| F6 | **KPI, export, carichi di lavoro** (contratto §9–§11). | B8 | D-48, D-111 | consegnato su dati finti (679171d) |
| F7 | **Import** in due passi (anteprima, conferma) per l'ADMIN (contratto §12). | B9 | D-49, D-111 | consegnato e verificato dal vivo sul server vero (a5957e8) |

## Lavori di supporto di o2 (fuori dalla sequenza B, non dipendono dall'architettura)

| ID | Lavoro | Stato |
|---|---|---|
| S1 | Inventario pre-B2 dagli MD (`frontend/src/data/_inventario/`) | verificato (e8a401f) |
| S2 | next-auth a versione fissa | verificato (96d0a29) |
| S3 | Calendario lavorativo e formule di calendario (funzioni pure) | verificato (0f450a6) |
| S4 | Spostamento forecast per integrazione, data di scatto di Fatturabile, Tipologia attività PE (funzioni pure) | consegnato (1cb0e64) |
| S5 | Escape HTML nelle mail (R8) | consegnato (7f1823b) |
| S6 | Script di backup, ripristino e verifica del database locale (`yarn db:backup / db:verify / db:restore`) | consegnato (e1c4ef9) |
| S7 | Dataset ISTAT (file scaricato da M, import di o2: 20 regioni, 107 province, 7.896 comuni) | consegnato (d049a67) |
| S8 | Anteprima isolata (`yarn dev:anteprima`, Mongo usa-e-getta, porte libere da 27018/3200) | consegnato (6aa2e94); primo login da provare (M) |

## Memoria

| ID | Lavoro | Stato |
|---|---|---|
| M1 | Contratto dati v0.2 (KPI, export, carichi, import) prima di B8/B9/F6. | fatto (v0.2.0, D-111) |
| M2 | Guida utente e checklist di collaudo, man mano che le funzioni vengono consegnate. | in corso: guida con schermate (`docs/guida/GUIDA_UTENTE.md`, b5ffab0) e checklist di collaudo (`docs/guida/CHECKLIST_COLLAUDO.md`) scritte; da rifare le schermate 02 e 10c dopo le correzioni grafiche di o3 |
| M3 | Chiudere R-1 quando arrivano le risposte del collaboratore e passare le correzioni a o2 (tabella di correzioni di B2). | fatto (D-100…D-102) |
| M5 | Note per il collaboratore accumulate in fondo a `ESITO_CONTROLLO_FINALE.txt` (refusi degli MD): inviarle insieme a R-1. | superato (il collaboratore ha risposto a tutto: R-1, R-16, R-18 chiusi) |
| M6 | Revisione dell'architettura backend v1 contro il registro: D-89…D-99, contratto v0.1.7, domande R-16. | fatto |
| M7 | Piano del cutover (`CUTOVER.md`): parte frontend dall'inventario di o3; parte backend da completare con o2 dopo B5. | in corso |
| M8 | Revisioni col modello potente (D-53, D-117): motori (fatto, D-126), PATCH (fatto, D-132), alert B7 (da fare, alla consegna). | in corso |
| M9 | Piano per la produzione (`PIANO_PRODUZIONE.md`): salvaguardia e integrità dei dati, continuità, sicurezza, aggiornamenti, passaggio; tenuto aggiornato a ogni consegna. | in corso: packaging di o2 (D-156) K1–K6, PR-22, PR-18, protezioni D-158 e **cutover del codice su main (`5227567`)** fatti; poi K6, PR-22, PR-18 e cutover del codice (D-161) |
| M4 | Preparare la pubblicazione (comandi, controlli, cosa cambia per l'utente), nel rispetto delle misure di hardening già concordate (backup, staging, rollout). | da fare |
