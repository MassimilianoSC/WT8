// @vitest-environment node
/**
 * K5 (PR-15, PR-16, PR-17): stato di salute per il controllo esterno. Replica set usa-e-getta:
 *   MONGO_RS_TEST_URL="mongodb://127.0.0.1:27021/?directConnection=true" yarn vitest run tests/server/health.test.ts
 */
import os from "node:os";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { store } from "@/lib/store/db";
import { DEFAULT_THRESHOLDS, getHealth, thresholdsFromEnv } from "@/services/health";
import { recordProviderFailure, recordProviderSuccess, resetCircuit } from "@/services/assistant/circuit";
import { assistantConfig } from "@/services/assistant/config";
import { backupHeartbeat, diskOf } from "../../scripts/db/backup-service.mjs";
import { assertDisposableTarget } from "../../scripts/db/guard";

const URL_RS = process.env.MONGO_RS_TEST_URL;
const now = new Date("2026-10-09T10:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const GB = 1024 ** 3;

describe("soglie", () => {
  it("spazio minimo da PH_DISK_MIN_FREE_GB, altrimenti 20 GB", () => {
    expect(thresholdsFromEnv({} as NodeJS.ProcessEnv).diskMinFreeBytes).toBe(20 * GB);
    expect(thresholdsFromEnv({ PH_DISK_MIN_FREE_GB: "50" } as unknown as NodeJS.ProcessEnv).diskMinFreeBytes).toBe(50 * GB);
  });
  it("spazio della cartella misurato con statfs", () => {
    const d = diskOf(os.tmpdir());
    expect(d.totalBytes).toBeGreaterThan(0);
    expect(d.freeBytes).toBeGreaterThanOrEqual(0);
    expect(d.freeBytes).toBeLessThanOrEqual(d.totalBytes);
  });
});

describe.skipIf(!URL_RS)("salute sul replica set usa-e-getta", () => {
  let client: MongoClient;
  let db: Db;
  const DB = `practicehub_test_health_${Date.now()}`;

  const beat = (id: "worker" | "backup", set: Record<string, unknown>) =>
    store.heartbeats(db).updateOne({ _id: id }, { $set: { owner: "t", startedAt: ago(3_600_000), ...set } }, { upsert: true });
  const run = (startedAt: Date, ok: boolean) =>
    store.backupRuns(db).insertOne({ _id: new ObjectId(), startedAt, endedAt: startedAt, ok, databases: [{ db: "practicehub_prod", ok, ...(ok ? {} : { error: "x" }) }] });

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    client = await new MongoClient(URL_RS!).connect();
    db = client.db(DB);
    // Collezioni create qui (margine dell'hook): sotto il carico dell'intera suite la prima scrittura in un database
    // nuovo può attendere a lungo la creazione dei database delle altre prove.
    for (const c of ["service_heartbeats", "backup_runs"]) await db.createCollection(c);
  });
  afterAll(async () => {
    await client?.db(DB).dropDatabase();
    await client?.close();
  });

  it("stack appena nato: database ok, il resto da segnalare con il motivo", async () => {
    const h = await getHealth(db, now);
    expect(h.status).toBe("degraded");
    expect(h.checks.database).toEqual({ ok: true, detail: "risponde" });
    expect(h.checks.worker).toMatchObject({ ok: false, detail: "nessun battito registrato" });
    expect(h.checks.copie).toMatchObject({ ok: false, detail: "nessuna copia ancora fatta" });
    expect(h.checks.disco.ok).toBe(false);
  });

  it("tutto in ordine → ok", async () => {
    await beat("worker", { at: ago(20_000), clockSkewMs: 1200 });
    await beat("backup", { at: ago(30_000), disk: { path: "/backups", freeBytes: 3000 * GB, totalBytes: 4000 * GB } });
    await run(ago(8 * 3_600_000), true);
    const h = await getHealth(db, now);
    expect(h.status, JSON.stringify(h.checks)).toBe("ok");
    expect(h.checks.copie.detail).toBe("ultima copia riuscita 8 h fa");
  });

  it("worker fermo, orologio sbagliato, copia fallita dopo l'ultima riuscita, disco quasi pieno", async () => {
    await beat("worker", { at: ago(DEFAULT_THRESHOLDS.workerStaleMs + 60_000), clockSkewMs: -95_000 });
    await beat("backup", { at: ago(30_000), disk: { path: "/backups", freeBytes: 15 * GB, totalBytes: 4000 * GB } });
    await run(ago(2 * 3_600_000), false);
    const h = await getHealth(db, now);
    expect(h.status).toBe("degraded");
    expect(h.checks.worker).toMatchObject({ ok: false, detail: "ultimo battito 6 min fa" });
    expect(h.checks.orologio).toMatchObject({ ok: false, detail: expect.stringContaining("-95 s") });
    expect(h.checks.copie).toMatchObject({ ok: false, detail: expect.stringContaining("ultimo giro fallito (practicehub_prod)") });
    expect(h.checks.disco).toMatchObject({ ok: false, detail: "15.0 GB liberi su 4000.0 GB nella cartella delle copie" });
  });

  it("ultima copia riuscita troppo vecchia (PC spento di notte, servizio fermo)", async () => {
    await store.backupRuns(db).deleteMany({});
    await run(ago(30 * 3_600_000), true);
    expect((await getHealth(db, now)).checks.copie).toMatchObject({ ok: false, detail: "ultima copia riuscita 30 h fa" });
  });

  it("battito del servizio di copia con lo spazio della cartella", async () => {
    await backupHeartbeat({ client, statusDb: DB, dir: os.tmpdir(), owner: "prova", startedAt: now, now });
    const b = await store.heartbeats(db).findOne({ _id: "backup" });
    expect(b).toMatchObject({ owner: "prova", at: now, disk: { path: os.tmpdir() } });
    expect(b!.disk!.totalBytes).toBeGreaterThan(0);
  });

  it("assistente: ok se spento o pronto; degraded (mai down) con configurazione errata o circuito aperto", async () => {
    const env = (e: Record<string, string>) => assistantConfig(e as unknown as NodeJS.ProcessEnv);
    resetCircuit();
    expect((await getHealth(db, now, DEFAULT_THRESHOLDS, env({}))).checks.assistente).toEqual({ ok: true, detail: "spento (PH_AI_ENABLED)" });
    const fake = env({ PH_AI_ENABLED: "true", PH_AI_PROVIDER: "fake" });
    expect((await getHealth(db, now, DEFAULT_THRESHOLDS, fake)).checks.assistente).toMatchObject({ ok: true, detail: expect.stringContaining("pronto") });
    const broken = await getHealth(db, now, DEFAULT_THRESHOLDS, env({ PH_AI_ENABLED: "true", PH_AI_PROVIDER: "vertex", PH_AI_LOCATION: "global" }));
    expect(broken.checks.assistente).toMatchObject({ ok: false, detail: expect.stringContaining("configurazione non valida") });
    expect(broken.status).toBe("degraded");
    for (let i = 0; i < 5; i++) recordProviderFailure(now);
    expect((await getHealth(db, now, DEFAULT_THRESHOLDS, fake)).checks.assistente).toMatchObject({ ok: false, detail: expect.stringContaining("guasti ripetuti") });
    recordProviderSuccess(now);
    expect((await getHealth(db, now, DEFAULT_THRESHOLDS, fake)).checks.assistente.ok).toBe(true);
    await store.assistantSettings(db).insertOne({ _id: "global", enabled: false, dailyLimit: 30, perMinuteLimit: 4, revision: 1, updatedAt: now, updatedBy: null, updatedByName: null });
    expect((await getHealth(db, now, DEFAULT_THRESHOLDS, fake)).checks.assistente).toEqual({ ok: true, detail: "spento dall'amministratore" });
    resetCircuit();
  });

  it("rotta: 200 con il rapporto; 503 se il database non risponde", async () => {
    vi.resetModules();
    vi.doMock("@/lib/store/db", async (orig) => ({ ...(await orig<object>()), getStoreDb: async () => db }));
    const ok = await (await import("@/app/api/health/route")).GET();
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { checks: object }).checks).toHaveProperty("database");
    vi.resetModules();
    vi.doMock("@/lib/store/db", async (orig) => ({ ...(await orig<object>()), getStoreDb: async () => { throw new Error("giù"); } }));
    const down = await (await import("@/app/api/health/route")).GET();
    expect(down.status).toBe(503);
    expect(down.headers.get("cache-control")).toBe("no-store");
    vi.doUnmock("@/lib/store/db");
  });
});
