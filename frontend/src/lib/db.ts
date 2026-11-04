import { MongoClient } from "mongodb";

/**
 * Client MongoDB condiviso, salvato sul global di Node (sopravvive al ricaricamento di Next in sviluppo).
 * Dal cutover (3.5) nessun setup e nessun seed all'avvio (PR-04): il database del modello nuovo lo prepara
 * lib/store/db.ts (indici e dati di base, mai dati di prova) e il primo ADMIN services/first-admin.ts.
 * MONGO_URL si legge solo alla prima connessione: `next build` importa il modulo senza variabili d'ambiente.
 */
interface GlobalMongo {
  client: MongoClient | null;
  promise: Promise<MongoClient> | null;
}

const globalForMongo = global as unknown as { _mongo?: GlobalMongo };
const cache: GlobalMongo =
  globalForMongo._mongo ?? (globalForMongo._mongo = { client: null, promise: null });

/** Client Mongo condiviso (lib/store/, servizi, worker). */
export async function getClient(): Promise<MongoClient> {
  if (cache.client) return cache.client;
  const uri = process.env.MONGO_URL;
  if (!uri) throw new Error("MONGO_URL is not set");
  if (!cache.promise) {
    cache.promise = new MongoClient(uri, {}).connect();
  }
  cache.client = await cache.promise;
  return cache.client;
}
