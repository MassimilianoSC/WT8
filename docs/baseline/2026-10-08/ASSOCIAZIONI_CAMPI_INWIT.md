# Tabella decisionale completa — INWIT

## Scopo

Riferimento esterno della guida `GUIDA_RISTRUTTURAZIONE_DASHBOARD_PRACTICEHUB_v8.md`. Questo file è la **fonte primaria e canonica per l'implementazione del template cliente**: inventario, team, sezione, ordine operativo, master/mirror, condizioni di UI e `id_flusso` devono essere letti da qui. I documenti `Organizzazione Campi - <CLIENTE>` restano fonti operative storiche e di tracciabilità del confronto con i team; se divergono da questo MD, **prevale questo MD**. Il foglio `Mapping_Dati_Completo` resta una fonte secondaria esclusivamente semantica.

**Regola di precedenza:** per il cliente prevale questo MD sui documenti sorgente e sul mapping. La Guida contiene le regole trasversali comuni; questo MD ne costituisce l'applicazione cliente-specifica. Le decisioni consolidate fino all'**8 ottobre 2026** sono state incorporate direttamente nel presente file, quindi non è necessario riconciliare a runtime note o versioni precedenti.

**Confidenza:** `ALTA` = equivalenza diretta/attestata; `MEDIA` = normalizzazione semantica forte ma non perfettamente letterale; `BASSA` = candidato da validare manualmente.

**Fonte operativa storica / di derivazione:** `Organizzazione Campi - INWIT.txt`
**Fonte mapping:** `Tabella_Mapping_Completa+SchemaDB` → `Mapping_Dati_Completo`

**dtype:** riportato esclusivamente quando esplicitato nel documento operativo originale; in assenza di indicazione la cella resta vuota.

**id_flusso:** progressivo `Fxxx` assegnato secondo l'ordine operativo dei campi. Le occorrenze di sola visualizzazione o presenti nei pop-up non anticipano il flusso del team proprietario: ereditano l'ID della corrispondente occorrenza operativa master.

## Regole normative consolidate al 08/10/2026

- Le condizioni riportate in tabella sono **condizioni di interfaccia**: nascondono/mostrano il campo ma non disattivano master, automazioni o alert. Se una condizione diventa falsa, il valore già presente resta salvato e riappare quando la condizione torna vera. I valori dei campi nascosti per condizione restano memorizzati, sono inclusi nell'export e continuano a concorrere ai KPI; la sola visibilità UI non li azzera né li esclude.
- Tutte le condizioni basate su `Incarico / Lavorazione` che limitavano la visibilità di sezioni o campi sono eliminate. Restano solo le condizioni basate su altri dati esplicitamente consolidate (es. AIE, Deposito sismico, Regione, Revit, MW, CARATTERIZZAZIONE, Committente, Tipologia sito, PSC, All. 18 e presenza di campi padre).
- `Incarico / Lavorazione` è una lista configurabile a **scelta singola**. `Progetto` resta configurabile dove presente. `Tipologia attività PE` viene valorizzata automaticamente: se `Progetto` esiste nel template ed è valorizzato, assume il valore di `Progetto`; se `Progetto` è vuoto o non esiste nel template, assume il valore di `Incarico / Lavorazione`. Non coincide con `Stato attività`.
- Il blocco **Geologica** è sempre nella sezione PM `Ufficio Tecnico / Progettazione Esecutiva`, senza condizioni di visibilità; `Geologica` è un flag informativo. `Forecast Geologica = Assegnazione Geologica + 15 giorni di calendario`.
- La condizione `PE = SI` vale soltanto per `Assegnazione PE` e `Note Assegnazione PE`; non condiziona gli altri campi PE.
- Il comando applicativo si chiama **Assegna** (non `Passa`) e opera verso uno o più gruppi; la notifica va a tutti gli utenti del gruppo destinatario associati al gestore.
- `Committente` è obbligatorio alla creazione per tutti i gestori. Il valore `Altro` con inserimento manuale è disponibile su tutti i menu configurabili. Nei domini controllati non viene aggiunto automaticamente: è ammesso solo dove previsto esplicitamente dalla baseline, in particolare `Committente` e `Cliente Finale`. Eventuali valori `Altro` già appartenenti a uno specifico dominio (es. Vincoli/Ente) restano normali valori di quel dominio e non introducono testo libero.
- `Codice G7` è un dato operativo, **non** una chiave tecnica univoca: pratica, iterazioni e rilavorazioni usano ID interni.
- I valori utente/tecnico consolidati fanno riferimento agli utenti registrati del ruolo/team pertinente; dove il ruolo non è stato ancora validato esplicitamente, non viene introdotta una nuova inferenza.
- `Tipologia sito` usa `Raw Land` e `Roof Top`; `Traliccio` è ammesso come `Tipologia sito` **solo in ILIAD**.
- Nei valori di `Proprietà / Host`, le precedenti etichette `Fastweb` e `Vodafone-fastweb` sono normalizzate in `Fastweb-Vodafone`.
- I valori configurabili possono essere inizialmente derivati dai documenti/dati sorgente, ma tale operazione popola la configurazione e **non attribuisce autorità strutturale ai sorgenti**.


## Tabella Vincoli comune — baseline canonica

Il campo `Vincoli` usa la stessa struttura per tutti i gestori. La tabella comune comprende i dieci vincoli storici più `Vincoli Ambientali Naturalistici` introdotto nel consolidamento finale.

| Vincolo | Stati consolidati | Ente / comportamento |
|---|---|---|
| Monumentale | Presente / Assente / Non pertinente | Soprintendenza; se Presente crea la voce Ente |
| Archeologico | Presente / Assente / Non pertinente | Soprintendenza; se Presente crea la voce Ente |
| Paesaggistico | Presente / Assente / Assolto | si seleziona un solo Ente tra `Soprintendenza` e `Comune`; se Presente crea la voce Ente |
| Parco | Presente / Assente / Assolto | Ente configurabile; se Presente crea la voce Ente |
| Aeroportuale | Presente / Assente / Non pertinente | `ENAC / ENAV` è un unico valore Ente; se Presente crea la voce Ente |
| Idrogeologico | Presente / Assente / Non pertinente | Comune; se Presente crea la voce Ente. **Non** sposta il blocco Geologica |
| Fascia di rispetto — Cimiteriale | Presente / Assente / Non pertinente | Comune; se Presente crea la voce Ente |
| Fascia di rispetto — Pozzi | Presente / Assente / Non pertinente | Comune; se Presente crea la voce Ente |
| Fascia di rispetto — Corsi d’acqua | Presente / Assente / Non pertinente | Comune; se Presente crea la voce Ente |
| Altro | Presente / Assente / Assolto / Non pertinente | Ente configurabile; se Presente crea la voce Ente |
| Vincoli Ambientali Naturalistici | Presente / Assente / Non pertinente | valori Ente: `SIC`, `Natura2000`, `Altro`; con `Presente` si seleziona un solo Ente e si crea la relativa voce Ente |

Se un vincolo che aveva creato una voce Ente non è più `Presente`, la voce viene eliminata se vuota; se contiene già dati resta memorizzata e viene segnalata.

## Campi trasversali di pratica — baseline implementativa

Questi campi sono definiti a livello applicativo e valgono per **tutti i gestori**. Non appartengono a una singola fase o a un singolo team e, proprio per questo, **non consumano un `id_flusso`**. Sono parte della baseline canonica applicativa e sono definiti direttamente dagli MD/Guida consolidati, indipendentemente dalla loro presenza nei documenti operativi storici.

| Campo trasversale | dtype | Campo Universale / riferimento | Regola / comportamento consolidato |
|---|---|---|---|
| Note Operative | campo libero | Note Operative | Campo globale di pratica, visibile in cima alla visuale principale. Serve per eccezioni e lavorazioni straordinarie non rappresentabili adeguatamente dai campi strutturati. |
| Fatturabile |  | FATTURABILE | Dominio `SI / NO`, default `NO`. Diventa automaticamente `SI` 30 giorni dopo `Ottenimento Permessi` se l’ultimo esito ARPA è `Positivo`; una modifica manuale del PM blocca i successivi ricalcoli positivi. Un nuovo ciclo ARPA con esito `Negativo` forza il ritorno a `NO`. Con `Stato attività = KO` compare l’alert per la compilazione manuale. |
| Fatturato |  | DA VERIFICARE | Dominio `SI / NO`, valorizzato **solo manualmente**. È indipendente da `Stato ODA`; nella Ripresentazione totale viene azzerato. |

## Associazioni

| # | Team | Sezione | Campo nel documento | dtype | id_flusso | Campo Universale proposto | Confidenza | Evidenza / nota | Condizione documentata |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | PM/Permessi | Core Anagrafica Sito | Codice G7 | INTEGER | F001 | Codice G7 | ALTA | Campo Universale esatto (riga 5); Obbligatorio alla creazione. |  |
| 2 | PM/Permessi | Core Anagrafica Sito | Codice Sito | TEXT | F002 | Codice Sito | ALTA | Campo Universale esatto (riga 3); Obbligatorio alla creazione. |  |
| 3 | PM/Permessi | Core Anagrafica Sito | Nome Sito | TEXT | F003 | Nome Sito | ALTA | Campo Universale esatto (riga 4); Obbligatorio alla creazione. |  |
| 4 | PM/Permessi | Core Anagrafica Sito | Committente (Todos, Telebit e Sirti) | TEXT | F004 | COMMITTENTE | ALTA | Valori cliente-specifici del Campo Universale`COMMITTENTE`.; Obbligatorio alla creazione; eventuale valore precompilato resta modificabile. |  |
| 5 | PM/Permessi | Core Anagrafica Sito | Cliente Finale (DA SOSTITUIRE A “GESTIONALE”) | TEXT | F005 | ODA LOS A+B | BASSA | Candidato lessicale`ODA LOS A+B`; associazione non attestata (riga 157; score 0.85) |  |
| 6 | PM/Permessi | Core Anagrafica Sito | Regione | menù a tendina | F006 | Regione | ALTA | Campo Universale esatto (riga 6) |  |
| 7 | PM/Permessi | Core Anagrafica Sito | Provincia | menù a tendina | F007 | Provincia | ALTA | Campo Universale esatto (riga 7) |  |
| 8 | PM/Permessi | Core Anagrafica Sito | Comune | menù a tendina | F008 | Comune | ALTA | Campo Universale esatto (riga 8) |  |
| 9 | PM/Permessi | Core Anagrafica Sito | Indirizzo | TEXT | F009 | Indirizzo Fisico | ALTA | Nome sorgente esatto nel mapping (riga 27) |  |
| 10 | PM/Permessi | Core Anagrafica Sito | Tipologia sito | menù a tendina | F010 | Tipologia Sito | ALTA | Campo Universale esatto (riga 42) |  |
| 11 | PM/Permessi | Core Anagrafica Sito | Tipologia Struttura | menù a tendina | F011 | Tipologia Apparati / Infrastruttura | MEDIA | Il Campo Universale copre la stessa famiglia infrastrutturale, ma è più ampio della sola struttura del sito. |  |
| 12 | PM/Permessi | Core Anagrafica Sito | Incarico / Lavorazione | menù a tendina a scelta singola | F012 | Incarico / Lavorazione | ALTA | Lista configurabile; scelta singola consolidata per tutti i gestori. |  |
| 13 | PM/Permessi | Core Anagrafica Sito | Progetto | TEXT | F013 | Progetto / Commessa | ALTA | Nome sorgente esatto nel mapping (riga 45); Lista configurabile; non genera condizioni di visibilità. |  |
| 14 | PM/Permessi | Core Anagrafica Sito | ODA | campo varchar 50 | F014 | ODA | ALTA | Campo Universale esatto (riga 43) |  |
| 15 | PM/Permessi | Core Anagrafica Sito | Note ODA | campo libero | F015 | ODA | BASSA | Candidato lessicale`ODA`; associazione non attestata (riga 43; score 0.90) | compare solo se compilato campo “ODA”. Un campo Note ODA per ogni ODA compilato |
| 16 | PM/Permessi | Core Anagrafica Sito | SR INWIT | campo varchar | F016 | SR INWI | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 90; score 0.93) |  |
| 17 | PM/Permessi | Core Anagrafica Sito | Referente | menù a tendina che si popola volta per volta | F017 | Referente | ALTA | Campo Universale esatto (riga 14) |  |
| 18 | PM/Permessi | Dati Anagrafici Secondari | Gestore Tenant | menù a tendina con tutti i clienti | F018 | GESTORE | MEDIA | Il Campo Universale`GESTORE` supporta il concetto; il documento lo specializza al tenant. |  |
| 19 | PM/Permessi | Dati Anagrafici Secondari | Codice sito Tenant | TEXT | F019 | Codici Sito Terzi | MEDIA | Il codice del tenant è un identificativo di sito terzo rispetto al sito principale. | appare solo se viene inserito un valore nel campo “Gestore Tenant” |
| 20 | PM/Permessi | Dati Anagrafici Secondari | Nome sito Tenant | TEXT | F020 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato | appare solo se viene inserito un valore nel campo “Gestore Tenant” |
| 21 | PM/Permessi | Dati Anagrafici Secondari | Latitudine | DECIMAL | F021 | DA VERIFICARE | BASSA | Derivato dal campo sorgente `Coordinate`; WGS84, latitudine decimale. |  |
| 22 | PM/Permessi | Dati Anagrafici Secondari | Longitudine | DECIMAL | F022 | DA VERIFICARE | BASSA | Derivato dal campo sorgente `Coordinate`; WGS84, longitudine decimale. |  |
| 23 | PM/Permessi | Fase Preliminare | Data assegnazione | DATE (gg/mm/aaaa) | F023 | Data Assegnazione | ALTA | Campo Universale esatto (riga 10) |  |
| 24 | PM/Permessi | Fase Preliminare | Data sopralluogo | DATE (gg/mm/aaaa) | F024 | Data Sopralluogo | ALTA | Campo Universale esatto (riga 11) |  |
| 25 | PM/Permessi | Fase Preliminare | Report caratterizzazione | DATE (gg/mm/aaaa) | F025 | CARATTERIZZAZIONE | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 169; score 0.95) |  |
| 26 | PM/Permessi | Fase Preliminare | Invio report caratterizzazione | DATE (gg/mm/aaaa) | F105 | CARATTERIZZAZIONE | BASSA | Mirror in sola lettura del master UT `Invio Report Caratterizzazione`; stesso `id_flusso`. | sola visualizzazione |
| 27 | PM/Permessi | Fase Preliminare | Invio verbale di sopralluogo | DATE (gg/mm/aaaa) | F026 | INVIO VERBALE DI SOPRALLUOGO | ALTA | Campo Universale esatto (riga 54) |  |
| 28 | PM/Permessi | Fase Preliminare | Vincoli | menù a tendina | F027 | Vincoli | ALTA | Tabella Vincoli comune definita sopra; selezione multipla. La voce Ente viene creata automaticamente quando prevista dalla riga del vincolo. |  |
| 29 | PM/Permessi | Fase Preliminare | Assegnazione rilievo topografico | DATE (gg/mm/aaaa) | F028 | ASSEGNAZIONE RILIEVO TOPOGRAFICO | ALTA | Campo Universale esatto (riga 132) |  |
| 30 | PM/Permessi | Fase Preliminare | Rilievo Topografico | DATE (gg/mm/aaaa) | F029 | RILIEVO TOPOGRAFICO | ALTA | Campo Universale esatto (riga 133) |  |
| 31 | PM/Permessi | Fase Preliminare | Invio rilievo topografico | DATE (gg/mm/aaaa) | F030 | RILIEVO TOPOGRAFICO | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 133; score 0.95) | compare solo se Tipologia sito = Raw Land |
| 32 | PM/Permessi | Fase Preliminare | Revit | menù a tendina | F031 | REVIT | ALTA | Campo Universale esatto (riga 246) |  |
| 33 | PM/Permessi | Fase Preliminare | Note Revit | campo libero | F032 | Note | BASSA | Candidato lessicale`Note`; associazione non attestata (riga 44; score 0.90) | appare solo se Revit=SI |
| 34 | PM/Permessi | Fase Preliminare | Bozza di progetto | DATE (gg/mm/aaaa) | F033 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 35 | PM/Permessi | Fase Preliminare | Richiesta Fornitura Enel | DATE (gg/mm/aaaa) | F034 | RICHIESTA FORNITURA ENEL | ALTA | Campo Universale esatto (riga 134) |  |
| 36 | PM/Permessi | Fase Preliminare | Sopralluogo Enel | DATE (gg/mm/aaaa) | F035 | SOPRALLUOGO ENEL | ALTA | Campo Universale esatto (riga 135) |  |
| 37 | PM/Permessi | Fase Preliminare | Forecast Invio Caratterizzazione | DATE (gg/mm/aaaa) | F102 | FORECAST | BASSA | Pop-up UT; mirror di `Forecast Invio Caratterizzazione` della sezione operativa UT. |  |
| 38 | PM/Permessi | Fase Preliminare | Tecnico | menù a tendina | F103 | Progettista / Tecnico | MEDIA | Pop-up UT; mirror di `Tecnico Caratterizzazione` della sezione operativa UT. |  |
| 39 | PM/Permessi | Pacchetto Permessi | Tecnico PP | menù a tendina | F036 | Progettista / Tecnico | MEDIA | Normalizzazione operativa verso`Progettista / Tecnico` (riga 13) |  |
| 40 | PM/Permessi | Pacchetto Permessi | Fornitore PP | menù a tendina | F037 | Fornitore / Impresa | MEDIA | Il Campo Universale rappresenta il fornitore/impresa; il documento lo specializza al pacchetto permessi. |  |
| 41 | PM/Permessi | Pacchetto Permessi | Invio PDM | DATE (gg/mm/aaaa) | F038 | Invio PDM / Bozza PM | ALTA | Normalizzazione operativa verso`Invio PDM / Bozza PM` (riga 21) |  |
| 42 | PM/Permessi | Pacchetto Permessi | Approvazione PDM | DATE (gg/mm/aaaa) | F039 | Approvazione PDM / PM | ALTA | Normalizzazione operativa verso`Approvazione PDM / PM` (riga 22) |  |
| 43 | PM/Permessi | Pacchetto Permessi | Caricamento Revit | DATE (gg/mm/aaaa) | F040 | CARICAMENTO REVIT | ALTA | Campo Universale esatto (riga 138) | appare solo se Revit=SI |
| 44 | PM/Permessi | Pacchetto Permessi | Ricezione Scheda Tecnica | DATE (gg/mm/aaaa) | F041 | SCHEDA TECNICA | MEDIA | Il Campo Universale identifica la scheda tecnica; il documento registra specificamente la data/evento di ricezione. |  |
| 45 | PM/Permessi | Pacchetto Permessi | Assegnazione AIE | DATE (gg/mm/aaaa) | F042 | ASSEGNAZIONE PE | BASSA | Master operativo; compilato da PM/Permessi. Candidato lessicale`ASSEGNAZIONE PE`; associazione non attestata (riga 52; score 0.90) |  |
| 46 | PM/Permessi | Pacchetto Permessi | Forecast AIE | DATE (gg/mm/aaaa) | F043 | FORECAST AIE | ALTA | Master operativo PM/Permessi; alimenta il mirror AIE con lo stesso `id_flusso`. | Alert 2 gg prima; si risolve quando viene compilato il campo “Approvazione AIE” |
| 47 | PM/Permessi | Pacchetto Permessi | Riduzione | DATE (gg/mm/aaaa) | F044 | RIDUZIONI | ALTA | Mirror in sola lettura del master AIE; stesso `id_flusso`. Corrispondenza diretta singolare/plurale con il Campo Universale. | sola visualizzazione |
| 48 | PM/Permessi | Pacchetto Permessi | Approvazione Riduzione | DATE (gg/mm/aaaa) | F045 | OK RIDUZIONI | MEDIA | Mirror in sola lettura del master AIE; stesso `id_flusso`. L’approvazione della riduzione è semanticamente coerente con`OK RIDUZIONI`, ma la label canonica esprime l’esito più che l’evento. | sola visualizzazione |
| 49 | PM/Permessi | Pacchetto Permessi | Invio AIE | DATE (gg/mm/aaaa) | F046 | AIE INVIO | MEDIA | Mirror in sola lettura del master AIE; stesso `id_flusso`. Somiglianza terminologica molto forte; da confermare (riga 166; score 0.95) | sola visualizzazione |
| 50 | PM/Permessi | Pacchetto Permessi | Approvazione AIE | DATE (gg/mm/aaaa) | F047 | OK AIE | MEDIA | Mirror in sola lettura del master AIE; stesso `id_flusso`. L’approvazione AIE è coerente con il Campo Universale`OK AIE`; differenza tra evento di approvazione ed esito. | sola visualizzazione |
| 51 | PM/Permessi | Pacchetto Permessi | Note Pacchetto Permessi | campo libero | F048 | Note | MEDIA | Normalizzazione operativa verso`Note` (riga 44) |  |
| 52 | PM/Permessi | Pacchetto Permessi | Invio Pacchetto Permessi | DATE (gg/mm/aaaa) | F049 | Invio Pacchetto Permessi | ALTA | Campo Universale esatto (riga 19) |  |
| 53 | PM/Permessi | Pacchetto Permessi | Ottenimento Permessi | DATE (gg/mm/aaaa) | F050 | Ottenimento Enti / Permessi | ALTA | Nome sorgente esatto nel mapping (riga 24) |  |
| 54 | PM/Permessi | Iter Autorizzativo | Protocollo | DATE (gg/mm/aaaa) | F051 | Protocollo | ALTA | Campo Universale esatto (riga 18) |  |
| 55 | PM/Permessi | Iter Autorizzativo | Forecast Ottenimento Permessi | DATE (gg/mm/aaaa) | F052 | PREV. OTTENIMENTO PERMESSI | MEDIA | Normalizzazione operativa verso`PREV. OTTENIMENTO PERMESSI` (riga 142) | Base = Protocollo + 67 giorni di calendario. Quando si compila Invio integrazione, se in quel momento mancano <= 15 giorni al forecast base, il forecast viene spostato della durata dell’ultima integrazione (Invio integrazione - Richiesta integrazione). Il ricalcolo continua finché il campo non viene modificato manualmente; una modifica manuale lo blocca. |
| 56 | PM/Permessi | Iter Autorizzativo | Sollecito CDS | DATE (gg/mm/aaaa) | F053 | SOLLECITO CDS | ALTA | Campo Universale esatto (riga 139) |  |
| 57 | PM/Permessi | Iter Autorizzativo | Avvio Procedimento Indizione CDS | DATE (gg/mm/aaaa) | F054 | AVVIO PROCEDIMENTO INDIZIONE CDS | ALTA | Campo Universale esatto (riga 140) |  |
| 58 | PM/Permessi | Iter Autorizzativo | Richiesta integrazione | DATE (gg/mm/aaaa) | F055 | RICHIESTA INTEGRAZIONI | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 48; score 0.95) |  |
| 59 | PM/Permessi | Iter Autorizzativo | Note integrazione | campo libero | F056 | NOTE INTEGRAZIONI | MEDIA | Normalizzazione operativa verso`NOTE INTEGRAZIONI` (riga 107) | compare solo se compilato il campo “Richiesta integrazione” |
| 60 | PM/Permessi | Iter Autorizzativo | Invio integrazione | DATE (gg/mm/aaaa) | F057 | INVIO VERBALE DI SOPRALLUOGO | BASSA | Candidato lessicale`INVIO VERBALE DI SOPRALLUOGO`; associazione non attestata (riga 54; score 0.85) | compare solo se compilato il campo “Richiesta integrazione” |
| 61 | PM/Permessi | Iter Autorizzativo | Forecast Parere Arpa | DATE (gg/mm/aaaa) | F058 | FORECAST | BASSA | Candidato lessicale `FORECAST`; associazione non attestata (riga 53; score 0.90); Campo logico del gruppo ARPA ripetibile; le occorrenze successive riusano lo stesso schema. |  |
| 62 | PM/Permessi | Iter Autorizzativo | Parere Arpa | DATE (gg/mm/aaaa) | F059 | PARERE ARPA | ALTA | Campo Universale esatto (riga 108); Campo logico del gruppo ARPA ripetibile; le occorrenze successive riusano lo stesso schema. |  |
| 63 | PM/Permessi | Iter Autorizzativo | Esito parere Arpa | menù a tendina | F060 | Esito Enti (ARPA / Soprintendenza) | MEDIA | Il Campo Universale include esplicitamente ARPA tra gli esiti degli enti; è più generale del solo parere ARPA.; Campo logico del gruppo ARPA ripetibile; le occorrenze successive riusano lo stesso schema. | compare solo se compilato il campo `Parere Arpa` |
| 64 | PM/Permessi | Iter Autorizzativo | N° protocollo Arpa | TEXT | F061 | Protocollo | BASSA | Candidato lessicale`Protocollo`; associazione non attestata (riga 18; score 0.90); Campo logico del gruppo ARPA ripetibile; le occorrenze successive riusano lo stesso schema; Tipo testuale per ammettere barre e lettere. | compare solo se compilato il campo `Parere Arpa` |
| 65 | PM/Permessi | Iter Autorizzativo | Ripresentazione Pratica | DATE (gg/mm/aaaa) | F062 | Pratica Sismica | BASSA | Candidato lessicale `Pratica Sismica`; associazione non attestata (riga 87; score 0.85); Apre una nuova occorrenza del gruppo ARPA; non crea una seconda famiglia di campi.; Apre una nuova occorrenza del gruppo ARPA; non crea una seconda famiglia di campi. | compare se `Esito parere Arpa = Negativo` |
| 66 | PM/Permessi | Iter Autorizzativo | Nome Ente | campo libero | F063 | Nome sito Vodafone | BASSA | Voce Ente derivata dalla tabella Vincoli; può essere generata automaticamente dal vincolo presente. Per le voci configurabili resta ammesso `Altro` con valore manuale sulla singola pratica. | compare/si crea quando il Vincolo richiede una voce Ente |
| 67 | PM/Permessi | Iter Autorizzativo | Forecast Ottenimento “Nome ente” | DATE (gg/mm/aaaa) | F064 | FORECAST | BASSA | Candidato lessicale `FORECAST`; associazione non attestata (riga 53; score 0.90) |  |
| 68 | PM/Permessi | Iter Autorizzativo | Ottenimento “Nome ente” | DATE (gg/mm/aaaa) | F065 | Ottenimento Enti / Permessi | MEDIA | Il Campo Universale rappresenta l’ottenimento da enti/permessi; il documento istanzia dinamicamente il singolo ente. | compare solo se compilato il campo “Nome Ente” |
| 69 | PM/Permessi | Iter Autorizzativo | Esito parere “nome ente” | menù a tendina | F066 | Esito Enti (ARPA / Soprintendenza) | MEDIA | Il documento registra l’esito del singolo ente; il Campo Universale aggrega gli esiti degli enti. | compare solo se compilato il campo “Nome Ente” |
| 70 | PM/Permessi | Iter Autorizzativo | N° protocollo “Nome ente” | TEXT | F067 | Protocollo | BASSA | Candidato lessicale`Protocollo`; associazione non attestata (riga 18; score 0.90); Tipo testuale per ammettere barre e lettere. | compare solo se compilato il campo “Nome Ente” |
| 71 | PM/Permessi | Iter Autorizzativo | Protocollo autocertificazione | DATE (gg/mm/aaaa) | F068 | Protocollo | BASSA | Candidato lessicale`Protocollo`; associazione non attestata (riga 18; score 0.90) | IF “Forecast Ottenimento Permessi” >= 67 SEND Alert. Compare solo se la condizione è avverata |
| 72 | PM/Permessi | Iter Autorizzativo | Autorizzazione finale | menù a tendina | F069 | Ottenimento Enti / Permessi | MEDIA | Normalizzazione operativa verso`Ottenimento Enti / Permessi` (riga 24); Dominio: AUTORIZZATO, DINIEGATO, TAR, KO.; Dominio: AUTORIZZATO, DINIEGATO, TAR, KO. |  |
| 73 | PM/Permessi | Iter Autorizzativo | Data Autorizzazione finale | DATE (gg/mm/aaaa) | F070 | DATA | BASSA | Candidato lessicale`DATA`; associazione non attestata (riga 424; score 0.90); Data distinta da `Ottenimento Permessi`. |  |
| 74 | PM/Permessi | Iter Autorizzativo | Data Invio Offerta | DATE (gg/mm/aaaa) | F071 | DA VERIFICARE | BASSA | Nuovo campo presente nel documento operativo; associazione canonica da verificare |  |
| 75 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Geologica | menù a tendina | F072 | DA VERIFICARE | BASSA | Flag informativo; nessuna condizione di visibilità del blocco Geologica. |  |
| 76 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Assegnazione Geologica | DATE (gg/mm/aaaa) | F073 | ASSEGNAZIONE GEOLOGICA | ALTA | Campo Universale esatto (riga 143) |  |
| 77 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Forecast Geologica | DATE (gg/mm/aaaa) | F074 | FORECAST | BASSA | Candidato lessicale`FORECAST`; associazione non attestata (riga 53; score 0.90) | Forecast Geologica = Assegnazione Geologica + 15 giorni di calendario |
| 78 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Arrivo Geologica | DATE (gg/mm/aaaa) | F075 | ARRIVO GEOLOGICA | ALTA | Campo Universale esatto (riga 144) |  |
| 79 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Assegnazione UT | DATE (gg/mm/aaaa) | F081 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 80 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Note Assegnazione UT | campo libero | F082 | Note | MEDIA | Normalizzazione operativa verso`Note` (riga 44) |  |
| 81 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | PE | menù a tendina | F078 | PE | ALTA | Campo Universale esatto (riga 365) |  |
| 82 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Assegnazione PE | DATE (gg/mm/aaaa) | F079 | ASSEGNAZIONE PE | ALTA | Campo Universale esatto (riga 52) | compare solo se PE = SI |
| 83 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Note Assegnazione PE | campo libero | F080 | Note | MEDIA | Normalizzazione operativa verso`Note` (riga 44) | compare solo se PE = SI |
| 84 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Invio AS/VS | DATE (gg/mm/aaaa) | F101 | INVIO AS/VS | ALTA | Pop-up UT+PE; mirror di `Invio AS/VS` della sezione operativa. | sola visualizzazione |
| 85 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Invio Scheda Palo | DATE (gg/mm/aaaa) | F076 | INVIO SCHEDA PALO | ALTA | Campo Universale esatto (riga 330) | compare solo se Tipologia sito = Raw Land |
| 86 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Ricezione Esecutivo Palo | DATE (gg/mm/aaaa) | F077 | IMPRESA PALO | BASSA | Candidato lessicale`IMPRESA PALO`; associazione non attestata (riga 336; score 0.85) | compare solo se Tipologia sito = Raw Land |
| 87 | AIE | Fase AIE | Assegnazione AIE | DATE (gg/mm/aaaa) | F042 | ASSEGNAZIONE PE | BASSA | Sola visualizzazione; ereditato da PM/Permessi. Mirror di `Assegnazione AIE`. Candidato lessicale`ASSEGNAZIONE PE`; associazione non attestata (riga 52; score 0.90); La sezione Fase AIE è visibile al gruppo AIE dopo `Assegna`, indipendentemente dal flag AIE.; La sezione Fase AIE è visibile al gruppo AIE dopo `Assegna`, indipendentemente dal flag AIE. |  |
| 88 | AIE | Fase AIE | Forecast AIE | DATE (gg/mm/aaaa) | F043 | FORECAST AIE | ALTA | Sola visualizzazione; mirror di `Forecast AIE` master PM/Permessi; stesso `id_flusso`. | sola visualizzazione |
| 89 | AIE | Fase AIE | Tecnico Misure di fondo | menù a tendina che si popola volta per volta | F083 | N° MISURE RICH... | BASSA | Candidato lessicale`N° MISURE RICH...`; associazione non attestata (riga 440; score 0.85) | non compare se Regione = Piemonte |
| 90 | AIE | Fase AIE | Stato misure di fondo | menù a tendina | F084 | Stato Attività | BASSA | Candidato lessicale`Stato Attività`; associazione non attestata (riga 9; score 0.85) | non compare se Regione = Piemonte; Valori: IN ESECUZIONE, OK, STAND BY |
| 91 | AIE | Fase AIE | Tecnico AIE | menù a tendina che si popola volta per volta | F085 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta il tecnico/progettista; il documento lo specializza al team AIE. |  |
| 92 | AIE | Fase AIE | Stato assegnazione tecnico AIE | menù a tendina | F086 | Stato Attività | BASSA | Candidato lessicale`Stato Attività`; associazione non attestata (riga 9; score 0.85) | Valori: OK, DA ASSEGNARE |
| 93 | AIE | Fase AIE | Responsabile interno AIE | menù a tendina | F087 | OK AIE | BASSA | Candidato lessicale`OK AIE`; associazione non attestata (riga 20; score 0.85) |  |
| 94 | AIE | Fase AIE | Stato AIE | menù a tendina | F088 | Stato Attività | BASSA | Candidato lessicale`Stato Attività`; associazione non attestata (riga 9; score 0.85) |  |
| 95 | AIE | Fase AIE | Invio CEM | DATE (gg/mm/aaaa) | F089 | DA VERIFICARE | BASSA | Master operativo AIE; `id_flusso` consolidato. |  |
| 96 | AIE | Fase AIE | Fine attività AIE | DATE (gg/mm/aaaa) | F090 | OK AIE | BASSA | Candidato lessicale`OK AIE`; associazione non attestata (riga 20; score 0.85) |  |
| 97 | AIE | Fase AIE | Riduzione | DATE (gg/mm/aaaa) | F044 | RIDUZIONI | ALTA | Master operativo AIE; unica occorrenza modificabile per questo dato. Corrispondenza diretta singolare/plurale con il Campo Universale. |  |
| 98 | AIE | Fase AIE | Approvazione Riduzione | DATE (gg/mm/aaaa) | F045 | OK RIDUZIONI | MEDIA | Master operativo AIE; unica occorrenza modificabile per questo dato. L’approvazione della riduzione è semanticamente coerente con`OK RIDUZIONI`, ma la label canonica esprime l’esito più che l’evento. |  |
| 99 | AIE | Fase AIE | Invio AIE | DATE (gg/mm/aaaa) | F046 | AIE INVIO | MEDIA | Master operativo AIE; unica occorrenza modificabile per questo dato. Somiglianza terminologica molto forte; da confermare (riga 166; score 0.95) |  |
| 100 | AIE | Fase AIE | Approvazione AIE | DATE (gg/mm/aaaa) | F047 | OK AIE | MEDIA | Master operativo AIE; unica occorrenza modificabile per questo dato. L’approvazione AIE è coerente con il Campo Universale`OK AIE`; differenza tra evento di approvazione ed esito. |  |
| 101 | AIE | Fase AIE | Note AIE | campo libero | F091 | Note | MEDIA | Normalizzazione operativa verso`Note` (riga 44) |  |
| 102 | UT+PE | UT | Assegnazione UT | DATE (gg/mm/aaaa) | F081 | DA VERIFICARE | BASSA | Sola visualizzazione; compilato da PM. Mirror di `Assegnazione UT`. |  |
| 103 | UT+PE | UT | Note Assegnazione UT | campo libero | F082 | Note | MEDIA | Sola visualizzazione; compilato da PM. Mirror di `Note Assegnazione UT`. |  |
| 104 | UT+PE | UT | Forecast UT | DATE (gg/mm/aaaa) | F092 | FORECAST | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 53; score 0.95) |  |
| 105 | UT+PE | UT | Incarico VS/AS | DATE (gg/mm/aaaa) | F093 | ASSEGNAZIONE AS/VS | MEDIA | Il campo descrive la presa in carico/assegnazione VS-AS; il Campo Universale usa la terminologia`ASSEGNAZIONE AS/VS`. | di base viene inserita la data del giorno |
| 106 | UT+PE | UT | VS/AS incaricata da | menù a tendina | F094 | Assegnatore attivita | MEDIA | Il campo identifica chi ha effettuato l’incarico; il Campo Universale`Assegnatore attivita` è coerente. |  |
| 107 | UT+PE | UT | Tecnico UT | menù a tendina che si popola volta per volta | F095 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta il tecnico/progettista; il documento lo specializza al team UT. |  |
| 108 | UT+PE | UT | Fornitore UT | menù a tendina che si popola volta per volta | F096 | Fornitore / Impresa | MEDIA | Il Campo Universale rappresenta il fornitore/impresa; il documento lo specializza al team UT. | possibilità di inserire valore “nessuno” |
| 109 | UT+PE | UT | Tipologia attività UT | menù a tendina | F097 | Stato Attività | BASSA | Candidato lessicale`Stato Attività`; associazione non attestata (riga 9; score 0.85) | Valori: VS, AS, Dimensionamento plinto, VS plinto, fattibilità, correzione PE |
| 110 | UT+PE | UT | Importo UT | campo numerico | F098 | IMPORTO | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 156; score 0.95) |  |
| 111 | UT+PE | UT | Costo UT | campo numerico | F099 | Richiesta analisi UT | BASSA | Candidato lessicale`Richiesta analisi UT`; associazione non attestata (riga 98; score 0.85); Nota informativa: si riferisce sempre al pagamento di un esterno, non descrive un costo interno; distinto da Costo PE. Nessun comportamento applicativo. |  |
| 112 | UT+PE | UT | Fine attività UT | DATE (gg/mm/aaaa) | F100 | Week effettiva chiusura attivita | BASSA | Candidato lessicale`Week effettiva chiusura attivita`; associazione non attestata (riga 32; score 0.85) |  |
| 113 | UT+PE | UT | Invio AS/VS | DATE (gg/mm/aaaa) | F101 | INVIO AS/VS | ALTA | Campo Universale esatto (riga 55) |  |
| 114 | UT+PE | UT | Forecast Invio Caratterizzazione | DATE (gg/mm/aaaa) | F102 | FORECAST | BASSA | Candidato lessicale `FORECAST`; associazione non attestata (riga 53; score 0.90) |  |
| 115 | UT+PE | UT | Tecnico Caratterizzazione | menù a tendina | F103 | Progettista / Tecnico | MEDIA | Specializzazione operativa del tecnico/progettista per la caratterizzazione. |  |
| 116 | UT+PE | UT | Fornitore Caratterizzazione | menù a tendina | F104 | Fornitore / Impresa | MEDIA | Specializzazione operativa del fornitore per la caratterizzazione. |  |
| 117 | UT+PE | UT | Invio Report Caratterizzazione | DATE (gg/mm/aaaa) | F105 | CARATTERIZZAZIONE | BASSA | Candidato lessicale `CARATTERIZZAZIONE`; associazione non attestata (riga 169; score 0.90) |  |
| 118 | UT+PE | PE | Assegnazione Geologica | DATE (gg/mm/aaaa) | F073 | ASSEGNAZIONE GEOLOGICA | ALTA | Pop-up PM/Permessi; mirror di `Assegnazione Geologica` compilato da PM. | sola visualizzazione |
| 119 | UT+PE | PE | Forecast Geologica | DATE (gg/mm/aaaa) | F074 | FORECAST | BASSA | Pop-up PM/Permessi; mirror di `Forecast Geologica` compilato da PM. | Forecast Geologica = Assegnazione Geologica + 15 giorni di calendario; sola visualizzazione |
| 120 | UT+PE | PE | Arrivo Geologica | DATE (gg/mm/aaaa) | F075 | ARRIVO GEOLOGICA | ALTA | Pop-up PM/Permessi; mirror di `Arrivo Geologica` compilato da PM. | sola visualizzazione |
| 121 | UT+PE | PE | Assegnazione PE | DATE (gg/mm/aaaa) | F079 | ASSEGNAZIONE PE | ALTA | Sola visualizzazione; compilato da PM. Mirror di `Assegnazione PE`. | compare solo se PE = SI; sola visualizzazione |
| 122 | UT+PE | PE | Note Assegnazione PE | campo libero | F080 | Note | MEDIA | Sola visualizzazione; compilato da PM. Mirror di `Note Assegnazione PE`. | compare solo se PE = SI; sola visualizzazione |
| 123 | UT+PE | PE | Forecast PE | DATE (gg/mm/aaaa) | F106 | FORECAST PE | ALTA | Campo Universale esatto (riga 171) |  |
| 124 | UT+PE | PE | Incarico PE | DATE (gg/mm/aaaa) | F107 | ASSEGNAZIONE PE | MEDIA | La data di incarico PE è coerente con il Campo Universale`ASSEGNAZIONE PE`, pur con terminologia diversa. | di base viene inserita la data del giorno |
| 125 | UT+PE | PE | Tipologia attività PE | menù a tendina | F108 | DA VERIFICARE | BASSA | Compilazione automatica: se `Progetto` esiste nel template ed è valorizzato, copia il valore di `Progetto`; se `Progetto` è vuoto o non esiste nel template, copia `Incarico / Lavorazione`. Non è `Stato attività`. |  |
| 126 | UT+PE | PE | PE incaricato da | menù a tendina | F109 | Assegnatore attivita | MEDIA | Il campo identifica chi ha effettuato l’incarico PE; corrisponde al concetto di assegnatore. |  |
| 127 | UT+PE | PE | Tecnico PE | menù a tendina che si popola volta per volta | F110 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta il tecnico/progettista; il documento lo specializza al team PE. | possibilità di inserire valore “nessuno”; possibilità di inserire più tecnici |
| 128 | UT+PE | PE | Fornitore PE | menù a tendina che si popola volta per volta | F111 | Fornitore / Impresa | MEDIA | Il Campo Universale rappresenta il fornitore/impresa; il documento lo specializza al team PE. | possibilità di inserire valore “nessuno” |
| 129 | UT+PE | PE | Importo PE | campo numerico | F112 | IMPORTO | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 156; score 0.95) |  |
| 130 | UT+PE | PE | Costo PE | campo numerico | F113 | PE | BASSA | Candidato lessicale`PE`; associazione non attestata (riga 365; score 0.90); Nota informativa: utile solo se collegato con G7. Nessun comportamento applicativo. |  |
| 131 | UT+PE | PE | Fine attività PE | DATE (gg/mm/aaaa) | F114 | PE | BASSA | Candidato lessicale`PE`; associazione non attestata (riga 365; score 0.90) |  |
| 132 | UT+PE | PE | Invio PE | DATE (gg/mm/aaaa) | F115 | Consegna / Invio PE | ALTA | Corrispondenza esplicita con il Campo Universale`Consegna / Invio PE`. |  |
| 133 | UT+PE | PE | Invio Scheda Palo | DATE (gg/mm/aaaa) | F076 | INVIO SCHEDA PALO | ALTA | Pop-up PM/Permessi; mirror di `Invio Scheda Palo` compilato da PM. | compare solo se Tipologia sito = Raw Land; sola visualizzazione |
| 134 | DL | Direzione Lavori | Deposito sismico | menù a tendina | F116 | DEPOSITO SISMICO | ALTA | Campo Universale esatto (riga 285); ownership DL confermata dal documento. | Valori: SI, NO |
| 135 | DL | Direzione Lavori | Forecast Deposito Sismico | DATE (gg/mm/aaaa) | F117 | FORECAST | BASSA | Candidato generico `FORECAST` (riga 53); il documento specializza il forecast al deposito sismico. |  |
| 136 | DL | Direzione Lavori | Deposito Sismico | DATE (gg/mm/aaaa) | F118 | DEPOSITO SISMICO | MEDIA | Stesso concetto canonico del deposito sismico, ma questa occorrenza registra la data dell’evento e resta distinta dal flag SI/NO. |  |
| 137 | DL | Direzione Lavori | Tecnico deposito sismico | menù a tendina | F119 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta la figura tecnica; il documento la specializza al deposito sismico. | compare solo se deposito sismico=SI |
| 138 | DL | Direzione Lavori | Direttore Lavori | menù a tendina che si popola volta per volta | F120 | DL | ALTA | Corrispondenza diretta tra la figura `Direttore Lavori` e il Campo Universale `DL`. | compare solo se deposito sismico=SI |
| 139 | DL | Direzione Lavori | Collaudatore | menù a tendina che si popola volta per volta | F121 | COLLAUDATORE | ALTA | Campo Universale esatto (riga 58). | compare solo se deposito sismico=SI |
| 140 | DL | Direzione Lavori | Protocollo deposito sismico | DATE (gg/mm/aaaa) | F122 | Protocollo | BASSA | Candidato `Protocollo` (riga 18); la fonte lo specializza al deposito sismico. | compare solo se deposito sismico=SI |
| 141 | DL | Direzione Lavori | N° protocollo deposito sismico | TEXT | F123 | Protocollo | BASSA | Candidato `Protocollo` (riga 18); il campo contiene il numero, non la data di protocollazione.; Tipo testuale per ammettere barre e lettere. | compare solo se deposito sismico=SI |
| 142 | DL | Direzione Lavori | N° sismica | TEXT | F124 | Note sismica | BASSA | Candidato già usato negli artifact precedenti; nessuna corrispondenza diretta sufficientemente forte nel mapping.; Tipo testuale per ammettere barre e lettere. | compare solo se deposito sismico=SI |
| 143 | DL | Direzione Lavori | Forecast CIL | DATE (gg/mm/aaaa) | F125 | FORECAST | BASSA | Candidato generico `FORECAST` (riga 53); il documento specializza il forecast alla CIL. |  |
| 144 | DL | Direzione Lavori | Data IL | DATE (gg/mm/aaaa) | F126 | Inizio Lavori - Effettiva | BASSA | Candidato semantico verso `Inizio Lavori - Effettiva` (riga 34); abbreviazione `IL` da validare nel mapping canonico. |  |
| 145 | DL | Direzione Lavori | Data FL | DATE (gg/mm/aaaa) | F127 | Fine Lavori - Strutturale | BASSA | Candidato semantico verso `Fine Lavori - Strutturale` (riga 35); abbreviazione `FL` da validare nel mapping canonico. |  |

## Riepilogo

- Campi/occorrenze censiti: **145**
- Campi logici / `id_flusso`: **127** (`F001-F127`)
- Confidenza ALTA: **51**
- Confidenza MEDIA: **45**
- Confidenza BASSA: **49**

Le righe `BASSA` costituiscono la coda di review semantica del mapping e **non** mettono in discussione l'autorità operativa del campo o della sua collocazione in questo MD.
