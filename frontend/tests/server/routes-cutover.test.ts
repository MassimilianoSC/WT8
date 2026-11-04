// @vitest-environment node
/**
 * Cutover del codice 3.3 (CUTOVER.md): le rotte in collisione passano ai servizi del modello nuovo. Prove attraverso
 * le VERE rotte (handle + parseBody + servizi), con l'utente simulato e il replica set usa-e-getta:
 *   MONGO_RS_TEST_URL="mongodb://127.0.0.1:27021/?directConnection=true" yarn vitest run tests/server/routes-cutover.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoClient, ObjectId, type Db } from "mongodb";
import type { MembershipDTO, UserDTO } from "@/lib/contract";
import { bootstrapStore, store } from "@/lib/store/db";
import type { StoreUserDoc } from "@/lib/store/types";
import { assertDisposableTarget } from "../../scripts/db/guard";

const state: { user: UserDTO | null; deps: { client: MongoClient; db: Db } | null } = { user: null, deps: null };
vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth-v2", async () => {
  const { HttpError } = await import("@/lib/api");
  return {
    requireCurrentUser: async () => {
      if (!state.user) throw new HttpError("Unauthenticated", 401);
      return state.user;
    },
  };
});
vi.mock("@/lib/store/db", async (orig) => ({ ...(await orig<object>()), getStoreDb: async () => state.deps!.db }));
vi.mock("@/services/users-v2", async (orig) => ({ ...(await orig<object>()), storeDeps: async () => state.deps }));

type Handler = (req: Request, ctx: { params: Record<string, string> }) => Promise<Response>;
async function call(as: UserDTO | null, handler: Handler, url: string, init: { method?: string; body?: unknown } = {}, params: Record<string, string> = {}) {
  state.user = as;
  const res = await handler(new Request(`http://test${url}`, { method: init.method ?? "GET", ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}) }), { params });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const URL_RS = process.env.MONGO_RS_TEST_URL;
describe.skipIf(!URL_RS)("rotte in collisione sui servizi nuovi (cutover 3.3)", () => {
  let client: MongoClient;
  let db: Db;
  const DB = `practicehub_test_cutover_${Date.now()}`;
  const now = new Date("2026-10-09T07:00:00Z");
  const u: Record<string, UserDTO> = {};
  const m = (group: MembershipDTO["group"], role: MembershipDTO["role"], leader = false): MembershipDTO => ({ templateId: "INWIT", group, role, leader });

  async function user(k: string, memberships: MembershipDTO[], extra: Partial<StoreUserDoc> = {}) {
    const { toUserDTO } = await import("@/services/users-v2");
    const doc: StoreUserDoc = { _id: new ObjectId(), email: `${k}@test.local`, name: k, passwordHash: null, status: "active", isAdmin: false, memberships, authVersion: 1, createdAt: now, updatedAt: now, ...extra };
    await store.users(db).insertOne(doc);
    u[k] = toUserDTO(doc);
  }

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    client = await new MongoClient(URL_RS!).connect();
    db = client.db(DB);
    state.deps = { client, db };
    await bootstrapStore(db);
    await user("pmLeader", [m("PM_PERMESSI", "PM", true)]);
    await user("ut", [m("UT_PE", "UT")]);
    await user("admin", [], { isAdmin: true });
  });
  afterAll(async () => {
    await client?.db(DB).dropDatabase();
    await client?.close();
  });

  it("pratiche: creazione 201, elenco, scheda, eliminazione 422 senza revisione e 204 con; poi 404", async () => {
    const r = await import("@/app/api/practices/route");
    const one = await import("@/app/api/practices/[id]/route");
    expect((await call(null, r.GET, "/api/practices")).status).toBe(401);
    const created = await call(u.pmLeader, r.POST, "/api/practices", {
      method: "POST",
      body: { templateId: "INWIT", committente: { code: "TODOS" }, clienteFinale: { code: "INWIT" }, codiceG7: "4501", codiceSito: "CUT1", nomeSito: "Cutover" },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = created.body.id as string;
    expect((await call(u.ut, r.POST, "/api/practices", { method: "POST", body: { ...created.body, templateId: "INWIT" } })).status).toBe(422); // corpo non valido
    const list = await call(u.pmLeader, r.GET, "/api/practices?scope=all");
    expect(list.status).toBe(200);
    expect(list.body.items.map((p: { id: string }) => p.id)).toContain(id);
    expect((await call(u.pmLeader, one.GET, `/api/practices/${id}`, {}, { id })).body).toMatchObject({ id, codiceSito: "CUT1", iteration: 1 });
    expect((await call(u.admin, one.DELETE, `/api/practices/${id}`, { method: "DELETE" }, { id })).status).toBe(422);
    expect((await call(u.admin, one.DELETE, `/api/practices/${id}?revision=1`, { method: "DELETE" }, { id })).status).toBe(204);
    expect((await call(u.pmLeader, one.GET, `/api/practices/${id}`, {}, { id })).status).toBe(404);
  });

  it("utenti: elenco e invito solo ADMIN; modifica; reinvio dell'invito", async () => {
    const r = await import("@/app/api/users/route");
    const one = await import("@/app/api/users/[id]/route");
    const resend = await import("@/app/api/users/[id]/resend-invite/route");
    expect((await call(u.pmLeader, r.GET, "/api/users")).status).toBe(403);
    const list = await call(u.admin, r.GET, "/api/users");
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBeGreaterThanOrEqual(3);
    const invited = await call(u.admin, r.POST, "/api/users", { method: "POST", body: { name: "Nuova", email: "nuova@test.local", memberships: [m("UT_PE", "UT")] } });
    expect(invited.status, JSON.stringify(invited.body)).toBe(201);
    expect(invited.body).toMatchObject({ email: "nuova@test.local", status: "invited" });
    const id = invited.body.id as string;
    expect((await call(u.pmLeader, r.POST, "/api/users", { method: "POST", body: { name: "X", email: "x@test.local", memberships: [m("UT_PE", "UT")] } })).status).toBe(403);
    expect((await call(u.admin, one.PATCH, `/api/users/${id}`, { method: "PATCH", body: { name: "Nuova Rinominata" } }, { id })).body).toMatchObject({ name: "Nuova Rinominata" });
    expect((await call(u.admin, resend.POST, `/api/users/${id}/resend-invite`, { method: "POST" }, { id })).status).toBe(200);
    expect((await call(u.admin, resend.POST, `/api/users/${u.ut.id}/resend-invite`, { method: "POST" }, { id: u.ut.id })).status).toBe(409); // già attivo
  });

  it("assegnabili, notifiche, statistiche, ISTAT e template sulla sessione nuova", async () => {
    const assignable = await import("@/app/api/users/assignable/route");
    expect((await call(u.ut, assignable.GET, "/api/users/assignable?templateId=INWIT")).status).toBe(400);
    const a = await call(u.ut, assignable.GET, "/api/users/assignable?templateId=INWIT&role=UT");
    expect(a.status).toBe(200);
    expect(a.body.map((x: { id: string }) => x.id)).toContain(u.ut.id);
    const notif = await import("@/app/api/notifications/route");
    const notifOne = await import("@/app/api/notifications/[id]/route");
    expect((await call(u.ut, notif.GET, "/api/notifications")).status).toBe(200);
    const missing = new ObjectId().toHexString();
    expect((await call(u.ut, notifOne.PATCH, `/api/notifications/${missing}`, { method: "PATCH", body: { read: true } }, { id: missing })).status).toBe(404);
    const stats = await import("@/app/api/stats/route");
    expect((await call(u.ut, stats.GET, "/api/stats?templateId=INWIT")).status).toBe(403);
    expect((await call(u.pmLeader, stats.GET, "/api/stats?templateId=INWIT")).status).toBe(200);
    const templates = await import("@/app/api/templates/route");
    expect((await call(null, templates.GET, "/api/templates")).status).toBe(401);
    expect((await call(u.ut, templates.GET, "/api/templates")).status).toBe(200);
    const regioni = await import("@/app/api/istat/regioni/route");
    expect((await call(u.ut, regioni.GET, "/api/istat/regioni")).status).toBe(200);
  });
});
