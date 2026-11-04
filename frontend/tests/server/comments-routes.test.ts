// @vitest-environment node
/**
 * Rotte dei commenti (§14) attraverso handle + parseBody + servizio: stati e corpi che usa l'interfaccia.
 *   MONGO_RS_TEST_URL="mongodb://127.0.0.1:27021/?directConnection=true" yarn vitest run tests/server/comments-routes.test.ts
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoClient, type Db } from "mongodb";
import type { UserDTO } from "@/lib/contract";
import { store } from "@/lib/store/db";
import { toUserDTO } from "@/services/users-v2";
import { assertDisposableTarget } from "../../scripts/db/guard";
import { eIds, seedS0 } from "../fixtures/assistant-e";

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
async function call(handler: Handler, url: string, params: Record<string, string>, init: { method?: string; body?: unknown } = {}) {
  const res = await handler(new Request(`http://test${url}`, { method: init.method ?? "GET", ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}) }), { params });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const URL_RS = process.env.MONGO_RS_TEST_URL;
describe.skipIf(!URL_RS)("rotte dei commenti", () => {
  let client: MongoClient;
  let db: Db;
  const DB = `practicehub_test_commenti_rotte_${Date.now()}`;
  const as = async (k: string | null) => (state.user = k ? toUserDTO((await store.users(db).findOne({ _id: eIds.user(k) }))!) : null);

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    client = await new MongoClient(URL_RS!).connect();
    db = client.db(DB);
    state.deps = { client, db };
    await seedS0(db);
  }, 240_000);
  afterAll(async () => {
    await client?.db(DB).dropDatabase();
    await client?.close();
  });

  it("201, 404, 409 con code, 422, 401, PATCH 403, DELETE 204, menu @", async () => {
    const list = await import("@/app/api/practices/[id]/comments/route");
    const one = await import("@/app/api/practices/[id]/comments/[commentId]/route");
    const men = await import("@/app/api/practices/[id]/mentionable/route");
    const id = eIds.practice("ILIAD-1").toHexString();
    await as(null);
    expect((await call(list.GET, `/api/practices/${id}/comments`, { id })).status).toBe(401);
    await as("ut");
    const created = await call(list.POST, `/api/practices/${id}/comments`, { id }, { method: "POST", body: { body: "Ciao @UT/PE", mentions: [{ kind: "group", id: "UT_PE", label: "x" }], operationId: randomUUID() } });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body).toMatchObject({ body: "Ciao @UT/PE", mentions: [{ kind: "group", id: "UT_PE", label: "@UT/PE" }], replies: [] });
    expect((await call(list.POST, `/api/practices/${id}/comments`, { id }, { method: "POST", body: { body: "  ", mentions: [] } })).status).toBe(422);
    expect((await call(list.POST, `/api/practices/${id}/comments`, { id }, { method: "POST", body: { body: "x", mentions: [], html: "<b>" } })).status).toBe(422);
    const fv = eIds.practice("FV-1").toHexString();
    expect(await call(list.POST, `/api/practices/${fv}/comments`, { id: fv }, { method: "POST", body: { body: "x", mentions: [] } })).toMatchObject({ status: 409, body: { code: "ARCHIVED" } });
    await as("multi");
    const tim = eIds.practice("TIM-1").toHexString();
    expect((await call(list.GET, `/api/practices/${tim}/comments`, { id: tim })).status).toBe(404);
    await as("pm");
    const got = await call(list.GET, `/api/practices/${id}/comments?all=1`, { id });
    expect(got.body).toMatchObject({ canComment: true, items: [{ id: created.body.id, canEdit: false, canDelete: false }] });
    expect((await call(one.PATCH, `/api/practices/${id}/comments/${created.body.id}`, { id, commentId: created.body.id }, { method: "PATCH", body: { body: "no", mentions: [] } })).status).toBe(403);
    expect((await call(men.GET, `/api/practices/${id}/mentionable`, { id })).body).toMatchObject({ all: { label: "@tutti" } });
    await as("ut");
    expect((await call(one.DELETE, `/api/practices/${id}/comments/${created.body.id}`, { id, commentId: created.body.id }, { method: "DELETE" })).status).toBe(204);
    expect((await call(list.GET, `/api/practices/${id}/comments`, { id })).body.items[0]).toMatchObject({ deleted: true, body: "" });
  });
});
