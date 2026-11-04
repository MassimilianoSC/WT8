// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, ObjectId, type Db } from "mongodb";
import type { ListItemDTO, MembershipDTO, TemplateId, UserDTO } from "@/lib/contract";
import { resolveTemplate } from "@/lib/engines/resolve-template";
import { parseIstatCsv } from "@/lib/istat/parse";
import { comuni, province, regioni } from "@/lib/istat/service";
import { deriveItems } from "@/lib/lists/catalog";
import { ALERT_RULES, INITIAL_LISTS, bootstrapStore, store } from "@/lib/store/db";
import { buildNewPractice } from "@/lib/store/practice-factory";
import type { ListDoc } from "@/lib/store/types";
import { COMPILED_TEMPLATES } from "@/lib/templates/compiled";
import { getAlertRules, updateAlertRule } from "@/services/alert-rules";
import { __test, getLists, updateList } from "@/services/lists";
import { assertDisposableTarget } from "../../scripts/db/guard";

const list = (templateId: TemplateId | null, listId: string) => INITIAL_LISTS.find((l) => l.templateId === templateId && l.listId === listId)!;

describe("catalogo delle liste iniziali", () => {
  it("ogni lista usata da un template esiste per quel template (o è comune)", () => {
    for (const [t, c] of Object.entries(COMPILED_TEMPLATES)) {
      for (const o of c.template.occurrences) {
        if (o.kind !== "MASTER" || !o.list || (o.list.kind !== "CONTROLLED" && o.list.kind !== "CONFIGURABLE")) continue;
        const found = INITIAL_LISTS.find((l) => (l.templateId === t || l.templateId === null) && l.listId === o.list!.listId);
        expect(found, `${t} ${o.list.listId}`).toBeDefined();
      }
    }
  });

  it("comuni: COMMITTENTE e CLIENTE_FINALE sono l'unione con Altro in fondo; SI_NO; vincoli", () => {
    const committ = list(null, "COMMITTENTE").items.map((i) => i.code);
    expect(committ).toEqual(expect.arrayContaining(["CELLNEX", "TODOS", "TOWERNET", "FIBERCOP", "FASTWEB", "LEONARDO"]));
    expect(committ[committ.length - 1]).toBe("ALTRO");
    expect(list(null, "CLIENTE_FINALE").items.map((i) => i.code)).toEqual(expect.arrayContaining(["ILIAD", "WIND_3", "ZEFIRO", "VODAFONE", "TIM"]));
    expect(list(null, "SI_NO").items.map((i) => i.code)).toEqual(["SI", "NO"]);
    expect(list(null, "STATO_VINCOLO_PAN").items.map((i) => i.code)).toEqual(["PRESENTE", "ASSENTE", "NON_PERTINENTE"]);
    expect(list(null, "STATO_VINCOLO_NATURALISTICI").kind).toBe("CONFIGURABLE");
    expect(list(null, "ENTE_VINCOLO_AEROPORTUALE").items.map((i) => i.code)).toEqual(["ENAC", "ENAV"]);
    expect(list("INWIT", "ENTE_VINCOLO_PARCO")).toMatchObject({ kind: "CONFIGURABLE", group: "PM_PERMESSI", items: [] });
  });

  it("per gestore: COMMITTENTE ridotto al gestore, EM %, MANCANTI vuote, derivata TIPOLOGIA_ATTIVITA_PE", () => {
    expect(list("TOWERNET", "COMMITTENTE").items.map((i) => i.code)).toEqual(["TOWERNET", "ALTRO"]);
    expect(list("ILIAD", "EM").items.map((i) => i.code)).toEqual(["100_PCT", "80_PCT", "50_PCT"]);
    expect(list("INWIT", "FORNITORE_UT")).toMatchObject({ kind: "CONFIGURABLE", group: "UT_PE", items: [] });
    const tipo = list("INWIT", "TIPOLOGIA_ATTIVITA_PE");
    const union = [...list("INWIT", "PROGETTO").items, ...list("INWIT", "INCARICO").items].map((i) => i.code);
    expect(tipo.kind).toBe("CONTROLLED");
    expect(tipo.items.map((i) => i.code)).toEqual([...new Set(union)]);
  });

  it("nessuna voce ALTRO nelle liste configurabili (D-100: si attiva sul campo)", () => {
    for (const l of INITIAL_LISTS.filter((x) => x.kind === "CONFIGURABLE")) expect(l.items.map((i) => i.code), `${l.templateId} ${l.listId}`).not.toContain("ALTRO");
  });

  it("derivata: i codici spariti dalle sorgenti restano disattivati", () => {
    const prev: ListItemDTO[] = [{ code: "A", label: "A", active: true, order: 1 }, { code: "B", label: "B", active: true, order: 2 }];
    expect(deriveItems([{ code: "A", label: "A2", active: true, order: 1 }], prev)).toEqual([
      { code: "A", label: "A2", active: true, order: 1 },
      { code: "B", label: "B", active: false, order: 2 },
    ]);
  });

  it("validazione: controllate solo etichette; configurabili con codici validi e senza ALTRO", () => {
    const controlled = { ...list("INWIT", "TIPOLOGIA_SITO"), _id: new ObjectId(), revision: 1, updatedAt: new Date() } as ListDoc;
    expect(() => __test.validateItems(controlled, controlled.items.map((i) => ({ ...i, label: i.label + "!" })))).not.toThrow();
    expect(() => __test.validateItems(controlled, controlled.items.slice(1))).toThrow(/solo le etichette/);
    const conf = { ...list("INWIT", "FORNITORE_UT"), _id: new ObjectId(), revision: 1, updatedAt: new Date() } as ListDoc;
    expect(() => __test.validateItems(conf, [{ code: "ditta rossi", label: "x", active: true, order: 1 }])).toThrow(/Codice non valido/);
    expect(() => __test.validateItems(conf, [{ code: "ALTRO", label: "Altro", active: true, order: 1 }])).toThrow(/Altro/);
    expect(() => __test.validateItems(conf, [{ code: "X", label: "x", active: true, order: 1 }, { code: "X", label: "y", active: true, order: 2 }])).toThrow(/ripetuti/);
  });
});

describe("resolve-template (D-16)", () => {
  const r = (committente: string, clienteFinale: string) => resolveTemplate({ committente: { code: committente }, clienteFinale: { code: clienteFinale } });
  it("regole esplicite", () => {
    for (const [cf, t] of [["ILIAD", "ILIAD"], ["WIND_3", "ILIAD"], ["ZEFIRO", "ILIAD"], ["INWIT", "INWIT"], ["TOWERNET", "TOWERNET"], ["TIM", "TIM_FIBERCOP"], ["FIBERCOP", "TIM_FIBERCOP"], ["VODAFONE", "FASTWEB_VODAFONE"], ["LEONARDO", "LEONARDO"]]) {
      expect(r("X", cf), cf).toEqual({ templateId: t, candidates: [t] });
    }
  });
  it("FASTWEB dipende dal Committente; Altro e codici ignoti → scelta manuale", () => {
    expect(r("FASTWEB", "FASTWEB").templateId).toBe("FASTWEB_VODAFONE");
    expect(r("CELLNEX", "FASTWEB").templateId).toBe("ILIAD");
    expect(r("ALTRO", "ALTRO")).toEqual({ templateId: null, candidates: ["ILIAD", "TOWERNET", "TIM_FIBERCOP", "INWIT", "FASTWEB_VODAFONE", "LEONARDO"] });
    expect(r("X", "SCONOSCIUTO").templateId).toBeNull();
  });
});

describe("ISTAT (D-71)", () => {
  const ds = parseIstatCsv(new Uint8Array(fs.readFileSync(path.join(__dirname, "fixtures/istat-sample.csv"))), "2026-10-08", "prova");
  it("legge il CSV ufficiale in Windows-1252 riconoscendo le colonne", () => {
    expect(ds.regioni.map((r) => r.code)).toEqual(["03", "01", "02"]); // ordine alfabetico: Lombardia, Piemonte, Valle d'Aosta
    expect(ds.regioni.find((r) => r.code === "02")!.label).toBe("Valle d'Aosta/Vallée d'Aoste");
    expect(ds.province.find((p) => p.code === "201")).toMatchObject({ label: "Torino", regione: "01", sigla: "TO" });
    expect(ds.comuni.find((c) => c.code === "001001")!.label).toBe("Agliè");
  });
  it("cascata e 503 finché il dataset non è caricato", () => {
    expect(province("01", ds).map((p) => p.label)).toEqual(["Torino"]);
    expect(comuni("201", ds).map((c) => c.label)).toEqual(["Agliè", "Torino"]);
    expect(() => regioni({ loaded: false })).toThrow(/non caricato/);
    expect(() => province(null, ds)).toThrow(/regione/);
  });
  it("dataset ufficiale committato (estrazione 08/10/2026): niente più 503, cascata reale", () => {
    const r = regioni();
    expect(r).toHaveLength(20);
    expect(r.find((x) => x.code === "01")!.label).toBe("Piemonte");
    const p = province("01");
    const torino = p.find((x) => x.label === "Torino")!.code;
    expect(comuni(torino).map((x) => x.label)).toEqual(expect.arrayContaining(["Agliè", "Torino"]));
    const tutte = r.flatMap((x) => province(x.code));
    expect(tutte).toHaveLength(107);
    expect(tutte.reduce((n, x) => n + comuni(x.code).length, 0)).toBe(7896);
  });

  it("intestazione con nomi di colonna su più righe tra virgolette (come il file ufficiale)", () => {
    const header = [
      '"Codice Regione"',
      `"Codice dell'Unità territoriale sovracomunale \n(valida a fini statistici)"`,
      '"Codice Comune formato alfanumerico"',
      '"Denominazione in italiano"',
      '"Denominazione Regione"',
      `"Denominazione dell'Unità territoriale sovracomunale \n(valida a fini statistici)"`,
    ].join(";");
    const csv = `﻿${header}\r\n01;201;001001;"Agliè";Piemonte;Torino\r\n`;
    expect(parseIstatCsv(new TextEncoder().encode(csv), "x", "y")).toMatchObject({
      regioni: [{ code: "01", label: "Piemonte" }],
      province: [{ code: "201", label: "Torino" }],
      comuni: [{ code: "001001", label: "Agliè" }],
    });
  });

  it("intestazione sconosciuta → errore esplicito", () => {
    expect(() => parseIstatCsv(new TextEncoder().encode("a;b\n1;2\n"), "x", "y")).toThrow(/Colonne ISTAT non trovate/);
  });
});

describe("catalogo delle soglie (G §17.10)", () => {
  it("default e campo d'applicazione", () => {
    const r = Object.fromEntries(ALERT_RULES.map((x) => [x.ruleId, x]));
    expect(r.SOPRALLUOGO).toMatchObject({ days: 7, unit: "WORKING_DAYS" });
    expect(r.FORECAST_PE.days).toBe(4);
    expect(r.FINE_LAVORI_DL.days).toBe(20);
    expect(r.CDMS_EM).toMatchObject({ days: 7, unit: "CALENDAR_DAYS", templates: ["ILIAD"] });
    expect(r.OFFERTA_ODA.templates).toEqual(["ILIAD", "TOWERNET", "TIM_FIBERCOP", "INWIT"]);
    expect(r.FATTURABILE_KO).toBeUndefined();
  });

  it("alert ODA FASTWEB-VODAFONE (D-116): 1 giorno lavorativo, solo FV, campi e codici esistenti", () => {
    const t = COMPILED_TEMPLATES.FASTWEB_VODAFONE.template;
    const master = (f: string) => t.occurrences.find((o) => o.kind === "MASTER" && o.flowId === f)!;
    const stato = INITIAL_LISTS.find((l) => l.templateId === "FASTWEB_VODAFONE" && l.listId === "STATO_ODA")!.items.map((i) => i.code);
    for (const id of ["ODA_FV_ASSEGNAZIONE", "ODA_FV_PACCHETTO"]) {
      const r = ALERT_RULES.find((x) => x.ruleId === id) as (typeof ALERT_RULES)[number] & { spec: { from: string; subject: string; openWhen: string[]; closeWhen?: string[]; closeWhenNot?: string[] } };
      expect(r).toMatchObject({ days: 1, unit: "WORKING_DAYS", templates: ["FASTWEB_VODAFONE"] });
      expect(master(r.spec.from).dataType).toBe("DATE");
      expect(master(r.spec.subject).list!.listId).toBe("STATO_ODA");
      for (const c of [...r.spec.openWhen, ...(r.spec.closeWhen ?? []), ...(r.spec.closeWhenNot ?? [])]) expect(stato).toContain(c);
    }
    expect(master("F025").label).toBe("Data assegnazione");
    expect(master("F046").label).toBe("Invio Pacchetto Permessi");
  });
});

const URL_RS = process.env.MONGO_RS_TEST_URL;
describe.skipIf(!URL_RS)("liste e soglie sul replica set usa-e-getta", () => {
  let client: MongoClient;
  let db: Db;
  const DB = `practicehub_test_lists_${Date.now()}`;
  const userOf = (memberships: MembershipDTO[], isAdmin = false): UserDTO => ({
    id: new ObjectId().toHexString(), name: "u", email: "u@test.local", status: "active", isAdmin, memberships, createdAt: "", updatedAt: "",
  });
  const admin = userOf([], true);
  const utLeader = userOf([{ templateId: "INWIT", group: "UT_PE", role: "UT", leader: true }]);
  const ut = userOf([{ templateId: "INWIT", group: "UT_PE", role: "UT", leader: false }]);
  const pmLeader = userOf([{ templateId: "INWIT", group: "PM_PERMESSI", role: "PM", leader: true }]);
  const deps = () => ({ client, db });

  beforeAll(async () => {
    assertDisposableTarget(URL_RS!, DB);
    client = await new MongoClient(URL_RS!).connect();
    db = client.db(DB);
    const first = await bootstrapStore(db);
    expect(first.listsInserted).toBe(INITIAL_LISTS.length);
  });
  afterAll(async () => {
    await client?.db(DB).dropDatabase();
    await client?.close();
  });

  it("bootstrap ripetuto: nessuna lista nuova e le modifiche restano", async () => {
    await store.lists(db).updateOne({ templateId: "INWIT", listId: "FORNITORE_UT" }, { $set: { items: [{ code: "DITTA_A", label: "Ditta A", active: true, order: 1 }] } });
    expect((await bootstrapStore(db)).listsInserted).toBe(0);
    expect((await store.lists(db).findOne({ templateId: "INWIT", listId: "FORNITORE_UT" }))!.items).toHaveLength(1);
  });

  it("lettura: solo i propri gestori più le comuni, editable dal motore", async () => {
    const lists = await getLists(db, utLeader, { templateId: "INWIT", group: null });
    expect(new Set(lists.map((l) => l.templateId))).toEqual(new Set(["INWIT", null]));
    expect(lists.find((l) => l.listId === "FORNITORE_UT")!.editable).toBe(true);
    expect(lists.find((l) => l.listId === "TIPOLOGIA_SITO")!.editable).toBe(false);
    expect(lists.find((l) => l.listId === "COMMITTENTE" && l.templateId === null)!.editable).toBe(false);
    await expect(getLists(db, utLeader, { templateId: "ILIAD" })).rejects.toMatchObject({ status: 404 });
    expect((await getLists(db, ut, { templateId: "INWIT", group: "UT_PE" })).every((l) => !l.editable)).toBe(true);
  });

  it("aggiornamento: revision, 403, 409, CONTROLLED solo etichette, codice usato → si disattiva", async () => {
    const cur = (await getLists(db, utLeader, { templateId: "INWIT" })).find((l) => l.listId === "FORNITORE_UT")!;
    const items = [...cur.items, { code: "DITTA_B", label: "Ditta B", active: true, order: 2 }];
    const r = await updateList(deps(), utLeader, "FORNITORE_UT", "INWIT", { items, revision: cur.revision });
    expect(r.revision).toBe(cur.revision + 1);
    await expect(updateList(deps(), utLeader, "FORNITORE_UT", "INWIT", { items, revision: cur.revision })).rejects.toMatchObject({ status: 409, extra: { code: "REVISION_CONFLICT" } });
    await expect(updateList(deps(), ut, "FORNITORE_UT", "INWIT", { items, revision: r.revision })).rejects.toMatchObject({ status: 403 });

    // Codice usato in una pratica: non si toglie, si disattiva.
    const fornitore = COMPILED_TEMPLATES.INWIT.template.occurrences.find((o) => o.kind === "MASTER" && o.list?.listId === "FORNITORE_UT")!;
    const b = buildNewPractice({ practiceId: new ObjectId(), iterationId: new ObjectId(), templateId: "INWIT", template: COMPILED_TEMPLATES.INWIT.template, identity: { codiceG7: "1", codiceSito: "S", nomeSito: "N", committente: { code: "TODOS" }, clienteFinale: { code: "INWIT" } }, createdBy: null, values: { [fornitore.flowId!]: { code: "DITTA_B" } }, now: new Date() });
    await store.practices(db).insertOne(b.practice);
    await store.iterations(db).insertOne(b.iteration);
    await expect(updateList(deps(), utLeader, "FORNITORE_UT", "INWIT", { items: items.filter((i) => i.code !== "DITTA_B"), revision: r.revision })).rejects.toMatchObject({ status: 422, extra: { usedCodes: ["DITTA_B"] } });
    const off = await updateList(deps(), utLeader, "FORNITORE_UT", "INWIT", { items: items.map((i) => (i.code === "DITTA_B" ? { ...i, active: false, label: "Ditta B (non più usata)" } : i)), revision: r.revision });
    expect(off.items.find((i) => i.code === "DITTA_B")).toMatchObject({ active: false, label: "Ditta B (non più usata)" });

    // CONTROLLED: l'ADMIN cambia l'etichetta, non i codici.
    const ts = (await getLists(db, admin, { templateId: "INWIT" })).find((l) => l.listId === "TIPOLOGIA_SITO")!;
    const relabel = await updateList(deps(), admin, "TIPOLOGIA_SITO", "INWIT", { items: ts.items.map((i) => ({ ...i, label: i.label.toUpperCase() })), revision: ts.revision });
    expect(relabel.items[0].label).toBe(ts.items[0].label.toUpperCase());
    await expect(updateList(deps(), admin, "TIPOLOGIA_SITO", "INWIT", { items: relabel.items.slice(1), revision: relabel.revision })).rejects.toMatchObject({ status: 422 });
  });

  it("modificare INCARICO riallinea TIPOLOGIA_ATTIVITA_PE (D-86)", async () => {
    const inc = (await getLists(db, pmLeader, { templateId: "INWIT" })).find((l) => l.listId === "INCARICO")!;
    await updateList(deps(), pmLeader, "INCARICO", "INWIT", { items: [...inc.items, { code: "NUOVA_ATTIVITA", label: "Nuova attività", active: true, order: 99 }], revision: inc.revision });
    const tipo = (await store.lists(db).findOne({ templateId: "INWIT", listId: "TIPOLOGIA_ATTIVITA_PE" }))!;
    expect(tipo.items.map((i) => i.code)).toContain("NUOVA_ATTIVITA");
    expect(tipo.revision).toBe(2);
  });

  it("soglie: lettura, nuova versione dall'ADMIN, 409, 403, regola non applicabile", async () => {
    const rules = await getAlertRules(db, pmLeader, "INWIT");
    expect(rules.map((r) => r.ruleId)).not.toContain("CDMS_EM");
    const sopr = rules.find((r) => r.ruleId === "SOPRALLUOGO")!;
    expect(sopr).toMatchObject({ days: 7, unit: "WORKING_DAYS", revision: 1 });
    const v2 = await updateAlertRule(deps(), admin, "SOPRALLUOGO", "INWIT", { days: 5, revision: 1 });
    expect(v2).toMatchObject({ days: 5, revision: 2 });
    expect((await getAlertRules(db, pmLeader, "INWIT")).find((r) => r.ruleId === "SOPRALLUOGO")!.days).toBe(5);
    await expect(updateAlertRule(deps(), admin, "SOPRALLUOGO", "INWIT", { days: 6, revision: 1 })).rejects.toMatchObject({ status: 409 });
    await expect(updateAlertRule(deps(), pmLeader, "SOPRALLUOGO", "INWIT", { days: 6, revision: 2 })).rejects.toMatchObject({ status: 403 });
    await expect(updateAlertRule(deps(), admin, "CDMS_EM", "INWIT", { days: 6, revision: 1 })).rejects.toMatchObject({ status: 404 });
    expect(await store.ruleConfig(db).countDocuments({ templateId: "INWIT", ruleId: "SOPRALLUOGO" })).toBe(2); // versioni conservate
  });
});
