/**
 * get_andamento (D-198): i blocchi della pagina Andamento per l'assistente, per ADMIN e Direzione a interruttore acceso.
 * Stessa porta (requireAndamento dentro getBlocco), stessa cache e stessi numeri della pagina; il risultato per il modello
 * è ridotto (ferme al massimo 20, serie al massimo 20 secchi) e non contiene mai persone. «Più lenti» e «pochi dati» li
 * calcola il server: il modello li riporta, non li decide.
 */
import { z } from "zod";
import type {
  AndamentoFermeDTO,
  AndamentoFlussiDTO,
  AndamentoGruppiDTO,
  AndamentoQueryDTO,
  AndamentoRilavorazioniDTO,
  AndamentoScadenzeDTO,
  AndamentoStatiDTO,
} from "@/lib/contract";
import { andamentoEnabled, canReadAndamento } from "@/lib/features";
import { HttpError } from "@/lib/http-error";
import { getBlocco } from "@/services/andamento";
import { parseAndamentoQuery } from "@/services/andamento/period";
import { fitResult, isoDateSchema, MAX_ITEMS, templateIdSchema, ToolError, type ToolContext, type ToolResult } from "./common";

const BLOCCHI = ["stati", "ferme", "flussi", "rilavorazioni", "scadenze", "gruppi"] as const;
type BloccoTool = (typeof BLOCCHI)[number];

export const getAndamentoSchema = z.strictObject({
  blocco: z.enum(BLOCCHI),
  templateId: templateIdSchema.optional(),
  period: z.strictObject({ from: isoDateSchema, to: isoDateSchema }).optional(),
  granularity: z.enum(["week", "month"]).optional(),
});

/** Solo a interruttore acceso e per ADMIN o Direzione (la stessa porta della pagina). */
export const canUseAndamento = (ctx: Pick<ToolContext, "user">) => andamentoEnabled() && canReadAndamento(ctx.user);

const NOMI: Record<BloccoTool, string> = {
  stati: "tempo per stato",
  ferme: "pratiche ferme",
  flussi: "entrate e uscite",
  rilavorazioni: "rilavorazioni",
  scadenze: "scadenze e alert",
  gruppi: "tempo per gruppo",
};

const itDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

export async function getAndamentoTool(ctx: ToolContext, args: z.infer<typeof getAndamentoSchema>): Promise<ToolResult> {
  const params = new URLSearchParams();
  if (args.templateId) params.set("templateId", args.templateId);
  if (args.blocco !== "ferme") {
    if (args.period) {
      params.set("from", args.period.from);
      params.set("to", args.period.to);
    }
    if (args.granularity) params.set("granularity", args.granularity);
  }
  let dto: unknown;
  try {
    dto = await getBlocco(ctx.db, ctx.user, args.blocco, params, ctx.now);
  } catch (e) {
    if (e instanceof HttpError && (e.status === 403 || e.status === 404)) throw new ToolError("FORBIDDEN", "Andamento non consentito a questo utente");
    if (e instanceof HttpError && e.status === 400) throw new ToolError("INVALID", e.message);
    throw e;
  }
  // Fonte: la pagina con gli stessi filtri (le ferme non hanno periodo: quello predefinito della pagina).
  const query: AndamentoQueryDTO =
    args.blocco === "ferme" ? { ...parseAndamentoQuery(new URLSearchParams(), ctx.now), templateId: args.templateId ?? null } : (dto as AndamentoStatiDTO).query;
  const fonte = ctx.sources.add({
    kind: "ANDAMENTO",
    label: `Andamento: ${NOMI[args.blocco]} (${query.templateId ?? "tutti i clienti"}${args.blocco === "ferme" ? ", oggi" : `, ${itDate(query.from)}–${itDate(query.to)}`})`,
    blocco: args.blocco,
    query,
    readAt: ctx.now.toISOString(),
  });
  const base = { asOf: ctx.now.toISOString(), complete: true, truncated: false };
  switch (args.blocco) {
    case "stati": {
      const d = dto as AndamentoStatiDTO;
      const items = d.righe
        .filter((r) => r.passaggi || r.periodo.conclusi || r.periodo.inCorso)
        .map((r) => ({
          fonte,
          stato: r.stato,
          tipo: r.gruppoStato === "ESTERNO" ? "attesa esterna" : "operativo",
          passaggi: r.passaggi,
          conclusi: r.periodo.conclusi,
          medianaGiorni: r.periodo.medianaGiorni,
          mediaGiorni: r.periodo.mediaGiorni,
          inCorso: r.periodo.inCorso,
          etaMedianaInCorsoGiorni: r.periodo.etaMedianaInCorsoGiorni,
          medianaPeriodoPrecedente: r.precedente.medianaGiorni,
          medianaPerDataDelFatto: r.perDataDelFatto?.medianaGiorni ?? null,
          pochiDati: r.pochiDati,
          piuLento: d.piuLenti.includes(r.stato),
        }));
      return fitResult(
        {
          ...base,
          selection: { blocco: "stati", query: d.query, datiDal: d.dataFrom, piuLenti: d.piuLenti, fonteInsieme: fonte },
          items,
          note: `Tempo complessivo delle terminate nel periodo (solo stati operativi): mediana ${d.complessivo.medianaGiorni ?? "n.d."} giorni su ${d.complessivo.conclusi} pratiche (periodo precedente ${d.complessivo.medianaGiorni === null ? "n.d." : d.complessivoPrecedente.medianaGiorni ?? "n.d."}). Le permanenze in corso non sono concluse.`,
        },
        8000
      );
    }
    case "ferme": {
      const d = dto as AndamentoFermeDTO;
      const shown = d.items.slice(0, MAX_ITEMS);
      return fitResult(
        {
          ...base,
          selection: { blocco: "ferme", soglia: d.soglia, totale: d.totale, nonDatabili: d.nonDatabili, perStato: d.perStato, perCliente: d.perCliente, fonteInsieme: fonte },
          items: shown.map((i) => ({ fonte, codiceSito: i.codiceSito, nomeSito: i.nomeSito, cliente: i.templateId, stato: i.stato, dal: i.since.slice(0, 10), giorni: i.giorni, daImport: i.fromImport, gruppiAbilitati: i.gruppi })),
          total: d.totale,
          complete: shown.length === d.totale,
          truncated: shown.length < d.totale,
          ...(shown.length < d.totale ? { omittedReason: "ROWS" as const, note: `Mostrate ${shown.length} di ${d.totale} pratiche ferme (le più ferme).` } : {}),
        },
        8000
      );
    }
    case "flussi": {
      const d = dto as AndamentoFlussiDTO;
      const serie = d.serie.slice(-MAX_ITEMS);
      return fitResult(
        {
          ...base,
          selection: { blocco: "flussi", query: d.query, attiveOra: d.attiveOra, arretratoInizio: d.arretratoInizio, periodo: d.periodo, periodoPrecedente: d.precedente, fonteInsieme: fonte },
          items: serie.map((s) => ({ fonte, ...s })),
          complete: serie.length === d.serie.length,
          truncated: serie.length < d.serie.length,
          note: "Arretrato: inizio + entrate + entrateImport + rientri + ripristinate − terminate − ko − archiviate = fine.",
        },
        8000
      );
    }
    case "rilavorazioni": {
      const d = dto as AndamentoRilavorazioniDTO;
      return fitResult(
        {
          ...base,
          selection: { blocco: "rilavorazioni", query: d.query, periodo: d.periodo, periodoPrecedente: d.precedente, fonteInsieme: fonte },
          items: [...d.daStato.map((x) => ({ fonte, tipo: "stato d'origine", ...x })), ...d.ritorni.slice(0, 10).map((x) => ({ fonte, tipo: "ritorno all'indietro", ...x }))].slice(0, MAX_ITEMS),
        },
        8000
      );
    }
    case "scadenze": {
      const d = dto as AndamentoScadenzeDTO;
      return fitResult(
        {
          ...base,
          selection: { blocco: "scadenze", query: d.query, periodo: d.periodo, periodoPrecedente: d.precedente, forecastScadutiAperti: d.forecastScadutiAperti, fonteInsieme: fonte },
          items: d.perMilestone.slice(0, MAX_ITEMS).map((m) => ({ fonte, ...m })),
          truncated: d.perMilestone.length > MAX_ITEMS,
          complete: d.perMilestone.length <= MAX_ITEMS,
        },
        8000
      );
    }
    case "gruppi": {
      const d = dto as AndamentoGruppiDTO;
      return fitResult(
        {
          ...base,
          selection: { blocco: "gruppi", query: d.query, fonteInsieme: fonte },
          items: d.righe.map((r) => ({ fonte, gruppo: r.group, assegnazioni: r.assegnazioni, perPartire: r.perPartire, primaConsegna: r.perConsegnare, pochiDati: r.pochiDati })),
        },
        8000
      );
    }
  }
}
