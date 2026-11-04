# Procedura per M — Installazione di PracticeHub

*Scritta dalla memoria il 10/10/2026 da `deploy/README.md`. **Una sola installazione su HQE-016** (D-178): si installa subito l'app definitiva, i collaboratori la collaudano dai loro PC; il giorno della partenza si tolgono solo le pratiche di prova (utenti e liste restano) e si caricano quelle vere. Il PC in arrivo serve alla riserva e alle prove di ripristino (sezione in fondo).*

## 0. Prima di iniziare (una volta)

Su HQE-016 ci sono già Docker (dati su D:), l'indirizzo fisso 172.16.1.116 (D-160), il codice e la chiave dell'assistente. Mancano le cartelle `D:\PracticeHub\copie`, `export`, `certificati` (se non ci sono, si creano).

**Giorno della partenza:** o2 toglie le pratiche di prova con l'opzione "solo pratiche" dello script (copia di sicurezza e anteprima automatiche, conferma di M), poi si fa l'import degli Excel.

## 1. Certificato HTTPS (una volta per macchina)

Sul **tuo PC** (non sul server), dove resta la chiave della tua autorità di certificazione:
1. Se non l'hai già: scarica mkcert per Windows e dai `mkcert -install`. Crea la tua «autorità radice». Se in passato l'hai già fatto per le altre app, **non** rifarlo: usa quella.
2. Crea il certificato con tutti i nomi della macchina:
   `mkcert -cert-file practicehub.crt -key-file practicehub.key 172.16.1.116 HQE-016 HQE-016.homeonline.locale` 
3. Copia **solo** `practicehub.crt` e `practicehub.key` nella cartella `certificati` della macchina.
4. **Mai** copiare né mandare `rootCA-key.pem` (cartella indicata da `mkcert -CAROOT`).

## 2. File di configurazione `deploy\.env`

Nella cartella del codice: copia `deploy\.env.example` in `deploy\.env` e compila. Il file non va mai in git né in chat.

| Voce | Valore |
|---|---|
| `PH_PROJECT` | `practicehub` |
| `PH_DB` | `practicehub_prod` |
| `PH_PUBLIC_URL` | `https://172.16.1.116:8443` |
| `PH_BACKUP_DIR`, `PH_EXPORT_DIR`, `PH_CERT_DIR` | `D:/PracticeHub/copie`, `D:/PracticeHub/export`, `D:/PracticeHub/certificati` |
| `AUTH_SECRET` | generato con il comando del README |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | la tua email e una password provvisoria robusta: al primo accesso la cambierai |
| `SMTP_*` (6 voci) | copiate dal `.env` della beta (D-159) |
| `PH_ALERT_TO` | la tua email e `operations@hqe.it` (D-162) |
| Assistente (`PH_AI_*`, `GOOGLE_*`) | le aggiunge o2 con l'assistente: progetto `practicehub-assistente`, chiave in `D:/PracticeHub/segreti/vertex-assistant.json` |

## 3. Avvio

PowerShell nella cartella del codice:
1. `docker compose -f deploy/compose.yml --env-file deploy/.env up -d --build` — **mai** `docker compose up --build` senza `-f deploy/compose.yml` (D-161).
2. Dopo qualche minuto: `docker compose -f deploy/compose.yml --env-file deploy/.env ps` → `mongo`, `app`, `proxy` **healthy**; `worker`, `backup` **running**.
3. Apri `PH_PUBLIC_URL` dal browser della macchina: compare la pagina di accesso (prima del passo 5 il browser segnala il certificato).

## 3b. Spegnimento della vecchia app (D-181)

Quando la nuova app risponde, si spegne la vecchia (gruppo **megadashboard-main** in Docker Desktop, porta 3100). I dati restano da parte nel volume `megadashboard-main_mongo_data`, che si cancella più avanti:

    docker stop megadashboard-main-app-1 megadashboard-main-mongo-1
    docker rm megadashboard-main-app-1 megadashboard-main-mongo-1

**Non** usare `docker compose down -v` né cancellare volumi. Dopo questo passo la porta 27017 non è più aperta sulla rete.

## 4. Primo accesso

Entra con `ADMIN_EMAIL` e `ADMIN_PASSWORD`: l'app ti chiede subito di cambiare la password. Da quel momento quella del file non vale più.

## 5. Certificato sui PC degli utenti (una volta per PC)

Copia `rootCA.pem` (cartella `mkcert -CAROOT` del tuo PC) come `PracticeHub-radice.crt` in un posto raggiungibile; su ogni PC: doppio clic → **Installa certificato** → **Utente corrente** → **Autorità di certificazione radice attendibili**. Non servono permessi di amministratore. Se le altre tue app usano già la stessa radice, i PC che l'hanno installata sono già a posto.

## 6. Prova da un altro PC

Da un PC della rete apri `PH_PUBLIC_URL`. Se non risponde, sulla macchina (PowerShell **da amministratore**):
`New-NetFirewallRule -DisplayName "PracticeHub HTTPS" -Direction Inbound -Protocol TCP -LocalPort 8443 -Action Allow -Profile Domain,Private`

## 7. Controllo esterno (avvisi se Docker o l'app si fermano, D-163)

PowerShell **da amministratore**, sostituendo il percorso della cartella del codice:
1. `schtasks /Create /TN "PracticeHub - controllo" /SC MINUTE /MO 10 /RU SYSTEM /RL HIGHEST /F /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File <CARTELLA>\deploy\watchdog\controllo.ps1"`
2. Prova subito: `schtasks /Run /TN "PracticeHub - controllo"`, poi apri `deploy\watchdog\controllo.log`: deve dire che tutto è ok.

## 8. Controlli finali (li verifica la memoria con te)

- Copia notturna: il mattino dopo, in `copie` c'è la cartella della notte e il registro del servizio `backup` dice «verificata».
- Export: il mattino dopo, in `export` c'è la cartella del giorno con un CSV per cliente.
- Avvisi: fermando per prova il servizio `app` (`docker compose -f deploy/compose.yml --env-file deploy/.env stop app`), entro 10 minuti arriva la mail «Guasto: app»; riavviandolo (`… start app`) arriva «Risolto: app».


## Dopo: account dei collaboratori

Da **Configurazione → Utenti** inviti i collaboratori con i ruoli della tabella della checklist di collaudo; ricevono la mail d'invito e scelgono la password.

## PC di riserva (quando arriva, D-177)

Serve solo alla salvaguardia dei dati: Docker installato, accesso alle copie di HQE-016, **prova di ripristino** cronometrata dell'ultima copia (README, «Prova di ripristino»; obiettivo meno di un'ora, PR-03, PR-12) e poi una volta al mese. La memoria scrive i passi quando il PC è arrivato; il codice ci arriva con un unico file (`git bundle`) preparato dalla memoria.

## Aggiornamento dell'installazione (da preparare con o2, K6)

**Prima (bloccanti):**
1. Checkout principale su main all'ultimo commit verificato, **senza modifiche non committate** in `frontend/` (`git status --short frontend`): lo script costruisce l'immagine da quello che c'è sul disco.
2. Unico giro completo verde su quel commit (D-164).
3. Memoria libera: `next build` dentro Docker vuole 2–3 GB; chiudere i programmi pesanti (Gestione attività).
4. Etichetta attuale: `findstr PH_TAG deploy\.env` (dopo l'installazione: `latest`) — è quella a cui si torna.
5. Nessuno al lavoro sull'app per i 3–5 minuti del riavvio; la beta non si tocca.

**Comando** (PowerShell, cartella del progetto): `powershell -ExecutionPolicy Bypass -File deploy\aggiorna.ps1 -Etichetta 2026-10-11a` — copia e verifica i database, costruisce l'immagine nuova, aggiorna `PH_TAG`, riavvia e aspetta che app e proxy siano sani, stampa il comando per tornare indietro (annotarlo). Se la costruzione fallisce non cambia niente.

**Dopo:** `docker compose -f deploy/compose.yml --env-file deploy/.env ps` (tutti con l'immagine nuova); `/api/health` ok; registri senza errori; prova a mano (login, pagine, un commento con menzione, storico, una domanda all'assistente); il giorno dopo, la copia delle 01:30 riuscita.

**Tornare indietro:** `powershell -ExecutionPolicy Bypass -File deploy\torna-indietro.ps1 -Etichetta latest` (solo l'immagine; i dati restano); con `-Copia aggiornamenti/<cartella>` anche i dati di prima (si perde ciò che è stato scritto dopo). Non cancellare l'immagine precedente finché la nuova non è provata.

