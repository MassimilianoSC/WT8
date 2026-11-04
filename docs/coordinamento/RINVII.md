# PracticeHub — Decisioni in attesa

**Unico elenco** delle decisioni che aspettano Massimiliano (M) o il collaboratore (C). Non se ne tengono altri: due elenchi finiscono per divergere.
**Come si usa:** M può decidere quando vuole, anche una voce alla volta, dicendolo alla memoria ("R-9: ok proposta") oppure scrivendo nella riga **Decisione**. La memoria chiude la voce, la registra in `DECISIONI.md` come D-n e passa l'informazione alla sessione interessata.
**Penna unica:** memoria.

## Riepilogo

| ID | Tema | Aspetta | Urgenza | Blocca |
|---|---|---|---|---|
| R-19 | Continuità con un solo PC: backup fuori dal PC, UPS, PC di riserva, avvio automatico, export di sicurezza, avvio in parallelo agli Excel | M | Media: prima del cutover | Cutover |
| R-6 | Utenti reali e team leader per l'avvio | M / C | Bassa ora, alta al collaudo | Collaudo con utenti veri |
| R-8 | File vecchi alla root non nel repository | M | Bassa | Nulla |
| R-4 | Criteri di decisione di M | M | Continua (man mano) | Nulla |
| R-12 | Prove automatiche Python legacy (`backend/tests`, `pytest.ini`) | M | Bassa | Nulla |
| R-11 | Aggiornare Node locale a 20.19+ o 22 LTS | M | Bassa | Nulla (le sessioni usano `--ignore-engines`) |

---

## R-3 · Assistente AI — *aspetta M*
Da decidere: modello (esterno via API o ospitato internamente), dove gira, quali dati possono uscire verso un servizio esterno (es. nomi di persone, importi), budget mensile indicativo. Il comportamento funzionale è già deciso (sola lettura, stessi permessi dell'utente: D-50).
**Raccomandazione della memoria:** decidere quando le fondamenta (B2–B5) sono costruite; nel frattempo nessun lavoro sull'AI.
**Decisione parziale (09/10, D-165):** l'assistente c'è alla partenza. Domande in corso a M: modello e dove gira, dati che possono uscire, budget.
**Discussione con M (09/10, in corso — nulla di deciso oltre a quanto indicato):**
- *Piattaforma proposta da M:* Vertex AI con un modello Gemini non troppo pesante, adatto a ~20 utenti contemporanei. Nota della memoria: non serve un IP pubblico (solo uscita HTTPS verso `*.googleapis.com`; verifica della connettività da fare con il permesso di M); regione UE (es. Milano); la contemporaneità dipende dalle quote del progetto, non dalla taglia del modello; famiglia Flash adeguata; limite di domande per persona nell'app.
- *Dati (M):* nessun dato particolarmente sensibile; al modello possono andare dati delle pratiche, note e nomi dei colleghi, solo quelli visibili a chi chiede e utili alla domanda.
- *Architettura (proposta della memoria, da confermare):* niente RAG; strumenti di sola lettura eseguiti dall'app al momento, con i permessi dell'utente (dati sempre aggiornati); riassunto pronto dell'utente per le domande comuni; risposta in streaming; stima 2–4 s da verificare con un prototipo prima della costruzione.
- *Account (M):* il progetto Google Cloud lo crea M.
- *Metodo (M, D-117):* progetto completo chiesto al modello potente con `docs/coordinamento/PROMPT_PROGETTO_ASSISTENTE_AI.md` → `docs/proposte/PROGETTO_ASSISTENTE_AI_v1.md`; le scelte di M si fanno sulle opzioni del progetto.
- *Progetto ricevuto (09/10):* `docs/proposte/PROGETTO_ASSISTENTE_AI_v1.md` (modello potente): 9 strumenti di sola lettura, niente RAG, permessi applicati prima dell'invio a Google, prototipo con criteri di passaggio, 82 casi di prova, stima o2 36–50 h, o3 16–23 h, 6–8 giornate più attese. Domande per M M1–M5 (budget, modello e regione, utenti iniziali, registro, limiti personali) in corso, una alla volta.
- *10/10, rilievo di o2 prima del prototipo (documentazione ufficiale letta il 10/10):* su europe-west8 (Milano) ed europe-west4 c'è solo Gemini 2.5 Flash/Flash-Lite, **in pensione il 20/10/2026**; i Flash stabili nuovi (3.8, 3.7, 3.6, 3.5, 3.5-lite, 3.1-lite; function calling e streaming) sono solo su global, us ed **eu** (multi-regione, elaborazione garantita negli stati UE: `aiplatform.eu.rep.googleapis.com`); 3.5 Flash anche su europe-west3 (Francoforte, senza garanzia di elaborazione nella regione) ed europe-west2 (Londra, fuori UE). Prezzi endpoint non global (USD/milione, in/out): 3.8/3.7 Flash 0,825/4,125 fino al 31/12/2026 poi 1,65/8,25; 3.5 Flash 1,65/9,90; 3.5 Flash-Lite 0,33/2,75. Vertex AI rinominato "Gemini Enterprise Agent Platform", SDK `@google/genai` 2.x. **Deciso da M: opzione A, endpoint "eu" (D-179).** Prototipo fatto il 10/10: modello **gemini-3.5-flash-lite** (D-180).
- *Da discutere:* fatturazione; budget e quote; chi lo usa all'inizio; casi d'uso della prima versione; regole di risposta (fonti, "non lo so", KPI deterministici); registro delle conversazioni; comportamento se Google non risponde; domande di prova e revisione avversativa (permessi, testo malevolo nelle note).

## R-19 · Continuità con un solo PC — *aspetta M, prima del cutover*
Con D-134 l'app che sostituirà gli Excel di tutti i team gira su **un solo PC**: se il PC si ferma (guasto, aggiornamento di Windows, spegnimento) nessuno lavora e gli alert delle 09:00 partono in ritardo; se il suo disco si rompe, senza una copia altrove i dati sono persi. Sono le misure di continuità già individuate come obbligatorie prima del cutover.
Da decidere (proposta della memoria tra parentesi):
1. **Dove vanno i backup fuori da questo PC** (NAS o cartella di rete aziendale; backup automatico notturno con lo script S6 + verifica, prova di ripristino periodica). *Proposta del 09/10:* primo livello subito sul disco interno D: (4 TB, D-142); secondo livello su una cartella di rete aziendale dopo la risposta dell'IT (messaggio pronto fornito a M).
2. **UPS** per il PC (consigliato).
3. **PC di riserva** su cui ripristinare in pochi minuti se questo si guasta (consigliato: basta che abbia Docker e accesso ai backup).
4. **Avvio automatico** di Docker e dell'app quando il PC si riaccende, e niente riavvii automatici di Windows in orario di lavoro.
5. **Export CSV periodico** come copia leggibile e piano B se l'app è ferma.
6. **Avvio in parallelo agli Excel** per un periodo, un team alla volta, prima di abbandonarli.
Piano completo delle misure: `PIANO_PRODUZIONE.md` (voci PR-01…PR-33).
**Punto 7 (responsabile):** M; segnalazioni dei colleghi e avvisi tecnici anche a operations@hqe.it, casella letta da più persone (D-150, D-162). Nome di un amministratore di riserva facoltativo, prima dell'uso vero.
**Punto 6 (parallelo agli Excel):** un team alla volta, si parte dal team PM (D-149).
**Punto 4 (avvio automatico e riavvii) — da decidere, senza urgenza.** Problema già vissuto da M: Docker trovato spento al mattino, riparte solo quando M accede alla macchina. Diagnosi del 09/10 (D-147): la macchina non risultava spenta né la sessione chiusa; il 04/10 Docker Desktop si era aggiornato da solo; causa più probabile gli aggiornamenti automatici di Docker Desktop. M è amministratore della macchina (D-148), quindi può fare tutto da sé.
Opzioni (si possono combinare):
- **4a. Aggiornamenti automatici di Docker Desktop disattivati** (Impostazioni → Software updates) e aggiornamenti fatti a mano fuori orario. Un minuto; probabilmente risolve il caso più frequente.
- **4b. Orario di attività di Windows Update**, così Windows non si riavvia in orario di lavoro. Due minuti.
- **4c. Accensione automatica al ritorno della corrente**: opzione del BIOS del PC HP ("After Power Loss → Power On"); si imposta all'avvio della macchina; serve l'IT solo se il BIOS ha una password che M non conosce.
- **4d. Docker che riparte dopo un riavvio senza accesso manuale**, due strade:
  - *accesso automatico* di un **utente locale dedicato** (non l'account aziendale di M) con blocco dello schermo immediato, più l'opzione di Docker Desktop "avvia all'accesso". Semplice; salva una password sulla macchina (avvisare l'IT è una cortesia);
  - *Docker Engine come servizio di Windows* al posto dell'applicazione Docker Desktop: soluzione da server vero, ma cambia il funzionamento anche delle altre app aziendali che girano lì; da pianificare con calma.
- **4e. Avviso se Docker o l'app si fermano** (PR-16, lo prepara o2): così si sa quando succede e perché.
**Proposta della memoria:** 4a e 4b quando M ha due minuti; 4c alla prima occasione di riavvio; per 4d la strada dell'accesso automatico prima del collaudo; 4e con le misure di produzione. A richiesta la memoria scrive la procedura passo passo.
**Decisione:** —

**Punto 3 (PC di riserva):** il PC dei test in arrivo farà da stack di prova, prova di ripristino e riserva (D-146).
**Punto 2 (UPS):** verificare con l'IT, nella stessa mail, che il PC sia sotto l'UPS della sala server; se no, UPS dedicato (D-145).
**Punto 1 deciso in parte (D-144):** copie notturne su D:. **Da fare da M, settimana del 12/10/2026: mail all'IT** per la cartella di rete. Testo pronto:
> Ciao, su un PC nella sala server (HP Pro SFF 400 G9) gira un'applicazione interna che userò per i team. Ho bisogno di una cartella di rete dove la macchina possa salvare ogni notte una copia dei dati (pochi MB, al massimo qualche GB nel tempo), con permesso di scrittura per quel PC. Esiste un server o NAS aziendale adatto? La cartella è già inclusa nei backup aziendali? Inoltre: la presa di quel PC è sotto l'UPS della sala server? Se no, possiamo collegarlo? Infine: la settimana prossima arriverà al mio team un PC per i test; dovrebbe poter leggere la stessa cartella, perché lo useremo anche per le prove di ripristino. Grazie.
**Decisione:** —

## R-6 · Utenti reali per l'avvio — *aspetta M / C*
Da fornire: elenco delle persone con le coppie (cliente, gruppo, ruolo) e i team leader di ogni gestore, con almeno un PM leader per gestore (vedi R-1 D3).
**Nel frattempo:** utenti demo. **M (08/10):** non è una priorità; prima dell'uso reale si collauda con gli account dei collaboratori di M (servirà almeno un PM leader per ogni gestore provato, D-101). I valori mancanti delle liste li inseriranno gli utenti (team leader) in Configurazione → Liste.
**Decisione:** —

## R-7 · Commenti con menzioni — *aspetta M*
La beta ha i commenti alle pratiche con le menzioni (@team), ma non sono nella baseline del collaboratore.
Opzioni: (a) tenerli, collegandoli alle pratiche nuove; (b) toglierli; (c) rinviare a dopo il primo rilascio.
**Raccomandazione della memoria:** (c), per non allargare il primo rilascio; il codice attuale resta nel repository e si può riprendere.
**10/10 sera:** M chiede se gli utenti possono ancora scambiarsi messaggi. Risposta: no; il codice dei commenti della beta è stato tolto nel cutover 3.4 (resta nella storia git). Opzioni riproposte: A prima del collaudo (commenti sotto la pratica con menzioni di gruppi/persone e notifica, stima 1–2 giorni o2+o3), B dopo la partenza, C no. Da riprendere con M l'11/10, insieme alle altre due funzioni della beta tolte senza chiedere a M (D-107): **preferenze di notifica per utente** e **gestionali di default**. Errore della memoria: R-7 andava riproposto prima del cutover del codice.
**Decisione (11/10, D-183):** A, commenti prima del collaudo. Preferenze di notifica: restano tolte (D-188). Gestionali di default: restano tolti (D-189). **R-7 chiuso.**

## R-8 · File vecchi alla root — *aspetta M*
Lasciati fuori dal repository da o2: la cartella di configurazione della vecchia piattaforma, `.gitconfig` (identità della vecchia piattaforma), `memory/PRD.md`, `tests/__init__.py`, `design_guidelines.json` (residui della prima versione; il 04/11/2026 spostati in `Desktop/MEGADASHBOARD-backup-2026-11-04/`); `registro_campi.csv/.json`, `Tabella_Mapping_Completa+SchemaDB.xlsx` (superati, D-13); `URL.txt`, `PASSWORD_TEST.txt` (vuoto), `Modulo Rimborso spese.xls` (estraneo al progetto).
Opzioni: (a) lasciarli dove sono, fuori dal repository; (b) spostarli in una cartella d'archivio fuori dal progetto; (c) cancellarli.
**Raccomandazione della memoria:** (b) per l'Excel di mapping e il vecchio registro (tracciabilità storica), (c) o (b) per il resto a tua scelta; nessuna urgenza.
**Decisione:** —

## R-4 · Criteri di decisione — *aspetta M, man mano*
I criteri con cui la memoria può decidere da sola citando il criterio. Finché un tipo di decisione non è coperto, la memoria lo chiede a M.
**Criteri ricevuti finora:** nessuno in forma esplicita.
**Decisione:** —

## R-12 · Prove automatiche Python legacy — *aspetta M*
`backend/tests/backend_test.py` e `pytest.ini` (cartella `backend/` rimossa il 04/11/2026) puntavano alla vecchia preview online, usano account cancellati e verificano le API della beta: oggi non funzionano. `CLAUDE.md` li cita ("non modificare addopts"). Le prove nuove si scrivono in vitest (lato server: o2; interfaccia: o3).
Opzioni: (a) archiviarli in una cartella `legacy/` e aggiornare `CLAUDE.md`; (b) cancellarli; (c) lasciarli com'è.
**Raccomandazione della memoria:** (a), quando si fa il cutover.
**Decisione:** —

## R-11 · Versione di Node sul computer di sviluppo — *aspetta M*
Il Node installato è 20.18.3; alcuni pacchetti già presenti nel progetto richiedono 20.19 o superiore, quindi le sessioni installano con `--ignore-engines`. Docker (node:20-alpine) non ha il problema.
**Raccomandazione della memoria:** aggiornare a Node 22 LTS (o almeno 20.19) quando ti è comodo; nessuna urgenza.
**Decisione:** —

---

## Voci chiuse

| ID | Chiusa il | Esito |
|---|---|---|
| R-1 | 08/10/2026 | Risposte del collaboratore: tutte le proposte approvate; B3 = eliminazione del duplicato (D-100, D-101). |
| R-10 | 09/10/2026 | Credenziali demo tolte dopo il collaudo, prima dell'uso reale (D-152). |
| R-20 | 08/10/2026 | xlsx 0.20.3 dal sito ufficiale SheetJS, versione fissata e impronta registrata (D-136). |
| R-5 | 08/10/2026 | App interna in Docker su questo PC, rete aziendale; stack di prova separato sullo stesso PC (D-134). |
| R-18 | 08/10/2026 | Cutover dopo i test completi (D-125); export per tutti, filtro per date, nessun assegnatario unico (D-128…D-130). |
| R-9 | 08/10/2026 | Scelte estetiche: restano le proposte di o3 (D-122). |
| R-13 | 08/10/2026 | Dataset ISTAT: lo scarica o2, M approva il permesso (D-123). |
| R-15 | 08/10/2026 | La beta non contiene dati veri; azzeramento con gli utenti (D-124). |
| R-16 | 08/10/2026 | Risposte del collaboratore: tutte le proposte approvate; Note Operative per gruppo e Fatturato solo PM/ADMIN (D-120, D-121). |
| R-17 | 08/10/2026 | Pacchetto MD corretto ricevuto e adottato (D-114). |
| R-2 | 08/10/2026 | File `risposte_chiarimenti_v3_2026-10-08_finale.md` ricevuto, copiato nella baseline (D-102). |
| R-14 | 08/10/2026 | Verificato sulla fonte: legge 8 ottobre 2025 n. 151 (G.U. n. 236 del 10/10/2025) rende il 4 ottobre festa nazionale dal 2026. Registrato in D-97; la riga di o2 nel calendario resta. |
