# Passaggio di o2 (backend) — 08/10/2026 sera

Salvato dalla memoria (D-118). Ultimo commit di o2: `aac9e79` (B9, anteprima dell'import).

## 1. Compito e punto raggiunto
- D-136 xlsx 0.20.3: `78e8e10`, consegnato.
- B9: **anteprima completa** e committata (`aac9e79`): lettura del foglio, colonne, conversione, abbinamento D-49, piano dei soli campi vuoti, `import_previews` con TTL di 24 h, `POST /api/import/preview`. Suite server 370 passate, 7 saltate; tsc e lint puliti.
- B9 mancante: `POST /api/import/{importId}/commit` ed estrazione delle funzioni "dentro la transazione" da `fields.ts` e `commands.ts`.
- D-137 (revisione degli alert): rapporto ricevuto, **non ancora letto né stimato**.

## 2. File non committati
Nessuno di o2. (Modifiche aperte in `src/components/...` sono di o3.)

## 3. Scelte tecniche di B9 (ratificate dalla memoria il 08/10, D-138)
- Limiti: file ≤ 5 MB, ≤ 2000 righe di dati, anteprima ≤ 12 MB (altrimenti 413 "dividi il file"). Solo .xlsx (firma zip controllata prima della libreria); primo foglio visibile; date come numeri di serie, cartelle 1904 gestite.
- Abbinamento: confronto esatto di Codice Sito e Nome Sito (spazi agli estremi esclusi, maiuscole contano), sullo stesso template. Stesso sito + G7: 1 attiva → UPDATE, più attive → AMBIGUOUS, solo archiviate → ERROR "ripristinala per importare". Sito esistente con G7 nuovo → REWORK dalla pratica del sito creata per ultima (anche archiviata).
- Il file si simula in ordine: due righe dello stesso sito con G7 diversi = una nuova + una rilavorazione (originRow); stessa chiave ripetuta → ERROR sulla seconda.
- Valore uguale a quello presente: non segnalato; diverso: ALREADY_FILLED. Valori di lista non riconosciuti → INVALID (non "Altro").
- Righe con errori → outcome ERROR (obbligatori D-38 mancanti, Committente/Cliente Finale di un altro gestore).
- Il commit lo può confermare solo lo stesso ADMIN che ha fatto l'anteprima.
- Contratto v0.3.6: `detail?: string` in `ImportRowDTO.skipped` (da comunicare a o3).

## 4. Cose che sa solo o2
- Il commit di ogni riga dovrà **rifare** abbinamento e controllo dei campi vuoti in transazione: se l'esito cambia rispetto all'anteprima, la riga fallisce con "rifai l'anteprima"; per REWORK con originRow l'origine attesa è la pratica creata da quella riga nello stesso commit.
- Il riepilogo della pratica non fa trim di Codice/Nome Sito modificati via PATCH: un Codice Sito salvato con spazi non verrebbe trovato dall'anteprima. Rischio basso, da chiudere nel commit (normalizzare in scrittura).
- Il vecchio import della beta usa ancora xlsx e funziona; `/api/import` (beta) resta fino al cutover.
- Mongo di prova: 27021 (`practicehub-rs-test`, attivo); quello del revisore: 27039.

## 5. Prossimi passi, in ordine
1. Leggere `docs/proposte/REVISIONE_ALERT_v1.md` (con appendice e riproduzioni) e mandare alla memoria la **stima** delle correzioni D-137.
2. Correzioni D-137, con le riproduzioni trasformate in regressioni + §4 del rapporto; consegna con mappa rilievo → commit → prove.
3. Resto di B9: estrazione delle funzioni in transazione (source IMPORT), commit per riga con operationId `<op>:<riga>`, AMBIGUOUS senza scelta → 422, evento IMPORT, rotta commit; normalizzazione degli spazi di Codice/Nome Sito.
4. Packaging del worker e misure PR-13…PR-17 (`PIANO_PRODUZIONE.md`).

---

# Aggiornamento — 09/10/2026, pausa di metà mattina

Punto stabile: `802308e` (D-137 C3). Nessun file non committato di o2. Fatti oggi: `3f49440` (contratto v0.3.6), `f90a1e5` (variabili dell'anteprima su dati reali), `fbdb010` (C1 ciclo KO), `802308e` (C3 fencing).
**C2 solo progettato, nessun file toccato:**
- l'episodio porta openedAt, lastReminderAt e ruleVersion;
- turni consumati = turni dell'ancora già trascorsi all'ultima emissione;
- apertura in ritardo: reminderCount = turni già trascorsi (A-11);
- riprogrammazione: scadenza con la soglia della sua versione (A-13), reminderCount e nextReminderAt ricalcolati dalla nuova ancora rispetto all'ultima emissione (A-10);
- episodio aperto a chiusura manuale con trigger svuotato: promemoria dall'ancora memorizzata (A-09);
- da adeguare la prova di alerts-job "fermo: apre il 23/10 e accetta un promemoria del 20/10": con A-11 quel promemoria non deve più partire.
Replica set di prova sulla 27021 acceso. Poi: C4, commit dell'import B9, packaging.

---

# Passaggio di o2 — 09/10/2026 sera (sessione `megadashboard-main-da`)

**Punto stabile:** ramo `assistente-o2` a `5ddde9f` (worktree `D:/PracticeHub-lavoro/assistente-o2`), nessun file non committato. Commit: `9bb12e4` (1/n: fixture E, impostazioni, limiti, registro), `d282405` (merge di main), `b58819e` (2/n: strumenti), `5ddde9f` (3/n: provider finto, conversazione, orchestratore, NDJSON). Prove mirate verdi (orchestrator 14, tools 16, quota 7, fixture-e 3), tsc incrementale 8 s, lint pulito. main contiene il cutover (`5227567`) più `9904c15` di o3 e commit della memoria: **domani unire main in assistente-o2**. Il worktree `D:/PracticeHub-lavoro/cutover-o2` (ramo già unito) si può togliere. node_modules dei worktree installati con `yarn --ignore-engines` (Node locale 20.18.3).

## Cose che sa solo o2
1. Tipi §13 provvisori in `services/assistant/types.ts`; in `lib/contract.ts` con i nomi di o3 (`AssistantSettingsUpdateRequest`, `AssistantRequestContext`, `AssistantErrorBody`, `MeWithAssistant`). `MeDTO.mustChangePassword` è già obbligatorio su main (o3, `041a05b`).
2. Impostazioni: senza documento valgono enabled=true e i limiti da `.env` (30/4); il documento nasce al primo PUT ADMIN; audit dei soli campi cambiati; nessuna cache.
3. Ammissione: persona in corso e concorrenza in memoria del processo (un solo container app). Limite al minuto a finestra mobile (ultime 10 ammissioni, campo `recent` di `assistant_usage`); limite del giorno di Roma atomico (count<limite + upsert, 11000 = limite raggiunto). Ordine: spento 403, non disponibile 503, BUSY_USER 409, BUSY 429, minuto 429, giorno 429. Validazione, contesto e conversazione prima dell'ammissione (non consumano domande).
4. `MeDTO.assistant` assente se `PH_AI_ENABLED` è falso; presente con `enabled:false` se spento dall'ADMIN.
5. `PH_AI_PROVIDER` = fake | vertex (default vertex); vertex oggi dà sempre "non ancora collegato" → UNAVAILABLE, l'app non si ferma. Regioni ammesse solo europe-west8 ed europe-west4.
6. Esito: il modello inizia il testo con un marcatore `[[ANSWER|NO_DATA|INSUFFICIENT_EVIDENCE|CLARIFY|OUT_OF_SCOPE]]` che il server toglie; citazione `[n]` inesistente tolta → PARTIAL (`INVALID_CITATION`).
7. Fonti: indice del registro del server (può avere buchi); si emettono solo quelle citate e quelle dei facts, prima del testo; in get_practices la fonte LIST/QUERY è la prima, le pratiche partono da [2].
8. Giro del modello: il primo frammento decide strumenti o testo; strumenti dopo il testo ignorati (`TOOLS_AFTER_TEXT`); la terza chiamata non offre strumenti; senza testo → QUERY_TOO_BROAD.
9. Semplificazioni: get_practice usa `getPracticeDetail` (tutte le righe, non la lettura limitata §5.1); scansione max 2000 pratiche; note 200 pratiche/400 righe; storico 20 voci; nessun conteggio locale dei token (D-166/D-167).
10. Fixture E: scritture dirette, formule non ricalcolate, alert sintetici; canarino `E_LEGACY_NOTE`.
11. Copione predefinito del provider finto (anteprima): get_practices e totale, marcato "Risposta di prova".

## Prossimi passi, in ordine
1. **A4 4/n:** §13 in `lib/contract.ts` + Zod in `lib/validators.ts`; `MeDTO.assistant` in /api/me; rotte status, settings (GET/PUT), messages (Origin su PH_PUBLIC_URL → 403 ORIGIN_DENIED, 16 KiB prima del parse → 413, 401 JSON, poi `prepareQuestion` e stream NDJSON); prove delle rotte.
2. **A5:** `.env.example` con PH_AI_* e GOOGLE_*; chiave montata solo nell'app in sola lettura, fuori da x-app-env; Caddy senza encode e con `flush_interval -1` su `/api/assistant/messages`; /api/health con la voce assistant (mai 503 per l'AI); watchdog e README.
3. **A4b, prototipo con Google:** nome attuale di SDK ed endpoint (Agent Platform, ex Vertex); Gemini Flash stabile su europe-west8 con function calling e streaming; VertexProvider con la chiave di `D:\PracticeHub\segreti`, mai letta né stampata; misure e verbale §12.
4. **A6 e A7** (worker in anteprima.mjs, "TIM / FIBERCOP", PAST_ITERATION, etichette con segnaposto TOWERNET; riga del README sull'export) subito dopo A4 4/n.

## Container
Acceso `practicehub-rs-test` (127.0.0.1:27021, di o2, serve domani). Nessuna immagine o processo di prova. Beta e altre app non toccate. La cartella `scratchpad/pulita` (~1 GB su C:) resta per M (U4).

---

# Passaggio di o2 — 10/10/2026 sera (sessione `megadashboard-main-f9`)

**Punto stabile:** main con `d042dcc` (A13), `77506ad` (A6), `4b1060e` (A7), `9a467da` (limiti di tempo di due prove); ultimo commit su main `8173094` (memoria). Unico worktree: il checkout principale; node_modules allineato al lockfile. Nessun file non committato, nessun container o processo di prova. Stack `practicehub` e beta non toccati.
**Fuori dal repository:** `D:\PracticeHub\prova\` (6 file fittizi), `D:\PracticeHub-lavoro\genera-prova\` (generatore `genera.ts` con NODE_PATH verso frontend/node_modules, e rapporto), `D:\PracticeHub-lavoro\prototipo\` (misure A4b).

## Cose che sa solo o2 dell'installazione del 10/10
1. Senza un utente ATTIVO PM leader del cliente, creazione e rilavorazione rispondono 422 (D-101); l'anteprima dell'import non lo controlla, la conferma sì → M deve darsi "PM leader" sui 6 clienti prima dell'import.
2. Prima copia partita subito all'avvio (`_2026-10-10_19-24-21`, practicehub_prod con 1 documento perché prima del bootstrap); prossima 23:30Z = 01:30 di Roma. Export del 10/10 fatto (6 file).
3. practicehub_prod alle 19:30: 0 utenti, 6 template, versione dei dati 1; impostazioni dell'assistente non salvate (valgono acceso, 30/giorno, 4/minuto).
4. Assistente verificato con soli sì/no (acceso, vertex, eu, gemini-3.5-flash-lite, chiave montata solo nell'app); nessuna chiamata a Google ancora.
5. Permessi negati a o2: curl verso https://127.0.0.1:8443 e cancellazione di `frontend/.next` (28 errori tsc nei vecchi tipi generati; non incidono sul build).
6. Template ricompilati con D-182: le pratiche importate useranno le versioni nuove.

## Passi dell'11/10
1. Controllo della copia notturna (registro del servizio backup, cartelle dell'11/10) e dell'export dell'11/10; /api/health dal browser.
2. M "PM leader" sui 6 clienti (il primo accesso e il cambio password sono già fatti il 10/10).
3. Import dei 6 file: attese 29 nuove + 1 rilavorazione (LEONARDO riga 5); TOWERNET righe 4–5 con lo stesso G7 9100104; dopo la conferma 6 CREATA, 18 ASSEGNATO, 6 PROTOCOLLATO, circa 47 alert.
4. Prima domanda all'assistente dal browser (stream via Caddy), poi /api/health con la voce assistente.
5. Registri di app e worker dopo l'import; mail in coda.
