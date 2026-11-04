# Inventario pre-B2

Estrazione dai sei `docs/baseline/2026-10-08/ASSOCIAZIONI_CAMPI_*.md` e da
`docs/baseline/derivati/LISTE_VALORI_INIZIALI.csv`, da validare **prima** del compilatore dei template (B2).
Contiene solo dati e un report: nessuna logica applicativa. Le deduzioni sono euristiche e ognuna riporta la
regola o la parola chiave usata; i casi dubbi sono marcati e non vengono risolti a indovinare.

**Rigenerare** (dalla root del repository): `node frontend/src/data/_inventario/estrai.mjs`
I CSV usano il separatore `;` e la codifica UTF-8 con BOM, quindi si aprono direttamente con Excel.

## File

| File | Una riga per | Colonne chiave |
|---|---|---|
| `condizioni.csv` | occorrenza con testo nella colonna "Condizione documentata" (304) | `parte_visibilita`, `proposta_condition_json`, `esito`, `riferimento_ripetibile`, `altre_annotazioni` |
| `dtype.csv` | forma testuale del dtype negli MD (16) | `datatype_proposto`, `ripartizione` dopo le eccezioni, `regole_ed_esempi` |
| `master_mirror.csv` | occorrenza di un flowId ripetuto, o di un flowId singolo marcato mirror (248) | `ruolo_dedotto`, `parola_chiave`, `popup_label`, `ambiguo`, `motivo` |
| `ripetibili_liste.csv` | flowId per template, letto sull'occorrenza master (749) | `datatype_proposto`, `repeat_group`, `list_id`, `tipo_lista`, `parent_flow_id`, `incerto` |

## Esiti delle condizioni

La colonna "Condizione documentata" degli MD mescola le condizioni di visibilità con altre annotazioni
(sola visualizzazione, formule, valori, alert, valori predefiniti). Ogni testo è diviso in parti: solo le
parti di visibilità diventano `ConditionDTO`, le altre restano in `altre_annotazioni` con un'etichetta
(`SOLA_VISUALIZZAZIONE`, `FORMULA`, `VALORI`, `ALERT`, `VALORE_PREDEFINITO`, `VALORE_NESSUNO`, `RIPETIZIONE`, `COMPILATO_DA`, `ALTRO`).

| Esito | Significato |
|---|---|
| `RICONOSCIUTA` | forma riconosciuta, campo citato trovato in modo univoco, valore presente nelle liste |
| `RICONOSCIUTA_CON_RISERVA` | proposta presente ma da controllare (vedi `note_estrazione`): omonimi "Deposito sismico" flag/data (scelto il campo a menù), codice ISTAT di "Piemonte" da risolvere in B6 |
| `DA_TRADURRE` | nessuna proposta: voce Ente creata dal vincolo (regola strutturale D-35, non una condizione) e "Compare solo se la condizione è avverata" |
| `NESSUNA_VISIBILITA` | il testo non contiene condizioni di visibilità (solo annotazioni) |

`riferimento_ripetibile` applica la semantica v0.1.5: "stessa riga" per i flowId dello stesso gruppo ripetibile,
"almeno una riga" per quelli di un altro gruppo (unico caso: ILIAD F081 ← F031 Vincoli).

## Master / mirror

Regole: un'occorrenza è **mirror** se la nota o la condizione contiene `mirror`, `sola visualizzazione`,
`sola lettura`, `pop-up` o `ereditato da`, salvo che la nota dichiari esplicitamente "master" senza
"mirror di". Il **master** è l'unica occorrenza non marcata come mirror, oppure l'unica con "master" esplicito.

- `ambiguo = SI`: master non determinabile. Coincidono con i casi aperti di R-1 B1–B4: campi AIE presenti
  sia in PM/Permessi sia in AIE senza indicazione, Forecast AIE, Invio AS/VS in Fase Preliminare (TIM, FASTWEB-VODAFONE).
- `ambiguo = VERIFICARE`: master trovato, ma con un'incoerenza da guardare. Mirror nello stesso gruppo del master
  (Assegnazione UT duplicata, R-1 B3); master con "sola visualizzazione" nella colonna condizione
  (INWIT F105, LEONARDO F065, F116).

## Altre segnalazioni utili per B2

- ILIAD F104/F105 (Fatturabile, Fatturato) sono occorrenze sorgente "mantenute per tracciabilità": in UI vale
  il campo trasversale (D-37), quindi vanno escluse dalle occorrenze del template.
- 6 campi con dtype `TEXT` hanno una lista (Committente e Cliente Finale controllate, Progetto configurabile): da trattare come SELECT.
- `tipo_lista` riporta `MANCANTE` / `INCOMPLETA` quando il CSV delle liste non ha (tutti) i valori.
- FASTWEB-VODAFONE non ha campi di integrazione (Richiesta / Invio / Note integrazione).
