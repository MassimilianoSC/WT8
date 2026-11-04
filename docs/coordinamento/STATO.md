# PracticeHub — Stato del momento

**Da leggere per primo dopo un'interruzione.** Aggiornato: 08/10/2026, fine giornata — penna unica: memoria.

## Dove siamo

- **Lavori aperti:** elenco unico in `LAVORI_APERTI.md` (chi fa cosa, chi aspetta chi), aggiornato a ogni consegna.
- **Requisiti:** baseline **corretta** del collaboratore in `docs/baseline/2026-10-08/` (D-114). Registro `DECISIONI.md` (D-1…D-190). Rinvii in `RINVII.md`: aperti solo quelli a bassa priorità di M. Al collaboratore non restano domande.
- **Contratto dati:** v0.3.4.
- **Frontend (o3):** tutte le schermate del primo rilascio pronte su dati finti (F1–F7, Archivio, Note Operative per gruppo, filtro date, export); scelte estetiche definitive (D-122). Si collega alle API vere al cutover.
- **Backend (o2):** compilatore, modello dati, permessi, liste, ISTAT, comandi, storico, elenco, notifiche, statistiche/export consegnati; motori di calcolo rivisti e corretti (D-126); salvataggio dei campi (PATCH) consegnato, rivisto e corretto (D-132); motore degli alert consegnato, rivisto e corretto (D-137); import (B9) consegnato.
- **Produzione:** piano delle misure di salvaguardia in `PIANO_PRODUZIONE.md` (obbligatorio prima del cutover).
- **Dopo:** B7 completo + sua revisione avversativa → B9 → collaudo completo → cutover (D-125, `CUTOVER.md`).
- **Database della beta** (27017, app :3100): non contiene dati veri (D-124); si azzera al cutover dopo il backup.

## In corso

| Chi | Lavoro | Note |
|---|---|---|
| o2 | A13 azzeramento "solo pratiche", poi A6/A7; disponibile per l'installazione | Assistente AI su main (05c5d01) |
| o3 | In attesa dell'installazione (schermata 12a con il modello vero) | Integrazione dell'assistente, renderer, unione (883edc3), checklist dell'assistente |
| Memoria | Guida utente e checklist di collaudo (M2): prima stesura | — |

## Cosa aspetta M

*M (08/10): le domande aperte gliele propone la memoria quando servono, una alla volta. R-19 al momento del collaudo, le altre quando diventano necessarie.*

| Cosa | Riferimento |
|---|---|
| **Al ritorno dalla pausa: 4 domande per il packaging** (server di posta, nome/IP e porta per il certificato, nome ed email del sostituto, controllo esterno pianificato) | D-156 |
| **Settimana del 12/10: mail all'IT** per cartella di rete delle copie, UPS e PC dei test (testo pronto in RINVII, R-19) | D-144 |
| Continuità con un solo PC (backup fuori dal PC, UPS, PC di riserva…), prima del cutover | R-19 |
| Voci a bassa priorità quando comodo | R-3, R-7, R-8, R-11, R-12 |

## Sessioni

I nomi delle sessioni **non** si scrivono qui: cambiano a ogni riavvio. Si leggono con ListAgents e si usano solo dopo che la sessione si è presentata (D-8). Sullo stesso computer girano anche sessioni di altri progetti (hq-document-studio, app-cantier-qrcode): non vanno mai contattate.

## Ultimi eventi

- 11/10 — **Installazione completata** su HQE-016: dati fittizi (30 pratiche), commenti con menzioni (D-183…D-185), due aggiornamenti (`2026-10-11a`, `2026-10-11b`), beta spenta (D-181), prova di carico con 20 utenti superata, controllo esterno attivo. Collaudo dai collaboratori a partire dal 12/10.
- 10/10 sera — **Installazione definitiva avviata su HQE-016** (https://172.16.1.116:8443, stack `practicehub`, `practicehub_prod`): certificato, `.env`, 5 container sani, primo accesso di M ("veramente bella"), `/api/health` ok, prima copia ed export fatti. Domani: dati fittizi via import (6 file di o2), prima domanda all'assistente, spegnimento della beta, certificato ai colleghi, firewall, controllo esterno, prova di carico.
- 10/10 — **Assistente AI su main** (`05c5d01`): prototipo con Google riuscito (gemini-3.5-flash-lite su endpoint eu, D-179/D-180: 10/10, ~1,3 s, ~0,0025 $ a domanda); prova generale fase 2 conclusa; checklist con la sezione dell'assistente. Decisioni di M: una sola installazione su HQE-016 (D-177/D-178), beta spenta all'installazione (D-181). **App pronta per l'installazione**, M primo a provarla.
- 09/10 sera — Fine giornata: passaggi di o2 e o3 salvati in CONTINUITA_O2/O3.md. o2: assistente 3/n (`5ddde9f`, provider finto, conversazione, orchestratore NDJSON) su `assistente-o2`. o3: correzioni d'interfaccia `4f5b41b`, prova generale fase 2 in gran parte OK (restano G3, G6, I2, L1, L2, L3, L7 diretto), schermate della guida definitive. Tutto spento tranne il Mongo di prova di o2 (27021). Lunedì: mail all'IT.
- 09/10 sera — **Cutover del codice su main** (`5227567`, D-161 punto a): login v2, seed della beta tolto, primo ADMIN con cambio password (D-173), interfaccia dell'assistente unita; unico giro completo verde (~15 min). Regole sulle prove precisate (D-174 tsc una volta e incrementale, D-175 niente giri ripetuti). Progetto Google Cloud creato da M.
- 09/10 pomeriggio — Progetto dell'assistente AI ricevuto (3c27dbc); decisioni di M D-166…D-171 (versione snella, budget Google 50 $ con avvisi, Gemini Flash in UE, tutti gli utenti con interruttore ADMIN, solo metadati, limiti configurabili); contratto v0.4.0 §13. PR-18 fatto (f5761be): blocco di produzione chiuso. o2 sul cutover del codice (ramo cutover-o2), o3 sull'interfaccia dell'assistente (ramo assistente-o3). M crea il progetto Google Cloud.
- 09/10 pomeriggio — K6 consegnato e verificato (f37d138): versione dei dati, aggiornamento con ritorno indietro provato, avviso su C:; packaging chiuso. Primo giro completo secondo D-164: verde, ~14 min. Pagine di accesso in italiano sul ramo cutover-o3 (22f591a). M lancia il progetto dell'assistente AI sul modello potente.
- 09/10 pomeriggio — Una sola @types/react (55744d7, o2, segnalazione di o3). Assistente AI alla partenza (D-165): discussione con M in corso (RINVII R-3).
- 09/10 pomeriggio — K5 consegnato e verificato (08d3e30): /api/health, controllo esterno di Windows con mail guasto/risolto a M e operations@hqe.it (PR-15, PR-16, PR-17 in parte); manca il controllo di C:, chiesto in K6. Prove secondo D-164 (nessun giro completo).
- 09/10 pomeriggio — Prova generale della checklist (o3, fase 1) chiusa: quasi tutto OK, b62ee6c e b826a63; correzioni a checklist e guida da fare (memoria), 4 punti a o2, fase 2 dopo il cutover del codice; o3 prepara 3.2/3.6 sul ramo cutover-o3. D-164 regole sulle prove (misura: o2 131 min, o3 46 min; giro completo solo a fine blocco). **Rimisura il 16/10** con `docs/coordinamento/strumenti/misura_prove.py`.
- 09/10 pomeriggio — K3 consegnato e verificato (cc8cb08): HTTPS su https://172.16.1.116:8443 con proxy dedicato e certificato mkcert (PR-21). M guarda la nuova app sull'anteprima di o3.
- 09/10 pomeriggio — Etichette distinte per le liste dei vincoli (353ae67, o2; visibili nei database nuovi).
- 09/10 pomeriggio — K4 consegnato e verificato (9eb7a87): copie notturne su D: con verifica e conservazione 14/13/12 (PR-01, PR-02 primo livello; PR-03 procedura). Decisioni di M: D-159 posta, D-160 indirizzo, D-162 avvisi, D-163 controllo esterno; D-161 cutover in due tempi (stima o2 12–16 h).
- 09/10 pomeriggio — K2 consegnato e verificato (990d5fb): stack di esercizio separato dalla beta, Mongo senza porte pubblicate, riavvio automatico dei container, rotazione dei log (PR-10, PR-20; PR-13, PR-17, PR-19 in parte). Checklist di collaudo scritta (`docs/guida/CHECKLIST_COLLAUDO.md`).
- 09/10 pomeriggio — Guida utente con 22 schermate (b5ffab0). Protezioni del database di esercizio consegnate e verificate (20fe4cd, D-158); seed della beta in getDb da togliere al cutover prima di aprire lo stack di esercizio (CUTOVER 3.5).
- 09/10 — Import verificato dal vivo: tutte le funzioni del primo rilascio provate sul server vero nell'anteprima. o2 al packaging (D-156).
- 09/10 — Import da Excel completo (596342c): anteprima e conferma, mai sovrascrivere campi compilati. Tutte le funzioni del primo rilascio esistono ora lato server.
- 09/10 — Verifica dal vivo completa salvo l'import: alert (apertura, chiusura manuale, FATTURABILE_KO), login corretto (ba3b8aa, confermato da o3).
- 09/10 — Correzioni degli alert complete (D-137, eadfa0e). Decise con M le misure di esercizio: copie su D: (D-144), UPS (D-145), PC dei test come riserva (D-146), partenza dal team PM (D-149), responsabile e operations@hqe.it (D-150), HTTPS (D-151), credenziali demo dopo il collaudo (D-152); avvio automatico rimandato con le opzioni (R-19 punto 4).
- 09/10 — Pausa di un'ora (riunione di M). Anteprima su dati reali provata dal vivo (D-141). Correzioni alert C1 e C3 fatte.
- 09/10 mattina — Ripresa: o2 sulle correzioni degli alert (D-137, D-139), o3 sul dettaglio dell'anteprima dell'import.
- 08/10 sera — Fine giornata: passaggi di o2 e o3 salvati in CONTINUITA_O2.md e CONTINUITA_O3.md; working tree pulito. Import B9: anteprima consegnata (aac9e79), D-138, contratto v0.3.6.
- 08/10 — Revisione degli alert ricevuta (7 ALTA, 6 MEDIA, 1 BASSA; tutti accolti, D-137; contratto v0.3.5).
- 08/10 — B7 consegnato (5d6e7c5): alert con job giornaliero e aggancio nel salvataggio; pronto il prompt della revisione avversativa.
- 08/10 — Correzioni della revisione del PATCH complete e verificate (adb15a1, D-132); piano per la produzione creato (PIANO_PRODUZIONE.md).
- 08/10 — M: l'app resta interna, in Docker su questo PC, rete aziendale (D-134, chiude R-5); aperto R-19 sulle misure di continuità.
- 08/10 — Revisione del PATCH ricevuta (5 ALTA, 5 MEDIA, 1 BASSA; tutti accolti, D-132).
- 08/10 — PATCH dei campi consegnato (6bed2d6): pronto per la revisione avversativa (D-117).
- 08/10 — Correzioni della revisione dei motori complete e verificate (D-126).
- 08/10 — Dataset ISTAT importato (d049a67): menu Regione/Provincia/Comune attivi. M-04 corretto (77c9c47). Filtro Da/A ed export per tutti nel frontend (aef60d0).
- 08/10 — R-18 chiuso dalle risposte del collaboratore: export per tutti gli utenti del gestore (D-128), filtro per date sulla creazione (D-129), nessun assegnatario unico (D-130); contratto v0.3.2.
- 08/10 — M ha scaricato il dataset ISTAT ufficiale (3da398d); o2 lo importa. Correzioni della revisione in corso (b4a6d52, 7c97d2d, 69b6289).
- 08/10 — Revisione dei motori ricevuta (4 ALTA, 2 MEDIA, tutti accolti: D-126). o2 corregge prima dell'orchestrazione del PATCH.
- 08/10 — M decide: R-9 chiuso con le proposte di o3 (D-122); ISTAT lo scarica o2 (D-123); beta senza dati veri, azzeramento con gli utenti (D-124); cutover dopo i test completi (D-125).
- 08/10 — Risposte del collaboratore a DOMANDE_MOTORI_v2: R-16 chiuso (D-120); novità: Note Operative per gruppo, visibili solo al gruppo + PM leader + ADMIN; Fatturato solo PM/ADMIN (D-121, contratto v0.3.0).
- 08/10 — Motori aggiornati alla baseline corretta (70158de, e3c6c7d, b13c8d7; D-115, D-116, D-119): pronti per la revisione. Procedura di continuità delle sessioni (D-118).
- 08/10 — Baseline corretta del collaboratore adottata (D-114): B1–B4 negli MD, PSC manuale, nuove regole dello Stato attività e degli alert ODA FASTWEB (D-115, D-116). R-17 chiuso; R-16 ridotto ai punti residui (DOMANDE_MOTORI_v2). B5b parte 1 consegnata (bf877da).
- 08/10 — Frontend completo su dati finti: F6 statistiche/carichi/export (679171d), F7 import (e70436d). Contratto v0.2.2. B5b in corso (o2); revisione dei motori in attesa del lancio (M).
- 08/10 — B5a (motori puri) consegnato e verificato (6da2a50, 178 prove): pronto il prompt di revisione per il modello potente. Contratto v0.2.0 (D-111). F6 su dati finti in corso.
- 08/10 — B6 consegnato e verificato (d183179): 163 liste, soglie degli alert, resolve-template, ISTAT pronto senza dataset (503). Piano del cutover in CUTOVER.md (D-107, D-108, R-18).
- 08/10 — B4 consegnato e verificato (2417f65): motore dei permessi con policy come dati, utenti del modello nuovo, GET /api/me. Storico/Archivio su dati finti (781fbd6). Materiale per la guida in MATERIALE_GUIDA_UTENTE.md.
- 08/10 — B3 consegnato e verificato (72d1c16): database del modello nuovo (D-104), transazioni, outbox, snapshot dei template, `yarn db:reset` / `db:seed` (12 utenti, 8 pratiche demo); anteprima ora in replica set.
- 08/10 — F4 su dati finti (b9a52bc) e scheda dell'anteprima sui template veri (61a127d) [o3]; B3 in corso [o2] con D-104.
- 08/10 — B2 consegnato e verificato dalla memoria (8a203fe, 0a762ab, 5aade1e): template compilati dei sei gestori, 0 errori, rotte GET /api/templates; D-103. Build verde (0b0faa5).
- 08/10 — Risposte del collaboratore all'ESITO: R-1 e R-2 chiusi (D-100…D-102); B3 = eliminazione del duplicato; vincolo "almeno un PM leader" (contratto v0.1.8). Lo zip "finale" ha però gli MD identici ai precedenti (R-17). F3 su dati finti consegnato (2eb56cf); contract.ts v0.1.7 (8a350e8).
- 08/10 — Architettura v1 rivista: D-89…D-99, contratto v0.1.7, R-14 chiuso (legge 151/2025), R-16 aperto (domande sui motori). o2 avviata su B2.
- 08/10 — Consegne: S5 `7f1823b`, S8 `6aa2e94`, S6 `e1c4ef9` [o2]; F2 completo su dati finti `b5913ee` [o3]; o3 avviata su F3 (dati finti).
- 08/10 — D-82…D-88: calendario, formule, spostamento per integrazione, Tipologia attività PE, beta come dati veri, anteprima sicura.
- 08/10 — Inventario pre-B2 (`e8a401f`) validato (D-76…D-78); contratto v0.1.5–v0.1.6.
- 08/10 — F1 consegnato; analisi server di o2 (D-65…D-73); B0, B1, vitest/ESLint consegnati.
- 08/10 — Baseline definitiva ricevuta; modello a tre sessioni; registro, rinvii, piano, contratto, prompt di avvio.
