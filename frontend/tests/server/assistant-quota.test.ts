// @vitest-environment node
/**
 * Assistente: configurazione (D-168), impostazioni ADMIN con audit (D-169, D-171), stato e limiti personali.
 *   MONGO_RS_TEST_URL="mongodb://127.0.0.1:27021/?directConnection=true" yarn vitest run tests/server/assistant-quota.test.ts
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoClient, ObjectId, type Db } from "mongodb";
import type { UserDTO } from "@/lib/contract";
import { HttpError } from "@/lib/http-error";
import { bootstrapStore, store } from "@/lib/store/db";
import { assistantConfig, type AssistantConfig } from "@/services/assistant/config";
import { recordProviderFailure, resetCircuit } from "@/services/assistant/circuit";
import { writeAssistantLog } from "@/services/assistant/log";
import { admit, assistantStatus, nextRomeMidnight, resetGate } from "@/services/assistant/quota";
import { getSettings, readSettings, updateSettings } from "@/services/assistant/settings";
import { assertDisposableTarget } from "../../scripts/db/guard";

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;

describe("configurazione tecnica", () => {
  it("spento di default; provider finto valido; vertex senza dati o fuori UE: non disponibile (D-168)", () => {
    expect(assistantConfig(env({}))).toMatchObject({ technicalEnabled: false, problems: [], initialDailyLimit: 30, initialPerMinuteLimit: 4, concurrency: 20 });
    expect(assistantConfig(env({ PH_AI_ENABLED: "true", PH_AI_PROVIDER: "fake" })).problems).toEqual([]);
    // Il modello finto non è ammesso sul database di esercizio (D-158).
    expect(assistantConfig(env({ PH_AI_ENABLED: "true", PH_AI_PROVIDER: "fake", NEW_DB_NAME: "practicehub_prod" })).problems).toEqual(["provider finto non ammesso sul database di esercizio"]);
    const vertex = assistantConfig(env({ PH_AI_ENABLED: "true", GOOGLE_CLOUD_PROJECT: "p", PH_AI_MODEL: "m", PH_AI_LOCATION: "global" }));
    expect(vertex.problems.join(" | ")).toMatch(/PH_AI_LOCATION "global" non ammessa/);
    expect(assistantConfig(env({ PH_AI_ENABLED: "true", PH_AI_LOCATION: "us-central1" })).problems.join(" | ")).toMatch(/GOOGLE_CLOUD_PROJECT mancante.*PH_AI_MODEL mancante.*us-central1/);
    expect(assistantConfig(env({ PH_AI_USER_PER_DAY: "500", PH_AI_USER_PER_MINUTE: "3" }))).toMatchObject({ initialDailyLimit: 30, initialPerMinuteLimit: 3 });
  });

  it("mezzanotte di Roma, anche al cambio d'ora", () => {
    expect(nextRomeMidnight(new Date("2026-10-09T08:00:00Z")).toISOString()).toBe("2026-10-09T22:00:00.000Z");
    expect(nextRomeMidnight(new Date("2026-10-25T10:00:00Z")).toISOString()).toBe("2026-10-25T23:00:00.000Z");
    expect(nextRomeMidnight(new Date("2026-10-09T22:00:00Z")).toISOString()).toBe("2026-10-10T22:00:00.000Z");
  });
});

const URL_RS = process.env.MONGO_RS_TEST_URL;
describe.skipIf(!URL_RS)("impostazioni, stato e limiti sul replica set usa-e-getta", () => {
  let client: MongoClient;
  let db: Db;
  const DB = `practicehub_test_ai_quota_${Date.now()}`;
  const NOW = new Date("2026-10-09T08:00:00Z");
  const on: AssistantConfig = assistantConfig(env({ PH_AI_ENABLED: "true", PH_AI_PROVIDER: "fake" }));
  const mk = (name: string, isAdmin = false): UserDTO => ({
    id: new ObjectId().toHexString(), name, email: `${name}@prova.local`, status: "active", isAdmin,
    memberships: isAdmin ? [] : [{ templateId: "ILIAD", group: "UT_PE", role: "UT", leader: false }],
    createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
  });
  const admin = mk("admin", true);
  const code = async (p: Promise<unknown>) => {
    try {
      await p;
      return "OK";
    } catch (e) {
      return e instanceof HttpError ? `${e.status} ${(e.extra?.code as string) ?? ""}`.trim() : String(e);
    }
  };

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    client = await new MongoClient(URL_RS!).connect();
    db = client.db(DB);
    await bootstrapStore(db);
  }, 180_000);
  afterAll(async () => {
    await client?.db(DB).dropDatabase();
    await client?.close();
  });
  beforeEach(() => {
    resetGate();
    resetCircuit();
  });

  it("impostazioni: lettura senza scritture; solo ADMIN; 422 fuori intervallo; audit dei soli campi cambiati", async () => {
    expect(await readSettings(db, on)).toMatchObject({ enabled: true, dailyLimit: 30, perMinuteLimit: 4, revision: 0 });
    expect(await store.assistantSettings(db).countDocuments()).toBe(0);
    const u = mk("ut");
    expect(await code(getSettings(db, u, on))).toBe("403");
    expect(await code(updateSettings({ client, db }, u, { enabled: false }, on))).toBe("403");
    expect(await code(updateSettings({ client, db }, admin, { dailyLimit: 101 }, on))).toBe("422");
    expect(await code(updateSettings({ client, db }, admin, { perMinuteLimit: 0 }, on))).toBe("422");
    expect(await code(updateSettings({ client, db }, admin, { dailyLimit: 2.5 }, on))).toBe("422");
    expect(await code(updateSettings({ client, db }, admin, { other: 1 } as never, on))).toBe("422");

    const dto = await updateSettings({ client, db }, admin, { dailyLimit: 3, perMinuteLimit: 4 }, on);
    expect(dto).toMatchObject({ enabled: true, dailyLimit: 3, perMinuteLimit: 4, technicalEnabled: true, updatedBy: "admin" });
    const audits = await store.auditLog(db).find({ kind: "ASSISTANT_SETTINGS" }).toArray();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorName: "admin", changes: [{ field: "dailyLimit", oldValue: 30, newValue: 3 }] });
    await updateSettings({ client, db }, admin, { dailyLimit: 3 }, on); // nessun cambio, nessun audit
    expect(await store.auditLog(db).countDocuments({ kind: "ASSISTANT_SETTINGS" })).toBe(1);
  });

  it("stato: assente se spento tecnicamente; DISABLED dall'ADMIN con effetto immediato; UNAVAILABLE con configurazione errata o circuito aperto", async () => {
    const u = mk("stato");
    expect(await assistantStatus(db, u, NOW, assistantConfig(env({})))).toBeNull();
    expect(await assistantStatus(db, u, NOW, on)).toMatchObject({ enabled: true, availability: "READY", dailyLimit: 3, usedToday: 0, remainingToday: 3, resetAt: "2026-10-09T22:00:00.000Z" });
    await updateSettings({ client, db }, admin, { enabled: false }, on);
    expect(await assistantStatus(db, u, NOW, on)).toMatchObject({ enabled: false, availability: "DISABLED" });
    expect(await code(admit(db, u, NOW, on))).toBe("403 NOT_ENABLED");
    await updateSettings({ client, db }, admin, { enabled: true }, on);
    const broken = assistantConfig(env({ PH_AI_ENABLED: "true", PH_AI_PROVIDER: "vertex" }));
    expect((await assistantStatus(db, u, NOW, broken))!.availability).toBe("UNAVAILABLE");
    expect(await code(admit(db, u, NOW, broken))).toBe("503 UNAVAILABLE");
    for (let i = 0; i < 5; i++) recordProviderFailure(NOW);
    expect((await assistantStatus(db, u, NOW, on))!.availability).toBe("UNAVAILABLE");
    expect((await assistantStatus(db, u, new Date(NOW.getTime() + 61_000), on))!.availability).toBe("READY");
    // Nessun errore di ammissione consuma domande.
    expect(await store.assistantUsage(db).countDocuments({ userId: new ObjectId(u.id) })).toBe(0);
  });

  it("una domanda alla volta per persona; stack pieno → BUSY; il rilascio libera", async () => {
    const a = mk("a");
    const b = mk("b");
    const c = mk("c");
    const two = { ...on, concurrency: 2 };
    const first = await admit(db, a, NOW, two);
    expect(await code(admit(db, a, NOW, two))).toBe("409 BUSY_USER");
    const second = await admit(db, b, NOW, two);
    expect(await code(admit(db, c, NOW, two))).toBe("429 BUSY");
    first.release();
    first.release(); // idempotente
    expect(await code(admit(db, c, NOW, two))).toBe("OK");
    second.release();
  });

  it("limite al minuto (finestra mobile) e al giorno di Roma; il giorno dopo si riparte", async () => {
    await updateSettings({ client, db }, admin, { dailyLimit: 6, perMinuteLimit: 2 }, on);
    const u = mk("limiti");
    const at = (s: number) => new Date(NOW.getTime() + s * 1000);
    const ask = async (t: Date) => {
      const r = await admit(db, u, t, on);
      r.release();
      return r.status;
    };
    expect(await ask(at(0))).toMatchObject({ usedToday: 1, remainingToday: 5 });
    await ask(at(10));
    try {
      await admit(db, u, at(20), on);
      expect.unreachable();
    } catch (e) {
      expect((e as HttpError).extra).toMatchObject({ code: "QUOTA_USER_MINUTE", retryAfterSeconds: 40 });
    }
    await ask(at(61));
    await ask(at(130));
    await ask(at(200));
    expect(await ask(at(300))).toMatchObject({ usedToday: 6, remainingToday: 0 });
    try {
      await admit(db, u, at(400), on);
      expect.unreachable();
    } catch (e) {
      expect((e as HttpError).status).toBe(429);
      expect((e as HttpError).extra).toMatchObject({ code: "QUOTA_USER_DAY", resetAt: "2026-10-09T22:00:00.000Z" });
    }
    expect((await assistantStatus(db, u, at(400), on))!).toMatchObject({ usedToday: 6, remainingToday: 0 });
    // Mezzanotte di Roma: nuovo giorno, nuovo contatore.
    expect(await ask(new Date("2026-10-09T22:00:05Z"))).toMatchObject({ usedToday: 1 });
    // Limite abbassato dall'ADMIN: vale subito.
    await updateSettings({ client, db }, admin, { dailyLimit: 1 }, on);
    expect(await code(admit(db, u, new Date("2026-10-09T23:00:00Z"), on))).toBe("429 QUOTA_USER_DAY");
  });

  it("registro: solo metadati, con scadenza a 30 giorni", async () => {
    const u = mk("log");
    await writeAssistantLog(db, {
      requestId: "r1", userId: u.id, at: NOW, promptVersion: "p1", catalogVersion: 1, provider: "fake", model: null, region: null,
      tools: [{ name: "get_practices", rows: 2, ok: true }], outcome: "DONE", answerState: "ANSWER", errorCode: null,
      firstTextMs: 10, totalMs: 20, inputTokens: null, outputTokens: null, sources: 2, limitsHit: [],
    }, 30);
    const doc = (await store.assistantLog(db).findOne({ requestId: "r1" }))!;
    expect(doc.expiresAt.getTime() - NOW.getTime()).toBe(30 * 24 * 3600_000);
    expect(Object.keys(doc).sort()).toEqual(
      ["_id", "answerState", "at", "catalogVersion", "errorCode", "expiresAt", "firstTextMs", "inputTokens", "limitsHit", "model", "outcome", "outputTokens", "promptVersion", "provider", "region", "requestId", "sources", "tools", "totalMs", "userId"].sort()
    );
    const ttl = (await store.assistantLog(db).indexes()).find((i) => i.key.expiresAt === 1);
    expect(ttl?.expireAfterSeconds).toBe(0);
  });
});
