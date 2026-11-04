# Dati geografici ISTAT

`istat.json` contiene regioni, province (unità territoriali sovracomunali) e comuni per i menu a cascata
Regione → Provincia → Comune (D-40, D-71, D-123). Con il segnaposto `{ "loaded": false }` le rotte
`/api/istat/*` rispondono **503 "Dataset ISTAT non caricato"**; con il dataset caricato rispondono 200.

## Dataset attuale

- **Fonte:** ISTAT, "Codici statistici delle unità amministrative territoriali" — file ufficiale
  `Elenco-comuni-italiani.csv` (https://www.istat.it/storage/codici-unita-amministrative/Elenco-comuni-italiani.csv),
  scaricato dal sito ISTAT e conservato in `docs/baseline/derivati/istat/Elenco-comuni-italiani.csv`.
- **Data di estrazione:** 08/10/2026 (campo `version` del JSON: `2026-10-08`).
- **Contenuto:** 20 regioni, 107 unità territoriali sovracomunali, 7.896 comuni.
- **Licenza:** Creative Commons Attribuzione 4.0 (CC BY 4.0): citare ISTAT come fonte.
- **Codici:** quelli ISTAT (regione 2 cifre, unità sovracomunale 3 cifre, comune alfanumerico 6 cifre); sono i
  codici salvati nei campi Regione / Provincia / Comune delle pratiche.

## Aggiornamento

Il file si scarica **a mano** dalla pagina ufficiale ISTAT (nessun download automatico), si conserva come dato in
`docs/baseline/derivati/istat/`, poi da `frontend/`:

```bash
yarn istat:import ../docs/baseline/derivati/istat/Elenco-comuni-italiani.csv --versione AAAA-MM-GG
```

Lo script riconosce le colonne dall'intestazione, non dalla posizione: codifica Windows-1252 (o UTF-8 con BOM),
separatore `;`, campi tra virgolette che possono andare a capo (nel file ufficiale alcuni nomi di colonna sono
su due righe). Riscrive `istat.json`, che si committa: la build non legge altri percorsi.
