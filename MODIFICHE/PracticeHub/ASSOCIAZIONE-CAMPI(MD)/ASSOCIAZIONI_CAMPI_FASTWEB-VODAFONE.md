# Tabella decisionale completa — FASTWEB-VODAFONE

## Scopo

Riferimento esterno della guida `GUIDA_RISTRUTTURAZIONE_DASHBOARD_PRACTICEHUB_v8.md`. L'inventario parte esclusivamente dai campi presenti nel documento `Organizzazione Campi - <CLIENTE>`, che costituisce la fonte primaria perché riflette il confronto con i team. Il foglio `Mapping_Dati_Completo` è usato solo come fonte secondaria per proporre o verificare il Campo Universale.

**Regola di precedenza:** nessun campo viene aggiunto perché presente nel mapping. Ogni riga nasce da un campo effettivamente presente nel documento cliente. Il mapping può soltanto fornire un'associazione canonica, un candidato o nessuna associazione (`DA VERIFICARE`). La sezione e il team restano quelli definiti nel documento operativo.

**Confidenza:** `ALTA` = equivalenza diretta/attestata; `MEDIA` = normalizzazione semantica forte ma non perfettamente letterale; `BASSA` = candidato da validare manualmente.

**Fonte organizzazione:** `Organizzazione Campi - FASTWEB-VODAFONE.txt`  
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
| 12 | PM/Permessi | Core Anagrafica Sito | Area Apparati | menù a tendina | F012 | Tipologia Apparati / Infrastruttura | MEDIA | Il Campo Universale comprende anche la componente apparati; associazione coerente ma non perfettamente 1:1. |  |
| 13 | PM/Permessi | Core Anagrafica Sito | Incarico / Lavorazione | menù a tendina | F013 | Incarico / Lavorazione | ALTA | Campo Universale esatto (riga 41) |  |
| 14 | PM/Permessi | Core Anagrafica Sito | Stato ODA | menù a tendina | F014 | ODA | BASSA | Candidato lessicale `ODA`; associazione non attestata (riga 43; score 0.90) |  |
| 15 | PM/Permessi | Core Anagrafica Sito | ODA | campo varchar 50 | F015 | ODA | ALTA | Campo Universale esatto (riga 43). | possibilità di aggiungere più ODA |
| 16 | PM/Permessi | Core Anagrafica Sito | Proprietà / Host | menù a tendina | F016 | Proprietà / Host | ALTA | Campo Universale esatto (riga 12) |  |
| 17 | PM/Permessi | Core Anagrafica Sito | SR INWIT | campo varchar | F017 | SR INWI | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 90; score 0.93) | compare solo se selezionato proprietà / Host=Inwit |
| 18 | PM/Permessi | Core Anagrafica Sito | Referente Fastweb | menù a tendina che si popola volta per volta | F018 | Referente | ALTA | Specializzazione cliente-specifica del Campo Universale `Referente`. |  |
| 19 | PM/Permessi | Core Anagrafica Sito | RAN Fastweb | menù a tendina che si popola volta per volta | F019 | DA VERIFICARE | BASSA | Nessuna associazione sufficientemente supportata (best score 0.64) |  |
| 20 | PM/Permessi | Dati Anagrafici Secondari | Gestore Tenant | menù a tendina con tutti i clienti | F020 | GESTORE | MEDIA | Il Campo Universale `GESTORE` supporta il concetto; il documento lo specializza al tenant. |  |
| 21 | PM/Permessi | Dati Anagrafici Secondari | Codice sito Tenant | TEXT | F021 | Codici Sito Terzi | MEDIA | Il codice del tenant è un identificativo di sito terzo rispetto al sito principale. | appare solo se viene inserito un valore nel campo “Gestore Tenant” |
| 22 | PM/Permessi | Dati Anagrafici Secondari | Nome sito Tenant | TEXT | F022 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato | appare solo se viene inserito un valore nel campo “Gestore Tenant” |
| 23 | PM/Permessi | Dati Anagrafici Secondari | Coordinate | DECIMAL | F023 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 24 | PM/Permessi | Fase Preliminare | Data assegnazione | DATE (gg/mm/aaaa) | F024 | Data Assegnazione | ALTA | Campo Universale esatto (riga 10) |  |
| 25 | PM/Permessi | Fase Preliminare | Forecast Protocollo | DATE (gg/mm/aaaa) | F025 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 26 | PM/Permessi | Fase Preliminare | Data sopralluogo | DATE (gg/mm/aaaa) | F026 | Data Sopralluogo | ALTA | Campo Universale esatto (riga 11) |  |
| 27 | PM/Permessi | Fase Preliminare | Invio verbale di sopralluogo | DATE (gg/mm/aaaa) | F027 | INVIO VERBALE DI SOPRALLUOGO | ALTA | Campo Universale esatto (riga 54) |  |
| 28 | PM/Permessi | Fase Preliminare | Invio PDM | DATE (gg/mm/aaaa) | F028 | Invio PDM / Bozza PM | ALTA | Normalizzazione operativa verso `Invio PDM / Bozza PM` (riga 21) |  |
| 29 | PM/Permessi | Fase Preliminare | Applicabilità | menù a tendina | F029 | applicabilità | ALTA | Campo Universale esatto (riga 114) |  |
| 30 | PM/Permessi | Fase Preliminare | Invio applicabilità | DATE (gg/mm/aaaa) | F030 | applicabilità | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 114; score 0.95) |  |
| 31 | PM/Permessi | Fase Preliminare | Vincoli | menù a tendina | F031 | Vincoli | ALTA | Campo Universale esatto (riga 26) |  |
| 32 | PM/Permessi | Fase Preliminare | Assegnazione UT | DATE (gg/mm/aaaa) | F032 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 33 | PM/Permessi | Fase Preliminare | Note Assegnazione UT | campo libero | F033 | Note | MEDIA | Normalizzazione operativa verso `Note` (riga 44) |  |
| 34 | PM/Permessi | Fase Preliminare | Invio AS/VS | DATE (gg/mm/aaaa) | F073 | INVIO AS/VS | ALTA | Campo Universale esatto (riga 55) |  |
| 35 | PM/Permessi | Pacchetto Permessi | Progettista / Tecnico | menù a tendina che si popola volta per volta | F034 | Progettista / Tecnico | ALTA | Campo Universale esatto (riga 13) |  |
| 36 | PM/Permessi | Pacchetto Permessi | Approvazione PDM | DATE (gg/mm/aaaa) | F035 | Approvazione PDM / PM | ALTA | Normalizzazione operativa verso `Approvazione PDM / PM` (riga 22) |  |
| 37 | PM/Permessi | Pacchetto Permessi | AIE | menù a tendina | F036 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 38 | PM/Permessi | Pacchetto Permessi | Ricezione Scheda Tecnica | DATE (gg/mm/aaaa) | F037 | SCHEDA TECNICA | MEDIA | Il Campo Universale identifica la scheda tecnica; il documento registra specificamente la data/evento di ricezione. | compare solo se AIE=SI |
| 39 | PM/Permessi | Pacchetto Permessi | Assegnazione AIE | DATE (gg/mm/aaaa) | F038 | ASSEGNAZIONE PE | BASSA | Master operativo; compilato da PM/Permessi. Candidato lessicale `ASSEGNAZIONE PE`; associazione non attestata (riga 52; score 0.90) | compare solo se AIE=SI |
| 40 | PM/Permessi | Pacchetto Permessi | Forecast AIE | DATE (gg/mm/aaaa) | F039 | FORECAST AIE | ALTA | Campo Universale esatto (riga 184) | compare solo se AIE=SI; Alert 2 gg prima; si risolve quando viene compilato il campo “Approvazione AIE” |
| 41 | PM/Permessi | Pacchetto Permessi | Riduzione | DATE (gg/mm/aaaa) | F040 | RIDUZIONI | ALTA | Corrispondenza diretta singolare/plurale con il Campo Universale. | compare solo se AIE=SI |
| 42 | PM/Permessi | Pacchetto Permessi | Approvazione Riduzione | DATE (gg/mm/aaaa) | F041 | OK RIDUZIONI | MEDIA | L’approvazione della riduzione è semanticamente coerente con `OK RIDUZIONI`, ma la label canonica esprime l’esito più che l’evento. | compare solo se AIE=SI |
| 43 | PM/Permessi | Pacchetto Permessi | Invio AIE | DATE (gg/mm/aaaa) | F042 | AIE INVIO | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 166; score 0.95) | compare solo se AIE=SI |
| 44 | PM/Permessi | Pacchetto Permessi | Approvazione AIE | DATE (gg/mm/aaaa) | F043 | OK AIE | MEDIA | L’approvazione AIE è coerente con il Campo Universale `OK AIE`; differenza tra evento di approvazione ed esito. | compare solo se AIE=SI |
| 45 | PM/Permessi | Pacchetto Permessi | Note Pacchetto Permessi | campo libero | F044 | Note | MEDIA | Normalizzazione operativa verso `Note` (riga 44) |  |
| 46 | PM/Permessi | Pacchetto Permessi | Invio Pacchetto Permessi | DATE (gg/mm/aaaa) | F045 | Invio Pacchetto Permessi | ALTA | Campo Universale esatto (riga 19) |  |
| 47 | PM/Permessi | Pacchetto Permessi | Forecast Ottenimento Permessi | DATE (gg/mm/aaaa) | F046 | FORECAST | BASSA | Nuovo campo presente nel documento operativo; candidato lessicale `FORECAST`, associazione canonica da verificare |  |
| 48 | PM/Permessi | Pacchetto Permessi | Ottenimento Permessi | DATE (gg/mm/aaaa) | F047 | Ottenimento Enti / Permessi | ALTA | Nome sorgente coerente con il Campo Universale `Ottenimento Enti / Permessi` |  |
| 49 | PM/Permessi | Iter Autorizzativo | Protocollo | DATE (gg/mm/aaaa) | F048 | Protocollo | ALTA | Campo Universale esatto (riga 18) |  |
| 50 | PM/Permessi | Iter Autorizzativo | Forecast Parere Arpa | DATE (gg/mm/aaaa) | F049 | FORECAST | BASSA | Nuovo campo presente nel documento operativo; dtype DATE confermato dall’utente; associazione canonica da verificare |  |
| 51 | PM/Permessi | Iter Autorizzativo | Parere Arpa | DATE (gg/mm/aaaa) | F050 | PARERE ARPA | ALTA | Campo Universale esatto (riga 108) |  |
| 52 | PM/Permessi | Iter Autorizzativo | Esito parere Arpa | menù a tendina | F051 | Esito Enti (ARPA / Soprintendenza) | MEDIA | Il Campo Universale include esplicitamente ARPA tra gli esiti degli enti; è più generale del solo parere ARPA. | compare solo se compilato il campo “Parere Arpa”. Se esito= Negativo→ compare “Ripresentazione pratica” |
| 53 | PM/Permessi | Iter Autorizzativo | Ripresentazione Pratica | DATE (gg/mm/aaaa) | F052 | Pratica Sismica | BASSA | Candidato lessicale `Pratica Sismica`; associazione non attestata (riga 87; score 0.85) | compare solo se “Esito parere Arpa”=negativo |
| 54 | PM/Permessi | Iter Autorizzativo | Forecast Parere Arpa | DATE (gg/mm/aaaa) | F053 | FORECAST | BASSA | Secondo forecast ARPA, successivo a `Ripresentazione Pratica`; associazione canonica da verificare |  |
| 55 | PM/Permessi | Iter Autorizzativo | Esito parere Arpa | menù a tendina | F054 | Esito Enti (ARPA / Soprintendenza) | MEDIA | Il Campo Universale include esplicitamente ARPA tra gli esiti degli enti; è più generale del solo parere ARPA. | compare solo se compilato il campo “Ripresentazione Pratica”. Se esito= Negativo→ “Ripresentazione pratica 2” |
| 56 | PM/Permessi | Iter Autorizzativo | Nome Ente | campo libero | F055 | Nome sito Vodafone | BASSA | Candidato lessicale `Nome sito Vodafone`; associazione non attestata (riga 93; score 0.85) |  |
| 57 | PM/Permessi | Iter Autorizzativo | Forecast Ottenimento “Nome ente” | DATE (gg/mm/aaaa) | F056 | FORECAST | BASSA | Nuovo campo presente nel documento operativo; candidato lessicale `FORECAST`, associazione canonica da verificare |  |
| 58 | PM/Permessi | Iter Autorizzativo | Ottenimento “Nome ente” | DATE (gg/mm/aaaa) | F057 | Ottenimento Enti / Permessi | MEDIA | Il Campo Universale rappresenta l’ottenimento da enti/permessi; il documento istanzia dinamicamente il singolo ente. | compare solo se compilato il campo “Nome Ente” |
| 59 | PM/Permessi | Iter Autorizzativo | Esito parere “nome ente” | menù a tendina | F058 | Esito Enti (ARPA / Soprintendenza) | MEDIA | Il documento registra l’esito del singolo ente; il Campo Universale aggrega gli esiti degli enti. | compare solo se compilato il campo “Nome Ente” |
| 60 | PM/Permessi | Iter Autorizzativo | Scadenza permesso “Nome ente” | DATE (gg/mm/aaaa) | F059 | SCADENZA PERMESSI | MEDIA | Il Campo Universale supporta la scadenza del permesso; il documento la specializza per singolo ente. | compare solo se compilato il campo “Nome Ente” |
| 61 | PM/Permessi | Iter Autorizzativo | Data Autorizzazione finale |  | F060 | DATA | BASSA | Candidato lessicale `DATA`; associazione non attestata (riga 424; score 0.90) |  |
| 62 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Assegnazione UT | DATE (gg/mm/aaaa) | F032 | DA VERIFICARE | BASSA | Campo compilato da PM; master della corrispondente occorrenza di sola visualizzazione UT+PE. |  |
| 63 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Note Assegnazione UT | campo libero | F033 | Note | MEDIA | Campo compilato da PM; master della corrispondente occorrenza di sola visualizzazione UT+PE. |  |
| 64 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | PE | menù a tendina | F061 | PE | ALTA | Campo Universale esatto (riga 365) |  |
| 65 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Assegnazione PE | DATE (gg/mm/aaaa) | F062 | ASSEGNAZIONE PE | ALTA | Campo Universale esatto (riga 52) | si compila solo se PE=SI |
| 66 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Note Assegnazione PE | campo libero | F063 | Note | MEDIA | Normalizzazione operativa verso `Note` (riga 44) | si compila solo se PE=SI |
| 67 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Forecast PE | DATE (gg/mm/aaaa) | F074 | FORECAST PE | ALTA | Campo master compilato da PM; alimenta la corrispondente occorrenza UT+PE di `Forecast PE` in sola visualizzazione. | compilato da PM |
| 68 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Invio PE | DATE (gg/mm/aaaa) | F088 | Consegna / Invio PE | ALTA | Campo master compilato da PM; alimenta la corrispondente occorrenza UT+PE di `Invio PE` in sola visualizzazione. | compilato da PM |
| 69 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Invio AS/VS | DATE (gg/mm/aaaa) | F073 | INVIO AS/VS | ALTA | Pop-up UT+PE; mirror di `Invio AS/VS` della sezione operativa. | sempre tranne quando Incarico/Lavorazione = New Site |
| 70 | AIE | Fase AIE | Assegnazione AIE | DATE (gg/mm/aaaa) | F038 | ASSEGNAZIONE PE | BASSA | Sola visualizzazione; ereditato da PM/Permessi. Mirror di `Assegnazione AIE`. Candidato lessicale `ASSEGNAZIONE PE`; associazione non attestata (riga 52; score 0.90) |  |
| 71 | AIE | Fase AIE | Forecast AIE | DATE (gg/mm/aaaa) | F039 | FORECAST AIE | ALTA | Campo Universale esatto (riga 184) |  |
| 72 | AIE | Fase AIE | Tecnico Misure di fondo | menù a tendina che si popola volta per volta | F089 | N° MISURE RICH... | BASSA | Candidato lessicale `N° MISURE RICH...`; associazione non attestata (riga 440; score 0.85) | non compare se Regione=Piemonte |
| 73 | AIE | Fase AIE | Stato misure di fondo | menù a tendina | F090 | Stato Attività | BASSA | Candidato lessicale `Stato Attività`; associazione non attestata (riga 9; score 0.85) | Valori: IN ESECUZIONE, OK, STAND BY |
| 74 | AIE | Fase AIE | Tecnico AIE | menù a tendina che si popola volta per volta | F091 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta il tecnico/progettista; il documento lo specializza al team AIE. |  |
| 75 | AIE | Fase AIE | Stato assegnazione tecnico AIE | menù a tendina | F092 | Stato Attività | BASSA | Candidato lessicale `Stato Attività`; associazione non attestata (riga 9; score 0.85) | Valori: OK, DA ASSEGNARE |
| 76 | AIE | Fase AIE | Responsabile interno AIE | menù a tendina | F093 | OK AIE | BASSA | Candidato lessicale `OK AIE`; associazione non attestata (riga 20; score 0.85) |  |
| 77 | AIE | Fase AIE | Stato AIE | menù a tendina | F094 | Stato Attività | BASSA | Candidato lessicale `Stato Attività`; associazione non attestata (riga 9; score 0.85) |  |
| 78 | AIE | Fase AIE | Invio CEM | DATE (gg/mm/aaaa) | F095 | DA VERIFICARE | BASSA | Nuovo campo allineato alla sezione AIE modello ILIAD; id_flusso da assegnare nel successivo passaggio di reindicizzazione. |  |
| 79 | AIE | Fase AIE | Fine attività AIE | DATE (gg/mm/aaaa) | F096 | OK AIE | BASSA | Candidato lessicale `OK AIE`; associazione non attestata (riga 20; score 0.85) |  |
| 80 | AIE | Fase AIE | Riduzione | DATE (gg/mm/aaaa) | F040 | RIDUZIONI | ALTA | Corrispondenza diretta singolare/plurale con il Campo Universale. |  |
| 81 | AIE | Fase AIE | Approvazione Riduzione | DATE (gg/mm/aaaa) | F041 | OK RIDUZIONI | MEDIA | L’approvazione della riduzione è semanticamente coerente con `OK RIDUZIONI`, ma la label canonica esprime l’esito più che l’evento. |  |
| 82 | AIE | Fase AIE | Invio AIE | DATE (gg/mm/aaaa) | F042 | AIE INVIO | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 166; score 0.95) |  |
| 83 | AIE | Fase AIE | Approvazione AIE | DATE (gg/mm/aaaa) | F043 | OK AIE | MEDIA | L’approvazione AIE è coerente con il Campo Universale `OK AIE`; differenza tra evento di approvazione ed esito. |  |
| 84 | AIE | Fase AIE | Note AIE | campo libero | F097 | Note | MEDIA | Normalizzazione operativa verso `Note` (riga 44) |  |
| 85 | UT+PE | UT | Assegnazione UT | DATE (gg/mm/aaaa) | F032 | DA VERIFICARE | BASSA | Sola visualizzazione; compilato da PM. Mirror di `Assegnazione UT`. |  |
| 86 | UT+PE | UT | Note Assegnazione UT | campo libero | F033 | Note | MEDIA | Sola visualizzazione; compilato da PM. Mirror di `Note Assegnazione UT`. |  |
| 87 | UT+PE | UT | Forecast UT | DATE (gg/mm/aaaa) | F064 | FORECAST | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 53; score 0.95) |  |
| 88 | UT+PE | UT | Incarico VS/AS | DATE (gg/mm/aaaa) | F065 | ASSEGNAZIONE AS/VS | MEDIA | Il campo descrive la presa in carico/assegnazione VS-AS; il Campo Universale usa la terminologia `ASSEGNAZIONE AS/VS`. | di base viene inserita la data del giorno |
| 89 | UT+PE | UT | VS/AS incaricata da | menù a tendina | F066 | Assegnatore attivita | MEDIA | Il campo identifica chi ha effettuato l’incarico; il Campo Universale `Assegnatore attivita` è coerente. |  |
| 90 | UT+PE | UT | Tecnico UT | menù a tendina che si popola volta per volta | F067 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta il tecnico/progettista; il documento lo specializza al team UT. |  |
| 91 | UT+PE | UT | Fornitore UT | menù a tendina che si popola volta per volta | F068 | Fornitore / Impresa | MEDIA | Il Campo Universale rappresenta il fornitore/impresa; il documento lo specializza al team UT. | possibilità di inserire valore “nessuno” |
| 92 | UT+PE | UT | Tipologia attività UT | menù a tendina | F069 | Stato Attività | BASSA | Candidato lessicale `Stato Attività`; associazione non attestata (riga 9; score 0.85) | Valori: VS, AS, Dimensionamento plinto, VS plinto, fattibilità, correzione PE |
| 93 | UT+PE | UT | Importo UT | campo numerico | F070 | IMPORTO | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 156; score 0.95) |  |
| 94 | UT+PE | UT | Costo UT | campo numerico | F071 | Richiesta analisi UT | BASSA | Candidato lessicale `Richiesta analisi UT`; associazione non attestata (riga 98; score 0.85) | si riferisce sempre al pagamento di un esterno, non descrive un costo interno; distinto da Costo PE |
| 95 | UT+PE | UT | Fine attività UT | DATE (gg/mm/aaaa) | F072 | Week effettiva chiusura attivita | BASSA | Candidato lessicale `Week effettiva chiusura attivita`; associazione non attestata (riga 32; score 0.85) |  |
| 96 | UT+PE | UT | Invio AS/VS | DATE (gg/mm/aaaa) | F073 | INVIO AS/VS | ALTA | Campo Universale esatto (riga 55) | compare solo se New Site |
| 97 | UT+PE | PE | Assegnazione PE | DATE (gg/mm/aaaa) | F062 | ASSEGNAZIONE PE | ALTA | Sola visualizzazione; compilato da PM. Mirror di `Assegnazione PE`. |  |
| 98 | UT+PE | PE | Note Assegnazione PE | campo libero | F063 | Note | MEDIA | Sola visualizzazione; compilato da PM. Mirror di `Note Assegnazione PE`. |  |
| 99 | UT+PE | PE | Forecast PE | DATE (gg/mm/aaaa) | F074 | FORECAST PE | ALTA | Sola visualizzazione; compilato da PM. Mirror di `Forecast PE`. | sola visualizzazione |
| 100 | UT+PE | PE | PSC | menù a tendina | F075 | PSC | ALTA | Campo Universale esatto (riga 62) |  |
| 101 | UT+PE | PE | Forecast PSC | DATE (gg/mm/aaaa) | F076 | FORECAST | BASSA | Candidato lessicale `FORECAST`; associazione non attestata (riga 53; score 0.90) | compare solo se PSC=SI. Si compila automaticamente con valore=Forecast PSC. Possibilità di modificare la data quando si vuole |
| 102 | UT+PE | PE | Tecnico PSC | Menù a tendina | F077 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta il tecnico/progettista; il documento lo specializza all’attività PSC. |  |
| 103 | UT+PE | PE | Note PSC | campo libero | F078 | Note | BASSA | Candidato lessicale `Note`; associazione non attestata (riga 44; score 0.90) |  |
| 104 | UT+PE | PE | OK PSC | DATE (gg/mm/aaaa) | F079 | PSC | BASSA | Candidato lessicale `PSC`; associazione non attestata (riga 62; score 0.90) |  |
| 105 | UT+PE | PE | Incarico PE | DATE (gg/mm/aaaa) | F080 | ASSEGNAZIONE PE | MEDIA | La data di incarico PE è coerente con il Campo Universale `ASSEGNAZIONE PE`, pur con terminologia diversa. | di base viene inserita la data del giorno |
| 106 | UT+PE | PE | Tipologia attività PE | menù a tendina | F081 | Stato Attività | BASSA | Candidato lessicale `Stato Attività`; associazione non attestata (riga 9; score 0.85) | si compila automaticamente con il valore corrispondente a Incarico/Lavorazione o Progetto (se Incarico/Lavorazione = New Site) |
| 107 | UT+PE | PE | PE incaricato da | menù a tendina | F082 | Assegnatore attivita | MEDIA | Il campo identifica chi ha effettuato l’incarico PE; corrisponde al concetto di assegnatore. |  |
| 108 | UT+PE | PE | Tecnico PE | menù a tendina che si popola volta per volta | F083 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta il tecnico/progettista; il documento lo specializza al team PE. | possibilità di inserire valore “nessuno”; possibilità di inserire più tecnici |
| 109 | UT+PE | PE | Fornitore PE | menù a tendina che si popola volta per volta | F084 | Fornitore / Impresa | MEDIA | Il Campo Universale rappresenta il fornitore/impresa; il documento lo specializza al team PE. | possibilità di inserire valore “nessuno” |
| 110 | UT+PE | PE | Importo PE | campo numerico | F085 | IMPORTO | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 156; score 0.95) |  |
| 111 | UT+PE | PE | Costo PE | campo numerico | F086 | PE | BASSA | Candidato lessicale `PE`; associazione non attestata (riga 365; score 0.90) | utile solo se collegato con G7 |
| 112 | UT+PE | PE | Fine attività PE | DATE (gg/mm/aaaa) | F087 | PE | BASSA | Candidato lessicale `PE`; associazione non attestata (riga 365; score 0.90) |  |
| 113 | UT+PE | PE | Invio PE | DATE (gg/mm/aaaa) | F088 | Consegna / Invio PE | ALTA | Sola visualizzazione; compilato da PM. Mirror di `Invio PE`. | sola visualizzazione |
| 114 | DL | Direzione Lavori | Deposito sismico | menù a tendina | F098 | DEPOSITO SISMICO | ALTA | Campo Universale esatto (riga 285); ownership DL confermata dal documento. | Valori: SI, NO |
| 115 | DL | Direzione Lavori | Forecast Deposito Sismico | DATE (gg/mm/aaaa) | F099 | FORECAST | BASSA | Candidato generico `FORECAST` (riga 53); il documento specializza il forecast al deposito sismico. |  |
| 116 | DL | Direzione Lavori | Deposito Sismico | DATE (gg/mm/aaaa) | F100 | DEPOSITO SISMICO | MEDIA | Stesso concetto canonico del deposito sismico, ma questa occorrenza registra la data dell’evento e resta distinta dal flag SI/NO. |  |
| 117 | DL | Direzione Lavori | Tecnico deposito sismico | menù a tendina | F101 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta la figura tecnica; il documento la specializza al deposito sismico. | compare solo se deposito sismico=SI |
| 118 | DL | Direzione Lavori | Direttore Lavori | menù a tendina che si popola volta per volta | F102 | DL | ALTA | Corrispondenza diretta tra la figura `Direttore Lavori` e il Campo Universale `DL`. | compare solo se deposito sismico=SI |
| 119 | DL | Direzione Lavori | Collaudatore | menù a tendina che si popola volta per volta | F103 | COLLAUDATORE | ALTA | Campo Universale esatto (riga 58). | compare solo se deposito sismico=SI |
| 120 | DL | Direzione Lavori | Protocollo deposito sismico | DATE (gg/mm/aaaa) | F104 | Protocollo | BASSA | Candidato `Protocollo` (riga 18); la fonte lo specializza al deposito sismico. | compare solo se deposito sismico=SI |
| 121 | DL | Direzione Lavori | N° protocollo deposito sismico | campo numerico | F105 | Protocollo | BASSA | Candidato `Protocollo` (riga 18); il campo contiene il numero, non la data di protocollazione. | compare solo se deposito sismico=SI |
| 122 | DL | Direzione Lavori | N° sismica | campo numerico | F106 | Note sismica | BASSA | Candidato già usato negli artifact precedenti; nessuna corrispondenza diretta sufficientemente forte nel mapping. | compare solo se deposito sismico=SI |
| 123 | DL | Direzione Lavori | Forecast CIL | DATE (gg/mm/aaaa) | F107 | FORECAST | BASSA | Candidato generico `FORECAST` (riga 53); il documento specializza il forecast alla CIL. |  |
| 124 | DL | Direzione Lavori | Data IL | DATE (gg/mm/aaaa) | F108 | Inizio Lavori - Effettiva | BASSA | Candidato semantico verso `Inizio Lavori - Effettiva` (riga 34); abbreviazione `IL` da validare nel mapping canonico. |  |
| 125 | DL | Direzione Lavori | Data FL | DATE (gg/mm/aaaa) | F109 | Fine Lavori - Strutturale | BASSA | Candidato semantico verso `Fine Lavori - Strutturale` (riga 35); abbreviazione `FL` da validare nel mapping canonico. |  |

## Riepilogo

- Campi/occorrenze censiti: **125**
- Confidenza ALTA: **43**
- Confidenza MEDIA: **40**
- Confidenza BASSA: **42**

Le righe `BASSA` costituiscono la coda di review umana e non autorizzano modifiche automatiche al mapping canonico.
