# Analisi del server attuale — consegnata da o2 (08/10/2026)

Riportata dalla memoria (penna unica). Serve come input al documento di architettura. Le risposte della memoria ai punti aperti sono registrate in `DECISIONI.md` (D-66…D-73) e indicate qui tra parentesi quadre.

## 1. Riuso e sostituzione

**Riuso quasi invariato**
- `lib/api.ts`: `handle()`, `HttpError`, `parseBody()`, `json()`. Unica estensione: un payload aggiuntivo su `HttpError` per il 403 con `rejected` (contratto §5.2).
- `lib/db.ts`: si mantiene lo schema (MongoClient in cache sul global, accessor tipizzati `collections`, `ensureIndexes`). Cambiano le forme dei documenti; il seed va **tolto** da `getDb()` [D-69].
- `lib/password.ts`, `services/tokens.ts`, i flussi di `services/users.ts` (invito, impostazione/reset/cambio password, disattivazione): riuso. Cambiano solo `inviteUser`/`updateUser`, che passano ad appartenenze + `isAdmin`.
- `lib/email.ts`: si riusano trasporto SMTP, modalità console senza SMTP e struttura HTML. Servono nuovi modelli (Assegna, alert, reminder) e l'escape HTML [rischio R8, accolto].
- `services/notifications.ts`: si riusa il nucleo `dispatchNotifications()` (destinatari attivi, esclusione dell'autore, deduplica, preferenze, mail best-effort). Si riscrivono i "resolver" dei destinatari: gruppo × template per l'Assegna, PM leader + leader di gruppo per gli alert.
- `services/audit.ts` (`logAudit`): diventa il log di audit lato server, dove finisce anche la cancellazione delle pratiche.
- `lib/auth.ts`: restano Credentials + JWT. Cambiano il contenuto del token (`uid`, `isAdmin`) e i tipi in `types/next-auth.d.ts`; si aggiunge `getCurrentUser()`.

**Da sostituire**
- `services/practices.ts` e `lib/mappers.ts` (modello per team + `currentTeam` + "Passa" + stati in inglese) → B3/B5. Si salvano `escapeRegex` e lo schema "mutazione + audit + evento".
- `lib/registry.ts`, `src/data/registro_campi.json`, `alias_gestionali.json`, `app/api/fields`, le collezioni `field_defs` e `transition_rules` → superati (D-13), sostituiti dai template compilati di B2.
- `services/import.ts` → B9; si salva solo la lettura xlsx (data seriale Excel → ISO).
- `services/stats.ts` → B8 (oggi carica tutte le pratiche in memoria per i KPI: da rifare con aggregazioni).
- `lib/validators.ts`: schemi legacy; i nuovi schemi zod seguono `contract.ts`.
- `services/seed.ts`: migrazione "Team A/B/C" e dati finti da eliminare; nuovo seed demo con B3.

**Da decidere (prodotto):** commenti con @menzioni (`services/comments.ts`, `lib/sanitize.ts`, rotte `/comments`): esistono nell'app ma non nel contratto [R-7, decide M].

## 2. Rischi tecnici

- **R1 — Collisione delle rotte durante la transizione.** Il contratto usa gli stessi percorsi della beta (`/api/practices`, `/api/users`, `/api/notifications`) con forme diverse, e la sessione cambia (18 file legacy di o3 usano `session.user.role/team`). Proposta: rotte nuove subito, servizi e collezioni nuovi, rotte in collisione + sessione nuova in un unico commit di cutover con o3 [D-68, ipotesi di lavoro].
- **R2 — Scritture concorrenti.** Senza revisione due utenti si sovrascrivono e lo Stato attività automatico può essere calcolato su dati vecchi. Proposta: `revision` con 409 [D-67, contratto v0.1.4].
- **R3 — Atomicità senza transazioni.** Il Mongo di docker-compose è standalone, quindi senza transazioni multi-documento. Il "tutto o niente" del PATCH e il ricalcolo di stato e formule sono garantiti solo se valori, righe ripetibili, stato e revisione dell'iterazione corrente stanno in **un documento** aggiornato con un solo `updateOne` condizionato sulla revisione; lo storico va in una collezione separata, scritta dopo e idempotente. Alternativa: Mongo come replica set a un nodo in compose, per avere le transazioni. **[Da decidere nell'architettura.]**
- **R4 — Seed e migrazione all'avvio.** Oggi `getDb()` crea indici, migra dati (deleteMany su 5 collezioni se trova pratiche legacy), reimposta la password admin con `ADMIN_PASSWORD` e ricrea 5 account demo con password note, a ogni avvio, anche in produzione [D-69].
- **R5 — Esecuzione delle 09:00.** Next.js non ha uno scheduler: (a) node-cron in `instrumentation.ts` (con più istanze l'esecuzione si moltiplica); (b) endpoint protetto chiamato da un cron esterno o da un container worker, con lock su Mongo (`job_runs` per data). Consigliata (b); dipende da R-5 [D-70].
- **R6 — Autenticazione.** next-auth è 5.0.0-beta.32: versione da fissare. Con la sessione minima le appartenenze si leggono dal database a ogni richiesta con `getCurrentUser()` (un findOne, trascurabile): le modifiche dell'ADMIN valgono subito. Nessun `middleware.ts` protegge le API: ogni handler controlla la sessione da sé, e la regola va mantenuta.
- **R7 — Prove automatiche attuali non funzionanti.** `backend/tests/backend_test.py` punta alla vecchia preview online, usa account cancellati, chiama `/api/health` (che non esiste) e verifica le forme legacy. Proposta: prove server in vitest (ambiente node), con funzioni pure (formule, giorni lavorativi, motore di stato, permessi) testate senza database, più prove d'integrazione su Mongo **locale** [R-12 per i file legacy].
- **R8 — Iniezione HTML nelle mail:** `lib/email.ts` interpola nome, codice e cliente senza escape [accolto: si corregge in B5/B7].
- **R9 — Nessun dataset ISTAT** nel progetto [D-71].

## 3. Scoperte sulla baseline che toccano contratto e compilatore

- **B-a Coordinate:** in tutti e sei gli MD Latitudine e Longitudine sono due righe con due flowId [D-66, contratto v0.1.4].
- **B-b Master/mirror:** non hanno una colonna propria; si deducono dal flowId ripetuto e dal testo libero di "Evidenza / nota" (mirror 9–25 per MD, pop-up 2–19). Servono inferenza automatica + tabella di correzioni + segnalazione dei casi ambigui.
- **B-c Condizioni:** 299 righe con condizione, tutte in italiano libero; serve un riconoscitore delle forme ricorrenti (FILLED / EQ) + una tabella di traduzione curata; le frasi non riconosciute vanno nel report [D-73].
- **B-d dtype:** 16 forme testuali (DATE, "menù a tendina", "…che si popola volta per volta", "campo libero", "campo varchar 50", INTEGER, DECIMAL, 9 vuoti…) [D-72].
- **B-e Gruppi ripetibili e listId:** non marcati negli MD; si deducono da note e sezioni più una tabella esplicita (TENANT, INTEGRAZIONE, ENTE, ODA, ARPA, VINCOLI); i listId si collegano a `LISTE_VALORI_INIZIALI.csv` tramite il nome del campo.

## 4. Stima indicativa B2–B7 (ore di lavoro effettivo di o2, prove comprese)

| Lavoro | Stima |
|---|---|
| B2 compilatore dei template | 8–12 h (+ validazione delle condizioni) |
| B3 modello dati, script di azzeramento, seed demo | 4–6 h |
| B4 utenti, appartenenze, permessi (funzioni pure), sessione, `getCurrentUser()` | 5–7 h |
| B5 API pratiche v2 + cutover delle rotte in collisione | 14–20 h |
| B6 liste + ISTAT + "Altro" | 4–6 h |
| B7 alert e notifiche | 10–14 h |
| **Totale** | **circa 45–65 h** |

Ordine consigliato: B2 → B3 → B4 → B6 (indipendente da B5, sblocca F4) → B5 → B7.
Rischi di slittamento: validazione delle condizioni di B2, cutover delle rotte, scelta dello scheduler (R-5).
