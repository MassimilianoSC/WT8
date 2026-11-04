// @vitest-environment node
/**
 * Blocchi di Andamento sui dati ricostruiti dagli eventi (contratto §15.4), senza database: uno scenario con i numeri
 * calcolati a mano. A: percorso normale fino a TERMINATO; B: importata (la permanenza iniziale non conta) con un
 * ritorno all'indietro; C: rilavorazione di A, attesa esterna, ripresentazione, archiviata; D: chiusa e riaperta.
 */
import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import type { StatoAttivita, TemplateId, UserDTO } from "@/lib/contract";
import { fermeBlock, flussiBlock, rilavorazioniBlock, statiBlock, windowsOf } from "@/services/andamento/blocks";
import { buildTimeline, type Dataset } from "@/services/andamento/dataset";
import { fermeCsv, flussiCsv, rilavorazioniCsv, statiCsv } from "@/services/andamento/csv";
import { bucketsOf, parseAndamentoQuery } from "@/services/andamento/period";

type Ev = Parameters<typeof buildTimeline>[1][number];
let idx = 0;
const ev = (kind: Ev["kind"], at: string, o: { op?: string; source?: Ev["source"]; n?: number; d?: Record<string, unknown> } = {}): Ev => ({
  practiceId: new ObjectId(),
  iterationId: new ObjectId(),
  n: o.n ?? 1,
  kind,
  source: o.source ?? "USER",
  timestamp: new Date(at),
  operationId: o.op ?? `op-${idx}`,
  eventIndex: idx++,
  structuredDetail: o.d,
});
const stato = (from: StatoAttivita, to: StatoAttivita, at: string, o: { op?: string; fact?: string } = {}) =>
  ev("STATO", at, { op: o.op, source: "SYSTEM", d: { from, to, ...(o.fact ? { autoEventDate: o.fact } : {}) } });
const practice = (id: string, templateId: TemplateId, currentStato: StatoAttivita, events: Ev[], archived = false) =>
  buildTimeline({ id, templateId, codiceSito: id.toUpperCase(), nomeSito: `Sito ${id}`, archived, enabledGroups: ["PM_PERMESSI"], currentStato, currentN: 1 }, events);

const A = practice("a1", "ILIAD", "TERMINATO", [
  ev("CREATE", "2026-01-05T09:00:00Z"),
  stato("CREATA", "ASSEGNATO", "2026-01-10T09:00:00Z", { fact: "2026-01-08" }),
  stato("ASSEGNATO", "PROTOCOLLATO", "2026-01-20T09:00:00Z", { fact: "2026-01-19" }),
  stato("PROTOCOLLATO", "AUTORIZZATO", "2026-02-19T09:00:00Z", { fact: "2026-02-18" }),
  stato("AUTORIZZATO", "TERMINATO", "2026-03-01T09:00:00Z"),
]);
const B = practice("b1", "ILIAD", "INTEGRAZIONE_RICHIESTA", [
  ev("CREATE", "2026-01-15T09:00:00Z", { op: "imp", source: "IMPORT" }),
  stato("CREATA", "PROTOCOLLATO", "2026-01-15T09:00:00Z", { op: "imp" }),
  ev("IMPORT", "2026-01-15T09:00:00Z", { op: "imp", source: "IMPORT" }),
  stato("PROTOCOLLATO", "AUTORIZZATO", "2026-02-14T09:00:00Z"),
  stato("AUTORIZZATO", "INTEGRAZIONE_RICHIESTA", "2026-02-24T09:00:00Z"),
]);
const C = practice(
  "c1",
  "TOWERNET",
  "CREATA",
  [
    ev("REWORK", "2026-03-05T09:00:00Z", { d: { originPracticeId: "a1", originIteration: 1 } }),
    stato("CREATA", "STAND_BY", "2026-03-10T09:00:00Z"),
    ev("RESUBMIT", "2026-03-20T09:00:00Z", { d: { fromIteration: 1, toIteration: 2 } }),
    ev("ARCHIVE", "2026-03-25T09:00:00Z", { n: 2 }),
  ],
  true
);
const D = practice("d1", "ILIAD", "REALIZZATO", [
  ev("CREATE", "2026-01-02T09:00:00Z"),
  stato("CREATA", "TERMINATO", "2026-01-03T09:00:00Z"),
  stato("TERMINATO", "REALIZZATO", "2026-01-12T09:00:00Z"),
]);
const ds: Dataset = {
  builtAt: 0,
  templates: ["ILIAD", "TOWERNET"],
  practices: [A, B, C, D],
  byId: new Map([A, B, C, D].map((p) => [p.id, p])),
  firstEventAt: Date.parse("2026-01-02T09:00:00Z"),
};
const NOW = new Date("2026-04-10T10:00:00Z");
const q = parseAndamentoQuery(new URLSearchParams("from=2026-01-01&to=2026-03-31&granularity=month"), NOW);
const w = windowsOf(ds, q);
const user = (memberships: UserDTO["memberships"], extra: Partial<UserDTO> = {}): UserDTO => ({
  id: "u",
  name: "u",
  email: "u@x",
  status: "active",
  isAdmin: false,
  memberships,
  createdAt: "",
  updatedAt: "",
  ...extra,
});

describe("Andamento: blocchi sugli eventi", () => {
  it("periodi: predefinito 12 mesi, confronto, secchi a settimana dal lunedì e a mese; filtri non validi 400", () => {
    expect(parseAndamentoQuery(new URLSearchParams(""), NOW)).toEqual({ templateId: null, from: "2025-04-11", to: "2026-04-10", granularity: "month" });
    expect(w.previous.period).toEqual({ from: "2025-10-03", to: "2025-12-31" });
    expect(w.year).toBeNull(); // nessun dato un anno prima
    expect(w.buckets.map((b) => b.period)).toEqual([
      { from: "2026-01-01", to: "2026-01-31" },
      { from: "2026-02-01", to: "2026-02-28" },
      { from: "2026-03-01", to: "2026-03-31" },
    ]);
    expect(bucketsOf({ from: "2026-01-01", to: "2026-01-14" }, "week")).toEqual([
      { from: "2026-01-01", to: "2026-01-04" },
      { from: "2026-01-05", to: "2026-01-11" },
      { from: "2026-01-12", to: "2026-01-14" },
    ]);
    for (const bad of ["templateId=X", "granularity=day", "from=2026-13-01", "from=2026-02-01&to=2026-01-01", "from=2010-01-01&to=2026-01-01"]) {
      expect(() => parseAndamentoQuery(new URLSearchParams(bad), NOW), bad).toThrow(expect.objectContaining({ status: 400 }));
    }
  });

  it("stati: permanenze concluse (import escluso), in corso, data del fatto, gruppoStato, complessivo, serie", () => {
    const s = statiBlock(ds, w, NOW);
    const r = (x: StatoAttivita) => s.righe.find((y) => y.stato === x)!;
    expect(s.righe.map((x) => x.stato)).toHaveLength(12);
    expect(s.dataFrom).toBe("2026-01-02");
    expect(r("CREATA")).toMatchObject({ passaggi: 4, periodo: { conclusi: 3, medianaGiorni: 5, mediaGiorni: 3.7 }, pochiDati: true, candidabile: true });
    expect(r("CREATA").periodo.inCorso).toBe(1); // C, iterazione 2 (anche se archiviata)
    expect(r("ASSEGNATO")).toMatchObject({ periodo: { conclusi: 1, medianaGiorni: 10 }, perDataDelFatto: { conclusi: 1, medianaGiorni: 11 } });
    // B entra in PROTOCOLLATO dentro l'import: quella permanenza non conta e non è un passaggio.
    expect(r("PROTOCOLLATO")).toMatchObject({ passaggi: 1, periodo: { conclusi: 1, medianaGiorni: 30 }, perDataDelFatto: { conclusi: 1, medianaGiorni: 30 } });
    expect(r("AUTORIZZATO").periodo).toMatchObject({ conclusi: 2, medianaGiorni: 10, inCorso: 0 });
    expect(r("STAND_BY")).toMatchObject({ gruppoStato: "ESTERNO", candidabile: false, periodo: { conclusi: 1, medianaGiorni: 10 } });
    expect(r("TERMINATO")).toMatchObject({ gruppoStato: "OPERATIVO", candidabile: false, passaggi: 2, periodo: { conclusi: 1, medianaGiorni: 9 } });
    expect(r("INTEGRAZIONE_RICHIESTA").periodo).toMatchObject({ conclusi: 0, inCorso: 1, medianaGiorni: null });
    expect(s.piuLenti).toEqual([]); // nessuno stato con almeno 5 conclusi
    expect(s.complessivo).toMatchObject({ conclusi: 2, medianaGiorni: 28, esclusePerImport: 0 }); // A 55, D 1
    expect(s.serie[0].perStato).toEqual({ CREATA: { conclusi: 2, medianaGiorni: 3 }, ASSEGNATO: { conclusi: 1, medianaGiorni: 10 }, TERMINATO: { conclusi: 1, medianaGiorni: 9 } });
    expect(JSON.stringify(s)).not.toMatch(/userId|actor|name/);
  });

  it("stati: «più lento» solo tra gli operativi con almeno 5 conclusi, pari merito compresi, mai esterni né finali", () => {
    const many = (id: string, st: StatoAttivita, next: StatoAttivita, d: number) =>
      practice(id, "ILIAD", next, [ev("CREATE", "2026-01-01T09:00:00Z"), stato("CREATA", st, "2026-01-02T09:00:00Z"), stato(st, next, new Date(Date.parse("2026-01-02T09:00:00Z") + d * 86_400_000).toISOString())]);
    const ps = [
      ...[1, 2, 3, 4, 5].map((i) => many(`p${i}`, "PROTOCOLLATO", "AUTORIZZATO", 20)),
      ...[1, 2, 3, 4, 5].map((i) => many(`q${i}`, "IN_APPROVAZIONE", "AUTORIZZATO", 20)),
      ...[1, 2, 3, 4, 5].map((i) => many(`s${i}`, "STAND_BY", "AUTORIZZATO", 90)),
    ];
    const d2: Dataset = { ...ds, practices: ps, byId: new Map(ps.map((p) => [p.id, p])) };
    expect(statiBlock(d2, windowsOf(d2, q), NOW).piuLenti).toEqual(["IN_APPROVAZIONE", "PROTOCOLLATO"]);
  });

  it("flussi: entrate a mano e da import, uscite, riaperture, arretrato a inizio, fine e oggi (archiviate escluse)", () => {
    const f = flussiBlock(ds, w, NOW);
    expect(f.periodo).toEqual({ entrate: 3, entrateImport: 1, terminate: 2, ko: 0, rientri: 1, archiviate: 1, ripristinate: 0, arretratoFine: 2 });
    expect(f).toMatchObject({ attiveOra: 2, arretratoInizio: 0, annoPrecedente: null });
    expect(f.precedente).toEqual({ entrate: 0, entrateImport: 0, terminate: 0, ko: 0, rientri: 0, archiviate: 0, ripristinate: 0, arretratoFine: 0 });
    expect(f.serie.map((x) => [x.entrate, x.entrateImport, x.terminate, x.arretratoFine])).toEqual([
      [2, 1, 1, 3], // gennaio: A, D (B da import); D termina; attive A, B, D
      [0, 0, 0, 3], // febbraio: A, B, D
      [1, 0, 1, 2], // marzo: C (rilavorazione); A termina; C archiviata il 25: attive B, D
    ]);
  });

  it("arretrato: inizio + entrate (attive all'ingresso) + rientri + ripristini − uscite − archiviazioni di attive = fine", () => {
    // E termina nel periodo e viene archiviata DOPO: all'inizio del periodo non era archiviata (prima contava come tale).
    const E = practice("e1", "INWIT", "TERMINATO", [
      ev("CREATE", "2025-12-01T09:00:00Z"),
      stato("CREATA", "ASSEGNATO", "2025-12-02T09:00:00Z"),
      stato("ASSEGNATO", "TERMINATO", "2026-02-10T09:00:00Z"),
      ev("ARCHIVE", "2026-04-05T09:00:00Z"),
    ], true);
    // F archiviata da attiva nel periodo e poi ripristinata nel periodo; G ripristinata nel periodo dopo un archivio di prima.
    const F = practice("f1", "INWIT", "PROTOCOLLATO", [
      ev("CREATE", "2025-11-01T09:00:00Z"),
      stato("CREATA", "PROTOCOLLATO", "2025-11-02T09:00:00Z"),
      ev("ARCHIVE", "2026-02-01T09:00:00Z"),
      ev("RESTORE", "2026-03-01T09:00:00Z"),
    ]);
    const G = practice("g1", "INWIT", "PROTOCOLLATO", [
      ev("CREATE", "2025-10-01T09:00:00Z"),
      stato("CREATA", "PROTOCOLLATO", "2025-10-02T09:00:00Z"),
      ev("ARCHIVE", "2025-11-01T09:00:00Z"),
      ev("RESTORE", "2026-03-10T09:00:00Z"),
    ]);
    const ps = [...ds.practices, E, F, G];
    const d2: Dataset = { ...ds, practices: ps, byId: new Map(ps.map((p) => [p.id, p])), firstEventAt: Date.parse("2025-10-01T09:00:00Z") };
    const f = flussiBlock(d2, windowsOf(d2, q), NOW);
    // Inizio: E e F attive (G archiviata); entrate 3 (+1 import) tutte attive all'ingresso; uscite: A, D, E; riapertura D;
    // G ripristinata (+1); F archiviata e ripristinata (0). Fine: B, D, F, G.
    expect(f.arretratoInizio).toBe(2);
    expect(f.periodo).toMatchObject({ entrate: 3, entrateImport: 1, terminate: 3, ko: 0, rientri: 1, archiviate: 2, ripristinate: 2, arretratoFine: 4 });
    const quadra = (v: typeof f.periodo, inizio: number) => inizio + v.entrate + v.entrateImport + v.rientri + v.ripristinate! - v.terminate - v.ko - v.archiviate!;
    expect(quadra(f.periodo, f.arretratoInizio)).toBe(f.periodo.arretratoFine);
    // Anche secchio per secchio, ognuno dall'arretrato di fine del precedente.
    let inizio = f.arretratoInizio;
    for (const b of f.serie) {
      expect(quadra(b, inizio), b.periodo.from).toBe(b.arretratoFine);
      inizio = b.arretratoFine;
    }
    // Importata già chiusa e KO → TERMINATO: né entrata né uscita doppia.
    const H = practice("h1", "INWIT", "TERMINATO", [
      ev("CREATE", "2026-02-01T09:00:00Z", { op: "imp2", source: "IMPORT" }),
      stato("CREATA", "TERMINATO", "2026-02-01T09:00:00Z", { op: "imp2" }),
      ev("IMPORT", "2026-02-01T09:00:00Z", { op: "imp2", source: "IMPORT" }),
    ]);
    const K = practice("k1", "INWIT", "TERMINATO", [ev("CREATE", "2026-01-10T09:00:00Z"), stato("CREATA", "KO", "2026-01-20T09:00:00Z"), stato("KO", "TERMINATO", "2026-02-20T09:00:00Z")]);
    const ps3 = [...ps, H, K];
    const d3: Dataset = { ...d2, practices: ps3, byId: new Map(ps3.map((p) => [p.id, p])) };
    const f3 = flussiBlock(d3, windowsOf(d3, q), NOW);
    expect(f3.periodo).toMatchObject({ entrate: 4, entrateImport: 1, terminate: 3, ko: 1 });
    expect(quadra(f3.periodo, f3.arretratoInizio)).toBe(f3.periodo.arretratoFine);
  });

  it("rilavorazioni: stato d'origine, ripresentazione, ritorni all'indietro solo nella fase operativa", () => {
    const r = rilavorazioniBlock(ds, w, NOW);
    expect(r.periodo).toEqual({ rework: 1, resubmit: 1, ritorni: 1 });
    expect(r.daStato).toEqual([
      { stato: "TERMINATO", rework: 1, resubmit: 0 },
      { stato: "STAND_BY", rework: 0, resubmit: 1 },
    ]);
    expect(r.ritorni).toEqual([{ from: "AUTORIZZATO", to: "INTEGRAZIONE_RICHIESTA", count: 1 }]);
  });

  it("ferme: oltre soglia, attive e non archiviate, per giorni; canOpen solo se la scheda è già visibile; filtro di stato", () => {
    const ut = user([{ templateId: "ILIAD", group: "UT_PE", role: "UT", leader: false }]);
    const f = fermeBlock(ds, ut, { templateId: null, stato: null }, 30, NOW);
    expect(f.items.map((i) => [i.codiceSito, i.stato, i.giorni, i.fromImport, i.canOpen])).toEqual([
      ["D1", "REALIZZATO", 88, false, true],
      ["B1", "INTEGRAZIONE_RICHIESTA", 45, false, true],
    ]);
    expect(f).toMatchObject({ soglia: 30, totale: 2, truncated: false, perCliente: [{ templateId: "ILIAD", count: 2 }] });
    const pura = user([], { direzione: true });
    expect(fermeBlock(ds, pura, { templateId: null, stato: null }, 30, NOW).items.every((i) => i.canOpen === false)).toBe(true);
    expect(fermeBlock(ds, ut, { templateId: null, stato: "REALIZZATO" }, 30, NOW).totale).toBe(1);
    expect(fermeBlock(ds, ut, { templateId: null, stato: null }, 60, NOW).totale).toBe(1);
    expect(f.nonDatabili).toEqual({ totale: 0, perStato: [] });
    // Storia più vecchia degli eventi: lo stato attuale non ha un ingresso registrato → contata, non nascosta.
    const E = practice("e1", "INWIT", "PROTOCOLLATO", [ev("CREATE", "2026-01-02T09:00:00Z")]);
    const F = practice("f1", "INWIT", "AUTORIZZATO", []);
    const d2: Dataset = { ...ds, practices: [...ds.practices, E, F], byId: new Map([...ds.practices, E, F].map((p) => [p.id, p])) };
    expect(fermeBlock(d2, ut, { templateId: null, stato: null }, 30, NOW)).toMatchObject({
      totale: 2,
      nonDatabili: { totale: 2, perStato: [{ stato: "PROTOCOLLATO", count: 1 }, { stato: "AUTORIZZATO", count: 1 }] },
    });
    expect(fermeBlock(d2, ut, { templateId: "INWIT", stato: "AUTORIZZATO" }, 30, NOW).nonDatabili).toEqual({ totale: 1, perStato: [{ stato: "AUTORIZZATO", count: 1 }] });
  });

  it("CSV: separatore «;», date gg/mm/aaaa, virgola decimale, intestazioni italiane, BOM; tutte le ferme; tabelle secondarie", () => {
    const lines = (body: string) => body.replace(/^\uFEFF/, "").trimEnd().split("\r\n");
    const st = statiCsv(statiBlock(ds, w, NOW), "stati");
    expect(st.filename).toBe("andamento-stati_tutti_2026-01-01_2026-03-31.csv");
    expect(st.body.startsWith("\uFEFF")).toBe(true);
    const l = lines(st.body);
    expect(l[0]).toBe("Stato attività;Tipo;Passaggi;Permanenze concluse;Mediana giorni;Media giorni;In corso;Età mediana in corso (giorni);Mediana periodo precedente;Mediana per data del fatto;Pochi dati;Più lento");
    expect(l).toHaveLength(13);
    expect(l.find((x) => x.startsWith("CREATA;"))).toMatch(/^CREATA;Operativo;4;3;5;3,7;1;11,\d;;;sì;no$/);
    expect(l.find((x) => x.startsWith("STAND-BY;"))).toBe("STAND-BY;Attesa esterna;1;1;10;10;0;;;;sì;no");
    expect(lines(statiCsv(statiBlock(ds, w, NOW), "serie").body)[1]).toBe("01/01/2026;31/01/2026;CREATA;2;3");
    const fl = lines(flussiCsv(flussiBlock(ds, w, NOW)).body);
    expect(fl[0]).toBe("Dal;Al;Entrate;Entrate da import;Terminate;KO;Riaperture;Arretrato a fine");
    expect(fl[fl.length - 1]).toBe("01/01/2026;31/03/2026;3;1;2;0;1;2");
    expect(lines(rilavorazioniCsv(rilavorazioniBlock(ds, w, NOW), "ritorni").body)[1]).toBe("AUTORIZZATO;INTEGRAZIONE RICHIESTA;1");
    const ut = user([{ templateId: "ILIAD", group: "UT_PE", role: "UT", leader: false }]);
    const fe = fermeCsv(fermeBlock(ds, ut, { templateId: null, stato: null }, 30, NOW, Infinity), NOW);
    expect(fe.filename).toBe("andamento-ferme_tutti_2026-04-10.csv");
    expect(lines(fe.body)[1]).toBe("D1;Sito d1;ILIAD;REALIZZATO;12/01/2026;88;no;PM/Permessi");
  });
});