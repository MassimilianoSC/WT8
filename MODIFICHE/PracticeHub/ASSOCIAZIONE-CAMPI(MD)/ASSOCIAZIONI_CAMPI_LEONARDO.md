# Tabella decisionale completa — LEONARDO

## Scopo

Riferimento esterno della guida `GUIDA_RISTRUTTURAZIONE_DASHBOARD_PRACTICEHUB_v8.md`. L'inventario parte esclusivamente dai campi presenti nel documento `Organizzazione Campi - <CLIENTE>`, che costituisce la fonte primaria perché riflette il confronto con i team. Il foglio `Mapping_Dati_Completo` è usato solo come fonte secondaria per proporre o verificare il Campo Universale.

**Regola di precedenza:** nessun campo viene aggiunto perché presente nel mapping. Ogni riga nasce da un campo effettivamente presente nel documento cliente. Il mapping può soltanto fornire un'associazione canonica, un candidato o nessuna associazione (`DA VERIFICARE`). La sezione e il team restano quelli definiti nel documento operativo.

**Confidenza:** `ALTA` = equivalenza diretta/attestata; `MEDIA` = normalizzazione semantica forte ma non perfettamente letterale; `BASSA` = candidato da validare manualmente.

**Fonte organizzazione:** `Organizzazione Campi -LEONARDO.txt`  
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
| 4 | PM/Permessi | Core Anagrafica Sito | Cliente Finale | TEXT | F004 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 5 | PM/Permessi | Core Anagrafica Sito | Regione | menù a tendina | F005 | Regione | ALTA | Campo Universale esatto (riga 6) |  |
| 6 | PM/Permessi | Core Anagrafica Sito | Provincia | menù a tendina | F006 | Provincia | ALTA | Campo Universale esatto (riga 7) |  |
| 7 | PM/Permessi | Core Anagrafica Sito | Comune | menù a tendina | F007 | Comune | ALTA | Campo Universale esatto (riga 8) |  |
| 8 | PM/Permessi | Core Anagrafica Sito | Indirizzo | TEXT | F008 | Indirizzo Fisico | ALTA | Nome sorgente esatto nel mapping (riga 27) |  |
| 9 | PM/Permessi | Core Anagrafica Sito | Tipologia sito | menù a tendina | F009 | Tipologia Sito | ALTA | Campo Universale esatto (riga 42) |  |
| 10 | PM/Permessi | Core Anagrafica Sito | Tipologia Struttura | menù a tendina | F010 | Tipologia Apparati / Infrastruttura | MEDIA | Il Campo Universale copre la stessa famiglia infrastrutturale, ma è più ampio della sola struttura del sito. |  |
| 11 | PM/Permessi | Core Anagrafica Sito | Area Apparati | menù a tendina | F011 | Tipologia Apparati / Infrastruttura | MEDIA | Il Campo Universale comprende anche la componente apparati; associazione coerente ma non perfettamente 1:1. |  |
| 12 | PM/Permessi | Core Anagrafica Sito | Incarico / Lavorazione | menù a tendina | F012 | Incarico / Lavorazione | ALTA | Campo Universale esatto (riga 41) |  |
| 13 | PM/Permessi | Core Anagrafica Sito | ODA | campo varchar 50 | F013 | ODA | ALTA | Campo Universale esatto (riga 43) |  |
| 14 | PM/Permessi | Core Anagrafica Sito | Proprietà / Host | menù a tendina | F014 | Proprietà / Host | ALTA | Campo Universale esatto (riga 12) |  |
| 15 | PM/Permessi | Dati Anagrafici Secondari | Gestore Tenant | menù a tendina con tutti i clienti | F015 | GESTORE | MEDIA | Il Campo Universale `GESTORE` supporta il concetto; il documento lo specializza al tenant. |  |
| 16 | PM/Permessi | Dati Anagrafici Secondari | Codice sito Tenant | TEXT | F016 | Codici Sito Terzi | MEDIA | Il codice del tenant è un identificativo di sito terzo rispetto al sito principale. | appare solo se viene inserito un valore nel campo “Gestore Tenant” |
| 17 | PM/Permessi | Dati Anagrafici Secondari | Nome sito Tenant | TEXT | F017 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato | appare solo se viene inserito un valore nel campo “Gestore Tenant” |
| 18 | PM/Permessi | Dati Anagrafici Secondari | Coordinate | DECIMAL | F018 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 19 | PM/Permessi | Fase Preliminare | Data assegnazione |  | F019 | Data Assegnazione | ALTA | Campo Universale esatto (riga 10); il documento non esplicita il dtype. |  |
| 20 | PM/Permessi | Fase Preliminare | Data sopralluogo | DATE (gg/mm/aaaa) | F020 | Data Sopralluogo | ALTA | Campo Universale esatto (riga 11) |  |
| 21 | PM/Permessi | Fase Preliminare | Invio verbale di sopralluogo | DATE (gg/mm/aaaa) | F021 | INVIO VERBALE DI SOPRALLUOGO | ALTA | Campo Universale esatto (riga 54) |  |
| 22 | PM/Permessi | Fase Preliminare | Vincoli | menù a tendina | F022 | Vincoli | ALTA | Campo Universale esatto (riga 26) |  |
| 23 | PM/Permessi | Fase Preliminare | Bozza di progetto | DATE (gg/mm/aaaa) | F023 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 24 | PM/Permessi | Fase Preliminare | Approvazione bozza di progetto | DATE (gg/mm/aaaa) | F024 | DA VERIFICARE | BASSA | Denominazione definitiva confermata dal confronto operativo; stesso campo precedentemente indicato come `Ok bozza di progetto`. |  |
| 25 | PM/Permessi | Pacchetto Permessi | Ricezione validazione | DATE (gg/mm/aaaa) | F025 | Arrivo Validazione | ALTA | Corrispondenza diretta tra ricezione e arrivo della validazione. |  |
| 26 | PM/Permessi | Pacchetto Permessi | Tecnico PP | menù a tendina | F026 | Progettista / Tecnico | MEDIA | Normalizzazione operativa verso `Progettista / Tecnico` (riga 13) |  |
| 27 | PM/Permessi | Pacchetto Permessi | Fornitore PP | menù a tendina | F027 | Fornitore / Impresa | MEDIA | Il Campo Universale rappresenta il fornitore/impresa; il documento lo specializza al pacchetto permessi. |  |
| 28 | PM/Permessi | Pacchetto Permessi | Invio PDM | DATE (gg/mm/aaaa) | F028 | Invio PDM / Bozza PM | ALTA | Normalizzazione operativa verso `Invio PDM / Bozza PM` (riga 21) |  |
| 29 | PM/Permessi | Pacchetto Permessi | Approvazione PDM | DATE (gg/mm/aaaa) | F029 | Approvazione PDM / PM | ALTA | Normalizzazione operativa verso `Approvazione PDM / PM` (riga 22) |  |
| 30 | PM/Permessi | Pacchetto Permessi | AIE | menù a tendina | F030 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 31 | PM/Permessi | Pacchetto Permessi | Ricezione Scheda Tecnica | DATE (gg/mm/aaaa) | F031 | SCHEDA TECNICA | MEDIA | Il Campo Universale identifica la scheda tecnica; il documento registra specificamente la data/evento di ricezione. | compare solo se AIE=SI |
| 32 | PM/Permessi | Pacchetto Permessi | Assegnazione AIE | DATE (gg/mm/aaaa) | F032 | ASSEGNAZIONE PE | BASSA | Master operativo; compilato da PM/Permessi. Candidato lessicale `ASSEGNAZIONE PE`; associazione non attestata (riga 52; score 0.90) | compare solo se AIE=SI |
| 33 | PM/Permessi | Pacchetto Permessi | Forecast AIE | DATE (gg/mm/aaaa) | F033 | FORECAST AIE | ALTA | Master PM/Permessi; alimenta il mirror AIE con lo stesso id_flusso. | compare solo se AIE=SI; Alert 2 gg prima; si risolve quando viene compilato il campo “Approvazione AIE” |
| 34 | PM/Permessi | Pacchetto Permessi | Invio AIE | DATE (gg/mm/aaaa) | F036 | AIE INVIO | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 166; score 0.95) | compare solo se AIE=SI |
| 35 | PM/Permessi | Pacchetto Permessi | Approvazione AIE | DATE (gg/mm/aaaa) | F037 | OK AIE | MEDIA | L’approvazione AIE è coerente con il Campo Universale `OK AIE`; differenza tra evento di approvazione ed esito. | compare solo se AIE=SI |
| 36 | PM/Permessi | Pacchetto Permessi | All. 18 | menù a tendina | F038 | INVIO ALL. 18 | BASSA | Candidato lessicale `INVIO ALL. 18`; associazione non attestata (riga 164; score 0.90) |  |
| 37 | PM/Permessi | Pacchetto Permessi | Invio All. 18 | DATE (gg/mm/aaaa) | F039 | INVIO ALL. 18 | ALTA | Campo Universale esatto (riga 164) | compare solo se all. 18=SI |
| 38 | PM/Permessi | Pacchetto Permessi | Note Pacchetto Permessi | campo libero | F040 | Note | MEDIA | Normalizzazione operativa verso `Note` (riga 44) |  |
| 39 | PM/Permessi | Pacchetto Permessi | Tipologia pacchetto permessi | menù a tendina | F041 | Tipologia Sito | BASSA | Candidato lessicale `Tipologia Sito`; associazione non attestata (riga 42; score 0.85) |  |
| 40 | PM/Permessi | Pacchetto Permessi | Invio Pacchetto Permessi | DATE (gg/mm/aaaa) | F042 | Invio Pacchetto Permessi | ALTA | Campo Universale esatto (riga 19) |  |
| 41 | PM/Permessi | Iter Autorizzativo | Protocollo | DATE (gg/mm/aaaa) | F043 | Protocollo | ALTA | Campo Universale esatto (riga 18) |  |
| 42 | PM/Permessi | Iter Autorizzativo | Forecast Ottenimento Permessi | DATE (gg/mm/aaaa) | F044 | PREV. OTTENIMENTO PERMESSI | MEDIA | Normalizzazione operativa verso `PREV. OTTENIMENTO PERMESSI` (riga 142) | scompare se All. 18=SI. Se Tipologia pacchetto permessi=istanza il valore viene calcolato automaticamente aggiungendo 67 giorni (anche non lavorativi) a data `Protocollo`. Se Tipologia pacchetto permessi=SCIA il valore viene calcolato automaticamente aggiungendo 67 giorni (anche non lavorativi) a data `Protocollo`. IF giorni <=15 and `Richiesta integrazione` allora `Forecast Ottenimento Permessi`=`Forecast Ottenimento Permessi`+(`Invio integrazione`-`Richiesta integrazione`) |
| 43 | PM/Permessi | Iter Autorizzativo | Ottenimento Permessi | DATE (gg/mm/aaaa) | F045 | Ottenimento Enti / Permessi | ALTA | Nome sorgente esatto nel mapping (riga 24). |  |
| 44 | PM/Permessi | Iter Autorizzativo | Richiesta integrazione | DATE (gg/mm/aaaa) | F046 | RICHIESTA INTEGRAZIONI | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 48; score 0.95) |  |
| 45 | PM/Permessi | Iter Autorizzativo | Note integrazione | campo libero | F047 | NOTE INTEGRAZIONI | MEDIA | Normalizzazione operativa verso `NOTE INTEGRAZIONI` (riga 107) | compare solo se compilato il campo “Richiesta integrazione” |
| 46 | PM/Permessi | Iter Autorizzativo | Invio integrazione | DATE (gg/mm/aaaa) | F048 | INVIO VERBALE DI SOPRALLUOGO | BASSA | Candidato lessicale `INVIO VERBALE DI SOPRALLUOGO`; associazione non attestata (riga 54; score 0.85) | compare solo se compilato il campo “Richiesta integrazione” |
| 47 | PM/Permessi | Iter Autorizzativo | Nome Ente | campo libero | F049 | Nome sito Vodafone | BASSA | Candidato lessicale `Nome sito Vodafone`; associazione non attestata (riga 93; score 0.85) |  |
| 48 | PM/Permessi | Iter Autorizzativo | Forecast Ottenimento “Nome ente” | DATE (gg/mm/aaaa) | F050 | FORECAST | BASSA | Candidato lessicale `FORECAST`; associazione non attestata (riga 53; score 0.90) |  |
| 49 | PM/Permessi | Iter Autorizzativo | Ottenimento “Nome ente” | DATE (gg/mm/aaaa) | F051 | Ottenimento Enti / Permessi | MEDIA | Il Campo Universale rappresenta l’ottenimento da enti/permessi; il documento istanzia dinamicamente il singolo ente. | compare solo se compilato il campo “Nome Ente” |
| 50 | PM/Permessi | Iter Autorizzativo | Esito parere “nome ente” | menù a tendina | F052 | Esito Enti (ARPA / Soprintendenza) | MEDIA | Il documento registra l’esito del singolo ente; il Campo Universale aggrega gli esiti degli enti. | compare solo se compilato il campo “Nome Ente” |
| 51 | PM/Permessi | Iter Autorizzativo | N° protocollo “Nome ente” | campo libero | F053 | Protocollo | BASSA | Candidato lessicale `Protocollo`; associazione non attestata (riga 18; score 0.90) | compare solo se compilato il campo “Nome Ente” |
| 52 | PM/Permessi | Iter Autorizzativo | Oneri | menù a tendina | F054 | Oneri e Bolli | BASSA | Candidato lessicale `Oneri e Bolli`; associazione non attestata (riga 85; score 0.90) |  |
| 53 | PM/Permessi | Iter Autorizzativo | Data Autorizzazione finale |  | F055 | DATA | BASSA | Candidato lessicale `DATA`; associazione non attestata (riga 424; score 0.90) |  |
| 54 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Geologica | menù a tendina | F060 | ASSEGNAZIONE GEOLOGICA | BASSA | Candidato lessicale `ASSEGNAZIONE GEOLOGICA`; associazione non attestata (riga 143; score 0.90) | compare solo se Tipologia sito=Raw Land e Incarico=New Site |
| 55 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Assegnazione Geologica | DATE (gg/mm/aaaa) | F061 | ASSEGNAZIONE GEOLOGICA | ALTA | Campo Universale esatto (riga 143) | compare solo se Tipologia sito=Raw Land e Incarico=New Site; Si compila solo se Geologica= SI |
| 56 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Forecast Geologica | DATE (gg/mm/aaaa) | F062 | FORECAST | BASSA | Candidato lessicale `FORECAST`; associazione non attestata (riga 53; score 0.90) | compare solo se Tipologia sito=Raw Land e Incarico=New Site; Forecast Geologica = Assegnazione Geologica + 15 giorni (anche non lavorativi); Si compila solo se Geologica= SI |
| 57 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Arrivo Geologica | DATE (gg/mm/aaaa) | F063 | ARRIVO GEOLOGICA | ALTA | Campo Universale esatto (riga 144) | compare solo se Tipologia sito=Raw Land e Incarico=New Site; Si compila solo se Geologica= SI |
| 58 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Assegnazione UT | DATE (gg/mm/aaaa) | F058 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 59 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Note Assegnazione UT | campo libero | F059 | Note | MEDIA | Campo compilato da PM; master della corrispondente occorrenza di sola visualizzazione UT+PE. |  |
| 60 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Assegnazione PE | DATE (gg/mm/aaaa) | F056 | ASSEGNAZIONE PE | ALTA | Campo Universale esatto (riga 52) | si compila solo se PE=SI |
| 61 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Note Assegnazione PE | campo libero | F057 | Note | MEDIA | Campo compilato da PM; master della corrispondente occorrenza di sola visualizzazione UT+PE. | si compila solo se PE=SI |
| 62 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Forecast PE | DATE (gg/mm/aaaa) | F083 | FORECAST PE | ALTA | Pop-up UT+PE; mirror di `Forecast PE` della sezione operativa. |  |
| 63 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Forecast UT | DATE (gg/mm/aaaa) | F073 | FORECAST | MEDIA | Pop-up UT+PE; mirror di `Forecast UT` della sezione operativa. |  |
| 64 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Incarico PE | DATE (gg/mm/aaaa) | F089 | ASSEGNAZIONE PE | MEDIA | Pop-up UT+PE; mirror di `Incarico PE` della sezione operativa. |  |
| 65 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | PE incaricato da | menù a tendina | F091 | Assegnatore attivita | MEDIA | Pop-up UT+PE; mirror di `PE incaricato da` della sezione operativa. |  |
| 66 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Invio PE | DATE (gg/mm/aaaa) | F097 | Consegna / Invio PE | ALTA | Pop-up UT+PE; mirror di `Invio PE` della sezione operativa. |  |
| 67 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Incarico VS/AS | DATE (gg/mm/aaaa) | F074 | ASSEGNAZIONE AS/VS | MEDIA | Pop-up UT+PE; mirror di `Incarico VS/AS` della sezione operativa. |  |
| 68 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Fornitore UT | menù a tendina che si popola volta per volta | F077 | Fornitore / Impresa | MEDIA | Pop-up UT+PE; mirror di `Fornitore UT` della sezione operativa. |  |
| 69 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Tipologia attività UT | menù a tendina | F078 | Stato Attività | BASSA | Pop-up UT+PE; mirror di `Tipologia attività UT` della sezione operativa. |  |
| 70 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Invio AS/VS | DATE (gg/mm/aaaa) | F082 | INVIO AS/VS | ALTA | Pop-up UT+PE; mirror di `Invio AS/VS` della sezione operativa. | sempre tranne quando Incarico/Lavorazione = New Site |
| 71 | AIE | Fase AIE | Assegnazione AIE | DATE (gg/mm/aaaa) | F032 | ASSEGNAZIONE PE | BASSA | Sola visualizzazione; ereditato da PM/Permessi. Mirror di `Assegnazione AIE`. Candidato lessicale `ASSEGNAZIONE PE`; associazione non attestata (riga 52; score 0.90) |  |
| 72 | AIE | Fase AIE | Forecast AIE | DATE (gg/mm/aaaa) | F033 | FORECAST AIE | ALTA | Campo Universale esatto (riga 184) |  |
| 73 | AIE | Fase AIE | Tecnico Misure di fondo | menù a tendina che si popola volta per volta | F064 | N° MISURE RICH... | BASSA | Candidato lessicale `N° MISURE RICH...`; associazione non attestata (riga 440; score 0.85) | non compare se Regione=Piemonte |
| 74 | AIE | Fase AIE | Stato misure di fondo | menù a tendina | F065 | Stato Attività | BASSA | Candidato lessicale `Stato Attività`; associazione non attestata (riga 9; score 0.85) | Valori: IN ESECUZIONE, OK, STAND BY |
| 75 | AIE | Fase AIE | Tecnico AIE | menù a tendina che si popola volta per volta | F066 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta il tecnico/progettista; il documento lo specializza al team AIE. |  |
| 76 | AIE | Fase AIE | Stato assegnazione tecnico AIE | menù a tendina | F067 | Stato Attività | BASSA | Candidato lessicale `Stato Attività`; associazione non attestata (riga 9; score 0.85) | Valori: OK, DA ASSEGNARE |
| 77 | AIE | Fase AIE | Responsabile interno AIE | menù a tendina | F068 | OK AIE | BASSA | Candidato lessicale `OK AIE`; associazione non attestata (riga 20; score 0.85) |  |
| 78 | AIE | Fase AIE | Stato AIE | menù a tendina | F069 | Stato Attività | BASSA | Candidato lessicale `Stato Attività`; associazione non attestata (riga 9; score 0.85) |  |
| 79 | AIE | Fase AIE | Invio CEM | DATE (gg/mm/aaaa) | F070 | DA VERIFICARE | BASSA | Nuovo campo allineato alla sezione AIE modello ILIAD; id_flusso da assegnare nel successivo passaggio di reindicizzazione. |  |
| 80 | AIE | Fase AIE | Fine attività AIE | DATE (gg/mm/aaaa) | F071 | OK AIE | BASSA | Candidato lessicale `OK AIE`; associazione non attestata (riga 20; score 0.85) |  |
| 81 | AIE | Fase AIE | Riduzione | DATE (gg/mm/aaaa) | F034 | RIDUZIONI | ALTA | Corrispondenza diretta singolare/plurale con il Campo Universale. |  |
| 82 | AIE | Fase AIE | Approvazione Riduzione | DATE (gg/mm/aaaa) | F035 | OK RIDUZIONI | MEDIA | L’approvazione della riduzione è semanticamente coerente con `OK RIDUZIONI`, ma la label canonica esprime l’esito più che l’evento. |  |
| 83 | AIE | Fase AIE | Invio AIE | DATE (gg/mm/aaaa) | F036 | AIE INVIO | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 166; score 0.95) |  |
| 84 | AIE | Fase AIE | Approvazione AIE | DATE (gg/mm/aaaa) | F037 | OK AIE | MEDIA | L’approvazione AIE è coerente con il Campo Universale `OK AIE`; differenza tra evento di approvazione ed esito. |  |
| 85 | AIE | Fase AIE | Note AIE | campo libero | F072 | Note | MEDIA | Normalizzazione operativa verso `Note` (riga 44) |  |
| 86 | UT+PE | UT | Assegnazione UT | DATE (gg/mm/aaaa) | F058 | DA VERIFICARE | BASSA | Sola visualizzazione; compilato da PM. Mirror di `Assegnazione UT`. |  |
| 87 | UT+PE | UT | Note Assegnazione UT | campo libero | F059 | Note | MEDIA | Sola visualizzazione; compilato da PM. Mirror di `Note Assegnazione UT`. |  |
| 88 | UT+PE | UT | Forecast UT | DATE (gg/mm/aaaa) | F073 | FORECAST | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 53; score 0.95) |  |
| 89 | UT+PE | UT | Incarico VS/AS | DATE (gg/mm/aaaa) | F074 | ASSEGNAZIONE AS/VS | MEDIA | Il campo descrive la presa in carico/assegnazione VS-AS; il Campo Universale usa la terminologia `ASSEGNAZIONE AS/VS`. | di base viene inserita la data del giorno |
| 90 | UT+PE | UT | VS/AS incaricata da | menù a tendina | F075 | Assegnatore attivita | MEDIA | Il campo identifica chi ha effettuato l’incarico; il Campo Universale `Assegnatore attivita` è coerente. |  |
| 91 | UT+PE | UT | Tecnico UT | menù a tendina che si popola volta per volta | F076 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta il tecnico/progettista; il documento lo specializza al team UT. |  |
| 92 | UT+PE | UT | Fornitore UT | menù a tendina che si popola volta per volta | F077 | Fornitore / Impresa | MEDIA | Il Campo Universale rappresenta il fornitore/impresa; il documento lo specializza al team UT. | possibilità di inserire valore “nessuno” |
| 93 | UT+PE | UT | Tipologia attività UT | menù a tendina | F078 | Stato Attività | BASSA | Candidato lessicale `Stato Attività`; associazione non attestata (riga 9; score 0.85) | Valori: VS, AS, Dimensionamento plinto, VS plinto, fattibilità, correzione PE |
| 94 | UT+PE | UT | Importo UT | campo numerico | F079 | IMPORTO | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 156; score 0.95) |  |
| 95 | UT+PE | UT | Costo UT | campo numerico | F080 | Richiesta analisi UT | BASSA | Candidato lessicale `Richiesta analisi UT`; associazione non attestata (riga 98; score 0.85) | si riferisce sempre al pagamento di un esterno, non descrive un costo interno; distinto da Costo PE |
| 96 | UT+PE | UT | Fine attività UT | DATE (gg/mm/aaaa) | F081 | Week effettiva chiusura attivita | BASSA | Candidato lessicale `Week effettiva chiusura attivita`; associazione non attestata (riga 32; score 0.85) |  |
| 97 | UT+PE | UT | Invio AS/VS | DATE (gg/mm/aaaa) | F082 | INVIO AS/VS | ALTA | Campo Universale esatto (riga 55) | compare solo se New Site |
| 98 | UT+PE | PE | Assegnazione Geologica | DATE (gg/mm/aaaa) | F061 | ASSEGNAZIONE GEOLOGICA | ALTA | Pop-up PM/Permessi; mirror di `Assegnazione Geologica` compilato da PM. | Pop-up PM/Permessi; compare solo se Tipologia sito=Raw Land e Incarico=New Site; sola visualizzazione; Si compila solo se Geologica= SI |
| 99 | UT+PE | PE | Forecast Geologica | DATE (gg/mm/aaaa) | F062 | FORECAST | BASSA | Pop-up PM/Permessi; mirror di `Forecast Geologica` compilato da PM. | Pop-up PM/Permessi; compare solo se Tipologia sito=Raw Land e Incarico=New Site; sola visualizzazione; Si compila solo se Geologica= SI |
| 100 | UT+PE | PE | Arrivo Geologica | DATE (gg/mm/aaaa) | F063 | ARRIVO GEOLOGICA | ALTA | Pop-up PM/Permessi; mirror di `Arrivo Geologica` compilato da PM. | Pop-up PM/Permessi; compare solo se Tipologia sito=Raw Land e Incarico=New Site; sola visualizzazione; Si compila solo se Geologica= SI |
| 101 | UT+PE | PE | Assegnazione PE | DATE (gg/mm/aaaa) | F056 | ASSEGNAZIONE PE | ALTA | Sola visualizzazione; compilato da PM. Mirror di `Assegnazione PE`. |  |
| 102 | UT+PE | PE | Note Assegnazione PE | campo libero | F057 | Note | MEDIA | Sola visualizzazione; compilato da PM. Mirror di `Note Assegnazione PE`. |  |
| 103 | UT+PE | PE | Forecast PE | DATE (gg/mm/aaaa) | F083 | FORECAST PE | ALTA | Campo Universale esatto (riga 171) |  |
| 104 | UT+PE | PE | PSC | menù a tendina | F084 | PSC | ALTA | Campo Universale esatto (riga 62) |  |
| 105 | UT+PE | PE | Forecast PSC | DATE (gg/mm/aaaa) | F085 | FORECAST | BASSA | Candidato lessicale `FORECAST`; associazione non attestata (riga 53; score 0.90) | compare solo se PSC=SI. Si compila automaticamente con valore=Forecast PSC. Possibilità di modificare la data quando si vuole |
| 106 | UT+PE | PE | Tecnico PSC | Menù a tendina | F086 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta il tecnico/progettista; il documento lo specializza all’attività PSC. |  |
| 107 | UT+PE | PE | Note PSC | campo libero | F087 | Note | BASSA | Candidato lessicale `Note`; associazione non attestata (riga 44; score 0.90) |  |
| 108 | UT+PE | PE | OK PSC | DATE (gg/mm/aaaa) | F088 | PSC | BASSA | Candidato lessicale `PSC`; associazione non attestata (riga 62; score 0.90) |  |
| 109 | UT+PE | PE | Incarico PE | DATE (gg/mm/aaaa) | F089 | ASSEGNAZIONE PE | MEDIA | La data di incarico PE è coerente con il Campo Universale `ASSEGNAZIONE PE`, pur con terminologia diversa. | di base viene inserita la data del giorno |
| 110 | UT+PE | PE | Tipologia attività PE | menù a tendina | F090 | Stato Attività | BASSA | Candidato lessicale `Stato Attività`; associazione non attestata (riga 9; score 0.85) | si compila automaticamente con il valore corrispondente a Incarico/Lavorazione o Progetto (se Incarico/Lavorazione = New Site) |
| 111 | UT+PE | PE | PE incaricato da | menù a tendina | F091 | Assegnatore attivita | MEDIA | Il campo identifica chi ha effettuato l’incarico PE; corrisponde al concetto di assegnatore. |  |
| 112 | UT+PE | PE | Tecnico PE | menù a tendina che si popola volta per volta | F092 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta il tecnico/progettista; il documento lo specializza al team PE. | possibilità di inserire valore “nessuno”; possibilità di inserire più tecnici |
| 113 | UT+PE | PE | Fornitore PE | menù a tendina che si popola volta per volta | F093 | Fornitore / Impresa | MEDIA | Il Campo Universale rappresenta il fornitore/impresa; il documento lo specializza al team PE. | possibilità di inserire valore “nessuno” |
| 114 | UT+PE | PE | Importo PE | campo numerico | F094 | IMPORTO | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 156; score 0.95) |  |
| 115 | UT+PE | PE | Costo PE | campo numerico | F095 | PE | BASSA | Candidato lessicale `PE`; associazione non attestata (riga 365; score 0.90) | utile solo se collegato con G7 |
| 116 | UT+PE | PE | Fine attività PE | DATE (gg/mm/aaaa) | F096 | PE | BASSA | Candidato lessicale `PE`; associazione non attestata (riga 365; score 0.90) |  |
| 117 | UT+PE | PE | Invio PE | DATE (gg/mm/aaaa) | F097 | Consegna / Invio PE | ALTA | Corrispondenza esplicita con il Campo Universale `Consegna / Invio PE`. |  |
| 118 | DL | Direzione Lavori | Deposito sismico | menù a tendina | F098 | DEPOSITO SISMICO | ALTA | Campo Universale esatto (riga 285); ownership DL confermata dal documento. | Valori: SI, NO |
| 119 | DL | Direzione Lavori | Forecast Deposito Sismico | DATE (gg/mm/aaaa) | F099 | FORECAST | BASSA | Candidato generico `FORECAST` (riga 53); il documento specializza il forecast al deposito sismico. |  |
| 120 | DL | Direzione Lavori | Deposito Sismico | DATE (gg/mm/aaaa) | F100 | DEPOSITO SISMICO | MEDIA | Stesso concetto canonico del deposito sismico, ma questa occorrenza registra la data dell’evento e resta distinta dal flag SI/NO. |  |
| 121 | DL | Direzione Lavori | Tecnico deposito sismico | menù a tendina | F101 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta la figura tecnica; il documento la specializza al deposito sismico. | compare solo se deposito sismico=SI |
| 122 | DL | Direzione Lavori | Direttore Lavori | menù a tendina che si popola volta per volta | F102 | DL | ALTA | Corrispondenza diretta tra la figura `Direttore Lavori` e il Campo Universale `DL`. | compare solo se deposito sismico=SI |
| 123 | DL | Direzione Lavori | Collaudatore | menù a tendina che si popola volta per volta | F103 | COLLAUDATORE | ALTA | Campo Universale esatto (riga 58). | compare solo se deposito sismico=SI |
| 124 | DL | Direzione Lavori | Protocollo deposito sismico | DATE (gg/mm/aaaa) | F104 | Protocollo | BASSA | Candidato `Protocollo` (riga 18); la fonte lo specializza al deposito sismico. | compare solo se deposito sismico=SI |
| 125 | DL | Direzione Lavori | N° protocollo deposito sismico | campo numerico | F105 | Protocollo | BASSA | Candidato `Protocollo` (riga 18); il campo contiene il numero, non la data di protocollazione. | compare solo se deposito sismico=SI |
| 126 | DL | Direzione Lavori | N° sismica | campo numerico | F106 | Note sismica | BASSA | Candidato già usato negli artifact precedenti; nessuna corrispondenza diretta sufficientemente forte nel mapping. | compare solo se deposito sismico=SI |
| 127 | DL | Direzione Lavori | Forecast CIL | DATE (gg/mm/aaaa) | F107 | FORECAST | BASSA | Candidato generico `FORECAST` (riga 53); il documento specializza il forecast alla CIL. |  |
| 128 | DL | Direzione Lavori | Data IL | DATE (gg/mm/aaaa) | F108 | Inizio Lavori - Effettiva | BASSA | Candidato semantico verso `Inizio Lavori - Effettiva` (riga 34); abbreviazione `IL` da validare nel mapping canonico. |  |
| 129 | DL | Direzione Lavori | Data FL | DATE (gg/mm/aaaa) | F109 | Fine Lavori - Strutturale | BASSA | Candidato semantico verso `Fine Lavori - Strutturale` (riga 35); abbreviazione `FL` da validare nel mapping canonico. |  |

## Riepilogo

- Campi/occorrenze censiti: **129**
- Confidenza ALTA: **41**
- Confidenza MEDIA: **43**
- Confidenza BASSA: **45**

Le righe `BASSA` costituiscono la coda di review umana e non autorizzano modifiche automatiche al mapping canonico.
