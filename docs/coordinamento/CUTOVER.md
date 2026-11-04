# PracticeHub — Piano del cutover (passaggio dalla beta al modello nuovo)

**Penna unica:** memoria. Fonte: inventario frontend di o3 (commit `e779f93`), D-60, D-68, D-104, D-105. Si completa con la parte backend prima del cutover.
**Quando:** dopo B5, B6, B7 e, salvo diversa decisione di M, dopo F6/B8 e B9 (R-18). Richiede il via di M, il backup verificato del database della beta (S6) e la risposta a R-15.

## Due tempi (D-161)

- **(a) FATTO il 09/10/2026: merge `5227567` su main** (cutover-o2 `bcb0533`: 3.3 `ef7a147`, 3.4 `fb20ef3`, 3.5 `11c90f6`, guardia D-173 `041a05b`, interfaccia dell'assistente). Unico giro completo verde (typecheck 29 s, lint 19 s, server 474/474 469 s, frontend 316/316 62 s, docker build 240 s); prova a mano del primo ADMIN superata. Verificato dalla memoria: niente USE_MOCK né modalità live, /dashboard reindirizza a /pratiche, nessun seed della beta, registro_campi/alias_gestionali tolti, `MeDTO.mustChangePassword` obbligatorio. Beta non ricostruita.
- **(a) Cutover del codice** — passi 3.2–3.6 qui sotto, **prima del collaudo** (dopo il packaging di o2). Lo stack nuovo con questo codice va sul PC dei test; la beta resta sulla sua immagine attuale (`megadashboard-main-app`, `6fb84d6ce06f`) e **non si ricostruisce** fino al punto (b).
  - Parte di o3 (3.2, 3.6) **pronta sul ramo `cutover-o3`** (`59bf89c`, merge di main `8cdba99`; worktree `.claude/worktrees/cutover-o3`): USE_MOCK e modalità live tolti, pagine e componenti della beta rimossi, shell e guardie solo sul MeDTO, dati finti spostati in fixture di prova. Giro completo frontend 236/236, build e lint puliti. Aspetta 3.3–3.5 di o2 (rotte in collisione, rimozione del legacy, sessione `{ id, name, email, isAdmin }`, login e token v2); il merge si fa dopo, coordinato tra o2 e o3.
  - Pagine di accesso sempre in italiano (`22f591a` sul ramo, `components/auth/auth-errors.ts`). **Requisito per o2 al passo 3.5:** `POST /api/auth/set-password`, `/reset-password`, `/forgot-password` e `/api/auth/change-password` su token e utenti v2, con gli stati 400 (link non valido o scaduto, anche senza token), 404 (account non trovato o disattivato), 422 (password corta o email non valida), 429 (troppi tentativi, PR-22); il testo del corpo non conta. I link restano `/set-password?token=` e `/reset-password?token=`.
  - **Fatto:** 3.3 `ef7a147`, 3.4 `fb20ef3`, 3.5 `11c90f6` sul ramo `cutover-o2`. Restano: guardia D-173 di o3 e merge di `assistente-o3` sullo stesso ramo, unico giro completo, verifica della memoria, merge su main.
  - Parte di o2 (3.3–3.5) sul ramo **`cutover-o2`**, creato da `cutover-o3` (41d308e) più main: un solo ramo finale con tutto. Giro completo dopo ogni passo (D-164); merge su main solo dopo la verifica della memoria.
- **(b) Aggiornato da D-181:** la beta non convive con la nuova: si spegne all'installazione definitiva (A10), conservando il suo volume dati come archivio.
- **(b) Messa in esercizio** — dopo il collaudo completo e il via di M (D-125): passo 3.1 (backup della beta), avvio dello stack nuovo su HQE-016 con `practicehub_prod`, spegnimento della beta.

## Ordine (D-60: build sempre verde)

1. **Prima del giorno del cutover:** o2 consegna B5, B6, B7 **senza toccare i percorsi in collisione** (`/api/practices[/{id}]`, `/api/users[/{id}]`, `/api/users/assignable`, `/api/notifications[/{id}]`, `/api/stats`). I servizi nuovi sono pronti e provati.
2. **Bloccanti lato o3, prima di spegnere USE_MOCK:**
   - menu della scheda collegati a `GET /api/lists`, `/api/users/assignable` (campi utente, D-39) e `/api/istat/*` (oggi `mockOptions` in `pratica-sheet.tsx`);
   - redirect da `/dashboard` a `/pratiche`.
3. **Giorno del cutover**, nell'ordine, con build e prove fra un passo e l'altro:
   1. backup e verifica del database della beta (S6); migrazione della beta in replica set (D-90); azzeramento (D-69) solo con il via di M;
   2. **o3:** `USE_MOCK = false` (`pratiche/data-source.ts`), redirect, rimozione delle pagine e dei componenti della beta (sotto), ramo beta tolto dalla shell e dalle guardie;
   3. **o2:** rotte in collisione sostituite dalle versioni nuove; rimozione delle rotte vecchie;
   4. **o2:** rimozione di `src/types`, delle parti vecchie di `lib/constants.ts`, di mapper e registry vecchi;
   5. **o2:** sessione nuova (`next-auth.d.ts` → `{ id, name, email, isAdmin }`), login sugli utenti del modello nuovo, `getCurrentUser()` per id (fine di D-105); l'app punta al database nuovo (D-104); **rimozione del seed della beta in `getDb()`** (admin e account demo con password note, migrazione legacy: oggi gira sul database legacy di qualunque stack, anche `practicehub_prod_legacy`; PR-04, PR-19). Regola: lo stack di esercizio non si apre agli utenti prima di questo passo.
   6. **o3:** rimozione della modalità "anteprima su dati reali" (server action in `components/live/actions.ts`, D-140): le pagine passano alle rotte vere.
   7. Avvertenza (o2): le mail di alert già in coda nella beta non hanno alertId; l'annullamento le riconosce dalla chiave, ma l'orario lavorativo vale solo per le nuove. Trascurabile: la beta non ha dati veri (D-124).
4. **Dopo:** rimozione dei dati finti di o3 (`mock-data.ts`, `mock-store.ts`, `demo-practice.ts`, rami `mock*`, `PreviewUserNote`; `mock-template.ts` resta come fixture); `backend/tests` legacy secondo R-12.

## Beta da togliere o sostituire (o3)

| Beta | Sostituita da |
|---|---|
| `/dashboard` | `/pratiche` |
| `/practices/[id]` | `/pratiche/[id]` |
| `/users` | `/configurazione/utenti` |
| `/settings` (preferenze di notifica, gestionali di default) | nessuna (D-107) |
| `/analytics` | F6 (R-18) |
| `/import` | B9 (R-18) |
| `/change-password` | resta (login NextAuth) |
| `components/practices/*`, `users-view`, `analytics-view`, `notification-bell`, `status-badge` | `components/scheda/*`, `pratiche/*`, `configurazione/*`, `notification-bell-v2`, `stato-badge` |
| `app-shell.tsx`: menu della beta, logo verso `/dashboard`, piede "ruolo · team", "Impostazioni notifiche" | voci nuove; piede con le appartenenze del MeDTO |

Le dipendenze della beta da `@/types`, `@/lib/constants`, dalle rotte vecchie e da `session.user.role/team` spariscono insieme ai file della beta. I file nuovi di o3 non importano moduli legacy; usano `role/team` solo nel ramo USE_MOCK di layout, shell e guardie, che o3 toglie al passo 3.2.

## Funzioni della beta senza equivalente

| Funzione | Esito |
|---|---|
| Commenti con menzioni e testo formattato | R-7 (M) |
| Import Excel | B9; momento del cutover: R-18 |
| Analisi / statistiche | F6/B8; momento del cutover: R-18 |
| Preferenze di notifica per utente | Tolte: le notifiche di Assegna e alert sono obbligatorie (D-107) |
| "Gestionali di default" | Tolti: superati dalle appartenenze (D-107) |
| Filtro per intervallo di date nell'elenco | R-18 |
| Assegnatario unico per sezione di team | R-18 (nel modello nuovo: campi utente degli MD, D-39) |
| Note per sezione di team | R-18 (nel modello nuovo: Note Operative D-37 e campi note degli MD) |
