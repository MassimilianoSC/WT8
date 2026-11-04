// @vitest-environment node
/**
 * Rotte dell'assistente (contratto §13) e MeDTO.assistant, attraverso le rotte vere con la sessione simulata:
 * stati e codici d'errore prima dello stream, intestazioni, NDJSON con il provider finto (PH_AI_PROVIDER=fake).
 *   MONGO_RS_TEST_URL="mongodb://127.0.0.1:27021/?directConnection=true" yarn vitest run tests/server/assistant-routes.test.ts
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoClient, type Db } from "mongodb";
import type { Session } from "next-auth";
import { store } from "@/lib/store/db";
import { resetCircuit } from "@/services/assistant/circuit";
import { resetConversations } from "@/services/assistant/conversation";
import { resetGate } from "@/services/assistant/quota";
import { assertDisposableTarget } from "../../scripts/db/guard";
import { romeDate } from "@/lib/calendario";
import { applyFixtureE, eIds, seedS0 } from "../fixtures/assistant-e";

const state: { session: Session | null } = { session: null };
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<object>()), auth: async () => state.session }));

const URL_RS = process.env.MONGO_RS_TEST_URL;
const ORIGIN = "https://ph.prova.local:8443";

describe.skipIf(!URL_RS)("rotte dell'assistente", () => {
  let client: MongoClient;
  let db: Db;
  const DB = `practicehub_test_ai_routes_${Date.now()}`;

  async function as(key: string | null) {
    if (!key) return void (state.session = null);
    const u = (await store.users(db).findOne({ _id: eIds.user(key) }))!;
    state.session = { user: { id: u._id.toHexString(), name: u.name, email: u.email, isAdmin: u.isAdmin }, expires: "2099-01-01T00:00:00.000Z" };
  }
  const body = async (r: Response) => ({ status: r.status, json: (await r.json()) as Record<string, unknown>, headers: r.headers });
  const post = (payload: unknown, headers: Record<string, string> = {}) =>
    new Request(`${ORIGIN}/api/assistant/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    });
  const question = (extra: Record<string, unknown> = {}) => ({ requestId: randomUUID(), text: "Quante pratiche vedo?", ...extra });

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    Object.assign(process.env, { MONGO_URL: URL_RS, NEW_DB_NAME: DB, DB_NAME: `${DB}_legacy`, APP_BASE_URL: ORIGIN, PH_AI_ENABLED: "true", PH_AI_PROVIDER: "fake" });
    client = await new MongoClient(URL_RS!).connect();
    db = client.db(DB);
    await seedS0(db);
    await applyFixtureE(db);
  }, 240_000);
  afterAll(async () => {
    for (const d of [DB, `${DB}_legacy`]) await client?.db(d).dropDatabase();
    await client?.close();
    delete process.env.PH_AI_ENABLED;
    delete process.env.PH_AI_PROVIDER;
  });
  beforeEach(() => {
    resetGate();
    resetCircuit();
    resetConversations();
    process.env.PH_AI_ENABLED = "true";
  });

  it("/api/me: assistant presente se acceso tecnicamente, assente se spento; nessun contatore creato", async () => {
    const me = await import("@/app/api/me/route");
    await as("ut");
    const on = await body(await me.GET(new Request(`${ORIGIN}/api/me`), { params: {} }));
    expect(on.json.assistant).toMatchObject({ enabled: true, availability: "READY", dailyLimit: 30, usedToday: 0, perMinuteLimit: 4 });
    process.env.PH_AI_ENABLED = "false";
    const off = await body(await me.GET(new Request(`${ORIGIN}/api/me`), { params: {} }));
    expect(off.json).not.toHaveProperty("assistant");
    expect(off.json).toMatchObject({ mustChangePassword: false });
    expect(await store.assistantUsage(db).countDocuments()).toBe(0);
  });

  it("status: 401 JSON senza sessione; per l'utente; DISABLED se spento tecnicamente; sempre no-store", async () => {
    const r = await import("@/app/api/assistant/status/route");
    await as(null);
    const anon = await body(await r.GET());
    expect(anon).toMatchObject({ status: 401, json: { code: "UNAUTHENTICATED" } });
    expect(anon.headers.get("cache-control")).toBe("no-store");
    await as("pe");
    const ok = await body(await r.GET());
    expect(ok).toMatchObject({ status: 200, json: { enabled: true, availability: "READY", remainingToday: 30 } });
    expect(ok.headers.get("cache-control")).toBe("no-store");
    process.env.PH_AI_ENABLED = "false";
    expect((await body(await r.GET())).json).toMatchObject({ enabled: false, availability: "DISABLED" });
  });

  it("settings: solo ADMIN; PUT con 422 fuori intervallo o JSON rotto; spegnimento con effetto immediato su status e /api/me", async () => {
    const r = await import("@/app/api/assistant/settings/route");
    const status = await import("@/app/api/assistant/status/route");
    const me = await import("@/app/api/me/route");
    const put = (b: unknown) => r.PUT(new Request(`${ORIGIN}/api/assistant/settings`, { method: "PUT", body: typeof b === "string" ? b : JSON.stringify(b) }));
    await as("pm.leader");
    expect((await body(await r.GET())).status).toBe(403);
    expect((await body(await put({ enabled: false }))).status).toBe(403);
    await as("admin");
    expect((await body(await r.GET())).json).toMatchObject({ enabled: true, dailyLimit: 30, perMinuteLimit: 4, technicalEnabled: true, updatedBy: null });
    expect(await body(await put({ dailyLimit: 0 }))).toMatchObject({ status: 422, json: { code: "INVALID_REQUEST" } });
    expect((await body(await put("{rotto"))).status).toBe(422);
    expect((await body(await put({ enabled: false }))).json).toMatchObject({ enabled: false, updatedBy: "Demo Admin" });
    await as("ut");
    expect((await body(await status.GET())).json).toMatchObject({ enabled: false, availability: "DISABLED" });
    expect((await body(await me.GET(new Request(`${ORIGIN}/api/me`), { params: {} }))).json.assistant).toMatchObject({ enabled: false, availability: "DISABLED" });
    const m = await import("@/app/api/assistant/messages/route");
    expect(await body(await m.POST(post(question())))).toMatchObject({ status: 403, json: { code: "NOT_ENABLED" } });
    await as("admin");
    await put({ enabled: true });
  });

  it("messages, prima dello stream: 401, Origin, CAMBIO_PASSWORD, 413, 422 con requestId, 404 contesto, 429 con Retry-After", async () => {
    const m = await import("@/app/api/assistant/messages/route");
    await as(null);
    expect(await body(await m.POST(post(question())))).toMatchObject({ status: 401, json: { code: "UNAUTHENTICATED" } });
    await as("ut");
    expect(await body(await m.POST(post(question(), { origin: "https://altro.example" })))).toMatchObject({ status: 403, json: { code: "ORIGIN_DENIED" } });
    const noOrigin = new Request(`${ORIGIN}/api/assistant/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(question()) });
    expect((await body(await m.POST(noOrigin))).json.code).toBe("ORIGIN_DENIED");
    const big = JSON.stringify(question({ text: "x".repeat(17_000) }));
    expect(await body(await m.POST(post(big)))).toMatchObject({ status: 413, json: { code: "BODY_TOO_LARGE" } });
    expect(await body(await m.POST(post(big, { "content-length": String(big.length) })))).toMatchObject({ status: 413 });
    const id = randomUUID();
    expect(await body(await m.POST(post({ requestId: id, text: "x", context: { page: "sheet" } })))).toMatchObject({ status: 422, json: { code: "INVALID_REQUEST", requestId: id } });
    expect((await body(await m.POST(post({ requestId: id, text: "   " })))).status).toBe(422);
    expect((await body(await m.POST(post({ ...question(), extra: true })))).status).toBe(422);
    await as("multi");
    expect(await body(await m.POST(post(question({ context: { page: "sheet", practiceId: eIds.practice("TIM-1").toHexString() } }))))).toMatchObject({ status: 404, json: { code: "NOT_FOUND" } });
    expect(await store.assistantUsage(db).countDocuments({ userId: eIds.user("multi") })).toBe(0);
    // Limite del giorno già raggiunto: 429 con resetAt e Retry-After.
    const day = romeDate(new Date());
    await store.assistantUsage(db).insertOne({ _id: `${eIds.user("multi").toHexString()}:${day}`, userId: eIds.user("multi"), day, count: 30, recent: [], expiresAt: new Date(Date.now() + 3 * 86400_000) });
    const full = await body(await m.POST(post(question())));
    expect(full).toMatchObject({ status: 429, json: { code: "QUOTA_USER_DAY" } });
    expect(Number(full.headers.get("retry-after"))).toBeGreaterThan(0);
    // Cambio password obbligatorio (D-173): anche l'assistente risponde 403 CAMBIO_PASSWORD.
    await store.users(db).updateOne({ _id: eIds.user("dl") }, { $set: { mustChangePassword: true } });
    await as("dl");
    expect(await body(await m.POST(post(question())))).toMatchObject({ status: 403, json: { code: "CAMBIO_PASSWORD" } });
    await store.users(db).updateOne({ _id: eIds.user("dl") }, { $unset: { mustChangePassword: "" } });
  });

  it("messages: 200 NDJSON senza cache, seq crescente, done con l'uso aggiornato", async () => {
    const m = await import("@/app/api/assistant/messages/route");
    await as("pm");
    const res = await m.POST(post(question()));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/x-ndjson; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store, no-transform");
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l) as { seq: number; type: string; usage?: { usedToday: number } });
    expect(lines.map((l) => l.seq)).toEqual(lines.map((_, i) => i + 1));
    expect(lines[0].type).toBe("start");
    expect(lines[lines.length - 1]).toMatchObject({ type: "done", usage: { usedToday: 1 } });
  });
});
