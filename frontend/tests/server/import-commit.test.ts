// @vitest-environment node
/**
 * Conferma dell'import (B9, §12, D-49, D-135, D-138) sul replica set usa-e-getta:
 *   MONGO_RS_TEST_URL="mongodb://127.0.0.1:27021/?directConnection=true" yarn vitest run tests/server/import-commit.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, ObjectId, type Db } from "mongodb";
import * as XLSX from "xlsx";
import type { PraticaDetailDTO, UserDTO } from "@/lib/contract";
import { bootstrapStore, store } from "@/lib/store/db";
import type { StoreUserDoc } from "@/lib/store/types";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";
import { commitImport } from "@/services/import-v2/commit";
import { previewImport } from "@/services/import-v2/preview";
import { archivePractice, changeStato, createPractice } from "@/services/practices-v2/commands";
import { patchFields } from "@/services/practices-v2/fields";
import { getPracticeDetail } from "@/services/practices-v2/read";
import { toUserDTO } from "@/services/users-v2";
import { assertDisposableTarget } from "../../scripts/db/guard";

const URL_RS = process.env.MONGO_RS_TEST_URL;
const T = COMPILED_TEMPLATES.INWIT.template;
const occKey = (flowId: string) => T.occurrences.find((o) => o.kind === "MASTER" && o.flowId === flowId && !o.repeatGroup)!.occurrenceKey;
const uuid = () => crypto.randomUUID();

function xlsx(aoa: unknown[][]): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Dati");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

describe.skipIf(!URL_RS)("conferma dell'import sul replica set usa-e-getta", () => {
  let client: MongoClient;
  let db: Db;
  const DB = `practicehub_test_import_commit_${Date.now()}`;
  const now = new Date("2026-10-08T08:00:00Z");
  let admin: UserDTO, admin2: UserDTO, pm: UserDTO;
  const deps = () => ({ client, db, clock: () => now });

  const user = async (name: string, isAdmin: boolean) => {
    const doc: StoreUserDoc = {
      _id: new ObjectId(),
      email: `${name}@test.local`,
      name,
      passwordHash: null,
      status: "active",
      isAdmin,
      memberships: isAdmin ? [] : [{ templateId: "INWIT", group: "PM_PERMESSI", role: "PM", leader: true }],
      authVersion: 1,
      createdAt: now,
      updatedAt: now,
    };
    await store.users(db).insertOne(doc);
    return toUserDTO(doc);
  };
  const create = (g7: string, codiceSito: string, nomeSito: string) =>
    createPractice(deps(), pm, { templateId: "INWIT", committente: { code: "TODOS" }, clienteFinale: { code: "INWIT" }, codiceG7: g7, codiceSito, nomeSito });
  const setField = (d: PraticaDetailDTO, flowId: string, value: unknown) =>
    patchFields(deps(), admin, d.id, { iteration: d.iteration, revision: d.revision, changes: [{ flowId, occurrenceKey: occKey(flowId), value }] } as never);
  const preview = (rows: unknown[][], who = admin) =>
    previewImport({ db, clock: () => now }, who, { templateId: "INWIT", bytes: xlsx([["F001", "F002", "F003", "F004", "F005", "Indirizzo", "Tipologia sito"], ...rows]), fileName: "prova.xlsx" });
  const bySite = (codiceSito: string) => store.practices(db).find({ "currentSummary.codiceSito": codiceSito }).sort({ createdAt: 1, _id: 1 }).toArray();

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    client = await new MongoClient(URL_RS!).connect();
    db = client.db(DB);
    await bootstrapStore(db);
    admin = await user("admin", true);
    admin2 = await user("admin2", true);
    pm = await user("pm", false);
  });
  afterAll(async () => {
    await client?.db(DB).dropDatabase();
    await client?.close();
  });

  it("nuova, rilavorazione dalla riga prima, aggiornamento dei soli vuoti, archiviata in errore, ambigua con scelta; replay", async () => {
    const torre = await setField(await create("4400", "TO001", "Torre"), "F009", "Via Po 1").then((r) => r.practice);
    const arch = await create("4600", "AR001", "Archiviata");
    await archivePractice(deps(), pm, arch.id, { revision: (await changeStato(deps(), pm, arch.id, { revision: arch.revision, stato: "TERMINATO" })).revision });
    const dup1 = await create("4800", "MI777", "Doppia");
    const dup2 = await create("4800", "MI777", "Doppia");

    const p = await preview([
      [4501, " MI001 ", "Sito  Uno", "Todos", "Inwit", "Via A", "Raw Land"],
      [4502, "MI001", "Sito Uno", "", "", "Via B", ""],
      [4400, "TO001", "Torre", "", "", "Via Po 2", "Roof Top"],
      [4600, "AR001", "Archiviata", "", "", "", ""],
      [4800, "MI777", "Doppia", "", "", "Via Z", ""],
    ]);
    expect(p.rows.map((r) => r.outcome)).toEqual(["NEW_PRACTICE", "REWORK", "UPDATE", "ERROR", "AMBIGUOUS"]);

    // Ambigua senza scelta → 422; scelta non tra le candidate → 422.
    await expect(commitImport(deps(), admin, p.importId, { operationId: uuid() })).rejects.toMatchObject({ status: 422, extra: { rows: [5] } });
    await expect(commitImport(deps(), admin, p.importId, { operationId: uuid(), choices: [{ rowIndex: 5, action: "APPLY", practiceId: torre.id }] })).rejects.toMatchObject({ status: 422 });
    await expect(commitImport(deps(), admin, p.importId, { operationId: uuid(), choices: [{ rowIndex: 3, action: "APPLY", practiceId: torre.id }] })).rejects.toMatchObject({ status: 422 });

    const op = uuid();
    const req = { operationId: op, choices: [{ rowIndex: 5, action: "APPLY" as const, practiceId: dup2.id }] };
    const r = await commitImport(deps(), admin, p.importId, req);
    expect(r).toEqual({ created: 1, updated: 2, reworks: 1, skipped: 0, failed: [{ rowIndex: 4, error: expect.stringMatching(/archiviata/) }] });

    // Nuova: chiave normalizzata (D-138), valori, storico e timeline con origine IMPORT.
    const [nuova, rilav] = await bySite("MI001");
    expect(nuova.currentSummary).toMatchObject({ codiceSito: "MI001", nomeSito: "Sito Uno", codiceG7: "4501" });
    const dn = await getPracticeDetail(db, admin, nuova._id.toHexString());
    expect(dn.values).toMatchObject({ F009: "Via A", F010: { code: "RAW_LAND" }, F004: { code: "TODOS" } });
    const hist = await store.valueHistory(db).find({ practiceId: nuova._id, kind: "FIELD", source: "IMPORT" }).toArray();
    expect(hist.map((h) => h.target.flowId).sort()).toEqual(["F001", "F002", "F003", "F004", "F005", "F009", "F010"]);
    const events = await store.events(db).find({ practiceId: nuova._id }).sort({ eventIndex: 1 }).toArray();
    expect(events.map((e) => [e.kind, e.source])).toEqual([
      ["CREATE", "IMPORT"],
      ["IMPORT", "IMPORT"],
    ]);
    expect(events[1].detail).toMatch(/prova\.xlsx.*riga 1: 2 campi compilati/);

    // Rilavorazione dalla pratica creata dalla riga 1: Core ereditato, l'indirizzo diverso NON sovrascrive.
    expect(rilav.originPracticeId).toEqual(nuova._id);
    const dr = await getPracticeDetail(db, admin, rilav._id.toHexString());
    expect(dr).toMatchObject({ codiceG7: "4502", values: { F009: "Via A" } });

    // Aggiornamento: solo il campo vuoto.
    const dt = await getPracticeDetail(db, admin, torre.id);
    expect(dt.values).toMatchObject({ F009: "Via Po 1", F010: { code: "ROOF_TOP" } });
    // Ambigua: la pratica scelta, non l'altra.
    expect((await getPracticeDetail(db, admin, dup2.id)).values.F009).toBe("Via Z");
    expect((await getPracticeDetail(db, admin, dup1.id)).values.F009 ?? null).toBeNull();

    // Replay: stessa operationId → stesso esito, nessun effetto ripetuto.
    expect(await commitImport(deps(), admin, p.importId, req)).toEqual(r);
    // Stessa operationId con scelte diverse (R5 da APPLY a SKIP): 409, nessun riepilogo inventato (§1).
    await expect(commitImport(deps(), admin, p.importId, { operationId: op, choices: [{ rowIndex: 5, action: "SKIP" }] })).rejects.toMatchObject({
      status: 409,
      extra: { code: "OPERATION_REUSED" },
    });
    expect(await bySite("MI001")).toHaveLength(2);
    expect(await store.events(db).countDocuments({ kind: "IMPORT" })).toBe(4);
  });

  it("tra anteprima e conferma: pratica creata da altri → la riga fallisce (rifai l'anteprima); campo compilato → non si sovrascrive", async () => {
    const target = await create("5100", "TO500", "Campo");
    const p = await preview([
      [5000, "MI900", "Nuovo", "Todos", "Inwit", "Via N", ""],
      [5100, "TO500", "Campo", "", "", "Via Import", ""],
      [5101, "TO501", "Altro", "Todos", "Inwit", "", ""],
    ]);
    expect(p.rows.map((r) => r.outcome)).toEqual(["NEW_PRACTICE", "UPDATE", "NEW_PRACTICE"]);
    await create("5000", "MI900", "Nuovo");
    await setField(target, "F009", "Via Manuale");
    const r = await commitImport(deps(), admin, p.importId, { operationId: uuid() });
    expect(r).toEqual({ created: 1, updated: 0, reworks: 0, skipped: 1, failed: [{ rowIndex: 1, error: expect.stringMatching(/rifai l'anteprima/) }] });
    expect(await bySite("MI900")).toHaveLength(1);
    expect((await getPracticeDetail(db, admin, target.id)).values.F009).toBe("Via Manuale");
    expect(await bySite("TO501")).toHaveLength(1); // la riga dopo quella fallita è comunque importata
  });

  it("solo l'ADMIN dell'anteprima, entro 24 ore; SKIP esplicito", async () => {
    const p = await preview([[5200, "MI950", "Salta", "Todos", "Inwit", "", ""]]);
    await expect(commitImport(deps(), pm, p.importId, { operationId: uuid() })).rejects.toMatchObject({ status: 403 });
    await expect(commitImport(deps(), admin2, p.importId, { operationId: uuid() })).rejects.toMatchObject({ status: 404 });
    const late = { client, db, clock: () => new Date(now.getTime() + 24 * 3_600_000 + 1) };
    await expect(commitImport(late, admin, p.importId, { operationId: uuid() })).rejects.toMatchObject({ status: 404 });
    await expect(commitImport(deps(), admin, "nonvalido", { operationId: uuid() })).rejects.toMatchObject({ status: 404 });
    expect(await commitImport(deps(), admin, p.importId, { operationId: uuid(), choices: [{ rowIndex: 1, action: "SKIP" }] })).toMatchObject({ skipped: 1, created: 0 });
    expect(await bySite("MI950")).toHaveLength(0);
  });
});
