# PracticeHub — Continuità delle sessioni o2 e o3 (compact e sostituzione)

**Penna unica:** memoria. Procedura decisa da M (D-118).

## 1. Prima del compact: salvataggio

Il compact lo nota **M**. M lo dice alla memoria («o2 sta per compattare»), e la memoria manda alla sessione il messaggio qui sotto; in alternativa M lo incolla direttamente.

```
PREPARA IL PASSAGGIO: il tuo contesto sta per essere compattato. Fermati al primo punto stabile e:
1. Committa il lavoro finito, solo i tuoi file, per percorso (D-6, D-65). Se qualcosa è a metà, NON committarlo: elencalo.
2. Mandami un unico messaggio "PASSAGGIO" con:
   a. compito in corso e a che punto sei (fatto / manca);
   b. file modificati e non committati, ciascuno con cosa contiene;
   c. scelte tecniche prese nel lavoro in corso e non ancora comunicate;
   d. cose che sai solo tu: trappole trovate, comandi che funzionano o no in questo ambiente, permessi negati, accordi presi nei messaggi;
   e. prossimi passi, in ordine.
3. Poi fermati e aspetta.
```

La memoria salva il messaggio in `CONTINUITA_O2.md` o `CONTINUITA_O3.md` (sovrascrivendo il precedente) e lo committa.

## 2. Dopo il compact: decidono M e la memoria

**a) Nuova sessione al posto di quella compattata.** M apre una sessione nuova e incolla il prompt del §3. La vecchia non riceve più compiti.

**b) La stessa sessione continua.** La memoria le fa le domande di prova del §4 e valuta le risposte con M. Se una risposta è sbagliata o vaga sulle regole (proprietà dei file, database vietato, percorsi in collisione, decisioni recenti), si passa ad a).

Criterio suggerito: se il lavoro era a metà con file non committati, preferire a); se la sessione era ferma tra un compito e l'altro, b) è sufficiente.

## 3. Prompt per la sessione sostitutiva

M sostituisce `<RUOLO>` (o2 / o3) e `<NOME_MEMORIA>` (nome attuale della sessione di memoria, da `/agents` o dalla barra delle sessioni) e incolla:

```
Sei la sessione <RUOLO> del progetto PracticeHub (cartella MEGADASHBOARD-main) e prendi il posto di una sessione precedente (contesto esaurito o sessione chiusa). Il coordinamento è della sessione di memoria "<NOME_MEMORIA>": comunichi solo con lei, con SendMessage.
Prima di fare qualsiasi cosa leggi, in quest'ordine:
1. docs/coordinamento/PROMPT_AVVIO.md e il tuo brief (BRIEF_O2_BACKEND.md o BRIEF_O3_FRONTEND.md);
2. docs/coordinamento/CONTINUITA_<RUOLO in maiuscolo>.md: il passaggio lasciato dalla sessione precedente;
3. docs/coordinamento/LAVORI_APERTI.md (chi fa cosa, chi aspetta chi), STATO.md, PIANO.md e le decisioni più recenti in DECISIONI.md (dalla D-89 in poi; in particolare le regole sulle prove D-164, D-174, D-175, D-176);
4. git log --oneline -30 e git status, per vedere il lavoro committato e quello lasciato a metà.
Non modificare né committare nulla finché la memoria non ti dà il via. Presentati alla memoria con un solo messaggio: cosa hai capito del tuo ruolo, delle regole che non puoi violare, del compito in corso e del prossimo passo.
```

## 4. Domande di prova (sessione che continua dopo il compact)

La memoria le manda tutte insieme; si risponde senza rileggere i documenti, poi la memoria confronta con il registro.

**o2 (backend)**
1. Quali percorsi API non puoi toccare prima del cutover, e perché?
2. Su quale database e porta non puoi mai scrivere né fare prove? Dove vive il modello nuovo?
3. Qual è il compito in corso, a che punto è, e cosa c'è di non committato?
4. Come funziona oggi lo stato impostato a mano e da quale decisione viene?
5. Quali file sono di o3 e cosa fai se una tua modifica li rompe?

**o3 (frontend)**
1. Quali file non puoi toccare e chi decide il contratto dei dati?
2. Cosa cambia quando USE_MOCK diventa false e quando succede?
3. Qual è il compito in corso, a che punto è, e cosa c'è di non committato?
4. Quali scelte di interfaccia sono provvisorie e da quale rinvio dipendono?
5. Chi vede l'anteprima e perché?
