# Tabella decisionale completa — TIM-FIBERCOP

## Scopo

Riferimento esterno della guida `GUIDA_RISTRUTTURAZIONE_DASHBOARD_PRACTICEHUB_v8.md`. L'inventario parte esclusivamente dai campi presenti nel documento `Organizzazione Campi - <CLIENTE>`, che costituisce la fonte primaria perché riflette il confronto con i team. Il foglio `Mapping_Dati_Completo` è usato solo come fonte secondaria per proporre o verificare il Campo Universale.

**Regola di precedenza:** nessun campo viene aggiunto perché presente nel mapping. Ogni riga nasce da un campo effettivamente presente nel documento cliente. Il mapping può soltanto fornire un'associazione canonica, un candidato o nessuna associazione (`DA VERIFICARE`). La sezione e il team restano quelli definiti nel documento operativo.

**Confidenza:** `ALTA` = equivalenza diretta/attestata; `MEDIA` = normalizzazione semantica forte ma non perfettamente letterale; `BASSA` = candidato da validare manualmente.

**Fonte organizzazione:** `FIBERCOP.txt`  
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
| 14 | PM/Permessi | Core Anagrafica Sito | Progetto | TEXT | F014 | Progetto / Commessa | ALTA | Nome sorgente esatto nel mapping (riga 45) | si compila solo se NON viene selezionato il valore “New Site” o “Collocato New Site” (SWAP Nokia, NIN, NIE 5G, NIE NR 700, Ponte radio, NIE Congiunto, NIN congiunto, Sharing, Provvisorio, Public safety, DAS ) |
| 15 | PM/Permessi | Core Anagrafica Sito | ODA | campo varchar 50 | F015 | ODA | ALTA | Campo Universale esatto (riga 43) |  |
| 16 | PM/Permessi | Core Anagrafica Sito | Proprietà / Host | menù a tendina | F016 | Proprietà / Host | ALTA | Campo Universale esatto (riga 12) |  |
| 17 | PM/Permessi | Core Anagrafica Sito | SR INWIT | campo varchar | F017 | SR INWI | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 90; score 0.93) | compare solo se selezionato proprietà / Host=Inwit |
| 18 | PM/Permessi | Core Anagrafica Sito | Assistente TIM | menù a tendina che si popola volta per volta | F018 | Assistente TIM | ALTA | Campo Universale esatto (riga 94) |  |
| 19 | PM/Permessi | Core Anagrafica Sito | Progettista TIM | menù a tendina che si popola volta per volta | F019 | Progettista TIM | ALTA | Campo Universale esatto (riga 95) |  |
| 20 | PM/Permessi | Dati Anagrafici Secondari | Gestore Tenant | menù a tendina con tutti i clienti | F020 | GESTORE | MEDIA | Il Campo Universale `GESTORE` supporta il concetto; il documento lo specializza al tenant. |  |
| 21 | PM/Permessi | Dati Anagrafici Secondari | Codice sito Tenant | TEXT | F021 | Codici Sito Terzi | MEDIA | Il codice del tenant è un identificativo di sito terzo rispetto al sito principale. | appare solo se viene inserito un valore nel campo “Gestore Tenant” |
| 22 | PM/Permessi | Dati Anagrafici Secondari | Nome sito Tenant | TEXT | F022 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato | appare solo se viene inserito un valore nel campo “Gestore Tenant” |
| 23 | PM/Permessi | Dati Anagrafici Secondari | Coordinate | DECIMAL | F023 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 24 | PM/Permessi | Fase Preliminare | Data assegnazione | DATE (gg/mm/aaaa) | F024 | Data Assegnazione | ALTA | Campo Universale esatto (riga 10) |  |
| 25 | PM/Permessi | Fase Preliminare | Forecast Protocollo | DATE (gg/mm/aaaa) | F025 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 26 | PM/Permessi | Fase Preliminare | Data sopralluogo | DATE (gg/mm/aaaa) | F026 | Data Sopralluogo | ALTA | Campo Universale esatto (riga 11) |  |
| 27 | PM/Permessi | Fase Preliminare | Invio verbale di sopralluogo | DATE (gg/mm/aaaa) | F027 | INVIO VERBALE DI SOPRALLUOGO | ALTA | Campo Universale esatto (riga 54) |  |
| 28 | PM/Permessi | Fase Preliminare | Vincoli | menù a tendina | F028 | Vincoli | ALTA | Campo Universale esatto (riga 26) |  |
| 29 | PM/Permessi | Fase Preliminare | Revit | menù a tendina | F029 | REVIT | ALTA | Campo Universale esatto (riga 246) |  |
| 30 | PM/Permessi | Fase Preliminare | Note Revit | campo libero | F030 | Note | BASSA | Candidato lessicale `Note`; associazione non attestata (riga 44; score 0.90) | appare solo se Revit=SI |
| 31 | PM/Permessi | Fase Preliminare | Bozza di progetto | DATE (gg/mm/aaaa) | F031 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 32 | PM/Permessi | Fase Preliminare | Assegnazione UT | DATE (gg/mm/aaaa) | F032 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 33 | PM/Permessi | Fase Preliminare | Note Assegnazione UT | campo libero | F033 | Note | MEDIA | Normalizzazione operativa verso `Note` (riga 44) |  |
| 34 | PM/Permessi | Fase Preliminare | Invio AS/VS |  | F096 | INVIO AS/VS | ALTA | Campo Universale esatto (riga 55) |  |
| 35 | PM/Permessi | Pacchetto Permessi | Ricezione validazione | DATE (gg/mm/aaaa) | F034 | Arrivo Validazione | ALTA | Corrispondenza diretta tra ricezione e arrivo della validazione. |  |
| 36 | PM/Permessi | Pacchetto Permessi | Tecnico PP | menù a tendina | F035 | Progettista / Tecnico | MEDIA | Normalizzazione operativa verso `Progettista / Tecnico` (riga 13) |  |
| 37 | PM/Permessi | Pacchetto Permessi | Fornitore PP | menù a tendina | F036 | Fornitore / Impresa | MEDIA | Il Campo Universale rappresenta il fornitore/impresa; il documento lo specializza al pacchetto permessi. |  |
| 38 | PM/Permessi | Pacchetto Permessi | Invio PDM | DATE (gg/mm/aaaa) | F037 | Invio PDM / Bozza PM | ALTA | Normalizzazione operativa verso `Invio PDM / Bozza PM` (riga 21) |  |
| 39 | PM/Permessi | Pacchetto Permessi | Approvazione PDM | DATE (gg/mm/aaaa) | F038 | Approvazione PDM / PM | ALTA | Normalizzazione operativa verso `Approvazione PDM / PM` (riga 22) |  |
| 40 | PM/Permessi | Pacchetto Permessi | Caricamento Revit | DATE (gg/mm/aaaa) | F039 | CARICAMENTO REVIT | ALTA | Campo Universale esatto (riga 138) | appare solo se Revit=SI |
| 41 | PM/Permessi | Pacchetto Permessi | AIE | menù a tendina | F040 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 42 | PM/Permessi | Pacchetto Permessi | Ricezione Scheda Tecnica | DATE (gg/mm/aaaa) | F041 | SCHEDA TECNICA | MEDIA | Il Campo Universale identifica la scheda tecnica; il documento registra specificamente la data/evento di ricezione. | compare solo se AIE=SI |
| 43 | PM/Permessi | Pacchetto Permessi | Assegnazione AIE | DATE (gg/mm/aaaa) | F042 | ASSEGNAZIONE PE | BASSA | Master operativo; compilato da PM/Permessi. Candidato lessicale `ASSEGNAZIONE PE`; associazione non attestata (riga 52; score 0.90) | compare solo se AIE=SI |
| 44 | PM/Permessi | Pacchetto Permessi | Forecast AIE | DATE (gg/mm/aaaa) | F043 | FORECAST AIE | ALTA | Campo Universale esatto (riga 184) | compare solo se AIE=SI; Alert 2 gg prima; si risolve quando viene compilato il campo “Approvazione AIE” |
| 45 | PM/Permessi | Pacchetto Permessi | Riduzione | DATE (gg/mm/aaaa) | F044 | RIDUZIONI | ALTA | Corrispondenza diretta singolare/plurale con il Campo Universale. | compare solo se AIE=SI |
| 46 | PM/Permessi | Pacchetto Permessi | Approvazione Riduzione | DATE (gg/mm/aaaa) | F045 | OK RIDUZIONI | MEDIA | L’approvazione della riduzione è semanticamente coerente con `OK RIDUZIONI`, ma la label canonica esprime l’esito più che l’evento. | compare solo se AIE=SI |
| 47 | PM/Permessi | Pacchetto Permessi | Invio AIE | DATE (gg/mm/aaaa) | F046 | AIE INVIO | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 166; score 0.95) | compare solo se AIE=SI |
| 48 | PM/Permessi | Pacchetto Permessi | Approvazione AIE | DATE (gg/mm/aaaa) | F047 | OK AIE | MEDIA | L’approvazione AIE è coerente con il Campo Universale `OK AIE`; differenza tra evento di approvazione ed esito. | compare solo se AIE=SI |
| 49 | PM/Permessi | Pacchetto Permessi | Note Pacchetto Permessi | campo libero | F048 | Note | MEDIA | Normalizzazione operativa verso `Note` (riga 44) |  |
| 50 | PM/Permessi | Pacchetto Permessi | Invio Pacchetto Permessi | DATE (gg/mm/aaaa) | F049 | Invio Pacchetto Permessi | ALTA | Campo Universale esatto (riga 19) |  |
| 51 | PM/Permessi | Pacchetto Permessi | Forecast Ottenimento Permessi | DATE (gg/mm/aaaa) | F050 | FORECAST | BASSA | Candidato lessicale `FORECAST`; associazione non attestata (riga 53; score 0.90) |  |
| 52 | PM/Permessi | Pacchetto Permessi | Ottenimento Permessi | DATE (gg/mm/aaaa) | F051 | Ottenimento Enti / Permessi | ALTA | Nome sorgente esatto nel mapping (riga 24) |  |
| 53 | PM/Permessi | Iter Autorizzativo | Protocollo | DATE (gg/mm/aaaa) | F052 | Protocollo | ALTA | Campo Universale esatto (riga 18) |  |
| 54 | PM/Permessi | Iter Autorizzativo | Richiesta integrazione | DATE (gg/mm/aaaa) | F053 | RICHIESTA INTEGRAZIONI | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 48; score 0.95) |  |
| 55 | PM/Permessi | Iter Autorizzativo | Note integrazione | campo libero | F054 | NOTE INTEGRAZIONI | MEDIA | Normalizzazione operativa verso `NOTE INTEGRAZIONI` (riga 107) | compare solo se compilato il campo “Richiesta integrazione” |
| 56 | PM/Permessi | Iter Autorizzativo | Invio integrazione | DATE (gg/mm/aaaa) | F055 | INVIO VERBALE DI SOPRALLUOGO | BASSA | Candidato lessicale `INVIO VERBALE DI SOPRALLUOGO`; associazione non attestata (riga 54; score 0.85) | compare solo se compilato il campo “Richiesta integrazione” |
| 57 | PM/Permessi | Iter Autorizzativo | Forecast Parere Arpa | DATE (gg/mm/aaaa) | F056 | FORECAST | BASSA | Candidato lessicale `FORECAST`; associazione non attestata (riga 53; score 0.90) |  |
| 58 | PM/Permessi | Iter Autorizzativo | Parere Arpa | DATE (gg/mm/aaaa) | F057 | PARERE ARPA | ALTA | Campo Universale esatto (riga 108) |  |
| 59 | PM/Permessi | Iter Autorizzativo | Esito parere Arpa | menù a tendina | F058 | Esito Enti (ARPA / Soprintendenza) | MEDIA | Il Campo Universale include esplicitamente ARPA tra gli esiti degli enti; è più generale del solo parere ARPA. | compare solo se compilato il campo “Parere Arpa”. Se esito= Negativo→ “Ripresentazione pratica” |
| 60 | PM/Permessi | Iter Autorizzativo | N° protocollo Arpa | campo libero | F059 | Protocollo | BASSA | Candidato lessicale `Protocollo`; associazione non attestata (riga 18; score 0.90) | compare solo se compilato il campo “Parere Arpa” |
| 61 | PM/Permessi | Iter Autorizzativo | Ripresentazione Pratica | DATE (gg/mm/aaaa) | F060 | Pratica Sismica | BASSA | Candidato lessicale `Pratica Sismica`; associazione non attestata (riga 87; score 0.85) | compare solo se “Esito parere Arpa”=negativo |
| 62 | PM/Permessi | Iter Autorizzativo | Forecast Parere Arpa | DATE (gg/mm/aaaa) | F061 | FORECAST | BASSA | Candidato lessicale `FORECAST`; associazione non attestata (riga 53; score 0.90) | compare solo se compilato il campo “Ripresentazione Pratica” |
| 63 | PM/Permessi | Iter Autorizzativo | Esito parere Arpa | menù a tendina | F062 | Esito Enti (ARPA / Soprintendenza) | MEDIA | Il Campo Universale include esplicitamente ARPA tra gli esiti degli enti; è più generale del solo parere ARPA. | compare solo se compilato il campo “Ripresentazione Pratica”. Se esito= Negativo→ “Ripresentazione pratica 2” |
| 64 | PM/Permessi | Iter Autorizzativo | N° protocollo Arpa | campo libero | F063 | Protocollo | BASSA | Candidato lessicale `Protocollo`; associazione non attestata (riga 18; score 0.90) | compare solo se compilato il campo “Ripresentazione Pratica” |
| 65 | PM/Permessi | Iter Autorizzativo | Nome Ente | campo libero | F064 | Nome sito Vodafone | BASSA | Candidato lessicale `Nome sito Vodafone`; associazione non attestata (riga 93; score 0.85) |  |
| 66 | PM/Permessi | Iter Autorizzativo | Forecast Ottenimento “Nome ente” | DATE (gg/mm/aaaa) | F065 | FORECAST | BASSA | Candidato lessicale `FORECAST`; associazione non attestata (riga 53; score 0.90) |  |
| 67 | PM/Permessi | Iter Autorizzativo | Ottenimento “Nome ente” | DATE (gg/mm/aaaa) | F066 | Ottenimento Enti / Permessi | MEDIA | Il Campo Universale rappresenta l’ottenimento da enti/permessi; il documento istanzia dinamicamente il singolo ente. | compare solo se compilato il campo “Nome Ente” |
| 68 | PM/Permessi | Iter Autorizzativo | Esito parere “nome ente” | menù a tendina | F067 | Esito Enti (ARPA / Soprintendenza) | MEDIA | Il documento registra l’esito del singolo ente; il Campo Universale aggrega gli esiti degli enti. | compare solo se compilato il campo “Nome Ente” |
| 69 | PM/Permessi | Iter Autorizzativo | N° protocollo “Nome ente” | campo libero | F068 | Protocollo | BASSA | Candidato lessicale `Protocollo`; associazione non attestata (riga 18; score 0.90) | compare solo se compilato il campo “Nome Ente” |
| 70 | PM/Permessi | Iter Autorizzativo | Data Autorizzazione finale |  | F069 | DATA | BASSA | Candidato lessicale `DATA`; associazione non attestata (riga 424; score 0.90) |  |
| 71 | PM/Permessi | Iter Autorizzativo | Data Invio Offerta | DATE (gg/mm/aaaa) | F070 | DA VERIFICARE | BASSA | Nuovo campo presente nel documento operativo; associazione canonica da verificare |  |
| 72 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Geologica | menù a tendina | F082 | ASSEGNAZIONE GEOLOGICA | BASSA | Candidato lessicale `ASSEGNAZIONE GEOLOGICA`; associazione non attestata (riga 143; score 0.90) | compare solo se Tipologia sito=Raw Land e Incarico=New Site |
| 73 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Assegnazione Geologica | DATE (gg/mm/aaaa) | F083 | ASSEGNAZIONE GEOLOGICA | ALTA | Campo Universale esatto (riga 143) | compare solo se Tipologia sito=Raw Land e Incarico=New Site; Si compila solo se Geologica= SI |
| 74 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Forecast Geologica | DATE (gg/mm/aaaa) | F084 | FORECAST | BASSA | Candidato lessicale `FORECAST`; associazione non attestata (riga 53; score 0.90) | compare solo se Tipologia sito=Raw Land e Incarico=New Site; Forecast Geologica = Assegnazione Geologica + 15 giorni (anche non lavorativi); Si compila solo se Geologica= SI |
| 75 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Arrivo Geologica | DATE (gg/mm/aaaa) | F085 | ARRIVO GEOLOGICA | ALTA | Campo Universale esatto (riga 144) | compare solo se Tipologia sito=Raw Land e Incarico=New Site; Si compila solo se Geologica= SI |
| 76 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Assegnazione UT | DATE (gg/mm/aaaa) | F032 | DA VERIFICARE | BASSA | Campo compilato da PM; master della corrispondente occorrenza di sola visualizzazione UT+PE. |  |
| 77 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Note Assegnazione UT | campo libero | F033 | Note | MEDIA | Campo compilato da PM; master della corrispondente occorrenza di sola visualizzazione UT+PE. |  |
| 78 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | PE | menù a tendina | F086 | PE | ALTA | Campo Universale esatto (riga 365) |  |
| 79 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Assegnazione PE | DATE (gg/mm/aaaa) | F071 | ASSEGNAZIONE PE | ALTA | Campo Universale esatto (riga 52) | Si compila solo se PE= SI |
| 80 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Note Assegnazione PE | campo libero | F072 | Note | MEDIA | Normalizzazione operativa verso `Note` (riga 44) | Si compila solo se PE= SI |
| 81 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Forecast PE | DATE (gg/mm/aaaa) | F097 | FORECAST PE | ALTA | Pop-up UT+PE; mirror di `Forecast PE` della sezione operativa. |  |
| 82 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Forecast UT | DATE (gg/mm/aaaa) | F087 | FORECAST | MEDIA | Pop-up UT+PE; mirror di `Forecast UT` della sezione operativa. |  |
| 83 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Incarico PE | DATE (gg/mm/aaaa) | F098 | ASSEGNAZIONE PE | MEDIA | Pop-up UT+PE; mirror di `Incarico PE` della sezione operativa. |  |
| 84 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | PE incaricato da | menù a tendina | F100 | Assegnatore attivita | MEDIA | Pop-up UT+PE; mirror di `PE incaricato da` della sezione operativa. |  |
| 85 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Invio PE | DATE (gg/mm/aaaa) | F106 | Consegna / Invio PE | ALTA | Pop-up UT+PE; mirror di `Invio PE` della sezione operativa. |  |
| 86 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Incarico VS/AS | DATE (gg/mm/aaaa) | F088 | ASSEGNAZIONE AS/VS | MEDIA | Pop-up UT+PE; mirror di `Incarico VS/AS` della sezione operativa. |  |
| 87 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Fornitore UT | menù a tendina che si popola volta per volta | F091 | Fornitore / Impresa | MEDIA | Pop-up UT+PE; mirror di `Fornitore UT` della sezione operativa. |  |
| 88 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Tipologia attività UT | menù a tendina | F092 | Stato Attività | BASSA | Pop-up UT+PE; mirror di `Tipologia attività UT` della sezione operativa. |  |
| 89 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Invio AS/VS | DATE (gg/mm/aaaa) | F096 | INVIO AS/VS | ALTA | Pop-up UT+PE; mirror di `Invio AS/VS` della sezione operativa. | sempre tranne quando Incarico/Lavorazione = New Site |
| 90 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Invio PE | DATE (gg/mm/aaaa) | F106 | Consegna / Invio PE | ALTA | Seconda occorrenza esplicita nel blocco PM/Permessi; la fonte indica compilazione da Maragno. Mantenuta senza riconciliare l’ownership. | compilato da Maragno |
| 91 | AIE | Fase AIE | Assegnazione AIE | DATE (gg/mm/aaaa) | F042 | ASSEGNAZIONE PE | BASSA | Sola visualizzazione; ereditato da PM/Permessi. Mirror di `Assegnazione AIE`. Candidato lessicale `ASSEGNAZIONE PE`; associazione non attestata (riga 52; score 0.90) |  |
| 92 | AIE | Fase AIE | Forecast AIE | DATE (gg/mm/aaaa) | F043 | FORECAST AIE | ALTA | Campo Universale esatto (riga 184) |  |
| 93 | AIE | Fase AIE | Tecnico Misure di fondo | menù a tendina che si popola volta per volta | F073 | N° MISURE RICH... | BASSA | Candidato lessicale `N° MISURE RICH...`; associazione non attestata (riga 440; score 0.85) | non compare se Regione=Piemonte |
| 94 | AIE | Fase AIE | Stato misure di fondo | menù a tendina | F074 | Stato Attività | BASSA | Candidato lessicale `Stato Attività`; associazione non attestata (riga 9; score 0.85) | Valori: IN ESECUZIONE, OK, STAND BY |
| 95 | AIE | Fase AIE | Tecnico AIE | menù a tendina che si popola volta per volta | F075 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta il tecnico/progettista; il documento lo specializza al team AIE. |  |
| 96 | AIE | Fase AIE | Stato assegnazione tecnico AIE | menù a tendina | F076 | Stato Attività | BASSA | Candidato lessicale `Stato Attività`; associazione non attestata (riga 9; score 0.85) | Valori: OK, DA ASSEGNARE |
| 97 | AIE | Fase AIE | Responsabile interno AIE | menù a tendina | F077 | OK AIE | BASSA | Candidato lessicale `OK AIE`; associazione non attestata (riga 20; score 0.85) |  |
| 98 | AIE | Fase AIE | Stato AIE | menù a tendina | F078 | Stato Attività | BASSA | Candidato lessicale `Stato Attività`; associazione non attestata (riga 9; score 0.85) |  |
| 99 | AIE | Fase AIE | Invio CEM | DATE (gg/mm/aaaa) | F079 | DA VERIFICARE | BASSA | Nuovo campo allineato alla sezione AIE modello ILIAD; id_flusso da assegnare nel successivo passaggio di reindicizzazione. |  |
| 100 | AIE | Fase AIE | Fine attività AIE | DATE (gg/mm/aaaa) | F080 | OK AIE | BASSA | Candidato lessicale `OK AIE`; associazione non attestata (riga 20; score 0.85) |  |
| 101 | AIE | Fase AIE | Riduzione | DATE (gg/mm/aaaa) | F044 | RIDUZIONI | ALTA | Corrispondenza diretta singolare/plurale con il Campo Universale. |  |
| 102 | AIE | Fase AIE | Approvazione Riduzione | DATE (gg/mm/aaaa) | F045 | OK RIDUZIONI | MEDIA | L’approvazione della riduzione è semanticamente coerente con `OK RIDUZIONI`, ma la label canonica esprime l’esito più che l’evento. |  |
| 103 | AIE | Fase AIE | Invio AIE | DATE (gg/mm/aaaa) | F046 | AIE INVIO | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 166; score 0.95) |  |
| 104 | AIE | Fase AIE | Approvazione AIE | DATE (gg/mm/aaaa) | F047 | OK AIE | MEDIA | L’approvazione AIE è coerente con il Campo Universale `OK AIE`; differenza tra evento di approvazione ed esito. |  |
| 105 | AIE | Fase AIE | Note AIE | campo libero | F081 | Note | MEDIA | Normalizzazione operativa verso `Note` (riga 44) |  |
| 106 | UT+PE | UT | Assegnazione UT | DATE (gg/mm/aaaa) | F032 | DA VERIFICARE | BASSA | Sola visualizzazione; compilato da PM. Mirror di `Assegnazione UT`. |  |
| 107 | UT+PE | UT | Note Assegnazione UT | campo libero | F033 | Note | MEDIA | Sola visualizzazione; compilato da PM. Mirror di `Note Assegnazione UT`. |  |
| 108 | UT+PE | UT | Forecast UT | DATE (gg/mm/aaaa) | F087 | FORECAST | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 53; score 0.95) |  |
| 109 | UT+PE | UT | Incarico VS/AS | DATE (gg/mm/aaaa) | F088 | ASSEGNAZIONE AS/VS | MEDIA | Il campo descrive la presa in carico/assegnazione VS-AS; il Campo Universale usa la terminologia `ASSEGNAZIONE AS/VS`. | di base viene inserita la data del giorno |
| 110 | UT+PE | UT | VS/AS incaricata da | menù a tendina | F089 | Assegnatore attivita | MEDIA | Il campo identifica chi ha effettuato l’incarico; il Campo Universale `Assegnatore attivita` è coerente. |  |
| 111 | UT+PE | UT | Tecnico UT | menù a tendina che si popola volta per volta | F090 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta il tecnico/progettista; il documento lo specializza al team UT. |  |
| 112 | UT+PE | UT | Fornitore UT | menù a tendina che si popola volta per volta | F091 | Fornitore / Impresa | MEDIA | Il Campo Universale rappresenta il fornitore/impresa; il documento lo specializza al team UT. | possibilità di inserire valore “nessuno” |
| 113 | UT+PE | UT | Tipologia attività UT | menù a tendina | F092 | Stato Attività | BASSA | Candidato lessicale `Stato Attività`; associazione non attestata (riga 9; score 0.85) | Valori: VS, AS, Dimensionamento plinto, VS plinto, fattibilità, correzione PE |
| 114 | UT+PE | UT | Importo UT | campo numerico | F093 | IMPORTO | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 156; score 0.95) |  |
| 115 | UT+PE | UT | Costo UT | campo numerico | F094 | Richiesta analisi UT | BASSA | Candidato lessicale `Richiesta analisi UT`; associazione non attestata (riga 98; score 0.85) | si riferisce sempre al pagamento di un esterno, non descrive un costo interno; distinto da Costo PE |
| 116 | UT+PE | UT | Fine attività UT | DATE (gg/mm/aaaa) | F095 | Week effettiva chiusura attivita | BASSA | Candidato lessicale `Week effettiva chiusura attivita`; associazione non attestata (riga 32; score 0.85) |  |
| 117 | UT+PE | UT | Invio AS/VS | DATE (gg/mm/aaaa) | F096 | INVIO AS/VS | ALTA | Campo Universale esatto (riga 55) | compare solo se New Site |
| 118 | UT+PE | PE | Assegnazione Geologica | DATE (gg/mm/aaaa) | F083 | ASSEGNAZIONE GEOLOGICA | ALTA | Pop-up PM/Permessi; mirror di `Assegnazione Geologica` compilato da PM. | Pop-up PM/Permessi; compare solo se Tipologia sito=Raw Land e Incarico=New Site; sola visualizzazione; Si compila solo se Geologica= SI |
| 119 | UT+PE | PE | Forecast Geologica | DATE (gg/mm/aaaa) | F084 | FORECAST | BASSA | Pop-up PM/Permessi; mirror di `Forecast Geologica` compilato da PM. | Pop-up PM/Permessi; compare solo se Tipologia sito=Raw Land e Incarico=New Site; sola visualizzazione; Si compila solo se Geologica= SI |
| 120 | UT+PE | PE | Arrivo Geologica | DATE (gg/mm/aaaa) | F085 | ARRIVO GEOLOGICA | ALTA | Pop-up PM/Permessi; mirror di `Arrivo Geologica` compilato da PM. | Pop-up PM/Permessi; compare solo se Tipologia sito=Raw Land e Incarico=New Site; sola visualizzazione; Si compila solo se Geologica= SI |
| 121 | UT+PE | PE | Assegnazione PE | DATE (gg/mm/aaaa) | F071 | ASSEGNAZIONE PE | ALTA | Sola visualizzazione; compilato da PM. Mirror di `Assegnazione PE`. |  |
| 122 | UT+PE | PE | Note Assegnazione PE | campo libero | F072 | Note | MEDIA | Sola visualizzazione; compilato da PM. Mirror di `Note Assegnazione PE`. |  |
| 123 | UT+PE | PE | Forecast PE | DATE (gg/mm/aaaa) | F097 | FORECAST PE | ALTA | Campo Universale esatto (riga 171) |  |
| 124 | UT+PE | PE | Incarico PE | DATE (gg/mm/aaaa) | F098 | ASSEGNAZIONE PE | MEDIA | La data di incarico PE è coerente con il Campo Universale `ASSEGNAZIONE PE`, pur con terminologia diversa. | di base viene inserita la data del giorno |
| 125 | UT+PE | PE | Tipologia attività PE | menù a tendina | F099 | Stato Attività | BASSA | Candidato lessicale `Stato Attività`; associazione non attestata (riga 9; score 0.85) | si compila automaticamente con il valore corrispondente a Incarico/Lavorazione o Progetto (se Incarico/Lavorazione = New Site) |
| 126 | UT+PE | PE | PE incaricato da | menù a tendina | F100 | Assegnatore attivita | MEDIA | Il campo identifica chi ha effettuato l’incarico PE; corrisponde al concetto di assegnatore. |  |
| 127 | UT+PE | PE | Tecnico PE | menù a tendina che si popola volta per volta | F101 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta il tecnico/progettista; il documento lo specializza al team PE. | possibilità di inserire valore “nessuno”; possibilità di inserire più tecnici |
| 128 | UT+PE | PE | Fornitore PE | menù a tendina che si popola volta per volta | F102 | Fornitore / Impresa | MEDIA | Il Campo Universale rappresenta il fornitore/impresa; il documento lo specializza al team PE. | possibilità di inserire valore “nessuno” |
| 129 | UT+PE | PE | Importo PE | campo numerico | F103 | IMPORTO | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 156; score 0.95) |  |
| 130 | UT+PE | PE | Costo PE | campo numerico | F104 | PE | BASSA | Candidato lessicale `PE`; associazione non attestata (riga 365; score 0.90) | utile solo se collegato con G7 |
| 131 | UT+PE | PE | Fine attività PE | DATE (gg/mm/aaaa) | F105 | PE | BASSA | Candidato lessicale `PE`; associazione non attestata (riga 365; score 0.90) |  |
| 132 | UT+PE | PE | Invio PE | DATE (gg/mm/aaaa) | F106 | Consegna / Invio PE | ALTA | Corrispondenza esplicita con il Campo Universale `Consegna / Invio PE`. |  |
| 133 | DL | Direzione Lavori | Deposito sismico | menù a tendina | F107 | DEPOSITO SISMICO | ALTA | Campo Universale esatto (riga 285); ownership DL confermata dal documento. | Valori: SI, NO |
| 134 | DL | Direzione Lavori | Forecast Deposito Sismico | DATE (gg/mm/aaaa) | F108 | FORECAST | BASSA | Candidato generico `FORECAST` (riga 53); il documento specializza il forecast al deposito sismico. |  |
| 135 | DL | Direzione Lavori | Deposito Sismico | DATE (gg/mm/aaaa) | F109 | DEPOSITO SISMICO | MEDIA | Stesso concetto canonico del deposito sismico, ma questa occorrenza registra la data dell’evento e resta distinta dal flag SI/NO. |  |
| 136 | DL | Direzione Lavori | Tecnico deposito sismico | menù a tendina | F110 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta la figura tecnica; il documento la specializza al deposito sismico. | compare solo se deposito sismico=SI |
| 137 | DL | Direzione Lavori | Direttore Lavori | menù a tendina che si popola volta per volta | F111 | DL | ALTA | Corrispondenza diretta tra la figura `Direttore Lavori` e il Campo Universale `DL`. | compare solo se deposito sismico=SI |
| 138 | DL | Direzione Lavori | Collaudatore | menù a tendina che si popola volta per volta | F112 | COLLAUDATORE | ALTA | Campo Universale esatto (riga 58). | compare solo se deposito sismico=SI |
| 139 | DL | Direzione Lavori | Protocollo deposito sismico | DATE (gg/mm/aaaa) | F113 | Protocollo | BASSA | Candidato `Protocollo` (riga 18); la fonte lo specializza al deposito sismico. | compare solo se deposito sismico=SI |
| 140 | DL | Direzione Lavori | N° protocollo deposito sismico | campo numerico | F114 | Protocollo | BASSA | Candidato `Protocollo` (riga 18); il campo contiene il numero, non la data di protocollazione. | compare solo se deposito sismico=SI |
| 141 | DL | Direzione Lavori | N° sismica | campo numerico | F115 | Note sismica | BASSA | Candidato già usato negli artifact precedenti; nessuna corrispondenza diretta sufficientemente forte nel mapping. | compare solo se deposito sismico=SI |
| 142 | DL | Direzione Lavori | Forecast CIL | DATE (gg/mm/aaaa) | F116 | FORECAST | BASSA | Candidato generico `FORECAST` (riga 53); il documento specializza il forecast alla CIL. |  |
| 143 | DL | Direzione Lavori | Data IL | DATE (gg/mm/aaaa) | F117 | Inizio Lavori - Effettiva | BASSA | Candidato semantico verso `Inizio Lavori - Effettiva` (riga 34); abbreviazione `IL` da validare nel mapping canonico. |  |
| 144 | DL | Direzione Lavori | Data FL | DATE (gg/mm/aaaa) | F118 | Fine Lavori - Strutturale | BASSA | Candidato semantico verso `Fine Lavori - Strutturale` (riga 35); abbreviazione `FL` da validare nel mapping canonico. |  |

## Riepilogo

- Campi/occorrenze censiti: **144**
- Confidenza ALTA: **50**
- Confidenza MEDIA: **46**
- Confidenza BASSA: **48**

Le righe `BASSA` costituiscono la coda di review umana e non autorizzano modifiche automatiche al mapping canonico.
