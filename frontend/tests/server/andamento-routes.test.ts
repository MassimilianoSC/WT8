// @vitest-environment node
/**
 * Rotte dei blocchi di Andamento (contratto §15.3) sul database: interruttore, permessi, filtri, blocco sconosciuto, e
 * un passaggio di stato vero (creazione + Data assegnazione) che entra nei blocchi dopo la cache.
 *   MONGO_RS_TEST_URL="mongodb://127.0.0.1:27021/?directConnection=true" yarn vitest run tests/server/andamento-routes.test.ts
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoClient, type Db } from "mongodb";
import type { AndamentoFermeDTO, AndamentoFlussiDTO, AndamentoRilavorazioniDTO, AndamentoStatiDTO, UserDTO } from "@/lib/contract";
import { store } from "@/lib/store/db";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";
import { resetAndamentoCache } from "@/services/andamento/dataset";
import { createPractice } from "@/services/practices-v2/commands";
import { patchFields } from "@/services/practices-v2/fields";
import { toUserDTO } from "@/services/users-v2";
import { assertDisposableTarget } from "../../scripts/db/guard";
import { E_NOW, eIds, seedS0 } from "../fixtures/assistant-e";

const state: { user: UserDTO | null; deps: { client: MongoClient; db: Db } | null } = { user: null, deps: null };
vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth-v2", async () => {
  const { HttpError } = await import("@/lib/http-error");
  return {
    requireCurrentUser: async () => {
      if (!state.user) throw new HttpError("Unauthenticated", 401);
      return state.user;
    },
  };
});
vi.mock("@/lib/store/db", async (orig) => ({ ...(await orig<object>()), getStoreDb: async () => state.deps!.db }));

const URL_RS = process.env.MONGO_RS_TEST_URL;
describe.skipIf(!URL_RS)("rotte dei blocchi di Andamento", () => {
  let client: MongoClient;
  let db: Db;
  const DB = `practicehub_test_andamento_rotte_${Date.now()}`;
  const as = async (k: string) => (state.user = toUserDTO((await store.users(db).findOne({ _id: eIds.user(k) }))!));
  const get = async <T,>(blocco: string, qs = "") => {
    const route = await import("@/app/api/andamento/[blocco]/route");
    const res = await route.GET(new Request(`http://test/api/andamento/${blocco}${qs ? `?${qs}` : ""}`), { params: { blocco } });
    return { status: res.status, body: (await res.json()) as T };
  };
  const PERIOD = "from=2026-10-01&to=2026-10-31&granularity=week";

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    client = await new MongoClient(URL_RS!).connect();
    db = client.db(DB);
    state.deps = { client, db };
    await seedS0(db);
  }, 240_000);
  afterEach(() => {
    delete process.env.PH_ANDAMENTO;
    resetAndamentoCache();
  });
  afterAll(async () => {
    delete process.env.PH_ANDAMENTO;
    await client?.db(DB).dropDatabase();
    await client?.close();
  });

  it("spento 404; acceso: ADMIN 200, UT 403, blocco sconosciuto 404, filtri non validi 400; nessuna persona nelle risposte", async () => {
    await as("admin");
    expect((await get("stati")).status).toBe(404);
    process.env.PH_ANDAMENTO = "true";
    for (const b of ["stati", "gruppi", "flussi", "rilavorazioni", "scadenze", "ferme"]) {
      const r = await get(b, b === "ferme" ? "" : PERIOD);
      expect(r.status, b).toBe(200);
      expect(JSON.stringify(r.body), b).not.toMatch(/userId|actorName|"name"|email/);
    }
    expect((await get("sconosciuto")).status).toBe(404);
    // CSV dalla stessa rotta: text/csv con il nome del file; tabella e format non validi → 400.
    const route = await import("@/app/api/andamento/[blocco]/route");
    const csv = await route.GET(new Request(`http://test/api/andamento/rilavorazioni?${PERIOD}&format=csv&tabella=daStato`), { params: { blocco: "rilavorazioni" } });
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(csv.headers.get("content-disposition")).toBe('attachment; filename="andamento-rilavorazioni-daStato_tutti_2026-10-01_2026-10-31.csv"');
    expect((await csv.text()).replace(/^\uFEFF/, "").split("\r\n")[0]).toBe("Stato attività;Rilavorazioni;Ripresentazioni");
    for (const b of ["stati", "gruppi", "flussi", "scadenze", "ferme"]) {
      const r = await route.GET(new Request(`http://test/api/andamento/${b}?format=csv`), { params: { blocco: b } });
      expect(r.status, b).toBe(200);
    }
    expect((await get("stati", "format=csv&tabella=ritorni")).status).toBe(400);
    expect((await get("stati", "format=xml")).status).toBe(400);
    expect((await get("stati", "granularity=day")).status).toBe(400);
    expect((await get("ferme", "stato=NIENTE")).status).toBe(400);
    await as("ut");
    expect((await get("stati")).status).toBe(403);
  });

  it("un passaggio di stato vero entra nei blocchi (dopo la cache): passaggio in ASSEGNATO, entrata, data del fatto", async () => {
    process.env.PH_ANDAMENTO = "true";
    await as("admin");
    const before = (await get<AndamentoStatiDTO>("stati", PERIOD)).body;
    const flussiBefore = (await get<AndamentoFlussiDTO>("flussi", PERIOD)).body;
    const pm = toUserDTO((await store.users(db).findOne({ _id: eIds.user("pm") }))!);
    const deps = { client, db, clock: () => E_NOW };
    const d = await createPractice(deps, pm, { templateId: "INWIT", committente: { code: "TODOS" }, clienteFinale: { code: "INWIT" }, codiceG7: "9", codiceSito: "AND-1", nomeSito: "Prova Andamento" });
    await patchFields(deps, pm, d.id, { iteration: d.iteration, revision: d.revision, changes: [{ flowId: "F023", occurrenceKey: COMPILED_TEMPLATES.INWIT.template.occurrences.find((o) => o.kind === "MASTER" && o.flowId === "F023")!.occurrenceKey, value: "2026-10-07" }] });
    // Stessa richiesta entro 5 minuti: stessa fotografia.
    expect((await get<AndamentoStatiDTO>("stati", PERIOD)).body.righe).toEqual(before.righe);
    resetAndamentoCache();
    const after = (await get<AndamentoStatiDTO>("stati", PERIOD)).body;
    const pass = (s: AndamentoStatiDTO, x: string) => s.righe.find((r) => r.stato === x)!;
    expect(pass(after, "ASSEGNATO").passaggi).toBe(pass(before, "ASSEGNATO").passaggi + 1);
    expect(pass(after, "CREATA").periodo.conclusi).toBe(pass(before, "CREATA").periodo.conclusi + 1);
    const ev = await store.events(db).findOne({ kind: "STATO", "structuredDetail.to": "ASSEGNATO", practiceId: { $exists: true } }, { sort: { timestamp: -1 } });
    expect(ev!.structuredDetail).toMatchObject({ autoEventDate: "2026-10-07" });
    const flussiAfter = (await get<AndamentoFlussiDTO>("flussi", PERIOD)).body;
    expect(flussiAfter.periodo.entrate).toBe(flussiBefore.periodo.entrate + 1);
    expect(flussiAfter.attiveOra).toBe(flussiBefore.attiveOra + 1);
    expect((await get<AndamentoRilavorazioniDTO>("rilavorazioni", PERIOD)).status).toBe(200);
  });

  it("ferme: soglia dalle impostazioni, canOpen secondo la scheda visibile all'utente (Direzione pura: mai)", async () => {
    process.env.PH_ANDAMENTO = "true";
    await as("admin");
    const admin = (await get<AndamentoFermeDTO>("ferme")).body;
    expect(admin.soglia).toBe(30);
    expect(admin.items.every((i) => i.canOpen)).toBe(true);
    await store.users(db).updateOne({ _id: eIds.user("multi") }, { $set: { direzione: true } });
    await as("multi");
    const multi = (await get<AndamentoFermeDTO>("ferme")).body;
    expect(multi.totale).toBe(admin.totale);
    for (const i of multi.items) expect(i.canOpen, i.templateId).toBe(["ILIAD", "INWIT", "TOWERNET"].includes(i.templateId));
  });
});
