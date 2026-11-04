# PracticeHub — Pagina «Andamento» e profilo «Direzione»: nota UX (o3, 11/10/2026)

*Risposta a `PAGINA_ANDAMENTO_v1.md` (D-191, L15). Solo interfaccia: i dati e i nomi dei campi arrivano con il contratto di o2. Nessun codice finché o2 e o3 non hanno deciso come tenere main installabile.*

## In breve

- Una pagina `/andamento` per ADMIN e Direzione, costruita come Statistiche: stessi filtri in alto, stessi riquadri numerici, stesse barre orizzontali. Chi conosce Statistiche la legge subito.
- I blocchi seguono le tre domande del progetto, nell'ordine:
  1. dove si fermano le pratiche;
  2. il lavoro tiene il passo?
  3. come va nel tempo?
- Mai persone né classifiche. Si parla solo di stati, gruppi e clienti.
- Lo stato più lento si indica con una frase e un'etichetta neutra, mai con il rosso.
- Ogni grafico ha accanto la sua tabella, e ogni tabella ha «Esporta CSV».

## 1. Schizzo (1440 px)

```
┌ ANDAMENTO ──────────────────────────────────────────────────────────────┐
│ Come procede il lavoro: dove si fermano le pratiche, entrate e uscite. │
│ Dati dal 03/06/2026 · le pratiche importate contano dal giorno dell'import│
├─────────────────────────────────────────────────────────────────────────┤
│ CLIENTE [Tutti i clienti ▾]  PERIODO [Mese|Trimestre|Anno|Da–a]          │
│ DA [gg/mm/aaaa 📅]  A [gg/mm/aaaa 📅]  PASSO [Settimana|Mese]            │
│ CONFRONTO [Periodo precedente|Stesso periodo anno prima]                │
├────────────┬────────────┬────────────┬────────────┬────────────┬────────┤
│ ATTIVE ORA │ ENTRATE    │ USCITE     │ ARRETRATO  │ FERME      │ TEMPO  │
│ 128        │ 42         │ 37         │ +5         │ 9          │ MEDIANO│
│            │ prec. 38   │ prec. 41   │ nel periodo│ > 30 giorni│ 61 gg  │
└────────────┴────────────┴────────────┴────────────┴────────────┴────────┘

DOVE SI FERMANO LE PRATICHE
┌ Tempo per Stato attività ──────────────────────────── [Esporta CSV] ───┐
│ Le pratiche restano più a lungo in PROTOCOLLATO: mediana 24 giorni      │
│ (periodo precedente 19).                                                │
│ STATO              MEDIANA            MEDIA  PASSAGGI  PREC.            │
│ CREATA             ██▌         3 gg   4 gg      40     3 gg             │
│ ASSEGNATO          ████▌       6 gg   9 gg      38     7 gg             │
│ PROTOCOLLATO  ▸PIÙ LENTO  ████████████  24 gg  31 gg  22  19 gg         │
│ …tutti i 12 stati, nell'ordine fisso dell'app                           │
└─────────────────────────────────────────────────────────────────────────┘
┌ Tempo per gruppo ─────────────────────────────────── [Esporta CSV] ───┐
│ PM/Permessi ████████  18 gg · UT/PE ███ 7 gg · AIE ██ 5 gg · DL █ 3 gg │
└─────────────────────────────────────────────────────────────────────────┘
┌ Pratiche ferme da più di 30 giorni (9) ───────────── [Esporta CSV] ───┐
│ Per stato: PROTOCOLLATO 5 · IN APPROVAZIONE 3 · STAND BY 1              │
│ Per cliente: ILIAD 4 · INWIT 3 · TOWERNET 2                             │
│ CODICE SITO  NOME SITO        CLIENTE  STATO         DAL         GIORNI │
│ IL-TO-0001   Torino Lingotto  ILIAD    PROTOCOLLATO  02/08/2026     70  │
│ …                                          [Mostra tutte (9)]           │
└─────────────────────────────────────────────────────────────────────────┘

IL LAVORO TIENE IL PASSO?
┌ Entrate e uscite per mese ────────────────────────── [Esporta CSV] ───┐
│ ▮▯ ▮▯ ▮▯ ▮▯ …   ▮ entrate  ▯ uscite (TERMINATE + KO)                    │
├ Arretrato a fine mese (stessi mesi, grafico separato) ──────────────────┤
│ ─────╱‾‾‾‾╲────                                                         │
│ [Mostra come tabella]                                                   │
└─────────────────────────────────────────────────────────────────────────┘
┌ Rilavorazioni ──────────┐ ┌ Scadenze e alert ───────────────────────────┐
│ 6 nel periodo (prec. 4) │ │ Attività chiuse entro il forecast  71 %     │
│ Da: KO 3 · DINIEGATO 2… │ │ Alert aperti 14 · scaduti 5 · ripetuti 2    │
└─────────────────────────┘ │ Tempo medio di chiusura degli alert 4 gg    │
                            └─────────────────────────────────────────────┘
```

## 2. Filtri nell'indirizzo

`/andamento?template=ILIAD&da=2025-10-01&a=2026-09-30&passo=mese&confronto=anno`

- Gli stessi nomi di Statistiche (`template`, `da`, `a`), più `passo` (`settimana` | `mese`) e `confronto` (`precedente` | `anno`).
- A differenza di Statistiche, la pagina riscrive l'indirizzo a ogni cambio di filtro (con `router.replace`, senza riempire la cronologia). Così un capo salva la sua vista nei preferiti.
- Valori non validi vengono ignorati e si usa il predefinito, come in `stats-url.ts`. Predefinito: tutti i clienti, ultimi 12 mesi, passo mese, confronto con il periodo precedente.
- I pulsanti Mese, Trimestre e Anno scrivono `da` e `a`. «Da–a» lascia scegliere le date, con il calendario di D-190.
- Il passo Settimana è disponibile fino a 26 settimane. Oltre, la pagina propone il passo Mese, perché più di 26 colonne a settimana non si leggono.

## 3. Ordine dei blocchi

1. **Intestazione**: sotto il titolo, la riga «Dati dal …» e la regola sulle pratiche importate.
2. **Riquadri** (componente `Tile` di Statistiche): Attive ora · Entrate · Uscite · Arretrato (variazione nel periodo) · Ferme oltre N giorni · Tempo mediano complessivo.
   - Sotto ogni numero, il valore del periodo di confronto in piccolo («prec. 38»).
   - Niente frecce rosse o verdi: la variazione è scritta («+5»).
3. **Dove si fermano le pratiche**: Tempo per stato, poi Tempo per gruppo, poi Pratiche ferme.
4. **Il lavoro tiene il passo?**: Entrate e uscite, poi Arretrato.
5. **Rilavorazioni** e **Scadenze e alert**, affiancati a 1440 px e uno sotto l'altro più stretti.
6. **Come va nel tempo**: non è un blocco a parte.
   - Ogni blocco ha la colonna del periodo di confronto.
   - Le tabelle hanno «Serie mensile», che apre la stessa tabella mese per mese, 12 mesi o più.
   - Così il lungo periodo sta vicino all'indicatore a cui si riferisce.

## 4. Grafici e tabelle

- **Barre orizzontali**, le stesse di Statistiche (`BarTable`, CSS, nessuna libreria), per tempo per stato, tempo per gruppo e pratiche ferme per stato e per cliente. Mostrano proporzioni; il numero è sempre scritto accanto.
- **Serie nel tempo** (entrate, uscite, arretrato): un piccolo grafico a colonne in SVG, fatto in casa come le barre, con lo stesso stile.
  - recharts è in package.json ma oggi nessuna pagina lo usa. Lo eviterei, per non aggiungere peso solo qui.
  - Se o2 e la memoria preferiscono recharts, lo carico solo su questa pagina.
- **Un solo asse per grafico.** Entrate e uscite (decine al mese) e arretrato (centinaia) hanno scale diverse: due grafici uno sotto l'altro, con gli stessi mesi allineati. Niente grafico a doppio asse, che inganna.
- **Colori**:
  - le serie in scala di grigi del tema: entrate piene, uscite contornate;
  - il rosso, il giallo e il verde restano per stati e alert, come in tutta l'app, e non si usano per le serie.
- **Accessibilità**:
  - ogni grafico ha «Mostra come tabella» con gli stessi numeri;
  - al passaggio del mouse o col fuoco da tastiera, ogni colonna mostra mese e valori;
  - i grafici hanno un `aria-label` che riassume («Entrate e uscite, ottobre 2025 – settembre 2026»).
- **Pochi dati**: se uno stato ha meno di 5 passaggi nel periodo, mediana e media sono attenuate, con la nota «pochi passaggi: valore poco indicativo». Si evita di leggere un collo di bottiglia dove non c'è.

## 5. Lo stato più lento, senza allarme

- In cima al blocco una frase descrittiva, generata dai numeri: «Le pratiche restano più a lungo in PROTOCOLLATO: mediana 24 giorni (periodo precedente 19).»
- Nella tabella, sulla riga di quello stato, un'etichetta mono maiuscola «PIÙ LENTO», col colore del testo e senza sfondo colorato. La sua barra è piena (colore del testo), le altre grigie.
- Gli stati restano nell'ordine fisso dell'app, non ordinati per tempo: chi confronta due periodi li ritrova sempre nello stesso posto.
- Si considera solo uno stato con almeno 5 passaggi.
- Se due stati sono a pari merito, si nominano tutti e due.
- Gli stati conclusivi dell'app (TERMINATO e KO) non contano come «più lento»: sono punti d'arrivo. Per DINIEGATO, TAR e STAND BY, che sono attese esterne, decide M se contarli o mostrarli a parte.

## 6. Pratiche ferme

- Titolo con la soglia e il conteggio: «Pratiche ferme da più di 30 giorni (9)». La soglia è dell'ADMIN; la Direzione la vede e non la cambia.
- Sopra l'elenco, due righe di sintesi: per stato e per cliente.
- Colonne: Codice Sito, Nome Sito, Cliente, Stato attività (badge), In quello stato dal (data), Giorni, Gruppo in carico.
  - Nessun nome di persona.
  - Ordinate per giorni, dalla più ferma: si ordinano pratiche, non persone.
- Mostra le prime 10, poi «Mostra tutte».
- Click su una riga: la scheda in sola lettura, se o2 lo prevede per la Direzione; altrimenti il codice è testo semplice, senza collegamento (vedi §1 del progetto). Per l'ADMIN porta sempre alla scheda.

## 7. Export

- «Esporta CSV» nell'intestazione di ogni blocco: esporta la tabella di quel blocco con i filtri attivi. Per i grafici, la loro tabella.
- Formato uguale all'export dell'elenco pratiche: separatore «;», date gg/mm/aaaa, numeri con la virgola, intestazioni in italiano.
- Nome del file con filtri e periodo: `andamento-tempo-per-stato_ILIAD_2025-10-01_2026-09-30.csv`.
- Per la prima versione basta l'export per blocco; un «Esporta tutto» in un unico file si può aggiungere dopo.

## 8. Casella «Direzione» in Configurazione → Utenti

- Nel modulo utente, sotto «ADMIN», un secondo interruttore: «Direzione — sola lettura: Andamento e Statistiche di tutti i clienti».
- Se ADMIN è acceso, Direzione è spento e disattivato, con la nota «l'ADMIN vede già tutto».
- Con Direzione acceso le appartenenze non sono obbligatorie: nota «Nessuna: la Direzione non lavora sulle pratiche».
- Nella tabella degli utenti, accanto al nome, l'etichetta «DIREZIONE», come oggi «ADMIN».
- Il filtro per gestore della tabella resta com'è; la Direzione compare sotto «Tutti».

## 9. Menu e intestazione per la Direzione

- Dopo l'accesso la Direzione arriva su `/andamento`, non su `/pratiche`.
- Barra laterale: «Andamento», «Statistiche», «Notifiche». Niente elenco pratiche per cliente, Archivio, Liste, Utenti, Import.
- Intestazione:
  - niente «Chiedi», perché l'assistente è escluso salvo decisione futura;
  - niente «Nuova pratica»;
  - la campanella resta.
- Per l'ADMIN, «Andamento» si aggiunge nella barra laterale sotto «Statistiche».
- Statistiche per la Direzione: tutti i clienti, come per l'ADMIN. Carichi di lavoro per persona: da decidere. Propongo di no, per coerenza con «mai persone» nella vista di direzione: chiedere a M.

## 10. Larghezze, zoom 200%, tema scuro

- **1440 px**: filtri su due righe, sei riquadri in fila, Rilavorazioni e Scadenze affiancati.
- **Zoom 200% (circa 720 px di finestra) e telefono 360 px**:
  - una colonna; riquadri a due per riga; filtri uno sotto l'altro;
  - le tabelle larghe scorrono in orizzontale dentro il loro riquadro, mai la pagina;
  - i grafici a colonne mantengono le colonne leggibili e scorrono dentro il riquadro, con i mesi abbreviati («ott 25»); le etichette non vengono ruotate;
  - «Mostra come tabella» resta sempre raggiungibile.
- **Tema scuro**: solo i colori del tema, nessun colore fisso nei grafici. Va controllato a vista come per i commenti e il calendario.
- **Tastiera**: filtri e pulsanti in ordine di lettura; le colonne dei grafici sono raggiungibili col fuoco solo dalla vista tabella. Si evita di passare su 50 colonne una alla volta.

## 11. Stati vuoti ed errori

- Nessun dato nel periodo: «Nessuna pratica in questo periodo: allarga il periodo o scegli un altro cliente.»
- Periodo prima dell'inizio dei dati: «I dati partono dal 03/06/2026: prima di quella data non ci sono tempi da misurare.»
- Errore o server lento: lo stesso riquadro con il motivo e «Riprova» introdotto oggi (5b2b3a7), mai «Caricamento…» all'infinito.
- Caricamento lungo su più anni: i riquadri compaiono subito, i blocchi man mano, se il contratto lo permette (un endpoint per blocco o uno solo, da decidere con o2).

## 12. Domande aperte (per o2 e la memoria)

1. La Direzione apre la scheda in sola lettura dalle pratiche ferme, oppure vede solo i codici? Dipende da o2.
2. La Direzione vede i Carichi di lavoro per persona in Statistiche? Proposta: no. Decide M.
3. Un endpoint unico o uno per blocco? Uno per blocco permette di mostrare i blocchi man mano e un export per blocco senza ricalcolare.
4. La soglia «ferme da più di N giorni» va in Configurazione → Soglie alert, accanto alle altre soglie?
5. Grafico a colonne fatto in casa, consigliato, oppure recharts già presente ma non usato?
