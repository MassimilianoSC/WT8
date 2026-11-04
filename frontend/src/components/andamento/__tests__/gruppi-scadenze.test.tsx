import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { AndamentoDurataDTO, AndamentoGruppiDTO, AndamentoScadenzeDTO, AndamentoScadenzeValoriDTO } from "@/components/andamento/types";

const source = vi.hoisted(() => ({ loadGruppi: vi.fn(), loadScadenze: vi.fn(), csvHref: vi.fn(() => "#"), CSV_READY: false }));
vi.mock("@/components/andamento/andamento-source", () => source);

import { GruppiBlock, ScadenzeBlock } from "@/components/andamento/gruppi-scadenze";
import type { AndamentoFilters } from "@/components/andamento/andamento-url";

const FILTERS: AndamentoFilters = { templateId: null, from: "2026-07-01", to: "2026-09-30", passo: "mese", confronto: "precedente" };
const BASE = {
  asOf: "2026-10-11T10:00:00+02:00",
  dataFrom: "2026-06-03",
  query: { templateId: null, from: FILTERS.from, to: FILTERS.to, granularity: "month" as const },
  confronto: { periodoPrecedente: { from: "2026-04-01", to: "2026-06-30" }, annoPrecedente: null },
  buckets: [],
};
const d = (medianaGiorni: number | null, inCorso = 0): AndamentoDurataDTO => ({
  conclusi: 6, mediaGiorni: medianaGiorni === null ? null : medianaGiorni + 1, medianaGiorni, inCorso, etaMedianaInCorsoGiorni: null,
});

beforeEach(() => vi.clearAllMocks());

describe("GruppiBlock (D-195)", () => {
  it("UT/PE, AIE and DL with time to start and to the first delivery; PM/Permessi explained, not listed", async () => {
    const data: AndamentoGruppiDTO = {
      ...BASE,
      righe: [
        { group: "UT_PE", assegnazioni: 12, perPartire: d(2.5, 1), perConsegnare: d(14), precedente: { assegnazioni: 10, perPartire: d(3), perConsegnare: d(16) }, pochiDati: false },
        { group: "AIE", assegnazioni: 3, perPartire: d(1), perConsegnare: d(null, 2), precedente: { assegnazioni: 2, perPartire: d(null), perConsegnare: d(null) }, pochiDati: true },
        { group: "DL", assegnazioni: 0, perPartire: d(null), perConsegnare: d(null), precedente: { assegnazioni: 0, perPartire: d(null), perConsegnare: d(null) }, pochiDati: true },
      ],
    };
    source.loadGruppi.mockResolvedValue(data);
    render(<GruppiBlock filters={FILTERS} />);
    const ut = await screen.findByTestId("andamento-gruppo-UT_PE");
    expect(ut).toHaveTextContent("UT/PE12");
    expect(ut).toHaveTextContent("2,5 ggmedia 3,5 gg · 1 in corso");
    expect(ut).toHaveTextContent("partire 3 ggconsegna 16 gg");
    expect(within(screen.getByTestId("andamento-gruppo-AIE")).getByText("1 gg*")).toHaveClass("text-muted-foreground");
    expect(screen.queryByTestId("andamento-gruppo-PM_PERMESSI")).not.toBeInTheDocument();
    expect(screen.getByText(/I tempi di PM\/Permessi sono quelli degli stati/)).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Tempo per la prima consegna" })).toBeInTheDocument();
  });
});

describe("ScadenzeBlock (§15.4)", () => {
  const valori = (entro: number, oltre: number): AndamentoScadenzeValoriDTO => ({
    entro, oltre, rinviate: 4,
    alert: { aperti: 14, chiusi: 9, scaduti: 5, ripetuti: 2, sospesi: 1, mediaChiusuraGiorni: 4.5, medianaChiusuraGiorni: 3 },
  });

  it("forecast kept in %, late, postponed and overdue open; alerts; per activity", async () => {
    const data: AndamentoScadenzeDTO = {
      ...BASE,
      periodo: valori(71, 29),
      precedente: valori(60, 40),
      annoPrecedente: null,
      perMilestone: [{ semanticId: "SOPRALLUOGO", label: "Sopralluogo", ownerGroup: "UT_PE", entro: 20, oltre: 5, rinviate: 2 }],
      forecastScadutiAperti: 7,
      serie: [{ periodo: { from: "2026-07-01", to: "2026-07-31" }, entro: 20, oltre: 8, alertAperti: 5, alertChiusi: 3 }],
    };
    source.loadScadenze.mockResolvedValue(data);
    render(<ScadenzeBlock filters={FILTERS} />);
    expect(await screen.findByTestId("andamento-scad-entro")).toHaveTextContent("71 %71 su 100 · prec. 60 %");
    expect(screen.getByTestId("andamento-scad-oltre")).toHaveTextContent("29prec. 40");
    expect(screen.getByTestId("andamento-scad-aperti")).toHaveTextContent("7");
    expect(screen.getByTestId("andamento-scad-alert")).toHaveTextContent("aperti 14 · chiusi 9 · scaduti 5 · ripetuti 2 · sospesi 1 · chiusura in mediana 3 gg (media 4,5 gg)");
    expect(screen.getByTestId("andamento-scadenze-chart")).toBeInTheDocument();
    expect(screen.getByTestId("andamento-scad-milestone")).toHaveTextContent("SopralluogoUT/PE2052");
  });
});
