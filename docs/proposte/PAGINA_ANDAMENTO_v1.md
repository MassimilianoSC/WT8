# Pagina «Andamento» e profilo «Direzione» — progetto v1

*Memoria, 11/10/2026. Richiesta di M: «i capi vorrebbero capire come procede il lavoro e se ci sono colli di bottiglia, per valutare come migliorarlo, anche sul lungo termine». Decisione D-191.*

## Scopo

Una pagina che risponde a tre domande:
1. **Dove si fermano le pratiche?** In quali stati e in quali gruppi si accumula il tempo.
2. **Il lavoro tiene il passo?** Quante pratiche entrano e quante escono; l'arretrato cresce o cala.
3. **Come va nel tempo?** Andamento mese per mese, anche su più anni, e confronto con il periodo precedente.

Non sostituisce **Statistiche** (§9–§10), che resta la fotografia operativa per i PM (volumi, scadenze, carichi delle persone). Andamento è la vista di direzione: **stati, gruppi e clienti, mai persone** (G §17.13: nessuna classifica).

## Chi la vede (D-191)

- **ADMIN**: sì.
- **Nuovo profilo «Direzione»**, in sola lettura: vede **Andamento** e **Statistiche** di tutti i clienti; non modifica niente (pratiche, utenti, liste, regole, commenti, assistente esclusi salvo decisione futura). Non ha bisogno di appartenenze. Si assegna da Configurazione → Utenti, come la casella ADMIN.
- Gli altri no.
- Da chiarire con o2: se dalla pagina si apre una pratica (elenco «ferme da troppo»), cosa vede la Direzione. Proposta della memoria: la scheda in sola lettura; se costa troppo nella prima versione, l'elenco mostra i codici senza collegamento.

## Contenuto (prima versione)

Filtri: **cliente** (tutti o uno), **periodo** (mese, trimestre, anno, da–a), **granularità** (settimana / mese). Filtri nell'indirizzo, come in Statistiche, così un capo salva la sua vista nei preferiti.

1. **Tempo per Stato attività** — per ogni stato: tempo medio e mediano di permanenza, numero di passaggi nel periodo. Dagli eventi `STATO` (da → a, data e ora). Lo stato con il tempo più alto è il primo candidato a collo di bottiglia: evidenziarlo senza toni d'allarme.
2. **Tempo per gruppo** — quanto tempo la pratica resta in carico a ciascun gruppo (PM/Permessi, UT/PE, AIE, DL), dagli eventi `ASSIGN`. o2 verifica che gli eventi bastino a ricostruire chi ha la pratica e quando.
3. **Pratiche ferme** — pratiche attive nello stesso stato da più di N giorni (N regolabile dall'ADMIN, proposta 30), per stato e per cliente, con l'elenco.
4. **Entrate e uscite** — per settimana o mese: pratiche nuove (creazione o import), TERMINATE, KO; **arretrato** (attive a fine periodo) come linea.
5. **Rilavorazioni** — quante pratiche tornano indietro o si ripresentano (`REWORK`, `RESUBMIT`) e in quali stati: dicono dove nasce il lavoro rifatto.
6. **Scadenze** — attività chiuse entro / oltre il forecast; alert aperti, scaduti, ripetuti (G §17.13); tempo medio di chiusura degli alert.
7. **Lungo periodo** — ogni indicatore anche come serie mensile (12 mesi e oltre) e confronto con il periodo precedente (stesso periodo dell'anno prima quando c'è).
8. **Export CSV** delle tabelle della pagina (per chi vuole lavorarci in Excel).

## Regole sui dati

- **Si misura solo il tempo vero.** Le pratiche importate non hanno storia prima dell'import: il primo stato dopo un `IMPORT` non conta nei tempi di permanenza (sarebbe falsato). La pagina dice da quando ci sono dati («dati dal …»).
- **Pratiche archiviate comprese** nei tempi e nelle uscite (come le statistiche attuali).
- **Ripresentazione totale:** tempo complessivo dalla prima Data assegnazione all'ultimo TERMINATO (stessa regola di §9).
- **Nessun dato personale**: niente nomi né tempi per persona. Il carico per persona resta in Statistiche, con le sue regole.
- Sola lettura, nessuna scrittura sul database.
- **Prestazioni:** con alcuni anni di dati le aggregazioni devono restare sotto pochi secondi. o2 valuta se servono riepiloghi mensili calcolati dal worker; se sì, ricalcolabili dagli eventi in ogni momento (gli eventi restano la fonte).

## Quando entra

- Si prepara **adesso**, ma entra nell'installazione **solo dopo la partenza** (o prima, se M lo decide): durante il collaudo l'app non cambia per questo lavoro.
- Quindi gli aggiornamenti del collaudo (A16) devono poter partire da main **senza** la pagina a metà. o2 e o3 scelgono come (ramo `andamento` in una cartella separata con `git worktree`, oppure interruttore spento di default) e lo dicono alla memoria prima di iniziare.
- I dati non si perdono aspettando: gli eventi si registrano già oggi.

## Divisione del lavoro

- **o2:** verifica sui dati (eventi `STATO`, `ASSIGN`, `REWORK`, `RESUBMIT`, alert, forecast), proposta del contratto (endpoint, profilo Direzione, permessi), servizio, prove. Prima consegna: la **proposta di contratto** alla memoria.
- **o3:** nota UX con lo schizzo della pagina (in parallelo alla proposta di o2), poi la pagina, la voce di menu e la casella «Direzione» in Configurazione → Utenti.
- **Memoria:** contratto, decisioni, guida (nuova sezione) e checklist (nuova sezione) quando la pagina c'è.
