# Tabella decisionale completa — ILIAD

## Scopo

Riferimento esterno della guida `GUIDA_RISTRUTTURAZIONE_DASHBOARD_PRACTICEHUB_v8.md`. L'inventario parte esclusivamente dai campi presenti nel documento `Organizzazione Campi - <CLIENTE>`, che costituisce la fonte primaria perché riflette il confronto con i team. Il foglio `Mapping_Dati_Completo` è usato solo come fonte secondaria per proporre o verificare il Campo Universale.

**Regola di precedenza:** nessun campo viene aggiunto perché presente nel mapping. Ogni riga nasce da un campo effettivamente presente nel documento cliente. Il mapping può soltanto fornire un'associazione canonica, un candidato o nessuna associazione (`DA VERIFICARE`). La sezione e il team restano quelli definiti nel documento operativo.

**Confidenza:** `ALTA` = equivalenza diretta/attestata; `MEDIA` = normalizzazione semantica forte ma non perfettamente letterale; `BASSA` = candidato da validare manualmente.

**Fonte organizzazione:** `Organizzazione Campi -ILIAD.txt`  
**Fonte mapping:** `Tabella_Mapping_Completa+SchemaDB` → `Mapping_Dati_Completo`

**dtype:** riportato esclusivamente quando esplicitato nel documento operativo originale; in assenza di indicazione la cella resta vuota.

**id_flusso:** progressivo `Fxxx` assegnato secondo l'ordine operativo dei campi. Le occorrenze di sola visualizzazione o presenti nei pop-up non anticipano il flusso del team proprietario: ereditano l'ID della corrispondente occorrenza operativa master.

## Campi trasversali di pratica — baseline implementativa

Questi campi sono definiti a livello applicativo e valgono per **tutti i gestori**. Non appartengono a una singola fase o a un singolo team e, proprio per questo, **non consumano un `id_flusso`**. La loro presenza costituisce un'eccezione esplicita alla regola secondo cui l'inventario principale nasce dai soli documenti `Organizzazione Campi - <CLIENTE>`.

| Campo trasversale | dtype | Campo Universale / riferimento | Regola / comportamento consolidato |
|---|---|---|---|
| Note Operative | campo libero | Note Operative | Campo globale di pratica, visibile in cima alla visuale principale. Serve per eccezioni e lavorazioni straordinarie non rappresentabili adeguatamente dai campi strutturati. |
| Fatturabile |  | FATTURABILE | Dominio funzionale `SI / NO`. Valorizzazione automatica **30 giorni dopo `Ottenimento Permessi`**, a condizione che `Esito parere Arpa = positivo`. Se `Stato attività = KO`, deve comparire un alert per ricordare al PM la compilazione manuale. Campo da mettere in evidenza nella parte alta della pratica. |
| Fatturato |  | DA VERIFICARE | Dominio funzionale `SI / NO`. Campo trasversale da mettere in evidenza nella parte alta della pratica. La fonte ILIAD corrente non specifica una regola automatica di valorizzazione/completamento ulteriore. |

**Nota ILIAD:** `Fatturabile` e `Fatturato` compaiono anche nell'inventario sorgente della sezione PM/Permessi → `Fatturazione`, perché il documento ILIAD li contiene esplicitamente. Quelle righe sono mantenute per tracciabilità della fonte; nell'interfaccia i due campi devono essere rappresentati una sola volta come campi trasversali di pratica, non duplicati.

## Associazioni

| # | Team | Sezione | Campo nel documento | dtype | id_flusso | Campo Universale proposto | Confidenza | Evidenza / nota | Condizione documentata |
|---:|---|---|---|---|---|---|---|---|---|
| 1 | PM/Permessi | Core Anagrafica Sito | Codice G7 | INTEGER | F001 | Codice G7 | ALTA | Campo Universale esatto (riga 5) |  |
| 2 | PM/Permessi | Core Anagrafica Sito | Codice Sito | TEXT | F002 | Codice Sito | ALTA | Campo Universale esatto (riga 3) |  |
| 3 | PM/Permessi | Core Anagrafica Sito | Nome Sito | TEXT | F003 | Nome Sito | ALTA | Campo Universale esatto (riga 4) |  |
| 4 | PM/Permessi | Core Anagrafica Sito | Committente | TEXT | F004 | COMMITTENTE | ALTA | Campo Universale esatto (riga 131) |  |
| 5 | PM/Permessi | Core Anagrafica Sito | Cliente Finale | TEXT | F005 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 6 | PM/Permessi | Core Anagrafica Sito | Regione | menù a tendina | F006 | Regione | ALTA | Campo Universale esatto (riga 6) |  |
| 7 | PM/Permessi | Core Anagrafica Sito | Provincia | menù a tendina | F007 | Provincia | ALTA | Campo Universale esatto (riga 7) |  |
| 8 | PM/Permessi | Core Anagrafica Sito | Comune | menù a tendina | F008 | Comune | ALTA | Campo Universale esatto (riga 8) |  |
| 9 | PM/Permessi | Core Anagrafica Sito | Indirizzo | TEXT | F009 | Indirizzo Fisico | ALTA | Nome sorgente esatto nel mapping (riga 27) |  |
| 10 | PM/Permessi | Core Anagrafica Sito | Tipologia sito | menù a tendina | F010 | Tipologia Sito | ALTA | Campo Universale esatto (riga 42) |  |
| 11 | PM/Permessi | Core Anagrafica Sito | Tipologia Struttura | menù a tendina | F011 | Tipologia Apparati / Infrastruttura | MEDIA | Il Campo Universale copre la stessa famiglia infrastrutturale, ma è più ampio della sola struttura del sito. |  |
| 12 | PM/Permessi | Core Anagrafica Sito | Altezza traliccio | menù a tendina | F012 | DA VERIFICARE | BASSA | Nessuna associazione sufficientemente supportata (best score 0.60) | compare solo se Tipologia sito= traliccio. <= 30m, >30m |
| 13 | PM/Permessi | Core Anagrafica Sito | Rinforzo | menù a tendina | F013 | DA VERIFICARE | BASSA | Nessuna associazione sufficientemente supportata (best score 0.90) |  |
| 14 | PM/Permessi | Core Anagrafica Sito | Area Apparati | menù a tendina | F014 | Tipologia Apparati / Infrastruttura | MEDIA | Il Campo Universale comprende anche la componente apparati; associazione coerente ma non perfettamente 1:1. |  |
| 15 | PM/Permessi | Core Anagrafica Sito | Incarico / Lavorazione | menù a tendina con selezione multipla | F015 | Incarico / Lavorazione | ALTA | Campo Universale esatto (riga 41) |  |
| 16 | PM/Permessi | Core Anagrafica Sito | Progetto | TEXT | F016 | Progetto / Commessa | ALTA | Nome sorgente esatto nel mapping (riga 45) | si compila solo se NON viene selezionato il valore “New Site” (power up, 2.3, upgrade 5g, 700mhz, swap antenne, dismissione, upgrade 5g + 700mhz) |
| 17 | PM/Permessi | Core Anagrafica Sito | Proprietà / Host | menù a tendina | F017 | Proprietà / Host | ALTA | Campo Universale esatto (riga 12) |  |
| 18 | PM/Permessi | Core Anagrafica Sito | Codice sito Host | campo libero | F018 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 19 | PM/Permessi | Core Anagrafica Sito | Referente | menù a tendina che si popola volta per volta | F019 | Referente | ALTA | Campo Universale esatto (riga 14) |  |
| 20 | PM/Permessi | Dati Anagrafici Secondari | Gestore Tenant | menù a tendina con tutti i clienti | F020 | GESTORE | MEDIA | Il Campo Universale `GESTORE` supporta il concetto; il documento lo specializza al tenant. |  |
| 21 | PM/Permessi | Dati Anagrafici Secondari | Codice sito Tenant | TEXT | F021 | Codici Sito Terzi | MEDIA | Il codice del tenant è un identificativo di sito terzo rispetto al sito principale. | appare solo se viene inserito un valore nel campo “Gestore Tenant” |
| 22 | PM/Permessi | Dati Anagrafici Secondari | Nome sito Tenant | TEXT | F022 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato | appare solo se viene inserito un valore nel campo “Gestore Tenant” |
| 23 | PM/Permessi | Dati Anagrafici Secondari | Coordinate | DECIMAL | F023 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 24 | PM/Permessi | Fase Preliminare | Preesistenze | menù a tendina | F024 | PREESIST. | BASSA | Candidato lessicale `PREESIST.`; associazione non attestata (riga 197; score 0.90) |  |
| 25 | PM/Permessi | Fase Preliminare | Acquisitore | menù a tendina | F025 | ACQUISITORE | ALTA | Campo Universale esatto (riga 130) | compare solo se New site. ESTERNO, INTERNO |
| 26 | PM/Permessi | Fase Preliminare | Data assegnazione | DATE (gg/mm/aaaa) | F026 | Data Assegnazione | ALTA | Campo Universale esatto (riga 10) |  |
| 27 | PM/Permessi | Fase Preliminare | Forecast Protocollo | DATE (gg/mm/aaaa) | F027 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 28 | PM/Permessi | Fase Preliminare | Data sopralluogo | DATE (gg/mm/aaaa) | F028 | Data Sopralluogo | ALTA | Campo Universale esatto (riga 11) |  |
| 29 | PM/Permessi | Fase Preliminare | Invio verbale di sopralluogo | DATE (gg/mm/aaaa) | F029 | INVIO VERBALE DI SOPRALLUOGO | ALTA | Campo Universale esatto (riga 54) |  |
| 30 | PM/Permessi | Fase Preliminare | Vincoli | menù a tendina | F030 | Vincoli | ALTA | Campo Universale esatto (riga 26) |  |
| 31 | PM/Permessi | Fase Preliminare | Revit | menù a tendina | F031 | REVIT | ALTA | Campo Universale esatto (riga 246) |  |
| 32 | PM/Permessi | Fase Preliminare | Note Revit | campo libero | F032 | Note | BASSA | Candidato lessicale `Note`; associazione non attestata (riga 44; score 0.90) | appare solo se Revit=SI → compilano il team permessi |
| 33 | PM/Permessi | Fase Preliminare | Bozza di progetto | DATE (gg/mm/aaaa) | F033 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 34 | PM/Permessi | Fase Preliminare | Richiesta Fornitura Enel | DATE (gg/mm/aaaa) | F034 | RICHIESTA FORNITURA ENEL | ALTA | Campo Universale esatto (riga 134) |  |
| 35 | PM/Permessi | Fase Preliminare | Sopralluogo Enel | DATE (gg/mm/aaaa) | F035 | SOPRALLUOGO ENEL | ALTA | Campo Universale esatto (riga 135) |  |
| 36 | PM/Permessi | Fase Preliminare | Assegnazione rilievo topografico | DATE (gg/mm/aaaa) | F036 | ASSEGNAZIONE RILIEVO TOPOGRAFICO | ALTA | Campo Universale esatto (riga 132) | compare solo se new site raw land → compilano il team permessi |
| 37 | PM/Permessi | Fase Preliminare | Rilievo Topografico | DATE (gg/mm/aaaa) | F037 | RILIEVO TOPOGRAFICO | ALTA | Campo Universale esatto (riga 133) | compare solo se new site raw land→ compilano il team permessi |
| 38 | PM/Permessi | Fase Preliminare | Invio rilievo topografico | DATE (gg/mm/aaaa) | F038 | RILIEVO TOPOGRAFICO | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 133; score 0.95) | compare solo se new site raw land→ compilano il team permessi |
| 39 | PM/Permessi | Fase Preliminare | Assegnazione georadar | DATE (gg/mm/aaaa) | F039 | ASSEGNAZIONE RILIEVO TOPOGRAFICO | BASSA | Candidato lessicale `ASSEGNAZIONE RILIEVO TOPOGRAFICO`; associazione non attestata (riga 132; score 0.85) | compare solo se new site raw land → compilano il team permessi |
| 40 | PM/Permessi | Fase Preliminare | Rilievo georadar | DATE (gg/mm/aaaa) | F040 | ASSEGNAZIONE RILIEVO TOPOGRAFICO | BASSA | Candidato lessicale `ASSEGNAZIONE RILIEVO TOPOGRAFICO`; associazione non attestata (riga 132; score 0.85) | compare solo se new site raw land → compilano il team permessi |
| 41 | PM/Permessi | Fase Preliminare | Invio georadar | DATE (gg/mm/aaaa) | F041 | Invio Pacchetto Permessi | BASSA | Candidato lessicale `Invio Pacchetto Permessi`; associazione non attestata (riga 19; score 0.85) | compare solo se new site raw land → compilano il team permessi |
| 42 | PM/Permessi | Fase Preliminare | CARATTERIZZAZIONE | menù a tendina | F042 | CARATTERIZZAZIONE | ALTA | Campo Universale esatto (riga 169) |  |
| 43 | PM/Permessi | Fase Preliminare | Invio offerta | menù a tendina | F043 | Invio Pacchetto Permessi | BASSA | Candidato lessicale `Invio Pacchetto Permessi`; associazione non attestata (riga 19; score 0.85) | compare solo se CARATTERIZZAZIONE= SI. SI, NO |
| 44 | PM/Permessi | Fase Preliminare | Conferma offerta | menù a tendina | F044 | DA VERIFICARE | BASSA | Nessuna associazione sufficientemente supportata (best score 0.72) | compare solo se CARATTERIZZAZIONE= SI. SI, NO |
| 45 | PM/Permessi | Fase Preliminare | Forecast Invio Caratterizzazione | DATE (gg/mm/aaaa) | F136 | FORECAST | BASSA | Pop-up UT; mirror di `Forecast Invio Caratterizzazione` della sezione operativa UT. |  |
| 46 | PM/Permessi | Fase Preliminare | Tecnico | Menù a tendina | F137 | Progettista / Tecnico | MEDIA | Pop-up UT; mirror di `Tecnico Caratterizzazione` della sezione operativa UT. |  |
| 47 | PM/Permessi | Fase Preliminare | Invio Report Caratterizzazione | DATE (gg/mm/aaaa) | F139 | CARATTERIZZAZIONE | BASSA | Pop-up UT; mirror di `Invio Report Caratterizzazione` della sezione operativa UT. |  |
| 48 | PM/Permessi | Pacchetto Permessi | Assegnazione | DATE (gg/mm/aaaa) | F045 | Data Assegnazione | ALTA | Nome sorgente esatto nel mapping (riga 10) |  |
| 49 | PM/Permessi | Pacchetto Permessi | Progettista / Tecnico | menù a tendina che si popola volta per volta | F046 | Progettista / Tecnico | ALTA | Campo Universale esatto (riga 13) |  |
| 50 | PM/Permessi | Pacchetto Permessi | Fornitore Permessi | menù a tendina che si popola volta per volta | F047 | Fornitore / Impresa | MEDIA | Il Campo Universale rappresenta il fornitore/impresa; il documento lo specializza ai permessi. |  |
| 51 | PM/Permessi | Pacchetto Permessi | Invio PDM | DATE (gg/mm/aaaa) | F048 | Invio PDM / Bozza PM | ALTA | Normalizzazione operativa verso `Invio PDM / Bozza PM` (riga 21) |  |
| 52 | PM/Permessi | Pacchetto Permessi | Approvazione PDM | DATE (gg/mm/aaaa) | F049 | Approvazione PDM / PM | ALTA | Normalizzazione operativa verso `Approvazione PDM / PM` (riga 22) |  |
| 53 | PM/Permessi | Pacchetto Permessi | Caricamento Revit | DATE (gg/mm/aaaa) | F050 | CARICAMENTO REVIT | ALTA | Campo Universale esatto (riga 138) | appare solo se Revit=SI |
| 54 | PM/Permessi | Pacchetto Permessi | AIE | menù a tendina | F051 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 55 | PM/Permessi | Pacchetto Permessi | MW | menù a tendina | F052 | DA VERIFICARE | BASSA | Nessuna associazione sufficientemente supportata (best score 0.60) |  |
| 56 | PM/Permessi | Pacchetto Permessi | Ricezione Scheda Tecnica | DATE (gg/mm/aaaa) | F053 | SCHEDA TECNICA | MEDIA | Il Campo Universale identifica la scheda tecnica; il documento registra specificamente la data/evento di ricezione. | compare solo se AIE=SI |
| 57 | PM/Permessi | Pacchetto Permessi | Ricezione Scheda Parabole | DATE (gg/mm/aaaa) | F054 | SCHEDA RADIO | BASSA | Candidato lessicale `SCHEDA RADIO`; associazione non attestata (riga 56; score 0.85) | compare solo se MW=SI |
| 58 | PM/Permessi | Pacchetto Permessi | Assegnazione AIE | DATE (gg/mm/aaaa) | F055 | ASSEGNAZIONE PE | BASSA | Master operativo; compilato da PM/Permessi. Candidato lessicale `ASSEGNAZIONE PE`; associazione non attestata (riga 52; score 0.90) | compare solo se AIE=SI |
| 59 | PM/Permessi | Pacchetto Permessi | Forecast AIE | DATE (gg/mm/aaaa) | F056 | FORECAST AIE | ALTA | Master operativo; compilato da PM/Permessi. Campo Universale esatto (riga 184) | compare solo se AIE=SI; Alert 2 gg prima; si risolve quando viene compilato il campo “Approvazione AIE” |
| 60 | PM/Permessi | Pacchetto Permessi | Invio CEM | DATE (gg/mm/aaaa) | F119 | DA VERIFICARE | BASSA | Nessuna associazione sufficientemente supportata (best score 0.90) | compare solo se AIE=SI |
| 61 | PM/Permessi | Pacchetto Permessi | Riduzione | DATE (gg/mm/aaaa) | F121 | RIDUZIONI | ALTA | Corrispondenza diretta singolare/plurale con il Campo Universale. | compare solo se AIE=SI |
| 62 | PM/Permessi | Pacchetto Permessi | Approvazione Riduzione | DATE (gg/mm/aaaa) | F122 | OK RIDUZIONI | MEDIA | L’approvazione della riduzione è semanticamente coerente con `OK RIDUZIONI`, ma la label canonica esprime l’esito più che l’evento. | compare solo se AIE=SI |
| 63 | PM/Permessi | Pacchetto Permessi | Invio AIE | DATE (gg/mm/aaaa) | F123 | AIE INVIO | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 166; score 0.95) | compare solo se AIE=SI |
| 64 | PM/Permessi | Pacchetto Permessi | Approvazione AIE | DATE (gg/mm/aaaa) | F124 | OK AIE | MEDIA | L’approvazione AIE è coerente con il Campo Universale `OK AIE`; differenza tra evento di approvazione ed esito. | compare solo se AIE=SI |
| 65 | PM/Permessi | Pacchetto Permessi | XML |  | F057 | XML | ALTA | Campo Universale esatto (riga 208) |  |
| 66 | PM/Permessi | Pacchetto Permessi | Assegnazione AIE di collaudo | DATE (gg/mm/aaaa) | F058 | COLLAUDO | BASSA | Candidato lessicale `COLLAUDO`; associazione non attestata (riga 72; score 0.90) |  |
| 67 | PM/Permessi | Pacchetto Permessi | Forecast misure di fondo | DATE (gg/mm/aaaa) | F059 | FORECAST | BASSA | Candidato lessicale `FORECAST`; associazione non attestata (riga 53; score 0.90) |  |
| 68 | PM/Permessi | Pacchetto Permessi | Invio AIE di collaudo | DATE (gg/mm/aaaa) | F060 | COLLAUDO | BASSA | Candidato lessicale `COLLAUDO`; associazione non attestata (riga 72; score 0.90) |  |
| 69 | PM/Permessi | Pacchetto Permessi | Approvazione AIE di collaudo | DATE (gg/mm/aaaa) | F061 | COLLAUDO | BASSA | Candidato lessicale `COLLAUDO`; associazione non attestata (riga 72; score 0.90) |  |
| 70 | PM/Permessi | Pacchetto Permessi | Invio PP di collaudo | DATE (gg/mm/aaaa) | F062 | COLLAUDO | BASSA | Candidato lessicale `COLLAUDO`; associazione non attestata (riga 72; score 0.90) |  |
| 71 | PM/Permessi | Pacchetto Permessi | Firma PP di collaudo | DATE (gg/mm/aaaa) | F063 | COLLAUDO | BASSA | Candidato lessicale `COLLAUDO`; associazione non attestata (riga 72; score 0.90) |  |
| 72 | PM/Permessi | Pacchetto Permessi | Protocollo AIE di collaudo | DATE (gg/mm/aaaa) | F064 | Protocollo | BASSA | Candidato lessicale `Protocollo`; associazione non attestata (riga 18; score 0.90) |  |
| 73 | PM/Permessi | Pacchetto Permessi | Note Pacchetto Permessi | campo libero | F065 | Note | MEDIA | Normalizzazione operativa verso `Note` (riga 44) |  |
| 74 | PM/Permessi | Pacchetto Permessi | Invio Pacchetto Permessi | DATE (gg/mm/aaaa) | F066 | Invio Pacchetto Permessi | ALTA | Campo Universale esatto (riga 19) |  |
| 75 | PM/Permessi | Pacchetto Permessi | Ricezione PP Firmato | DATE (gg/mm/aaaa) | F067 | DA VERIFICARE | BASSA | Nessuna associazione sufficientemente supportata (best score 0.90) |  |
| 76 | PM/Permessi | Pacchetto Permessi | Invio ricevute di protocollo | DATE (gg/mm/aaaa) | F068 | Protocollo | BASSA | Candidato lessicale `Protocollo`; associazione non attestata (riga 18; score 0.90) |  |
| 77 | PM/Permessi | Pacchetto Permessi | Forecast Ottenimento Permessi | DATE (gg/mm/aaaa) | F069 | FORECAST | BASSA | Candidato lessicale `FORECAST`; associazione non attestata (riga 53; score 0.90) |  |
| 78 | PM/Permessi | Pacchetto Permessi | Ottenimento Permessi | DATE (gg/mm/aaaa) | F070 | Ottenimento Enti / Permessi | ALTA | Nome sorgente esatto nel mapping (riga 24) |  |
| 79 | PM/Permessi | Iter Autorizzativo | Protocollo | DATE (gg/mm/aaaa) | F071 | Protocollo | ALTA | Campo Universale esatto (riga 18) |  |
| 80 | PM/Permessi | Iter Autorizzativo | Richiesta integrazione | DATE (gg/mm/aaaa) | F072 | RICHIESTA INTEGRAZIONI | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 48; score 0.95) |  |
| 81 | PM/Permessi | Iter Autorizzativo | Note integrazione | campo libero | F073 | NOTE INTEGRAZIONI | MEDIA | Normalizzazione operativa verso `NOTE INTEGRAZIONI` (riga 107) | compare solo se compilato il campo “Richiesta integrazione” |
| 82 | PM/Permessi | Iter Autorizzativo | Invio integrazione | DATE (gg/mm/aaaa) | F074 | INVIO VERBALE DI SOPRALLUOGO | BASSA | Candidato lessicale `INVIO VERBALE DI SOPRALLUOGO`; associazione non attestata (riga 54; score 0.85) | compare solo se compilato il campo “Richiesta integrazione” |
| 83 | PM/Permessi | Iter Autorizzativo | Forecast Parere Arpa | DATE (gg/mm/aaaa) | F075 | FORECAST | BASSA | Candidato lessicale `FORECAST`; associazione non attestata (riga 53; score 0.90) |  |
| 84 | PM/Permessi | Iter Autorizzativo | Parere Arpa | DATE (gg/mm/aaaa) | F076 | PARERE ARPA | ALTA | Campo Universale esatto (riga 108) |  |
| 85 | PM/Permessi | Iter Autorizzativo | Esito parere Arpa | menù a tendina | F077 | Esito Enti (ARPA / Soprintendenza) | MEDIA | Il Campo Universale include esplicitamente ARPA tra gli esiti degli enti; è più generale del solo parere ARPA. | compare solo se compilato il campo “Parere Arpa”. Se esito= Negativo→ “Ripresentazione pratica” |
| 86 | PM/Permessi | Iter Autorizzativo | Ripresentazione Pratica |  | F078 | Pratica Sismica | BASSA | Candidato lessicale `Pratica Sismica`; associazione non attestata (riga 87; score 0.85) | compare solo se “Esito parere Arpa”=negativo |
| 87 | PM/Permessi | Iter Autorizzativo | Esito parere Arpa | menù a tendina | F079 | Esito Enti (ARPA / Soprintendenza) | MEDIA | Il Campo Universale include esplicitamente ARPA tra gli esiti degli enti; è più generale del solo parere ARPA. | compare solo se compilato il campo “Ripresentazione Pratica”. Se esito= Negativo→ “Ripresentazione pratica 2” |
| 88 | PM/Permessi | Iter Autorizzativo | Nome Ente | campo libero | F080 | Nome sito Vodafone | BASSA | Candidato lessicale `Nome sito Vodafone`; associazione non attestata (riga 93; score 0.85) |  |
| 89 | PM/Permessi | Iter Autorizzativo | Forecast Ottenimento “Nome ente” | DATE (gg/mm/aaaa) | F081 | FORECAST | BASSA | Candidato lessicale `FORECAST`; associazione non attestata (riga 53; score 0.90) | compare solo se “Vincoli” è compilato |
| 90 | PM/Permessi | Iter Autorizzativo | Ottenimento “Nome ente” | DATE (gg/mm/aaaa) | F082 | Ottenimento Enti / Permessi | MEDIA | Il Campo Universale rappresenta l’ottenimento da enti/permessi; il documento istanzia dinamicamente il singolo ente. | compare solo se compilato il campo “Nome Ente” |
| 91 | PM/Permessi | Iter Autorizzativo | Esito parere “nome ente” | menù a tendina | F083 | Esito Enti (ARPA / Soprintendenza) | MEDIA | Il documento registra l’esito del singolo ente; il Campo Universale aggrega gli esiti degli enti. | compare solo se compilato il campo “Nome Ente” |
| 92 | PM/Permessi | Iter Autorizzativo | Data Autorizzazione finale |  | F084 | DATA | BASSA | Candidato lessicale `DATA`; associazione non attestata (riga 424; score 0.90) |  |
| 93 | PM/Permessi | Iter Autorizzativo | DATA SCADENZA PERMESSI |  | F085 | DATA SCADENZA PERMESSI | ALTA | Campo Universale esatto (riga 73) |  |
| 94 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Geologica | menù a tendina | F086 | ASSEGNAZIONE GEOLOGICA | BASSA | Candidato lessicale `ASSEGNAZIONE GEOLOGICA`; associazione non attestata (riga 143; score 0.90) | compare solo se Tipologia sito=Raw Land e Incarico=New Site |
| 95 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Assegnazione Geologica | DATE (gg/mm/aaaa) | F087 | ASSEGNAZIONE GEOLOGICA | ALTA | Campo Universale esatto (riga 143) | compare solo se Tipologia sito=Raw Land e Incarico=New Site; Si compila solo se Geologica= SI |
| 96 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Forecast Geologica | DATE (gg/mm/aaaa) | F088 | FORECAST | BASSA | Candidato lessicale `FORECAST`; associazione non attestata (riga 53; score 0.90) | compare solo se Tipologia sito=Raw Land e Incarico=New Site; Forecast Geologica = Assegnazione Geologica + 15 giorni (anche non lavorativi); Si compila solo se Geologica= SI |
| 97 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Arrivo Geologica | DATE (gg/mm/aaaa) | F089 | ARRIVO GEOLOGICA | ALTA | Campo Universale esatto (riga 144) | compare solo se Tipologia sito=Raw Land e Incarico=New Site; Si compila solo se Geologica= SI |
| 98 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Assegnazione UT | DATE (gg/mm/aaaa) | F090 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 99 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Note Assegnazione UT | campo libero | F091 | Note | MEDIA | Normalizzazione operativa verso `Note` (riga 44) |  |
| 100 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | PE | menù a tendina | F092 | PE | ALTA | Campo Universale esatto (riga 365) |  |
| 101 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Assegnazione PE | DATE (gg/mm/aaaa) | F093 | ASSEGNAZIONE PE | ALTA | Campo Universale esatto (riga 52) | si compila solo se PE=SI |
| 102 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Note Assegnazione PE | campo libero | F094 | Note | MEDIA | Normalizzazione operativa verso `Note` (riga 44) | si compila solo se PE=SI |
| 103 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Forecast PE | DATE (gg/mm/aaaa) | F140 | FORECAST PE | ALTA | Pop-up UT+PE; mirror di `Forecast PE` della sezione operativa. |  |
| 104 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Forecast UT | DATE (gg/mm/aaaa) | F126 | FORECAST | MEDIA | Pop-up UT+PE; mirror di `Forecast UT` della sezione operativa. |  |
| 105 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Incarico PE | DATE (gg/mm/aaaa) | F141 | ASSEGNAZIONE PE | MEDIA | Pop-up UT+PE; mirror di `Incarico PE` della sezione operativa. |  |
| 106 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | PE incaricato da | menù a tendina | F143 | Assegnatore attivita | MEDIA | Pop-up UT+PE; mirror di `PE incaricato da` della sezione operativa. |  |
| 107 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Invio PE | DATE (gg/mm/aaaa) | F149 | Consegna / Invio PE | ALTA | Pop-up UT+PE; mirror di `Invio PE` della sezione operativa. |  |
| 108 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Incarico VS/AS | DATE (gg/mm/aaaa) | F127 | ASSEGNAZIONE AS/VS | MEDIA | Pop-up UT+PE; mirror di `Incarico VS/AS` della sezione operativa. |  |
| 109 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Fornitore UT | menù a tendina che si popola volta per volta | F130 | Fornitore / Impresa | MEDIA | Pop-up UT+PE; mirror di `Fornitore UT` della sezione operativa. |  |
| 110 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Tipologia attività UT | menù a tendina | F131 | Stato Attività | BASSA | Pop-up UT+PE; mirror di `Tipologia attività UT` della sezione operativa. |  |
| 111 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Invio AS/VS | DATE (gg/mm/aaaa) | F135 | INVIO AS/VS | ALTA | Pop-up UT+PE; mirror di `Invio AS/VS` della sezione operativa. | sempre tranne quando Incarico/Lavorazione = New Site |
| 112 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | INVIO SCHEDA RICHIESTA PALO | DATE (gg/mm/aaaa) | F095 | INVIO SCHEDA RICHIESTA PALO | ALTA | Campo Universale esatto (riga 145) | compare solo se Raw Land+New Site |
| 113 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | SCHEDA SCARICHI ALLA BASE DEL PALO | DATE (gg/mm/aaaa) | F096 | SCHEDA SCARICHI ALLA BASE DEL PALO | ALTA | Campo Universale esatto (riga 146) | compare solo se Raw Land+New Site |
| 114 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | APPROVAZIONE PE | DATE (gg/mm/aaaa) | F097 | APPROVAZIONE PE | ALTA | Campo Universale esatto (riga 189) |  |
| 115 | PM/Permessi | Fatturazione | Offerta Inviata |  | F098 | DA VERIFICARE | BASSA | Nessuna associazione sufficientemente supportata (best score 0.77) |  |
| 116 | PM/Permessi | Fatturazione | Invio Offerta | DATE (gg/mm/aaaa) | F099 | DA VERIFICARE | BASSA | Nuovo campo presente nel documento operativo; associazione canonica da verificare |  |
| 117 | PM/Permessi | Fatturazione | Numero Offerta | libero | F100 | N.P. | BASSA | Candidato lessicale `N.P.`; associazione non attestata (riga 389; score 0.85) |  |
| 118 | PM/Permessi | Fatturazione | Note Offerta | libero | F101 | Note | BASSA | Candidato lessicale `Note`; associazione non attestata (riga 44; score 0.90) |  |
| 119 | PM/Permessi | Fatturazione | ODA | campo varchar 50 | F102 | ODA | ALTA | Campo Universale esatto (riga 43) |  |
| 120 | PM/Permessi | Fatturazione | Note ODA | campo libero | F103 | ODA | BASSA | Candidato lessicale `ODA`; associazione non attestata (riga 43; score 0.90) |  |
| 121 | PM/Permessi | Fatturazione | Fatturabile |  | F104 | FATTURABILE | ALTA | Campo Universale esatto (riga 192) | Si compila automaticamente 30gg dopo Ottenimento Permessi e se Esito parere Arpa = positivo. Se Stato attività = KO compare un alert per ricordare al PM di compilare manualmente il campo Fatturabile. DA METTERE IN EVIDENZA SOPRA |
| 122 | PM/Permessi | Fatturazione | Fatturato |  | F105 | DA VERIFICARE | BASSA | Nuovo campo presente nel documento operativo; associazione canonica da verificare | DA METTERE IN EVIDENZA SOPRA |
| 123 | PM/Permessi | Fatturazione | WCN | menù a tendina | F106 | DA VERIFICARE | BASSA | Nuovo campo presente nel documento operativo; associazione canonica da verificare | compare solo se Committente= CONSORZIO (ERICSSON) |
| 124 | PM/Permessi | Fatturazione | CDMS | menù a tendina | F107 | CDMS | ALTA | Campo Universale esatto (riga 427) | compare solo se Committente= Cellnex |
| 125 | PM/Permessi | Fatturazione | Invio CDMS | DATE (gg/mm/aaaa) | F108 | CDMS INVIATO | MEDIA | Il Campo Universale registra lo stato/evento di CDMS inviato; il documento usa la data di invio. | compare solo se Committente=Cellnex; alert 1 settimana dopo la data indicata, ripetuto 1 volta a settimana fino a quando il campo EM (data) non viene compilato |
| 126 | PM/Permessi | Fatturazione | EM | menù a tendina | F111 | EM | ALTA | Campo Universale esatto (riga 418) |  |
| 127 | PM/Permessi | Fatturazione | Numero EM | libero | F110 | EM | BASSA | Candidato lessicale `EM`; associazione non attestata (riga 418; score 0.90) |  |
| 128 | PM/Permessi | Fatturazione | EM | DATE (gg/mm/aaaa) | F109 | EM | ALTA | Campo Universale esatto (riga 418) |  |
| 129 | PM/Permessi | Fatturazione | AGORA’ |  | F112 | AGORA | ALTA | Campo Universale esatto (riga 423) | solo se Committente = Cellnex → verificare |
| 130 | AIE | Fase AIE | Assegnazione AIE | DATE (gg/mm/aaaa) | F055 | ASSEGNAZIONE PE | BASSA | Sola visualizzazione; ereditato da PM/Permessi. Mirror di `Assegnazione AIE`. Candidato lessicale `ASSEGNAZIONE PE`; associazione non attestata (riga 52; score 0.90) |  |
| 131 | AIE | Fase AIE | Forecast AIE | DATE (gg/mm/aaaa) | F056 | FORECAST AIE | ALTA | Sola visualizzazione; ereditato da PM/Permessi. Mirror di `Forecast AIE`. Campo Universale esatto (riga 184) | compare solo se AIE=SI |
| 132 | AIE | Fase AIE | Tecnico Misure di fondo | menù a tendina che si popola volta per volta | F113 | N° MISURE RICH... | BASSA | Candidato lessicale `N° MISURE RICH...`; associazione non attestata (riga 440; score 0.85) |  |
| 133 | AIE | Fase AIE | Stato misure di fondo | menù a tendina | F114 | Stato Attività | BASSA | Candidato lessicale `Stato Attività`; associazione non attestata (riga 9; score 0.85) |  |
| 134 | AIE | Fase AIE | Tecnico AIE | menù a tendina che si popola volta per volta | F115 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta il tecnico/progettista; il documento lo specializza al team AIE. |  |
| 135 | AIE | Fase AIE | Stato assegnazione tecnico AIE | menù a tendina | F116 | Stato Attività | BASSA | Candidato lessicale `Stato Attività`; associazione non attestata (riga 9; score 0.85) |  |
| 136 | AIE | Fase AIE | Responsabile interno AIE | menù a tendina | F117 | OK AIE | BASSA | Candidato lessicale `OK AIE`; associazione non attestata (riga 20; score 0.85) |  |
| 137 | AIE | Fase AIE | Stato AIE | menù a tendina | F118 | Stato Attività | BASSA | Candidato lessicale `Stato Attività`; associazione non attestata (riga 9; score 0.85) |  |
| 138 | AIE | Fase AIE | Invio CEM | DATE (gg/mm/aaaa) | F119 | DA VERIFICARE | BASSA | Nessuna associazione sufficientemente supportata (best score 0.90) |  |
| 139 | AIE | Fase AIE | Fine attività AIE | DATE (gg/mm/aaaa) | F120 | OK AIE | BASSA | Candidato lessicale `OK AIE`; associazione non attestata (riga 20; score 0.85) |  |
| 140 | AIE | Fase AIE | Riduzione | DATE (gg/mm/aaaa) | F121 | RIDUZIONI | ALTA | Corrispondenza diretta singolare/plurale con il Campo Universale. |  |
| 141 | AIE | Fase AIE | Approvazione Riduzione | DATE (gg/mm/aaaa) | F122 | OK RIDUZIONI | MEDIA | L’approvazione della riduzione è semanticamente coerente con `OK RIDUZIONI`, ma la label canonica esprime l’esito più che l’evento. |  |
| 142 | AIE | Fase AIE | Invio AIE | DATE (gg/mm/aaaa) | F123 | AIE INVIO | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 166; score 0.95) |  |
| 143 | AIE | Fase AIE | Approvazione AIE | DATE (gg/mm/aaaa) | F124 | OK AIE | MEDIA | L’approvazione AIE è coerente con il Campo Universale `OK AIE`; differenza tra evento di approvazione ed esito. |  |
| 144 | AIE | Fase AIE | Note AIE | campo libero | F125 | Note | MEDIA | Normalizzazione operativa verso `Note` (riga 44) |  |
| 145 | UT+PE | UT | Assegnazione UT | DATE (gg/mm/aaaa) | F090 | DA VERIFICARE | BASSA | Sola visualizzazione; compilato da PM. Mirror di `Assegnazione UT`. |  |
| 146 | UT+PE | UT | Note Assegnazione UT | campo libero | F091 | Note | MEDIA | Sola visualizzazione; compilato da PM. Mirror di `Note Assegnazione UT`. |  |
| 147 | UT+PE | UT | Forecast UT | DATE (gg/mm/aaaa) | F126 | FORECAST | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 53; score 0.95) |  |
| 148 | UT+PE | UT | Incarico VS/AS | DATE (gg/mm/aaaa) | F127 | ASSEGNAZIONE AS/VS | MEDIA | Il campo descrive la presa in carico/assegnazione VS-AS; il Campo Universale usa la terminologia `ASSEGNAZIONE AS/VS`. | di base viene inserita la data del giorno |
| 149 | UT+PE | UT | VS/AS incaricata da | menù a tendina | F128 | Assegnatore attivita | MEDIA | Il campo identifica chi ha effettuato l’incarico; il Campo Universale `Assegnatore attivita` è coerente. |  |
| 150 | UT+PE | UT | Tecnico UT | menù a tendina che si popola volta per volta | F129 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta il tecnico/progettista; il documento lo specializza al team UT. |  |
| 151 | UT+PE | UT | Fornitore UT | menù a tendina che si popola volta per volta | F130 | Fornitore / Impresa | MEDIA | Il Campo Universale rappresenta il fornitore/impresa; il documento lo specializza al team UT. | possibilità di inserire valore “nessuno” |
| 152 | UT+PE | UT | Tipologia attività UT | menù a tendina | F131 | Stato Attività | BASSA | Candidato lessicale `Stato Attività`; associazione non attestata (riga 9; score 0.85) | Valori: VS, AS, Dimensionamento plinto, VS plinto, fattibilità, correzione PE |
| 153 | UT+PE | UT | Importo UT | campo numerico | F132 | IMPORTO | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 156; score 0.95) |  |
| 154 | UT+PE | UT | Costo UT | campo numerico | F133 | Richiesta analisi UT | BASSA | Candidato lessicale `Richiesta analisi UT`; associazione non attestata (riga 98; score 0.85) | si riferisce sempre al pagamento di un esterno, non descrive un costo interno; distinto da Costo PE |
| 155 | UT+PE | UT | Fine attività UT | DATE (gg/mm/aaaa) | F134 | Week effettiva chiusura attivita | BASSA | Candidato lessicale `Week effettiva chiusura attivita`; associazione non attestata (riga 32; score 0.85) |  |
| 156 | UT+PE | UT | Invio AS/VS | DATE (gg/mm/aaaa) | F135 | INVIO AS/VS | ALTA | Campo Universale esatto (riga 55) | compare solo se New Site |
| 157 | UT+PE | UT | Forecast Invio Caratterizzazione | DATE (gg/mm/aaaa) | F136 | FORECAST | BASSA | Candidato lessicale `FORECAST`; associazione non attestata (riga 53; score 0.90) | compare solo se Caratterizzazione = SI |
| 158 | UT+PE | UT | Tecnico Caratterizzazione | Menù a tendina | F137 | Progettista / Tecnico | MEDIA | Specializzazione operativa del tecnico/progettista per la caratterizzazione. | compare solo se Caratterizzazione = SI |
| 159 | UT+PE | UT | Fornitore Caratterizzazione | menù a tendina | F138 | Fornitore / Impresa | MEDIA | Specializzazione operativa del fornitore per la caratterizzazione. | compare solo se Caratterizzazione = SI |
| 160 | UT+PE | UT | Invio Report Caratterizzazione | DATE (gg/mm/aaaa) | F139 | CARATTERIZZAZIONE | BASSA | Candidato lessicale `CARATTERIZZAZIONE`; associazione non attestata (riga 169; score 0.90) | compare solo se Caratterizzazione = SI |
| 161 | UT+PE | PE | Assegnazione Geologica | DATE (gg/mm/aaaa) | F087 | ASSEGNAZIONE GEOLOGICA | ALTA | Pop-up PM/Permessi; mirror di `Assegnazione Geologica` compilato da PM. | Pop-up PM/Permessi; compare solo se Tipologia sito=Raw Land e Incarico=New Site; sola visualizzazione; Si compila solo se Geologica= SI |
| 162 | UT+PE | PE | Forecast Geologica | DATE (gg/mm/aaaa) | F088 | FORECAST | BASSA | Pop-up PM/Permessi; mirror di `Forecast Geologica` compilato da PM. | Pop-up PM/Permessi; compare solo se Tipologia sito=Raw Land e Incarico=New Site; sola visualizzazione; Si compila solo se Geologica= SI |
| 163 | UT+PE | PE | Arrivo Geologica | DATE (gg/mm/aaaa) | F089 | ARRIVO GEOLOGICA | ALTA | Pop-up PM/Permessi; mirror di `Arrivo Geologica` compilato da PM. | Pop-up PM/Permessi; compare solo se Tipologia sito=Raw Land e Incarico=New Site; sola visualizzazione; Si compila solo se Geologica= SI |
| 164 | UT+PE | PE | Assegnazione PE | DATE (gg/mm/aaaa) | F093 | ASSEGNAZIONE PE | ALTA | Sola visualizzazione; compilato da PM. Mirror di `Assegnazione PE`. |  |
| 165 | UT+PE | PE | Note Assegnazione PE | campo libero | F094 | Note | MEDIA | Sola visualizzazione; compilato da PM. Mirror di `Note Assegnazione PE`. |  |
| 166 | UT+PE | PE | Forecast PE | DATE (gg/mm/aaaa) | F140 | FORECAST PE | ALTA | Campo Universale esatto (riga 171) |  |
| 167 | UT+PE | PE | Incarico PE | DATE (gg/mm/aaaa) | F141 | ASSEGNAZIONE PE | MEDIA | La data di incarico PE è coerente con il Campo Universale `ASSEGNAZIONE PE`, pur con terminologia diversa. | di base viene inserita la data del giorno |
| 168 | UT+PE | PE | Tipologia attività PE | menù a tendina | F142 | Stato Attività | BASSA | Candidato lessicale `Stato Attività`; associazione non attestata (riga 9; score 0.85) | si compila automaticamente con il valore corrispondente a Incarico/Lavorazione o Progetto (se Incarico/Lavorazione = New Site) |
| 169 | UT+PE | PE | PE incaricato da | menù a tendina | F143 | Assegnatore attivita | MEDIA | Il campo identifica chi ha effettuato l’incarico PE; corrisponde al concetto di assegnatore. |  |
| 170 | UT+PE | PE | Tecnico PE | menù a tendina che si popola volta per volta | F144 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta il tecnico/progettista; il documento lo specializza al team PE. | possibilità di inserire valore “nessuno”; possibilità di inserire più tecnici |
| 171 | UT+PE | PE | Fornitore PE | menù a tendina che si popola volta per volta | F145 | Fornitore / Impresa | MEDIA | Il Campo Universale rappresenta il fornitore/impresa; il documento lo specializza al team PE. | possibilità di inserire valore “nessuno” |
| 172 | UT+PE | PE | Importo PE | campo numerico | F146 | IMPORTO | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 156; score 0.95) |  |
| 173 | UT+PE | PE | Costo PE | campo numerico | F147 | PE | BASSA | Candidato lessicale `PE`; associazione non attestata (riga 365; score 0.90) | utile solo se collegato con G7 |
| 174 | UT+PE | PE | Fine attività PE | DATE (gg/mm/aaaa) | F148 | PE | BASSA | Candidato lessicale `PE`; associazione non attestata (riga 365; score 0.90) |  |
| 175 | UT+PE | PE | Invio PE | DATE (gg/mm/aaaa) | F149 | Consegna / Invio PE | ALTA | Corrispondenza esplicita con il Campo Universale `Consegna / Invio PE`. |  |
| 176 | UT+PE | PE | INVIO SCHEDA RICHIESTA PALO | DATE (gg/mm/aaaa) | F095 | INVIO SCHEDA RICHIESTA PALO | ALTA | Pop-up PM/Permessi; mirror di `INVIO SCHEDA RICHIESTA PALO` compilato da PM. | compare solo se Raw Land+New Site; sola visualizzazione |
| 177 | UT+PE | PE | SCHEDA SCARICHI ALLA BASE DEL PALO | DATE (gg/mm/aaaa) | F096 | SCHEDA SCARICHI ALLA BASE DEL PALO | ALTA | Pop-up PM/Permessi; mirror di `SCHEDA SCARICHI ALLA BASE DEL PALO` compilato da PM. | compare solo se Raw Land+New Site; sola visualizzazione |
| 178 | UT+PE | PE | APPROVAZIONE PE | DATE (gg/mm/aaaa) | F097 | APPROVAZIONE PE | ALTA | Pop-up PM/Permessi; mirror di `APPROVAZIONE PE` compilato da PM. | se PE=SI; sola visualizzazione |
| 179 | DL | Direzione Lavori | Deposito sismico | menù a tendina | F150 | DEPOSITO SISMICO | ALTA | Campo Universale esatto (riga 285); ownership DL confermata dal documento. | Valori: SI, NO |
| 180 | DL | Direzione Lavori | Forecast Deposito Sismico | DATE (gg/mm/aaaa) | F151 | FORECAST | BASSA | Candidato generico `FORECAST` (riga 53); il documento specializza il forecast al deposito sismico. |  |
| 181 | DL | Direzione Lavori | Deposito Sismico | DATE (gg/mm/aaaa) | F152 | DEPOSITO SISMICO | MEDIA | Stesso concetto canonico del deposito sismico, ma questa occorrenza registra la data dell’evento e resta distinta dal flag SI/NO. |  |
| 182 | DL | Direzione Lavori | Tecnico deposito sismico | menù a tendina | F153 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta la figura tecnica; il documento la specializza al deposito sismico. | compare solo se deposito sismico=SI |
| 183 | DL | Direzione Lavori | Direttore Lavori | menù a tendina che si popola volta per volta | F154 | DL | ALTA | Corrispondenza diretta tra la figura `Direttore Lavori` e il Campo Universale `DL`. | compare solo se deposito sismico=SI |
| 184 | DL | Direzione Lavori | Collaudatore | menù a tendina che si popola volta per volta | F155 | COLLAUDATORE | ALTA | Campo Universale esatto (riga 58). | compare solo se deposito sismico=SI |
| 185 | DL | Direzione Lavori | Protocollo deposito sismico | DATE (gg/mm/aaaa) | F156 | Protocollo | BASSA | Candidato `Protocollo` (riga 18); la fonte lo specializza al deposito sismico. | compare solo se deposito sismico=SI |
| 186 | DL | Direzione Lavori | N° protocollo deposito sismico | campo numerico | F157 | Protocollo | BASSA | Candidato `Protocollo` (riga 18); il campo contiene il numero, non la data di protocollazione. | compare solo se deposito sismico=SI |
| 187 | DL | Direzione Lavori | N° sismica | campo numerico | F158 | Note sismica | BASSA | Candidato già usato negli artifact precedenti; nessuna corrispondenza diretta sufficientemente forte nel mapping. | compare solo se deposito sismico=SI |
| 188 | DL | Direzione Lavori | Forecast CIL | DATE (gg/mm/aaaa) | F159 | FORECAST | BASSA | Candidato generico `FORECAST` (riga 53); il documento specializza il forecast alla CIL. |  |
| 189 | DL | Direzione Lavori | Data IL | DATE (gg/mm/aaaa) | F160 | Inizio Lavori - Effettiva | BASSA | Candidato semantico verso `Inizio Lavori - Effettiva` (riga 34); abbreviazione `IL` da validare nel mapping canonico. |  |
| 190 | DL | Direzione Lavori | Data FL | DATE (gg/mm/aaaa) | F161 | Fine Lavori - Strutturale | BASSA | Candidato semantico verso `Fine Lavori - Strutturale` (riga 35); abbreviazione `FL` da validare nel mapping canonico. |  |

## Riepilogo

- Campi/occorrenze censiti: **190**
- Confidenza ALTA: **67**
- Confidenza MEDIA: **48**
- Confidenza BASSA: **75**

Le righe `BASSA` costituiscono la coda di review umana e non autorizzano modifiche automatiche al mapping canonico.
