// @vitest-environment node
/**
 * Cutover del codice 3.5: login sugli utenti del modello nuovo, sessione { id, name, email, isAdmin }, utente riletto
 * per id, primo ADMIN dall'ambiente con cambio password obbligatorio (D-173), rotte di accesso v2 con gli stati che
 * le pagine di o3 si aspettano (400/401/404/422/429). Replica set usa-e-getta:
 *   MONGO_RS_TEST_URL="mongodb://127.0.0.1:27021/?directConnection=true" yarn vitest run tests/server/auth-cutover.test.ts
 */
import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { verifyPassword } from "@/lib/password";
import { bootstrapStore, store } from "@/lib/store/db";
import type { StoreUserDoc } from "@/lib/store/types";
import { assertDisposableTarget } from "../../scripts/db/guard";

// Le rotte di NextAuth sono quelle vere; auth() fuori da una richiesta di Next non legge i cookie, quindi restituisce
// la sessione che la rotta /api/auth/session ha appena prodotto (state.session).
const state: { session: Session | null } = { session: null };
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<object>()), auth: async () => state.session }));

const URL_RS = process.env.MONGO_RS_TEST_URL;
const T0 = new Date("2026-10-09T08:00:00Z");

describe.skipIf(!URL_RS)("primo ADMIN dall'ambiente (D-173)", () => {
  let client: MongoClient;
  const DB = `practicehub_test_firstadmin_${Date.now()}`;
  const env = { ADMIN_EMAIL: " Primo.Admin@Prova.local ", ADMIN_PASSWORD: "Iniziale-2026" } as unknown as NodeJS.ProcessEnv;

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    client = await new MongoClient(URL_RS!).connect();
    for (const d of [DB, `${DB}_b`, `${DB}_c`]) await bootstrapStore(client.db(d));
  }, 180_000);
  afterAll(async () => {
    for (const d of [DB, `${DB}_b`, `${DB}_c`]) await client?.db(d).dropDatabase();
    await client?.close();
  });

  it("nasce solo se manca un ADMIN attivo, con il flag; mai account demo; la password non si riallinea", async () => {
    const { ensureFirstAdmin } = await import("@/services/first-admin");
    const db = client.db(DB);
    expect(await ensureFirstAdmin(db, {} as NodeJS.ProcessEnv, T0)).toBe("not-configured");
    expect(await ensureFirstAdmin(db, env, T0)).toBe("created");
    const users = await store.users(db).find({}).toArray();
    expect(users).toHaveLength(1); // nessun account demo
    expect(users[0]).toMatchObject({ email: "primo.admin@prova.local", isAdmin: true, status: "active", memberships: [], mustChangePassword: true });
    expect(await verifyPassword("Iniziale-2026", users[0].passwordHash!)).toBe(true);
    // Riavvio con un'altra password nell'ambiente: niente cambia.
    expect(await ensureFirstAdmin(db, { ...env, ADMIN_PASSWORD: "Altra-2026" }, T0)).toBe("admin-exists");
    expect((await store.users(db).findOne({}))!.passwordHash).toBe(users[0].passwordHash);
  });

  it("utente con quell'email già presente (non ADMIN attivo): non si tocca", async () => {
    const { ensureFirstAdmin } = await import("@/services/first-admin");
    const db = client.db(`${DB}_b`);
    const doc: StoreUserDoc = { _id: new ObjectId(), email: "primo.admin@prova.local", name: "Esistente", passwordHash: null, status: "deactivated", isAdmin: true, memberships: [], authVersion: 3, createdAt: T0, updatedAt: T0 };
    await store.users(db).insertOne(doc);
    expect(await ensureFirstAdmin(db, env, T0)).toBe("email-taken");
    expect(await store.users(db).findOne({})).toEqual(doc);
  });

  it("due avvii insieme: un solo ADMIN", async () => {
    const { ensureFirstAdmin } = await import("@/services/first-admin");
    const db = client.db(`${DB}_c`);
    const r = await Promise.all([ensureFirstAdmin(db, env, T0), ensureFirstAdmin(db, env, T0)]);
    expect(r.filter((x) => x === "created")).toHaveLength(1);
    expect(await store.users(db).countDocuments()).toBe(1);
  });
});

describe.skipIf(!URL_RS)("login, sessione e rotte di accesso sul modello nuovo (cutover 3.5)", () => {
  const DB = `practicehub_test_authv2_${Date.now()}`;
  const ADMIN = { email: "admin.cutover@prova.local", password: "Iniziale-Cutover-2026" };
  const BASE = "http://127.0.0.1:3999";
  let nextauth: typeof import("@/app/api/auth/[...nextauth]/route");
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    Object.assign(process.env, {
      MONGO_URL: URL_RS,
      NEW_DB_NAME: DB,
      DB_NAME: `${DB}_legacy`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      AUTH_SECRET: "segreto-di-prova-solo-per-i-test-0123456789",
      AUTH_URL: BASE,
      SMTP_HOST: "",
    });
    nextauth = await import("@/app/api/auth/[...nextauth]/route");
    client = await new MongoClient(URL_RS!).connect();
    db = client.db(DB);
  }, 180_000);
  afterAll(async () => {
    for (const d of [DB, `${DB}_legacy`]) await client?.db(d).dropDatabase();
    await client?.close();
  });

  /** Login come next-auth/react; restituisce la sessione (GET /api/auth/session) o null se rifiutato. */
  async function login(email: string, password: string): Promise<{ url: string; session: Session | null }> {
    const csrf = await nextauth.GET(new NextRequest(`${BASE}/api/auth/csrf`));
    const { csrfToken } = (await csrf.json()) as { csrfToken: string };
    const cookie = csrf.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const res = await nextauth.POST(
      new NextRequest(`${BASE}/api/auth/callback/credentials`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", cookie, "x-auth-return-redirect": "1" },
        body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/` }),
      })
    );
    const { url } = (await res.json()) as { url: string };
    const sessionCookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).find((c) => /session-token=/.test(c));
    if (!sessionCookie) return { url, session: null };
    const s = await nextauth.GET(new NextRequest(`${BASE}/api/auth/session`, { headers: { cookie: sessionCookie } }));
    return { url, session: (await s.json()) as Session };
  }

  type Handler = (req: Request, ctx: { params: Record<string, string> }) => Promise<Response>;
  async function call(handler: Handler, url: string, body?: unknown) {
    const res = await handler(new Request(`${BASE}${url}`, { method: body === undefined ? "GET" : "POST", ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), { params: {} });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  async function addUser(email: string, password: string | null, extra: Partial<StoreUserDoc> = {}): Promise<StoreUserDoc> {
    const { hashPassword } = await import("@/lib/password");
    const doc: StoreUserDoc = {
      _id: new ObjectId(), email, name: email.split("@")[0], passwordHash: password ? await hashPassword(password) : null,
      status: "active", isAdmin: false, memberships: [{ templateId: "INWIT", group: "UT_PE", role: "UT", leader: false }], authVersion: 1,
      createdAt: T0, updatedAt: T0, ...extra,
    };
    await store.users(db).insertOne(doc);
    return doc;
  }
  async function addToken(userId: ObjectId, type: "invite" | "reset", expiresAt = new Date(Date.now() + 3600_000)): Promise<string> {
    const token = crypto.randomBytes(32).toString("hex");
    await store.authTokens(db).insertOne({ _id: new ObjectId(), userId, type, token, expiresAt, usedAt: null, createdAt: new Date() });
    return token;
  }

  it("primo accesso: nasce l'ADMIN, sessione { id, name, email, isAdmin }; tutto 403 CAMBIO_PASSWORD tranne me e cambio password; poi subito libero", async () => {
    const me = await import("@/app/api/me/route");
    const practices = await import("@/app/api/practices/route");
    const templates = await import("@/app/api/templates/route");
    const change = await import("@/app/api/auth/change-password/route");

    const { url, session } = await login(ADMIN.email, ADMIN.password);
    expect(url).not.toMatch(/error=/);
    expect(await store.users(db).countDocuments()).toBe(1); // solo l'ADMIN, nessun account demo
    const admin = (await store.users(db).findOne({}))!;
    expect(session!.user).toEqual({ id: admin._id.toHexString(), name: "Amministratore", email: ADMIN.email, isAdmin: true });
    state.session = session;

    expect((await call(me.GET, "/api/me")).body).toMatchObject({ id: admin._id.toHexString(), isAdmin: true, mustChangePassword: true });
    const blocked = await call(practices.GET, "/api/practices");
    expect(blocked).toMatchObject({ status: 403, body: { code: "CAMBIO_PASSWORD" } });
    expect((await call(templates.GET, "/api/templates")).status).toBe(403);

    expect((await call(change.POST, "/api/auth/change-password", { currentPassword: "sbagliata", newPassword: "Nuova-Password-2026" })).status).toBe(400);
    expect((await call(change.POST, "/api/auth/change-password", { currentPassword: ADMIN.password, newPassword: "corta" })).status).toBe(422);
    expect((await call(change.POST, "/api/auth/change-password", { currentPassword: ADMIN.password, newPassword: "Nuova-Password-2026" })).status).toBe(200);

    // Stessa sessione (stesso token): l'utente è riletto per id, il flag è già falso.
    expect((await call(me.GET, "/api/me")).body.mustChangePassword).toBe(false);
    expect((await call(practices.GET, "/api/practices")).status).toBe(200);
    expect((await store.users(db).findOne({ _id: admin._id }))!.mustChangePassword).toBeUndefined();
    // Il riavvio non ricrea né riallinea niente.
    const { ensureFirstAdmin } = await import("@/services/first-admin");
    expect(await ensureFirstAdmin(db)).toBe("admin-exists");
    expect((await login(ADMIN.email, "Nuova-Password-2026")).session).not.toBeNull();
    expect((await login(ADMIN.email, ADMIN.password)).session).toBeNull();
  }, 120_000);

  it("cambio password: 401 senza sessione, 429 dopo 5 password attuali errate (anche con quella giusta)", async () => {
    const change = await import("@/app/api/auth/change-password/route");
    state.session = null;
    expect((await call(change.POST, "/api/auth/change-password", { currentPassword: "x", newPassword: "Nuova-Password-2026" })).status).toBe(401);
    const u = await addUser("limite.cambio@prova.local", "Password-Giusta-1");
    state.session = { user: { id: u._id.toHexString(), name: u.name, email: u.email, isAdmin: false }, expires: "2099-01-01T00:00:00.000Z" };
    for (let i = 0; i < 5; i++) expect((await call(change.POST, "/api/auth/change-password", { currentPassword: "errata", newPassword: "Nuova-Password-2026" })).status).toBe(400);
    expect((await call(change.POST, "/api/auth/change-password", { currentPassword: "Password-Giusta-1", newPassword: "Nuova-Password-2026" })).status).toBe(429);
  });

  it("login solo per utenti attivi del modello nuovo; disattivato con sessione aperta: fuori alla richiesta successiva", async () => {
    await addUser("invitato@prova.local", null, { status: "invited" });
    await addUser("spento@prova.local", "Password-Spento-1", { status: "deactivated" });
    // Un utente che esiste solo nel database della beta non entra più.
    const { hashPassword } = await import("@/lib/password");
    await client.db(`${DB}_legacy`).collection("users").insertOne({ email: "solo.beta@prova.local", passwordHash: await hashPassword("Password-Beta-1"), role: "user", status: "active" });
    expect((await login("invitato@prova.local", "qualunque")).session).toBeNull();
    expect((await login("spento@prova.local", "Password-Spento-1")).session).toBeNull();
    expect((await login("solo.beta@prova.local", "Password-Beta-1")).session).toBeNull();

    const u = await addUser("ut.attivo@prova.local", "Password-Attivo-1");
    const { session } = await login("UT.Attivo@prova.local ", "Password-Attivo-1");
    expect(session!.user).toEqual({ id: u._id.toHexString(), name: "ut.attivo", email: "ut.attivo@prova.local", isAdmin: false });
    state.session = session;
    const me = await import("@/app/api/me/route");
    const practices = await import("@/app/api/practices/route");
    expect((await call(me.GET, "/api/me")).body).toMatchObject({ mustChangePassword: false, memberships: [{ templateId: "INWIT", role: "UT" }] });
    await store.users(db).updateOne({ _id: u._id }, { $set: { status: "deactivated" } });
    expect((await call(me.GET, "/api/me")).status).toBe(401);
    expect((await call(practices.GET, "/api/practices")).status).toBe(401);
  }, 120_000);

  it("password dimenticata: 422 email non valida; sempre ok; mail solo agli esistenti; 429 alla sesta richiesta", async () => {
    const forgot = await import("@/app/api/auth/forgot-password/route");
    const u = await addUser("dimentica@prova.local", "Password-Vecchia-1");
    expect((await call(forgot.POST, "/api/auth/forgot-password", { email: "non-una-email" })).status).toBe(422);
    expect((await call(forgot.POST, "/api/auth/forgot-password", { email: "nessuno@prova.local" })).status).toBe(200);
    expect(await store.authTokens(db).countDocuments({ type: "reset" })).toBe(0);
    for (let i = 0; i < 5; i++) expect((await call(forgot.POST, "/api/auth/forgot-password", { email: " Dimentica@prova.local" })).status).toBe(200);
    expect(await store.authTokens(db).countDocuments({ userId: u._id, type: "reset" })).toBe(5);
    expect((await call(forgot.POST, "/api/auth/forgot-password", { email: "dimentica@prova.local" })).status).toBe(429);
    expect(await store.authTokens(db).countDocuments({ userId: u._id, type: "reset" })).toBe(5);
  });

  it("invito e reset: 400 senza token, con token falso o scaduto; 422 password corta; 404 account disattivato; ok attiva e toglie il flag", async () => {
    const set = await import("@/app/api/auth/set-password/route");
    const reset = await import("@/app/api/auth/reset-password/route");
    const invited = await addUser("nuovo.invito@prova.local", null, { status: "invited" });
    const invite = await addToken(invited._id, "invite");
    expect((await call(set.POST, "/api/auth/set-password", { password: "Password-Nuova-1" })).status).toBe(400);
    expect((await call(set.POST, "/api/auth/set-password", { token: "abc", password: "Password-Nuova-1" })).status).toBe(400);
    expect((await call(set.POST, "/api/auth/set-password", { token: "f".repeat(64), password: "Password-Nuova-1" })).status).toBe(400);
    expect((await call(set.POST, "/api/auth/set-password", { token: invite, password: "corta" })).status).toBe(422);
    expect((await call(reset.POST, "/api/auth/reset-password", { token: invite, password: "Password-Nuova-1" })).status).toBe(400); // tipo diverso
    expect(await call(set.POST, "/api/auth/set-password", { token: invite, password: "Password-Nuova-1" })).toEqual({ status: 200, body: { email: "nuovo.invito@prova.local" } });
    expect((await store.users(db).findOne({ _id: invited._id }))!.status).toBe("active");
    expect((await call(set.POST, "/api/auth/set-password", { token: invite, password: "Password-Nuova-1" })).status).toBe(400); // già usato

    const expired = await addToken(invited._id, "reset", new Date(Date.now() - 1000));
    expect((await call(reset.POST, "/api/auth/reset-password", { token: expired, password: "Password-Nuova-2" })).status).toBe(400);
    const off = await addUser("spento.reset@prova.local", "Password-Spento-2", { status: "deactivated" });
    expect((await call(reset.POST, "/api/auth/reset-password", { token: await addToken(off._id, "reset"), password: "Password-Nuova-2" })).status).toBe(404);
    // Un reset scelto dall'utente chiude anche il cambio obbligatorio.
    const flagged = await addUser("flag.reset@prova.local", "Password-Iniziale-3", { isAdmin: true, mustChangePassword: true });
    expect((await call(reset.POST, "/api/auth/reset-password", { token: await addToken(flagged._id, "reset"), password: "Password-Scelta-3" })).status).toBe(200);
    expect((await store.users(db).findOne({ _id: flagged._id }))!.mustChangePassword).toBeUndefined();
  });
});
