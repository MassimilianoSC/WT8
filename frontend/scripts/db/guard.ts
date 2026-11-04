/**
 * Protezione comune degli script che SCRIVONO sul database (reset, seed): solo host locali (D-9) e mai il
 * database della beta (D-87) senza un flag esplicito, che comunque richiede il via di Massimiliano (R-15).
 */
import { assertLocalUri, isProductionDb } from "./backup-db.mjs";

/** Database della beta (dati veri, D-87) e del suo modello nuovo sullo stesso server (D-104). */
export const BETA_DB_NAMES = ["practicehub", "practicehub_v2"];
export const BETA_PORT = 27017;

/** Porte esplicite della stringa di connessione (27017 se assente, come fa il driver). */
export function portsOf(uri: string): number[] {
  const m = /^mongodb:\/\/(?:[^@/]*@)?([^/?]+)/i.exec(uri);
  if (!m) return [];
  return m[1].split(",").map((h) => {
    const p = /:(\d+)$/.exec(h.replace(/^\[[^\]]*\]/, "")); // "[::1]:27018" → ":27018"
    return p ? Number(p[1]) : BETA_PORT;
  });
}

export function assertDisposableTarget(uri: string, dbName: string, allowBeta = false, allowProduction = false): void {
  assertLocalUri(uri);
  if (!dbName) throw new Error("Indica il database con --db (nessun valore predefinito).");
  // D-158: il database di esercizio del nuovo stack si tocca solo con il SUO flag (non quello della beta).
  if (isProductionDb(dbName) && !allowProduction) {
    throw new Error(`Rifiutato: "${dbName}" è il database di esercizio (D-158). Serve --consenti-esercizio.`);
  }
  if (allowBeta) return;
  if (portsOf(uri).includes(BETA_PORT)) {
    throw new Error(`Rifiutato: la porta ${BETA_PORT} è il Mongo della beta (dati veri, D-87). Serve --consenti-beta e il via di Massimiliano.`);
  }
  if (BETA_DB_NAMES.includes(dbName)) {
    throw new Error(`Rifiutato: "${dbName}" è il database della beta (D-87). Serve --consenti-beta e il via di Massimiliano.`);
  }
}
