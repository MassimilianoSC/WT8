# Passaggio di o3 (frontend) — 08/10/2026 sera

Salvato dalla memoria (D-118). Ultimo commit di o3: `24a1b97` (FATTURABILE_KO senza "Chiudi", D-137). A fine giornata il working tree è pulito (verificato dalla memoria dopo `aac9e79` di o2).

## 1. Stato
- Nessun compito in corso. In attesa del collegamento al PATCH dei campi (consegnato da o2, rivisto e corretto: D-132) e poi del cutover (D-125, dopo i test completi).
- Su dati finti è completo: F1–F7, Archivio, `/api/me` (B4), liste vere (B6), Note Operative per gruppo, filtro Da/A, export per tutti con scope, cascata ISTAT nello stesso salvataggio, scelte estetiche definitive (D-122).
- **Da recepire al riavvio:** contratto v0.3.6 (D-138): `ImportRowDTO.skipped[].detail?: string` → mostrarlo nell'anteprima dell'import accanto al motivo.

## 2. Cose che sa solo o3
- Interruttore unico: `USE_MOCK` in `frontend/src/components/pratiche/data-source.ts:15`. Con `true` le pagine nuove sono un'anteprima solo ADMIN, con MockBanner.
- Già reali anche con `USE_MOCK=true`: template, liste (catalogo in `scheda/lists-source.ts`, cache svuotata dopo un PUT), ISTAT, utente (`components/me/load-me.ts`, non lancia mai), PUT delle liste nell'anteprima.
- Ancora finti fino al cutover: pratiche, salvataggio, comandi, storico, notifiche, statistiche, import, utenti e soglie (`config-source`), campi utente (`MOCK_USERS` in `use-sheet-options.ts`, perché `/api/users/assignable` collide con la beta).
- Archivio dimostrativo in memoria: `pratiche/mock-store.ts`.
- Prove: `scheda/__tests__/serve-templates.ts` simula rotte di template, liste e ISTAT; `real-templates.smoke.test.tsx` legge i sei JSON compilati solo nelle prove; `shared-conditions.test.ts` fa girare i 42 casi condivisi.
- Comandi su questo PC: `node node_modules/typescript/bin/tsc --noEmit -p .`; `node node_modules/next/dist/bin/next lint --dir src/components --dir src/app`; script Python in un file dello scratchpad lanciati con `python -I` (le heredoc complesse si rompono); i comandi che estraggono HEAD in una cartella sono negati; file nuovi: `git add -- <percorsi>` poi `git commit -F … -- <percorsi>`.
- **Correzione della memoria:** per vedere l'app NON usare `next dev -p 3100` (la porta 3100 è quella della beta in Docker, e all'avvio l'app scrive nel database configurato): usare sempre `yarn dev:anteprima` (Mongo usa-e-getta, porte libere da 27018/3200, D-88).

## 3. Prossimi passi
1. Collegamento al PATCH dei campi: `saveFields` in `scheda/sheet-source.ts` è pronto per la rotta vera; verificare `createdRows`, `rejected` (403, chiavi `repeat:<KEY>` e `TRASV.*`) e 409 per `code`. Nota: il dettaglio `GET /api/practices/{id}` entra solo al cutover.
2. Commit del cutover, in un unico commit (ordine in `CUTOVER.md`): `USE_MOCK=false`; `/api/users/assignable` per i campi utente; redirect `/dashboard` → `/pratiche` (`app/page.tsx:7`, `login/page.tsx:27`, guardie); rimozione delle pagine e dei componenti della beta (con `/settings`, D-107); rimozione di `NAV` della beta e del ramo `session.user.role/team`; rimozione dei dati finti (`mock-template.ts` resta come fixture). Poi via a o2 per i passi 3–5.
3. Il test di fumo riverifica da solo ogni ricompilazione dei template.

---

# Aggiornamento — 09/10/2026, pausa di metà mattina

Punto stabile: `e67471b`. Anteprima spenta (nessun container, porte 3200 e 27018 libere).
- `532ae64`: motivo leggibile nell'anteprima dell'import (v0.3.6).
- `02c7b12`: **anteprima su dati reali** (D-140). Server action transitorie in `components/live/actions.ts` (controllo lato server: PRACTICEHUB_LIVE_PREVIEW + ADMIN attivo; modulo caricato solo nel ramo live), campi utente veri, campanella v2, banner "dati reali", tolto SkippedField.
- `e67471b`: corsa tra i tab dello storico, trovata dal vivo.
- Verificato dal vivo con Playwright: elenco e scheda, salvataggio, campo utente, Stato attività, Assegna, storico, statistiche e carichi, utenti (invito, reinvio, modifica, 409), creazione pratica.
**Resta aperto:**
1. Dal vivo: eliminazione pratica, notifiche con una notifica vera, import (anteprima + commit, quando c'è), export, archivio.
2. Elenco dei problemi d'integrazione per o2 (via memoria). Primo candidato, passato a o2: il seed demo non calcola i campi calcolati (al primo salvataggio una voce "Sistema" imposta Forecast Protocollo, pratica IL-TO-0001).
3. Nota: nell'anteprima il primo login può dare MissingCSRF per un cookie di un'anteprima precedente; si risolve cancellando i cookie (segnalato a o2).

---

# Passaggio di o3 — 09/10/2026 sera (sessione `megadashboard-main-26`)

**Punto stabile:** main, ultimo commit di o3 `4f5b41b` (storico che si ricarica a ogni revisione, colonna dell'elenco non tagliata, tolta la frase per sviluppatori in "Password dimenticata"); prima `9904c15` (autocomplete). Nessun file non committato, nessun worktree o ramo di o3 (rimossi `assistente-o3`, `cutover-o3`, `prova-d173`). Tutto spento: anteprima, worker, porte 3200/3201/27018 libere, container `practicehub-anteprima` rimosso.

## Esiti della prova generale fase 2 (anteprima di main con login v2 + worker; account creati con l'invito vero)
- OK: A2, A4, A5, A6 (blocco dopo 5 errori; "dopo 15 minuti" verificato invecchiando i tentativi), B4, C4, D3, D8, E1/E2, E3, F7, G1 (alert al salvataggio, notifica al PM leader; il worker ha aperto 3 alert alle 09:00), H8, I4, L7 (solo dal menu).
- A1 OK con nota: dopo aver impostato la password dal link d'invito si torna a /login e si accede. **Decisione della memoria (09/10):** va bene così (accesso esplicito dopo l'impostazione della password); si corregge la checklist.
- **Da fare:** G3 (UTL dalla campanella; serve un alert Forecast UT a 2 giorni lavorativi senza Invio AS/VS), G6 (mail a UTL e PM leader nel registro del worker), I2, L1, L2, L3 (cambio gruppo e disattivazione di dl), L7 con gli indirizzi diretti /configurazione/utenti e /import come PM. IP da un altro PC: sul PC dei test.

## Cose che sa solo o3
- Il database dell'anteprima sparisce allo spegnimento: per riprendere si rifanno gli inviti con gli script in `.playwright-mcp/collaudo/` (fase2-ut.js, fase2-pm.js, fase2-chiusura.js) e si ricrea IL-MI-0100; gli id cambiano.
- Worker sull'anteprima, da `frontend/`: `MONGO_URL="mongodb://127.0.0.1:27018/?directConnection=true" DB_NAME=practicehub_anteprima SMTP_HOST= APP_BASE_URL=http://127.0.0.1:3200 WORKER_POLL_MS=5000 yarn worker` (le mail con il "Link:" nell'output; `anteprima.mjs` non lo avvia — A6 di o2; spegnere con taskkill sull'albero di yarn).
- I contesti di Playwright non restano tra un'esecuzione e l'altra: ogni script rifà il login.
- tsc nel checkout principale mostra 32 errori solo nei tipi generati vecchi (`.next/types`, `.next-anteprima/types`): filtrare quelle righe.
- Il seed dell'anteprima crea già un ADMIN attivo: per il primo ADMIN disattivarlo nel database usa-e-getta; per il guscio del cambio obbligato basta `mustChangePassword` su un utente demo.
- Osservazioni non corrette, da valutare: in Statistiche "Per gestore" non mostra FASTWEB con zero; la colonna "Codice Sito" con l'alert va su due righe quando serve.

## Prossimi passi, in ordine
1. Finire la fase 2 (G3, G6, I2, L1, L2, L3, L7 diretto), rapporto completo, spegnimento.
2. Integrazione reale dell'assistente (A5) quando o2 ha le rotte: import da `lib/contract.ts` al posto di `components/assistente/types.ts`; verifica di `MeDTO.assistant`, rotte, Content-Type NDJSON, errori JSON; prove con stream veri (360/768/1440 px, zoom 200%, temi, lettore di schermo, HTTPS dal proxy); schermata 09e con dati veri.

---

# Passaggio di o3 — 10/10/2026 sera (sessione `megadashboard-main-8d`)

**Punto stabile:** ultimo commit di o3 `883edc3` (loadMe usa loadMeDTO), su main tramite il merge di o2; main a `8173094`. Nessun file tracciato non committato, nessun worktree, niente acceso (porte 3200/3201/27018 libere).
**Script della prova di carico** (cartella ignorata da git): `.playwright-mcp/installazione/` — `prova-carico.mjs` (20 utenti, una domanda ciascuno, p50/p95, prova dello stream), `credenziali.esempio.json` (modello), `credenziali.json` (oggi solo account dell'anteprima, non più validi; da riempire con account veri di prova e **cancellare a fine prova**). Lancio: `PH_PUBLIC_URL=https://172.16.1.116:8443 PH_CARICO_INSECURE=1 PH_CARICO_UTENTI=<n> node .playwright-mcp/installazione/prova-carico.mjs`. Se Playwright cerca un browser non scaricato, ripiega da solo sul Chromium installato (1243).

## Passi dell'11/10 (installazione con i dati fittizi)
1. Script con 3–5 utenti (mai provato contro l'app), poi 20: p95 e "risposte arrivate a pezzi" (stream non bufferizzato da Caddy); errori da riferire.
2. Schermata 12a con il modello vero (ed eventualmente 12b).
3. A fine prova: cancellare `credenziali.json`; gli account del carico li disattivano memoria e M.
