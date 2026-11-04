// @vitest-environment node
/**
 * K6 (PR-27): il database dichiara la versione dei dati e l'avvio rifiuta versioni incompatibili, senza migrare da sé.
 *   MONGO_RS_TEST_URL="mongodb://127.0.0.1:27021/?directConnection=true" yarn vitest run tests/server/data-version.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoClient, ObjectId } from "mongodb";
import { assertDataVersion, bootstrapStore, DATA_VERSION, DataVersionError, dataVersionProblem, store } from "@/lib/store/db";
import { getHealth } from "@/services/health";
import { assertDisposableTarget } from "../../scripts/db/guard";

// Prove che creano database sul replica set: sotto il carico della suite completa 30 s non bastano (timeout visti
// l'11/10/2026 con la macchina carica). Un blocco vero resta un errore entro 90 s; i limiti espliciti più alti restano.
vi.setConfig({ testTimeout: 90_000 });

describe("compatibilità", () => {
  it("uguale → nessun problema; più recente → ritorno indietro senza ripristino; più vecchia → serve la migrazione", () => {
    expect(dataVersionProblem(DATA_VERSION)).toBeNull();
    expect(dataVersionProblem(DATA_VERSION + 1)).toMatch(/più recente.*ritorno indietro/);
    expect(dataVersionProblem(1, 2)).toMatch(/richiede la 2.*migrazione/);
  });
});

const URL_RS = process.env.MONGO_RS_TEST_URL;
describe.skipIf(!URL_RS)("versione dei dati sul replica set usa-e-getta", () => {
  let client: MongoClient;
  const base = `practicehub_test_dataver_${Date.now()}`;
  const names: string[] = [];
  const fresh = (suffix: string) => {
    const name = `${base}_${suffix}`;
    assertDisposableTarget(URL_RS!, name);
    names.push(name);
    return client.db(name);
  };

  beforeAll(async () => {
    client = await new MongoClient(URL_RS!).connect();
  });
  afterAll(async () => {
    for (const n of names) await client?.db(n).dropDatabase();
    await client?.close();
  });

  it("database nuovo: il bootstrap registra la versione del programma, una volta sola", async () => {
    const db = fresh("nuovo");
    await bootstrapStore(db);
    await bootstrapStore(db);
    const doc = await store.meta(db).findOne({ _id: "data_version" });
    expect(doc).toMatchObject({ version: DATA_VERSION, history: [{ version: DATA_VERSION, by: "database nuovo" }] });
    expect((await getHealth(db)).checks.dati).toMatchObject({ ok: true, detail: `versione ${DATA_VERSION}` });
  });

  it("database con pratiche e senza versione (creato prima): vale 1", async () => {
    const db = fresh("esistente");
    await store.practices(db).insertOne({ _id: new ObjectId() } as never);
    expect(await assertDataVersion(db, new Date(), 1)).toBe(1);
    expect(await store.meta(db).findOne({ _id: "data_version" })).toMatchObject({ version: 1, history: [{ by: "rilevata (dati esistenti)" }] });
  });

  it("dati più recenti del programma (immagine vecchia senza ripristino): l'avvio si ferma senza scrivere", async () => {
    const db = fresh("futuro");
    await store.meta(db).insertOne({ _id: "data_version", version: DATA_VERSION + 1, setAt: new Date(), history: [] });
    await expect(bootstrapStore(db)).rejects.toBeInstanceOf(DataVersionError);
    expect(await db.listCollections({ name: "templates" }).toArray()).toEqual([]); // nessuna scrittura del bootstrap
    expect((await getHealth(db)).checks.dati).toMatchObject({ ok: false, detail: expect.stringMatching(/più recente/) });
  });

  it("dati più vecchi: serve la migrazione esplicita (l'avvio non migra)", async () => {
    const db = fresh("vecchio");
    await store.meta(db).insertOne({ _id: "data_version", version: 1, setAt: new Date(), history: [] });
    await expect(assertDataVersion(db, new Date(), 2)).rejects.toThrow(/migrazione/);
    expect((await store.meta(db).findOne({ _id: "data_version" }))!.version).toBe(1);
  });
});
