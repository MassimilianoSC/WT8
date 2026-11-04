# Materiale grezzo per guida utente e checklist di collaudo (M2)

**Non è la guida né la checklist** (D-55): è l'elenco dei comportamenti visibili costruiti finora, fornito da o3 allo stato del commit `781fbd6`, tutto su **dati dimostrativi** (solo ADMIN, banner "Anteprima · dati dimostrativi"). Si trasformerà in guida e checklist quando le funzioni gireranno sulle API vere e saranno verificate.
**Voci provvisorie:** quelle legate a R-9 (pop-up, salvataggio, sezione con tutti i campi nascosti), a R-16 (stato manuale D-95, permessi provvisori D-94) e le voci "[demo]" delle liste.

## 0. Generale
- Testi in italiano; date gg/mm/aaaa; numeri con la virgola.
- Chi non è ADMIN e apre a mano le pagine nuove viene rimandato a /dashboard (finché ci sono i dati finti).
- Le pagine della beta (/dashboard, /practices, /users, /settings, /analytics, /import) e la sua campanella restano invariate per tutti.
- Avvisi in alto a destra (toast) per esiti e ricalcoli.

## 1. Barra laterale
- "Pratiche · anteprima": Tutti i clienti, i sei gestori (nomi dai template), Archivio; voce attiva evidenziata.
- "Notifiche e configurazione · anteprima": Notifiche, Liste, Soglie alert, Utenti.

## 2. Elenco pratiche (/pratiche, /pratiche?template=X)
- Filtri: ricerca (Codice Sito, Nome Sito, Codice G7), Cliente (cambia l'URL), Stato attività (12), Ordina per (Aperte prima, Ultimo aggiornamento, Data di creazione), "Anche non assegnate".
- Colonne:
  - Codice Sito (con gli alert aperti in rosso);
  - Nome Sito (icona di rilavorazione);
  - Cliente (solo con "Tutti i clienti");
  - Codice G7 ("it. n" oltre la prima iterazione);
  - Committente;
  - Stato attività come badge: contorno = aperta, pieno = TERMINATO/KO; il giallo solo su bordo e quadratino;
  - Avanzamento: 4 barre per gruppo, attenuate se il gruppo non è assegnato;
  - Aggiornata.
- Paginazione, "Nessuna pratica trovata", "Errore di caricamento"; pulsante "Nuova pratica"; clic sulla riga = scheda; le archiviate non compaiono mai.

## 3. Nuova pratica
- Obbligatori: Codice G7, Codice Sito, Nome Sito, Cliente Finale, Committente (menu con ricerca e "Altro" + testo).
- Il template si deduce da Cliente Finale + Committente. Se ambiguo: "La combinazione non determina il template: sceglilo tu", con i candidati.
- "Crea pratica" attivo solo con tutto compilato; poi si apre la scheda; gli errori del server compaiono nella finestra con "Riprova".

## 4. Scheda pratica (/pratiche/[id])
- **Intestazione:**
  - Codice Sito, Nome Sito, Stato attività, Cliente, Codice G7, "Iterazione n di N", link all'origine se rilavorazione, alert aperti;
  - comandi: Assegna, Stato attività, Altre azioni (Archivia, Ripristina, Rilavorazione, Ripresentazione totale, Cancella), solo quelli permessi; Stato e Altre azioni disattivati con modifiche non salvate.
- **Riquadro alert:** etichetta, campo e riga ("Ciclo ARPA #2"), scadenza; "Vai al campo" (apre, scorre, evidenzia); "Chiudi" solo se permesso, con conferma (testo dedicato per Offerta → ODA); alert sospesi "sospeso: pratica archiviata".
- **Trasversali in alto:** Note Operative (si salva uscendo dal campo); Fatturabile SÌ/NO con "automatico"/"manuale"; Fatturato SÌ/NO/vuoto.
- **Navigazione:** striscia dei 4 gruppi con compilati/totali (non assegnati attenuati, clic = salta al gruppo); indice a sinistra con contatori e punto rosso dove c'è un alert.
- **Sezioni:**
  - per gruppo, apribili; aperte di partenza quelle del proprio gruppo;
  - UT/PE divise in "Sezione UT" e "Sezione PE"; "Non ancora assegnato" per i gruppi senza Assegna;
  - lucchetto se nessun campo è modificabile;
  - contatore per sezione; una sezione con tutti i campi nascosti resta visibile con 0/n (*provvisorio, R-9*).
- **Campi:**
  - testo, testo lungo, numero, data con maschera ("Data non valida");
  - menu con ricerca, multiscelta, utenti con "Nessuno" esclusivo, "Altro" con testo;
  - cascata ISTAT;
  - asterisco sugli obbligatori; bordo rosso e testo dell'alert sui campi con alert.
- **Sola lettura con motivo:** "Compilato da X" (mirror), "Di competenza di X", "Il tuo gruppo non ha ancora ricevuto l'Assegna", "Pratica archiviata: sola lettura", "Iterazione passata: sola lettura", "Calcolato: <formula>".
- **Forecast Ottenimento Permessi:** "Calcolato: … · una modifica a mano ferma il calcolo"; dopo la modifica, "Impostato a mano: il calcolo automatico è fermo"; al ricalcolo, il toast "Forecast Ottenimento Permessi ricalcolato: gg/mm/aaaa".
- **Condizioni:** i campi compaiono o spariscono subito, anche riga per riga; un valore nascosto resta salvato e ricompare.
- **Pop-up:** riquadro con bordo nero, titolo e "Da <gruppo>" (*provvisorio, R-9*).
- **Ripetibili:** righe numerate; "Aggiungi"/"Rimuovi" (con conferma) solo se permessi; righe bloccate non rimovibili; avvisi in rosso; "creata automaticamente".
- **Vincoli:** tabella fissa delle 11 voci con Stato ed Ente (menu oppure ente predefinito); "crea la voce nel gruppo Ente" accanto ai Presenti.
- **Salvataggio** (*provvisorio, R-9 opzione a*):
  - barra "N modifiche non salvate · Annulla · Salva"; avviso del browser se si esce;
  - aggiungere o rimuovere una riga si salva subito;
  - conflitto: "La pratica è stata modificata da un altro utente: dati aggiornati, le tue modifiche non salvate sono state mantenute";
  - campi rifiutati: toast con le etichette.
- **Iterazioni passate:** banner "Iterazione n: sola lettura" con "Torna all'iterazione corrente"; niente comandi, alert né barra.
- **Archiviata:** banner "Archiviata: sola lettura, alert sospesi" con Ripristina; "← Archivio".
- **Storico:** "Modifiche ai campi" (vecchio → nuovo, chi o "Sistema"/"Import", data e ora, riga) e "Attività"; "Carica altre".
- **Collegamento diretto** (?sezione=&campo=&riga=): apre, scorre, evidenzia.

## 5. Finestre dei comandi
- In tutte, un errore compare nella finestra con "Riprova", che non ripete l'operazione due volte. Se la pratica è cambiata nel frattempo: chiusura, ricarica e avviso.
- **Assegna:**
  - uno o più gruppi ammessi ("già assegnato · nuova notifica");
  - nota per la mail; promemoria su data, forecast e note PM;
  - bloccato con modifiche non salvate; "Assegna a N gruppi".
- **Stato attività:** 12 stati, "attuale"; testo esplicativo + regola dello stato manuale (*provvisoria, D-95/R-16*); "automatico / impostato a mano".
- **Archivia, Ripristina** ("Lo Stato attività non cambia"), **Rilavorazione** e **Ripresentazione totale** (Codice G7 facoltativo; poi si apre la nuova pratica o iterazione).
- **Cancella:** "solo pratiche in CREATA, mai ripresentate", definitiva, si scrive il Codice Sito; "Cancella definitivamente".

## 6. Archivio (/pratiche/archivio)
- Come l'elenco ma solo le archiviate, con "Archiviata il"; senza "Nuova pratica" né "Anche non assegnate"; "Nessuna pratica archiviata".

## 7. Notifiche
- Pagina /notifiche: icona per tipo, non lette evidenziate, filtri Tipo e "Solo non lette", "Segna tutte lette", clic = letta + vai al punto, nota "Leggere una notifica non chiude l'alert".
- Campanella nuova (accesa solo con le API vere): contatore (99+), ultime 50, "Tutte" → /notifiche, aggiornamento ogni 30 s.

## 8. Configurazione · Liste
- Scelta del gestore ("Comuni a tutti" o uno dei sei) e del gruppo; elenco delle liste con tipo e lucchetto; tabella Ordine, Etichetta, Codice, Attiva.
- Controllata: solo etichette. Configurabile:
  - riordino, attiva/disattiva, "Aggiungi voce" con il codice proposto dall'etichetta;
  - cestino solo sulle voci nuove ("Una voce già salvata non si toglie: si disattiva");
  - controlli su etichette e codici; conferma se si esce con modifiche.
- Conflitto: "Un altro utente ha modificato la lista: le tue modifiche non salvate sono state scartate" + ricarica.

## 9. Configurazione · Soglie alert (solo ADMIN)
- Per gestore e regola: giorni (0–365), unità in sola lettura, "Salva" per riga; nota sugli alert non ancora emessi e sulle festività nazionali.

## 10. Configurazione · Utenti (solo ADMIN)
- Avviso rosso "Gestori senza PM leader attivo: …".
- Filtri Gestore e Stato; tabella Nome (badge ADMIN), Email, Stato, Appartenenze.
- Invita/Modifica:
  - nome, email (fissa dopo l'invito), ADMIN, attivo/disattivato;
  - appartenenze a righe: Gestore, Ruolo (con gruppo), Leader;
  - almeno una se non ADMIN; errori del server nella finestra.
