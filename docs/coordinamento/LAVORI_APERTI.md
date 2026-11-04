# PracticeHub — Lavori aperti

**Penna unica:** memoria. Elenco unico di tutto ciò che è iniziato, in attesa o promesso e non ancora chiuso. Si aggiorna a **ogni consegna** e a ogni decisione; una voce si toglie solo quando è verificata (spostandola in fondo, "Chiusi di recente").
**Regola:** prima di dare un compito nuovo a una sessione, la memoria controlla qui che non resti a metà niente di suo; quando una sessione aspetta un'altra, la voce dice **chi aspetta chi** e chi la riattiva.

Aggiornato: 11/10/2026. Sessioni attuali (13/10, dopo il riavvio del PC): memoria `megadashboard-main-b3`, o2 `megadashboard-main-62`, o3 `megadashboard-main-52`.

## In corso

| # | Lavoro | Chi | Stato | Aspetta | Chi riattiva |
|---|---|---|---|---|---|

## Segnalazioni del collaudo (dal 12/10)

| # | Segnalazione | Tipo | Chi | Stato |
|---|---|---|---|---|
| C1 | **Nuova pratica:** i menu Committente e Cliente Finale non scorrono con la rotellina del mouse, solo trascinando la barra. Probabile: menu a tendina (`Combobox`, Popover) dentro una finestra di dialogo che blocca la rotellina; controllare **tutte** le finestre con menu (Assegna, rilavorazione, ecc.) | difetto | o3 | installato in `2026-10-13a` |
| C2 | **Configurazione → Liste:** scelto il gestore, cambiando GRUPPO l'elenco delle categorie si aggiorna, ma a destra restano le voci dell'ultima categoria scelta (di un altro gruppo) finché non si clicca una categoria. Va azzerata o riallineata la selezione al cambio di gruppo (e di gestore) | difetto | o3 | installato in `2026-10-13a` |
| C3 | **Scheda:** nella colonna di sinistra con le sezioni, aggiungere la voce «Storico», cliccabile come le altre | miglioria piccola | o3 | installato in `2026-10-13a` |
| C4 | **Scheda:** voce «Commenti (n)» nell'indice laterale, sopra Storico; indice laterale visibile anche con lo zoom al 200% (oggi nascosto sotto 1024 px) | miglioria (M: «A») | o3 | installato in `2026-10-13a`; controllo a vista e schermata 04c su anteprima usa e getta (o3) |

## In attesa di qualcuno

| # | Lavoro | Chi lo fa | Aspetta | Chi riattiva |
|---|---|---|---|---|
| A16 | **Prossimo aggiornamento dell'installazione** (l'ultimo è `2026-10-13a` delle 10:32, commit `aaafd0f`): le prossime correzioni del collaudo; prima un giro completo | memoria + M (+ o2) | quando ci sono abbastanza correzioni o una urgente | memoria |
| A12 | **Collaudo** con i collaboratori (checklist + sezioni N e O), raccolta delle segnalazioni e correzioni con aggiornamenti | M e collaboratori; o2/o3 per le correzioni | inviti di M (12/10) | M |
| A5 | Prova "Google non risponde" sullo stack vero (l'app deve restare usabile, l'assistente indisponibile, mail del controllo) | o2 con M | un momento concordato | memoria |
| A10b | **PC in arrivo come riserva**: Docker, accesso alle copie, prova di ripristino cronometrata (PR-03, PR-12) | M + o2, procedura della memoria | arrivo del PC | M |
| A11 | **Revisione avversativa finale** (PR-28) con il modello potente: permessi, import, commenti, assistente, azzeramento, procedura di partenza (`NOTE_REVISIONE_FINALE.md`) | M lancia, memoria scrive il prompt | prima della partenza | memoria |
| A14 | **Giorno della partenza** (PR-31): azzeramento "solo pratiche", import degli Excel veri, avvio con il team PM in parallelo agli Excel (PR-32), formazione breve (PR-30) | M + o2 + memoria | collaudo finito e via di M (D-125) | M |
| A17 | **Accensione di Andamento nel collaudo** (D-199, `ACCENSIONE_ANDAMENTO.md`): M mette `PH_ANDAMENTO=true` e riavvia l'app; Direzione a un collaboratore (DIR) e a un team leader; domande di prova all'assistente con la sezione P (P17, P18). Guida §13 e checklist P già pronte | M (+ collaboratori) | accensione da parte di M | M |
| A15 | Cartella di rete per copie ed export (PR-02 secondo livello) | o2 | risposta dell'IT | M |

## Da fare dalla memoria

| # | Lavoro | Quando |
|---|---|---|
| M3 | Prompt della revisione avversativa finale (A11) | prima della partenza |
| M4 | Rimisura del tempo in prove di o2 e o3 (D-164) con `strumenti/misura_prove.py` | **16/10/2026** |
| M6 | Procedura del PC di riserva (A10b) | all'arrivo del PC |

## Da fare da M

| # | Lavoro | Quando |
|---|---|---|
| U7 | **Inviti ai collaboratori** per il collaudo; mandare guida e checklist HTML e, se serve, la cartella `D:\PracticeHub\certificati-per-colleghi` | **12/10** |
| U2 | Mail all'IT: cartella di rete per le copie, UPS, accesso al PC in arrivo (testo in RINVII R-19) | **12/10** |
| U5 | **Riavvio della macchina** fuori orario, con il file di paging spostato su D: (PR-17a); dopo, controllare che Docker e l'app siano ripartiti | appena possibile |
| U6 | Avvio automatico di Docker dopo un riavvio (R-19 punto 4, opzioni 4a–4e) | con il riavvio |
| M5 | Approvare il nuovo CLAUDE.md (`docs/proposte/CLAUDE_MD_NUOVO.md`) | quando vuole |
| U3 | Avvisare la memoria quando arriva il PC di riserva | settimana del 12/10 |
| U8 | Spazio su C:: spostare su D: le cartelle d'archivio del Desktop (72 GB), dopo verifica che nessuna app le usi | quando vuole |
| U4 | Cancellare la cartella di prova di o2 (~1 GB): `C:\Users\mcracchiolo\AppData\Local\Temp\claude\c--Users-mcracchiolo-Desktop-MEGADASHBOARD-main\fd29a311-b899-4ad3-983c-aa6c4bb8fc46\scratchpad\pulita` | quando vuole |
| U9 | Cancellare `frontend\.next` nel checkout principale (vecchia build) | quando vuole |
| U10 | Decidere più avanti: dove provare gli aggiornamenti dopo la partenza (PR-25/25b); utenti reali e team leader per l'avvio (R-6); file vecchi alla radice (R-8); prove Python legacy (R-12); Node locale (R-11) | prima della partenza |

## Da tenere d'occhio

- Colonna "Codice Sito" con l'alert: va a capo quando serve (scelta del 10/10: su una riga non regge a 1440 px).
- File non tracciati nella radice (`registro_campi.json`/`.csv` del 24/07, `tests/__init__.py`, `memory/PRD.md` del 23/07): **non nuovi**, residui di luglio (prima versione); non di o2 né di o3. Il 04/11/2026 spostati fuori dal progetto, in `Desktop/MEGADASHBOARD-backup-2026-11-04/residui-prima-versione/` (`memory/PRD.md`, `tests/__init__.py`); `registro_campi.*` restano.

- `tsc` nel checkout principale segnala errori solo nei tipi generati vecchi in `.next/types` (build della beta del 09/10) e `.next-anteprima/types`: cartelle ignorate; da togliere quando nessuna sessione usa l'anteprima (o3 alla fine della prova con 20 utenti).

- Primo avvio a freddo di `/login` (next dev): pulsante disattivato oltre 60 s, visto una volta da o3, non riprodotto.
- C: di HQE-016: 24 GB liberi (soglia di avviso del controllo esterno).

## Chiusi di recente
- **13/10 — Aggiornamento `2026-10-13a`** (commit `aaafd0f`, giro completo verde: 568 + 444 prove, build): C1 rotellina nei menu e calendari, C2 Liste, C3 Storico e C4 Commenti nell'indice, indice a zoom 200%. Verificato: immagini nuove, app sana, Andamento acceso, salute ok, nessun errore. Indietro: `torna-indietro.ps1 -Etichetta 2026-10-11e -Copia aggiornamenti/2026-10-13_10-32-09_2026-10-11e`. Prima, riavvio del PC (pool non di paging a 7,4 GB dopo 9 giorni).
- **11/10 sera — Aggiornamento `2026-10-11e`** (commit `da3b62d`, giro completo verde: 568 + 434 prove, build): altezza del calendario, ultimo ADMIN protetto, badge leggibili, Andamento e Direzione **spenti** (`PH_ANDAMENTO=false`), `NODE_OPTIONS` 1024 MB. Verificato: immagini nuove, app sana, worker avviato, salute ok, nessun errore nei registri. Per tornare indietro: `torna-indietro.ps1 -Etichetta 2026-10-11d -Copia aggiornamenti/2026-10-11_19-16-49_2026-10-11d`.
- **L14/L15 — Andamento e Direzione** (D-191…D-198): o2 `e999e45` … `70da836`, o3 `2925260` … `ec4f2db`; accensione in A17.

- 11/10: 2 utenti di prova riattivati per il controllo e poi disattivati (o2): 0 attivi, 20 disattivati. Altezza del calendario corretta (o3 `b1eb315`, nel prossimo aggiornamento).

- 11/10: controllo a vista del calendario sull'installazione (o3): ok a 1440/360/zoom 200%/tema scuro/tastiera; un difetto minore (altezza con zoom su schermo basso).

- 11/10: quarto aggiornamento `practicehub:2026-10-11d` (M, 13:22) dopo il giro completo verde su `e6e5ec5`: calendario, riga rimossa, code di riga.

- 11/10: code degli errori di riga nel PATCH (o2 `a94512d`); interfaccia sul code ROW_NOT_FOUND (o3 `90492f2`).

- 11/10: riga rimossa con modifiche in sospeso (o3 `66fea95`) e calendario nei campi data (o3 `87e66ed`, D-190, senza dipendenze nuove).

- 11/10: terzo aggiornamento dell'installazione `practicehub:2026-10-11c` (M, 12:40), dopo il giro completo verde su `c20e044`: etichette di stato e contatore degli alert su campi nascosti.

- 11/10: etichette di stato lunghe che andavano fuori dalla casella, e contatore degli alert di sezione che contava anche le copie nascoste (o3, `229d510`): un alert conta dove il suo campo si vede, con avviso se è nascosto.

- 11/10: **controllo esterno installato** (attività pianificata "PracticeHub - controllo", SYSTEM, ogni 10 minuti; prima esecuzione: "Controllo: tutto in ordine"). Prova da un altro PC fatta (M). Memoria della macchina: virtuale libera da 6,5 a 16,4 GB dopo la chiusura delle sessioni inutili; ricerca di Windows bianca per memoria esaurita → riavvio fuori orario e paging su D: consigliati.

- 11/10: prove server stabili sotto carico (o2, `a8e5ce9`, timeout 90 s per file in quattro file).

- 11/10: 20 utenti di prova disattivati (o2): authVersion 2, audit CREATE/DISABLE, 0 mail; `credenziali.json` cancellato.

- 11/10: guida con la sezione **Commenti** e schermate vere (assistente 12a/12b, commenti 04k/04l); checklist con la sezione **O. Commenti**; HTML rigenerati. Controllo a vista di o3 sull'installazione: nessun difetto nuovo.

- 11/10: **secondo aggiornamento** dell'installazione (M, senza `-EnvFile`): `practicehub:2026-10-11b`, sano; 12 snapshot dei template (D-187); copia `aggiornamenti/2026-10-11_10-35-55_2026-10-11a`. Giro completo verde su `6b26b51` prima (3 prove in tempo scaduto per carico della macchina, rifatte verdi).

- 11/10: **prova di carico superata** sull'installazione (o3): 20 utenti, 20/20 risposte, stream via Caddy ok (20/20 a pezzi), server diretto con 20 accessi in parallelo 1,1 s (p95 1,2), prime parole 7,3 s con 20 richieste a Google insieme; 27 domande reali usate. Schermata 12b pronta.

- 11/10: D-187 versione dei template con i collegamenti interni (o2, `f9d38f2`): nel prossimo aggiornamento 12 snapshot. 20 utenti di prova creati sull'installazione (o2, 0 leader, 0 mail).

- 11/10: aggiornamento dell'installazione con `aggiorna.ps1` (M); difetto `$PSScriptRoot` vuoto in Windows PowerShell 5.1 aggirato con `-EnvFile` e corretto (o2, `144b2ce`). Giro completo verde su `9db419c` prima dell'aggiornamento.

- 11/10: seguito dell'assistente corretto (o2, `351a834`): riferimenti del turno precedente conservati, riautorizzati e passati come dati; "la prima", codice o nome del sito aprono la pratica giusta.
- 11/10: guida e checklist anche in HTML autonomo (`docs/guida/*.html`, pandoc, `genera-html.sh`).

- 11/10: **beta spenta** (D-181): container `megadashboard-main-*` rimossi, volume `megadashboard-main_mongo_data` conservato, 27017 non più pubblicata in rete.

- 11/10: commenti con menzioni, interfaccia (o3, `74656b5`), collegata alle rotte vere.

- 11/10: import dei 6 file fittizi in esercizio (M): 30 pratiche (5 per cliente), 47 alert aperti, come previsto. Prima domanda all'assistente riuscita (risposta rapida via Caddy e Google, precisazione corretta sul G7 duplicato).

- 11/10: mai più "Caricamento…" infinito (o3, `5b2b3a7`): errori con motivo e "Riprova", 401 → login "Sessione scaduta" e ritorno alla pagina, timeout 20 s sulle letture; da verificare sull'installazione dopo l'aggiornamento.
- 11/10: commenti, backend (o2, `d81e845`).

- 10/10: **giro completo pre-installazione verde** su main `4b1060e` (o2): typecheck 6 s, lint 7 s, server 532/534 + 2 timeout di affollamento rifatti verdi (D-175), frontend 328/328, docker build 93 s; practicehub-rs-test eliminato.

- 10/10: **A6** (o2, `77506ad`): worker nell'anteprima; nome del gestore nei messaggi sul PM leader; iterazioni passate con `access` in sola lettura (contratto v0.4.2); etichette senza segnaposto (D-182, 25 occorrenze, template ricompilati). **A7** (`4b1060e`): README sulla cartella di rete dell'export (robocopy se Docker non la monta).

- 10/10: **A13** azzeramento "solo pratiche" (o2, `d042dcc`): `--solo-pratiche` in reset-core e `ops/reset-db.mjs` nell'immagine, anteprima e copia di sicurezza obbligatorie, `--consenti-esercizio` su practicehub_prod; procedura del giorno della partenza nel README di deploy.

- 10/10: **assistente AI su main** (`05c5d01`): unico giro completo verde (typecheck, lint, server 531/531 in 585 s, frontend 328/328, docker build dopo la correzione `3a8632d`); worktree e ramo `assistente-o2` rimossi.

- 10/10: unione dell'assistente in `assistente-o2` (o3: `8ec1ce6`, `cdd97fe`, `883edc3`, nessun conflitto); worktree e ramo `assistente-int-o3` rimossi.

- 10/10: o2 `679d27e`: `loadMeDTO` comune per /api/me e loadMe, provider finto secondo il contesto, link non interni tolti lato server, `.env.example` con gemini-3.5-flash-lite su eu.

- 10/10: renderer dell'assistente: link e immagini Markdown del modello mostrati come solo testo (o3, `619115e`).

- 10/10: sezione **N. Assistente AI** nella checklist di collaudo (19 prove, bozza di o3: domande per ruolo, permessi sulle note, sola lettura, limiti, interruttore).

- 10/10: Statistiche "Per gestore" con anche i gestori a zero (o3, `3bfe9fe`).

- 10/10: **integrazione reale dell'assistente** (o3, `assistente-int-o3`, `7b6603b`, `4441f2e`) provata nell'anteprima con il modello finto: stream, fonti, Interrompi, limiti, interruttore ADMIN, cambio password, 401, schermi 360–1440 px, zoom, tema scuro, accessibilità. Schermate 09e (dati veri), 12a, 12b nella guida.

- 10/10: **prova generale fase 2 conclusa** (o3): 22 punti tutti superati, correzioni d'interfaccia `4f5b41b` e `a2f1655` su main, nessun difetto di backend; checklist corretta di conseguenza. Resta per l'installazione: IP da un altro PC, HTTPS dal proxy.

- 09/10: 24 schermate nuove della guida (o3, menu definitivo, 09e Assistente AI con dati simulati, 11 cambio password obbligato), inserite dalla memoria; autocomplete nei campi password (`9904c15`); worktree `assistente-o3` e `cutover-o3` rimossi.
- 09/10: **cutover del codice su main** (`5227567`), unico giro completo verde; o2 ha unito main in `assistente-o2` (`d282405`).
- 09/10: prova a mano del primo ADMIN su `bcb0533` (o3): guscio con avviso e pagine bloccate, cambio password, /pratiche con il menu nuovo, riavvio senza riallineare la password, "Chiedi" assente senza backend — tutto ok.
- 09/10: cutover del codice lato o2 completo sul ramo `cutover-o2`: 3.3 `ef7a147`, 3.4 `fb20ef3`, 3.5 `11c90f6` (login v2, seed della beta tolto, primo ADMIN con cambio password D-173, rotte di accesso v2 con gli stati richiesti da o3). Prove server a 2 in parallelo stabili (`test:server:completo` = `--maxWorkers=2`, ~470 s); `yarn typecheck` incrementale.
- 09/10: domande di prova dell'assistente (o3, `7b41ab8`): 58 casi S01–S34, P01–P14, I01–I10 con oracolo; i casi su fixture E (di o2) segnati `verifiedOnSeed=false`. Catalogo delle date a 126 voci (`d34159c`).
- 09/10: catalogo semantico delle date dell'assistente (o3, `6471cad`): 117 voci verificate sui template; scelte confermate dalla memoria (GEOLOGICA a PM_PERMESSI, consegne RECORDED separate).
- 09/10: guida aggiornata con l'assistente (§12), i link condivisibili e Configurazione → Assistente AI, dal materiale di o3 (`MATERIALE_GUIDA_ASSISTENTE.md`).
- 09/10: filtri nell'URL di /pratiche, archivio e Statistiche/Carichi (o3, `eaacc45`): link condivisibili, fonti dell'assistente con la vista esatta; il cliente nel menu laterale ora apre senza gli altri filtri.
- 09/10: progetto Google Cloud creato da M (U1: `practicehub-assistente`, numero 828276002341, fatturazione in EUR, ruolo Agent Platform User — nuovo nome di Vertex AI User, budget 50 € con avvisi 50/90/100%, chiave presente su D:).
- 09/10: blocco di produzione K1–K6, PR-22, PR-18 (o2); parte o3 del cutover sul ramo `cutover-o3`; pagine di accesso in italiano; prova generale fase 1; guida e checklist corrette; decisioni dell'assistente D-165…D-171 e contratto v0.4.0.
