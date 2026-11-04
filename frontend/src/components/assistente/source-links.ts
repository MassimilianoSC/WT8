import { linkHref } from "@/components/notifiche/notifications-source";
import { GROUP_LABEL, STATO_LABEL } from "@/components/pratiche/labels";
import { listHref } from "@/components/pratiche/list-url";
import { statsHref, workloadHref } from "@/components/statistiche/stats-url";
import { periodText } from "@/components/assistente/assistant-errors";
import { andamentoHref } from "@/components/andamento/andamento-url";
import type { AssistantSourceDTO } from "@/components/assistente/types";

/**
 * Links and lines of the assistant's sources (contract §13.3: the server
 * sends no href). The list and Statistiche read their filters from the
 * address (list-url.ts, stats-url.ts), so the link opens the same view; the
 * source line still spells the filters out.
 */

export const QUESTION_PARAM = "domanda";

export function sourceHref(source: AssistantSourceDTO): string {
  switch (source.kind) {
    case "PRACTICE":
      return linkHref({
        practiceId: source.practiceId,
        iteration: source.iteration,
        sectionKey: source.sectionKey,
        occurrenceKey: source.occurrenceKey,
        flowId: source.flowId,
        rowId: source.rowId,
      });
    case "LIST":
      return listHref(source.query);
    case "STATS":
      return statsHref(source.query);
    case "WORKLOAD":
      return workloadHref(source.query);
    case "QUERY":
      return `/assistente?${QUESTION_PARAM}=${encodeURIComponent(source.question)}`;
    case "ANDAMENTO": {
      // D-198: Andamento with the same filters, scrolled to the block (each block box has id = its name).
      const q = source.query;
      return `${andamentoHref({ templateId: q.templateId, from: q.from, to: q.to, passo: q.granularity === "week" ? "settimana" : "mese", confronto: "precedente" })}#${source.blocco}`;
    }
  }
}

const tpl = (t: string) => t.replace(/_/g, " / ");

/** Names of the Andamento blocks, as their boxes on the page. */
export const ANDAMENTO_BLOCCO_LABEL: Record<Extract<AssistantSourceDTO, { kind: "ANDAMENTO" }>["blocco"], string> = {
  stati: "Tempo per stato",
  gruppi: "Tempo per gruppo",
  ferme: "Pratiche ferme",
  flussi: "Entrate e uscite",
  rilavorazioni: "Rilavorazioni",
  scadenze: "Scadenze e alert",
};

/** Detail of the source after its label: the filters spelled out. */
export function sourceDetail(source: AssistantSourceDTO): string {
  switch (source.kind) {
    case "PRACTICE":
      // The label may already name the site (e.g. "IL-TO-0001 — Torino Lingotto"): do not repeat it.
      return [source.codiceSito, source.nomeSito]
        .filter((part) => !source.label.includes(part))
        .concat(tpl(source.templateId), `iterazione ${source.iteration}`)
        .join(" · ");
    case "LIST": {
      const q = source.query;
      const parts: string[] = [];
      if (q.templateId) parts.push(tpl(q.templateId));
      if (q.stato) parts.push(`stato ${STATO_LABEL[q.stato] ?? q.stato}`);
      if (q.q) parts.push(`ricerca "${q.q}"`);
      if (q.from || q.to) parts.push(`creazione ${periodText({ from: q.from ?? q.to!, to: q.to ?? q.from! })}`);
      if (q.archived) parts.push("archivio");
      return parts.join(" · ");
    }
    case "STATS": {
      const q = source.query;
      return [q.templateId ? tpl(q.templateId) : "tutti i clienti", q.from && q.to ? periodText({ from: q.from, to: q.to }) : ""]
        .filter(Boolean)
        .join(" · ");
    }
    case "WORKLOAD":
      return [tpl(source.query.templateId), source.query.group ? GROUP_LABEL[source.query.group] : "tutti i gruppi", "Carichi di lavoro"].join(" · ");
    case "QUERY":
      return "Apri come nuova domanda";
    case "ANDAMENTO": {
      // "Tempo per stato · tutti i clienti · dal 01/11/2025 al 11/10/2026"; the block name only if the label lacks it.
      // The stopped practices are today's picture: their period is only the default one.
      const blocco = ANDAMENTO_BLOCCO_LABEL[source.blocco];
      const q = source.query;
      return [
        source.label.toLowerCase().includes(blocco.toLowerCase()) ? "" : blocco,
        q.templateId ? tpl(q.templateId) : "tutti i clienti",
        source.blocco === "ferme" ? "situazione di oggi" : periodText({ from: q.from, to: q.to }),
      ]
        .filter(Boolean)
        .join(" · ");
    }
  }
}

/**
 * The model's text is never a source of links (project §9, I05): Markdown links
 * and images keep only their visible text, autolinks lose their brackets, and
 * nothing becomes an <a>. A link whose text is a bare number is read as the
 * reference [n], the only clickable part, which points to the server's source.
 *   "[Roma Ostiense (TF-RM-0001)](1)" → "Roma Ostiense (TF-RM-0001)"
 *   "[2](https://x.it)" → "[2]"   "<javascript:alert(1)>" → "javascript:alert(1)"
 */
export function withoutModelLinks(text: string): string {
  return text
    .replace(/!?\[([^\]\n]*)\]\(([^()\n]*(?:\([^()\n]*\)[^()\n]*)*)\)/g, (_m, label: string) =>
      /^\s*\d{1,3}\s*$/.test(label) ? `[${label.trim()}]` : label
    )
    .replace(/<((?:https?|javascript|mailto|data|vbscript|file):[^>\s]*)>/gi, "$1");
}

/** Splits answer text on the [n] references, for links to source n (after withoutModelLinks). */
export function splitCitations(raw: string): Array<string | number> {
  const text = withoutModelLinks(raw);
  const out: Array<string | number> = [];
  const re = /\[(\d{1,3})\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(Number(m[1]));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
