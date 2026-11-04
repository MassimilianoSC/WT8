// @vitest-environment node
/**
 * Elenco delle pratiche (contratto §5.1). La parte su database usa il replica set usa-e-getta:
 *   MONGO_RS_TEST_URL="mongodb://127.0.0.1:27021/?directConnection=true" yarn vitest run tests/server/practices-list.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { type GroupId, type MembershipDTO, type StatoAttivita, type TemplateId, type UserDTO } from "@/lib/contract";
import { isInScope } from "@/lib/engines/access";
import { bootstrapStore, store } from "@/lib/store/db";
import { buildNewPractice } from "@/lib/store/practice-factory";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";
import { listPractices, parseListQuery, PRACTICE_PAGE_SIZE, visibilityFilter } from "@/services/practices-v2/list";
import { assertDisposableTarget } from "../../scripts/db/guard";

const u = (memberships: MembershipDTO[], extra: Partial<UserDTO> = {}): UserDTO => ({
  id: new ObjectId().toHexString(),
  name: "u",
  email: "u@x",
  status: "active",
  isAdmin: false,
  memberships,
  createdAt: "",
  updatedAt: "",
  ...extra,
});
const m = (templateId: TemplateId, group: GroupId, role: MembershipDTO["role"]): MembershipDTO => ({ templateId, group, role, leader: false });

describe("parametri dell'elenco", () => {
  it("valori ammessi e 400 per quelli sbagliati", () => {
    expect(parseListQuery(new URLSearchParams("templateId=INWIT&stato=KO&archived=true&q= mi &scope=all&sort=created_desc&page=2"))).toEqual({
      templateId: "INWIT",
      stato: "KO",
      archived: true,
      q: "mi",
      scope: "all",
      sort: "created_desc",
      page: 2,
    });
    expect(parseListQuery(new URLSearchParams(""))).toEqual({ templateId: undefined, stato: undefined, archived: undefined, q: undefined, scope: undefined, sort: undefined, page: undefined });
    expect(parseListQuery(new URLSearchParams("from=2026-10-01&to=2026-10-02"))).toMatchObject({ from: "2026-10-01", to: "2026-10-02" });
    for (const bad of ["templateId=X", "stato=APERTA", "archived=si", "scope=mine", "sort=az", "page=0", "page=1.5", "from=01/10/2026", "from=2026-10-03&to=2026-10-02"]) {
      expect(() => parseListQuery(new URLSearchParams(bad)), bad).toThrow(expect.objectContaining({ status: 400 }));
    }
  });

  it("nessuna appartenenza o utente non attivo: nessuna pratica", () => {
    expect(visibilityFilter(u([]), "all")).toBeNull();
    expect(visibilityFilter(u([m("ILIAD", "DL", "DL")], { status: "deactivated" }), "all")).toBeNull();
    expect(visibilityFilter(u([], { isAdmin: true }), "assigned")).toEqual({});
  });
});

const URL_RS = process.env.MONGO_RS_TEST_URL;
describe.skipIf(!URL_RS)("elenco sul replica set usa-e-getta", () => {
  let client: MongoClient;
  let db: Db;
  const DB = `practicehub_test_list_${Date.now()}`;
  const base = new Date("2026-10-01T07:00:00Z");
  const practices: Array<{ id: string; templateId: TemplateId; enabledGroups: GroupId[]; archived: boolean; stato: StatoAttivita; updatedAt: Date; codiceSito: string }> = [];
  const STATI: StatoAttivita[] = ["CREATA", "ASSEGNATO", "TERMINATO", "KO", "PROTOCOLLATO"];

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    client = await new MongoClient(URL_RS!).connect();
    db = client.db(DB);
    await bootstrapStore(db);
    // 3 template × 4 combinazioni di gruppi × 5 stati, con alcune archiviate: 60 pratiche (più di una pagina).
    let k = 0;
    for (const templateId of ["INWIT", "ILIAD", "LEONARDO"] as TemplateId[]) {
      for (const groups of [[], ["AIE"], ["UT_PE", "DL"], ["AIE", "UT_PE", "DL"]] as GroupId[][]) {
        for (const stato of STATI) {
          k++;
          const b = buildNewPractice({
            practiceId: new ObjectId(),
            iterationId: new ObjectId(),
            templateId,
            template: COMPILED_TEMPLATES[templateId].template,
            identity: { codiceG7: String(1000 + k), codiceSito: `SITO-${k}`, nomeSito: k % 7 === 0 ? "Torre Milano" : "Altro sito", committente: { code: "X" }, clienteFinale: { code: "Y" } },
            enabledGroups: groups,
            createdBy: null,
            now: new Date(base.getTime() + k * 60_000),
          });
          const updatedAt = new Date(base.getTime() + ((k * 37) % 60) * 3_600_000);
          const archived = k % 11 === 0;
          b.practice.currentSummary.statoAttivita = stato;
          await store.practices(db).insertOne({ ...b.practice, archived, updatedAt });
          practices.push({ id: b.practice._id.toHexString(), templateId, enabledGroups: b.practice.enabledGroups, archived, stato, updatedAt, codiceSito: `SITO-${k}` });
        }
      }
    }
  });
  afterAll(async () => {
    await client?.db(DB).dropDatabase();
    await client?.close();
  });

  async function allIds(user: UserDTO, scope: "assigned" | "all", archived = false): Promise<string[]> {
    const ids: string[] = [];
    for (let page = 1; ; page++) {
      const r = await listPractices(db, user, { scope, archived, page });
      ids.push(...r.items.map((i) => i.id));
      if (page * r.pageSize >= r.total) {
        expect(ids).toHaveLength(r.total);
        return ids;
      }
    }
  }

  it("il filtro di visibilità coincide con isInScope per ogni utente, scope e archivio", async () => {
    const users = [
      u([], { isAdmin: true }),
      u([m("INWIT", "PM_PERMESSI", "PM")]),
      u([m("INWIT", "PM_PERMESSI", "PERMESSI"), m("ILIAD", "AIE", "AIE")]),
      u([m("ILIAD", "UT_PE", "UT"), m("LEONARDO", "DL", "DL")]),
      u([m("INWIT", "AIE", "AIE"), m("INWIT", "DL", "DL")]),
      u([m("TOWERNET", "AIE", "AIE")]),
      u([m("INWIT", "UT_PE", "PE")], { status: "deactivated" }),
    ];
    for (const [i, user] of users.entries()) {
      for (const scope of ["assigned", "all"] as const) {
        for (const archived of [false, true]) {
          const expected = practices.filter((p) => p.archived === archived && isInScope(user, p, scope)).map((p) => p.id).sort();
          expect((await allIds(user, scope, archived)).sort(), `utente ${i} ${scope} archived=${archived}`).toEqual(expected);
        }
      }
    }
  });

  it("open_first: aperte prima, poi updatedAt decrescente; pagine da 50", async () => {
    const admin = u([], { isAdmin: true });
    const p1 = await listPractices(db, admin, {});
    const p2 = await listPractices(db, admin, { page: 2 });
    const open = practices.filter((p) => !p.archived);
    expect(p1.total).toBe(open.length);
    expect(p1.items).toHaveLength(PRACTICE_PAGE_SIZE);
    const seq = [...p1.items, ...p2.items];
    const closed = seq.map((i) => i.statoAttivita === "TERMINATO" || i.statoAttivita === "KO");
    expect(closed.indexOf(true)).toBeGreaterThan(0);
    expect(closed.slice(closed.indexOf(true)).every(Boolean)).toBe(true);
    for (let i = 1; i < seq.length; i++) {
      if (closed[i] === closed[i - 1]) expect(seq[i - 1].updatedAt >= seq[i].updatedAt).toBe(true);
    }
    const created = (await listPractices(db, admin, { sort: "created_desc" })).items.map((i) => i.createdAt);
    expect([...created].sort().reverse()).toEqual(created);
  });

  it("filtri: gestore, stato, ricerca su codice sito, nome sito e G7 (senza regex dall'utente)", async () => {
    const admin = u([], { isAdmin: true });
    const inwitKo = await listPractices(db, admin, { templateId: "INWIT", stato: "KO" });
    expect(inwitKo.items.every((i) => i.templateId === "INWIT" && i.statoAttivita === "KO")).toBe(true);
    expect(inwitKo.total).toBe(practices.filter((p) => p.templateId === "INWIT" && p.stato === "KO" && !p.archived).length);
    const torre = await listPractices(db, admin, { q: "torre MIL" });
    expect(torre.total).toBeGreaterThan(0);
    expect(torre.items.every((i) => i.nomeSito === "Torre Milano")).toBe(true);
    expect((await listPractices(db, admin, { q: "SITO-12" })).items.map((i) => i.codiceSito).sort()).toEqual(
      practices.filter((p) => p.codiceSito.startsWith("SITO-12") && !p.archived).map((p) => p.codiceSito).sort()
    );
    expect((await listPractices(db, admin, { q: "1007" })).items.map((i) => i.codiceG7)).toEqual(practices[6].archived ? [] : ["1007"]);
    expect((await listPractices(db, admin, { q: ".*" })).total).toBe(0);
    expect((await listPractices(db, u([m("INWIT", "AIE", "AIE")]), { templateId: "ILIAD" })).total).toBe(0);
  });

  it("from/to sulla data di creazione (D-129): giorni di Roma, estremi compresi", async () => {
    const admin = u([], { isAdmin: true });
    const at = async (iso: string) => {
      const b = buildNewPractice({
        practiceId: new ObjectId(),
        iterationId: new ObjectId(),
        templateId: "TOWERNET",
        template: COMPILED_TEMPLATES.TOWERNET.template,
        identity: { codiceG7: "1", codiceSito: iso, nomeSito: "N", committente: { code: "X" }, clienteFinale: { code: "Y" } },
        createdBy: null,
        now: new Date(iso),
      });
      await store.practices(db).insertOne(b.practice);
    };
    await at("2026-09-30T21:59:00Z"); // 30/09 23:59 a Roma
    await at("2026-09-30T22:00:00Z"); // 01/10 00:00
    await at("2026-10-02T21:59:59Z"); // 02/10 23:59
    await at("2026-10-02T22:00:00Z"); // 03/10 00:00
    const sites = async (q: { from?: string; to?: string }) => (await listPractices(db, admin, { templateId: "TOWERNET", ...q })).items.map((i) => i.codiceSito).sort();
    expect(await sites({ from: "2026-10-01", to: "2026-10-02" })).toEqual(["2026-09-30T22:00:00Z", "2026-10-02T21:59:59Z"]);
    expect(await sites({ from: "2026-10-03" })).toEqual(["2026-10-02T22:00:00Z"]);
    expect(await sites({ to: "2026-09-30" })).toEqual(["2026-09-30T21:59:00Z"]);
  });
});
