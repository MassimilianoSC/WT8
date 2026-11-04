// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, ObjectId } from "mongodb";
import {
  assertLocalUri,
  backup,
  backupFolderName,
  hostsOf,
  parseArgs,
  redactUri,
  isProductionDb,
  restore,
  verify,
} from "../../scripts/db/backup-db.mjs";

describe("protezioni e utilità", () => {
  it("accetta solo host locali", () => {
    expect(assertLocalUri("mongodb://localhost:27017")).toEqual(["localhost"]);
    expect(assertLocalUri("mongodb://127.0.0.1:27018/db?x=1")).toEqual(["127.0.0.1"]);
    expect(assertLocalUri("mongodb://[::1]:27017")).toEqual(["::1"]);
    expect(assertLocalUri("mongodb://mongo:27017")).toEqual(["mongo"]);
    expect(assertLocalUri("mongodb://user:pw@localhost:27017")).toEqual(["localhost"]);
  });

  it("rifiuta qualunque database remoto", () => {
    expect(() => assertLocalUri("mongodb+srv://u:p@cluster0.abc.mongodb.net/db")).toThrow(/remoto/);
    expect(() => assertLocalUri("mongodb://db.example.com:27017")).toThrow(/non locale/);
    expect(() => assertLocalUri("mongodb://localhost:27017,db2.example.com:27017")).toThrow(/db2.example.com/);
    expect(() => assertLocalUri("mongodb://10.0.0.5:27017")).toThrow(/non locale/);
    expect(() => assertLocalUri("http://localhost")).toThrow(/non valida/);
  });

  it("toglie le credenziali dai log", () => {
    expect(redactUri("mongodb://admin:segreto@localhost:27017")).toBe("mongodb://***@localhost:27017");
    expect(redactUri("mongodb://localhost:27017")).toBe("mongodb://localhost:27017");
  });

  it("legge gli host, anche multipli", () => {
    expect(hostsOf("mongodb://a:1,b:2/x")).toEqual(["a", "b"]);
    expect(hostsOf("non-una-uri")).toBeNull();
  });

  it("nomina la cartella con data e ora di Roma", () => {
    expect(backupFolderName("practicehub", new Date("2026-10-08T10:05:09Z"))).toBe("practicehub_2026-10-08_12-05-09");
    expect(backupFolderName("practicehub", new Date("2026-12-31T23:30:00Z"))).toBe("practicehub_2027-01-01_00-30-00");
    expect(() => backupFolderName("../x")).toThrow();
  });

  it("legge gli argomenti", () => {
    expect(parseArgs(["restore", "--from", "x", "--drop", "--yes"])).toEqual({ _: ["restore"], from: "x", drop: true, yes: true });
  });
});

/**
 * Ciclo completo su un MongoDB LOCALE usa-e-getta: si esegue solo con MONGO_TEST_URL, es.
 *   docker run -d --rm --name ph-test -p 127.0.0.1:27019:27017 mongo:7
 *   MONGO_TEST_URL=mongodb://127.0.0.1:27019 yarn vitest run tests/server/backup-db.test.ts
 * Non va MAI puntato alla 27017 della beta.
 */
const TEST_URL = process.env.MONGO_TEST_URL;
describe.skipIf(!TEST_URL)("ciclo backup → verifica → ripristino (Mongo locale di prova)", () => {
  const SRC = "ph_backup_test_src";
  const DST = "ph_backup_test_dst";
  const quiet = () => {};
  let client: MongoClient;
  let tmp: string;
  let folder: string;
  const id = new ObjectId();
  const when = new Date("2026-10-08T07:00:00Z");

  beforeAll(async () => {
    if (/:27017(\/|$|\?)/.test(TEST_URL!)) throw new Error("MONGO_TEST_URL non deve puntare alla 27017 della beta");
    assertLocalUri(TEST_URL!);
    client = await new MongoClient(TEST_URL!).connect();
    await client.db(SRC).dropDatabase();
    await client.db(DST).dropDatabase();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ph-backup-"));
    const db = client.db(SRC);
    await db.collection("practices").insertMany([
      { _id: id, code: "1AB12345", createdAt: when, teams: { PM: { fields: { "codice-g7": "123" } } }, n: 1.5 },
      ...Array.from({ length: 2500 }, (_, i) => ({ code: `X${i}`, createdAt: when, n: i })),
    ]);
    await db.collection("practices").createIndex({ code: 1 }, { unique: true });
    await db.collection("auth_tokens").insertOne({ token: "t", expiresAt: when });
    await db.collection("auth_tokens").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 3600 });
    await db.createCollection("vuota");
  });

  afterAll(async () => {
    await client?.db(SRC).dropDatabase();
    await client?.db(DST).dropDatabase();
    await client?.close();
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("esporta tutte le collezioni con manifest e checksum", async () => {
    folder = await backup({ uri: TEST_URL!, db: SRC, dir: tmp, log: quiet });
    const manifest = JSON.parse(fs.readFileSync(path.join(folder, "manifest.json"), "utf8"));
    expect(Object.keys(manifest.collections).sort()).toEqual(["auth_tokens", "practices", "vuota"]);
    expect(manifest.collections.practices.count).toBe(2501);
    expect(manifest.collections.practices.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifica un backup integro, anche confrontando il database", async () => {
    const r = await verify({ from: folder, compare: { uri: TEST_URL!, db: SRC }, log: quiet });
    expect(r.problemi).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("senza --yes il ripristino è solo un'anteprima", async () => {
    const r = await restore({ from: folder, uri: TEST_URL!, db: DST, log: quiet, dir: tmp });
    expect(r.eseguito).toBe(false);
    expect(await client.db(DST).listCollections().toArray()).toHaveLength(0);
  });

  it("ripristina tipi, documenti e indici", async () => {
    const r = await restore({ from: folder, uri: TEST_URL!, db: DST, yes: true, log: quiet, dir: tmp });
    expect(r.eseguito).toBe(true);
    const db = client.db(DST);
    expect(await db.collection("practices").countDocuments()).toBe(2501);
    const doc = await db.collection("practices").findOne({ _id: id });
    expect(doc?._id).toBeInstanceOf(ObjectId);
    expect(doc?.createdAt).toBeInstanceOf(Date);
    expect(doc?.createdAt.getTime()).toBe(when.getTime());
    expect(doc?.teams.PM.fields["codice-g7"]).toBe("123");
    const idx = await db.collection("practices").indexes();
    expect(idx.find((i) => i.name === "code_1")?.unique).toBe(true);
    const ttl = await db.collection("auth_tokens").indexes();
    expect(ttl.find((i) => i.name === "expiresAt_1")?.expireAfterSeconds).toBe(3600);
    expect((await db.listCollections({ name: "vuota" }).toArray())).toHaveLength(1);
  });

  it("rifiuta un database di destinazione non vuoto senza --drop", async () => {
    await expect(restore({ from: folder, uri: TEST_URL!, db: DST, yes: true, log: quiet, dir: tmp })).rejects.toThrow(/non vuoto/);
  });

  it("con --drop salva prima un backup di sicurezza", async () => {
    await client.db(DST).collection("practices").insertOne({ code: "SOLO_NEL_DST" });
    const r = await restore({ from: folder, uri: TEST_URL!, db: DST, yes: true, drop: true, log: quiet, dir: tmp });
    expect(r.sicurezza).toBeTruthy();
    const safety = JSON.parse(fs.readFileSync(path.join(r.sicurezza!, "manifest.json"), "utf8"));
    expect(safety.collections.practices.count).toBe(2502);
    expect(await client.db(DST).collection("practices").countDocuments({ code: "SOLO_NEL_DST" })).toBe(0);
  });

  it("D-158: su practicehub_prod rifiuto senza --consenti-esercizio; con il flag copia di sicurezza sempre, anche a collezioni vuote", async () => {
    const PROD = "practicehub_prod";
    expect(isProductionDb(PROD)).toBe(true);
    try {
      await client.db(PROD).dropDatabase();
      await client.db(PROD).createCollection("vuota_in_esercizio");
      await expect(restore({ from: folder, uri: TEST_URL!, db: PROD, yes: true, log: quiet, dir: tmp })).rejects.toThrow(/esercizio.*--consenti-esercizio/);
      // Senza --yes resta un'anteprima anche col flag.
      expect(await restore({ from: folder, uri: TEST_URL!, db: PROD, allowProduction: true, log: quiet, dir: tmp })).toMatchObject({ eseguito: false });
      const r = await restore({ from: folder, uri: TEST_URL!, db: PROD, yes: true, allowProduction: true, log: quiet, dir: tmp });
      expect(r.eseguito).toBe(true);
      expect(r.sicurezza).toBeTruthy();
      expect(fs.existsSync(path.join(r.sicurezza!, "manifest.json"))).toBe(true);
    } finally {
      await client.db(PROD).dropDatabase();
    }
  });

  it("rileva un file modificato e blocca il ripristino", async () => {
    const file = path.join(folder, "practices.ndjson");
    fs.appendFileSync(file, '{"_id":{"$oid":"000000000000000000000000"}}\n');
    const r = await verify({ from: folder, log: quiet });
    expect(r.ok).toBe(false);
    expect(r.problemi.join(" ")).toMatch(/SHA-256/);
    await expect(restore({ from: folder, uri: TEST_URL!, db: "ph_backup_test_x", yes: true, log: quiet, dir: tmp })).rejects.toThrow(/non integro/);
  });
});
