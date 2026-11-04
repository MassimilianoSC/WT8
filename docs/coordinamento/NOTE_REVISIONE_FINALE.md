# Note per la revisione avversativa finale (PR-28, A11)

*Raccolte dalla memoria l'11/10/2026, dai punti di o2 (dal più al meno rischioso). Servono a scrivere il prompt per il modello potente (M3).*

1. **Visibilità coerente** fra `listFilter`/`visibilityFilter` (elenco, export, assistente, statistiche), `canSeePractice` (scheda, storico, commenti, menzioni) e `isInScope`: nessuna pratica o conteggio a chi non deve; `/mentionable` espone i nomi degli utenti del cliente.
2. **D-121 Note Operative ovunque**: `hiddenNotesFilter` nello storico (voci legacy senza `noteGroup` = PM_PERMESSI), export, assistente (`get_practice`, `get_history`, `search_visible_notes`); nessun campo LONGTEXT "ordinario" letto dall'assistente che sia di fatto una nota riservata.
3. **Payload verso Google**: solo risultati proiettati, istruzioni senza email, domande precedenti come testo utente; rilettura dell'utente prima di ogni invio (AUTH_CHANGED), rimozione dei link esterni, canarini. Prove reali solo 143 su dati sintetici.
4. **Import (conferma)**: ricevute PARTIAL e ritentativi riga per riga, rilavorazione da archiviata, ALREADY_FILLED, cascata ISTAT; D-101 (PM leader attivo) controllato solo alla conferma, non in anteprima.
5. **Commenti**: "@tutti" e gruppi senza limite di frequenza (mail a tutto il cliente); revisioni che conservano il testo dopo la cancellazione logica (privacy, copie); audit solo per cancellazione ADMIN; etichette delle menzioni come istantanea del nome.
6. **Autenticazione**: primo ADMIN con due avvii in corsa; 403 CAMBIO_PASSWORD su tutte le `/api/*` tranne le ammesse (import, export, assistente, commenti); limite per indirizzo spento (gateway Docker); sessione di 10 ore.
7. **Azzeramento "solo pratiche"**: filtri dell'outbox (regex sull'eventKey), ricevute riconosciute per euristica; app e worker fermi solo per procedura, non imposto.
8. **Limiti dell'assistente in memoria del processo**: validi con un solo container app.
9. **/api/health senza accesso**: testi dei problemi di configurazione e stato dei servizi; mai valori dell'ambiente.
10. **Outbox e mail**: menzioni subito, alert solo in orario lavorativo; mail di un commento poi eliminato parte comunque (senza testo).

Più, dalla memoria: procedura di cutover e del giorno della partenza (azzeramento, import reale), PIANO_PRODUZIONE, configurazione di deploy (segreti montati, porte, Caddy), installazione reale su HQE-016.
