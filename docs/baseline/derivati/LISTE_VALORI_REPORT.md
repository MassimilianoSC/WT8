# PracticeHub — Liste dei menu: cosa c'è e cosa manca

**Data:** 07/10/2026
**Richiesta:** risposta v2, C15.4: "Dove possibile, ricavare i valori delle liste dai file sorgente. Segnalare cosa effettivamente manca."
**Dati completi:** `LISTE_VALORI_INIZIALI.csv` (separatore `;`, UTF-8; si apre con Excel). Ogni riga contiene gestore, gruppo, campo, tipo di lista, valore, codice tecnico proposto, fonte e note.

## Tipi di lista

| Tipo | Chi gestisce i valori | Valori (righe CSV) |
|---|---|---|
| **CONTROLLATO** | Nessuno dalla Configurazione: hanno un codice tecnico stabile, perché li usano alert, condizioni, automazioni o la scelta del template | 93 |
| **CONFIGURABILE** | Team leader del gruppo (per gestore) e ADMIN, dalla pagina Configurazione | 221 |
| **UTENTI** | Utenti registrati della piattaforma, filtrati per ruolo | 10 campi |
| **ISTAT** | Sorgente geografica con selezione a cascata | 3 campi |
| **INCOMPLETA** | Ci sono alcuni valori, ma manca qualcosa | 19 |
| **MANCANTE** | Nessun valore nei sorgenti | 21 |

Il codice tecnico proposto (es. `DA_RICHIEDERE`, `RAW_LAND`) è il valore che resta stabile anche se l'etichetta mostrata cambia.

## Normalizzazioni già applicate

- "Fastweb" (ILIAD) e "Vodafone-fastweb" (TIM, FASTWEB-VODAFONE, LEONARDO) → **"Fastweb-Vodafone"** [R A1.5 v].
- Stato attività: **CREATA** al posto di IN LAVORAZIONE [R v2 B4].
- Stato ODA: tolto **FATTURATO** [R v2 C5].
- Autorizzazione finale: **KO** esteso a INWIT [R v2 B4].
- Applicabilità: tolto "TITOLO IV*", considerato un refuso [R v2 M1].
- Committente e Cliente Finale: aggiunto **"Altro"** (inserimento manuale) per tutti i gestori [R v2 B1].
- Tipologia attività UT: i valori di ILIAD estesi a tutti i gestori [R A4.1].
- Fornitori UT e PE e Tecnico PE: previsto il valore **"Nessuno"**, come nei sorgenti.

## Cosa manca

### 1. Liste senza nessun valore (da fornire, oppure da far inserire ai team leader)

| Campo | Gestori | Gruppo | Nota |
|---|---|---|---|
| **Vincoli** (elenco e tabella stati/Ente) | ILIAD, FASTWEB-VODAFONE, LEONARDO | PM/Permessi | Il sorgente dice solo "possibilità di flaggare più vincoli". La tabella esiste **solo** per TIM, TOWERNET e INWIT → domanda **V5** del questionario v3 |
| **Nome Ente** | ILIAD, FASTWEB-VODAFONE, LEONARDO | PM/Permessi | Senza tabella vincoli non c'è un elenco di enti da cui ricavarlo |
| Gestore Tenant | tutti | PM/Permessi | "Anagrafica dedicata" [R A1.5], senza valori |
| Referente | ILIAD, INWIT | PM/Permessi | "si popola volta per volta" |
| Referente Fastweb, RAN Fastweb | FASTWEB-VODAFONE | PM/Permessi | |
| Assistente TIM, Progettista TIM | TIM/FIBERCOP | PM/Permessi | |
| Fornitore PP / Fornitore Permessi | tutti | PM/Permessi | |
| Tecnico Misure di fondo | tutti | AIE | Lista, non utenti [R A1.6] |
| Fornitore UT, Fornitore PE | tutti | UT/PE | Più il valore "Nessuno" |
| Fornitore Caratterizzazione | ILIAD, INWIT | UT/PE | ILIAD dice "come UT": stessa lista di Fornitore UT? |
| Direttore Lavori, Collaudatore | tutti | DL | Lista, non utenti [R A1.6] |

Sono quasi tutte **anagrafiche operative**: per decisione [P1 §6] non bloccano lo sviluppo e possono inserirle i team leader nella Configurazione. Fanno eccezione **Vincoli** e **Nome Ente** per ILIAD, FASTWEB-VODAFONE e LEONARDO, perché ne dipende il funzionamento della compilazione automatica degli enti.

### 2. Liste incomplete

| Campo | Gestori | Cosa manca |
|---|---|---|
| **Incarico / Lavorazione** | TOWERNET | Un solo valore ("New Site"), ma il sorgente cita anche "Verifica statica" e "Caratterizzazione + verifica statica" |
| **Nome Ente** | TIM, TOWERNET, INWIT | Ci sono solo gli enti dei vincoli (Soprintendenza, Comune, ENAC/ENAV, SIC, Natura2000). Mancano gli enti non legati ai vincoli che possono comparire nell'Iter Autorizzativo |

### 3. Campi utente: ruolo da cui pescare (proposta, da confermare in V13)

| Campo | Ruolo proposto |
|---|---|
| Tecnico PP | Permessi |
| Tecnico AIE, Responsabile interno AIE | AIE (da registrare come utenti AIE: Lucera, Gucciardi, Pizzoni, Luo, Lopez) |
| Tecnico UT, VS/AS incaricata da, Tecnico Caratterizzazione | UT |
| Tecnico PE, PE incaricato da, Tecnico PSC | PE |
| Tecnico deposito sismico | DL |

## Liste già complete (estratte dai sorgenti)

Tipologia sito · Tipologia Struttura · Altezza traliccio · Area Apparati · Incarico/Lavorazione (tranne TOWERNET) · Progetto (ILIAD, TIM, INWIT) · Proprietà/Host · Committente · Cliente Finale · Preesistenze · Acquisitore · Applicabilità · Tipologia pacchetto permessi · Oneri · XML · WCN · CDMS · EM % · AGORA' · Stato misure di fondo · Stato assegnazione tecnico AIE · Stato AIE · Tipologia attività UT · Tipologia attività PE (unione di Progetto e Incarico) · Vincoli e stati (TIM, TOWERNET, INWIT) · Stato attività · Stato ODA · Esiti · Autorizzazione finale · SI/NO.
