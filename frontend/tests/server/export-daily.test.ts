// @vitest-environment node
/**
 * PR-18: export CSV giornaliero per gestore (piano B leggibile se l'app è ferma).
 *   MONGO_RS_TEST_URL="mongodb://127.0.0.1:27021/?directConnection=true" yarn vitest run tests/server/export-daily.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { TEMPLATE_IDS } from "@/lib/contract";
import { seedDemo } from "@/lib/store/seed-demo";
import { exportFoldersToRemove, runExportDaily } from "@/services/export-daily";
import { assertDisposableTarget } from "../../scripts/db/guard";

describe("conservazione delle cartelle", () => {
  it("tiene gli ultimi 7 giorni (oggi compreso); toglie solo cartelle-data più vecchie", () => {
    const names = ["2026-10-09", "2026-10-03", "2026-10-02", "2026-09-01", "LEGGIMI.txt", "appunti", "2026-10-10"];
    expect(exportFoldersToRemove(names, "2026-10-09", 7)).toEqual(["2026-09-01", "2026-10-02"]);
  });
});

const URL_RS = process.env.MONGO_RS_TEST_URL;
describe.skipIf(!URL_RS)("export giornaliero sul replica set usa-e-getta", () => {
  let client: MongoClient;
  let db: Db;
  let dir: string;
  const DB = `practicehub_test_export_${Date.now()}`;
  const at = (s: string) => new Date(s);

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    client = await new MongoClient(URL_RS!).connect();
    db = client.db(DB);
    await seedDemo(db, { password: "Prova-Export-2026" });
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ph-export-"));
  });
  afterAll(async () => {
    await client?.db(DB).dropDatabase();
    await client?.close();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("prima delle 06:30 di Roma non parte; dopo un file per gestore, completo, senza temporanei; una volta al giorno", async () => {
    expect((await runExportDaily({ client, db }, { owner: "w", dir, now: () => at("2026-10-09T04:29:00Z") })).status).toBe("NOT_DUE"); // 06:29 CEST
    fs.mkdirSync(path.join(dir, "2026-09-01"));
    fs.writeFileSync(path.join(dir, "LEGGIMI.txt"), "x");
    const r = await runExportDaily({ client, db }, { owner: "w", dir, now: () => at("2026-10-09T04:31:00Z") });
    expect(r.status, r.error).toBe("DONE");
    expect(r.files.sort()).toEqual(TEMPLATE_IDS.map((t) => path.join("2026-10-09", `WT8_${t}_2026-10-09.csv`)).sort());
    expect(r.removed).toEqual(["2026-09-01"]);
    expect(fs.readdirSync(dir).sort()).toEqual(["2026-10-09", "LEGGIMI.txt"]);
    expect(fs.readdirSync(path.join(dir, "2026-10-09")).some((f) => f.endsWith(".tmp"))).toBe(false);
    // Excel italiano: BOM, ";" come separatore, intestazione con l'identificativo e i campi.
    const iliad = fs.readFileSync(path.join(dir, "2026-10-09", "WT8_ILIAD_2026-10-09.csv"), "utf8");
    expect(iliad.startsWith("﻿")).toBe(true);
    const lines = iliad.slice(1).trimEnd().split("\r\n");
    expect(lines[0].startsWith("ID pratica;")).toBe(true);
    expect(lines.length).toBeGreaterThan(1); // pratiche demo di ILIAD
    // Note Operative di tutti i gruppi (esportatore di sistema).
    expect(lines[0].split(";").filter((h) => h.startsWith("Note Operative"))).toHaveLength(4);
    // Secondo giro dello stesso giorno: nulla da rifare.
    expect((await runExportDaily({ client, db }, { owner: "w2", dir, now: () => at("2026-10-09T09:00:00Z") })).status).toBe("ALREADY_DONE");
  });
});
