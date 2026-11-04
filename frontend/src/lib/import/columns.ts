/**
 * Riconoscimento delle colonne di un foglio d'import (contratto §12, D-30, D-49). PURO.
 * Un'intestazione corrisponde a un campo se è il suo flowId ("F012") oppure l'etichetta ESATTA (spazi agli estremi
 * esclusi) di un'occorrenza, quando quell'etichetta è unica fra tutte le occorrenze del template (D-30: nessun
 * confronto senza maiuscole per decidere l'identità). Importabili solo i MASTER non ripetibili e non calcolati.
 */
import type { FieldOccurrenceDTO, TemplateDTO } from "@/lib/contract";
import { GROUP_LABELS } from "@/lib/practice/labels";

export interface ImportColumn {
  header: string;
  /** Indice della colonna nel foglio. */
  index: number;
  flowId: string | null;
  /** Motivo per cui la colonna non si importa, o perché non è riconosciuta (v0.2.2). */
  note?: string;
  /** true = si importa. */
  importable: boolean;
}

/** Motivo per cui un'occorrenza non è importabile; null = importabile. */
export function notImportable(o: Pick<FieldOccurrenceDTO, "kind" | "computed" | "repeatGroup" | "ownerGroup">): string | null {
  if (o.kind === "MIRROR") return `mirror: si compila in ${GROUP_LABELS[o.ownerGroup]}`;
  if (o.computed) return "campo calcolato";
  if (o.repeatGroup === "VINCOLI") return "tabella Vincoli";
  if (o.repeatGroup) return "gruppo ripetibile";
  return null;
}

export function mapColumns(template: Pick<TemplateDTO, "occurrences" | "transversal">, headers: ReadonlyArray<string>): ImportColumn[] {
  const labelCount = new Map<string, number>();
  for (const o of [...template.occurrences, ...template.transversal]) labelCount.set(o.label.trim(), (labelCount.get(o.label.trim()) ?? 0) + 1);
  const masters = new Map(template.occurrences.filter((o) => o.kind === "MASTER" && o.flowId).map((o) => [o.flowId!, o]));
  const seen = new Map<string, number>();

  return headers.map((raw, index) => {
    const header = String(raw ?? "").trim();
    if (!header) return { header, index, flowId: null, importable: false, note: "intestazione vuota" };
    const transversal = template.transversal.find((o) => o.label.trim() === header);
    if (transversal) return { header, index, flowId: null, importable: false, note: "campo trasversale: non si importa" };

    let occ: FieldOccurrenceDTO | undefined;
    if (/^F\d{3}$/.test(header)) occ = masters.get(header);
    else {
      const n = labelCount.get(header) ?? 0;
      if (n > 1) return { header, index, flowId: null, importable: false, note: "etichetta ripetuta nel template: usa il flowId come intestazione (D-30)" };
      if (n === 1) {
        const o = template.occurrences.find((x) => x.label.trim() === header)!;
        occ = o.flowId ? masters.get(o.flowId) ?? o : o;
        if (o.kind === "MIRROR") return { header, index, flowId: o.flowId, importable: false, note: notImportable(o)! };
      }
    }
    if (!occ || !occ.flowId) return { header, index, flowId: null, importable: false, note: "intestazione non riconosciuta" };
    const why = notImportable(occ);
    if (why) return { header, index, flowId: occ.flowId, importable: false, note: why };
    const dup = seen.get(occ.flowId);
    if (dup !== undefined) return { header, index, flowId: occ.flowId, importable: false, note: `colonna ripetuta: vale la colonna ${dup + 1}` };
    seen.set(occ.flowId, index);
    return { header, index, flowId: occ.flowId, importable: true };
  });
}
