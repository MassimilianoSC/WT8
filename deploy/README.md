# PracticeHub — stack di esercizio

Questa cartella contiene lo stack Docker dell'app nuova (D-156). È **separato dalla beta** (`docker-compose.yml` alla
radice, progetto `megadashboard-main`), che resta com'è fino al cutover. Lo stesso `compose.yml` serve anche allo
**stack di prova** sul PC dei test (D-146), con un altro `.env`.

| Servizio | Cosa fa | Porte sulla macchina |
|---|---|---|
| `mongo` | MongoDB 7.0 in replica set a un nodo (`rs0`, porta interna 27018); dati nel volume `mongo_data` | **nessuna** (PR-20) |
| `proxy` | HTTPS dedicato a PracticeHub (Caddy) con il certificato di M | **solo** `PH_HTTPS_PORT` (8443) |
| `app` | PracticeHub (Next.js) | nessuna: si entra dal proxy |
| `worker` | job degli alert delle 09:00 e recapito delle mail | nessuna |
| `backup` | copie notturne con verifica e conservazione (K4) | nessuna; scrive in `PH_BACKUP_DIR` su D: |

> **Mai** `docker compose up --build` alla radice del repository: ricostruirebbe la beta (D-161), che resta
> sull'immagine attuale fino alla messa in esercizio. Questo stack si comanda solo con `-f deploy/compose.yml`.

Tutti i servizi ripartono da soli (`restart: unless-stopped`) e hanno i registri ruotati (10 MB × 5 file).

## Prima installazione

1. Copiare `deploy/.env.example` in `deploy/.env` (il file vero **non** va in git) e compilarlo:
   - `PH_PROJECT=practicehub`, `PH_DB=practicehub_prod` (sullo stack di prova: `practicehub-collaudo` e
     `practicehub_collaudo`);
   - `AUTH_SECRET`: uno nuovo per installazione:
     `docker run --rm node:20.19-alpine node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`;
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD`: il primo ADMIN, creato al primo tentativo di accesso **solo se** nel database
     non c'è nessun ADMIN attivo; al primo accesso deve cambiare la password prima di fare altro (D-173). La password
     non si riallinea mai a questo file: dopo il primo accesso cambiarla qui non ha effetto;
   - `PH_PUBLIC_URL=https://<IP fisso della macchina>:8443` (in esercizio l'indirizzo deciso in D-160), `PH_HTTPS_PORT`,
     `PH_CERT_DIR` (sezione HTTPS qui sotto), `PH_BACKUP_DIR`;
   - posta (D-159, la stessa della beta): copiare `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`,
     `SMTP_PASSWORD` e `SMTP_FROM` dal `.env` della beta in `deploy/.env`. Mai valori reali nel repository.
   Se manca una variabile obbligatoria, `docker compose` si ferma e dice quale.
2. Dalla radice del repository:
   `docker compose -f deploy/compose.yml --env-file deploy/.env up -d --build`
3. Controllo: `docker compose -f deploy/compose.yml --env-file deploy/.env ps`: `mongo`, `app` e `proxy` devono
   risultare `healthy`, `worker` e `backup` `running`.
4. Prova da un **altro PC** della rete: aprire `PH_PUBLIC_URL`. Se non risponde, aprire la porta nel firewall di
   Windows della macchina (PowerShell da amministratore):
   `New-NetFirewallRule -DisplayName "PracticeHub HTTPS" -Direction Inbound -Protocol TCP -LocalPort 8443 -Action Allow -Profile Domain,Private`
   Per toglierla: `Remove-NetFirewallRule -DisplayName "PracticeHub HTTPS"`.

Il replica set si inizializza da solo al primo avvio; il database non è raggiungibile dalla rete.

## Comandi operativi (dentro i container)

Gli strumenti sono già compilati nell'immagine (`/app/ops`), senza strumenti di sviluppo:

    docker compose -f deploy/compose.yml --env-file deploy/.env exec worker node ops/outbox-requeue.mjs --failed
    docker compose -f deploy/compose.yml --env-file deploy/.env exec backup node ops/backup-db.mjs backup --uri "mongodb://mongo:27018/?replicaSet=rs0" --db practicehub_prod --dir /backups

Protezioni (D-158): sul database di esercizio `practicehub_prod` reset e ripristino richiedono
`--consenti-esercizio` (il ripristino fa sempre prima una copia di sicurezza e senza `--yes` è solo un'anteprima);
il seed demo è sempre rifiutato. Su `practicehub_collaudo` nessun limite.

**Giorno della partenza: togliere solo le pratiche di prova (D-178).** Restano utenti, password, liste, soglie degli
alert, impostazioni dell'assistente, audit e configurazione; si tolgono pratiche, iterazioni, righe, storico ed
eventi, commenti, alert, notifiche con le loro mail in coda, anteprime e ricevute di import. Prima si ferma chi scrive, poi
anteprima (nessuna modifica, mostra i conteggi), poi esecuzione (fa prima una copia di sicurezza in `/backups`):

    docker compose -f deploy/compose.yml --env-file deploy/.env stop app worker
    docker compose -f deploy/compose.yml --env-file deploy/.env exec backup node ops/reset-db.mjs --uri "mongodb://mongo:27018/?replicaSet=rs0" --db practicehub_prod --solo-pratiche --consenti-esercizio --dir /backups
    docker compose -f deploy/compose.yml --env-file deploy/.env exec backup node ops/reset-db.mjs --uri "mongodb://mongo:27018/?replicaSet=rs0" --db practicehub_prod --solo-pratiche --consenti-esercizio --dir /backups --yes
    docker compose -f deploy/compose.yml --env-file deploy/.env start app worker

**Utenti della prova di carico.** `ops/utenti-prova.mjs` crea `carico01@prova.invalid`… (20 se non si indica `--n`,
massimo 100): attivi, password casuali già impostate, nessun invito né cambio password, appartenenze non leader
(soprattutto UT/PE, AIE e DL, qualche PM e Permessi) sui clienti che hanno pratiche. Sono marcati come prova
(`testAccount`): per loro nessuna mail entra in coda (nemmeno verso il dominio `.invalid`); le notifiche
nell'app restano. Email e password vanno **solo** nel file indicato, mai a schermo. Ripetere il comando li ricrea con
password nuove (se il file esiste già serve `--sovrascrivi`). Ogni creazione e disattivazione lascia una voce di
audit. Prima si crea il file nel container, poi lo si copia sul PC e lo si cancella dal container:

    docker compose -f deploy/compose.yml --env-file deploy/.env exec backup node ops/utenti-prova.mjs --uri "mongodb://mongo:27018/?replicaSet=rs0" --db practicehub_prod --consenti-esercizio --file /tmp/credenziali.json
    docker compose -f deploy/compose.yml --env-file deploy/.env cp backup:/tmp/credenziali.json .playwright-mcp/installazione/credenziali.json
    docker compose -f deploy/compose.yml --env-file deploy/.env exec backup rm /tmp/credenziali.json

Subito dopo la prova si disattivano tutti insieme (solo gli utenti marcati come prova; le sessioni aperte cadono):

    docker compose -f deploy/compose.yml --env-file deploy/.env exec backup node ops/utenti-prova.mjs --uri "mongodb://mongo:27018/?replicaSet=rs0" --db practicehub_prod --consenti-esercizio --disattiva-prova

## HTTPS (K3, PR-21, D-153, D-154)

Il proxy `proxy` (Caddy) è l'unica porta pubblicata dello stack ed è indipendente dal proxy dell'intranet (80/443).
Usa un certificato fornito come file, creato **una volta** da M con [mkcert](https://github.com/FiloSottile/mkcert)
sul proprio PC:

1. `mkcert -install` — crea l'autorità radice di M (una sola volta, vale per tutte le sue app).
2. Certificato con tutti i nomi con cui si apre l'app (in esercizio, D-160: l'IP fisso, il nome breve e il nome
   completo della macchina):
   `mkcert -cert-file practicehub.crt -key-file practicehub.key <IP> <NOME-MACCHINA> <NOME-MACCHINA>.<dominio>`
   (sullo stack di prova: gli stessi nomi del PC dei test).
3. Copiare `practicehub.crt` e `practicehub.key` nella cartella `PH_CERT_DIR` della macchina (es.
   `D:/PracticeHub/certificati`), poi `docker compose -f deploy/compose.yml --env-file deploy/.env up -d proxy`.
4. Sui PC degli utenti, una volta: il file `rootCA.pem` della cartella indicata da `mkcert -CAROOT`, rinominato
   `PracticeHub-radice.crt`, si installa con un doppio clic → "Installa certificato" → "Utente corrente" →
   "Autorità di certificazione radice attendibili"; oppure, senza permessi di amministratore:
   `certutil -user -addstore Root PracticeHub-radice.crt`. Chrome ed Edge lo usano subito; Firefox se è attiva
   l'opzione dei certificati di Windows (`security.enterprise_roots.enabled`).

**Attenzione:** `rootCA-key.pem` (stessa cartella) **non** si distribuisce e non si copia sulla macchina: chi lo ha può
creare certificati validi per tutti i PC che hanno installato la radice. Il certificato di mkcert scade dopo circa
2 anni: si rifà con il passo 2 e si riavvia `proxy` (l'avviso di scadenza arriva con K5).

Il proxy limita il corpo delle richieste a 8 MB (import fino a 5 MB), accetta solo TLS 1.2/1.3 e aggiunge le
intestazioni di sicurezza (HSTS, nosniff, niente iframe).

## Copie notturne (K4, PR-01)

- Ogni notte alle `PH_BACKUP_TIME` (default 01:30, ora di Roma) il servizio `backup` copia `PH_DB` e `PH_DB_legacy`
  nella cartella `PH_BACKUP_DIR` (su D:, **fuori** dal disco virtuale di Docker, D-144), con letture coerenti nel
  tempo; verifica ogni copia (impronte SHA-256, righe, conteggi). Una copia che non supera la verifica diventa
  `<cartella>_NON_VALIDA` e non conta.
- Se la macchina era spenta all'ora della copia, al riavvio del servizio la copia si fa subito (ultima riuscita più
  vecchia di 26 ore).
- Conservazione: l'ultima copia di ognuno degli ultimi 14 giorni, di ognuna delle ultime 13 settimane e di ognuno
  degli ultimi 12 mesi. Non vengono mai toccate le copie di sicurezza dei ripristini (sottocartella `sicurezza`),
  quelle non valide, altri database e altri file.
- Esito di ogni giro nella collezione `backup_runs` di `PH_DB` (per gli avvisi, K5) e nel registro del servizio:
  `docker compose -f deploy/compose.yml --env-file deploy/.env logs backup`.

**Prova di ripristino (PR-03) — solo sullo stack di prova, mai su `practicehub_prod`:** sul PC dei test, con la
cartella delle copie raggiungibile,

    docker compose -f deploy/compose.yml --env-file deploy/.env exec backup node ops/backup-db.mjs verify --from /backups/<cartella>
    docker compose -f deploy/compose.yml --env-file deploy/.env exec backup node ops/backup-db.mjs restore --from /backups/<cartella> --uri "mongodb://mongo:27018/?replicaSet=rs0" --db practicehub_collaudo --drop --yes

e confrontare i conteggi stampati con quelli del manifest.

Per provare una copia di **esercizio**: copiare la sua cartella da `PH_BACKUP_DIR` di HQE-016 nella `PH_BACKUP_DIR` del PC
dei test (oggi a mano, da una condivisione o un disco esterno; poi dalla cartella di rete aziendale, R-19 punto 1).

## Export CSV giornaliero (PR-18)

Ogni giorno dalle `PH_EXPORT_TIME` (default 06:30, ora di Roma) il worker scrive in `PH_EXPORT_DIR` (su D:) una
cartella `AAAA-MM-GG` con un CSV per gestore (`WT8_<gestore>_<data>.csv`): tutte le pratiche non archiviate e
tutte le Note Operative, nello stesso formato per Excel italiano dell'export dell'app. È il **piano B** se l'app è
ferma: i file si aprono con Excel anche senza PracticeHub. Si tengono gli ultimi 7 giorni; un solo worker lo esegue,
una volta al giorno. Quando l'IT darà la cartella di rete (R-19 punto 1), basta puntarvi `PH_EXPORT_DIR`.

**Riservatezza (D-121):** l'export contiene le Note Operative di **tutti** i gruppi. Su D: lo vede solo M. Quando
`PH_EXPORT_DIR` passerà alla cartella di rete, quella cartella dovrà essere accessibile **solo** a M, agli ADMIN e ai
PM leader; altrimenti i gruppi leggerebbero le note degli altri.

**Cartella di rete in pratica:** Docker Desktop su Windows spesso non riesce a montare come volume una cartella di
rete (`\\server\cartella` o un'unità di rete mappata): va provato prima. Se non funziona, `PH_EXPORT_DIR` resta su
D: e una copia programmata dopo le 06:30 con l'Utilità di pianificazione porta i file nella cartella di rete, con
gli stessi permessi ristretti:

    robocopy D:\PracticeHub\export \\server\cartella /MIR

## Salute e avvisi (K5, PR-15, PR-16, PR-17, D-162, D-163)

`GET <PH_PUBLIC_URL>/api/health` (senza accesso, nessun dato riservato) risponde 200 con `status` `ok` o
`degraded` e l'esito di ogni controllo, oppure 503 se il database non risponde. Controlli: **database**;
**worker** (battito degli ultimi 5 minuti); **orologio** (scarto del worker rispetto al database entro 60 s: gli
alert partono alle 09:00 di Roma; all'avvio il worker lo scrive anche nel suo registro); **copie** (ultima copia
riuscita da meno di 26 ore e ultimo giro non fallito); **disco** (spazio della cartella delle copie sopra
`PH_DISK_MIN_FREE_GB`, default 20 GB, e sopra il 10%)); **assistente** (ok se spento, pronto o non ancora usato; non ok solo se è acceso con
una configurazione errata o con troppi guasti del servizio AI di seguito: lo stato diventa `degraded`, mai 503,
e il controllo esterno manda la solita mail di inizio e di fine; nessuna chiamata a Google da qui).

**Controllo esterno a Docker** — `deploy/watchdog/controllo.ps1`, ogni 10 minuti dall'Utilità di pianificazione:
interroga `/api/health` (il certificato autofirmato è accettato solo dentro lo script), controlla anche la
scadenza del certificato (avviso a meno di 30 giorni), lo spazio libero del disco di sistema C: (sotto `PH_DISK_C_MIN_FREE_GB`, default 20 GB: dal container non si vede, PR-17a) e manda una mail ai destinatari `PH_ALERT_TO` con la posta
di `deploy/.env`: **una** all'inizio di ogni problema e **una** quando è risolto. Stato in
`controllo-stato.json` e registro in `controllo.log`, accanto allo script (fuori da git). Si accorge anche di
Docker, app o proxy fermi; non di questa macchina spenta: per quello va installato anche sul PC dei test
(stesso script, con un `.env` che contenga `PH_PUBLIC_URL` della macchina di esercizio, posta e destinatari).

Creare l'attività (PowerShell da amministratore, una volta; parte anche senza utenti collegati):

    schtasks /Create /TN "PracticeHub - controllo" /SC MINUTE /MO 10 /RU SYSTEM /RL HIGHEST /F /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File <REPOSITORY>\deploy\watchdog\controllo.ps1"

(`<REPOSITORY>` = percorso del repository sulla macchina, senza spazi; con spazi va racchiuso tra `\"`). Prova subito: `schtasks /Run /TN "PracticeHub - controllo"`, poi
leggere `controllo.log`. Toglierla: `schtasks /Delete /TN "PracticeHub - controllo" /F`.

## Assistente AI (contratto §13, D-166…D-172)

L'assistente risponde in sola lettura con i permessi di chi domanda; gira nel servizio `app` e chiama Gemini su
Google Cloud (Agent Platform, ex Vertex AI) solo sull'endpoint multi-regione `eu`, con elaborazione nell'UE
(D-179). Se Google non risponde, si ferma solo
l'assistente: pratiche, login, alert e copie continuano.

- **Accendere:** in `deploy/.env` `PH_AI_ENABLED=true`, `GOOGLE_CLOUD_PROJECT`, `PH_AI_LOCATION=eu` (mai `global`,
  D-179), `PH_AI_MODEL`, `PH_AI_CREDENTIAL_FILE`; poi `docker compose ... up -d app`. Da quel
  momento l'ADMIN lo accende e lo spegne per tutti, e regola i limiti per persona, da Configurazione → Assistente AI
  (D-169, D-171), senza riavvii. Con `PH_AI_ENABLED=false` il pulsante "Chiedi" non compare.
- **Chiave dell'account di servizio:** file JSON in `D:/PracticeHub/segreti` (fuori dal repository), montato in sola
  lettura **solo** nel servizio `app` (né worker né copie). Non copiarla altrove e non incollarla in mail o chat.
  Senza `PH_AI_CREDENTIAL_FILE` si monta un segnaposto vuoto (`deploy/vertex-assente.json`) e l'assistente risulta
  non disponibile.
- **Sostituire la chiave:** crearne una nuova sulla console Google, metterla al posto della vecchia nello stesso
  file, `docker compose ... up -d --force-recreate app`, fare una domanda di prova, poi revocare la vecchia chiave
  sulla console.
- **Proxy:** `/api/assistant/messages` passa da Caddy senza compressione e senza buffer, così la risposta arriva
  riga per riga; le altre rotte restano compresse.
- **Registro:** solo metadati per `PH_AI_LOG_TTL_DAYS` giorni (default 30, D-170), mai testo di domande, risposte o note.
- **Budget:** è sul progetto Google (50 €/mese con avvisi a M, D-167); nell'app ci sono solo i limiti per persona.

## Aggiornare e tornare indietro (K6, PR-26, PR-27)

Da PowerShell, nella radice del repository aggiornato (stack di prova prima, poi esercizio):

    powershell -ExecutionPolicy Bypass -File deploy\aggiorna.ps1 -Etichetta 2026-10-15a

Lo script: (1) copia e verifica i due database in `PH_BACKUP_DIR/aggiornamenti/<data>_<etichetta precedente>`;
(2) costruisce `practicehub:<Etichetta>` (con `-SenzaBuild` usa un'immagine già presente); (3) scrive
`PH_TAG=<Etichetta>` in `deploy/.env` (il precedente resta in `.env.prima-<Etichetta>`); (4) riavvia e aspetta che
`app` e `proxy` siano healthy; (5) annota tutto in `deploy/aggiornamenti.log` e stampa il comando per tornare
indietro. Chiede conferma (`-Si` per saltarla). Se qualcosa non va, nulla viene cancellato: si torna indietro con

    powershell -ExecutionPolicy Bypass -File deploy\torna-indietro.ps1 -Etichetta <precedente>
    powershell -ExecutionPolicy Bypass -File deploy\torna-indietro.ps1 -Etichetta <precedente> -Copia aggiornamenti/<cartella>

Senza `-Copia` torna solo l'immagine (dati invariati); con `-Copia` ferma app, worker e proxy, ripristina i due
database dalla copia fatta prima dell'aggiornamento (prima ne salva lo stato attuale in `sicurezza`; in esercizio
con `--consenti-esercizio`) e riparte. Le immagini precedenti restano su Docker: non cancellarle finché la versione
nuova non è provata.

**Versione dei dati (PR-27):** il database dichiara la sua versione (`meta.data_version`) e il programma la sua.
Se non coincidono l'app e il worker **non partono** e `/api/health` lo segnala nel controllo `dati`: dati più recenti
= si è tornati a un'immagine vecchia senza `-Copia`; dati più vecchi = serve la migrazione esplicita, che arriverà
con lo script dedicato insieme alla versione che la richiede. L'avvio non migra mai i dati da sé.
