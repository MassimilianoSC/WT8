// @vitest-environment node
/**
 * Blocchi scadenze e tempo per gruppo di Andamento (contratto §15.4, D-195), senza database: una pratica ILIAD con
 * forecast e completamenti noti, alert di ogni tipo, tre Assegna (UT/PE, DL, AIE dentro un import). Numeri a mano.
 */
import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { gruppiBlock, scadenzeBlock } from "@/services/andamento/blocks-extra";
import { windowsOf } from "@/services/andamento/blocks";
import { buildTimeline, type Dataset } from "@/services/andamento/dataset";
import type { ExtraData } from "@/services/andamento/extra";
import { parseAndamentoQuery } from "@/services/andamento/period";

type Ev = Parameters<typeof buildTimeline>[1][number];
const IT = new ObjectId();
let idx = 0;
const ev = (kind: Ev["kind"], at: string, o: { op?: string; source?: Ev["source"]; d?: Record<string, unknown> } = {}): Ev => ({
  practiceId: new ObjectId(),
  iterationId: IT,
  n: 1,
  kind,
  source: o.source ?? "USER",
  timestamp: new Date(at),
  operationId: o.op ?? `op-${idx}`,
  eventIndex: idx++,
  structuredDetail: o.d,
});
const A = buildTimeline({ id: "a1", templateId: "ILIAD", codiceSito: "A1", nomeSito: "A", archived: false, enabledGroups: ["PM_PERMESSI", "UT_PE", "DL", "AIE"], currentStato: "ASSEGNATO", currentN: 1 }, [
  ev("CREATE", "2026-01-05T09:00:00Z"),
  ev("STATO", "2026-01-06T09:00:00Z", { source: "SYSTEM", d: { from: "CREATA", to: "ASSEGNATO" } }),
  ev("ASSIGN", "2026-02-01T09:00:00Z", { d: { groups: ["UT_PE"], added: ["UT_PE"] } }),
  ev("ASSIGN", "2026-02-10T09:00:00Z", { d: { groups: ["DL"], added: ["DL"] } }),
  ev("ASSIGN", "2026-02-12T09:00:00Z", { d: { groups: ["UT_PE"], added: [] } }), // ripetuta: non conta
  ev("IMPORT", "2026-02-15T09:00:00Z", { op: "imp", source: "IMPORT" }),
  ev("ASSIGN", "2026-02-15T09:00:00Z", { op: "imp", d: { groups: ["AIE"], added: ["AIE"] } }), // dentro un import: esclusa
]);
const ds: Dataset = { builtAt: 0, templates: ["ILIAD"], practices: [A], byId: new Map([["a1", A]]), firstEventAt: Date.parse("2026-01-05T09:00:00Z") };
const it1 = IT.toHexString();
const alert = (o: Partial<ExtraData["alerts"][number]> & { openedAt: Date; practiceId: ObjectId }): ExtraData["alerts"][number] => ({
  closedAt: null,
  dueAt: null,
  status: "OPEN",
  executionStatus: "ACTIVE",
  generation: 1,
  reminderCount: 0,
  ...o,
});
// Gli alert si legano alla pratica per id: si usa lo stesso id esadecimale della timeline.
const pid = new ObjectId();
const A2 = { ...A, id: pid.toHexString() };
const ds2: Dataset = { ...ds, practices: [A2], byId: new Map([[A2.id, A2]]) };
const extra: ExtraData = {
  iterations: [
    {
      iterationId: it1,
      practiceId: A2.id,
      templateId: "ILIAD",
      n: 1,
      values: { F126: "2026-02-20", F135: "2026-02-25", F140: "2026-03-10", F149: "2026-03-05", F151: "2026-03-01" },
      rows: [{ groupKey: "ARPA", rowId: "r1", values: { F076: "2026-03-15", F077: "2026-03-15" } }],
    },
  ],
  forecastChanged: new Set([`${it1}|F126|`]),
  firstEdits: new Map([[it1, new Map([["UT_PE", [Date.parse("2026-01-20T09:00:00Z"), Date.parse("2026-02-04T09:00:00Z")]]])]]),
  alerts: [
    alert({ practiceId: pid, openedAt: new Date("2026-01-10T09:00:00Z"), closedAt: new Date("2026-01-14T09:00:00Z"), status: "CLOSED" }),
    alert({ practiceId: pid, openedAt: new Date("2026-02-05T09:00:00Z"), dueAt: new Date("2026-02-20T08:00:00Z"), reminderCount: 2 }),
    alert({ practiceId: pid, openedAt: new Date("2026-03-01T09:00:00Z"), executionStatus: "SUPERSEDED", status: "CLOSED", closedAt: new Date("2026-03-01T09:00:00Z") }),
    alert({ practiceId: pid, openedAt: new Date("2026-03-02T09:00:00Z"), executionStatus: "SUSPENDED", dueAt: new Date("2026-03-03T08:00:00Z") }),
  ],
};
const NOW = new Date("2026-04-10T10:00:00Z");
const w = windowsOf(ds2, parseAndamentoQuery(new URLSearchParams("from=2026-01-01&to=2026-03-31&granularity=month"), NOW));

describe("Andamento: scadenze e tempo per gruppo", () => {
  it("scadenze: entro / oltre l'ultimo forecast (righe comprese), rinviate, forecast scaduti aperti, alert", () => {
    const s = scadenzeBlock(ds2, extra, w, NOW);
    expect(s.periodo).toEqual({
      entro: 2, // PE (05/03 ≤ 10/03), ARPA riga (15/03 = 15/03)
      oltre: 1, // UT (25/02 > 20/02)
      rinviate: 1, // il forecast UT era cambiato
      // aperti e chiusi: mai i SUPERSEDED; il chiuso dopo 4 giorni; scaduto quello ACTIVE oltre la scadenza a fine
      // periodo; ripetuto quello con i promemoria; sospeso quello SUSPENDED ancora aperto.
      alert: { aperti: 3, chiusi: 1, scaduti: 1, ripetuti: 1, sospesi: 1, mediaChiusuraGiorni: 4, medianaChiusuraGiorni: 4 },
    });
    expect(s.forecastScadutiAperti).toBe(1); // Deposito Sismico (DL), 01/03 senza completamento
    expect(s.perMilestone).toEqual(
      expect.arrayContaining([
        { semanticId: "UT", label: "Forecast UT", ownerGroup: "UT_PE", entro: 0, oltre: 1, rinviate: 1 },
        { semanticId: "PE", label: "Forecast PE", ownerGroup: "UT_PE", entro: 1, oltre: 0, rinviate: 0 },
        { semanticId: "ARPA", label: "Forecast Parere Arpa", ownerGroup: "PM_PERMESSI", entro: 1, oltre: 0, rinviate: 0 },
      ])
    );
    expect(s.serie.map((b) => [b.entro, b.oltre, b.alertAperti, b.alertChiusi])).toEqual([
      [0, 0, 1, 1],
      [0, 1, 1, 0],
      [2, 0, 1, 0],
    ]);
  });

  it("gruppi: per partire (prima modifica USER dopo l'Assegna) e per la prima consegna; ripetute e import escluse", () => {
    const g = gruppiBlock(ds2, extra, w, NOW);
    const r = (x: string) => g.righe.find((y) => y.group === x)!;
    expect(g.righe.map((x) => x.group)).toEqual(["UT_PE", "AIE", "DL"]);
    expect(r("UT_PE")).toMatchObject({
      assegnazioni: 1,
      perPartire: { conclusi: 1, medianaGiorni: 3, inCorso: 0 }, // 01/02 → 04/02 (la modifica del 20/01 è prima)
      perConsegnare: { conclusi: 1, medianaGiorni: 24, inCorso: 0 }, // 01/02 → 25/02 (UT prima di PE)
      pochiDati: true,
    });
    expect(r("DL")).toMatchObject({
      assegnazioni: 1,
      perPartire: { conclusi: 0, inCorso: 1, etaMedianaInCorsoGiorni: 49.5 },
      perConsegnare: { conclusi: 0, inCorso: 1, etaMedianaInCorsoGiorni: 49 },
    });
    expect(r("AIE")).toMatchObject({ assegnazioni: 0, perPartire: { conclusi: 0, inCorso: 0 } });
  });
});
