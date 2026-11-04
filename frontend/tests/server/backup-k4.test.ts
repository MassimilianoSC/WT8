// @vitest-environment node
/**
 * K4 (PR-01, D-144): copie notturne. Conservazione provata con date simulate (D-156), orario notturno di Roma ai cambi
 * d'ora, giro completo sul replica set usa-e-getta (MONGO_RS_TEST_URL).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient } from "mongodb";
import { restore } from "../../scripts/db/backup-db.mjs";
import { applyRetention, parseBackupFolder, romeDay, selectToKeep } from "../../scripts/db/backup-retention.mjs";
import { lastSuccessfulRun, nextRunAt, romeLocalToInstant, runBackupOnce } from "../../scripts/db/backup-service.mjs";

const DB = "practicehub_prod";
/** Nome di cartella per una copia fatta alle 01:30 di Roma del giorno `day`, con i secondi opzionali. */
const folderAt = (db: string, instant: Date) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(instant)
      .map((x) => [x.type, x.value])
  );
  return `${db}_${p.year}-${p.month}-${p.day}_${p.hour}-${p.minute}-${p.second}`;
};
const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => new Date(new Date(`${from}T00:30:00Z`).getTime() + i * 86_400_000));

describe("conservazione con date simulate (14 giorni, 13 settimane, 12 mesi)", () => {
  it("una copia per notte per 420 giorni, conservazione ogni notte: restano solo quelle previste", () => {
    let present: string[] = [];
    let now = new Date();
    for (const night of days("2025-08-01", 420)) {
      present.push(folderAt(DB, night));
      now = night;
      const keep = selectToKeep(present, DB, now);
      present = present.filter((n) => keep.has(n));
    }
    const today = romeDay(now);
    const parsed = present.map((n) => parseBackupFolder(n)!).sort((a, b) => (a.stamp < b.stamp ? 1 : -1));
    // Gli ultimi 14 giorni ci sono tutti.
    const lastDays = new Set(parsed.slice(0, 14).map((p) => p.day));
    expect(lastDays.size).toBe(14);
    expect(parsed[0].day).toBe(today);
    // Nulla oltre 12 mesi; al massimo 14 + 13 + 12 copie (in pratica meno, perché le regole si sovrappongono).
    const oldest = parsed[parsed.length - 1].day;
    expect(oldest >= `${Number(today.slice(0, 4)) - 1}${today.slice(4, 7)}-01`).toBe(true);
    expect(present.length).toBeLessThanOrEqual(14 + 13 + 12);
    expect(present.length).toBeGreaterThanOrEqual(14 + 9);
    // Una per mese negli ultimi 12 mesi.
    expect(new Set(parsed.map((p) => p.day.slice(0, 7))).size).toBe(12);
  });

  it("più copie nello stesso giorno: tiene la più recente; il giorno di oggi resta comunque", () => {
    const names = [`${DB}_2026-10-09_01-30-00`, `${DB}_2026-10-09_14-00-00`, `${DB}_2026-10-08_01-30-00`, `${DB}_2026-10-08_09-15-00`];
    const keep = selectToKeep(names, DB, new Date("2026-10-09T15:00:00Z"));
    expect([...keep].sort()).toEqual([`${DB}_2026-10-08_09-15-00`, `${DB}_2026-10-09_14-00-00`]);
  });

  it("PC spento per settimane: le copie vecchie restano finché coprono settimane e mesi", () => {
    const names = [...days("2026-06-01", 30), ...days("2026-09-20", 3)].map((d) => folderAt(DB, d));
    const keep = selectToKeep(names, DB, new Date("2026-09-22T12:00:00Z"));
    // 3 giorni recenti; giugno: l'ultima di ogni settimana fuori dalle 13 settimane non si tiene, ma l'ultima del mese sì.
    expect([...keep].filter((n) => n.includes("_2026-09-2"))).toHaveLength(3);
    expect([...keep].some((n) => n.includes("_2026-06-30") || n.includes("_2026-07-0"))).toBe(true);
  });

  it("altri database, nomi non riconosciuti e copie con data futura (orologio indietro) non si cancellano", () => {
    const names = [`${DB}_2027-01-01_01-30-00`, `practicehub_collaudo_2020-01-01_01-30-00`, "appunti", `${DB}_2020-01-01_01-30-00`];
    const keep = selectToKeep(names, DB, new Date("2026-10-09T12:00:00Z"));
    expect(keep.has(`${DB}_2027-01-01_01-30-00`)).toBe(true);
    expect(keep.has(`${DB}_2020-01-01_01-30-00`)).toBe(true); // è la più recente non futura
  });
});

describe("conservazione sul filesystem", () => {
  let dir: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ph-k4-"));
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("cancella solo copie valide del database indicato; sicurezza, non valide, altri database e file restano", () => {
    const mk = (name: string, manifest = true) => {
      fs.mkdirSync(path.join(dir, name), { recursive: true });
      if (manifest) fs.writeFileSync(path.join(dir, name, "manifest.json"), "{}");
    };
    const old = days("2025-01-01", 20).map((d) => folderAt(DB, d));
    old.forEach((n) => mk(n));
    mk(`${DB}_2026-10-09_01-30-00`);
    mk(`${DB}_2024-01-01_01-30-00`, false); // senza manifest: incompleta, non si tocca
    mk(`${DB}_2025-01-02_01-30-00_NON_VALIDA`);
    mk(`practicehub_collaudo_2025-01-01_01-30-00`);
    mk(`sicurezza/${DB}_2025-01-01_01-30-00`);
    fs.writeFileSync(path.join(dir, "LEGGIMI.txt"), "x");
    const r = applyRetention({ dir, db: DB, now: new Date("2026-10-09T12:00:00Z"), log: () => {} });
    expect(r.kept).toEqual([`${DB}_2026-10-09_01-30-00`]);
    expect(r.removed).toHaveLength(20);
    const left = fs.readdirSync(dir).sort();
    expect(left).toEqual(
      [`${DB}_2024-01-01_01-30-00`, `${DB}_2025-01-02_01-30-00_NON_VALIDA`, `${DB}_2026-10-09_01-30-00`, "LEGGIMI.txt", `practicehub_collaudo_2025-01-01_01-30-00`, "sicurezza"].sort()
    );
  });
});

describe("orario notturno di Roma", () => {
  it("01:30 di Roma, giorno dopo se già passata, ora legale e solare", () => {
    expect(nextRunAt(new Date("2026-10-09T12:00:00Z"))).toEqual(new Date("2026-10-09T23:30:00Z")); // 10/10 01:30 CEST
    expect(nextRunAt(new Date("2026-10-09T23:00:00Z"))).toEqual(new Date("2026-10-09T23:30:00Z"));
    expect(nextRunAt(new Date("2026-10-09T23:30:00Z"))).toEqual(new Date("2026-10-10T23:30:00Z"));
    // Notte del ritorno all'ora solare (25/10): 01:30 esiste una volta, in CEST.
    expect(nextRunAt(new Date("2026-10-24T12:00:00Z"))).toEqual(new Date("2026-10-24T23:30:00Z"));
    expect(nextRunAt(new Date("2026-10-25T12:00:00Z"))).toEqual(new Date("2026-10-26T00:30:00Z")); // 26/10 01:30 CET
    // Notte del passaggio all'ora legale (29/03): 02:30 non esiste → subito dopo il salto.
    expect(romeLocalToInstant("2026-03-29", 2, 30)).toEqual(new Date("2026-03-29T01:30:00Z"));
    expect(nextRunAt(new Date("2026-03-28T12:00:00Z"), "01:30")).toEqual(new Date("2026-03-29T00:30:00Z"));
    expect(() => nextRunAt(new Date(), "1h30")).toThrow(/PH_BACKUP_TIME/);
  });
});

const URL_RS = process.env.MONGO_RS_TEST_URL;
describe.skipIf(!URL_RS)("giro completo sul replica set usa-e-getta", () => {
  let client: MongoClient;
  let dir: string;
  const SRC = `practicehub_test_k4_${Date.now()}`;
  const SRC_LEGACY = `${SRC}_legacy`;
  const COLLAUDO = "practicehub_collaudo";

  beforeAll(async () => {
    client = await new MongoClient(URL_RS!).connect();
    await client.db(SRC).collection("practices").insertMany([{ n: 1 }, { n: 2 }]);
    await client.db(SRC_LEGACY).collection("users").insertOne({ email: "a@b" });
    // Collezioni che il giro scrive, create qui (margine dell'hook) e non durante la prova sotto carico.
    await client.db(SRC).createCollection("backup_runs");
    await client.db(COLLAUDO).dropDatabase();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ph-k4-run-"));
  });
  afterAll(async () => {
    for (const d of [SRC, SRC_LEGACY, COLLAUDO]) await client?.db(d).dropDatabase();
    await client?.close();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("copia e verifica di entrambi i database, esito registrato, ripristino di prova su practicehub_collaudo", async () => {
    const run = await runBackupOnce({ uri: URL_RS!, dbs: [SRC, SRC_LEGACY], statusDb: SRC, dir, log: () => {} });
    expect(run.ok).toBe(true);
    expect(run.databases.map((d) => [d.db, d.ok, d.documents])).toEqual([
      [SRC, true, 2],
      [SRC_LEGACY, true, 1],
    ]);
    const folder = path.join(dir, run.databases[0].folder!);
    expect(JSON.parse(fs.readFileSync(path.join(folder, "manifest.json"), "utf8")).snapshot).toBe(true); // coerente nel tempo
    expect(await lastSuccessfulRun({ uri: URL_RS!, statusDb: SRC })).toMatchObject({ ok: true });
    // Prova di ripristino (PR-03): solo su practicehub_collaudo, mai su practicehub_prod (D-158).
    const r = await restore({ from: folder, uri: URL_RS!, db: COLLAUDO, yes: true, log: () => {}, dir });
    expect(r.eseguito).toBe(true);
    expect(await client.db(COLLAUDO).collection("practices").countDocuments()).toBe(2);
  });

  it("errore di un database: esito non riuscito registrato con il motivo, gli altri proseguono", async () => {
    const blocked = path.join(dir, "file-al-posto-della-cartella");
    fs.writeFileSync(blocked, "x");
    const run = await runBackupOnce({ uri: URL_RS!, dbs: [SRC], statusDb: SRC, dir: blocked, log: () => {} });
    expect(run.ok).toBe(false);
    expect(run.databases[0]).toMatchObject({ db: SRC, ok: false, error: expect.any(String) });
    const last = await client.db(SRC).collection("backup_runs").find().sort({ startedAt: -1 }).limit(1).next();
    expect(last).toMatchObject({ ok: false });
    // L'ultimo giro RIUSCITO resta quello di prima (per l'età dell'ultima copia, K5).
    expect(await lastSuccessfulRun({ uri: URL_RS!, statusDb: SRC })).toMatchObject({ ok: true });
  });
});
