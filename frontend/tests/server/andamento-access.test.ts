// @vitest-environment node
/**
 * Andamento, prima parte (contratto §15.1–§15.3, D-192, D-193): interruttore PH_ANDAMENTO, permesso Direzione (in più
 * alle appartenenze), Statistiche e carichi per la Direzione, assistente escluso per la Direzione pura, impostazioni
 * con audit. A interruttore spento il comportamento resta quello di prima.
 *   MONGO_RS_TEST_URL="mongodb://127.0.0.1:27021/?directConnection=true" yarn vitest run tests/server/andamento-access.test.ts
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { TEMPLATE_IDS, type UserDTO } from "@/lib/contract";
import { loadMeDTO } from "@/lib/current-user";
import { HttpError } from "@/lib/http-error";
import { store } from "@/lib/store/db";
import type { StoreUserDoc } from "@/lib/store/types";
import { assistantConfig } from "@/services/assistant/config";
import { admit, assistantStatus, resetGate } from "@/services/assistant/quota";
import { requireAndamento } from "@/services/andamento/access";
import { FactRegistry, SourceRegistry, ToolError, type ToolContext } from "@/services/assistant/tools/common";
import { canUseStats, getStatsTool, getWorkloadTool } from "@/services/assistant/tools/kpi";
import { getStats, getWorkload } from "@/services/practices-v2/analytics";
import { loadVisiblePractice } from "@/services/practices-v2/repository";
import { inviteUser, toUserDTO, updateUser } from "@/services/users-v2";
import { assertDisposableTarget } from "../../scripts/db/guard";
import { applyFixtureE, E_NOW, eIds, seedS0 } from "../fixtures/assistant-e";

const state: { user: UserDTO | null; deps: { client: MongoClient; db: Db } | null } = { user: null, deps: null };
vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth-v2", async () => {
  const { HttpError } = await import("@/lib/http-error");
  return {
    requireCurrentUser: async () => {
      if (!state.user) throw new HttpError("Unauthenticated", 401);
      return state.user;
    },
  };
});
vi.mock("@/lib/store/db", async (orig) => ({ ...(await orig<object>()), getStoreDb: async () => state.deps!.db }));
vi.mock("@/services/users-v2", async (orig) => ({ ...(await orig<object>()), storeDeps: async () => state.deps }));

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;
const aiCfg = assistantConfig(env({ PH_AI_ENABLED: "true", PH_AI_PROVIDER: "fake" }));
const on = () => (process.env.PH_ANDAMENTO = "true");
const off = () => delete process.env.PH_ANDAMENTO;
const status = async (p: Promise<unknown> | (() => unknown)) => {
  try {
    await (typeof p === "function" ? p() : p);
    return "OK";
  } catch (e) {
    return e instanceof HttpError ? `${e.status}${e.extra?.code ? ` ${e.extra.code}` : ""}` : String(e);
  }
};
const period = { from: "2026-09-01", to: "2026-10-09" };

const URL_RS = process.env.MONGO_RS_TEST_URL;
describe.skipIf(!URL_RS)("Andamento: interruttore e permesso Direzione", () => {
  let client: MongoClient;
  let db: Db;
  const DB = `practicehub_test_andamento_accesso_${Date.now()}`;
  const deps = () => ({ client, db });
  const admin = { id: "admin", isAdmin: true };
  const dto = async (id: ObjectId) => toUserDTO((await store.users(db).findOne({ _id: id }))!);
  /** Direzione pura (nessuna appartenenza) e UT di tutti i template con Direzione: scritti a mano nel database. */
  const pura = new ObjectId();
  const utDir = new ObjectId();

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    client = await new MongoClient(URL_RS!).connect();
    db = client.db(DB);
    state.deps = { client, db };
    await seedS0(db);
    await applyFixtureE(db, { alerts: true });
    const ut = (await store.users(db).findOne({ _id: eIds.user("ut") }))!;
    const base: Omit<StoreUserDoc, "_id" | "email" | "name"> = { passwordHash: null, status: "active", isAdmin: false, memberships: [], authVersion: 1, createdAt: E_NOW, updatedAt: E_NOW, direzione: true };
    await store.users(db).insertMany([
      { ...base, _id: pura, email: "direzione@test.local", name: "Direzione pura" },
      { ...base, _id: utDir, email: "ut.direzione@test.local", name: "UT con Direzione", memberships: ut.memberships },
    ]);
  }, 240_000);
  afterEach(() => {
    off();
    resetGate();
  });
  afterAll(async () => {
    off();
    await client?.db(DB).dropDatabase();
    await client?.close();
  });

  it("spento: direzione nel database non vale niente, non si imposta (422), Andamento 404, features.andamento false", async () => {
    off();
    const p = await dto(pura);
    expect(p.direzione).toBe(false);
    expect(await status(getStats(db, p, period))).toBe("403");
    expect(await status(getWorkload(db, p, { templateId: "ILIAD" }))).toBe("403");
    expect(await status(() => requireAndamento(p))).toBe("404");
    const adminOff = await dto(eIds.user("admin"));
    expect(await status(() => requireAndamento(adminOff))).toBe("404");
    expect((await loadMeDTO(db, p, E_NOW)).features).toEqual({ andamento: false });
    expect(await status(inviteUser(deps(), admin, { name: "X", email: "x@test.local", direzione: true, memberships: [] }))).toBe("422 FEATURE_DISABLED");
    expect(await status(updateUser(deps(), admin, utDir.toHexString(), { direzione: false }))).toBe("422 FEATURE_DISABLED");
    // Un UT senza Direzione resta com'era: niente Statistiche, niente carichi di altri gruppi.
    const ut = await dto(eIds.user("ut"));
    expect(await status(getStats(db, ut, period))).toBe("403");
    expect(await dto(utDir)).toMatchObject({ direzione: false });
    expect(await status(getStats(db, await dto(utDir), period))).toBe("403");
    // Revisione: la Direzione pura resta modificabile e disattivabile anche spento, e non ha l'assistente.
    expect(await assistantStatus(db, p, E_NOW, aiCfg)).toBeNull();
    expect(await status(admit(db, p, E_NOW, aiCfg))).toBe("403 NOT_ENABLED");
    expect((await updateUser(deps(), admin, pura.toHexString(), { name: "Direzione pura (rinominata)" })).name).toBe("Direzione pura (rinominata)");
    expect((await updateUser(deps(), admin, pura.toHexString(), { status: "deactivated" })).status).toBe("deactivated");
    await store.users(db).updateOne({ _id: pura }, { $set: { status: "active" } });
  });

  it("acceso, Direzione pura: Statistiche e carichi di tutti i template (anche le persone), nessuna scheda, nessun assistente", async () => {
    on();
    const p = await dto(pura);
    expect(p.direzione).toBe(true);
    const adminDto = await dto(eIds.user("admin"));
    const mine = await getStats(db, p, period, E_NOW);
    const all = await getStats(db, adminDto, period, E_NOW);
    expect(mine.activeTotal).toBe(all.activeTotal);
    expect(mine.byAssignee).toEqual(all.byAssignee);
    expect(Object.keys(mine.byTemplate).sort()).toEqual(Object.keys(all.byTemplate).sort());
    for (const t of TEMPLATE_IDS) expect(await status(getWorkload(db, p, { templateId: t, group: "DL" })), t).toBe("OK");
    expect(await status(() => requireAndamento(p))).toBe("OK");
    expect((await loadMeDTO(db, p, E_NOW)).features).toEqual({ andamento: true });
    // Nessun altro potere: la scheda resta invisibile (canSeePractice non cambia), niente assistente.
    expect(await status(loadVisiblePractice(db, p, eIds.practice("ILIAD-1")))).toBe("404");
    expect(await assistantStatus(db, p, E_NOW, aiCfg)).toBeNull();
    expect(await status(admit(db, p, E_NOW, aiCfg))).toBe("403 NOT_ENABLED");
    // Scadenze delle Statistiche: niente link dove la scheda non si apre (D-193).
    expect(mine.upcoming.items.length).toBeGreaterThan(0);
    expect(mine.upcoming.items.every((i) => i.canOpen === false)).toBe(true);
    expect(all.upcoming.items.every((i) => i.canOpen === true)).toBe(true);
  });

  it("acceso, Direzione in più alle appartenenze: conserva scheda e assistente del suo gruppo e legge tutto in più", async () => {
    on();
    const u = await dto(utDir);
    expect(await status(loadVisiblePractice(db, u, eIds.practice("ILIAD-1")))).toBe("OK");
    expect(await assistantStatus(db, u, E_NOW, aiCfg)).not.toBeNull();
    expect((await getStats(db, u, period, E_NOW)).activeTotal).toBe((await getStats(db, await dto(eIds.user("admin")), period, E_NOW)).activeTotal);
    expect(await status(getWorkload(db, u, { templateId: "TIM_FIBERCOP", group: "PM_PERMESSI" }))).toBe("OK");
    expect((await getStats(db, u, period, E_NOW)).upcoming.items.filter((i) => i.templateId === "ILIAD").every((i) => i.canOpen)).toBe(true);
    // Un UT senza Direzione non legge Andamento né le Statistiche.
    const ut = await dto(eIds.user("ut"));
    expect(await status(() => requireAndamento(ut))).toBe("403");
    expect(await status(getStats(db, ut, period))).toBe("403");
  });

  it("D-196: un PM con Direzione chiede all'assistente statistiche e carichi di un cliente fuori dalle appartenenze: sì acceso, no spento", async () => {
    const id = new ObjectId();
    await store.users(db).insertOne({ _id: id, email: "pm.dir@test.local", name: "PM con Direzione", passwordHash: null, status: "active", isAdmin: false, memberships: [{ templateId: "ILIAD", group: "PM_PERMESSI", role: "PM", leader: false }], authVersion: 1, createdAt: E_NOW, updatedAt: E_NOW, direzione: true });
    const ctx = async (): Promise<ToolContext> => ({ db, user: await dto(id), now: E_NOW, todayRome: "2026-10-09", question: "x", signal: new AbortController().signal, sources: new SourceRegistry(), facts: new FactRegistry() });
    const tool = async (p: Promise<unknown>) => {
      try {
        await p;
        return "OK";
      } catch (e) {
        return e instanceof ToolError ? e.code : String(e);
      }
    };
    on();
    expect(canUseStats(await ctx())).toBe(true);
    expect(await tool(getStatsTool(await ctx(), { templateId: "TIM_FIBERCOP", period }))).toBe("OK");
    expect(await tool(getWorkloadTool(await ctx(), { templateId: "TIM_FIBERCOP", group: "DL" }))).toBe("OK");
    off();
    expect(await tool(getStatsTool(await ctx(), { templateId: "TIM_FIBERCOP", period }))).toBe("FORBIDDEN");
    expect(await tool(getWorkloadTool(await ctx(), { templateId: "TIM_FIBERCOP", group: "DL" }))).toBe("FORBIDDEN");
    // Spento resta tutto come oggi: sul suo cliente (ILIAD, PM) sì.
    expect(await tool(getStatsTool(await ctx(), { templateId: "ILIAD", period }))).toBe("OK");
  });

  it("acceso: invito e modifica di Direzione (solo ADMIN), appartenenze facoltative solo con Direzione, authVersion cresce", async () => {
    on();
    const invited = await inviteUser(deps(), admin, { name: "Capo", email: "capo@test.local", direzione: true, memberships: [] });
    expect(invited).toMatchObject({ direzione: true, memberships: [] });
    const id = invited.id;
    expect(await status(updateUser(deps(), admin, id, { direzione: false }))).toBe("422");
    const ut = await store.users(db).findOne({ _id: eIds.user("ut") });
    const v0 = (await store.users(db).findOne({ _id: new ObjectId(id) }))!.authVersion;
    const r = await updateUser(deps(), admin, id, { direzione: false, memberships: ut!.memberships });
    expect(r.direzione).toBe(false);
    const doc = (await store.users(db).findOne({ _id: new ObjectId(id) }))!;
    expect(doc.direzione).toBeUndefined();
    expect(doc.authVersion).toBe(v0 + 1);
    expect((await updateUser(deps(), admin, id, { direzione: true })).direzione).toBe(true);
    expect((await store.users(db).findOne({ _id: new ObjectId(id) }))!).toMatchObject({ direzione: true, authVersion: v0 + 2 });
    expect(await status(updateUser(deps(), { id: "x", isAdmin: false }, id, { direzione: false }))).toBe("403");
    expect(await status(inviteUser(deps(), admin, { name: "Nessuno", email: "n@test.local", memberships: [] }))).toBe("422");
  });

  it("impostazioni: soglia 30 iniziale; PUT solo ADMIN con audit (una voce per cambio reale); 422 fuori 1–365; spento 404", async () => {
    const route = await import("@/app/api/andamento/settings/route");
    const call = async (method: "GET" | "PUT", body?: unknown) => {
      const res = await route[method](new Request("http://test/api/andamento/settings", { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), { params: {} });
      return { status: res.status, body: await res.json() };
    };
    state.user = await dto(eIds.user("admin"));
    expect((await call("GET")).status).toBe(404);
    on();
    expect(await call("GET")).toMatchObject({ status: 200, body: { sogliaFermeGiorni: 30, updatedAt: null, updatedBy: null } });
    expect(await call("PUT", { sogliaFermeGiorni: 45 })).toMatchObject({ status: 200, body: { sogliaFermeGiorni: 45, updatedBy: "Demo Admin" } });
    expect((await call("PUT", { sogliaFermeGiorni: 45 })).status).toBe(200);
    expect((await call("PUT", { sogliaFermeGiorni: 0 })).status).toBe(422);
    expect((await call("PUT", { sogliaFermeGiorni: 12.5 })).status).toBe(422);
    expect((await call("PUT", { sogliaFermeGiorni: 30, altro: 1 })).status).toBe(422);
    expect(await store.auditLog(db).find({ kind: "ANDAMENTO_SETTINGS" }).toArray()).toEqual([
      expect.objectContaining({ actorName: "Demo Admin", changes: [{ field: "sogliaFermeGiorni", oldValue: 30, newValue: 45 }] }),
    ]);
    state.user = await dto(pura);
    expect(await call("GET")).toMatchObject({ status: 200, body: { sogliaFermeGiorni: 45, updatedBy: null } });
    expect((await call("PUT", { sogliaFermeGiorni: 20 })).status).toBe(403);
    state.user = await dto(eIds.user("ut"));
    expect((await call("GET")).status).toBe(403);
    state.user = null;
  });
});
