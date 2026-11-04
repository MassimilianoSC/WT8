# Tabella decisionale completa — INWIT

## Scopo

Riferimento esterno della guida `GUIDA_RISTRUTTURAZIONE_DASHBOARD_PRACTICEHUB_v8.md`. L'inventario parte esclusivamente dai campi presenti nel documento `Organizzazione Campi - <CLIENTE>`, che costituisce la fonte primaria perché riflette il confronto con i team. Il foglio `Mapping_Dati_Completo` è usato solo come fonte secondaria per proporre o verificare il Campo Universale.

**Regola di precedenza:** nessun campo viene aggiunto perché presente nel mapping. Ogni riga nasce da un campo effettivamente presente nel documento cliente. Il mapping può soltanto fornire un'associazione canonica, un candidato o nessuna associazione (`DA VERIFICARE`). La sezione e il team restano quelli definiti nel documento operativo.

**Confidenza:** `ALTA` = equivalenza diretta/attestata; `MEDIA` = normalizzazione semantica forte ma non perfettamente letterale; `BASSA` = candidato da validare manualmente.

**Fonte organizzazione:** `Organizzazione Campi - INWIT.txt`
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

|   # | Team        | Sezione                                   | Campo nel documento                             | dtype                                         | id_flusso | Campo Universale proposto           | Confidenza | Evidenza / nota                                                                                                                           | Condizione documentata                                                                                                                                      |
| --: | ----------- | ----------------------------------------- | ----------------------------------------------- | --------------------------------------------- | --------- | ----------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | PM/Permessi | Core Anagrafica Sito | Codice G7 | INTEGER | F001 | Codice G7 | ALTA | Campo Universale esatto (riga 5) |  |
| 2 | PM/Permessi | Core Anagrafica Sito | Codice Sito | TEXT | F002 | Codice Sito | ALTA | Campo Universale esatto (riga 3) |  |
| 3 | PM/Permessi | Core Anagrafica Sito | Nome Sito | TEXT | F003 | Nome Sito | ALTA | Campo Universale esatto (riga 4) |  |
| 4 | PM/Permessi | Core Anagrafica Sito | Committente (Todos, Telebit e Sirti) | TEXT | F004 | COMMITTENTE | ALTA | Valori cliente-specifici del Campo Universale`COMMITTENTE`. |  |
| 5 | PM/Permessi | Core Anagrafica Sito | Cliente Finale (DA SOSTITUIRE A “GESTIONALE”) | TEXT | F005 | ODA LOS A+B | BASSA | Candidato lessicale`ODA LOS A+B`; associazione non attestata (riga 157; score 0.85) |  |
| 6 | PM/Permessi | Core Anagrafica Sito | Regione | menù a tendina | F006 | Regione | ALTA | Campo Universale esatto (riga 6) |  |
| 7 | PM/Permessi | Core Anagrafica Sito | Provincia | menù a tendina | F007 | Provincia | ALTA | Campo Universale esatto (riga 7) |  |
| 8 | PM/Permessi | Core Anagrafica Sito | Comune | menù a tendina | F008 | Comune | ALTA | Campo Universale esatto (riga 8) |  |
| 9 | PM/Permessi | Core Anagrafica Sito | Indirizzo | TEXT | F009 | Indirizzo Fisico | ALTA | Nome sorgente esatto nel mapping (riga 27) |  |
| 10 | PM/Permessi | Core Anagrafica Sito | Tipologia sito | menù a tendina | F010 | Tipologia Sito | ALTA | Campo Universale esatto (riga 42) |  |
| 11 | PM/Permessi | Core Anagrafica Sito | Tipologia Struttura | menù a tendina | F011 | Tipologia Apparati / Infrastruttura | MEDIA | Il Campo Universale copre la stessa famiglia infrastrutturale, ma è più ampio della sola struttura del sito. |  |
| 12 | PM/Permessi | Core Anagrafica Sito | Incarico / Lavorazione | menù a tendina | F012 | Incarico / Lavorazione | ALTA | Campo Universale esatto (riga 41) |  |
| 13 | PM/Permessi | Core Anagrafica Sito | Progetto | TEXT | F013 | Progetto / Commessa | ALTA | Nome sorgente esatto nel mapping (riga 45) | si compila solo se selezionato il valore “New Site” (Trasferimento, Remedies, Commitment, PNRR) |
| 14 | PM/Permessi | Core Anagrafica Sito | ODA | campo varchar 50 | F014 | ODA | ALTA | Campo Universale esatto (riga 43) |  |
| 15 | PM/Permessi | Core Anagrafica Sito | Note ODA | campo libero | F015 | ODA | BASSA | Candidato lessicale`ODA`; associazione non attestata (riga 43; score 0.90) | compare solo se compilato campo “ODA”. Un campo Note ODA per ogni ODA compilato |
| 16 | PM/Permessi | Core Anagrafica Sito | SR INWIT | campo varchar | F016 | SR INWI | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 90; score 0.93) |  |
| 17 | PM/Permessi | Core Anagrafica Sito | Referente | menù a tendina che si popola volta per volta | F017 | Referente | ALTA | Campo Universale esatto (riga 14) |  |
| 18 | PM/Permessi | Dati Anagrafici Secondari | Gestore Tenant | menù a tendina con tutti i clienti | F018 | GESTORE | MEDIA | Il Campo Universale`GESTORE` supporta il concetto; il documento lo specializza al tenant. |  |
| 19 | PM/Permessi | Dati Anagrafici Secondari | Codice sito Tenant | TEXT | F019 | Codici Sito Terzi | MEDIA | Il codice del tenant è un identificativo di sito terzo rispetto al sito principale. | appare solo se viene inserito un valore nel campo “Gestore Tenant” |
| 20 | PM/Permessi | Dati Anagrafici Secondari | Nome sito Tenant | TEXT | F020 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato | appare solo se viene inserito un valore nel campo “Gestore Tenant” |
| 21 | PM/Permessi | Dati Anagrafici Secondari | Coordinate | DECIMAL | F021 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 22 | PM/Permessi | Fase Preliminare | Data assegnazione | DATE (gg/mm/aaaa) | F022 | Data Assegnazione | ALTA | Campo Universale esatto (riga 10) |  |
| 23 | PM/Permessi | Fase Preliminare | Data sopralluogo | DATE (gg/mm/aaaa) | F023 | Data Sopralluogo | ALTA | Campo Universale esatto (riga 11) |  |
| 24 | PM/Permessi | Fase Preliminare | Report caratterizzazione | data | F024 | CARATTERIZZAZIONE | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 169; score 0.95) | compare solo se nel campo “Incarico / Lavorazione” viene selezionato il valore “Caratterizzazione” o il valore “Caratterizzazione + Verifica statica” |
| 25 | PM/Permessi | Fase Preliminare | Invio report caratterizzazione | data | F025 | CARATTERIZZAZIONE | BASSA | Candidato lessicale`CARATTERIZZAZIONE`; associazione non attestata (riga 169; score 0.90) | compare solo se nel campo “Incarico / Lavorazione” viene selezionato il valore “Caratterizzazione” o il valore “Caratterizzazione + Verifica statica” |
| 26 | PM/Permessi | Fase Preliminare | Invio verbale di sopralluogo | data | F026 | INVIO VERBALE DI SOPRALLUOGO | ALTA | Campo Universale esatto (riga 54) |  |
| 27 | PM/Permessi | Fase Preliminare | Vincoli | menù a tendina | F027 | Vincoli | ALTA | Campo Universale esatto (riga 26) |  |
| 28 | PM/Permessi | Fase Preliminare | Assegnazione rilievo topografico | data | F028 | ASSEGNAZIONE RILIEVO TOPOGRAFICO | ALTA | Campo Universale esatto (riga 132) |  |
| 29 | PM/Permessi | Fase Preliminare | Rilievo Topografico | data | F029 | RILIEVO TOPOGRAFICO | ALTA | Campo Universale esatto (riga 133) |  |
| 30 | PM/Permessi | Fase Preliminare | Invio rilievo topografico | data | F030 | RILIEVO TOPOGRAFICO | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 133; score 0.95) | compare solo se new site raw land |
| 31 | PM/Permessi | Fase Preliminare | Revit | menù a tendina | F031 | REVIT | ALTA | Campo Universale esatto (riga 246) |  |
| 32 | PM/Permessi | Fase Preliminare | Note Revit | campo libero | F032 | Note | BASSA | Candidato lessicale`Note`; associazione non attestata (riga 44; score 0.90) | appare solo se Revit=SI |
| 33 | PM/Permessi | Fase Preliminare | Bozza di progetto | data | F033 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 34 | PM/Permessi | Fase Preliminare | Richiesta Fornitura Enel | data | F034 | RICHIESTA FORNITURA ENEL | ALTA | Campo Universale esatto (riga 134) |  |
| 35 | PM/Permessi | Fase Preliminare | Sopralluogo Enel | data | F035 | SOPRALLUOGO ENEL | ALTA | Campo Universale esatto (riga 135) |  |
| 36 | PM/Permessi | Fase Preliminare | Forecast Invio Caratterizzazione | DATE (gg/mm/aaaa) | F104 | FORECAST | BASSA | Pop-up UT; mirror di `Forecast Invio Caratterizzazione` della sezione operativa UT. |  |
| 37 | PM/Permessi | Fase Preliminare | Tecnico | menù a tendina | F105 | Progettista / Tecnico | MEDIA | Pop-up UT; mirror di `Tecnico Caratterizzazione` della sezione operativa UT. |  |
| 38 | PM/Permessi | Fase Preliminare | Invio Report Caratterizzazione | DATE (gg/mm/aaaa) | F107 | CARATTERIZZAZIONE | BASSA | Pop-up UT; mirror di `Invio Report Caratterizzazione` della sezione operativa UT. |  |
| 39 | PM/Permessi | Pacchetto Permessi | Tecnico PP | menù a tendina | F036 | Progettista / Tecnico | MEDIA | Normalizzazione operativa verso`Progettista / Tecnico` (riga 13) |  |
| 40 | PM/Permessi | Pacchetto Permessi | Fornitore PP | menù a tendina | F037 | Fornitore / Impresa | MEDIA | Il Campo Universale rappresenta il fornitore/impresa; il documento lo specializza al pacchetto permessi. |  |
| 41 | PM/Permessi | Pacchetto Permessi | Invio PDM | data | F038 | Invio PDM / Bozza PM | ALTA | Normalizzazione operativa verso`Invio PDM / Bozza PM` (riga 21) |  |
| 42 | PM/Permessi | Pacchetto Permessi | Approvazione PDM | data | F039 | Approvazione PDM / PM | ALTA | Normalizzazione operativa verso`Approvazione PDM / PM` (riga 22) |  |
| 43 | PM/Permessi | Pacchetto Permessi | Caricamento Revit | data | F040 | CARICAMENTO REVIT | ALTA | Campo Universale esatto (riga 138) | appare solo se Revit=SI |
| 44 | PM/Permessi | Pacchetto Permessi | Ricezione Scheda Tecnica | data | F041 | SCHEDA TECNICA | MEDIA | Il Campo Universale identifica la scheda tecnica; il documento registra specificamente la data/evento di ricezione. |  |
| 45 | PM/Permessi | Pacchetto Permessi | Assegnazione AIE | data | F042 | ASSEGNAZIONE PE | BASSA | Master operativo; compilato da PM/Permessi. Candidato lessicale`ASSEGNAZIONE PE`; associazione non attestata (riga 52; score 0.90) |  |
| 46 | PM/Permessi | Pacchetto Permessi | Forecast AIE | data | F043 | FORECAST AIE | ALTA | Campo Universale esatto (riga 184) | Alert 2 gg prima; si risolve quando viene compilato il campo “Approvazione AIE” |
| 47 | PM/Permessi | Pacchetto Permessi | Riduzione | data | F044 | RIDUZIONI | ALTA | Corrispondenza diretta singolare/plurale con il Campo Universale. |  |
| 48 | PM/Permessi | Pacchetto Permessi | Approvazione Riduzione | data | F045 | OK RIDUZIONI | MEDIA | L’approvazione della riduzione è semanticamente coerente con`OK RIDUZIONI`, ma la label canonica esprime l’esito più che l’evento. |  |
| 49 | PM/Permessi | Pacchetto Permessi | Invio AIE | data | F046 | AIE INVIO | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 166; score 0.95) |  |
| 50 | PM/Permessi | Pacchetto Permessi | Approvazione AIE | data | F047 | OK AIE | MEDIA | L’approvazione AIE è coerente con il Campo Universale`OK AIE`; differenza tra evento di approvazione ed esito. |  |
| 51 | PM/Permessi | Pacchetto Permessi | Note Pacchetto Permessi | campo libero | F048 | Note | MEDIA | Normalizzazione operativa verso`Note` (riga 44) |  |
| 52 | PM/Permessi | Pacchetto Permessi | Invio Pacchetto Permessi | data | F049 | Invio Pacchetto Permessi | ALTA | Campo Universale esatto (riga 19) |  |
| 53 | PM/Permessi | Pacchetto Permessi | Ottenimento Permessi | DATE (gg/mm/aaaa) | F050 | Ottenimento Enti / Permessi | ALTA | Nome sorgente esatto nel mapping (riga 24) |  |
| 54 | PM/Permessi | Iter Autorizzativo | Protocollo | data | F051 | Protocollo | ALTA | Campo Universale esatto (riga 18) |  |
| 55 | PM/Permessi | Iter Autorizzativo | Forecast Ottenimento Permessi | DATE (gg/mm/aaaa) | F052 | PREV. OTTENIMENTO PERMESSI | MEDIA | Normalizzazione operativa verso`PREV. OTTENIMENTO PERMESSI` (riga 142) | compare quando viene compilato il campo “Protocollo”. Compare solo quando “Incarico / Lavorazione” = New Site. Il valore viene calcolato automaticamente aggiungendo 67 giorni (anche non lavorativi) a data “Protocollo”. IF giorni <=15 and “Richiesta integrazione” allora “Forecast Ottenimento Permessi” = “Forecast Ottenimento Permessi” + (“Invio integrazione” - “Richiesta integrazione”) |
| 56 | PM/Permessi | Iter Autorizzativo | Sollecito CDS | data | F053 | SOLLECITO CDS | ALTA | Campo Universale esatto (riga 139) |  |
| 57 | PM/Permessi | Iter Autorizzativo | Avvio Procedimento Indizione CDS | data | F054 | AVVIO PROCEDIMENTO INDIZIONE CDS | ALTA | Campo Universale esatto (riga 140) |  |
| 58 | PM/Permessi | Iter Autorizzativo | Richiesta integrazione | data | F055 | RICHIESTA INTEGRAZIONI | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 48; score 0.95) |  |
| 59 | PM/Permessi | Iter Autorizzativo | Note integrazione | campo libero | F056 | NOTE INTEGRAZIONI | MEDIA | Normalizzazione operativa verso`NOTE INTEGRAZIONI` (riga 107) | compare solo se compilato il campo “Richiesta integrazione” |
| 60 | PM/Permessi | Iter Autorizzativo | Invio integrazione | data | F057 | INVIO VERBALE DI SOPRALLUOGO | BASSA | Candidato lessicale`INVIO VERBALE DI SOPRALLUOGO`; associazione non attestata (riga 54; score 0.85) | compare solo se compilato il campo “Richiesta integrazione” |
| 61 | PM/Permessi | Iter Autorizzativo | Forecast Parere Arpa | DATE (gg/mm/aaaa) | F058 | FORECAST | BASSA | Candidato lessicale `FORECAST`; associazione non attestata (riga 53; score 0.90) |  |
| 62 | PM/Permessi | Iter Autorizzativo | Parere Arpa | data | F059 | PARERE ARPA | ALTA | Campo Universale esatto (riga 108) |  |
| 63 | PM/Permessi | Iter Autorizzativo | Esito parere Arpa | menù a tendina | F060 | Esito Enti (ARPA / Soprintendenza) | MEDIA | Il Campo Universale include esplicitamente ARPA tra gli esiti degli enti; è più generale del solo parere ARPA. | compare solo se compilato il campo “Parere Arpa” |
| 64 | PM/Permessi | Iter Autorizzativo | N° protocollo Arpa | campo libero | F061 | Protocollo | BASSA | Candidato lessicale`Protocollo`; associazione non attestata (riga 18; score 0.90) | compare solo se compilato il campo “Parere Arpa” |
| 65 | PM/Permessi | Iter Autorizzativo | Ripresentazione Pratica | DATE (gg/mm/aaaa) | F062 | Pratica Sismica | BASSA | Candidato lessicale `Pratica Sismica`; associazione non attestata (riga 87; score 0.85) | compare solo se “Esito parere Arpa”=negativo |
| 66 | PM/Permessi | Iter Autorizzativo | Forecast Parere Arpa | DATE (gg/mm/aaaa) | F063 | FORECAST | BASSA | Candidato lessicale `FORECAST`; associazione non attestata (riga 53; score 0.90) | compare solo se compilato il campo “Ripresentazione Pratica” |
| 67 | PM/Permessi | Iter Autorizzativo | Esito parere Arpa | menù a tendina | F064 | Esito Enti (ARPA / Soprintendenza) | MEDIA | Il Campo Universale include esplicitamente ARPA tra gli esiti degli enti; è più generale del solo parere ARPA. | compare solo se compilato il campo “Ripresentazione Pratica”. Se esito= Negativo→ “Ripresentazione pratica 2” |
| 68 | PM/Permessi | Iter Autorizzativo | N° protocollo Arpa | campo libero | F065 | Protocollo | BASSA | Candidato lessicale `Protocollo`; associazione non attestata (riga 18; score 0.90) | compare solo se compilato il campo “Ripresentazione Pratica” |
| 69 | PM/Permessi | Iter Autorizzativo | Nome Ente | campo libero | F066 | Nome sito Vodafone | BASSA | Candidato lessicale`Nome sito Vodafone`; associazione non attestata (riga 93; score 0.85) |  |
| 70 | PM/Permessi | Iter Autorizzativo | Forecast Ottenimento “Nome ente” | DATE (gg/mm/aaaa) | F067 | FORECAST | BASSA | Candidato lessicale `FORECAST`; associazione non attestata (riga 53; score 0.90) |  |
| 71 | PM/Permessi | Iter Autorizzativo | Ottenimento “Nome ente” | data | F068 | Ottenimento Enti / Permessi | MEDIA | Il Campo Universale rappresenta l’ottenimento da enti/permessi; il documento istanzia dinamicamente il singolo ente. | compare solo se compilato il campo “Nome Ente” |
| 72 | PM/Permessi | Iter Autorizzativo | Esito parere “nome ente” | menù a tendina | F069 | Esito Enti (ARPA / Soprintendenza) | MEDIA | Il documento registra l’esito del singolo ente; il Campo Universale aggrega gli esiti degli enti. | compare solo se compilato il campo “Nome Ente” |
| 73 | PM/Permessi | Iter Autorizzativo | N° protocollo “Nome ente” | campo libero | F070 | Protocollo | BASSA | Candidato lessicale`Protocollo`; associazione non attestata (riga 18; score 0.90) | compare solo se compilato il campo “Nome Ente” |
| 74 | PM/Permessi | Iter Autorizzativo | Protocollo autocertificazione | data | F071 | Protocollo | BASSA | Candidato lessicale`Protocollo`; associazione non attestata (riga 18; score 0.90) | IF “Forecast Ottenimento Permessi” >= 67 SEND Alert. Compare solo se la condizione è avverata |
| 75 | PM/Permessi | Iter Autorizzativo | Autorizzazione finale | menù a tendina | F072 | Ottenimento Enti / Permessi | MEDIA | Normalizzazione operativa verso`Ottenimento Enti / Permessi` (riga 24) |  |
| 76 | PM/Permessi | Iter Autorizzativo | Data Autorizzazione finale |  | F073 | DATA | BASSA | Candidato lessicale`DATA`; associazione non attestata (riga 424; score 0.90) |  |
| 77 | PM/Permessi | Iter Autorizzativo | Data Invio Offerta | DATE (gg/mm/aaaa) | F074 | DA VERIFICARE | BASSA | Nuovo campo presente nel documento operativo; associazione canonica da verificare |  |
| 78 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Assegnazione Geologica | data | F075 | ASSEGNAZIONE GEOLOGICA | ALTA | Campo Universale esatto (riga 143) | compare solo se Tipologia sito=Raw Land e Incarico=New Site; Si compila solo se Geologica= SI |
| 79 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Forecast Geologica | data | F076 | FORECAST | BASSA | Candidato lessicale`FORECAST`; associazione non attestata (riga 53; score 0.90) | compare solo se Tipologia sito=Raw Land e Incarico=New Site; Forecast Geologica = Assegnazione Geologica + 15 giorni (anche non lavorativi); Si compila solo se Geologica= SI |
| 80 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Arrivo Geologica | data | F077 | ARRIVO GEOLOGICA | ALTA | Campo Universale esatto (riga 144) | compare solo se Tipologia sito=Raw Land e Incarico=New Site; Si compila solo se Geologica= SI |
| 81 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Assegnazione UT | data | F083 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato | compare solo se selezionato il valore “Verifica statica” o il valore “Caratterizzazione + verifica statica” nel campo “Incarico / Lavorazione” |
| 82 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Note Assegnazione UT | campo libero | F084 | Note | MEDIA | Normalizzazione operativa verso`Note` (riga 44) | compare solo se selezionato il valore “Verifica statica” o il valore “Caratterizzazione + verifica statica” nel campo “Incarico / Lavorazione” |
| 83 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | PE | menù a tendina | F080 | PE | ALTA | Campo Universale esatto (riga 365) |  |
| 84 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Assegnazione PE | data | F081 | ASSEGNAZIONE PE | ALTA | Campo Universale esatto (riga 52) | si compila solo se PE=SI |
| 85 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Note Assegnazione PE | campo libero | F082 | Note | MEDIA | Normalizzazione operativa verso`Note` (riga 44) | si compila solo se PE=SI |
| 86 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Invio AS/VS | DATE (gg/mm/aaaa) | F103 | INVIO AS/VS | ALTA | Pop-up UT+PE; mirror di `Invio AS/VS` della sezione operativa. | sempre tranne quando Incarico/Lavorazione = New Site |
| 87 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Invio Scheda Palo | data | F078 | INVIO SCHEDA PALO | ALTA | Campo Universale esatto (riga 330) | Compare solo se Tipologia sito= Raw Land |
| 88 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Ricezione Esecutivo Palo | data | F079 | IMPRESA PALO | BASSA | Candidato lessicale`IMPRESA PALO`; associazione non attestata (riga 336; score 0.85) | Compare solo se Tipologia sito= Raw Land |
| 89 | AIE | Fase AIE | Assegnazione AIE | data | F042 | ASSEGNAZIONE PE | BASSA | Sola visualizzazione; ereditato da PM/Permessi. Mirror di `Assegnazione AIE`. Candidato lessicale`ASSEGNAZIONE PE`; associazione non attestata (riga 52; score 0.90) |  |
| 90 | AIE | Fase AIE | Forecast AIE | data | F043 | FORECAST AIE | ALTA | Campo Universale esatto (riga 184) |  |
| 91 | AIE | Fase AIE | Tecnico Misure di fondo | menù a tendina che si popola volta per volta | F085 | N° MISURE RICH... | BASSA | Candidato lessicale`N° MISURE RICH...`; associazione non attestata (riga 440; score 0.85) | non compare se Regione=Piemonte |
| 92 | AIE | Fase AIE | Stato misure di fondo | menù a tendina | F086 | Stato Attività | BASSA | Candidato lessicale`Stato Attività`; associazione non attestata (riga 9; score 0.85) | Valori: IN ESECUZIONE, OK, STAND BY |
| 93 | AIE | Fase AIE | Tecnico AIE | menù a tendina che si popola volta per volta | F087 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta il tecnico/progettista; il documento lo specializza al team AIE. |  |
| 94 | AIE | Fase AIE | Stato assegnazione tecnico AIE | menù a tendina | F088 | Stato Attività | BASSA | Candidato lessicale`Stato Attività`; associazione non attestata (riga 9; score 0.85) | Valori: OK, DA ASSEGNARE |
| 95 | AIE | Fase AIE | Responsabile interno AIE | menù a tendina | F089 | OK AIE | BASSA | Candidato lessicale`OK AIE`; associazione non attestata (riga 20; score 0.85) |  |
| 96 | AIE | Fase AIE | Stato AIE | menù a tendina | F090 | Stato Attività | BASSA | Candidato lessicale`Stato Attività`; associazione non attestata (riga 9; score 0.85) |  |
| 97 | AIE | Fase AIE | Invio CEM | DATE (gg/mm/aaaa) | F091 | DA VERIFICARE | BASSA | Nuovo campo allineato alla sezione AIE modello ILIAD; id_flusso da assegnare nel successivo passaggio di reindicizzazione. |  |
| 98 | AIE | Fase AIE | Fine attività AIE | data | F092 | OK AIE | BASSA | Candidato lessicale`OK AIE`; associazione non attestata (riga 20; score 0.85) |  |
| 99 | AIE | Fase AIE | Riduzione | data | F044 | RIDUZIONI | ALTA | Corrispondenza diretta singolare/plurale con il Campo Universale. |  |
| 100 | AIE | Fase AIE | Approvazione Riduzione | data | F045 | OK RIDUZIONI | MEDIA | L’approvazione della riduzione è semanticamente coerente con`OK RIDUZIONI`, ma la label canonica esprime l’esito più che l’evento. |  |
| 101 | AIE | Fase AIE | Invio AIE | data | F046 | AIE INVIO | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 166; score 0.95) |  |
| 102 | AIE | Fase AIE | Approvazione AIE | data | F047 | OK AIE | MEDIA | L’approvazione AIE è coerente con il Campo Universale`OK AIE`; differenza tra evento di approvazione ed esito. |  |
| 103 | AIE | Fase AIE | Note AIE | campo libero | F093 | Note | MEDIA | Normalizzazione operativa verso`Note` (riga 44) |  |
| 104 | UT+PE | UT | Assegnazione UT | data | F083 | DA VERIFICARE | BASSA | Sola visualizzazione; compilato da PM. Mirror di `Assegnazione UT`. |  |
| 105 | UT+PE | UT | Note Assegnazione UT | campo libero | F084 | Note | MEDIA | Sola visualizzazione; compilato da PM. Mirror di `Note Assegnazione UT`. |  |
| 106 | UT+PE | UT | Forecast UT | data | F094 | FORECAST | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 53; score 0.95) |  |
| 107 | UT+PE | UT | Incarico VS/AS | data | F095 | ASSEGNAZIONE AS/VS | MEDIA | Il campo descrive la presa in carico/assegnazione VS-AS; il Campo Universale usa la terminologia`ASSEGNAZIONE AS/VS`. | di base viene inserita la data del giorno |
| 108 | UT+PE | UT | VS/AS incaricata da | menù a tendina | F096 | Assegnatore attivita | MEDIA | Il campo identifica chi ha effettuato l’incarico; il Campo Universale`Assegnatore attivita` è coerente. |  |
| 109 | UT+PE | UT | Tecnico UT | menù a tendina che si popola volta per volta | F097 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta il tecnico/progettista; il documento lo specializza al team UT. |  |
| 110 | UT+PE | UT | Fornitore UT | menù a tendina che si popola volta per volta | F098 | Fornitore / Impresa | MEDIA | Il Campo Universale rappresenta il fornitore/impresa; il documento lo specializza al team UT. | possibilità di inserire valore “nessuno” |
| 111 | UT+PE | UT | Tipologia attività UT | menù a tendina | F099 | Stato Attività | BASSA | Candidato lessicale`Stato Attività`; associazione non attestata (riga 9; score 0.85) | Valori: VS, AS, Dimensionamento plinto, VS plinto, fattibilità, correzione PE |
| 112 | UT+PE | UT | Importo UT | campo numerico | F100 | IMPORTO | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 156; score 0.95) |  |
| 113 | UT+PE | UT | Costo UT | campo numerico | F101 | Richiesta analisi UT | BASSA | Candidato lessicale`Richiesta analisi UT`; associazione non attestata (riga 98; score 0.85) | si riferisce sempre al pagamento di un esterno, non descrive un costo interno; distinto da Costo PE |
| 114 | UT+PE | UT | Fine attività UT | data | F102 | Week effettiva chiusura attivita | BASSA | Candidato lessicale`Week effettiva chiusura attivita`; associazione non attestata (riga 32; score 0.85) |  |
| 115 | UT+PE | UT | Invio AS/VS | DATE (gg/mm/aaaa) | F103 | INVIO AS/VS | ALTA | Campo Universale esatto (riga 55) | compare solo se New Site |
| 116 | UT+PE | UT | Forecast Invio Caratterizzazione | DATE (gg/mm/aaaa) | F104 | FORECAST | BASSA | Candidato lessicale `FORECAST`; associazione non attestata (riga 53; score 0.90) | compare solo se Incarico / Lavorazione = Caratterizzazione o Caratterizzazione + VS |
| 117 | UT+PE | UT | Tecnico Caratterizzazione | menù a tendina | F105 | Progettista / Tecnico | MEDIA | Specializzazione operativa del tecnico/progettista per la caratterizzazione. | compare solo se Incarico / Lavorazione = Caratterizzazione o Caratterizzazione + VS |
| 118 | UT+PE | UT | Fornitore Caratterizzazione | menù a tendina | F106 | Fornitore / Impresa | MEDIA | Specializzazione operativa del fornitore per la caratterizzazione. | compare solo se Incarico / Lavorazione = Caratterizzazione o Caratterizzazione + VS |
| 119 | UT+PE | UT | Invio Report Caratterizzazione | DATE (gg/mm/aaaa) | F107 | CARATTERIZZAZIONE | BASSA | Candidato lessicale `CARATTERIZZAZIONE`; associazione non attestata (riga 169; score 0.90) | compare solo se Incarico / Lavorazione = Caratterizzazione o Caratterizzazione + VS |
| 120 | UT+PE | PE | Assegnazione Geologica | data | F075 | ASSEGNAZIONE GEOLOGICA | ALTA | Pop-up PM/Permessi; mirror di `Assegnazione Geologica` compilato da PM. | Pop-up PM/Permessi; compare solo se Tipologia sito=Raw Land e Incarico=New Site; sola visualizzazione; Si compila solo se Geologica= SI |
| 121 | UT+PE | PE | Forecast Geologica | data | F076 | FORECAST | BASSA | Pop-up PM/Permessi; mirror di `Forecast Geologica` compilato da PM. | Pop-up PM/Permessi; compare solo se Tipologia sito=Raw Land e Incarico=New Site; sola visualizzazione; Si compila solo se Geologica= SI |
| 122 | UT+PE | PE | Arrivo Geologica | data | F077 | ARRIVO GEOLOGICA | ALTA | Pop-up PM/Permessi; mirror di `Arrivo Geologica` compilato da PM. | Pop-up PM/Permessi; compare solo se Tipologia sito=Raw Land e Incarico=New Site; sola visualizzazione; Si compila solo se Geologica= SI |
| 123 | UT+PE | PE | Assegnazione PE | data | F081 | ASSEGNAZIONE PE | ALTA | Sola visualizzazione; compilato da PM. Mirror di `Assegnazione PE`. |  |
| 124 | UT+PE | PE | Note Assegnazione PE | campo libero | F082 | Note | MEDIA | Sola visualizzazione; compilato da PM. Mirror di `Note Assegnazione PE`. |  |
| 125 | UT+PE | PE | Forecast PE | data | F108 | FORECAST PE | ALTA | Campo Universale esatto (riga 171) |  |
| 126 | UT+PE | PE | Incarico PE | data | F109 | ASSEGNAZIONE PE | MEDIA | La data di incarico PE è coerente con il Campo Universale`ASSEGNAZIONE PE`, pur con terminologia diversa. | di base viene inserita la data del giorno |
| 127 | UT+PE | PE | Tipologia attività PE | menù a tendina | F110 | Stato Attività | BASSA | Candidato lessicale`Stato Attività`; associazione non attestata (riga 9; score 0.85) | si compila automaticamente con il valore corrispondente a Incarico/Lavorazione o Progetto (se Incarico/Lavorazione = New Site) |
| 128 | UT+PE | PE | PE incaricato da | menù a tendina | F111 | Assegnatore attivita | MEDIA | Il campo identifica chi ha effettuato l’incarico PE; corrisponde al concetto di assegnatore. |  |
| 129 | UT+PE | PE | Tecnico PE | menù a tendina che si popola volta per volta | F112 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta il tecnico/progettista; il documento lo specializza al team PE. | possibilità di inserire valore “nessuno”; possibilità di inserire più tecnici |
| 130 | UT+PE | PE | Fornitore PE | menù a tendina che si popola volta per volta | F113 | Fornitore / Impresa | MEDIA | Il Campo Universale rappresenta il fornitore/impresa; il documento lo specializza al team PE. | possibilità di inserire valore “nessuno” |
| 131 | UT+PE | PE | Importo PE | campo numerico | F114 | IMPORTO | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 156; score 0.95) |  |
| 132 | UT+PE | PE | Costo PE | campo numerico | F115 | PE | BASSA | Candidato lessicale`PE`; associazione non attestata (riga 365; score 0.90) | utile solo se collegato con G7 |
| 133 | UT+PE | PE | Fine attività PE | data | F116 | PE | BASSA | Candidato lessicale`PE`; associazione non attestata (riga 365; score 0.90) |  |
| 134 | UT+PE | PE | Invio PE | data | F117 | Consegna / Invio PE | ALTA | Corrispondenza esplicita con il Campo Universale`Consegna / Invio PE`. |  |
| 135 | UT+PE | PE | Invio Scheda Palo | data | F078 | INVIO SCHEDA PALO | ALTA | Pop-up PM/Permessi; mirror di `Invio Scheda Palo` compilato da PM. | Compare solo se Tipologia sito= Raw Land; sola visualizzazione |
| 136 | DL | Direzione Lavori | Deposito sismico | menù a tendina | F118 | DEPOSITO SISMICO | ALTA | Campo Universale esatto (riga 285); ownership DL confermata dal documento. | Valori: SI, NO |
| 137 | DL | Direzione Lavori | Forecast Deposito Sismico | DATE (gg/mm/aaaa) | F119 | FORECAST | BASSA | Candidato generico `FORECAST` (riga 53); il documento specializza il forecast al deposito sismico. |  |
| 138 | DL | Direzione Lavori | Deposito Sismico | DATE (gg/mm/aaaa) | F120 | DEPOSITO SISMICO | MEDIA | Stesso concetto canonico del deposito sismico, ma questa occorrenza registra la data dell’evento e resta distinta dal flag SI/NO. |  |
| 139 | DL | Direzione Lavori | Tecnico deposito sismico | menù a tendina | F121 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta la figura tecnica; il documento la specializza al deposito sismico. | compare solo se deposito sismico=SI |
| 140 | DL | Direzione Lavori | Direttore Lavori | menù a tendina che si popola volta per volta | F122 | DL | ALTA | Corrispondenza diretta tra la figura `Direttore Lavori` e il Campo Universale `DL`. | compare solo se deposito sismico=SI |
| 141 | DL | Direzione Lavori | Collaudatore | menù a tendina che si popola volta per volta | F123 | COLLAUDATORE | ALTA | Campo Universale esatto (riga 58). | compare solo se deposito sismico=SI |
| 142 | DL | Direzione Lavori | Protocollo deposito sismico | DATE (gg/mm/aaaa) | F124 | Protocollo | BASSA | Candidato `Protocollo` (riga 18); la fonte lo specializza al deposito sismico. | compare solo se deposito sismico=SI |
| 143 | DL | Direzione Lavori | N° protocollo deposito sismico | campo numerico | F125 | Protocollo | BASSA | Candidato `Protocollo` (riga 18); il campo contiene il numero, non la data di protocollazione. | compare solo se deposito sismico=SI |
| 144 | DL | Direzione Lavori | N° sismica | campo numerico | F126 | Note sismica | BASSA | Candidato già usato negli artifact precedenti; nessuna corrispondenza diretta sufficientemente forte nel mapping. | compare solo se deposito sismico=SI |
| 145 | DL | Direzione Lavori | Forecast CIL | DATE (gg/mm/aaaa) | F127 | FORECAST | BASSA | Candidato generico `FORECAST` (riga 53); il documento specializza il forecast alla CIL. |  |
| 146 | DL | Direzione Lavori | Data IL | DATE (gg/mm/aaaa) | F128 | Inizio Lavori - Effettiva | BASSA | Candidato semantico verso `Inizio Lavori - Effettiva` (riga 34); abbreviazione `IL` da validare nel mapping canonico. |  |
| 147 | DL | Direzione Lavori | Data FL | DATE (gg/mm/aaaa) | F129 | Fine Lavori - Strutturale | BASSA | Candidato semantico verso `Fine Lavori - Strutturale` (riga 35); abbreviazione `FL` da validare nel mapping canonico. |  |

## Riepilogo

- Campi/occorrenze censiti: **147**
- Confidenza ALTA: **51**
- Confidenza MEDIA: **46**
- Confidenza BASSA: **50**

Le righe `BASSA` costituiscono la coda di review umana e non autorizzano modifiche automatiche al mapping canonico.
