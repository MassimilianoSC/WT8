/**
 * Lettura dell'aggregato della pratica dal database _v2 (B5b). Nessuna scrittura (D-104). Con `session` le
 * letture partecipano alla transazione di un comando.
 */
import { ObjectId, type ClientSession, type Db } from "mongodb";
import type { UserDTO } from "@/lib/contract";
import { canSeePractice } from "@/lib/engines/access";
import { HttpError } from "@/lib/http-error";
import type { PracticeAggregate } from "@/lib/practice/detail";
import { store } from "@/lib/store/db";
import type { IterationDoc, PracticeDoc } from "@/lib/store/types";

export const notFound = () => new HttpError("Pratica non trovata", 404);

export function parsePracticeId(id: string): ObjectId {
  if (!/^[0-9a-f]{24}$/i.test(id)) throw notFound();
  return new ObjectId(id);
}

/** Pratica visibile all'utente, altrimenti 404 (una pratica non visibile non si distingue da una inesistente). */
export async function loadVisiblePractice(db: Db, user: UserDTO, id: ObjectId, session?: ClientSession): Promise<PracticeDoc> {
  const practice = await store.practices(db).findOne({ _id: id }, { session });
  if (!practice || !canSeePractice(user, practice)) throw notFound();
  return practice;
}

/**
 * Aggregato con l'iterazione `n` (assente = corrente), le sue righe e l'elenco delle iterazioni.
 * 404 se l'iterazione richiesta non esiste.
 */
export async function loadAggregate(db: Db, practice: PracticeDoc, n?: number, session?: ClientSession): Promise<PracticeAggregate> {
  const iterations = await store.iterations(db)
    .find({ practiceId: practice._id }, { session, projection: { _id: 1, n: 1, values: 1, createdAt: 1 } })
    .sort({ n: 1 })
    .toArray();
  const filter = n === undefined ? { _id: practice.currentIterationId } : { practiceId: practice._id, n };
  const iteration: IterationDoc | null = await store.iterations(db).findOne(filter, { session });
  if (!iteration) throw new HttpError(n === undefined ? "Iterazione corrente mancante" : `Iterazione ${n} non trovata`, 404);
  const rows = await store.repeatRows(db).find({ iterationId: iteration._id }, { session }).sort({ groupKey: 1, ordinal: 1 }).toArray();
  return { practice, iteration, rows, iterations };
}
