# Tabella decisionale completa — LEONARDO

## Scopo

Riferimento esterno della guida `GUIDA_RISTRUTTURAZIONE_DASHBOARD_PRACTICEHUB_v8.md`. Questo file è la **fonte primaria e canonica per l'implementazione del template cliente**: inventario, team, sezione, ordine operativo, master/mirror, condizioni di UI e `id_flusso` devono essere letti da qui. I documenti `Organizzazione Campi - <CLIENTE>` restano fonti operative storiche e di tracciabilità del confronto con i team; se divergono da questo MD, **prevale questo MD**. Il foglio `Mapping_Dati_Completo` resta una fonte secondaria esclusivamente semantica.

**Regola di precedenza:** per il cliente prevale questo MD sui documenti sorgente e sul mapping. La Guida contiene le regole trasversali comuni; questo MD ne costituisce l'applicazione cliente-specifica. Le decisioni consolidate fino all'**8 ottobre 2026** sono state incorporate direttamente nel presente file, quindi non è necessario riconciliare a runtime note o versioni precedenti.

**Confidenza:** `ALTA` = equivalenza diretta/attestata; `MEDIA` = normalizzazione semantica forte ma non perfettamente letterale; `BASSA` = candidato da validare manualmente.

**Fonte operativa storica / di derivazione:** `Organizzazione Campi -LEONARDO.txt`  
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
| 4 | PM/Permessi | Core Anagrafica Sito | Committente | TEXT | F004 | COMMITTENTE | ALTA | Campo consolidato il 07/10/2026; valore iniziale `Leonardo`; obbligatorio e modificabile; Obbligatorio alla creazione; eventuale valore precompilato resta modificabile. |  |
| 5 | PM/Permessi | Core Anagrafica Sito | Cliente Finale | TEXT | F005 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato; Obbligatorio alla creazione. |  |
| 6 | PM/Permessi | Core Anagrafica Sito | Regione | menù a tendina | F006 | Regione | ALTA | Campo Universale esatto (riga 6) |  |
| 7 | PM/Permessi | Core Anagrafica Sito | Provincia | menù a tendina | F007 | Provincia | ALTA | Campo Universale esatto (riga 7) |  |
| 8 | PM/Permessi | Core Anagrafica Sito | Comune | menù a tendina | F008 | Comune | ALTA | Campo Universale esatto (riga 8) |  |
| 9 | PM/Permessi | Core Anagrafica Sito | Indirizzo | TEXT | F009 | Indirizzo Fisico | ALTA | Nome sorgente esatto nel mapping (riga 27) |  |
| 10 | PM/Permessi | Core Anagrafica Sito | Tipologia sito | menù a tendina | F010 | Tipologia Sito | ALTA | Campo Universale esatto (riga 42) |  |
| 11 | PM/Permessi | Core Anagrafica Sito | Tipologia Struttura | menù a tendina | F011 | Tipologia Apparati / Infrastruttura | MEDIA | Il Campo Universale copre la stessa famiglia infrastrutturale, ma è più ampio della sola struttura del sito. |  |
| 12 | PM/Permessi | Core Anagrafica Sito | Area Apparati | menù a tendina | F012 | Tipologia Apparati / Infrastruttura | MEDIA | Il Campo Universale comprende anche la componente apparati; associazione coerente ma non perfettamente 1:1. |  |
| 13 | PM/Permessi | Core Anagrafica Sito | Incarico / Lavorazione | menù a tendina a scelta singola | F013 | Incarico / Lavorazione | ALTA | Lista configurabile; scelta singola consolidata per tutti i gestori. |  |
| 14 | PM/Permessi | Core Anagrafica Sito | ODA | campo varchar 50 | F014 | ODA | ALTA | Campo Universale esatto (riga 43) |  |
| 15 | PM/Permessi | Core Anagrafica Sito | Proprietà / Host | menù a tendina | F015 | Proprietà / Host | ALTA | Campo Universale esatto (riga 12) |  |
| 16 | PM/Permessi | Dati Anagrafici Secondari | Gestore Tenant | menù a tendina con tutti i clienti | F016 | GESTORE | MEDIA | Il Campo Universale `GESTORE` supporta il concetto; il documento lo specializza al tenant. |  |
| 17 | PM/Permessi | Dati Anagrafici Secondari | Codice sito Tenant | TEXT | F017 | Codici Sito Terzi | MEDIA | Il codice del tenant è un identificativo di sito terzo rispetto al sito principale. | appare solo se viene inserito un valore nel campo “Gestore Tenant” |
| 18 | PM/Permessi | Dati Anagrafici Secondari | Nome sito Tenant | TEXT | F018 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato | appare solo se viene inserito un valore nel campo “Gestore Tenant” |
| 19 | PM/Permessi | Dati Anagrafici Secondari | Latitudine | DECIMAL | F019 | DA VERIFICARE | BASSA | Derivato dal campo sorgente `Coordinate`; WGS84, latitudine decimale. |  |
| 20 | PM/Permessi | Dati Anagrafici Secondari | Longitudine | DECIMAL | F020 | DA VERIFICARE | BASSA | Derivato dal campo sorgente `Coordinate`; WGS84, longitudine decimale. |  |
| 21 | PM/Permessi | Fase Preliminare | Data assegnazione |  | F021 | Data Assegnazione | ALTA | Campo Universale esatto (riga 10); il documento non esplicita il dtype. |  |
| 22 | PM/Permessi | Fase Preliminare | Data sopralluogo | DATE (gg/mm/aaaa) | F022 | Data Sopralluogo | ALTA | Campo Universale esatto (riga 11) |  |
| 23 | PM/Permessi | Fase Preliminare | Invio verbale di sopralluogo | DATE (gg/mm/aaaa) | F023 | INVIO VERBALE DI SOPRALLUOGO | ALTA | Campo Universale esatto (riga 54) |  |
| 24 | PM/Permessi | Fase Preliminare | Vincoli | menù a tendina | F024 | Vincoli | ALTA | Tabella Vincoli comune definita sopra; selezione multipla. La voce Ente viene creata automaticamente quando prevista dalla riga del vincolo. |  |
| 25 | PM/Permessi | Fase Preliminare | Bozza di progetto | DATE (gg/mm/aaaa) | F025 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 26 | PM/Permessi | Fase Preliminare | Approvazione bozza di progetto | DATE (gg/mm/aaaa) | F026 | DA VERIFICARE | BASSA | Denominazione definitiva confermata dal confronto operativo; stesso campo precedentemente indicato come `Ok bozza di progetto`. |  |
| 27 | PM/Permessi | Pacchetto Permessi | Ricezione validazione | DATE (gg/mm/aaaa) | F027 | Arrivo Validazione | ALTA | Corrispondenza diretta tra ricezione e arrivo della validazione. |  |
| 28 | PM/Permessi | Pacchetto Permessi | Tecnico PP | menù a tendina | F028 | Progettista / Tecnico | MEDIA | Normalizzazione operativa verso `Progettista / Tecnico` (riga 13) |  |
| 29 | PM/Permessi | Pacchetto Permessi | Fornitore PP | menù a tendina | F029 | Fornitore / Impresa | MEDIA | Il Campo Universale rappresenta il fornitore/impresa; il documento lo specializza al pacchetto permessi. |  |
| 30 | PM/Permessi | Pacchetto Permessi | Invio PDM | DATE (gg/mm/aaaa) | F030 | Invio PDM / Bozza PM | ALTA | Normalizzazione operativa verso `Invio PDM / Bozza PM` (riga 21) |  |
| 31 | PM/Permessi | Pacchetto Permessi | Approvazione PDM | DATE (gg/mm/aaaa) | F031 | Approvazione PDM / PM | ALTA | Normalizzazione operativa verso `Approvazione PDM / PM` (riga 22) |  |
| 32 | PM/Permessi | Pacchetto Permessi | AIE | menù a tendina | F032 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 33 | PM/Permessi | Pacchetto Permessi | Ricezione Scheda Tecnica | DATE (gg/mm/aaaa) | F033 | SCHEDA TECNICA | MEDIA | Il Campo Universale identifica la scheda tecnica; il documento registra specificamente la data/evento di ricezione. | compare solo se AIE=SI |
| 34 | PM/Permessi | Pacchetto Permessi | Assegnazione AIE | DATE (gg/mm/aaaa) | F034 | ASSEGNAZIONE PE | BASSA | Master operativo; compilato da PM/Permessi. Candidato lessicale `ASSEGNAZIONE PE`; associazione non attestata (riga 52; score 0.90) | compare solo se AIE=SI |
| 35 | PM/Permessi | Pacchetto Permessi | Forecast AIE | DATE (gg/mm/aaaa) | F035 | FORECAST AIE | ALTA | Master operativo PM/Permessi; alimenta il mirror AIE con lo stesso `id_flusso`. | compare solo se AIE=SI; Alert 2 gg prima; si risolve quando viene compilato il campo “Approvazione AIE” |
| 36 | PM/Permessi | Pacchetto Permessi | Invio AIE | DATE (gg/mm/aaaa) | F038 | AIE INVIO | MEDIA | Mirror in sola lettura del master AIE; stesso `id_flusso`. Somiglianza terminologica molto forte; da confermare (riga 166; score 0.95) | compare solo se AIE=SI; sola visualizzazione |
| 37 | PM/Permessi | Pacchetto Permessi | Approvazione AIE | DATE (gg/mm/aaaa) | F039 | OK AIE | MEDIA | Mirror in sola lettura del master AIE; stesso `id_flusso`. L’approvazione AIE è coerente con il Campo Universale `OK AIE`; differenza tra evento di approvazione ed esito. | compare solo se AIE=SI; sola visualizzazione |
| 38 | PM/Permessi | Pacchetto Permessi | All. 18 | menù a tendina | F040 | INVIO ALL. 18 | BASSA | Candidato lessicale `INVIO ALL. 18`; associazione non attestata (riga 164; score 0.90) |  |
| 39 | PM/Permessi | Pacchetto Permessi | Invio All. 18 | DATE (gg/mm/aaaa) | F041 | INVIO ALL. 18 | ALTA | Campo Universale esatto (riga 164) | compare solo se All. 18 = SI |
| 40 | PM/Permessi | Pacchetto Permessi | Note Pacchetto Permessi | campo libero | F042 | Note | MEDIA | Normalizzazione operativa verso `Note` (riga 44) | non compare se All. 18 = SI |
| 41 | PM/Permessi | Pacchetto Permessi | Tipologia pacchetto permessi | menù a tendina | F043 | Tipologia Sito | BASSA | Candidato lessicale `Tipologia Sito`; associazione non attestata (riga 42; score 0.85) | non compare se All. 18 = SI |
| 42 | PM/Permessi | Pacchetto Permessi | Invio Pacchetto Permessi | DATE (gg/mm/aaaa) | F044 | Invio Pacchetto Permessi | ALTA | Campo Universale esatto (riga 19) | non compare se All. 18 = SI |
| 43 | PM/Permessi | Iter Autorizzativo | Protocollo | DATE (gg/mm/aaaa) | F045 | Protocollo | ALTA | Campo Universale esatto (riga 18) |  |
| 44 | PM/Permessi | Iter Autorizzativo | Forecast Ottenimento Permessi | DATE (gg/mm/aaaa) | F046 | PREV. OTTENIMENTO PERMESSI | MEDIA | Normalizzazione operativa verso `PREV. OTTENIMENTO PERMESSI` (riga 142); All. 18 non sopprime il forecast né il relativo alert. | Base = Protocollo + 67 giorni di calendario. Quando si compila Invio integrazione, se in quel momento mancano <= 15 giorni al forecast base, il forecast viene spostato della durata dell’ultima integrazione (Invio integrazione - Richiesta integrazione). Il ricalcolo continua finché il campo non viene modificato manualmente; una modifica manuale lo blocca. |
| 45 | PM/Permessi | Iter Autorizzativo | Ottenimento Permessi | DATE (gg/mm/aaaa) | F047 | Ottenimento Enti / Permessi | ALTA | Nome sorgente esatto nel mapping (riga 24). |  |
| 46 | PM/Permessi | Iter Autorizzativo | Richiesta integrazione | DATE (gg/mm/aaaa) | F048 | RICHIESTA INTEGRAZIONI | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 48; score 0.95) |  |
| 47 | PM/Permessi | Iter Autorizzativo | Note integrazione | campo libero | F049 | NOTE INTEGRAZIONI | MEDIA | Normalizzazione operativa verso `NOTE INTEGRAZIONI` (riga 107) | compare solo se compilato il campo “Richiesta integrazione” |
| 48 | PM/Permessi | Iter Autorizzativo | Invio integrazione | DATE (gg/mm/aaaa) | F050 | INVIO VERBALE DI SOPRALLUOGO | BASSA | Candidato lessicale `INVIO VERBALE DI SOPRALLUOGO`; associazione non attestata (riga 54; score 0.85) | compare solo se compilato il campo “Richiesta integrazione” |
| 49 | PM/Permessi | Iter Autorizzativo | Forecast Parere Arpa | DATE (gg/mm/aaaa) | F051 | FORECAST | BASSA | Gruppo ARPA ripetibile; l’alert si chiude con `Parere Arpa` dell’occorrenza corrente.; Campo logico del gruppo ARPA ripetibile; le occorrenze successive riusano lo stesso schema. |  |
| 50 | PM/Permessi | Iter Autorizzativo | Parere Arpa | DATE (gg/mm/aaaa) | F052 | PARERE ARPA | ALTA | Gruppo ARPA ripetibile, stessa struttura di TIM/TOWERNET.; Campo logico del gruppo ARPA ripetibile; le occorrenze successive riusano lo stesso schema. |  |
| 51 | PM/Permessi | Iter Autorizzativo | Esito parere Arpa | menù a tendina | F053 | Esito Enti (ARPA / Soprintendenza) | MEDIA | Gruppo ARPA ripetibile; dominio `Positivo / Negativo`.; Campo logico del gruppo ARPA ripetibile; le occorrenze successive riusano lo stesso schema. | compare solo se compilato il campo `Parere Arpa` |
| 52 | PM/Permessi | Iter Autorizzativo | N° protocollo Arpa | TEXT | F054 | Protocollo | BASSA | Gruppo ARPA ripetibile; Campo logico del gruppo ARPA ripetibile; le occorrenze successive riusano lo stesso schema; Tipo testuale per ammettere barre e lettere. | compare solo se compilato il campo `Parere Arpa` |
| 53 | PM/Permessi | Iter Autorizzativo | Ripresentazione Pratica | DATE (gg/mm/aaaa) | F055 | DA VERIFICARE | BASSA | Apre una nuova occorrenza del gruppo ARPA; non crea una seconda famiglia di campi.; Apre una nuova occorrenza del gruppo ARPA; non crea una seconda famiglia di campi.; Apre una nuova occorrenza del gruppo ARPA; non crea una seconda famiglia di campi. | compare se `Esito parere Arpa = Negativo` |
| 54 | PM/Permessi | Iter Autorizzativo | Nome Ente | campo libero | F056 | Nome sito Vodafone | BASSA | Voce Ente derivata dalla tabella Vincoli; può essere generata automaticamente dal vincolo presente. Per le voci configurabili resta ammesso `Altro` con valore manuale sulla singola pratica. | compare/si crea quando il Vincolo richiede una voce Ente |
| 55 | PM/Permessi | Iter Autorizzativo | Forecast Ottenimento “Nome ente” | DATE (gg/mm/aaaa) | F057 | FORECAST | BASSA | Candidato lessicale `FORECAST`; associazione non attestata (riga 53; score 0.90) |  |
| 56 | PM/Permessi | Iter Autorizzativo | Ottenimento “Nome ente” | DATE (gg/mm/aaaa) | F058 | Ottenimento Enti / Permessi | MEDIA | Il Campo Universale rappresenta l’ottenimento da enti/permessi; il documento istanzia dinamicamente il singolo ente. | compare solo se compilato il campo “Nome Ente” |
| 57 | PM/Permessi | Iter Autorizzativo | Esito parere “nome ente” | menù a tendina | F059 | Esito Enti (ARPA / Soprintendenza) | MEDIA | Il documento registra l’esito del singolo ente; il Campo Universale aggrega gli esiti degli enti. | compare solo se compilato il campo “Nome Ente” |
| 58 | PM/Permessi | Iter Autorizzativo | N° protocollo “Nome ente” | TEXT | F060 | Protocollo | BASSA | Candidato lessicale `Protocollo`; associazione non attestata (riga 18; score 0.90); Tipo testuale per ammettere barre e lettere. | compare solo se compilato il campo “Nome Ente” |
| 59 | PM/Permessi | Iter Autorizzativo | Oneri | menù a tendina con selezione multipla | F061 | Oneri e Bolli | BASSA | Candidato lessicale `Oneri e Bolli`; associazione non attestata (riga 85; score 0.90); Scelta multipla del tipo: `diritti di segreteria`, `marche da bollo`, `paesaggistica`. |  |
| 60 | PM/Permessi | Iter Autorizzativo | Data Autorizzazione finale | DATE (gg/mm/aaaa) | F062 | DATA | BASSA | Candidato lessicale `DATA`; associazione non attestata (riga 424; score 0.90); Data distinta da `Ottenimento Permessi`. |  |
| 61 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Geologica | menù a tendina | F068 | ASSEGNAZIONE GEOLOGICA | BASSA | Flag informativo; nessuna condizione di visibilità del blocco Geologica. |  |
| 62 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Assegnazione Geologica | DATE (gg/mm/aaaa) | F069 | ASSEGNAZIONE GEOLOGICA | ALTA | Campo Universale esatto (riga 143) |  |
| 63 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Forecast Geologica | DATE (gg/mm/aaaa) | F070 | FORECAST | BASSA | Candidato lessicale `FORECAST`; associazione non attestata (riga 53; score 0.90) | Forecast Geologica = Assegnazione Geologica + 15 giorni di calendario |
| 64 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Arrivo Geologica | DATE (gg/mm/aaaa) | F071 | ARRIVO GEOLOGICA | ALTA | Campo Universale esatto (riga 144) |  |
| 65 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Invio Scheda Palo | DATE (gg/mm/aaaa) | F072 | INVIO SCHEDA PALO | ALTA | Campo consolidato come parte del blocco PM/UT+PE; master PM con mirror PE. | compare solo se Tipologia sito = Raw Land |
| 66 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Assegnazione UT | DATE (gg/mm/aaaa) | F066 | DA VERIFICARE | BASSA | Campo presente nel documento; nessun allineamento canonico sufficientemente supportato |  |
| 67 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Note Assegnazione UT | campo libero | F067 | Note | MEDIA | Campo compilato da PM; master della corrispondente occorrenza di sola visualizzazione UT+PE. |  |
| 68 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | PE | menù a tendina | F063 | PE | ALTA | Flag `SI / NO` consolidato il 07/10/2026; posizionato subito prima di Assegnazione PE. |  |
| 69 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Assegnazione PE | DATE (gg/mm/aaaa) | F064 | ASSEGNAZIONE PE | ALTA | Campo Universale esatto (riga 52) | compare solo se PE = SI |
| 70 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Note Assegnazione PE | campo libero | F065 | Note | MEDIA | Campo compilato da PM; master della corrispondente occorrenza di sola visualizzazione UT+PE. | compare solo se PE = SI; sola visualizzazione |
| 71 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Forecast PE | DATE (gg/mm/aaaa) | F092 | FORECAST PE | ALTA | Pop-up UT+PE; mirror di `Forecast PE` della sezione operativa. |  |
| 72 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Forecast UT | DATE (gg/mm/aaaa) | F082 | FORECAST | MEDIA | Pop-up UT+PE; mirror di `Forecast UT` della sezione operativa. |  |
| 73 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Incarico PE | DATE (gg/mm/aaaa) | F098 | ASSEGNAZIONE PE | MEDIA | Pop-up UT+PE; mirror di `Incarico PE` della sezione operativa. |  |
| 74 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | PE incaricato da | menù a tendina | F100 | Assegnatore attivita | MEDIA | Pop-up UT+PE; mirror di `PE incaricato da` della sezione operativa. |  |
| 75 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Invio PE | DATE (gg/mm/aaaa) | F106 | Consegna / Invio PE | ALTA | Pop-up UT+PE; mirror di `Invio PE` della sezione operativa. |  |
| 76 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Incarico VS/AS | DATE (gg/mm/aaaa) | F083 | ASSEGNAZIONE AS/VS | MEDIA | Pop-up UT+PE; mirror di `Incarico VS/AS` della sezione operativa. |  |
| 77 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Fornitore UT | menù a tendina che si popola volta per volta | F086 | Fornitore / Impresa | MEDIA | Pop-up UT+PE; mirror di `Fornitore UT` della sezione operativa. |  |
| 78 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Tipologia attività UT | menù a tendina | F087 | Stato Attività | BASSA | Pop-up UT+PE; mirror di `Tipologia attività UT` della sezione operativa. |  |
| 79 | PM/Permessi | Ufficio Tecnico / Progettazione Esecutiva | Invio AS/VS | DATE (gg/mm/aaaa) | F091 | INVIO AS/VS | ALTA | Master operativo PM/Permessi (D-207, risposta Q2 del 06/11/2026): lo compila sempre il PM; l'UT lo vede in sola lettura. Visibilità per Incarico / Lavorazione in `template-incarico.json`. |  |
| 80 | AIE | Fase AIE | Assegnazione AIE | DATE (gg/mm/aaaa) | F034 | ASSEGNAZIONE PE | BASSA | Sola visualizzazione; ereditato da PM/Permessi. Mirror di `Assegnazione AIE`. Candidato lessicale `ASSEGNAZIONE PE`; associazione non attestata (riga 52; score 0.90); La sezione Fase AIE è visibile al gruppo AIE dopo `Assegna`, indipendentemente dal flag AIE.; La sezione Fase AIE è visibile al gruppo AIE dopo `Assegna`, indipendentemente dal flag AIE. |  |
| 81 | AIE | Fase AIE | Forecast AIE | DATE (gg/mm/aaaa) | F035 | FORECAST AIE | ALTA | Sola visualizzazione; mirror di `Forecast AIE` master PM/Permessi; stesso `id_flusso`. | sola visualizzazione |
| 82 | AIE | Fase AIE | Tecnico Misure di fondo | menù a tendina che si popola volta per volta | F073 | N° MISURE RICH... | BASSA | Candidato lessicale `N° MISURE RICH...`; associazione non attestata (riga 440; score 0.85) | non compare se Regione = Piemonte |
| 83 | AIE | Fase AIE | Stato misure di fondo | menù a tendina | F074 | Stato Attività | BASSA | Candidato lessicale `Stato Attività`; associazione non attestata (riga 9; score 0.85) | non compare se Regione = Piemonte; Valori: IN ESECUZIONE, OK, STAND BY |
| 84 | AIE | Fase AIE | Tecnico AIE | menù a tendina che si popola volta per volta | F075 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta il tecnico/progettista; il documento lo specializza al team AIE. |  |
| 85 | AIE | Fase AIE | Stato assegnazione tecnico AIE | menù a tendina | F076 | Stato Attività | BASSA | Candidato lessicale `Stato Attività`; associazione non attestata (riga 9; score 0.85) | Valori: OK, DA ASSEGNARE |
| 86 | AIE | Fase AIE | Responsabile interno AIE | menù a tendina | F077 | OK AIE | BASSA | Candidato lessicale `OK AIE`; associazione non attestata (riga 20; score 0.85) |  |
| 87 | AIE | Fase AIE | Stato AIE | menù a tendina | F078 | Stato Attività | BASSA | Candidato lessicale `Stato Attività`; associazione non attestata (riga 9; score 0.85) |  |
| 88 | AIE | Fase AIE | Invio CEM | DATE (gg/mm/aaaa) | F079 | DA VERIFICARE | BASSA | Master operativo AIE; `id_flusso` consolidato. |  |
| 89 | AIE | Fase AIE | Fine attività AIE | DATE (gg/mm/aaaa) | F080 | OK AIE | BASSA | Candidato lessicale `OK AIE`; associazione non attestata (riga 20; score 0.85) |  |
| 90 | AIE | Fase AIE | Riduzione | DATE (gg/mm/aaaa) | F036 | RIDUZIONI | ALTA | Master operativo AIE; unica occorrenza modificabile per questo dato. Corrispondenza diretta singolare/plurale con il Campo Universale. |  |
| 91 | AIE | Fase AIE | Approvazione Riduzione | DATE (gg/mm/aaaa) | F037 | OK RIDUZIONI | MEDIA | Master operativo AIE; unica occorrenza modificabile per questo dato. L’approvazione della riduzione è semanticamente coerente con `OK RIDUZIONI`, ma la label canonica esprime l’esito più che l’evento. |  |
| 92 | AIE | Fase AIE | Invio AIE | DATE (gg/mm/aaaa) | F038 | AIE INVIO | MEDIA | Master operativo AIE; unica occorrenza modificabile per questo dato. Somiglianza terminologica molto forte; da confermare (riga 166; score 0.95) |  |
| 93 | AIE | Fase AIE | Approvazione AIE | DATE (gg/mm/aaaa) | F039 | OK AIE | MEDIA | Master operativo AIE; unica occorrenza modificabile per questo dato. L’approvazione AIE è coerente con il Campo Universale `OK AIE`; differenza tra evento di approvazione ed esito. |  |
| 94 | AIE | Fase AIE | Note AIE | campo libero | F081 | Note | MEDIA | Normalizzazione operativa verso `Note` (riga 44) |  |
| 95 | UT+PE | UT | Assegnazione UT | DATE (gg/mm/aaaa) | F066 | DA VERIFICARE | BASSA | Sola visualizzazione; compilato da PM. Mirror di `Assegnazione UT`. |  |
| 96 | UT+PE | UT | Note Assegnazione UT | campo libero | F067 | Note | MEDIA | Sola visualizzazione; compilato da PM. Mirror di `Note Assegnazione UT`. |  |
| 97 | UT+PE | UT | Forecast UT | DATE (gg/mm/aaaa) | F082 | FORECAST | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 53; score 0.95) |  |
| 98 | UT+PE | UT | Incarico VS/AS | DATE (gg/mm/aaaa) | F083 | ASSEGNAZIONE AS/VS | MEDIA | Il campo descrive la presa in carico/assegnazione VS-AS; il Campo Universale usa la terminologia `ASSEGNAZIONE AS/VS`. | di base viene inserita la data del giorno |
| 99 | UT+PE | UT | VS/AS incaricata da | menù a tendina | F084 | Assegnatore attivita | MEDIA | Il campo identifica chi ha effettuato l’incarico; il Campo Universale `Assegnatore attivita` è coerente. |  |
| 100 | UT+PE | UT | Tecnico UT | menù a tendina che si popola volta per volta | F085 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta il tecnico/progettista; il documento lo specializza al team UT. |  |
| 101 | UT+PE | UT | Fornitore UT | menù a tendina che si popola volta per volta | F086 | Fornitore / Impresa | MEDIA | Il Campo Universale rappresenta il fornitore/impresa; il documento lo specializza al team UT. | possibilità di inserire valore “nessuno” |
| 102 | UT+PE | UT | Tipologia attività UT | menù a tendina | F087 | Stato Attività | BASSA | Candidato lessicale `Stato Attività`; associazione non attestata (riga 9; score 0.85) | Valori: VS, AS, Dimensionamento plinto, VS plinto, fattibilità, correzione PE |
| 103 | UT+PE | UT | Importo UT | campo numerico | F088 | IMPORTO | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 156; score 0.95) |  |
| 104 | UT+PE | UT | Costo UT | campo numerico | F089 | Richiesta analisi UT | BASSA | Candidato lessicale `Richiesta analisi UT`; associazione non attestata (riga 98; score 0.85); Nota informativa: si riferisce sempre al pagamento di un esterno, non descrive un costo interno; distinto da Costo PE. Nessun comportamento applicativo. |  |
| 105 | UT+PE | UT | Fine attività UT | DATE (gg/mm/aaaa) | F090 | Week effettiva chiusura attivita | BASSA | Candidato lessicale `Week effettiva chiusura attivita`; associazione non attestata (riga 32; score 0.85) |  |
| 106 | UT+PE | UT | Invio AS/VS | DATE (gg/mm/aaaa) | F091 | INVIO AS/VS | ALTA | Mirror in sola lettura del master PM/Permessi `Invio AS/VS` (D-207); stesso `id_flusso`. | sola visualizzazione |
| 107 | UT+PE | PE | Assegnazione Geologica | DATE (gg/mm/aaaa) | F069 | ASSEGNAZIONE GEOLOGICA | ALTA | Pop-up PM/Permessi; mirror di `Assegnazione Geologica` compilato da PM. | sola visualizzazione |
| 108 | UT+PE | PE | Forecast Geologica | DATE (gg/mm/aaaa) | F070 | FORECAST | BASSA | Pop-up PM/Permessi; mirror di `Forecast Geologica` compilato da PM. | Forecast Geologica = Assegnazione Geologica + 15 giorni di calendario; sola visualizzazione |
| 109 | UT+PE | PE | Arrivo Geologica | DATE (gg/mm/aaaa) | F071 | ARRIVO GEOLOGICA | ALTA | Pop-up PM/Permessi; mirror di `Arrivo Geologica` compilato da PM. | sola visualizzazione |
| 110 | UT+PE | PE | Invio Scheda Palo | DATE (gg/mm/aaaa) | F072 | INVIO SCHEDA PALO | ALTA | Mirror in sola lettura del master PM `Invio Scheda Palo`; stesso `id_flusso`. | compare solo se Tipologia sito = Raw Land; sola visualizzazione |
| 111 | UT+PE | PE | Assegnazione PE | DATE (gg/mm/aaaa) | F064 | ASSEGNAZIONE PE | ALTA | Sola visualizzazione; compilato da PM. Mirror di `Assegnazione PE`. | compare solo se PE = SI; sola visualizzazione |
| 112 | UT+PE | PE | Note Assegnazione PE | campo libero | F065 | Note | MEDIA | Sola visualizzazione; compilato da PM. Mirror di `Note Assegnazione PE`. | compare solo se PE = SI; sola visualizzazione |
| 113 | UT+PE | PE | Forecast PE | DATE (gg/mm/aaaa) | F092 | FORECAST PE | ALTA | Campo Universale esatto (riga 171) |  |
| 114 | UT+PE | PE | Forecast CIL | DATE (gg/mm/aaaa) | F116 | FORECAST | BASSA | Mirror in sola lettura del master DL; stesso `id_flusso`. | compare solo se Deposito sismico = SI; sola visualizzazione |
| 115 | UT+PE | PE | PSC | menù a tendina | F093 | PSC | ALTA | Campo Universale esatto (riga 62) |  |
| 116 | UT+PE | PE | Forecast PSC | DATE (gg/mm/aaaa) | F094 | FORECAST | BASSA | Candidato lessicale `FORECAST`; associazione non attestata (riga 53; score 0.90) | compare solo se PSC=SI. Campo manuale: nessun valore predefinito o formula automatica. |
| 117 | UT+PE | PE | Tecnico PSC | Menù a tendina | F095 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta il tecnico/progettista; il documento lo specializza all’attività PSC. |  |
| 118 | UT+PE | PE | Note PSC | campo libero | F096 | Note | BASSA | Candidato lessicale `Note`; associazione non attestata (riga 44; score 0.90) |  |
| 119 | UT+PE | PE | OK PSC | DATE (gg/mm/aaaa) | F097 | PSC | BASSA | Candidato lessicale `PSC`; associazione non attestata (riga 62; score 0.90) |  |
| 120 | UT+PE | PE | Incarico PE | DATE (gg/mm/aaaa) | F098 | ASSEGNAZIONE PE | MEDIA | La data di incarico PE è coerente con il Campo Universale `ASSEGNAZIONE PE`, pur con terminologia diversa. | di base viene inserita la data del giorno |
| 121 | UT+PE | PE | Tipologia attività PE | menù a tendina | F099 | DA VERIFICARE | BASSA | Compilazione automatica: se `Progetto` esiste nel template ed è valorizzato, copia il valore di `Progetto`; se `Progetto` è vuoto o non esiste nel template, copia `Incarico / Lavorazione`. Non è `Stato attività`. |  |
| 122 | UT+PE | PE | PE incaricato da | menù a tendina | F100 | Assegnatore attivita | MEDIA | Il campo identifica chi ha effettuato l’incarico PE; corrisponde al concetto di assegnatore. |  |
| 123 | UT+PE | PE | Tecnico PE | menù a tendina che si popola volta per volta | F101 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta il tecnico/progettista; il documento lo specializza al team PE. | possibilità di inserire valore “nessuno”; possibilità di inserire più tecnici |
| 124 | UT+PE | PE | Fornitore PE | menù a tendina che si popola volta per volta | F102 | Fornitore / Impresa | MEDIA | Il Campo Universale rappresenta il fornitore/impresa; il documento lo specializza al team PE. | possibilità di inserire valore “nessuno” |
| 125 | UT+PE | PE | Importo PE | campo numerico | F103 | IMPORTO | MEDIA | Somiglianza terminologica molto forte; da confermare (riga 156; score 0.95) |  |
| 126 | UT+PE | PE | Costo PE | campo numerico | F104 | PE | BASSA | Candidato lessicale `PE`; associazione non attestata (riga 365; score 0.90); Nota informativa: utile solo se collegato con G7. Nessun comportamento applicativo. |  |
| 127 | UT+PE | PE | Fine attività PE | DATE (gg/mm/aaaa) | F105 | PE | BASSA | Candidato lessicale `PE`; associazione non attestata (riga 365; score 0.90) |  |
| 128 | UT+PE | PE | Invio PE | DATE (gg/mm/aaaa) | F106 | Consegna / Invio PE | ALTA | Corrispondenza esplicita con il Campo Universale `Consegna / Invio PE`. |  |
| 129 | DL | Direzione Lavori | Deposito sismico | menù a tendina | F107 | DEPOSITO SISMICO | ALTA | Campo Universale esatto (riga 285); ownership DL confermata dal documento. | Valori: SI, NO |
| 130 | DL | Direzione Lavori | Forecast Deposito Sismico | DATE (gg/mm/aaaa) | F108 | FORECAST | BASSA | Candidato generico `FORECAST` (riga 53); il documento specializza il forecast al deposito sismico. |  |
| 131 | DL | Direzione Lavori | Deposito Sismico | DATE (gg/mm/aaaa) | F109 | DEPOSITO SISMICO | MEDIA | Stesso concetto canonico del deposito sismico, ma questa occorrenza registra la data dell’evento e resta distinta dal flag SI/NO. |  |
| 132 | DL | Direzione Lavori | Tecnico deposito sismico | menù a tendina | F110 | Progettista / Tecnico | MEDIA | Il Campo Universale rappresenta la figura tecnica; il documento la specializza al deposito sismico. | compare solo se deposito sismico=SI |
| 133 | DL | Direzione Lavori | Direttore Lavori | menù a tendina che si popola volta per volta | F111 | DL | ALTA | Corrispondenza diretta tra la figura `Direttore Lavori` e il Campo Universale `DL`. | compare solo se deposito sismico=SI |
| 134 | DL | Direzione Lavori | Collaudatore | menù a tendina che si popola volta per volta | F112 | COLLAUDATORE | ALTA | Campo Universale esatto (riga 58). | compare solo se deposito sismico=SI |
| 135 | DL | Direzione Lavori | Protocollo deposito sismico | DATE (gg/mm/aaaa) | F113 | Protocollo | BASSA | Candidato `Protocollo` (riga 18); la fonte lo specializza al deposito sismico. | compare solo se deposito sismico=SI |
| 136 | DL | Direzione Lavori | N° protocollo deposito sismico | TEXT | F114 | Protocollo | BASSA | Candidato `Protocollo` (riga 18); il campo contiene il numero, non la data di protocollazione.; Tipo testuale per ammettere barre e lettere. | compare solo se deposito sismico=SI |
| 137 | DL | Direzione Lavori | N° sismica | TEXT | F115 | Note sismica | BASSA | Candidato già usato negli artifact precedenti; nessuna corrispondenza diretta sufficientemente forte nel mapping.; Tipo testuale per ammettere barre e lettere. | compare solo se deposito sismico=SI |
| 138 | DL | Direzione Lavori | Forecast CIL | DATE (gg/mm/aaaa) | F116 | FORECAST | BASSA | Candidato generico `FORECAST` (riga 53); il documento specializza il forecast alla CIL. |  |
| 139 | DL | Direzione Lavori | Data IL | DATE (gg/mm/aaaa) | F117 | Inizio Lavori - Effettiva | BASSA | Candidato semantico verso `Inizio Lavori - Effettiva` (riga 34); abbreviazione `IL` da validare nel mapping canonico. |  |
| 140 | DL | Direzione Lavori | Data FL | DATE (gg/mm/aaaa) | F118 | Fine Lavori - Strutturale | BASSA | Candidato semantico verso `Fine Lavori - Strutturale` (riga 35); abbreviazione `FL` da validare nel mapping canonico. |  |

## Riepilogo

- Campi/occorrenze censiti: **140**
- Campi logici / `id_flusso`: **118** (`F001-F118`)
- Confidenza ALTA: **46**
- Confidenza MEDIA: **44**
- Confidenza BASSA: **50**

Le righe `BASSA` costituiscono la coda di review semantica del mapping e **non** mettono in discussione l'autorità operativa del campo o della sua collocazione in questo MD.
