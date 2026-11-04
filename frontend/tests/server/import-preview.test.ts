// @vitest-environment node
/**
 * Anteprima dell'import (B9, §12) sul replica set usa-e-getta:
 *   MONGO_RS_TEST_URL="mongodb://127.0.0.1:27021/?directConnection=true" yarn vitest run tests/server/import-preview.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, ObjectId, type Db } from "mongodb";
import * as XLSX from "xlsx";
import type { FieldValue, UserDTO } from "@/lib/contract";
import { bootstrapStore, store } from "@/lib/store/db";
import { buildNewPractice } from "@/lib/store/practice-factory";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";
import { PREVIEW_TTL_MS, previewImport } from "@/services/import-v2/preview";
import { assertDisposableTarget } from "../../scripts/db/guard";

const URL_RS = process.env.MONGO_RS_TEST_URL;

const admin: UserDTO = {
  id: new ObjectId().toHexString(),
  name: "Admin",
  email: "admin@x",
  status: "active",
  isAdmin: true,
  memberships: [],
  createdAt: "",
  updatedAt: "",
};

function xlsx(aoa: unknown[][]): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Dati");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

describe.skipIf(!URL_RS)("anteprima dell'import sul replica set usa-e-getta", () => {
  let client: MongoClient;
  let db: Db;
  const DB = `practicehub_test_import_${Date.now()}`;
  const now = new Date("2026-10-08T08:00:00Z");
  const ids = { torre: "", archiviata: "", paola: new ObjectId() };

  async function insertPractice(g7: string, codiceSito: string, nomeSito: string, extra: Record<string, FieldValue>, archived = false) {
    const b = buildNewPractice({
      practiceId: new ObjectId(),
      iterationId: new ObjectId(),
      templateId: "INWIT",
      template: COMPILED_TEMPLATES.INWIT.template,
      identity: { codiceG7: g7, codiceSito, nomeSito, committente: { code: "TODOS" }, clienteFinale: { code: "INWIT" } },
      createdBy: null,
      now,
    });
    Object.assign(b.iteration.values, extra);
    await store.practices(db).insertOne({ ...b.practice, archived });
    await store.iterations(db).insertOne(b.iteration);
    return b.practice._id.toHexString();
  }

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    client = await new MongoClient(URL_RS!).connect();
    db = client.db(DB);
    await bootstrapStore(db);
    ids.torre = await insertPractice("4400", "TO001", "Torre", { F009: "Via Po 1" });
    ids.archiviata = await insertPractice("4600", "AR001", "Archiviata", {}, true);
    await store.users(db).insertOne({
      _id: ids.paola,
      email: "paola@x",
      name: "Paola Permessi",
      passwordHash: null,
      status: "active",
      isAdmin: false,
      memberships: [{ templateId: "INWIT", group: "PM_PERMESSI", role: "PERMESSI", leader: false }],
      authVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
  });
  afterAll(async () => {
    await client?.db(DB).dropDatabase();
    await client?.close();
  });

  const HEADERS = ["F001", "F002", "F003", "F004", "F005", "Indirizzo", "Tipologia sito", "Tecnico PP", "F006", "F007", "F008", "Boh"];

  it("nuova, aggiornamento, archiviata, rilavorazione; anteprima salvata per 24 ore", async () => {
    const bytes = xlsx([
      HEADERS,
      [4501, "MI001", "Sito Uno", "Todos", "Inwit", "Via A", "Raw Land", "paola permessi", "Lombardia", "MI", "Milano", "?"],
      [4400, "TO001", "Torre", "", "", "Via Po 2", "Roof Top", "Chi?", "", "", "", ""],
      [4600, "AR001", "Archiviata", "", "", "", "", "", "", "", "", ""],
      [4700, "AR001", "Archiviata", "", "", "", "", "", "", "", "", ""],
    ]);
    const r = await previewImport({ db, clock: () => now }, admin, { templateId: "INWIT", bytes, fileName: "prova.xlsx" });

    expect(r.templateId).toBe("INWIT");
    expect(r.columns.map((c) => c.flowId)).toEqual(["F001", "F002", "F003", "F004", "F005", "F009", "F010", "F036", "F006", "F007", "F008", null]);
    expect(r.columns[11].note).toBe("intestazione non riconosciuta");
    expect(r.rows.map((x) => [x.rowIndex, x.outcome, x.practiceId])).toEqual([
      [1, "NEW_PRACTICE", undefined],
      [2, "UPDATE", ids.torre],
      [3, "ERROR", undefined],
      [4, "REWORK", ids.archiviata],
    ]);
    expect(Object.fromEntries(r.rows[0].changes.map((c) => [c.flowId, c.value]))).toEqual({
      F001: 4501,
      F002: "MI001",
      F003: "Sito Uno",
      F004: { code: "TODOS" },
      F005: { code: "INWIT" },
      F009: "Via A",
      F010: { code: "RAW_LAND" },
      F036: { code: ids.paola.toHexString() },
      F006: { code: "03" },
      F007: { code: "215" },
      F008: { code: "015146" },
    });
    expect(r.rows[1].changes).toEqual([{ flowId: "F010", label: "Tipologia sito", value: { code: "ROOF_TOP" } }]);
    expect(r.rows[1].skipped).toEqual([
      { flowId: "F009", label: "Indirizzo", reason: "ALREADY_FILLED", detail: "il campo ha già un valore: l'import non sovrascrive" },
      { flowId: "F036", label: "Tecnico PP", reason: "INVALID", detail: "valore non riconosciuto: Chi?" },
    ]);
    expect(r.rows[2].errors[0]).toMatch(/archiviata/);

    const saved = await store.importPreviews(db).findOne({ _id: new ObjectId(r.importId) });
    expect(saved).toMatchObject({ templateId: "INWIT", fileName: "prova.xlsx", actorId: new ObjectId(admin.id) });
    expect(saved!.expiresAt.getTime() - now.getTime()).toBe(PREVIEW_TTL_MS);
    expect(saved!.rows[1].skipped[1].detail).toMatch(/Chi\?/);
    expect(saved!.rows[3].practiceId).toEqual(new ObjectId(ids.archiviata));
    const ttl = (await store.importPreviews(db).indexes()).find((i) => i.key.expiresAt === 1);
    expect(ttl?.expireAfterSeconds).toBe(0);
    // Nessuna scrittura sulle pratiche.
    expect(await store.practices(db).countDocuments()).toBe(2);
  });

  it("solo ADMIN; gestore, colonne chiave e righe obbligatori", async () => {
    const bytes = xlsx([HEADERS, [4501, "MI001", "Sito Uno"]]);
    await expect(previewImport({ db }, { ...admin, isAdmin: false }, { templateId: "INWIT", bytes })).rejects.toMatchObject({ status: 403 });
    await expect(previewImport({ db }, admin, { templateId: "BOH", bytes })).rejects.toMatchObject({ status: 422 });
    await expect(previewImport({ db }, admin, { templateId: "INWIT", bytes: xlsx([["F001", "Nome Sito"], [1, "x"]]) })).rejects.toThrow(/F002 Codice Sito/);
    await expect(previewImport({ db }, admin, { templateId: "INWIT", bytes: xlsx([HEADERS]) })).rejects.toMatchObject({ status: 422 });
  });
});
