import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import type { Passo } from "@/components/andamento/andamento-url";
import type { AndamentoPeriodDTO } from "@/components/andamento/types";
import type { Bucket } from "@/components/andamento/time-chart";

/** Buckets of charts and series: "ott 25" / "ottobre 2025" by month, "05/10" / "settimana dal 05/10/2026" by week. */
export function bucketsOf(periods: AndamentoPeriodDTO[], passo: Passo): Bucket[] {
  return periods.map((p) => {
    const d = parseISO(p.from);
    return passo === "mese"
      ? { key: p.from, label: format(d, "LLL yy", { locale: it }), full: format(d, "LLLL yyyy", { locale: it }) }
      : { key: p.from, label: format(d, "dd/MM"), full: `settimana dal ${format(d, "dd/MM/yyyy")}` };
  });
}
