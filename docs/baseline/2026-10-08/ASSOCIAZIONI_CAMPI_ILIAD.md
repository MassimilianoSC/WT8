# Tabella decisionale completa — ILIAD

## Scopo

Riferimento esterno della guida `GUIDA_RISTRUTTURAZIONE_DASHBOARD_PRACTICEHUB_v8.md`. Questo file è la **fonte primaria e canonica per l'implementazione del template cliente**: inventario, team, sezione, ordine operativo, master/mirror, condizioni di UI e `id_flusso` devono essere letti da qui. I documenti `Organizzazione Campi - <CLIENTE>` restano fonti operative storiche e di tracciabilità del confronto con i team; se divergono da questo MD, **prevale questo MD**. Il foglio `Mapping_Dati_Completo` resta una fonte secondaria esclusivamente semantica.

**Regola di precedenza:** per il cliente prevale questo MD sui documenti sorgente e sul mapping. La Guida contiene le regole trasversali comuni; questo MD ne costituisce l'applicazione cliente-specifica. Le decisioni consolidate fino all'**8 ottobre 2026** sono state incorporate direttamente nel presente file, quindi non è necessario riconciliare a runtime note o versioni precedenti.

**Confidenza:** `ALTA` = equivalenza diretta/attestata; `MEDIA` = normalizzazione semantica forte ma non perfettamente letterale; `BASSA` = candidato da validare manualmente.

**Fonte operativa storica / di derivazione:** `Organizzazione Campi -ILIAD.txt`  
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

**Nota ILIAD:** `Fatturabile` e `Fatturato` compaiono anche nell'inventario sorgente della sezione PM/Permessi → `Fatturazione`, perché il documento ILIAD li contiene esplicitamente. Quelle righe sono mantenute per tracciabilità della fonte; nell'interfaccia i due campi devono essere rappresentati una sola volta come campi trasversali di pratica, non duplicati.

## Associazioni

| # | Team | Sezione | Campo nel documento | dtype | id_flusso | Campo Universale proposto | Confidenza | Evidenza / nota | Condizione documentata |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | PM/Permessi | Core Anagrafica Sito | Codice G7 | INTEGER | F001 | Codice G7 | ALTA | Campo Universale esatto (riga 5); Obbligatorio alla creazione. |  |
| 2 | PM/Permessi | Core Anagrafica Sito | Codice Sito | TEXT | F002 | Codice Sito | ALTA | Campo Universale esatto (riga 3); Obbligatorio alla creazione. |  |
| 3 | PM/Permessi | Core Anagrafica Sito | Nome Sito | TEXT | F003 | Nome Sito | ALTA | Campo Universale esatto (riga 4); Obbligatorio alla creazione. |  |
| 4 | PM/Permessi | Core Anagrafica Sito | Committente | TEXT | F004 | COMMITTENTE | ALTA | Campo Universale esatto (riga 131); Obbligatorio alla creazione; eventuale valore precompilato resta modificabile. |  |
| 5 | PM/Permessi | Core Anagrafica Sito | Cliente Finale | TEXT | F005 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato; Obbligatorio alla creazione. |  |
| 6 | PM/Permessi | Core Anagrafica Sito | Regione | menù a tendina | F006 | Regione | ALTA | Campo Universale esatto (riga 6) |  |
| 7 | PM/Permessi | Core Anagrafica Sito | Provincia | menù a tendina | F007 | Provincia | ALTA | Campo Universale esatto (riga 7) |  |
| 8 | PM/Permessi | Core Anagrafica Sito | Comune | menù a tendina | F008 | Comune | ALTA | Campo Universale esatto (riga 8) |  |
| 9 | PM/Permessi | Core Anagrafica Sito | Indirizzo | TEXT | F009 | Indirizzo Fisico | ALTA | Nome sorgente esatto nel mapping (riga 27) |  |
| 10 | PM/Permessi | Core Anagrafica Sito | Tipologia sito | menù a tendina | F010 | Tipologia Sito | ALTA | Campo Universale esatto (riga 42) |  |
| 11 | PM/Permessi | Core Anagrafica Sito | Tipologia Struttura | menù a tendina | F011 | Tipologia Apparati / Infrastruttura | MEDIA | Il Campo Universale copre la stessa famiglia infrastrutturale, ma è più ampio della sola struttura del sito. |  |
| 12 | PM/Permessi | Core Anagrafica Sito | Altezza traliccio | menù a tendina | F012 | DA VERIFICARE | BASSA | Nessuna associazione sufficientemente supportata (best score 0.60) | compare solo se Tipologia sito= traliccio. <= 30m, >30m |
| 13 | PM/Permessi | Core Anagrafica Sito | Rinforzo | menù a tendina | F013 | DA VERIFICARE | BASSA | Nessuna associazione sufficientemente supportata (best score 0.90) |  |
| 14 | PM/Permessi | Core Anagrafica Sito | Area Apparati | menù a tendina | F014 | Tipologia Apparati / Infrastruttura | MEDIA | Il Campo Universale comprende anche la componente apparati; associazione coerente ma non perfettamente 1:1. |  |
| 15 | PM/Permessi | Core Anagrafica Sito | Incarico / Lavorazione | menù a tendina a scelta singola | F015 | Incarico / Lavorazione | ALTA | Lista configurabile; scelta singola consolidata per tutti i gestori. |  |
| 16 | PM/Permessi | Core Anagrafica Sito | Progetto | TEXT | F016 | Progetto / Commessa | ALTA | Nome sorgente esatto nel mapping (riga 45); Lista configurabile; non genera condizioni di visibilità. |  |
| 17 | PM/Permessi | Core Anagrafica Sito | Proprietà / Host | menù a tendina | F017 | Proprietà / Host | ALTA | Campo Universale esatto (riga 12) |  |
| 18 | PM/Permessi | Core Anagrafica Sito | Codice sito Host | campo libero | F018 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 19 | PM/Permessi | Core Anagrafica Sito | Referente | menù a tendina che si popola volta per volta | F019 | Referente | ALTA | Campo Universale esatto (riga 14) |  |
| 20 | PM/Permessi | Dati Anagrafici Secondari | Gestore Tenant | menù a tendina con tutti i clienti | F020 | GESTORE | MEDIA | Il Campo Universale `GESTORE` supporta il concetto; il documento lo specializza al tenant. |  |
| 21 | PM/Permessi | Dati Anagrafici Secondari | Codice sito Tenant | TEXT | F021 | Codici Sito Terzi | MEDIA | Il codice del tenant è un identificativo di sito terzo rispetto al sito principale. | appare solo se viene inserito un valore nel campo “Gestore Tenant” |
| 22 | PM/Permessi | Dati Anagrafici Secondari | Nome sito Tenant | TEXT | F022 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato | appare solo se viene inserito un valore nel campo “Gestore Tenant” |
| 23 | PM/Permessi | Dati Anagrafici Secondari | Latitudine | DECIMAL | F023 | DA VERIFICARE | BASSA | Derivato dal campo sorgente `Coordinate`; WGS84, latitudine decimale. |  |
| 24 | PM/Permessi | Dati Anagrafici Secondari | Longitudine | DECIMAL | F024 | DA VERIFICARE | BASSA | Derivato dal campo sorgente `Coordinate`; WGS84, longitudine decimale. |  |
| 25 | PM/Permessi | Fase Preliminare | Preesistenze | menù a tendina | F025 | PREESIST. | BASSA | Candidato lessicale `PREESIST.`; associazione non attestata (riga 197; score 0.90) |  |
| 26 | PM/Permessi | Fase Preliminare | Acquisitore | menù a tendina | F026 | ACQUISITORE | ALTA | Campo Universale esatto (riga 130) |  |
| 27 | PM/Permessi | Fase Preliminare | Data assegnazione | DATE (gg/mm/aaaa) | F027 | Data Assegnazione | ALTA | Campo Universale esatto (riga 10) |  |
| 28 | PM/Permessi | Fase Preliminare | Forecast Protocollo | DATE (gg/mm/aaaa) | F028 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato | Forecast Protocollo = Data assegnazione + 30 giorni di calendario |
| 29 | PM/Permessi | Fase Preliminare | Data sopralluogo | DATE (gg/mm/aaaa) | F029 | Data Sopralluogo | ALTA | Campo Universale esatto (riga 11) |  |
| 30 | PM/Permessi | Fase Preliminare | Invio verbale di sopralluogo | DATE (gg/mm/aaaa) | F030 | INVIO VERBALE DI SOPRALLUOGO | ALTA | Campo Universale esatto (riga 54) |  |
| 31 | PM/Permessi | Fase Preliminare | Vincoli | menù a tendina | F031 | Vincoli | ALTA | Tabella Vincoli comune definita sopra; selezione multipla. La voce Ente viene creata automaticamente quando prevista dalla riga del vincolo. |  |
| 32 | PM/Permessi | Fase Preliminare | Revit | menù a tendina | F032 | REVIT | ALTA | Campo Universale esatto (riga 246) |  |
| 33 | PM/Permessi | Fase Preliminare | Note Revit | campo libero | F033 | Note | BASSA | Candidato lessicale `Note`; associazione non attestata (riga 44; score 0.90) | appare solo se Revit=SI → compilano il team permessi |
| 34 | PM/Permessi | Fase Preliminare | Bozza di progetto | DATE (gg/mm/aaaa) | F034 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 35 | PM/Permessi | Fase Preliminare | Richiesta Fornitura Enel | DATE (gg/mm/aaaa) | F035 | RICHIESTA FORNITURA ENEL | ALTA | Campo Universale esatto (riga 134) |  |
| 36 | PM/Permessi | Fase Preliminare | Sopralluogo Enel | DATE (gg/mm/aaaa) | F036 | SOPRALLUOGO ENEL | ALTA | Campo Universale esatto (riga 135) |  |
| 37 | PM/Permessi | Fase Preliminare | Assegnazione rilievo topografico | DATE (gg/mm/aaaa) | F037 | ASSEGNAZIONE RILIEVO TOPOGRAFICO | ALTA | Campo Universale esatto (riga 132) | compare solo se Tipologia sito = Raw Land |
| 38 | PM/Permessi | Fase Preliminare | Rilievo Topografico | DATE (gg/mm/aaaa) | F038 | RILIEVO TOPOGRAFICO | ALTA | Campo Universale esatto (riga 133) | compare solo se Tipologia sito = Raw Land |
| 39 | PM/Permessi | Fase Preliminare | Invio rilievo topografico | DATE (gg/mm/aaaa) | F039 | RILIEVO TOPOGRAFICO | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 133; score 0.95) | compare solo se Tipologia sito = Raw Land |
| 40 | PM/Permessi | Fase Preliminare | Assegnazione georadar | DATE (gg/mm/aaaa) | F040 | ASSEGNAZIONE RILIEVO TOPOGRAFICO | BASSA | Candidato lessicale `ASSEGNAZIONE RILIEVO TOPOGRAFICO`; associazione non attestata (riga 132; score 0.85) | compare solo se Tipologia sito = Raw Land |
| 41 | PM/Permessi | Fase Preliminare | Rilievo georadar | DATE (gg/mm/aaaa) | F041 | ASSEGNAZIONE RILIEVO TOPOGRAFICO | BASSA | Candidato lessicale `ASSEGNAZIONE RILIEVO TOPOGRAFICO`; associazione non attestata (riga 132; score 0.85) | compare solo se Tipologia sito = Raw Land |
| 42 | PM/Permessi | Fase Preliminare | Invio georadar | DATE (gg/mm/aaaa) | F042 | Invio Pacchetto Permessi | BASSA | Candidato lessicale `Invio Pacchetto Permessi`; associazione non attestata (riga 19; score 0.85) | compare solo se Tipologia sito = Raw Land |
| 43 | PM/Permessi | Fase Preliminare | CARATTERIZZAZIONE | menù a tendina | F043 | CARATTERIZZAZIONE | ALTA | Campo Universale esatto (riga 169) |  |
| 44 | PM/Permessi | Fase Preliminare | Invio offerta | menù a tendina | F044 | Invio Pacchetto Permessi | BASSA | Candidato lessicale `Invio Pacchetto Permessi`; associazione non attestata (riga 19; score 0.85) | compare solo se CARATTERIZZAZIONE= SI. SI, NO |
| 45 | PM/Permessi | Fase Preliminare | Conferma offerta | menù a tendina | F045 | DA VERIFICARE | BASSA | Nessuna associazione sufficientemente supportata (best score 0.72) | compare solo se CARATTERIZZAZIONE= SI. SI, NO |
| 46 | PM/Permessi | Fase Preliminare | Forecast Invio Caratterizzazione | DATE (gg/mm/aaaa) | F136 | FORECAST | BASSA | Pop-up UT; mirror di `Forecast Invio Caratterizzazione` della sezione operativa UT. | sola visualizzazione |
| 47 | PM/Permessi | Fase Preliminare | Tecnico | Menù a tendina | F137 | Progettista / Tecnico | MEDIA | Pop-up UT; mirror di `Tecnico Caratterizzazione` della sezione operativa UT. |  |
| 48 | PM/Permessi | Fase Preliminare | Invio Report Caratterizzazione | DATE (gg/mm/aaaa) | F139 | CARATTERIZZAZIONE | BASSA | Pop-up UT; mirror di `Invio Report Caratterizzazione` della sezione operativa UT. | sola visualizzazione |
| 49 | PM/Permessi | Pacchetto Permessi | Assegnazione | DATE (gg/mm/aaaa) | F046 | Data Assegnazione | ALTA | Nome sorgente esatto nel mapping (riga 10) |  |
| 50 | PM/Permessi | Pacchetto Permessi | Progettista / Tecnico | menù a tendina che si popola volta per volta | F047 | Progettista / Tecnico | ALTA | Campo Universale esatto (riga 13) |  |
| 51 | PM/Permessi | Pacchetto Permessi | Fornitore Permessi | menù a tendina che si popola volta per volta | F048 | Fornitore / Impresa | MEDIA | Il Campo Universale rappresenta il fornitore/impresa; il documento lo specializza ai permessi. |  |
| 52 | PM/Permessi | Pacchetto Permessi | Invio PDM | DATE (gg/mm/aaaa) | F049 | Invio PDM / Bozza PM | ALTA | Normalizzazione operativa verso `Invio PDM / Bozza PM` (riga 21) |  |
| 53 | PM/Permessi | Pacchetto Permessi | Approvazione PDM | DATE (gg/mm/aaaa) | F050 | Approvazione PDM / PM | ALTA | Normalizzazione operativa verso `Approvazione PDM / PM` (riga 22) |  |
| 54 | PM/Permessi | Pacchetto Permessi | Caricamento Revit | DATE (gg/mm/aaaa) | F051 | CARICAMENTO REVIT | ALTA | Campo Universale esatto (riga 138) | appare solo se Revit=SI |
| 55 | PM/Permessi | Pacchetto Permessi | AIE | menù a tendina | F052 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 56 | PM/Permessi | Pacchetto Permessi | MW | menù a tendina | F053 | DA VERIFICARE | BASSA | Nessuna associazione sufficientemente supportata (best score 0.60) |  |
| 57 | PM/Permessi | Pacchetto Permessi | Ricezione Scheda Tecnica | DATE (gg/mm/aaaa) | F054 | SCHEDA TECNICA | MEDIA | Il Campo Universale identifica la scheda tecnica; il documento registra specificamente la data/evento di ricezione. | compare solo se AIE=SI |
| 58 | PM/Permessi | Pacchetto Permessi | Ricezione Scheda Parabole | DATE (gg/mm/aaaa) | F055 | SCHEDA RADIO | BASSA | Candidato lessicale `SCHEDA RADIO`; associazione non attestata (riga 56; score 0.85) | compare solo se MW=SI |
| 59 | PM/Permessi | Pacchetto Permessi | Assegnazione AIE | DATE (gg/mm/aaaa) | F056 | ASSEGNAZIONE PE | BASSA | Master operativo; compilato da PM/Permessi. Candidato lessicale `ASSEGNAZIONE PE`; associazione non attestata (riga 52; score 0.90) | compare solo se AIE=SI |
| 60 | PM/Permessi | Pacchetto Permessi | Forecast AIE | DATE (gg/mm/aaaa) | F057 | FORECAST AIE | ALTA | Master operativo PM/Permessi; alimenta il mirror AIE con lo stesso `id_flusso`. | compare solo se AIE=SI; Alert 2 gg prima; si risolve quando viene compilato il campo “Approvazione AIE” |
| 61 | PM/Permessi | Pacchetto Permessi | Invio CEM | DATE (gg/mm/aaaa) | F119 | DA VERIFICARE | BASSA | Mirror in sola lettura del master AIE; stesso `id_flusso`. Nessuna associazione sufficientemente supportata (best score 0.90) | compare solo se AIE=SI; sola visualizzazione |
| 62 | PM/Permessi | Pacchetto Permessi | Riduzione | DATE (gg/mm/aaaa) | F121 | RIDUZIONI | ALTA | Mirror in sola lettura del master AIE; stesso `id_flusso`. Corrispondenza diretta singolare/plurale con il Campo Universale. | compare solo se AIE=SI; sola visualizzazione |
| 63 | PM/Permessi | Pacchetto Permessi | Approvazione Riduzione | DATE (gg/mm/aaaa) | F122 | OK RIDUZIONI | MEDIA | Mirror in sola lettura del master AIE; stesso `id_flusso`. L’approvazione della riduzione è semanticamente coerente con `OK RIDUZIONI`, ma la label canonica esprime l’esito più che l’evento. | compare solo se AIE=SI; sola visualizzazione |
| 64 | PM/Permessi | Pacchetto Permessi | Invio AIE | DATE (gg/mm/aaaa) | F123 | AIE INVIO | MEDIA | Mirror in sola lettura del master AIE; stesso `id_flusso`. Somiglianza terminologica molto forte; da confermare (riga 166; score 0.95) | compare solo se AIE=SI; sola visualizzazione |
| 65 | PM/Permessi | Pacchetto Permessi | Approvazione AIE | DATE (gg/mm/aaaa) | F124 | OK AIE | MEDIA | Mirror in sola lettura del master AIE; stesso `id_flusso`. L’approvazione AIE è coerente con il Campo Universale `OK AIE`; differenza tra evento di approvazione ed esito. | compare solo se AIE=SI; sola visualizzazione |
| 66 | PM/Permessi | Pacchetto Permessi | XML |  | F058 | XML | ALTA | Campo Universale esatto (riga 208) |  |
| 67 | PM/Permessi | Pacchetto Permessi | Assegnazione AIE di collaudo | DATE (gg/mm/aaaa) | F059 | COLLAUDO | BASSA | Candidato lessicale `COLLAUDO`; associazione non attestata (riga 72; score 0.90) |  |
| 68 | PM/Permessi | Pacchetto Permessi | Forecast misure di fondo | DATE (gg/mm/aaaa) | F060 | FORECAST | BASSA | Candidato lessicale `FORECAST`; associazione non attestata (riga 53; score 0.90) |  |
| 69 | PM/Permessi | Pacchetto Permessi | Invio AIE di collaudo | DATE (gg/mm/aaaa) | F061 | COLLAUDO | BASSA | Candidato lessicale `COLLAUDO`; associazione non attestata (riga 72; score 0.90) |  |
| 70 | PM/Permessi | Pacchetto Permessi | Approvazione AIE di collaudo | DATE (gg/mm/aaaa) | F062 | COLLAUDO | BASSA | Candidato lessicale `COLLAUDO`; associazione non attestata (riga 72; score 0.90) |  |
| 71 | PM/Permessi | Pacchetto Permessi | Invio PP di collaudo | DATE (gg/mm/aaaa) | F063 | COLLAUDO | BASSA | Candidato lessicale `COLLAUDO`; associazione non attestata (riga 72; score 0.90) |  |
| 72 | PM/Permessi | Pacchetto Permessi | Firma PP di collaudo | DATE (gg/mm/aaaa) | F064 | COLLAUDO | BASSA | Candidato lessicale `COLLAUDO`; associazione non attestata (riga 72; score 0.90) |  |
| 73 | PM/Permessi | Pacchetto Permessi | Protocollo AIE di collaudo | DATE (gg/mm/aaaa) | F065 | Protocollo | BASSA | Candidato lessicale `Protocollo`; associazione non attestata (riga 18; score 0.90) |  |
| 74 | PM/Permessi | Pacchetto Permessi | Note Pacchetto Permessi | campo libero | F066 | Note | MEDIA | Normalizzazione operativa verso `Note` (riga 44) |  |
| 75 | PM/Permessi | Pacchetto Permessi | Invio Pacchetto Permessi | DATE (gg/mm/aaaa) | F067 | Invio Pacchetto Permessi | ALTA | Campo Universale esatto (riga 19) |  |
| 76 | PM/Permessi | Pacchetto Permessi | Ricezione PP Firmato | DATE (gg/mm/aaaa) | F068 | DA VERIFICARE | BASSA | Nessuna associazione sufficientemente supportata (best score 0.90) |  |
| 77 | PM/Permessi | Pacchetto Permessi | Invio ricevute di protocollo | DATE (gg/mm/aaaa) | F069 | Protocollo | BASSA | Candidato lessicale `Protocollo`; associazione non attestata (riga 18; score 0.90) |  |
| 78 | PM/Permessi | Pacchetto Permessi | Forecast Ottenimento Permessi | DATE (gg/mm/aaaa) | F070 | FORECAST | BASSA | Candidato lessicale `FORECAST`; associazione non attestata (riga 53; score 0.90) | Forecast manuale; non applicare automaticamente la formula Protocollo + 67 giorni. |
| 79 | PM/Permessi | Pacchetto Permessi | Ottenimento Permessi | DATE (gg/mm/aaaa) | F071 | Ottenimento Enti / Permessi | ALTA | Nome sorgente esatto nel mapping (riga 24) |  |
| 80 | PM/Permessi | Iter Autorizzativo | Protocollo | DATE (gg/mm/aaaa) | F072 | Protocollo | ALTA | Campo Universale esatto (riga 18) |  |
| 81 | PM/Permessi | Iter Autorizzativo | Richiesta integrazione | DATE (gg/mm/aaaa) | F073 | RICHIESTA INTEGRAZIONI | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 48; score 0.95) |  |
| 82 | PM/Permessi | Iter Autorizzativo | Note integrazione | campo libero | F074 | NOTE INTEGRAZIONI | MEDIA | Normalizzazione operativa verso `NOTE INTEGRAZIONI` (riga 107) | compare solo se compilato il campo “Richiesta integrazione” |
| 83 | PM/Permessi | Iter Autorizzativo | Invio integrazione | DATE (gg/mm/aaaa) | F075 | INVIO VERBALE DI SOPRALLUOGO | BASSA | Candidato lessicale `INVIO VERBALE DI SOPRALLUOGO`; associazione non attestata (riga 54; score 0.85) | compare solo se compilato il campo “Richiesta integrazione” |
| 84 | PM/Permessi | Iter Autorizzativo | Forecast Parere Arpa | DATE (gg/mm/aaaa) | F076 | FORECAST | BASSA | Candidato lessicale `FORECAST`; associazione non attestata (riga 53; score 0.90); Campo logico del gruppo ARPA ripetibile; le occorrenze successive riusano lo stesso schema. |  |
| 85 | PM/Permessi | Iter Autorizzativo | Parere Arpa | DATE (gg/mm/aaaa) | F077 | PARERE ARPA | ALTA | Campo Universale esatto (riga 108); Campo logico del gruppo ARPA ripetibile; le occorrenze successive riusano lo stesso schema. |  |
| 86 | PM/Permessi | Iter Autorizzativo | Esito parere Arpa | menù a tendina | F078 | Esito Enti (ARPA / Soprintendenza) | MEDIA | Il Campo Universale include esplicitamente ARPA tra gli esiti degli enti; è più generale del solo parere ARPA.; Campo logico del gruppo ARPA ripetibile; le occorrenze successive riusano lo stesso schema. | compare solo se compilato il campo `Parere Arpa` |
| 87 | PM/Permessi | Iter Autorizzativo | Ripresentazione Pratica | DATE (gg/mm/aaaa) | F079 | Pratica Sismica | BASSA | Candidato lessicale `Pratica Sismica`; associazione non attestata (riga 87; score 0.85); Apre una nuova occorrenza del gruppo ARPA; non crea una seconda famiglia di campi.; Apre una nuova occorrenza del gruppo ARPA; non crea una seconda famiglia di campi. | compare se `Esito parere Arpa = Negativo` |
| 88 | PM/Permessi | Iter Autorizzativo | Nome Ente | campo libero | F080 | Nome sito Vodafone | BASSA | Voce Ente derivata dalla tabella Vincoli; può essere generata automaticamente dal vincolo presente. Per le voci configurabili resta ammesso `Altro` con valore manuale sulla singola pratica. | compare/si crea quando il Vincolo richiede una voce Ente |
| 89 | PM/Permessi | Iter Autorizzativo | Forecast Ottenimento “Nome ente” | DATE (gg/mm/aaaa) | F081 | FORECAST | BASSA | Candidato lessicale `FORECAST`; associazione non attestata (riga 53; score 0.90) | compare solo se “Vincoli” è compilato |
| 90 | PM/Permessi | Iter Autorizzativo | Ottenimento “Nome ente” | DATE (gg/mm/aaaa) | F082 | Ottenimento Enti / Permessi | MEDIA | Il Campo Universale rappresenta l’ottenimento da enti/permessi; il documento istanzia dinamicamente il singolo ente. | compare solo se compilato il campo “Nome Ente” |
| 91 | PM/Permessi | Iter Autorizzativo | Esito parere “nome ente” | menù a tendina | F083 | Esito Enti (ARPA / Soprintendenza) | MEDIA | Il documento registra l’esito del singolo ente; il Campo Universale aggrega gli esiti degli enti. | compare solo se compilato il campo “Nome Ente” |
| 92 | PM/Permessi | Iter Autorizzativo | Data Autorizzazione finale | DATE (gg/mm/aaaa) | F084 | DATA | BASSA | Candidato lessicale `DATA`; associazione non attestata (riga 424; score 0.90); Data distinta da `Ottenimento Permessi`. |  |
| 93 | PM/Permessi | Iter Autorizzativo | DATA SCADENZA PERMESSI |  | F085 | DATA SCADENZA PERMESSI | ALTA | Campo Universale esatto (riga 73) |  |
| 94 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Geologica | menù a tendina | F086 | ASSEGNAZIONE GEOLOGICA | BASSA | Flag informativo; nessuna condizione di visibilità del blocco Geologica. |  |
| 95 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Assegnazione Geologica | DATE (gg/mm/aaaa) | F087 | ASSEGNAZIONE GEOLOGICA | ALTA | Campo Universale esatto (riga 143) |  |
| 96 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Forecast Geologica | DATE (gg/mm/aaaa) | F088 | FORECAST | BASSA | Candidato lessicale `FORECAST`; associazione non attestata (riga 53; score 0.90) | Forecast Geologica = Assegnazione Geologica + 15 giorni di calendario |
| 97 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Arrivo Geologica | DATE (gg/mm/aaaa) | F089 | ARRIVO GEOLOGICA | ALTA | Campo Universale esatto (riga 144) |  |
| 98 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Assegnazione UT | DATE (gg/mm/aaaa) | F090 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 99 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Note Assegnazione UT | campo libero | F091 | Note | MEDIA | Normalizzazione operativa verso `Note` (riga 44) |  |
| 100 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | PE | menù a tendina | F092 | PE | ALTA | Campo Universale esatto (riga 365) |  |
| 101 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Assegnazione PE | DATE (gg/mm/aaaa) | F093 | ASSEGNAZIONE PE | ALTA | Campo Universale esatto (riga 52) | compare solo se PE = SI |
| 102 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Note Assegnazione PE | campo libero | F094 | Note | MEDIA | Normalizzazione operativa verso `Note` (riga 44) | compare solo se PE = SI |
| 103 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Forecast PE | DATE (gg/mm/aaaa) | F140 | FORECAST PE | ALTA | Pop-up UT+PE; mirror di `Forecast PE` della sezione operativa. |  |
| 104 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Forecast UT | DATE (gg/mm/aaaa) | F126 | FORECAST | MEDIA | Pop-up UT+PE; mirror di `Forecast UT` della sezione operativa. |  |
| 105 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Incarico PE | DATE (gg/mm/aaaa) | F141 | ASSEGNAZIONE PE | MEDIA | Pop-up UT+PE; mirror di `Incarico PE` della sezione operativa. |  |
| 106 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | PE incaricato da | menù a tendina | F143 | Assegnatore attivita | MEDIA | Pop-up UT+PE; mirror di `PE incaricato da` della sezione operativa. |  |
| 107 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Invio PE | DATE (gg/mm/aaaa) | F149 | Consegna / Invio PE | ALTA | Pop-up UT+PE; mirror di `Invio PE` della sezione operativa. |  |
| 108 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Incarico VS/AS | DATE (gg/mm/aaaa) | F127 | ASSEGNAZIONE AS/VS | MEDIA | Pop-up UT+PE; mirror di `Incarico VS/AS` della sezione operativa. |  |
| 109 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Fornitore UT | menù a tendina che si popola volta per volta | F130 | Fornitore / Impresa | MEDIA | Pop-up UT+PE; mirror di `Fornitore UT` della sezione operativa. |  |
| 110 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Tipologia attività UT | menù a tendina | F131 | Stato Attività | BASSA | Pop-up UT+PE; mirror di `Tipologia attività UT` della sezione operativa. |  |
| 111 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Invio AS/VS | DATE (gg/mm/aaaa) | F135 | INVIO AS/VS | ALTA | Pop-up UT+PE; mirror di `Invio AS/VS` della sezione operativa. | sola visualizzazione |
| 112 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | INVIO SCHEDA RICHIESTA PALO | DATE (gg/mm/aaaa) | F095 | INVIO SCHEDA RICHIESTA PALO | ALTA | Campo Universale esatto (riga 145) | compare solo se Tipologia sito = Raw Land |
| 113 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | SCHEDA SCARICHI ALLA BASE DEL PALO | DATE (gg/mm/aaaa) | F096 | SCHEDA SCARICHI ALLA BASE DEL PALO | ALTA | Campo Universale esatto (riga 146) | compare solo se Tipologia sito = Raw Land |
| 114 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | APPROVAZIONE PE | DATE (gg/mm/aaaa) | F097 | APPROVAZIONE PE | ALTA | Campo Universale esatto (riga 189) |  |
| 115 | PM/Permessi | Fatturazione | Offerta Inviata |  | F098 | DA VERIFICARE | BASSA | Nessuna associazione sufficientemente supportata (best score 0.77) |  |
| 116 | PM/Permessi | Fatturazione | Invio Offerta | DATE (gg/mm/aaaa) | F099 | DA VERIFICARE | BASSA | Nuovo campo presente nel documento operativo; associazione canonica da verificare |  |
| 117 | PM/Permessi | Fatturazione | Numero Offerta | libero | F100 | N.P. | BASSA | Candidato lessicale `N.P.`; associazione non attestata (riga 389; score 0.85) |  |
| 118 | PM/Permessi | Fatturazione | Note Offerta | libero | F101 | Note | BASSA | Candidato lessicale `Note`; associazione non attestata (riga 44; score 0.90) |  |
| 119 | PM/Permessi | Fatturazione | ODA | campo varchar 50 | F102 | ODA | ALTA | Campo Universale esatto (riga 43) |  |
| 120 | PM/Permessi | Fatturazione | Note ODA | campo libero | F103 | ODA | BASSA | Candidato lessicale `ODA`; associazione non attestata (riga 43; score 0.90) |  |
| 121 | PM/Permessi | Fatturazione | Fatturabile |  | F104 | FATTURABILE | ALTA | Occorrenza sorgente mantenuta per tracciabilità; in UI usare un solo campo trasversale `Fatturabile` con la regola canonica definita sopra. |  |
| 122 | PM/Permessi | Fatturazione | Fatturato |  | F105 | DA VERIFICARE | BASSA | Occorrenza sorgente mantenuta per tracciabilità; in UI usare un solo campo trasversale `Fatturato`, valorizzato solo manualmente. |  |
| 123 | PM/Permessi | Fatturazione | WCN | menù a tendina | F106 | DA VERIFICARE | BASSA | Nuovo campo presente nel documento operativo; associazione canonica da verificare | compare solo se Committente= CONSORZIO (ERICSSON) |
| 124 | PM/Permessi | Fatturazione | CDMS | menù a tendina | F107 | CDMS | ALTA | Campo Universale esatto (riga 427) | compare solo se Committente= Cellnex |
| 125 | PM/Permessi | Fatturazione | Invio CDMS | DATE (gg/mm/aaaa) | F108 | CDMS INVIATO | MEDIA | Il Campo Universale registra lo stato/evento di CDMS inviato; il documento usa la data di invio. | compare solo se Committente=Cellnex; alert 1 settimana dopo la data indicata, ripetuto 1 volta a settimana fino a quando il campo EM (data) non viene compilato |
| 126 | PM/Permessi | Fatturazione | EM | menù a tendina | F111 | EM | ALTA | Campo Universale esatto (riga 418) |  |
| 127 | PM/Permessi | Fatturazione | Numero EM | libero | F110 | EM | BASSA | Candidato lessicale `EM`; associazione non attestata (riga 418; score 0.90) |  |
| 128 | PM/Permessi | Fatturazione | EM | DATE (gg/mm/aaaa) | F109 | EM | ALTA | Campo Universale esatto (riga 418) |  |
| 129 | PM/Permessi | Fatturazione | AGORA’ |  | F112 | AGORA | ALTA | Campo Universale esatto (riga 423) | compare solo se Committente = CELLNEX |
| 130 | AIE | Fase AIE | Assegnazione AIE | DATE (gg/mm/aaaa) | F056 | ASSEGNAZIONE PE | BASSA | Sola visualizzazione; ereditato da PM/Permessi. Mirror di `Assegnazione AIE`. Candidato lessicale `ASSEGNAZIONE PE`; associazione non attestata (riga 52; score 0.90); La sezione Fase AIE è visibile al gruppo AIE dopo `Assegna`, indipendentemente dal flag AIE.; La sezione Fase AIE è visibile al gruppo AIE dopo `Assegna`, indipendentemente dal flag AIE. |  |
| 131 | AIE | Fase AIE | Forecast AIE | DATE (gg/mm/aaaa) | F057 | FORECAST AIE | ALTA | Sola visualizzazione; mirror di `Forecast AIE` master PM/Permessi; stesso `id_flusso`. | compare solo se AIE=SI; sola visualizzazione |
| 132 | AIE | Fase AIE | Tecnico Misure di fondo | menù a tendina che si popola volta per volta | F113 | N° MISURE RICH... | BASSA | Candidato lessicale `N° MISURE RICH...`; associazione non attestata (riga 440; score 0.85) | non compare se Regione = Piemonte |
| 133 | AIE | Fase AIE | Stato misure di fondo | menù a tendina | F114 | Stato Attività | BASSA | Candidato lessicale `Stato Attività`; associazione non attestata (riga 9; score 0.85) | non compare se Regione = Piemonte; Valori: IN ESECUZIONE, OK, STAND BY |
| 134 | AIE | Fase AIE | Tecnico AIE | menù a tendina che si popola volta per volta | F115 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta il tecnico/progettista; il documento lo specializza al team AIE. |  |
| 135 | AIE | Fase AIE | Stato assegnazione tecnico AIE | menù a tendina | F116 | Stato Attività | BASSA | Candidato lessicale `Stato Attività`; associazione non attestata (riga 9; score 0.85) |  |
| 136 | AIE | Fase AIE | Responsabile interno AIE | menù a tendina | F117 | OK AIE | BASSA | Candidato lessicale `OK AIE`; associazione non attestata (riga 20; score 0.85) |  |
| 137 | AIE | Fase AIE | Stato AIE | menù a tendina | F118 | Stato Attività | BASSA | Candidato lessicale `Stato Attività`; associazione non attestata (riga 9; score 0.85) |  |
| 138 | AIE | Fase AIE | Invio CEM | DATE (gg/mm/aaaa) | F119 | DA VERIFICARE | BASSA | Master operativo AIE; `id_flusso` consolidato. Nessuna associazione sufficientemente supportata (best score 0.90) |  |
| 139 | AIE | Fase AIE | Fine attività AIE | DATE (gg/mm/aaaa) | F120 | OK AIE | BASSA | Candidato lessicale `OK AIE`; associazione non attestata (riga 20; score 0.85) |  |
| 140 | AIE | Fase AIE | Riduzione | DATE (gg/mm/aaaa) | F121 | RIDUZIONI | ALTA | Master operativo AIE; unica occorrenza modificabile per questo dato. Corrispondenza diretta singolare/plurale con il Campo Universale. |  |
| 141 | AIE | Fase AIE | Approvazione Riduzione | DATE (gg/mm/aaaa) | F122 | OK RIDUZIONI | MEDIA | Master operativo AIE; unica occorrenza modificabile per questo dato. L’approvazione della riduzione è semanticamente coerente con `OK RIDUZIONI`, ma la label canonica esprime l’esito più che l’evento. |  |
| 142 | AIE | Fase AIE | Invio AIE | DATE (gg/mm/aaaa) | F123 | AIE INVIO | MEDIA | Master operativo AIE; unica occorrenza modificabile per questo dato. Somiglianza terminologica molto forte; da confermare (riga 166; score 0.95) |  |
| 143 | AIE | Fase AIE | Approvazione AIE | DATE (gg/mm/aaaa) | F124 | OK AIE | MEDIA | Master operativo AIE; unica occorrenza modificabile per questo dato. L’approvazione AIE è coerente con il Campo Universale `OK AIE`; differenza tra evento di approvazione ed esito. |  |
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
| 154 | UT+PE | UT | Costo UT | campo numerico | F133 | Richiesta analisi UT | BASSA | Candidato lessicale `Richiesta analisi UT`; associazione non attestata (riga 98; score 0.85); Nota informativa: si riferisce sempre al pagamento di un esterno, non descrive un costo interno; distinto da Costo PE. Nessun comportamento applicativo. |  |
| 155 | UT+PE | UT | Fine attività UT | DATE (gg/mm/aaaa) | F134 | Week effettiva chiusura attivita | BASSA | Candidato lessicale `Week effettiva chiusura attivita`; associazione non attestata (riga 32; score 0.85) |  |
| 156 | UT+PE | UT | Invio AS/VS | DATE (gg/mm/aaaa) | F135 | INVIO AS/VS | ALTA | Campo Universale esatto (riga 55) |  |
| 157 | UT+PE | UT | Forecast Invio Caratterizzazione | DATE (gg/mm/aaaa) | F136 | FORECAST | BASSA | Candidato lessicale `FORECAST`; associazione non attestata (riga 53; score 0.90) |  |
| 158 | UT+PE | UT | Tecnico Caratterizzazione | Menù a tendina | F137 | Progettista / Tecnico | MEDIA | Specializzazione operativa del tecnico/progettista per la caratterizzazione. |  |
| 159 | UT+PE | UT | Fornitore Caratterizzazione | menù a tendina | F138 | Fornitore / Impresa | MEDIA | Specializzazione operativa del fornitore per la caratterizzazione. |  |
| 160 | UT+PE | UT | Invio Report Caratterizzazione | DATE (gg/mm/aaaa) | F139 | CARATTERIZZAZIONE | BASSA | Candidato lessicale `CARATTERIZZAZIONE`; associazione non attestata (riga 169; score 0.90) |  |
| 161 | UT+PE | PE | Assegnazione Geologica | DATE (gg/mm/aaaa) | F087 | ASSEGNAZIONE GEOLOGICA | ALTA | Pop-up PM/Permessi; mirror di `Assegnazione Geologica` compilato da PM. | sola visualizzazione |
| 162 | UT+PE | PE | Forecast Geologica | DATE (gg/mm/aaaa) | F088 | FORECAST | BASSA | Pop-up PM/Permessi; mirror di `Forecast Geologica` compilato da PM. | Forecast Geologica = Assegnazione Geologica + 15 giorni di calendario; sola visualizzazione |
| 163 | UT+PE | PE | Arrivo Geologica | DATE (gg/mm/aaaa) | F089 | ARRIVO GEOLOGICA | ALTA | Pop-up PM/Permessi; mirror di `Arrivo Geologica` compilato da PM. | sola visualizzazione |
| 164 | UT+PE | PE | Assegnazione PE | DATE (gg/mm/aaaa) | F093 | ASSEGNAZIONE PE | ALTA | Sola visualizzazione; compilato da PM. Mirror di `Assegnazione PE`. | compare solo se PE = SI; sola visualizzazione |
| 165 | UT+PE | PE | Note Assegnazione PE | campo libero | F094 | Note | MEDIA | Sola visualizzazione; compilato da PM. Mirror di `Note Assegnazione PE`. | compare solo se PE = SI; sola visualizzazione |
| 166 | UT+PE | PE | Forecast PE | DATE (gg/mm/aaaa) | F140 | FORECAST PE | ALTA | Campo Universale esatto (riga 171) |  |
| 167 | UT+PE | PE | Incarico PE | DATE (gg/mm/aaaa) | F141 | ASSEGNAZIONE PE | MEDIA | La data di incarico PE è coerente con il Campo Universale `ASSEGNAZIONE PE`, pur con terminologia diversa. | di base viene inserita la data del giorno |
| 168 | UT+PE | PE | Tipologia attività PE | menù a tendina | F142 | DA VERIFICARE | BASSA | Compilazione automatica: se `Progetto` esiste nel template ed è valorizzato, copia il valore di `Progetto`; se `Progetto` è vuoto o non esiste nel template, copia `Incarico / Lavorazione`. Non è `Stato attività`. |  |
| 169 | UT+PE | PE | PE incaricato da | menù a tendina | F143 | Assegnatore attivita | MEDIA | Il campo identifica chi ha effettuato l’incarico PE; corrisponde al concetto di assegnatore. |  |
| 170 | UT+PE | PE | Tecnico PE | menù a tendina che si popola volta per volta | F144 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta il tecnico/progettista; il documento lo specializza al team PE. | possibilità di inserire valore “nessuno”; possibilità di inserire più tecnici |
| 171 | UT+PE | PE | Fornitore PE | menù a tendina che si popola volta per volta | F145 | Fornitore / Impresa | MEDIA | Il Campo Universale rappresenta il fornitore/impresa; il documento lo specializza al team PE. | possibilità di inserire valore “nessuno” |
| 172 | UT+PE | PE | Importo PE | campo numerico | F146 | IMPORTO | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 156; score 0.95) |  |
| 173 | UT+PE | PE | Costo PE | campo numerico | F147 | PE | BASSA | Candidato lessicale `PE`; associazione non attestata (riga 365; score 0.90); Nota informativa: utile solo se collegato con G7. Nessun comportamento applicativo. |  |
| 174 | UT+PE | PE | Fine attività PE | DATE (gg/mm/aaaa) | F148 | PE | BASSA | Candidato lessicale `PE`; associazione non attestata (riga 365; score 0.90) |  |
| 175 | UT+PE | PE | Invio PE | DATE (gg/mm/aaaa) | F149 | Consegna / Invio PE | ALTA | Corrispondenza esplicita con il Campo Universale `Consegna / Invio PE`. |  |
| 176 | UT+PE | PE | INVIO SCHEDA RICHIESTA PALO | DATE (gg/mm/aaaa) | F095 | INVIO SCHEDA RICHIESTA PALO | ALTA | Pop-up PM/Permessi; mirror di `INVIO SCHEDA RICHIESTA PALO` compilato da PM. | compare solo se Tipologia sito = Raw Land; sola visualizzazione |
| 177 | UT+PE | PE | SCHEDA SCARICHI ALLA BASE DEL PALO | DATE (gg/mm/aaaa) | F096 | SCHEDA SCARICHI ALLA BASE DEL PALO | ALTA | Pop-up PM/Permessi; mirror di `SCHEDA SCARICHI ALLA BASE DEL PALO` compilato da PM. | compare solo se Tipologia sito = Raw Land; sola visualizzazione |
| 178 | UT+PE | PE | APPROVAZIONE PE | DATE (gg/mm/aaaa) | F097 | APPROVAZIONE PE | ALTA | Pop-up PM/Permessi; mirror di `APPROVAZIONE PE` compilato da PM. | sola visualizzazione |
| 179 | DL | Direzione Lavori | Deposito sismico | menù a tendina | F150 | DEPOSITO SISMICO | ALTA | Campo Universale esatto (riga 285); ownership DL confermata dal documento. | Valori: SI, NO |
| 180 | DL | Direzione Lavori | Forecast Deposito Sismico | DATE (gg/mm/aaaa) | F151 | FORECAST | BASSA | Candidato generico `FORECAST` (riga 53); il documento specializza il forecast al deposito sismico. |  |
| 181 | DL | Direzione Lavori | Deposito Sismico | DATE (gg/mm/aaaa) | F152 | DEPOSITO SISMICO | MEDIA | Stesso concetto canonico del deposito sismico, ma questa occorrenza registra la data dell’evento e resta distinta dal flag SI/NO. |  |
| 182 | DL | Direzione Lavori | Tecnico deposito sismico | menù a tendina | F153 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta la figura tecnica; il documento la specializza al deposito sismico. | compare solo se deposito sismico=SI |
| 183 | DL | Direzione Lavori | Direttore Lavori | menù a tendina che si popola volta per volta | F154 | DL | ALTA | Corrispondenza diretta tra la figura `Direttore Lavori` e il Campo Universale `DL`. | compare solo se deposito sismico=SI |
| 184 | DL | Direzione Lavori | Collaudatore | menù a tendina che si popola volta per volta | F155 | COLLAUDATORE | ALTA | Campo Universale esatto (riga 58). | compare solo se deposito sismico=SI |
| 185 | DL | Direzione Lavori | Protocollo deposito sismico | DATE (gg/mm/aaaa) | F156 | Protocollo | BASSA | Candidato `Protocollo` (riga 18); la fonte lo specializza al deposito sismico. | compare solo se deposito sismico=SI |
| 186 | DL | Direzione Lavori | N° protocollo deposito sismico | TEXT | F157 | Protocollo | BASSA | Candidato `Protocollo` (riga 18); il campo contiene il numero, non la data di protocollazione.; Tipo testuale per ammettere barre e lettere. | compare solo se deposito sismico=SI |
| 187 | DL | Direzione Lavori | N° sismica | TEXT | F158 | Note sismica | BASSA | Candidato già usato negli artifact precedenti; nessuna corrispondenza diretta sufficientemente forte nel mapping.; Tipo testuale per ammettere barre e lettere. | compare solo se deposito sismico=SI |
| 188 | DL | Direzione Lavori | Forecast CIL | DATE (gg/mm/aaaa) | F159 | FORECAST | BASSA | Candidato generico `FORECAST` (riga 53); il documento specializza il forecast alla CIL. |  |
| 189 | DL | Direzione Lavori | Data IL | DATE (gg/mm/aaaa) | F160 | Inizio Lavori - Effettiva | BASSA | Candidato semantico verso `Inizio Lavori - Effettiva` (riga 34); abbreviazione `IL` da validare nel mapping canonico. |  |
| 190 | DL | Direzione Lavori | Data FL | DATE (gg/mm/aaaa) | F161 | Fine Lavori - Strutturale | BASSA | Candidato semantico verso `Fine Lavori - Strutturale` (riga 35); abbreviazione `FL` da validare nel mapping canonico. |  |

## Riepilogo

- Campi/occorrenze censiti: **190**
- Campi logici / `id_flusso`: **161** (`F001-F161`)
- Confidenza ALTA: **67**
- Confidenza MEDIA: **47**
- Confidenza BASSA: **76**

Le righe `BASSA` costituiscono la coda di review semantica del mapping e **non** mettono in discussione l'autorità operativa del campo o della sua collocazione in questo MD.
