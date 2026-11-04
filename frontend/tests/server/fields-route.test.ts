// @vitest-environment node
/**
 * D-132 P-06: ordine degli errori attraverso la VERA rotta PATCH /api/practices/{id}/fields (handle + parseBody), con
 * l'autenticazione simulata e il replica set usa-e-getta:
 *   MONGO_RS_TEST_URL="mongodb://127.0.0.1:27021/?directConnection=true" yarn vitest run tests/server/fields-route.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoClient, ObjectId, type Db } from "mongodb";
import type { MembershipDTO, UserDTO } from "@/lib/contract";
import { bootstrapStore, store } from "@/lib/store/db";
import type { StoreUserDoc } from "@/lib/store/types";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";
import { assertDisposableTarget } from "../../scripts/db/guard";

const state: { user: UserDTO | null; deps: { client: MongoClient; db: Db } | null } = { user: null, deps: null };
vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth-v2", () => ({
  requireCurrentUser: async () => {
    if (!state.user) throw Object.assign(new Error("Unauthenticated"), { status: 401 });
    return state.user;
  },
}));
vi.mock("@/services/users-v2", async (orig) => ({ ...(await orig<object>()), storeDeps: async () => state.deps }));

const T = COMPILED_TEMPLATES.INWIT.template;
const key = (flowId: string) => T.occurrences.find((o) => o.kind === "MASTER" && o.flowId === flowId)!.occurrenceKey;

const URL_RS = process.env.MONGO_RS_TEST_URL;
describe.skipIf(!URL_RS)("rotta del PATCH: ordine degli errori (D-132 P-06)", () => {
  let client: MongoClient;
  let db: Db;
  const DB = `practicehub_test_route_${Date.now()}`;
  const now = new Date("2026-10-08T07:00:00Z");
  const u: Record<string, UserDTO> = {};
  let practiceId = "";
  const m = (group: MembershipDTO["group"], role: MembershipDTO["role"], leader = false, templateId: MembershipDTO["templateId"] = "INWIT"): MembershipDTO => ({ templateId, group, role, leader });

  async function user(k: string, memberships: MembershipDTO[], extra: Partial<StoreUserDoc> = {}) {
    const { toUserDTO } = await import("@/services/users-v2");
    const doc: StoreUserDoc = { _id: new ObjectId(), email: `${k}@test.local`, name: k, passwordHash: null, status: "active", isAdmin: false, memberships, authVersion: 1, createdAt: now, updatedAt: now, ...extra };
    await store.users(db).insertOne(doc);
    u[k] = toUserDTO(doc);
  }
  async function call(as: UserDTO, body: unknown) {
    state.user = as;
    const { PATCH } = await import("@/app/api/practices/[id]/fields/route");
    const res = await PATCH(new Request("http://test/api", { method: "PATCH", body: JSON.stringify(body) }), { params: { id: practiceId } });
    return { status: res.status, body: await res.json() };
  }

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    client = await new MongoClient(URL_RS!).connect();
    db = client.db(DB);
    state.deps = { client, db };
    await bootstrapStore(db);
    await user("pmLeader", [m("PM_PERMESSI", "PM", true)]);
    await user("pm", [m("PM_PERMESSI", "PM")]);
    await user("ut", [m("UT_PE", "UT")]);
    await user("iliad", [m("PM_PERMESSI", "PM", true, "ILIAD")]);
    await user("admin", [], { isAdmin: true });
    const { createPractice } = await import("@/services/practices-v2/commands");
    const d = await createPractice({ client, db, clock: () => now }, u.pm, { templateId: "INWIT", committente: { code: "TODOS" }, clienteFinale: { code: "INWIT" }, codiceG7: "1", codiceSito: "R", nomeSito: "N" });
    practiceId = d.id;
  });
  afterAll(async () => {
    await client?.db(DB).dropDatabase();
    await client?.close();
  });

  const bad = (flowId: string, value: unknown) => ({ occurrenceKey: key(flowId), flowId, value });

  it("valore invalido: 404 per chi non vede, 409 per l'iterazione, 403 per chi non può scrivere; 422 solo poi", async () => {
    const body = (iteration: number) => ({ iteration, revision: 1, changes: [bad("F004", { code: "" })] });
    expect(await call(u.iliad, body(1))).toMatchObject({ status: 404 });
    expect(await call(u.admin, body(2))).toMatchObject({ status: 409, body: { code: "ITERATION_CONFLICT" } });
    expect(await call(u.ut, body(1))).toMatchObject({ status: 403, body: { rejected: [key("F004")] } });
    expect(await call(u.pm, body(1))).toMatchObject({ status: 422 });
    expect(await call(u.pm, { iteration: 1, revision: 9, changes: [bad("F003", "ok")] })).toMatchObject({ status: 409, body: { code: "REVISION_CONFLICT", currentRevision: 1 } });
  });

  it("struttura invalida: 422 subito (nessuna modifica identificabile)", async () => {
    expect(await call(u.pm, { iteration: 1, revision: 1, changes: [{ qualcosa: 1 }] })).toMatchObject({ status: 422 });
  });

  it("tutti i rejected, comprese le chiavi dei trasversali e di riga, mirror e archivio anche per l'ADMIN", async () => {
    const r = await call(u.ut, {
      iteration: 1,
      revision: 1,
      changes: [
        bad("F002", "x"),
        { transversal: "fatturato", value: "SI" },
        { repeat: "INTEGRAZIONE", op: "ADD_ROW", clientRowKey: "a" },
        { repeat: "VINCOLI", rowId: new ObjectId().toHexString(), constraint: { stato: { code: "PRESENTE" } } },
      ],
    });
    expect(r).toMatchObject({ status: 403, body: { rejected: [key("F002"), "TRASV.FATTURATO", "repeat:INTEGRAZIONE", "repeat:VINCOLI"] } });
    const mirror = T.occurrences.find((o) => o.kind === "MIRROR" && !o.repeatGroup)!;
    expect(await call(u.admin, { iteration: 1, revision: 1, changes: [{ occurrenceKey: mirror.occurrenceKey, flowId: mirror.flowId, value: null }] })).toMatchObject({ status: 403, body: { rejected: [mirror.occurrenceKey] } });
    await store.practices(db).updateOne({ _id: new ObjectId(practiceId) }, { $set: { archived: true } });
    expect(await call(u.admin, { iteration: 1, revision: 1, changes: [bad("F003", "x")] })).toMatchObject({ status: 403 });
    await store.practices(db).updateOne({ _id: new ObjectId(practiceId) }, { $set: { archived: false } });
  });
});
