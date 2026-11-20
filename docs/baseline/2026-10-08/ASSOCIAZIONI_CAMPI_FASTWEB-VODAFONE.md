# Tabella decisionale completa — FASTWEB-VODAFONE

## Scopo

Riferimento esterno della guida `GUIDA_RISTRUTTURAZIONE_DASHBOARD_PRACTICEHUB_v8.md`. Questo file è la **fonte primaria e canonica per l'implementazione del template cliente**: inventario, team, sezione, ordine operativo, master/mirror, condizioni di UI e `id_flusso` devono essere letti da qui. I documenti `Organizzazione Campi - <CLIENTE>` restano fonti operative storiche e di tracciabilità del confronto con i team; se divergono da questo MD, **prevale questo MD**. Il foglio `Mapping_Dati_Completo` resta una fonte secondaria esclusivamente semantica.

**Regola di precedenza:** per il cliente prevale questo MD sui documenti sorgente e sul mapping. La Guida contiene le regole trasversali comuni; questo MD ne costituisce l'applicazione cliente-specifica. Le decisioni consolidate fino all'**8 ottobre 2026** sono state incorporate direttamente nel presente file, quindi non è necessario riconciliare a runtime note o versioni precedenti.

**Confidenza:** `ALTA` = equivalenza diretta/attestata; `MEDIA` = normalizzazione semantica forte ma non perfettamente letterale; `BASSA` = candidato da validare manualmente.

**Fonte operativa storica / di derivazione:** `Organizzazione Campi - FASTWEB-VODAFONE.txt`  
**Fonte mapping:** `Tabella_Mapping_Completa+SchemaDB` → `Mapping_Dati_Completo`

**dtype:** riportato esclusivamente quando esplicitato nel documento operativo originale; in assenza di indicazione la cella resta vuota.

**id_flusso:** progressivo `Fxxx` assegnato secondo l'ordine operativo dei campi. Le occorrenze di sola visualizzazione o presenti nei pop-up non anticipano il flusso del team proprietario: ereditano l'ID della corrispondente occorrenza operativa master.

## Regole normative consolidate al 08/10/2026

- Le condizioni riportate in tabella sono **condizioni di interfaccia**: nascondono/mostrano il campo ma non disattivano master, automazioni o alert. Se una condizione diventa falsa, il valore già presente resta salvato e riappare quando la condizione torna vera. I valori dei campi nascosti per condizione restano memorizzati, sono inclusi nell'export e continuano a concorrere ai KPI; la sola visibilità UI non li azzera né li esclude. *Dal 06/11/2026 (D-209): un alert il cui campo è nascosto da una condizione non si apre e, se aperto, si chiude.*
- **Dal 06/11/2026 (D-207, ripristino D-200)** la visibilità di sezioni e campi guidata da `Incarico / Lavorazione` è di nuovo attiva: le regole sono dati in `frontend/src/data/template-incarico.json` (fonte: Word `Organizzazione Campi` in `DOCS/organizzazione`), applicate dal compilatore oltre alle condizioni di questa tabella; con Incarico vuoto, `Altro` o un valore nuovo tutto resta visibile. *Testo precedente, superato: "Tutte le condizioni basate su `Incarico / Lavorazione` … sono eliminate."* Restano solo le condizioni basate su altri dati esplicitamente consolidate (es. AIE, Deposito sismico, Regione, Revit, MW, CARATTERIZZAZIONE, Committente, Tipologia sito, PSC, All. 18 e presenza di campi padre).
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
| 4 | PM/Permessi | Core Anagrafica Sito | Committente | TEXT | F004 | COMMITTENTE | ALTA | Campo Universale esatto (riga 131); Obbligatorio alla creazione; eventuale valore precompilato resta modificabile. |  |
| 5 | PM/Permessi | Core Anagrafica Sito | Cliente Finale | TEXT | F005 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato; Obbligatorio alla creazione. |  |
| 6 | PM/Permessi | Core Anagrafica Sito | Regione | menù a tendina | F006 | Regione | ALTA | Campo Universale esatto (riga 6) |  |
| 7 | PM/Permessi | Core Anagrafica Sito | Provincia | menù a tendina | F007 | Provincia | ALTA | Campo Universale esatto (riga 7) |  |
| 8 | PM/Permessi | Core Anagrafica Sito | Comune | menù a tendina | F008 | Comune | ALTA | Campo Universale esatto (riga 8) |  |
| 9 | PM/Permessi | Core Anagrafica Sito | Indirizzo | TEXT | F009 | Indirizzo Fisico | ALTA | Nome sorgente esatto nel mapping (riga 27) |  |
| 10 | PM/Permessi | Core Anagrafica Sito | Tipologia sito | menù a tendina | F010 | Tipologia Sito | ALTA | Campo Universale esatto (riga 42) |  |
| 11 | PM/Permessi | Core Anagrafica Sito | Tipologia Struttura | menù a tendina | F011 | Tipologia Apparati / Infrastruttura | MEDIA | Il Campo Universale copre la stessa famiglia infrastrutturale, ma è più ampio della sola struttura del sito. |  |
| 12 | PM/Permessi | Core Anagrafica Sito | Area Apparati | menù a tendina | F012 | Tipologia Apparati / Infrastruttura | MEDIA | Il Campo Universale comprende anche la componente apparati; associazione coerente ma non perfettamente 1:1. |  |
| 13 | PM/Permessi | Core Anagrafica Sito | Incarico / Lavorazione | menù a tendina a scelta singola | F013 | Incarico / Lavorazione | ALTA | Lista configurabile; scelta singola consolidata per tutti i gestori. |  |
| 14 | PM/Permessi | Core Anagrafica Sito | Stato ODA | menù a tendina | F014 | ODA | BASSA | Dominio consolidato: `DA RICHIEDERE`, `RICHIESTI`, `PRESENTI`. `FATTURATO` non appartiene a Stato ODA. |  |
| 15 | PM/Permessi | Core Anagrafica Sito | ODA | campo varchar 50 | F015 | ODA | ALTA | Campo Universale esatto (riga 43). | possibilità di aggiungere più ODA |
| 16 | PM/Permessi | Core Anagrafica Sito | Proprietà / Host | menù a tendina | F016 | Proprietà / Host | ALTA | Campo Universale esatto (riga 12) |  |
| 17 | PM/Permessi | Core Anagrafica Sito | SR INWIT | campo varchar | F017 | SR INWI | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 90; score 0.93) | compare solo se Proprietà / Host = Inwit |
| 18 | PM/Permessi | Core Anagrafica Sito | Referente Fastweb | menù a tendina che si popola volta per volta | F018 | Referente | ALTA | Specializzazione cliente-specifica del Campo Universale `Referente`. |  |
| 19 | PM/Permessi | Core Anagrafica Sito | RAN Fastweb | menù a tendina che si popola volta per volta | F019 | DA VERIFICARE | BASSA | Nessuna associazione sufficientemente supportata (best score 0.64) |  |
| 20 | PM/Permessi | Dati Anagrafici Secondari | Gestore Tenant | menù a tendina con tutti i clienti | F020 | GESTORE | MEDIA | Il Campo Universale `GESTORE` supporta il concetto; il documento lo specializza al tenant. |  |
| 21 | PM/Permessi | Dati Anagrafici Secondari | Codice sito Tenant | TEXT | F021 | Codici Sito Terzi | MEDIA | Il codice del tenant è un identificativo di sito terzo rispetto al sito principale. | appare solo se viene inserito un valore nel campo “Gestore Tenant” |
| 22 | PM/Permessi | Dati Anagrafici Secondari | Nome sito Tenant | TEXT | F022 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato | appare solo se viene inserito un valore nel campo “Gestore Tenant” |
| 23 | PM/Permessi | Dati Anagrafici Secondari | Latitudine | DECIMAL | F023 | DA VERIFICARE | BASSA | Derivato dal campo sorgente `Coordinate`; WGS84, latitudine decimale. |  |
| 24 | PM/Permessi | Dati Anagrafici Secondari | Longitudine | DECIMAL | F024 | DA VERIFICARE | BASSA | Derivato dal campo sorgente `Coordinate`; WGS84, longitudine decimale. |  |
| 25 | PM/Permessi | Fase Preliminare | Data assegnazione | DATE (gg/mm/aaaa) | F025 | Data Assegnazione | ALTA | Campo Universale esatto (riga 10) |  |
| 26 | PM/Permessi | Fase Preliminare | Forecast Protocollo | DATE (gg/mm/aaaa) | F026 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 27 | PM/Permessi | Fase Preliminare | Data sopralluogo | DATE (gg/mm/aaaa) | F027 | Data Sopralluogo | ALTA | Campo Universale esatto (riga 11) |  |
| 28 | PM/Permessi | Fase Preliminare | Invio verbale di sopralluogo | DATE (gg/mm/aaaa) | F028 | INVIO VERBALE DI SOPRALLUOGO | ALTA | Campo Universale esatto (riga 54) |  |
| 29 | PM/Permessi | Fase Preliminare | Invio PDM | DATE (gg/mm/aaaa) | F029 | Invio PDM / Bozza PM | ALTA | Normalizzazione operativa verso `Invio PDM / Bozza PM` (riga 21) |  |
| 30 | PM/Permessi | Fase Preliminare | Applicabilità | menù a tendina | F030 | applicabilità | ALTA | Campo Universale esatto (riga 114) |  |
| 31 | PM/Permessi | Fase Preliminare | Invio applicabilità | DATE (gg/mm/aaaa) | F031 | applicabilità | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 114; score 0.95) |  |
| 32 | PM/Permessi | Fase Preliminare | Vincoli | menù a tendina | F032 | Vincoli | ALTA | Tabella Vincoli comune definita sopra; selezione multipla. La voce Ente viene creata automaticamente quando prevista dalla riga del vincolo. |  |
| 33 | PM/Permessi | Fase Preliminare | Assegnazione UT | DATE (gg/mm/aaaa) | F033 | DA VERIFICARE | BASSA | Master PM/Permessi; alimenta il mirror UT+PE con lo stesso `id_flusso`. Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 34 | PM/Permessi | Fase Preliminare | Note Assegnazione UT | campo libero | F034 | Note | MEDIA | Master PM/Permessi; alimenta il mirror UT+PE con lo stesso `id_flusso`. Normalizzazione operativa verso `Note` (riga 44) |  |
| 35 | PM/Permessi | Fase Preliminare | Invio AS/VS | DATE (gg/mm/aaaa) | F072 | INVIO AS/VS | ALTA | Master operativo PM/Permessi (D-207, risposta Q2 del 06/11/2026): lo compila sempre il PM; l'UT lo vede in sola lettura. Visibilità per Incarico / Lavorazione in `template-incarico.json`. |  |
| 36 | PM/Permessi | Pacchetto Permessi | Progettista / Tecnico | menù a tendina che si popola volta per volta | F035 | Progettista / Tecnico | ALTA | Campo Universale esatto (riga 13) |  |
| 37 | PM/Permessi | Pacchetto Permessi | Approvazione PDM | DATE (gg/mm/aaaa) | F036 | Approvazione PDM / PM | ALTA | Normalizzazione operativa verso `Approvazione PDM / PM` (riga 22) |  |
| 38 | PM/Permessi | Pacchetto Permessi | AIE | menù a tendina | F037 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 39 | PM/Permessi | Pacchetto Permessi | Ricezione Scheda Tecnica | DATE (gg/mm/aaaa) | F038 | SCHEDA TECNICA | MEDIA | Il Campo Universale identifica la scheda tecnica; il documento registra specificamente la data/evento di ricezione. | compare solo se AIE=SI |
| 40 | PM/Permessi | Pacchetto Permessi | Assegnazione AIE | DATE (gg/mm/aaaa) | F039 | ASSEGNAZIONE PE | BASSA | Master operativo; compilato da PM/Permessi. Candidato lessicale `ASSEGNAZIONE PE`; associazione non attestata (riga 52; score 0.90) | compare solo se AIE=SI |
| 41 | PM/Permessi | Pacchetto Permessi | Forecast AIE | DATE (gg/mm/aaaa) | F040 | FORECAST AIE | ALTA | Master operativo PM/Permessi; alimenta il mirror AIE con lo stesso `id_flusso`. | compare solo se AIE=SI; Alert 2 gg prima; si risolve quando viene compilato il campo “Approvazione AIE” |
| 42 | PM/Permessi | Pacchetto Permessi | Riduzione | DATE (gg/mm/aaaa) | F041 | RIDUZIONI | ALTA | Mirror in sola lettura del master AIE; stesso `id_flusso`. Corrispondenza diretta singolare/plurale con il Campo Universale. | compare solo se AIE=SI; sola visualizzazione |
| 43 | PM/Permessi | Pacchetto Permessi | Approvazione Riduzione | DATE (gg/mm/aaaa) | F042 | OK RIDUZIONI | MEDIA | Mirror in sola lettura del master AIE; stesso `id_flusso`. L’approvazione della riduzione è semanticamente coerente con `OK RIDUZIONI`, ma la label canonica esprime l’esito più che l’evento. | compare solo se AIE=SI; sola visualizzazione |
| 44 | PM/Permessi | Pacchetto Permessi | Invio AIE | DATE (gg/mm/aaaa) | F043 | AIE INVIO | MEDIA | Mirror in sola lettura del master AIE; stesso `id_flusso`. Somiglianza terminologica molto forte; da confermare (riga 166; score 0.95) | compare solo se AIE=SI; sola visualizzazione |
| 45 | PM/Permessi | Pacchetto Permessi | Approvazione AIE | DATE (gg/mm/aaaa) | F044 | OK AIE | MEDIA | Mirror in sola lettura del master AIE; stesso `id_flusso`. L’approvazione AIE è coerente con il Campo Universale `OK AIE`; differenza tra evento di approvazione ed esito. | compare solo se AIE=SI; sola visualizzazione |
| 46 | PM/Permessi | Pacchetto Permessi | Note Pacchetto Permessi | campo libero | F045 | Note | MEDIA | Normalizzazione operativa verso `Note` (riga 44) |  |
| 47 | PM/Permessi | Pacchetto Permessi | Invio Pacchetto Permessi | DATE (gg/mm/aaaa) | F046 | Invio Pacchetto Permessi | ALTA | Campo Universale esatto (riga 19) |  |
| 48 | PM/Permessi | Pacchetto Permessi | Forecast Ottenimento Permessi | DATE (gg/mm/aaaa) | F047 | FORECAST | BASSA | Nuovo campo presente nel documento operativo; candidato lessicale `FORECAST`, associazione canonica da verificare | Forecast manuale; non applicare automaticamente la formula Protocollo + 67 giorni. |
| 49 | PM/Permessi | Pacchetto Permessi | Ottenimento Permessi | DATE (gg/mm/aaaa) | F048 | Ottenimento Enti / Permessi | ALTA | Nome sorgente coerente con il Campo Universale `Ottenimento Enti / Permessi` |  |
| 50 | PM/Permessi | Iter Autorizzativo | Protocollo | DATE (gg/mm/aaaa) | F049 | Protocollo | ALTA | Campo Universale esatto (riga 18) |  |
| 51 | PM/Permessi | Iter Autorizzativo | Forecast Parere Arpa | DATE (gg/mm/aaaa) | F050 | FORECAST | BASSA | Nuovo campo presente nel documento operativo; dtype DATE confermato dall’utente; associazione canonica da verificare; Campo logico del gruppo ARPA ripetibile; le occorrenze successive riusano lo stesso schema. |  |
| 52 | PM/Permessi | Iter Autorizzativo | Parere Arpa | DATE (gg/mm/aaaa) | F051 | PARERE ARPA | ALTA | Campo Universale esatto (riga 108); Campo logico del gruppo ARPA ripetibile; le occorrenze successive riusano lo stesso schema. |  |
| 53 | PM/Permessi | Iter Autorizzativo | Esito parere Arpa | menù a tendina | F052 | Esito Enti (ARPA / Soprintendenza) | MEDIA | Il Campo Universale include esplicitamente ARPA tra gli esiti degli enti; è più generale del solo parere ARPA.; Campo logico del gruppo ARPA ripetibile; le occorrenze successive riusano lo stesso schema. | compare solo se compilato il campo `Parere Arpa` |
| 54 | PM/Permessi | Iter Autorizzativo | Ripresentazione Pratica | DATE (gg/mm/aaaa) | F053 | Pratica Sismica | BASSA | Candidato lessicale `Pratica Sismica`; associazione non attestata (riga 87; score 0.85); Apre una nuova occorrenza del gruppo ARPA; non crea una seconda famiglia di campi.; Apre una nuova occorrenza del gruppo ARPA; non crea una seconda famiglia di campi. | compare se `Esito parere Arpa = Negativo` |
| 55 | PM/Permessi | Iter Autorizzativo | Nome Ente | campo libero | F054 | Nome sito Vodafone | BASSA | Voce Ente derivata dalla tabella Vincoli; può essere generata automaticamente dal vincolo presente. Per le voci configurabili resta ammesso `Altro` con valore manuale sulla singola pratica. | compare/si crea quando il Vincolo richiede una voce Ente |
| 56 | PM/Permessi | Iter Autorizzativo | Forecast Ottenimento “Nome ente” | DATE (gg/mm/aaaa) | F055 | FORECAST | BASSA | Nuovo campo presente nel documento operativo; candidato lessicale `FORECAST`, associazione canonica da verificare |  |
| 57 | PM/Permessi | Iter Autorizzativo | Ottenimento “Nome ente” | DATE (gg/mm/aaaa) | F056 | Ottenimento Enti / Permessi | MEDIA | Il Campo Universale rappresenta l’ottenimento da enti/permessi; il documento istanzia dinamicamente il singolo ente. | compare solo se compilato il campo “Nome Ente” |
| 58 | PM/Permessi | Iter Autorizzativo | Esito parere “nome ente” | menù a tendina | F057 | Esito Enti (ARPA / Soprintendenza) | MEDIA | Il documento registra l’esito del singolo ente; il Campo Universale aggrega gli esiti degli enti. | compare solo se compilato il campo “Nome Ente” |
| 59 | PM/Permessi | Iter Autorizzativo | Scadenza permesso “Nome ente” | DATE (gg/mm/aaaa) | F058 | SCADENZA PERMESSI | MEDIA | Il Campo Universale supporta la scadenza del permesso; il documento la specializza per singolo ente. | compare solo se compilato il campo “Nome Ente” |
| 60 | PM/Permessi | Iter Autorizzativo | Data Autorizzazione finale | DATE (gg/mm/aaaa) | F059 | DATA | BASSA | Candidato lessicale `DATA`; associazione non attestata (riga 424; score 0.90); Data distinta da `Ottenimento Permessi`. |  |
| 61 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | PE | menù a tendina | F060 | PE | ALTA | Campo Universale esatto (riga 365) |  |
| 62 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Assegnazione PE | DATE (gg/mm/aaaa) | F061 | ASSEGNAZIONE PE | ALTA | Campo Universale esatto (riga 52) | compare solo se PE = SI |
| 63 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Note Assegnazione PE | campo libero | F062 | Note | MEDIA | Normalizzazione operativa verso `Note` (riga 44) | compare solo se PE = SI |
| 64 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Forecast PE | DATE (gg/mm/aaaa) | F073 | FORECAST PE | ALTA | Campo master compilato da PM; alimenta la corrispondente occorrenza UT+PE di `Forecast PE` in sola visualizzazione. | compilato da PM |
| 65 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Invio PE | DATE (gg/mm/aaaa) | F087 | Consegna / Invio PE | ALTA | Campo master compilato da PM; alimenta la corrispondente occorrenza UT+PE di `Invio PE` in sola visualizzazione. | compilato da PM |
| 66 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Invio AS/VS | DATE (gg/mm/aaaa) | F072 | INVIO AS/VS | ALTA | Pop-up UT+PE; mirror di `Invio AS/VS` della sezione operativa. | sola visualizzazione |
| 67 | AIE | Fase AIE | Assegnazione AIE | DATE (gg/mm/aaaa) | F039 | ASSEGNAZIONE PE | BASSA | Sola visualizzazione; ereditato da PM/Permessi. Mirror di `Assegnazione AIE`. Candidato lessicale `ASSEGNAZIONE PE`; associazione non attestata (riga 52; score 0.90); La sezione Fase AIE è visibile al gruppo AIE dopo `Assegna`, indipendentemente dal flag AIE.; La sezione Fase AIE è visibile al gruppo AIE dopo `Assegna`, indipendentemente dal flag AIE. |  |
| 68 | AIE | Fase AIE | Forecast AIE | DATE (gg/mm/aaaa) | F040 | FORECAST AIE | ALTA | Sola visualizzazione; mirror di `Forecast AIE` master PM/Permessi; stesso `id_flusso`. | sola visualizzazione |
| 69 | AIE | Fase AIE | Tecnico Misure di fondo | menù a tendina che si popola volta per volta | F088 | N° MISURE RICH... | BASSA | Candidato lessicale `N° MISURE RICH...`; associazione non attestata (riga 440; score 0.85) | non compare se Regione = Piemonte |
| 70 | AIE | Fase AIE | Stato misure di fondo | menù a tendina | F089 | Stato Attività | BASSA | Candidato lessicale `Stato Attività`; associazione non attestata (riga 9; score 0.85) | non compare se Regione = Piemonte; Valori: IN ESECUZIONE, OK, STAND BY |
| 71 | AIE | Fase AIE | Tecnico AIE | menù a tendina che si popola volta per volta | F090 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta il tecnico/progettista; il documento lo specializza al team AIE. |  |
| 72 | AIE | Fase AIE | Stato assegnazione tecnico AIE | menù a tendina | F091 | Stato Attività | BASSA | Candidato lessicale `Stato Attività`; associazione non attestata (riga 9; score 0.85) | Valori: OK, DA ASSEGNARE |
| 73 | AIE | Fase AIE | Responsabile interno AIE | menù a tendina | F092 | OK AIE | BASSA | Candidato lessicale `OK AIE`; associazione non attestata (riga 20; score 0.85) |  |
| 74 | AIE | Fase AIE | Stato AIE | menù a tendina | F093 | Stato Attività | BASSA | Candidato lessicale `Stato Attività`; associazione non attestata (riga 9; score 0.85) |  |
| 75 | AIE | Fase AIE | Invio CEM | DATE (gg/mm/aaaa) | F094 | DA VERIFICARE | BASSA | Master operativo AIE; `id_flusso` consolidato. |  |
| 76 | AIE | Fase AIE | Fine attività AIE | DATE (gg/mm/aaaa) | F095 | OK AIE | BASSA | Candidato lessicale `OK AIE`; associazione non attestata (riga 20; score 0.85) |  |
| 77 | AIE | Fase AIE | Riduzione | DATE (gg/mm/aaaa) | F041 | RIDUZIONI | ALTA | Master operativo AIE; unica occorrenza modificabile per questo dato. Corrispondenza diretta singolare/plurale con il Campo Universale. |  |
| 78 | AIE | Fase AIE | Approvazione Riduzione | DATE (gg/mm/aaaa) | F042 | OK RIDUZIONI | MEDIA | Master operativo AIE; unica occorrenza modificabile per questo dato. L’approvazione della riduzione è semanticamente coerente con `OK RIDUZIONI`, ma la label canonica esprime l’esito più che l’evento. |  |
| 79 | AIE | Fase AIE | Invio AIE | DATE (gg/mm/aaaa) | F043 | AIE INVIO | MEDIA | Master operativo AIE; unica occorrenza modificabile per questo dato. Somiglianza terminologica molto forte; da confermare (riga 166; score 0.95) |  |
| 80 | AIE | Fase AIE | Approvazione AIE | DATE (gg/mm/aaaa) | F044 | OK AIE | MEDIA | Master operativo AIE; unica occorrenza modificabile per questo dato. L’approvazione AIE è coerente con il Campo Universale `OK AIE`; differenza tra evento di approvazione ed esito. |  |
| 81 | AIE | Fase AIE | Note AIE | campo libero | F096 | Note | MEDIA | Normalizzazione operativa verso `Note` (riga 44) |  |
| 82 | UT+PE | UT | Assegnazione UT | DATE (gg/mm/aaaa) | F033 | DA VERIFICARE | BASSA | Sola visualizzazione; compilato da PM. Mirror di `Assegnazione UT`. |  |
| 83 | UT+PE | UT | Note Assegnazione UT | campo libero | F034 | Note | MEDIA | Sola visualizzazione; compilato da PM. Mirror di `Note Assegnazione UT`. |  |
| 84 | UT+PE | UT | Forecast UT | DATE (gg/mm/aaaa) | F063 | FORECAST | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 53; score 0.95) |  |
| 85 | UT+PE | UT | Incarico VS/AS | DATE (gg/mm/aaaa) | F064 | ASSEGNAZIONE AS/VS | MEDIA | Il campo descrive la presa in carico/assegnazione VS-AS; il Campo Universale usa la terminologia `ASSEGNAZIONE AS/VS`. | di base viene inserita la data del giorno |
| 86 | UT+PE | UT | VS/AS incaricata da | menù a tendina | F065 | Assegnatore attivita | MEDIA | Il campo identifica chi ha effettuato l’incarico; il Campo Universale `Assegnatore attivita` è coerente. |  |
| 87 | UT+PE | UT | Tecnico UT | menù a tendina che si popola volta per volta | F066 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta il tecnico/progettista; il documento lo specializza al team UT. |  |
| 88 | UT+PE | UT | Fornitore UT | menù a tendina che si popola volta per volta | F067 | Fornitore / Impresa | MEDIA | Il Campo Universale rappresenta il fornitore/impresa; il documento lo specializza al team UT. | possibilità di inserire valore “nessuno” |
| 89 | UT+PE | UT | Tipologia attività UT | menù a tendina | F068 | Stato Attività | BASSA | Candidato lessicale `Stato Attività`; associazione non attestata (riga 9; score 0.85) | Valori: VS, AS, Dimensionamento plinto, VS plinto, fattibilità, correzione PE |
| 90 | UT+PE | UT | Importo UT | campo numerico | F069 | IMPORTO | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 156; score 0.95) |  |
| 91 | UT+PE | UT | Costo UT | campo numerico | F070 | Richiesta analisi UT | BASSA | Candidato lessicale `Richiesta analisi UT`; associazione non attestata (riga 98; score 0.85); Nota informativa: si riferisce sempre al pagamento di un esterno, non descrive un costo interno; distinto da Costo PE. Nessun comportamento applicativo. |  |
| 92 | UT+PE | UT | Fine attività UT | DATE (gg/mm/aaaa) | F071 | Week effettiva chiusura attivita | BASSA | Candidato lessicale `Week effettiva chiusura attivita`; associazione non attestata (riga 32; score 0.85) |  |
| 93 | UT+PE | UT | Invio AS/VS | DATE (gg/mm/aaaa) | F072 | INVIO AS/VS | ALTA | Mirror in sola lettura del master PM/Permessi `Invio AS/VS` (D-207); stesso `id_flusso`. | sola visualizzazione |
| 94 | UT+PE | PE | Assegnazione PE | DATE (gg/mm/aaaa) | F061 | ASSEGNAZIONE PE | ALTA | Sola visualizzazione; compilato da PM. Mirror di `Assegnazione PE`. | compare solo se PE = SI; sola visualizzazione |
| 95 | UT+PE | PE | Note Assegnazione PE | campo libero | F062 | Note | MEDIA | Sola visualizzazione; compilato da PM. Mirror di `Note Assegnazione PE`. | compare solo se PE = SI; sola visualizzazione |
| 96 | UT+PE | PE | Forecast PE | DATE (gg/mm/aaaa) | F073 | FORECAST PE | ALTA | Sola visualizzazione; compilato da PM. Mirror di `Forecast PE`. | sola visualizzazione |
| 97 | UT+PE | PE | PSC | menù a tendina | F074 | PSC | ALTA | Campo Universale esatto (riga 62) |  |
| 98 | UT+PE | PE | Forecast PSC | DATE (gg/mm/aaaa) | F075 | FORECAST | BASSA | Candidato lessicale `FORECAST`; associazione non attestata (riga 53; score 0.90) | compare solo se PSC=SI. Campo manuale: nessun valore predefinito o formula automatica. |
| 99 | UT+PE | PE | Tecnico PSC | Menù a tendina | F076 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta il tecnico/progettista; il documento lo specializza all’attività PSC. |  |
| 100 | UT+PE | PE | Note PSC | campo libero | F077 | Note | BASSA | Candidato lessicale `Note`; associazione non attestata (riga 44; score 0.90) |  |
| 101 | UT+PE | PE | OK PSC | DATE (gg/mm/aaaa) | F078 | PSC | BASSA | Candidato lessicale `PSC`; associazione non attestata (riga 62; score 0.90) |  |
| 102 | UT+PE | PE | Incarico PE | DATE (gg/mm/aaaa) | F079 | ASSEGNAZIONE PE | MEDIA | La data di incarico PE è coerente con il Campo Universale `ASSEGNAZIONE PE`, pur con terminologia diversa. | di base viene inserita la data del giorno |
| 103 | UT+PE | PE | Tipologia attività PE | menù a tendina | F080 | DA VERIFICARE | BASSA | Compilazione automatica: se `Progetto` esiste nel template ed è valorizzato, copia il valore di `Progetto`; se `Progetto` è vuoto o non esiste nel template, copia `Incarico / Lavorazione`. Non è `Stato attività`. |  |
| 104 | UT+PE | PE | PE incaricato da | menù a tendina | F081 | Assegnatore attivita | MEDIA | Il campo identifica chi ha effettuato l’incarico PE; corrisponde al concetto di assegnatore. |  |
| 105 | UT+PE | PE | Tecnico PE | menù a tendina che si popola volta per volta | F082 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta il tecnico/progettista; il documento lo specializza al team PE. | possibilità di inserire valore “nessuno”; possibilità di inserire più tecnici |
| 106 | UT+PE | PE | Fornitore PE | menù a tendina che si popola volta per volta | F083 | Fornitore / Impresa | MEDIA | Il Campo Universale rappresenta il fornitore/impresa; il documento lo specializza al team PE. | possibilità di inserire valore “nessuno” |
| 107 | UT+PE | PE | Importo PE | campo numerico | F084 | IMPORTO | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 156; score 0.95) |  |
| 108 | UT+PE | PE | Costo PE | campo numerico | F085 | PE | BASSA | Candidato lessicale `PE`; associazione non attestata (riga 365; score 0.90); Nota informativa: utile solo se collegato con G7. Nessun comportamento applicativo. |  |
| 109 | UT+PE | PE | Fine attività PE | DATE (gg/mm/aaaa) | F086 | PE | BASSA | Candidato lessicale `PE`; associazione non attestata (riga 365; score 0.90) |  |
| 110 | UT+PE | PE | Invio PE | DATE (gg/mm/aaaa) | F087 | Consegna / Invio PE | ALTA | Sola visualizzazione; compilato da PM. Mirror di `Invio PE`. | sola visualizzazione |
| 111 | DL | Direzione Lavori | Deposito sismico | menù a tendina | F097 | DEPOSITO SISMICO | ALTA | Campo Universale esatto (riga 285); ownership DL confermata dal documento. | Valori: SI, NO |
| 112 | DL | Direzione Lavori | Forecast Deposito Sismico | DATE (gg/mm/aaaa) | F098 | FORECAST | BASSA | Candidato generico `FORECAST` (riga 53); il documento specializza il forecast al deposito sismico. |  |
| 113 | DL | Direzione Lavori | Deposito Sismico | DATE (gg/mm/aaaa) | F099 | DEPOSITO SISMICO | MEDIA | Stesso concetto canonico del deposito sismico, ma questa occorrenza registra la data dell’evento e resta distinta dal flag SI/NO. |  |
| 114 | DL | Direzione Lavori | Tecnico deposito sismico | menù a tendina | F100 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta la figura tecnica; il documento la specializza al deposito sismico. | compare solo se deposito sismico=SI |
| 115 | DL | Direzione Lavori | Direttore Lavori | menù a tendina che si popola volta per volta | F101 | DL | ALTA | Corrispondenza diretta tra la figura `Direttore Lavori` e il Campo Universale `DL`. | compare solo se deposito sismico=SI |
| 116 | DL | Direzione Lavori | Collaudatore | menù a tendina che si popola volta per volta | F102 | COLLAUDATORE | ALTA | Campo Universale esatto (riga 58). | compare solo se deposito sismico=SI |
| 117 | DL | Direzione Lavori | Protocollo deposito sismico | DATE (gg/mm/aaaa) | F103 | Protocollo | BASSA | Candidato `Protocollo` (riga 18); la fonte lo specializza al deposito sismico. | compare solo se deposito sismico=SI |
| 118 | DL | Direzione Lavori | N° protocollo deposito sismico | TEXT | F104 | Protocollo | BASSA | Candidato `Protocollo` (riga 18); il campo contiene il numero, non la data di protocollazione.; Tipo testuale per ammettere barre e lettere. | compare solo se deposito sismico=SI |
| 119 | DL | Direzione Lavori | N° sismica | TEXT | F105 | Note sismica | BASSA | Candidato già usato negli artifact precedenti; nessuna corrispondenza diretta sufficientemente forte nel mapping.; Tipo testuale per ammettere barre e lettere. | compare solo se deposito sismico=SI |
| 120 | DL | Direzione Lavori | Forecast CIL | DATE (gg/mm/aaaa) | F106 | FORECAST | BASSA | Candidato generico `FORECAST` (riga 53); il documento specializza il forecast alla CIL. |  |
| 121 | DL | Direzione Lavori | Data IL | DATE (gg/mm/aaaa) | F107 | Inizio Lavori - Effettiva | BASSA | Candidato semantico verso `Inizio Lavori - Effettiva` (riga 34); abbreviazione `IL` da validare nel mapping canonico. |  |
| 122 | DL | Direzione Lavori | Data FL | DATE (gg/mm/aaaa) | F108 | Fine Lavori - Strutturale | BASSA | Candidato semantico verso `Fine Lavori - Strutturale` (riga 35); abbreviazione `FL` da validare nel mapping canonico. |  |

## Riepilogo

- Campi/occorrenze censiti: **124**
- Campi logici / `id_flusso`: **108** (`F001-F108`)
- Confidenza ALTA: **43**
- Confidenza MEDIA: **39**
- Confidenza BASSA: **42**

Le righe `BASSA` costituiscono la coda di review semantica del mapping e **non** mettono in discussione l'autorità operativa del campo o della sua collocazione in questo MD.
