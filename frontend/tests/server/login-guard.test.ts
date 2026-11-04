// @vitest-environment node
/**
 * PR-22: limite ai tentativi di accesso falliti, per email e per indirizzo, e durata della sessione.
 *   MONGO_RS_TEST_URL="mongodb://127.0.0.1:27021/?directConnection=true" yarn vitest run tests/server/login-guard.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { NextRequest } from "next/server";
import { bootstrapStore, store } from "@/lib/store/db";
import { clientIp, guardedLogin, LOGIN_LIMITS, loginLimitsFromEnv, TooManyLoginAttempts } from "@/services/login-guard";
import { assertDisposableTarget } from "../../scripts/db/guard";

describe("limiti da .env", () => {
  it("per email 5, per indirizzo SPENTO di default (gateway di Docker comune a tutti); valori validi da env", () => {
    expect(loginLimitsFromEnv({} as NodeJS.ProcessEnv)).toMatchObject({ perEmail: 5, perIp: 0 });
    expect(loginLimitsFromEnv({ PH_LOGIN_LIMIT_PER_EMAIL: "8", PH_LOGIN_LIMIT_PER_IP: "30" } as unknown as NodeJS.ProcessEnv)).toMatchObject({ perEmail: 8, perIp: 30 });
    expect(loginLimitsFromEnv({ PH_LOGIN_LIMIT_PER_EMAIL: "0", PH_LOGIN_LIMIT_PER_IP: "abc" } as unknown as NodeJS.ProcessEnv)).toMatchObject({ perEmail: 1, perIp: 0 });
  });
});

describe("indirizzo del client", () => {
  it("primo valore di X-Forwarded-For (proxy), poi X-Real-IP", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "172.16.1.50, 10.0.0.2" }))).toBe("172.16.1.50");
    expect(clientIp(new Headers({ "x-real-ip": "172.16.1.51" }))).toBe("172.16.1.51");
    expect(clientIp(new Headers())).toBeNull();
  });
});

const URL_RS = process.env.MONGO_RS_TEST_URL;
describe.skipIf(!URL_RS)("limite ai tentativi sul replica set usa-e-getta", () => {
  let client: MongoClient;
  let db: Db;
  const DB = `practicehub_test_login_${Date.now()}`;
  // Orario relativo ad ADESSO: con un orario fisso già passato i tentativi nascono scaduti e l'indice TTL di Mongo
  // (passaggio ogni 60 s) può cancellarli a metà prova.
  const t0 = new Date(Date.now() - 60_000);
  const at = (ms: number) => new Date(t0.getTime() + ms);
  const user = { id: "u1" };
  let verifyCalls = 0;
  const ok = async () => (verifyCalls++, user);
  const ko = async () => (verifyCalls++, null);

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    client = await new MongoClient(URL_RS!).connect();
    db = client.db(DB);
    await bootstrapStore(db);
  });
  afterAll(async () => {
    await client?.db(DB).dropDatabase();
    await client?.close();
  });

  it("5 fallimenti per l'email → anche la password giusta è rifiutata, senza verificarla; dopo 15 minuti si riprova", async () => {
    for (let i = 0; i < LOGIN_LIMITS.perEmail; i++) expect(await guardedLogin({ db, email: "a@x.it", ip: "10.0.0.1", now: at(i * 1000), limits: LOGIN_LIMITS }, ko)).toBeNull();
    verifyCalls = 0;
    await expect(guardedLogin({ db, email: " A@X.it ", ip: "10.0.0.9", now: at(10_000) }, ok)).rejects.toBeInstanceOf(TooManyLoginAttempts);
    expect(verifyCalls).toBe(0);
    // Un'altra email dallo stesso indirizzo entra.
    expect(await guardedLogin({ db, email: "b@x.it", ip: "10.0.0.1", now: at(11_000) }, ok)).toBe(user);
    // Finestra scorsa: il primo fallimento esce e si riprova.
    expect(await guardedLogin({ db, email: "a@x.it", ip: "10.0.0.1", now: at(LOGIN_LIMITS.windowMs + 1_000) }, ok)).toBe(user);
  });

  it("un accesso riuscito azzera i fallimenti dell'email", async () => {
    for (let i = 0; i < LOGIN_LIMITS.perEmail - 1; i++) await guardedLogin({ db, email: "c@x.it", ip: null, now: at(i) }, ko);
    expect(await guardedLogin({ db, email: "c@x.it", ip: null, now: at(100) }, ok)).toBe(user);
    expect(await store.loginAttempts(db).countDocuments({ key: "email:c@x.it" })).toBe(0);
    for (let i = 0; i < LOGIN_LIMITS.perEmail - 1; i++) await guardedLogin({ db, email: "c@x.it", ip: null, now: at(200 + i) }, ko);
    expect(await guardedLogin({ db, email: "c@x.it", ip: null, now: at(300) }, ok)).toBe(user);
  });

  it("limite per indirizzo acceso (es. 20): 20 fallimenti con email diverse bloccano l'indirizzo; spento: nessun blocco", async () => {
    const limits = { ...LOGIN_LIMITS, perIp: 20 };
    for (let i = 0; i < 20; i++) await guardedLogin({ db, email: `u${i}@x.it`, ip: "10.9.9.9", now: at(i), limits }, ko);
    await expect(guardedLogin({ db, email: "nuovo@x.it", ip: "10.9.9.9", now: at(1_000), limits }, ok)).rejects.toThrow(/Troppi tentativi/);
    expect(await guardedLogin({ db, email: "nuovo@x.it", ip: "10.9.9.10", now: at(1_000), limits }, ok)).toBe(user);
    // Default (spento): tutti dietro lo stesso gateway, nessun blocco collettivo.
    for (let i = 0; i < 30; i++) await guardedLogin({ db, email: `g${i}@x.it`, ip: "172.17.0.1", now: at(2_000 + i), limits: LOGIN_LIMITS }, ko);
    expect(await guardedLogin({ db, email: "collega@x.it", ip: "172.17.0.1", now: at(3_000), limits: LOGIN_LIMITS }, ok)).toBe(user);
  });

  it("i tentativi scadono da soli (indice TTL)", async () => {
    const ttl = (await store.loginAttempts(db).indexes()).find((i) => i.key.expiresAt === 1);
    expect(ttl?.expireAfterSeconds).toBe(0);
    const doc = await store.loginAttempts(db).findOne({});
    expect(doc!.expiresAt.getTime() - doc!.at.getTime()).toBe(LOGIN_LIMITS.windowMs);
  });
});

describe.skipIf(!URL_RS)("login vero (rotte di NextAuth) con il limite", () => {
  const DB = `practicehub_test_loginroute_${Date.now()}`;
  const ADMIN = { email: "admin.limite@prova.local", password: "Prova-Limite-2026" };
  let route: typeof import("@/app/api/auth/[...nextauth]/route");
  let client: MongoClient;

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    Object.assign(process.env, {
      MONGO_URL: URL_RS,
      DB_NAME: DB,
      NEW_DB_NAME: `${DB}_v2`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      AUTH_SECRET: "segreto-di-prova-solo-per-i-test-0123456789",
      AUTH_URL: "http://127.0.0.1:3999",
    });
    route = await import("@/app/api/auth/[...nextauth]/route");
    client = await new MongoClient(URL_RS!).connect();
  }, 180_000);
  afterAll(async () => {
    for (const d of [DB, `${DB}_v2`]) await client?.db(d).dropDatabase();
    await client?.close();
  });

  /** Login come fa next-auth/react: token CSRF, poi POST delle credenziali; restituisce l'URL di esito. */
  async function login(password: string): Promise<string> {
    const csrf = await route.GET(new NextRequest("http://127.0.0.1:3999/api/auth/csrf"));
    const { csrfToken } = (await csrf.json()) as { csrfToken: string };
    const cookie = csrf.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const res = await route.POST(
      new NextRequest("http://127.0.0.1:3999/api/auth/callback/credentials", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", cookie, "x-auth-return-redirect": "1", "x-forwarded-for": "172.16.1.77" },
        body: new URLSearchParams({ csrfToken, email: ADMIN.email, password, callbackUrl: "http://127.0.0.1:3999/" }),
      })
    );
    return ((await res.json()) as { url: string }).url;
  }

  it("password giusta entra; dopo 5 errate anche quella giusta riceve troppi_tentativi", async () => {
    expect(await login(ADMIN.password)).not.toMatch(/error=/);
    for (let i = 0; i < LOGIN_LIMITS.perEmail; i++) expect(await login("sbagliata")).toMatch(/error=CredentialsSignin/);
    const blocked = await login(ADMIN.password);
    expect(blocked).toMatch(/error=CredentialsSignin/);
    expect(blocked).toMatch(/code=troppi_tentativi/);
  }, 120_000);
});
