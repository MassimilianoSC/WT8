// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, ObjectId, type Db } from "mongodb";
import type { MembershipDTO } from "@/lib/contract";
import { resolveUserById, toMeDTO } from "@/lib/current-user";
import { bootstrapStore, store } from "@/lib/store/db";
import { buildNewPractice } from "@/lib/store/practice-factory";
import type { StoreUserDoc } from "@/lib/store/types";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";
import {
  assertMembershipsCoherent,
  assertTemplateHasPmLeader,
  assignableUsers,
  inviteUser,
  listUsers,
  requestPasswordReset,
  resendInvite,
  setPasswordWithToken,
  templatesWithoutPmLeader,
  updateUser,
  type StoreDeps,
} from "@/services/users-v2";
import { assertDisposableTarget } from "../../scripts/db/guard";

describe("coerenza delle appartenenze (D-17)", () => {
  it("422 per ruolo e gruppo incompatibili o appartenenze ripetute", () => {
    expect(() => assertMembershipsCoherent([{ templateId: "ILIAD", group: "AIE", role: "PE", leader: false }])).toThrow(/incompatibile/);
    const m: MembershipDTO = { templateId: "ILIAD", group: "UT_PE", role: "PE", leader: false };
    expect(() => assertMembershipsCoherent([m, { ...m, leader: true }])).toThrow(/ripetuta/);
    expect(() => assertMembershipsCoherent([m, { ...m, role: "UT" }])).not.toThrow();
  });
});

const URL_RS = process.env.MONGO_RS_TEST_URL;
describe.skipIf(!URL_RS)("servizi utenti sul replica set usa-e-getta", () => {
  let client: MongoClient;
  let db: Db;
  let deps: StoreDeps;
  const DB = `practicehub_test_users_${Date.now()}`;
  const admin = { id: "admin", isAdmin: true };
  const now = new Date("2026-10-08T07:00:00Z");

  const user = async (key: string, memberships: MembershipDTO[], extra: Partial<StoreUserDoc> = {}) => {
    const doc: StoreUserDoc = { _id: new ObjectId(), email: `${key}@test.local`, name: key, passwordHash: null, status: "active", isAdmin: false, memberships, authVersion: 1, createdAt: now, updatedAt: now, ...extra };
    await store.users(db).insertOne(doc);
    return doc;
  };
  const pmLeader = (templateId: MembershipDTO["templateId"]): MembershipDTO => ({ templateId, group: "PM_PERMESSI", role: "PM", leader: true });
  const practice = async (templateId: "INWIT" | "LEONARDO" | "TOWERNET" | "TIM_FIBERCOP", archived = false) => {
    const b = buildNewPractice({ practiceId: new ObjectId(), iterationId: new ObjectId(), templateId, template: COMPILED_TEMPLATES[templateId].template, identity: { codiceG7: "1", codiceSito: "S", nomeSito: "N", committente: { code: "X" }, clienteFinale: { code: "Y" } }, createdBy: null, now });
    await store.practices(db).insertOne({ ...b.practice, archived });
  };

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    client = await new MongoClient(URL_RS!).connect();
    db = client.db(DB);
    deps = { client, db };
    await bootstrapStore(db);
  });
  afterAll(async () => {
    await client?.db(DB).dropDatabase();
    await client?.close();
  });

  it("invito: utente invitato, token e mail nell'outbox; 409 email doppia; 403 non ADMIN; 422 incoerente", async () => {
    const u = await inviteUser(deps, admin, { name: "Nuova PE", email: " Nuova.PE@Test.local ", memberships: [{ templateId: "ILIAD", group: "UT_PE", role: "PE", leader: false }] });
    expect(u).toMatchObject({ email: "nuova.pe@test.local", status: "invited", isAdmin: false });
    expect(await store.authTokens(db).countDocuments({ userId: new ObjectId(u.id), type: "invite" })).toBe(1);
    expect(await store.outbox(db).countDocuments({ eventKey: `invite:${u.id}` })).toBe(1);
    await expect(inviteUser(deps, admin, { name: "x", email: "nuova.pe@test.local", memberships: [{ templateId: "ILIAD", group: "UT_PE", role: "PE", leader: false }] })).rejects.toMatchObject({ status: 409 });
    await expect(inviteUser(deps, { id: "u", isAdmin: false }, { name: "x", email: "y@test.local", memberships: [] })).rejects.toMatchObject({ status: 403 });
    await expect(inviteUser(deps, admin, { name: "x", email: "z@test.local", memberships: [{ templateId: "ILIAD", group: "DL", role: "PE", leader: false }] })).rejects.toMatchObject({ status: 422 });
  });

  it("password dal token d'invito: attiva l'account, mail di benvenuto, token non riusabile", async () => {
    const u = await inviteUser(deps, admin, { name: "Token", email: "token@test.local", memberships: [{ templateId: "INWIT", group: "AIE", role: "AIE", leader: false }] });
    const { token } = (await store.authTokens(db).findOne({ userId: new ObjectId(u.id) }))!;
    expect(await setPasswordWithToken(deps, token, "Password-Lunga-1", "invite")).toEqual({ email: "token@test.local" });
    expect((await store.users(db).findOne({ _id: new ObjectId(u.id) }))!.status).toBe("active");
    expect(await store.outbox(db).countDocuments({ eventKey: `welcome:${u.id}` })).toBe(1);
    await expect(setPasswordWithToken(deps, token, "Password-Lunga-2", "invite")).rejects.toMatchObject({ status: 400 });
    expect(await requestPasswordReset(deps, "nessuno@test.local")).toEqual({ ok: true });
  });

  it("nuovo invio dell'invito (D-108): annulla il token precedente; 409 se l'utente è già attivo", async () => {
    const u = await inviteUser(deps, admin, { name: "Rinvio", email: "rinvio@test.local", memberships: [{ templateId: "INWIT", group: "DL", role: "DL", leader: false }] });
    const old = (await store.authTokens(db).findOne({ userId: new ObjectId(u.id) }))!.token;
    await resendInvite(deps, admin, u.id);
    const tokens = await store.authTokens(db).find({ userId: new ObjectId(u.id), type: "invite" }).toArray();
    expect(tokens).toHaveLength(2);
    expect(tokens.filter((t) => t.usedAt === null)).toHaveLength(1);
    await expect(setPasswordWithToken(deps, old, "Password-Lunga-1", "invite")).rejects.toMatchObject({ status: 400 });
    const fresh = tokens.find((t) => t.usedAt === null)!.token;
    await setPasswordWithToken(deps, fresh, "Password-Lunga-1", "invite");
    await expect(resendInvite(deps, admin, u.id)).rejects.toMatchObject({ status: 409 });
    await expect(resendInvite(deps, { id: "x", isAdmin: false }, u.id)).rejects.toMatchObject({ status: 403 });
  });

  it("D-101: l'ultimo PM leader di un gestore con pratiche aperte non si toglie; con sole archiviate sì", async () => {
    const solo = await user("leader.inwit", [pmLeader("INWIT")]);
    await practice("INWIT");
    await expect(updateUser(deps, admin, solo._id.toHexString(), { memberships: [{ ...pmLeader("INWIT"), leader: false }] })).rejects.toMatchObject({
      status: 422,
      extra: { templatesWithoutPmLeader: ["INWIT"] },
    });
    await expect(updateUser(deps, admin, solo._id.toHexString(), { status: "deactivated" })).rejects.toMatchObject({ status: 422 });
    expect((await store.users(db).findOne({ _id: solo._id }))!.memberships[0].leader).toBe(true);
    // Il messaggio nomina il gestore come l'interfaccia ("TIM / FIBERCOP"), non col codice.
    const tim = await user("leader.tim", [pmLeader("TIM_FIBERCOP")]);
    await practice("TIM_FIBERCOP");
    await expect(updateUser(deps, admin, tim._id.toHexString(), { status: "deactivated" })).rejects.toThrow("Il gestore TIM / FIBERCOP resterebbe senza PM leader attivo");

    const leo = await user("leader.leonardo", [pmLeader("LEONARDO")]);
    await practice("LEONARDO", true); // solo archiviate: gestore non attivo
    const r = await updateUser(deps, admin, leo._id.toHexString(), { memberships: [{ ...pmLeader("LEONARDO"), leader: false }] });
    expect(r.memberships[0].leader).toBe(false);
    expect((await store.users(db).findOne({ _id: leo._id }))!.authVersion).toBe(2);
    expect(await templatesWithoutPmLeader(db)).toContain("LEONARDO");
    await expect(assertTemplateHasPmLeader(db, "LEONARDO")).rejects.toMatchObject({ status: 422 });
    await expect(assertTemplateHasPmLeader(db, "INWIT")).resolves.toBeUndefined();
  });

  it("D-101 in concorrenza: togliere insieme due PM leader dello stesso gestore attivo → al massimo uno riesce", async () => {
    const a = await user("tn.a", [pmLeader("TOWERNET")]);
    const b = await user("tn.b", [pmLeader("TOWERNET")]);
    await practice("TOWERNET");
    const results = await Promise.allSettled([
      updateUser(deps, admin, a._id.toHexString(), { memberships: [{ ...pmLeader("TOWERNET"), leader: false }] }),
      updateUser(deps, admin, b._id.toHexString(), { memberships: [{ ...pmLeader("TOWERNET"), leader: false }] }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled").length).toBeLessThanOrEqual(1);
    expect(await templatesWithoutPmLeader(db)).not.toContain("TOWERNET");
  });

  it("elenco, utenti assegnabili (stessa appartenenza) e utente corrente per email", async () => {
    const pe = await user("pe.iliad", [{ templateId: "ILIAD", group: "UT_PE", role: "PE", leader: false }]);
    await user("pe.spento", [{ templateId: "ILIAD", group: "UT_PE", role: "PE", leader: false }], { status: "deactivated" });
    await user("ut.iliad", [{ templateId: "ILIAD", group: "UT_PE", role: "UT", leader: false }]);
    const ass = await assignableUsers(db, "ILIAD", "PE");
    expect(ass.map((x) => x.name)).toContain("pe.iliad");
    expect(ass.map((x) => x.name)).not.toContain("pe.spento");
    expect(ass.map((x) => x.name)).not.toContain("ut.iliad");
    const list = await listUsers(db);
    expect(list.items.length).toBeGreaterThan(5);
    expect(Array.isArray(list.templatesWithoutPmLeader)).toBe(true);

    // Cutover 3.5: utente della sessione risolto per id, solo se attivo.
    const idOf = async (email: string) => (await store.users(db).findOne({ email }))!._id.toHexString();
    expect((await resolveUserById(db, pe._id.toHexString()))!.email).toBe("pe.iliad@test.local");
    expect(await resolveUserById(db, await idOf("pe.spento@test.local"))).toBeNull();
    expect(await resolveUserById(db, null)).toBeNull();
    expect(await resolveUserById(db, "non-un-id")).toBeNull();
    const leader = (await resolveUserById(db, await idOf("leader.inwit@test.local")))!;
    expect(toMeDTO(leader)).toMatchObject({ canCreate: ["INWIT"], mustChangePassword: false });
  });

  it("v0.5.4: l'ultimo ADMIN attivo non si toglie isAdmin né si disattiva (anche da un altro ADMIN); con un altro ADMIN attivo sì", async () => {
    // In questo database non ci sono altri ADMIN: si parte da uno solo, più uno disattivato e uno invitato che non contano.
    expect(await store.users(db).countDocuments({ isAdmin: true, status: "active" })).toBe(0);
    const solo = await user("admin.solo", [], { isAdmin: true });
    await user("admin.spento", [], { isAdmin: true, status: "deactivated" });
    await user("admin.invitato", [], { isAdmin: true, status: "invited" });
    const id = solo._id.toHexString();
    const self = { id, isAdmin: true };
    for (const change of [{ isAdmin: false, memberships: [pmLeader("FASTWEB_VODAFONE")] }, { status: "deactivated" as const }, { status: "invited" as const }]) {
      await expect(updateUser(deps, self, id, change)).rejects.toMatchObject({ status: 422, message: "Serve almeno un amministratore attivo", extra: { code: "LAST_ADMIN" } });
      await expect(updateUser(deps, admin, id, change)).rejects.toMatchObject({ status: 422, extra: { code: "LAST_ADMIN" } });
    }
    expect(await store.users(db).findOne({ _id: solo._id })).toMatchObject({ isAdmin: true, status: "active", authVersion: 1 });
    // Altre modifiche all'ultimo ADMIN restano possibili.
    expect(await updateUser(deps, self, id, { name: "Admin unico" })).toMatchObject({ name: "Admin unico", isAdmin: true });
    // Con un secondo ADMIN attivo il primo può togliersi isAdmin; il secondo, ora unico, no.
    const second = await user("admin.due", [], { isAdmin: true });
    expect(await updateUser(deps, self, id, { isAdmin: false, memberships: [pmLeader("FASTWEB_VODAFONE")] })).toMatchObject({ isAdmin: false });
    await expect(updateUser(deps, admin, second._id.toHexString(), { status: "deactivated" })).rejects.toMatchObject({ status: 422, extra: { code: "LAST_ADMIN" } });
    expect(await store.users(db).countDocuments({ isAdmin: true, status: "active" })).toBe(1);
  });

  it("v0.5.4 in concorrenza: due ADMIN che si tolgono insieme → al massimo uno riesce, ne resta sempre uno attivo", async () => {
    // Dalla prova precedente resta un ADMIN attivo (admin.due): se ne aggiunge uno, poi i due si disattivano insieme.
    const a = (await store.users(db).findOne({ email: "admin.due@test.local" }))!;
    const b = await user("admin.tre", [], { isAdmin: true });
    for (let round = 0; round < 3; round++) {
      const results = await Promise.allSettled([
        updateUser(deps, { id: a._id.toHexString(), isAdmin: true }, a._id.toHexString(), { status: "deactivated" }),
        updateUser(deps, { id: b._id.toHexString(), isAdmin: true }, b._id.toHexString(), { status: "deactivated" }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled").length).toBeLessThanOrEqual(1);
      expect(await store.users(db).countDocuments({ isAdmin: true, status: "active" })).toBeGreaterThanOrEqual(1);
      // Si rimettono tutti e due attivi per il giro dopo.
      await store.users(db).updateMany({ _id: { $in: [a._id, b._id] } }, { $set: { status: "active" } });
    }
  });
});
