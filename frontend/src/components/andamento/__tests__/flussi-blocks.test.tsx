import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { AndamentoFlussiDTO, AndamentoFlussoValoriDTO, AndamentoRilavorazioniDTO } from "@/components/andamento/types";

const source = vi.hoisted(() => ({
  loadStati: vi.fn(),
  loadFlussi: vi.fn(),
  loadFerme: vi.fn(),
  loadRilavorazioni: vi.fn(),
  csvHref: vi.fn(() => "#"),
  CSV_READY: false,
}));
vi.mock("@/components/andamento/andamento-source", () => source);

import { arretratoConto, bucketsOf, ComingBlock, FlussiBlock, Riepilogo, RilavorazioniBlock, signed } from "@/components/andamento/flussi-blocks";
import type { AndamentoFilters } from "@/components/andamento/andamento-url";

const FILTERS: AndamentoFilters = { templateId: null, from: "2026-07-01", to: "2026-09-30", passo: "mese", confronto: "precedente" };
const BASE = {
  asOf: "2026-10-11T10:00:00+02:00",
  dataFrom: "2026-06-03",
  query: { templateId: null, from: FILTERS.from, to: FILTERS.to, granularity: "month" as const },
  confronto: { periodoPrecedente: { from: "2026-04-01", to: "2026-06-30" }, annoPrecedente: null },
  buckets: [],
};
const v = (entrate: number, terminate: number, ko: number, arretratoFine: number, extra: Partial<AndamentoFlussoValoriDTO> = {}): AndamentoFlussoValoriDTO => ({
  entrate, entrateImport: 0, terminate, ko, rientri: 0, archiviate: 0, ripristinate: 0, arretratoFine, ...extra,
});
const FLUSSI: AndamentoFlussiDTO = {
  ...BASE,
  attiveOra: 128,
  arretratoInizio: 123,
  // 123 + 42 + 5 + 1 + 1 − 30 − 7 − 7 = 128 (contract v0.6.8).
  periodo: v(42, 30, 7, 128, { entrateImport: 5, rientri: 1, ripristinate: 1, archiviate: 7 }),
  precedente: v(38, 35, 6, 123),
  annoPrecedente: null,
  serie: [
    { periodo: { from: "2026-07-01", to: "2026-07-31" }, ...v(12, 10, 2, 123) },
    { periodo: { from: "2026-08-01", to: "2026-08-31" }, ...v(10, 8, 3, 122) },
    { periodo: { from: "2026-09-01", to: "2026-09-30" }, ...v(20, 12, 2, 128) },
  ],
};
const durata = (m: number | null) => ({ conclusi: 3, mediaGiorni: m, medianaGiorni: m, inCorso: 0, etaMedianaInCorsoGiorni: null, esclusePerImport: 0 });

beforeEach(() => {
  vi.clearAllMocks();
  source.loadFlussi.mockResolvedValue(FLUSSI);
  source.loadStati.mockResolvedValue({ ...BASE, righe: [], piuLenti: [], complessivo: durata(61), complessivoPrecedente: durata(58.5), serie: [] });
  source.loadFerme.mockResolvedValue({ asOf: BASE.asOf, dataFrom: null, query: { templateId: null, stato: null }, soglia: 30, totale: 9, perStato: [], perCliente: [], items: [], truncated: false, nonDatabili: { totale: 0, perStato: [] } });
});

describe("the backlog adds up (contract v0.6.8)", () => {
  it("start + in − out = end, written so it can be checked by hand", () => {
    const p = FLUSSI.periodo;
    expect(FLUSSI.arretratoInizio + p.entrate + p.entrateImport + p.rientri + p.ripristinate! - p.terminate - p.ko - p.archiviate!).toBe(p.arretratoFine);
    expect(arretratoConto(FLUSSI.arretratoInizio, p)).toBe(
      "Arretrato: 123 all'inizio + 42 entrate + 5 da import + 1 riaperture + 1 ripristinate − 30 terminate − 7 KO − 7 archiviate = 128 alla fine."
    );
  });
});

describe("labels and changes", () => {
  it("buckets by month and by week; changes are written, never colored", () => {
    expect(bucketsOf([{ from: "2025-10-01", to: "2025-10-31" }], "mese")).toEqual([{ key: "2025-10-01", label: "ott 25", full: "ottobre 2025" }]);
    expect(bucketsOf([{ from: "2026-10-05", to: "2026-10-11" }], "settimana")).toEqual([{ key: "2026-10-05", label: "05/10", full: "settimana dal 05/10/2026" }]);
    expect([signed(5), signed(-3), signed(0)]).toEqual(["+5", "−3", "0"]);
  });
});

describe("Riepilogo", () => {
  it("six tiles with the comparison written; «dati dal …»", async () => {
    render(<Riepilogo filters={FILTERS} />);
    expect(await screen.findByText("Dati dal 03/06/2026 · le pratiche importate contano dal giorno dell'import.")).toBeInTheDocument();
    expect(await screen.findByTestId("tile-attive")).toHaveTextContent("128");
    expect(screen.getByTestId("tile-entrate")).toHaveTextContent("42prec. 38 · + 5 da import");
    expect(screen.getByTestId("tile-uscite")).toHaveTextContent("37terminate 30 · KO 7 · prec. 41");
    expect(screen.getByTestId("tile-arretrato")).toHaveTextContent("+5da 123 a 128 · archiviate 7 · ripristinate 1");
    expect(await within(screen.getByTestId("tile-ferme")).findByText("9")).toBeInTheDocument();
    expect(await within(screen.getByTestId("tile-tempo")).findByText("61 gg")).toBeInTheDocument();
    expect(screen.getByTestId("tile-tempo")).toHaveTextContent("periodo prec. 58,5 gg");
  });
});

describe("FlussiBlock", () => {
  it("entrate/uscite and the backlog: two charts on the same months, never a double axis", async () => {
    render(<FlussiBlock filters={FILTERS} />);
    const flussi = await screen.findByTestId("andamento-flussi-chart");
    const arretrato = screen.getByTestId("andamento-arretrato-chart");
    expect(within(flussi).getAllByTestId("andamento-flussi-chart-bucket")).toHaveLength(3);
    expect(within(arretrato).getAllByTestId("andamento-arretrato-chart-bucket")).toHaveLength(3);
    expect(within(flussi).getAllByTestId("andamento-flussi-chart-bucket")[0].querySelector("title")).toHaveTextContent(
      "luglio 2026: Entrate 12 · Uscite (terminate e KO) 12"
    );
    expect(screen.getByTestId("andamento-flussi-note")).toHaveTextContent(
      "Arretrato: 123 all'inizio + 42 entrate + 5 da import + 1 riaperture + 1 ripristinate − 30 terminate − 7 KO − 7 archiviate = 128 alla fine."
    );
    // The rest of the sum is in the table, not drawn: still two columns per month and two legend entries.
    expect(within(flussi).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Entrate", "Uscite (terminate e KO)"]);
    fireEvent.click(screen.getByTestId("andamento-flussi-chart-toggle"));
    const header = within(screen.getByTestId("andamento-flussi-chart-table")).getAllByRole("columnheader").map((h) => h.textContent);
    expect(header).toEqual(["Periodo", "Entrate", "Uscite (terminate e KO)", "Da import", "Riaperture", "Ripristinate", "Archiviate", "Arretrato a fine periodo"]);
  });
});

describe("RilavorazioniBlock", () => {
  it("rework, resubmit and backward steps with the comparison; where rework starts", async () => {
    const data: AndamentoRilavorazioniDTO = {
      ...BASE,
      periodo: { rework: 6, resubmit: 2, ritorni: 5 },
      precedente: { rework: 4, resubmit: 1, ritorni: 3 },
      annoPrecedente: null,
      daStato: [{ stato: "KO", rework: 3, resubmit: 0 }, { stato: "DINIEGATO", rework: 2, resubmit: 1 }],
      ritorni: [{ from: "AUTORIZZATO", to: "INTEGRAZIONE_RICHIESTA", count: 1 }, { from: "PROTOCOLLATO", to: "ASSEGNATO", count: 4 }],
      serie: [{ periodo: { from: "2026-09-01", to: "2026-09-30" }, rework: 2, resubmit: 1, ritorni: 3 }],
    };
    source.loadRilavorazioni.mockResolvedValue(data);
    render(<RilavorazioniBlock filters={FILTERS} />);
    expect(await screen.findByTestId("andamento-rilav-rework")).toHaveTextContent("Rilavorazioni6prec. 4");
    expect(screen.getByTestId("andamento-rilav-da-stato")).toHaveTextContent("KO 3 · DINIEGATO 3");
    const rows = within(screen.getByTestId("andamento-ritorni")).getAllByRole("row").slice(1).map((r) => r.textContent);
    expect(rows).toEqual(["PROTOCOLLATOASSEGNATO4", "AUTORIZZATOINTEGRAZIONE RICHIESTA1"]);
    expect(within(screen.getByTestId("andamento-rilav-serie")).getAllByRole("row")[1]).toHaveTextContent("settembre 2026213");
  });
});

describe("blocks not ready on the server", () => {
  it("show «in arrivo», never an error", () => {
    render(<ComingBlock title="Scadenze e alert" text="In preparazione." testId="andamento-scadenze" />);
    expect(screen.getByTestId("andamento-scadenze")).toHaveTextContent("In arrivo");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("one request per address (andamento-source)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("the tiles and the blocks share one answer; Riprova asks again", async () => {
    const real = await vi.importActual<typeof import("@/components/andamento/andamento-source")>("@/components/andamento/andamento-source");
    real.forgetReads();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(FLUSSI), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await Promise.all([real.loadFlussi(FILTERS), real.loadFlussi(FILTERS)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe("/api/andamento/flussi?from=2026-07-01&to=2026-09-30&granularity=month");
    await real.loadFlussi(FILTERS, true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(real.csvHref("stati", FILTERS, "serie")).toBe("/api/andamento/stati?from=2026-07-01&to=2026-09-30&granularity=month&format=csv&tabella=serie");
    expect(real.csvHref("ferme", { ...FILTERS, templateId: "ILIAD" })).toBe("/api/andamento/ferme?templateId=ILIAD&format=csv");
  });
});
