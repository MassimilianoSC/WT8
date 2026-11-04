import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ApiError } from "@/lib/client";
import { STATI_ATTIVITA, type StatoAttivita } from "@/lib/contract";
import type { AndamentoDurataDTO, AndamentoFermaDTO, AndamentoFermeDTO, AndamentoStatiDTO, AndamentoStatoRigaDTO } from "@/components/andamento/types";

const source = vi.hoisted(() => ({
  loadStati: vi.fn(),
  loadFerme: vi.fn(),
  csvHref: vi.fn((block: string, _f: unknown, tabella?: string) => `/api/andamento/${block}?format=csv${tabella ? `&tabella=${tabella}` : ""}`),
  CSV_READY: true,
}));
vi.mock("@/components/andamento/andamento-source", () => source);

import { FermeBlock, StatiBlock } from "@/components/andamento/blocks";
import { externalSentence, giorni, slowestSentence } from "@/components/andamento/stati-read";
import type { AndamentoFilters } from "@/components/andamento/andamento-url";

const FILTERS: AndamentoFilters = { templateId: null, from: "2025-11-01", to: "2026-10-11", passo: "mese", confronto: "precedente" };
const ESTERNI = new Set<StatoAttivita>(["DINIEGATO", "TAR", "STAND_BY"]);

const durata = (medianaGiorni: number | null, conclusi: number, inCorso = 0): AndamentoDurataDTO => ({
  conclusi, mediaGiorni: medianaGiorni === null ? null : medianaGiorni + 3, medianaGiorni, inCorso, etaMedianaInCorsoGiorni: null,
});
/** The 12 rows of the contract, all empty except the ones given. */
function stati(over: Partial<Record<StatoAttivita, Partial<AndamentoStatoRigaDTO>>>, piuLenti: StatoAttivita[]): AndamentoStatiDTO {
  const righe = STATI_ATTIVITA.map((stato): AndamentoStatoRigaDTO => ({
    stato,
    gruppoStato: ESTERNI.has(stato) ? "ESTERNO" : "OPERATIVO",
    candidabile: !ESTERNI.has(stato) && stato !== "TERMINATO" && stato !== "KO",
    passaggi: 0,
    periodo: durata(null, 0),
    precedente: { ...durata(null, 0), passaggi: 0 },
    annoPrecedente: null,
    perDataDelFatto: null,
    pochiDati: true,
    ...over[stato],
  }));
  const vuoto = { ...durata(null, 0), esclusePerImport: 0 };
  return {
    asOf: "2026-10-11T10:00:00+02:00", dataFrom: "2026-06-03",
    query: { templateId: null, from: FILTERS.from, to: FILTERS.to, granularity: "month" },
    confronto: { periodoPrecedente: { from: "2024-11-01", to: "2025-10-31" }, annoPrecedente: null },
    buckets: [], righe, piuLenti, complessivo: vuoto, complessivoPrecedente: vuoto, serie: [],
  };
}
const DATA = stati(
  {
    ASSEGNATO: { passaggi: 38, periodo: durata(6, 38, 2), pochiDati: false },
    PROTOCOLLATO: { passaggi: 22, periodo: durata(24.5, 22, 3), precedente: { ...durata(19, 20), passaggi: 20 }, pochiDati: false, perDataDelFatto: { conclusi: 10, mediaGiorni: 22, medianaGiorni: 21 } },
    IN_APPROVAZIONE: { passaggi: 3, periodo: durata(40, 3), pochiDati: true },
    TAR: { passaggi: 4, periodo: durata(120, 4, 2), pochiDati: true },
    STAND_BY: { passaggi: 6, periodo: durata(15, 6), pochiDati: false },
  },
  ["PROTOCOLLATO"]
);

beforeEach(() => vi.clearAllMocks());

describe("reading the time per state (§15.3–§15.4, D-194)", () => {
  it("days with one decimal, — when missing", () => {
    expect([giorni(24.5), giorni(1), giorni(null), giorni(3, true)]).toEqual(["24,5 giorni", "1 giorno", "—", "3 gg"]);
  });

  it("the slowest is the server's (ties included), worded without alarm", () => {
    expect(slowestSentence(DATA, "precedente")).toBe("Le pratiche restano più a lungo in PROTOCOLLATO: mediana 24,5 giorni (periodo precedente 19 giorni).");
    expect(slowestSentence(DATA, "anno")).toBe("Le pratiche restano più a lungo in PROTOCOLLATO: mediana 24,5 giorni.");
    const tie = stati({ ASSEGNATO: { periodo: durata(24, 10), passaggi: 10 }, PROTOCOLLATO: { periodo: durata(24, 10), passaggi: 10 } }, ["ASSEGNATO", "PROTOCOLLATO"]);
    expect(slowestSentence(tie, "precedente")).toBe("Le pratiche restano più a lungo in ASSEGNATO e PROTOCOLLATO: mediana 24 giorni.");
    expect(slowestSentence(stati({}, []), "precedente")).toBeNull();
  });

  it("external waits are said plainly, outside the operating phase", () => {
    expect(externalSentence(DATA)).toBe(
      "Attese fuori dal lavoro operativo: TAR (mediana 120 giorni, 2 in corso) e STAND-BY (mediana 15 giorni). Non entrano nei tempi delle fasi operative."
    );
  });
});

describe("StatiBlock", () => {
  it("operating states in the app's order, PIÙ LENTO without color, few data faded, «per data del fatto»; TAR apart", async () => {
    source.loadStati.mockResolvedValue(DATA);
    render(<StatiBlock filters={FILTERS} />);
    const block = await screen.findByTestId("andamento-stati");
    await within(block).findByTestId("andamento-piu-lento-frase");
    const rows = within(block).getAllByTestId(/^andamento-stato-/).map((r) => r.getAttribute("data-testid")!.replace("andamento-stato-", ""));
    expect(rows).toEqual(STATI_ATTIVITA.filter((s) => !ESTERNI.has(s)));
    expect(within(screen.getByTestId("andamento-stato-PROTOCOLLATO")).getByTestId("andamento-piu-lento")).toHaveTextContent("Più lento");
    expect(within(screen.getByTestId("andamento-stato-PROTOCOLLATO")).getByText("21 gg")).toBeInTheDocument();
    expect(within(screen.getByTestId("andamento-stato-IN_APPROVAZIONE")).getByText("40 gg*")).toHaveClass("text-muted-foreground");
    expect(within(block).getByText(/Meno di 5 passaggi/)).toBeInTheDocument();
    const ext = screen.getByTestId("andamento-esterni");
    expect(within(ext).getByTestId("andamento-stato-TAR")).toBeInTheDocument();
    expect(within(ext).queryByTestId("andamento-piu-lento")).not.toBeInTheDocument();
    expect(within(block).queryByTestId("andamento-stato-TAR")).not.toBeInTheDocument();
    expect(within(block).getByTestId("andamento-stati-csv")).toHaveAttribute("href", "/api/andamento/stati?format=csv");
    // TERMINATO and KO are where practices end: nothing "in corso" there (seen in the preview).
    expect((screen.getByTestId("andamento-stato-TERMINATO") as HTMLTableRowElement).cells[4]).toHaveTextContent("—");
  });

  it("the long period: median per state bucket by bucket, with its own CSV", async () => {
    source.loadStati.mockResolvedValue({
      ...DATA,
      serie: [
        { periodo: { from: "2026-08-01", to: "2026-08-31" }, perStato: { PROTOCOLLATO: { conclusi: 8, medianaGiorni: 22 } } },
        { periodo: { from: "2026-09-01", to: "2026-09-30" }, perStato: { PROTOCOLLATO: { conclusi: 2, medianaGiorni: 30 }, ASSEGNATO: { conclusi: 9, medianaGiorni: 5 } } },
      ],
    });
    render(<StatiBlock filters={FILTERS} />);
    const serie = await screen.findByTestId("andamento-stati-serie");
    const rows = within(serie).getAllByRole("row").map((r) => r.textContent);
    expect(rows).toEqual(["Statoago 26set 26", "ASSEGNATO—5 gg", "PROTOCOLLATO22 gg30 gg"]);
    expect(within(serie).getByText("30 gg")).toHaveClass("text-muted-foreground");
    expect(within(serie).getByTestId("andamento-stati-serie-csv")).toHaveAttribute("href", "/api/andamento/stati?format=csv&tabella=serie");
  });

  it("the box is the anchor of the assistant's source (#stati) and scrolls there once its data arrived", async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    window.history.replaceState(null, "", "/andamento#stati");
    source.loadStati.mockResolvedValue(DATA);
    render(<StatiBlock filters={FILTERS} />);
    const box = await screen.findByTestId("andamento-stati");
    expect(box).toHaveAttribute("id", "stati");
    await within(box).findByTestId("andamento-piu-lento-frase");
    expect(scroll).toHaveBeenCalledWith({ block: "start" });
    window.history.replaceState(null, "", "/");
  });

  it("a failed read shows why and Riprova; an empty period says so", async () => {
    source.loadStati.mockRejectedValueOnce(new ApiError("x", 500, {})).mockResolvedValueOnce(stati({}, []));
    render(<StatiBlock filters={FILTERS} />);
    fireEvent.click(await screen.findByTestId("andamento-stati-error-retry"));
    expect((await screen.findAllByText("Nessun passaggio di stato in questo periodo.")).length).toBeGreaterThan(0);
  });
});

describe("FermeBlock (§15.3, D-193)", () => {
  const ferma = (id: string, giorniFermi: number, extra: Partial<AndamentoFermaDTO> = {}): AndamentoFermaDTO => ({
    practiceId: id, codiceSito: `IL-${id}`, nomeSito: `Sito ${id}`, templateId: "ILIAD", stato: "PROTOCOLLATO", gruppoStato: "OPERATIVO",
    since: "2026-08-02T09:00:00+02:00", giorni: giorniFermi, fromImport: false, gruppi: ["PM_PERMESSI", "UT_PE"], canOpen: true, ...extra,
  });
  const ferme = (items: AndamentoFermaDTO[], extra: Partial<AndamentoFermeDTO> = {}): AndamentoFermeDTO => ({
    asOf: "2026-10-11T10:00:00+02:00", dataFrom: "2026-06-03", query: { templateId: null, stato: null }, soglia: 30, totale: items.length,
    perStato: [{ stato: "PROTOCOLLATO", gruppoStato: "OPERATIVO", count: items.length }], perCliente: [{ templateId: "ILIAD", count: items.length }],
    items, truncated: false, nonDatabili: { totale: 0, perStato: [] }, ...extra,
  });

  it("summary by state and client, the longest first, groups in charge, a link only if the user can already open it; import ones apart", async () => {
    source.loadFerme.mockResolvedValue(ferme([ferma("a", 40), ferma("b", 70, { canOpen: false }), ferma("c", 200, { fromImport: true })]));
    render(<FermeBlock filters={FILTERS} labelOf={(t) => t} />);
    const block = await screen.findByTestId("andamento-ferme");
    expect(await within(block).findByText("Pratiche ferme da più di 30 giorni (3)")).toBeInTheDocument();
    expect(within(block).getByTestId("andamento-ferme-per-stato")).toHaveTextContent("PROTOCOLLATO 3");
    const rows = within(screen.getByTestId("andamento-ferme-elenco")).getAllByRole("row").slice(1) as HTMLTableRowElement[];
    expect(rows.map((r) => r.cells[0].textContent)).toEqual(["IL-b", "IL-a"]);
    expect(within(rows[0]).queryByRole("link")).not.toBeInTheDocument();
    expect(within(rows[1]).getByRole("link", { name: "IL-a" })).toHaveAttribute("href", "/pratiche/a");
    expect(rows[1].cells[6]).toHaveTextContent("PM/Permessi, UT/PE");
    expect(screen.getByTestId("andamento-ferme-import")).toHaveTextContent("Di cui ferme da import (1)");
    // The CSV has them all, without the 200 limit: said next to the link.
    expect(within(block).getByTestId("andamento-ferme-csv")).toHaveTextContent("Esporta CSV (tutte le 3 pratiche)");
  });

  it("practices whose entry cannot be dated are counted, not hidden", async () => {
    source.loadFerme.mockResolvedValue(ferme([], { nonDatabili: { totale: 3, perStato: [{ stato: "ASSEGNATO", count: 2 }, { stato: "PROTOCOLLATO", count: 1 }] } }));
    render(<FermeBlock filters={FILTERS} labelOf={(t) => t} />);
    expect(await screen.findByTestId("andamento-ferme-non-databili")).toHaveTextContent(
      "3 pratiche senza data d'ingresso nello stato: ASSEGNATO 2 · PROTOCOLLATO 1."
    );
  });

  it("over 200: the CSV has them all; first 10, then «Mostra tutte»", async () => {
    source.loadFerme.mockResolvedValue(ferme(Array.from({ length: 12 }, (_, i) => ferma(String(i), 31 + i)), { totale: 230, truncated: true }));
    render(<FermeBlock filters={FILTERS} labelOf={(t) => t} />);
    expect(await screen.findByText("Pratiche ferme da più di 30 giorni (230)")).toBeInTheDocument();
    expect(screen.getByText(/l'export CSV le comprende tutte/)).toBeInTheDocument();
    expect(within(screen.getByTestId("andamento-ferme-elenco")).getAllByRole("row")).toHaveLength(11);
    fireEvent.click(screen.getByTestId("andamento-ferme-elenco-tutte"));
    expect(within(screen.getByTestId("andamento-ferme-elenco")).getAllByRole("row")).toHaveLength(13);
  });
});
