import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { niceMax, TimeChart, type Bucket } from "@/components/andamento/time-chart";

const BUCKETS: Bucket[] = [
  { key: "2026-07", label: "lug 26", full: "luglio 2026" },
  { key: "2026-08", label: "ago 26", full: "agosto 2026" },
  { key: "2026-09", label: "set 26", full: "settembre 2026" },
];

describe("TimeChart (UX note §4)", () => {
  it("a round top for the one axis", () => {
    expect([niceMax(0), niceMax(7), niceMax(12), niceMax(38), niceMax(130)]).toEqual([1, 10, 20, 50, 200]);
  });

  it("columns: one per series and month, a legend for two series, month and values on hover", () => {
    render(
      <TimeChart
        title="Entrate e uscite, luglio – settembre 2026"
        buckets={BUCKETS}
        series={[
          { key: "in", label: "Entrate", values: [12, 8, 15] },
          { key: "out", label: "Uscite", values: [10, 0, 14], look: "outline" },
        ]}
        testId="flussi"
      />
    );
    expect(screen.getByRole("img", { name: "Entrate e uscite, luglio – settembre 2026" })).toBeInTheDocument();
    expect(within(screen.getByLabelText("Legenda")).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Entrate", "Uscite"]);
    const buckets = screen.getAllByTestId("flussi-bucket");
    expect(buckets).toHaveLength(3);
    expect(buckets[0].querySelector("title")).toHaveTextContent("luglio 2026: Entrate 12 · Uscite 10");
    // A zero draws no column; the outline series is outlined, never colored.
    expect(buckets[1].querySelectorAll("rect.fill-foreground, rect.stroke-foreground")).toHaveLength(1);
    expect(buckets[2].querySelector("rect.stroke-foreground")).not.toBeNull();
    expect(screen.getByTestId("flussi-svg").innerHTML).not.toMatch(/#[0-9a-f]{3,6}|rgb\(/i);
  });

  it("columns are wide enough for their labels: month labels never overlap (seen in the preview)", () => {
    render(<TimeChart title="t" kind="line" buckets={BUCKETS} series={[{ key: "b", label: "B", values: [1, 2, 3] }]} testId="w" />);
    const labels = [...screen.getByTestId("w-svg").querySelectorAll("text")].filter((t) => /\d{2}$/.test(t.textContent ?? "") && / /.test(t.textContent ?? ""));
    const xs = labels.map((t) => Number(t.getAttribute("x")));
    // "lug 26" is 6 characters, ~6 px each at 10 px mono: at least ~37 px between centres.
    expect(xs[1] - xs[0]).toBeGreaterThanOrEqual(46);
  });

  it("'Mostra come tabella' gives the same numbers, missing ones as —", () => {
    render(
      <TimeChart title="Arretrato a fine mese" kind="line" buckets={BUCKETS} series={[{ key: "b", label: "Arretrato", values: [120, null, 131] }]} testId="arretrato" />
    );
    expect(screen.queryByLabelText("Legenda")).not.toBeInTheDocument();
    expect(screen.getByTestId("arretrato-svg").querySelectorAll("polyline")).toHaveLength(2);
    fireEvent.click(screen.getByTestId("arretrato-toggle"));
    const rows = within(screen.getByTestId("arretrato-table")).getAllByRole("row").map((r) => r.textContent);
    expect(rows).toEqual(["PeriodoArretrato", "luglio 2026120", "agosto 2026—", "settembre 2026131"]);
    expect(screen.getByTestId("arretrato-toggle")).toHaveTextContent("Mostra come grafico");
  });
});
