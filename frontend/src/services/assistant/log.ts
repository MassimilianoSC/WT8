/**
 * Registro dell'assistente (D-170): SOLO metadati per 30 giorni (PH_AI_LOG_TTL_DAYS). Nessun testo di domande,
 * risposte o note, nessun nome di sito, nessun argomento testuale degli strumenti, né qui né nei log Docker.
 * Un errore di scrittura del registro non cambia la risposta all'utente.
 */
import { ObjectId, type Db } from "mongodb";
import { store } from "@/lib/store/db";
import type { AssistantLogDoc } from "@/lib/store/types";
import { assistantConfig } from "./config";

export type AssistantLogEntry = Omit<AssistantLogDoc, "_id" | "userId" | "expiresAt"> & { userId: string };

export async function writeAssistantLog(db: Db, entry: AssistantLogEntry, ttlDays = assistantConfig().logTtlDays): Promise<void> {
  try {
    await store.assistantLog(db).insertOne({
      ...entry,
      _id: new ObjectId(),
      userId: new ObjectId(entry.userId),
      expiresAt: new Date(entry.at.getTime() + ttlDays * 24 * 3600_000),
    });
  } catch (e) {
    console.warn(`[assistente] registro non scritto (${(e as { code?: unknown }).code ?? "errore"})`);
  }
}
