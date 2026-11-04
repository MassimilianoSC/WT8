#!/usr/bin/env node
/**
 * MongoDB usa-e-getta in replica set a un nodo (D-90: transazioni negli ambienti di prova e anteprima).
 * Mai sulla porta 27017 della beta (D-87). Il container usa --rm: i dati spariscono quando si ferma.
 *
 *   node scripts/db/mongo-rs.mjs start [--name N] [--port P]   → stampa la stringa di connessione
 *   node scripts/db/mongo-rs.mjs stop  [--name N]
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { MongoClient } from "mongodb";
import { parseArgs } from "./backup-db.mjs";

export const DEFAULT_RS_NAME = "practicehub-rs-test";
const IMAGE = "mongo:7";

function docker(args) {
  return spawnSync("docker", args, { encoding: "utf8" });
}

export const replicaSetUri = (port) => `mongodb://127.0.0.1:${port}/?directConnection=true`;

/** Avvia (o riavvia) il container e attende un PRIMARY scrivibile. Restituisce la stringa di connessione. */
export async function startReplicaSet({ name = DEFAULT_RS_NAME, port = 27021 } = {}) {
  if (port === 27017) throw new Error("Rifiutato: 27017 è il Mongo della beta (D-87)");
  docker(["rm", "-f", name]);
  const run = docker(["run", "-d", "--rm", "--name", name, "-p", `127.0.0.1:${port}:27017`, IMAGE, "--replSet", "rs0", "--bind_ip_all"]);
  if (run.status !== 0) throw new Error(`docker run fallito: ${run.stderr.trim()}`);
  const uri = replicaSetUri(port);
  for (let i = 0; i < 60; i++) {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 1000 });
    try {
      await client.connect();
      const admin = client.db("admin");
      const hello = await admin.command({ hello: 1 });
      if (hello.isWritablePrimary) return uri;
      if (!hello.setName) {
        await admin.command({ replSetInitiate: { _id: "rs0", members: [{ _id: 0, host: "127.0.0.1:27017" }] } }).catch(() => {});
      }
    } catch {
      /* il server non è ancora pronto */
    } finally {
      await client.close().catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Il replica set non è diventato PRIMARY entro 60 secondi");
}

export function stopReplicaSet(name = DEFAULT_RS_NAME) {
  docker(["rm", "-f", name]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = parseArgs(process.argv.slice(2));
  const name = typeof args.name === "string" ? args.name : DEFAULT_RS_NAME;
  if (args._[0] === "start") {
    startReplicaSet({ name, port: args.port ? Number(args.port) : undefined })
      .then((uri) => console.log(uri))
      .catch((e) => {
        console.error(`ERRORE: ${e.message}`);
        process.exitCode = 1;
      });
  } else if (args._[0] === "stop") {
    stopReplicaSet(name);
  } else {
    console.log("Uso: mongo-rs.mjs start|stop [--name N] [--port P]");
  }
}
