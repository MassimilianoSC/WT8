# Materiale per la guida — Andamento, permesso Direzione, soglia delle pratiche ferme

*o3, 11/10/2026. Pagina completa su main (b3c973a … d41a1f6), dietro l'interruttore `PH_ANDAMENTO`: a interruttore spento non si vede niente di quanto segue. I testi tra virgolette sono quelli a schermo. I numeri degli esempi sono inventati ma plausibili: periodo luglio–settembre 2026, cliente ILIAD, soglia 30 giorni. Da rileggere dopo il controllo a vista.*

## 1. A cosa serve

«Andamento» risponde a tre domande:

1. **Dove si fermano le pratiche?** In quali stati e in quali gruppi passa più tempo.
2. **Il lavoro tiene il passo?** Quante pratiche entrano, quante escono, e se l'arretrato cresce o cala.
3. **Come va nel tempo?** Mese per mese, e confrontato con il periodo prima.

Parla sempre di **stati, gruppi e clienti, mai di persone**. Non ci sono classifiche. Il carico per persona resta in Statistiche → Carichi di lavoro.

Titolo della pagina: "Andamento". Sottotitolo: "Come procede il lavoro: dove si fermano le pratiche, entrate e uscite, andamento nel tempo. Stati, gruppi e clienti, mai persone."

## 2. Chi la vede e come ci si arriva

- **Amministratore:** voce "Andamento" nella barra laterale, nel blocco "Notifiche e configurazione", sopra "Notifiche".
- **Chi ha il permesso Direzione e lavora anche in un gruppo** (per esempio un team leader): tutto come prima (elenco delle pratiche dei suoi clienti, scheda, assistente, Statistiche), **più** la voce "Andamento" e le Statistiche e i Carichi di lavoro di **tutti** i clienti e i gruppi. Nel piede della barra laterale: "Direzione — UT · ILIAD".
- **Chi ha solo Direzione, senza appartenenze:**
  - dopo l'accesso arriva direttamente su Andamento;
  - nella barra laterale vede solo "Andamento", "Notifiche" e "Statistiche";
  - nel piede della barra laterale c'è "Direzione";
  - non ha l'elenco delle pratiche per cliente, non ha "Chiedi" (l'assistente) e non può modificare niente.
- **Tutti gli altri:** la voce non c'è e la pagina `/andamento` risponde "pagina non trovata".

## 3. Filtri, preferiti, confronto

In alto, nel riquadro dei filtri:

- "Cliente": "Tutti i clienti" oppure uno solo.
- "Da" e "A": date scrivibili in gg/mm/aaaa, con il calendario accanto.
- "Periodo": "Mese", "Trimestre", "Anno". Scrivono "Da" e "A" fino a oggi.
- "Passo": "Settimana" o "Mese", cioè come vengono raggruppati i grafici e le serie. Oltre 26 settimane il passo settimanale si spegne: "Per settimana fino a 26 settimane."
- "Confronto": "Periodo precedente", cioè lo stesso numero di giorni appena prima, oppure "Stesso periodo dell'anno prima", che c'è solo se esistono dati.

**Preferiti.** Ogni scelta finisce nell'indirizzo della pagina, per esempio `/andamento?template=ILIAD&da=2026-07-01&a=2026-09-30&confronto=anno`. Salvando la pagina nei preferiti si salva quella vista. Senza filtri: tutti i clienti, ultimi 12 mesi, per mese, confronto con il periodo precedente.

**"Dati dal …".** Sotto i filtri: "Dati dal 03/06/2026 · le pratiche importate contano dal giorno dell'import." I tempi si misurano solo da quando i passaggi sono registrati nell'app. Senza dati: "Nessun dato ancora: i tempi si misurano dai passaggi registrati nell'app."

## 4. I riquadri in alto

Sei numeri. Sotto ognuno, in piccolo, il confronto è **scritto**: niente frecce rosse o verdi.

| Riquadro | Esempio | Come si legge |
|---|---|---|
| "Attive ora" | 128 | Pratiche non TERMINATE né KO e non archiviate, oggi |
| "Entrate" | 42 · "prec. 38 · + 5 da import" | Pratiche create a mano o da rilavorazione nel periodo; quelle create dall'import sono a parte |
| "Uscite" | 37 · "terminate 30 · KO 7 · prec. 41" | Pratiche arrivate a TERMINATO o KO nel periodo |
| "Arretrato" | "+5" · "nel periodo · ora 128" | Quanto è cambiato il numero di pratiche attive dall'inizio alla fine del periodo |
| "Ferme" | 9 · "da più di 30 giorni" | Pratiche attive nello stesso stato da più della soglia (§9) |
| "Tempo mediano" | 61 gg · "pratiche terminate · periodo prec. 58,5 gg" | Tempo tipico dalla creazione al TERMINATO, contando solo le fasi operative |

Con "Stesso periodo dell'anno prima" la scritta diventa "anno prima 38".

**Mediana e media.** La mediana è il valore "di mezzo": metà delle pratiche ci mette meno, metà di più. Non si lascia trascinare da poche pratiche lunghissime, per questo è il numero principale. La media c'è accanto.

## 5. Dove si fermano le pratiche

### 5.1 Tempo per Stato attività

Riquadro "Tempo per Stato attività". Per ogni stato della **fase operativa**, nell'ordine fisso dell'app:

- "Mediana", con una barra che mostra le proporzioni;
- "Media";
- "Passaggi": quante volte le pratiche sono entrate nello stato nel periodo;
- "In corso": quante sono ancora lì a fine periodo, e non entrano nella media;
- "Per data del fatto": solo se ci sono dati, vedi sotto;
- "Prec.": la mediana del periodo di confronto.

Esempio di riga: "PROTOCOLLATO · 24,5 gg · 27,5 gg · 22 · 3 · 21 gg · 19 gg".

**«PIÙ LENTO».** Sopra la tabella c'è una frase che descrive, senza allarmi: "Le pratiche restano più a lungo in PROTOCOLLATO: mediana 24,5 giorni (periodo precedente 19 giorni)." Sulla riga c'è l'etichetta "PIÙ LENTO", senza colore, e la sua barra è piena mentre le altre sono grigie. Regole:

- conta solo uno stato con almeno 5 passaggi conclusi nel periodo;
- TERMINATO e KO non lo sono mai, perché sono punti d'arrivo;
- con un pari merito si nominano tutti e due: "Le pratiche restano più a lungo in ASSEGNATO e PROTOCOLLATO: mediana 24 giorni."

È il primo candidato a collo di bottiglia, non una sentenza: va letto insieme ai passaggi e allo stato prima e dopo.

**Pochi dati.** Con meno di 5 passaggi conclusi, mediana e media sono in grigio, con un asterisco ("40 gg*"), e sotto c'è la nota: "* Meno di 5 passaggi conclusi nel periodo: valore poco indicativo."

**«Per data del fatto».** Alcuni stati cambiano da soli quando si compila una data (per esempio la data di protocollo). Il tempo «nell'app» conta da quando la data è stata scritta. Il tempo «per data del fatto» conta dalla data stessa, che può essere precedente. Se le due colonne sono molto diverse, le date vengono inserite in ritardo.

**Serie.** Sotto la tabella, "Serie mese per mese: mediana per stato" (oppure "settimana per settimana") apre la stessa misura mese per mese: per esempio "PROTOCOLLATO · ago 26 22 gg · set 26 30 gg". I valori con pochi passaggi sono in grigio. "—" vuol dire nessun passaggio in quel mese.

Senza passaggi nel periodo: "Nessun passaggio di stato in questo periodo."

### 5.2 Attese esterne e sospensioni

DINIEGATO, TAR e STAND-BY non sono lavoro dei gruppi: sono attese esterne o sospensioni. Hanno un riquadro a parte, "Attese esterne e sospensioni", con le stesse colonne. Non sono mai "PIÙ LENTO" e non entrano nel tempo mediano delle pratiche. La frase sopra dice chiaramente quanto pesano:

"Attese fuori dal lavoro operativo: TAR (mediana 120 giorni, 2 in corso) e STAND-BY (mediana 15 giorni). Non entrano nei tempi delle fasi operative."

Così si vede quando un ritardo viene dal TAR, senza falsare la lettura del lavoro dei gruppi.

### 5.3 Tempo per gruppo

Riquadro "Tempo per gruppo", con le righe UT/PE, AIE e DL:

- "Assegna": quante volte il gruppo è stato assegnato nel periodo.
- "Tempo per partire": dall'Assegna alla prima modifica di un campo del gruppo.
- "Tempo per la prima consegna": dall'Assegna alla prima attività del gruppo completata.
- Per ognuno la mediana, sotto "media … · n in corso", e "Prec." con "partire 3 gg / consegna 16 gg".

Esempio: "UT/PE · 12 · 2,5 gg (media 3,5 gg · 1 in corso) · 14 gg (media 15 gg)".

Nota fissa: "I tempi di PM/Permessi sono quelli degli stati: il gruppo lavora dalla creazione della pratica." Non esiste un «tempo in carico»: la pratica non torna indietro da un gruppo.

### 5.4 Pratiche ferme

Riquadro "Pratiche ferme da più di 30 giorni (9)". Sono le pratiche attive nello stesso stato da più della soglia, che decide l'amministratore (§9).

- Due righe di sintesi: "Per stato PROTOCOLLATO 5 · IN APPROVAZIONE 3 · STAND-BY 1" e "Per cliente ILIAD 4 · INWIT 3 · TOWERNET 2".
- Elenco dalla più ferma, con le colonne "Codice Sito", "Nome sito", "Cliente", "Stato", "Dal", "Giorni" e "In carico a" (i gruppi abilitati). Prima le 10 più ferme, poi "Mostra tutte (12)".
- **Collegamento alla scheda:** il Codice Sito è cliccabile solo se chi guarda può già aprire quella pratica (le sue pratiche, o tutte per l'amministratore). Per gli altri è testo semplice: Andamento non apre pratiche che non si vedrebbero altrimenti.
- **Ferme da import:** "Di cui ferme da import (1): nessun passaggio di stato dopo l'import, quindi il tempo vero non si conosce." Si apre con un clic e sono separate.
- **Non databili:** "3 pratiche senza data d'ingresso nello stato: ASSEGNATO 2 · PROTOCOLLATO 1. Non sono nell'elenco perché non si sa da quanto sono ferme." Vengono contate, mai nascoste. Se sono zero la riga non c'è.
- Oltre 200 pratiche: "Elenco limitato alle prime 200: l'export CSV le comprende tutte."
- Nessuna ferma: "Nessuna pratica ferma oltre la soglia."

## 6. Il lavoro tiene il passo?

Riquadro "Entrate e uscite per mese" (o "per settimana"):

- **Primo grafico, a colonne:** "Entrate" (colonne piene) e "Uscite (terminate e KO)" (colonne contornate), mese per mese. Passando con il mouse su un mese compaiono i valori, per esempio "luglio 2026: Entrate 12 · Uscite (terminate e KO) 12".
- **Secondo grafico, a linea:** "Arretrato a fine mese", sugli stessi mesi. È un grafico separato perché ha un'altra scala: entrate e uscite sono decine, l'arretrato centinaia. Metterli insieme ingannerebbe.
- "Mostra come tabella" mostra gli stessi numeri in tabella; "Mostra come grafico" torna indietro.
- Nota sotto: "Nel periodo: 5 create dall'import (non contate nelle entrate) · 1 riaperture da TERMINATO o KO."

Come si legge: se per mesi le uscite restano sotto le entrate, la linea dell'arretrato sale e il lavoro non tiene il passo.

## 7. Rilavorazioni e scadenze

### 7.1 Rilavorazioni

Riquadro "Rilavorazioni":

- Tre numeri, ciascuno col suo confronto: "Rilavorazioni 6 · prec. 4", "Ripresentazioni 2 · prec. 1", "Ritorni di stato 5 · prec. 3".
- "Da stato KO 3 · DINIEGATO 3": da quale stato partivano le pratiche rilavorate o ripresentate.
- Tabella "Ritorni a uno stato precedente: dove nasce il lavoro rifatto", con le colonne "Da", "A" e "Volte". Esempio: "PROTOCOLLATO → ASSEGNATO 4".
- "Serie mese per mese": gli stessi tre numeri, mese per mese.

### 7.2 Scadenze e alert

Riquadro "Scadenze e alert":

- "Entro il forecast 71 %", con sotto "71 su 100 · prec. 60 %": attività completate entro l'ultimo forecast. Un completamento conta nel periodo della sua data.
- "Oltre il forecast 29 · prec. 40".
- "Rinviate 4", con la nota "forecast cambiato almeno una volta".
- "Forecast scaduti aperti 7", con la nota "già passati, senza completamento".
- Riga degli alert: "aperti 14 · chiusi 9 · scaduti 5 · ripetuti 2 · sospesi 1 · chiusura in mediana 3 gg (media 4,5 gg)". "Ripetuti" sono quelli rigenerati o con promemoria. Scaduti e sospesi sono quelli aperti a fine periodo.
- Grafico "Entro il forecast" / "Oltre il forecast" per mese.
- "Per attività (n)" apre una tabella con "Attività", "Gruppo", "Entro", "Oltre" e "Rinviate", per esempio "Sopralluogo · UT/PE · 20 · 5 · 2".

## 8. Esportare in Excel (CSV)

- Ogni tabella ha il suo "Esporta CSV" accanto: tempi per stato, serie per stato, gruppi, ferme, entrate e uscite, rilavorazioni ("Da stato" e "Ritorni" hanno ognuno il suo), scadenze e scadenze per attività.
- Il file lo prepara il server con i filtri scelti e un nome che li ricorda. Si apre con Excel.
- Ferme: "Esporta CSV (tutte le 9 pratiche)". Il file le contiene tutte, anche oltre le 200 dell'elenco.

## 9. Se qualcosa non va

- Mentre carica: "Caricamento…".
- Se un riquadro non si carica, mostra il motivo e "Riprova", per esempio "Errore del server: riprova tra poco." Gli altri riquadri restano.
- Sessione scaduta: si torna al login con "Sessione scaduta: accedi di nuovo.", e dopo l'accesso si torna su Andamento con gli stessi filtri.
- I numeri si aggiornano entro qualche minuto: il server tiene i conti per 5 minuti.

## 10. Configurazione (amministratore)

### 10.1 Permesso Direzione — Configurazione → Utenti

- Nell'invito e nella modifica, sotto "ADMIN", c'è l'interruttore "Direzione: legge Andamento e Statistiche di tutti i clienti".
- Si somma alle appartenenze: un team leader con Direzione resta team leader.
- Con Direzione acceso le appartenenze diventano facoltative. Senza appartenenze compare: "Nessuna: solo Direzione (Andamento, Statistiche, Notifiche)."
- Se è acceso "ADMIN", Direzione è spento e grigio, con la nota "L'ADMIN vede già tutto."
- Nella tabella degli utenti, accanto al nome, l'etichetta "DIREZIONE".
- Togliere Direzione a chi non ha appartenenze né ADMIN non si può: "Salva" resta spento e compare "Serve almeno un'appartenenza per un utente non ADMIN.". Prima va aggiunta un'appartenenza, oppure va disattivato l'utente.

### 10.2 Soglia delle pratiche ferme — Configurazione → Soglie alert

- In fondo alla pagina, riquadro "ANDAMENTO": "Pratiche ferme: stesso stato da più di [30] giorni di calendario (1–365)", con "Salva".
- Nota: "Vale per l'elenco «Pratiche ferme» della pagina Andamento, per tutti i clienti." Dopo una modifica compare anche "Ultima modifica 11/10/2026 12:00."
- Solo numeri interi da 1 a 365. Dopo il salvataggio: "Soglia salvata".

## 11. Limiti della prima versione

- **I tempi partono dalla partenza.** Prima del giorno indicato in "Dati dal …" non ci sono tempi. Nei primi mesi molti stati avranno pochi passaggi, e quindi valori in grigio con l'asterisco: è normale.
- **Pratiche importate:** il tempo prima dell'import non si conosce. Il primo stato dopo l'import non conta nei tempi; le ferme da import sono a parte.
- **Giorni di calendario**, non lavorativi: sabati e festivi contano.
- **La scheda si apre solo se è già visibile** a chi guarda. Chi ha solo Direzione vede i codici delle pratiche ferme, ma non apre le schede.
- **Tempo per gruppo:** solo UT/PE, AIE e DL, senza serie mese per mese.
- Nessuna persona e nessuna classifica, per scelta.

## 12. Proposta di righe per la checklist — sezione P (Andamento)

Prima del collaudo l'interruttore Andamento deve essere acceso (lo fa chi gestisce il server). Serve un account in più:

| Sigla | Ruolo | Cliente | Gruppo |
|---|---|---|---|
| DIR | Direzione (solo lettura) | tutti, in lettura | — (nessuna appartenenza) |

**Attenzione:** i numeri si aggiornano entro 5 minuti. In P7 e P8 aspettate qualche minuto, o cambiate filtro e tornate indietro, prima di segnare KO.

| # | Chi | Cosa fare | Cosa deve succedere | Esito |
|---|---|---|---|---|
| P1 | ADM | **Configurazione → Utenti**: invitare DIR con solo **Direzione** acceso, senza appartenenze | L'invito parte; nella tabella, accanto al nome, l'etichetta DIREZIONE. Con ADMIN acceso la casella Direzione è grigia: "L'ADMIN vede già tutto." | |
| P2 | DIR | Accedere | Si apre **Andamento**. Barra laterale: solo Andamento, Notifiche, Statistiche; niente elenco pratiche né **Chiedi** | |
| P3 | DIR | Aprire **Statistiche** e **Carichi di lavoro** | Tutti i clienti, e i carichi di tutti i gruppi | |
| P4 | ADM, poi UTL | ADM accende Direzione su UTL; UTL rientra | UTL ha tutto come prima (elenco ILIAD, scheda, Chiedi) **più** Andamento; in Statistiche vede tutti i clienti | |
| P5 | PM | Cercare Andamento; poi scrivere a mano l'indirizzo `/andamento` | La voce non c'è; l'indirizzo dà "pagina non trovata" | |
| P6 | DIR | Scegliere Cliente ILIAD, Periodo **Trimestre**, Confronto **Stesso periodo dell'anno prima**; copiare l'indirizzo in una nuova scheda del browser | La nuova scheda mostra la stessa vista con gli stessi filtri | |
| P7 | ADM, DIR | ADM conta le pratiche attive in Elenco (tutti i clienti); DIR guarda **Attive ora** | I due numeri coincidono; "Dati dal …" mostra la data di inizio | |
| P8 | PM, poi DIR | PM porta una pratica di prova ILIAD da ASSEGNATO a PROTOCOLLATO; dopo qualche minuto DIR guarda **Tempo per Stato attività** (ILIAD, Mese) | I passaggi di ASSEGNATO salgono di uno; i valori con meno di 5 passaggi sono grigi con l'asterisco e la nota sotto | |
| P9 | DIR | Guardare la frase sopra **Tempo per Stato attività** | Se c'è uno stato con almeno 5 passaggi, la frase "Le pratiche restano più a lungo in …" e l'etichetta PIÙ LENTO sulla sua riga, senza colori d'allarme; mai su TERMINATO, KO, TAR, DINIEGATO, STAND-BY | |
| P10 | PM, poi DIR | PM mette una pratica di prova in **TAR**; DIR guarda | TAR compare in **Attese esterne e sospensioni**, con la sua frase; non nella tabella principale e mai PIÙ LENTO | |
| P11 | ADM, DIR | ADM porta la soglia in **Soglie alert → Andamento** a 1 giorno e salva; DIR guarda **Pratiche ferme**; poi ADM rimette 30 | Con 1 giorno compaiono le pratiche ferme da più di un giorno, dalla più ferma; per DIR i codici non sono cliccabili, per ADM aprono la scheda | |
| P12 | UTL | Con Direzione acceso (P4), guardare **Pratiche ferme** con tutti i clienti | Codici cliccabili solo per le pratiche ILIAD che UTL vede già; gli altri sono testo | |
| P13 | DIR | **Esporta CSV** dalle ferme e dalla serie per stato; aprire i file in Excel | I file si scaricano con un nome che ricorda filtri e periodo; colonne in italiano; le righe delle ferme sono quante dice il link ("tutte le n pratiche") | |
| P14 | DIR | In **Entrate e uscite**: **Mostra come tabella** | Gli stessi numeri del grafico; l'arretrato è in un grafico separato, sugli stessi mesi | |
| P15 | DIR | Periodo **Anno**, poi provare **Passo → Settimana** | Settimana è spento: "Per settimana fino a 26 settimane." | |
| P16 | DIR | Su telefono, o con lo zoom del browser al 200% | La pagina non scorre di lato; le tabelle larghe e i grafici scorrono dentro il loro riquadro | |
| P17 | ADM | Togliere Direzione a DIR, che non ha appartenenze | "Salva" resta spento con la nota "Serve almeno un'appartenenza per un utente non ADMIN."; per togliere l'accesso si disattiva l'utente | |

## 13. Schermate da fare nel controllo a vista

Sull'anteprima usa e getta con i dati sintetici di o2, come DIR e come ADM, a 1440 × 900 salvo dove indicato:

| File | Cosa mostra |
|---|---|
| 13a-andamento-riepilogo.png | Filtri, "Dati dal …" e i sei riquadri (tutti i clienti, ultimi 12 mesi) |
| 13b-andamento-tempo-stati.png | Tempo per Stato attività con la frase, PIÙ LENTO, un valore grigio con asterisco |
| 13c-andamento-attese-esterne.png | Attese esterne e sospensioni con TAR in corso |
| 13d-andamento-serie-stati.png | Serie mese per mese aperta |
| 13e-andamento-gruppi.png | Tempo per gruppo con la nota su PM/Permessi |
| 13f-andamento-ferme.png | Pratiche ferme: sintesi, elenco, ferme da import, non databili, link CSV |
| 13g-andamento-flussi.png | Entrate e uscite, e arretrato (due grafici), con il valore al passaggio del mouse |
| 13h-andamento-flussi-tabella.png | Lo stesso blocco con "Mostra come tabella" |
| 13i-andamento-rilavorazioni.png | Rilavorazioni con i ritorni |
| 13j-andamento-scadenze.png | Scadenze e alert con il grafico |
| 13k-andamento-360.png | La pagina a 360 px (riquadri a due per riga, tabelle che scorrono) |
| 13l-andamento-scuro.png | Tempo per stato e flussi col tema scuro |
| 09f-configurazione-utenti-direzione.png | Modulo utente con l'interruttore Direzione e la nota "Nessuna: solo Direzione …" |
| 09g-configurazione-soglie-andamento.png | Riquadro ANDAMENTO in Soglie alert |
| 13m-andamento-menu-direzione.png | Barra laterale di DIR senza appartenenze (Andamento, Notifiche, Statistiche) |
