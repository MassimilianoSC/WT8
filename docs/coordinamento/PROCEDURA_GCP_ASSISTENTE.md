# Procedura per M — Progetto Google Cloud dell'assistente AI

*Scritta dalla memoria il 09/10/2026 (D-167, D-168, D-172). Tempo stimato: 20–30 minuti. I nomi dei menu possono variare leggermente nella console di Google.*

1. **Crea il progetto.** Apri <https://console.cloud.google.com> → selettore dei progetti in alto → **Nuovo progetto**.
   - Nome: `practicehub-assistente`; organizzazione: quella aziendale, se c'è.
   - Annota l'**ID del progetto**: è sotto il nome e può essere diverso dal nome, per esempio `practicehub-assistente-123456`.
2. **Collega la fatturazione.** Menu → **Fatturazione** → collega il progetto a un account di fatturazione, oppure creane uno.
3. **Attiva Vertex AI.** Menu → **API e servizi** → **Libreria** → cerca **Vertex AI API** → **Abilita**.
4. **Crea l'account di servizio.** Menu → **IAM e amministrazione** → **Account di servizio** → **Crea account di servizio**.
   - Nome: `practicehub-assistente`.
   - Ruolo: **Vertex AI User** (`roles/aiplatform.user`). Solo questo, **non** Proprietario né Editor.
   - Salta il passo facoltativo "concedi agli utenti l'accesso".
5. **Crea la chiave.** Apri l'account appena creato → scheda **Chiavi** → **Aggiungi chiave** → **Crea nuova chiave** → **JSON**. Si scarica un file.
   - Crea la cartella `D:\PracticeHub\segreti\` e sposta lì il file, rinominato `vertex-assistant.json`.
   - Cancella la copia rimasta in Download.
   - **Non** mandarlo in chat o per mail e **non** metterlo nella cartella del progetto.
   - Facoltativo: in Proprietà → Sicurezza della cartella `segreti`, lascia l'accesso solo a te e agli Administrators.
   - **Se la creazione della chiave è bloccata** ("service account key creation is disabled"): è un criterio dell'organizzazione che Google attiva di default sulle organizzazioni recenti. Fermati e dimmelo: ci sono due strade (un'eccezione al criterio per questo progetto, oppure un accesso senza chiave), e scegliamo insieme.
6. **Imposta il budget.** Menu → **Fatturazione** → **Budget e avvisi** → **Crea budget**.
   - Ambito: solo questo progetto.
   - Importo: **50** al mese, nella valuta dell'account di fatturazione.
   - Soglie: **50%, 90%, 100%** della spesa effettiva, con avviso via mail a te.
7. **La regione non si imposta qui:** la verifica o2 nel prototipo (Milano se c'è il modello, altrimenti un'altra regione UE, che ti comunico prima).
8. **Comunica alla memoria:**
   - l'**ID del progetto**;
   - la **valuta** dell'account di fatturazione (EUR o USD);
   - la conferma che la chiave è in `D:\PracticeHub\segreti\vertex-assistant.json`.

   **Mai** il contenuto della chiave.
