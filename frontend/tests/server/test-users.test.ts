// @vitest-environment node
/**
 * Utenti della prova di carico (ops/utenti-prova): creazione, ricreazione, rifiuto sulle email di utenti veri,
 * disattivazione in blocco con audit; il bundle d'esercizio scrive le credenziali solo nel file e rifiuta
 * practicehub_prod senza --consenti-esercizio.
 *   MONGO_RS_TEST_URL="mongodb://127.0.0.1:27021/?directConnection=true" yarn vitest run tests/server/test-users.test.ts
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { ROLE_GROUP } from "@/lib/contract";
import { verifyPassword } from "@/lib/password";
import { store } from "@/lib/store/db";
import { buildOps } from "../../scripts/build-ops.mjs";
import { assertDisposableTarget } from "../../scripts/db/guard";
import { createTestUsers, disableTestUsers, testEmail, type TestCredential } from "../../scripts/db/test-users-core";
import { seedS0 } from "../fixtures/assistant-e";

const URL_RS = process.env.MONGO_RS_TEST_URL;
describe.skipIf(!URL_RS)("utenti della prova di carico", () => {
  let client: MongoClient;
  let db: Db;
  let tmp: string;
  const DB = `practicehub_test_utenti_prova_${Date.now()}`;
  const testUsers = () => store.users(db).find({ testAccount: true }).sort({ email: 1 }).toArray();

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    client = await new MongoClient(URL_RS!).connect();
    db = client.db(DB);
    await seedS0(db);
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "practicehub-utenti-prova-"));
  }, 240_000);
  afterAll(async () => {
    await client?.db(DB).dropDatabase();
    await client?.close();
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("crea N utenti attivi non leader, coerenti e con pratiche visibili; la ricreazione cambia le password", async () => {
    let first: TestCredential[] = [];
    const r = await createTestUsers(db, { n: 12, beforeWrite: (c) => void (first = c) });
    expect(r).toMatchObject({ created: 12, updated: 0 });
    expect(Object.keys(r.byRole).sort()).toEqual(["AIE", "DL", "PE", "PERMESSI", "PM", "UT"]);
    const users = await testUsers();
    expect(users.map((u) => u.email)).toEqual(Array.from({ length: 12 }, (_, k) => testEmail(k + 1)));
    const withPractices = new Set(await store.practices(db).distinct("templateId", { archived: false }));
    for (const u of users) {
      expect(u).toMatchObject({ status: "active", isAdmin: false, authVersion: 1 });
      expect(u.mustChangePassword).toBeUndefined();
      expect(u.memberships.length).toBeGreaterThan(0);
      for (const m of u.memberships) {
        expect(m.leader).toBe(false);
        expect(ROLE_GROUP[m.role]).toBe(m.group);
        expect(withPractices.has(m.templateId)).toBe(true);
      }
    }
    const c1 = first.find((c) => c.email === testEmail(1))!;
    expect(c1.password.length).toBeGreaterThanOrEqual(20);
    expect(await verifyPassword(c1.password, users[0].passwordHash!)).toBe(true);

    let second: TestCredential[] = [];
    expect(await createTestUsers(db, { n: 12, beforeWrite: (c) => void (second = c) })).toMatchObject({ created: 0, updated: 12 });
    const again = (await testUsers())[0];
    expect(again.authVersion).toBe(2);
    expect(await verifyPassword(c1.password, again.passwordHash!)).toBe(false);
    expect(await verifyPassword(second[0].password, again.passwordHash!)).toBe(true);
    expect(await store.auditLog(db).countDocuments({ kind: "TEST_USERS", action: "CREATE", count: 12 })).toBe(2);
    expect(JSON.stringify(await store.auditLog(db).find({ kind: "TEST_USERS" }).toArray())).not.toContain(second[0].password);
  });

  it("rifiuta senza scrivere niente se un'email di prova è di un utente vero; disattiva solo i marcati, con audit", async () => {
    const before = await store.users(db).countDocuments({});
    await store.users(db).insertOne({ ...(await store.users(db).findOne({ testAccount: { $exists: false } }))!, _id: undefined as never, email: testEmail(15) });
    const real = (await store.users(db).findOne({ email: testEmail(15) }))!;
    let called = false;
    await expect(createTestUsers(db, { n: 15, beforeWrite: () => void (called = true) })).rejects.toThrow(/utenti veri/);
    expect(called).toBe(false);
    expect(await store.users(db).countDocuments({})).toBe(before + 1);

    const activeReal = await store.users(db).countDocuments({ testAccount: { $exists: false }, status: "active" });
    expect(await disableTestUsers(db)).toEqual({ disabled: 12 });
    expect((await testUsers()).every((u) => u.status === "deactivated" && u.authVersion === 3)).toBe(true);
    expect(await store.users(db).countDocuments({ testAccount: { $exists: false }, status: "active" })).toBe(activeReal);
    expect((await store.users(db).findOne({ _id: real._id }))!.status).toBe("active");
    expect(await store.auditLog(db).findOne({ kind: "TEST_USERS", action: "DISABLE" })).toMatchObject({ count: 12, actorName: "ops/utenti-prova" });
    expect(await disableTestUsers(db)).toEqual({ disabled: 0 });
    expect(await store.auditLog(db).countDocuments({ kind: "TEST_USERS", action: "DISABLE" })).toBe(1);
    await store.users(db).deleteOne({ _id: real._id });
  });

  it("bundle d'esercizio: credenziali solo nel file, niente a schermo; practicehub_prod rifiutato senza il flag", async () => {
    const outdir = path.join(tmp, "ops");
    await buildOps({ outdir, log: () => {} });
    const run = (args: string[]) =>
      spawnSync(process.execPath, [path.join(outdir, "utenti-prova.mjs"), ...args], {
        cwd: outdir,
        env: { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "" } as unknown as NodeJS.ProcessEnv,
        encoding: "utf8",
        timeout: 120_000,
      });
    const file = path.join(tmp, "installazione", "credenziali.json");

    const prod = run(["--uri", URL_RS!, "--db", "practicehub_prod", "--file", file]);
    expect(prod.status).toBe(1);
    expect(prod.stderr).toContain("--consenti-esercizio");
    expect(fs.existsSync(file)).toBe(false);

    const ok = run(["--uri", URL_RS!, "--db", DB, "--file", file, "--n", "5"]);
    expect(ok.status, ok.stderr).toBe(0);
    const saved = JSON.parse(fs.readFileSync(file, "utf8")) as { db: string; users: TestCredential[] };
    expect(saved.db).toBe(DB);
    expect(saved.users).toHaveLength(5);
    const screen = ok.stdout + ok.stderr;
    expect(screen).toContain("Utenti di prova pronti: 0 creati, 5 ricreati");
    expect(screen).not.toContain("@prova.invalid");
    for (const u of saved.users) expect(screen).not.toContain(u.password);
    expect((await store.users(db).findOne({ email: testEmail(1) }))!.status).toBe("active");

    const exists = run(["--uri", URL_RS!, "--db", DB, "--file", file]);
    expect(exists.status).toBe(1);
    expect(exists.stderr).toContain("--sovrascrivi");
    expect(JSON.parse(fs.readFileSync(file, "utf8")).users[0].password).toBe(saved.users[0].password);

    const off = run(["--uri", URL_RS!, "--db", DB, "--disattiva-prova"]);
    expect(off.status, off.stderr).toBe(0);
    expect(off.stdout).toContain("Utenti di prova disattivati: 5.");
  }, 180_000);
});
