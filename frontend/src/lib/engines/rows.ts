/**
 * Righe create o tolte dal sistema (B5a, D-126). PURO.
 * - Vincoli (D-35, D-99, D-103): un vincolo PRESENTE crea UNA voce Ente collegata e bloccata, col nome dell'ente del
 *   vincolo; il nome generato si ricorda nei metadati (generatedName). Quando l'ente del vincolo cambia o viene
 *   scelto: voce intatta (nome ancora quello generato, nessun altro dato) → nome aggiornato sulla stessa riga;
 *   voce lavorata o nome personalizzato → nessuna sovrascrittura, solo un avviso (M-03). Quando il vincolo non è più
 *   PRESENTE la voce si toglie solo se è vuota, cioè con il nome ancora quello generato e nessun altro dato (M-02),
 *   altrimenti resta, sbloccata e con un avviso.
 * - ARPA (D-93.3): la prima compilazione di Ripresentazione Pratica su una riga apre UNA nuova riga ARPA vuota; il
 *   consumo si segna sulla riga padre (arpaOpened), così il figlio eliminato non si riapre da solo (§3.2).
 */
import type { FieldValue, SelectValue, TemplateDTO, TemplateId } from "@/lib/contract";
import { isEmpty } from "@/lib/engines/conditions";
import { ENGINE_BINDINGS, type EngineRow, type EngineRowMetadata, type EngineSnapshot } from "@/lib/engines/formulas";

export const ENTE_WARNING = "Il vincolo d'origine non è più Presente";
export const enteChangedWarning = (name: string | null) => `L'ente del vincolo è cambiato in ${name ?? "nessun ente"}: verifica la voce Ente`;

export interface RowsContext {
  templateId: TemplateId;
  template: TemplateDTO;
  before: EngineSnapshot;
  after: EngineSnapshot;
  /** Etichetta leggibile di un ente (lista dei vincoli, defaultEnteLabel); null se assente. */
  enteLabel: (ente: SelectValue | null) => string | null;
  newRowId: () => string;
}

export interface NewRow {
  groupKey: string;
  rowId: string;
  ordinal: number;
  values: Record<string, FieldValue>;
  metadata: EngineRowMetadata;
  reason: string;
}

export interface RowsResult {
  add: NewRow[];
  remove: Array<{ groupKey: string; rowId: string; reason: string }>;
  /** Metadati (undefined = togliere la chiave) ed eventuali valori di SISTEMA da impostare su righe esistenti. */
  update: Array<{ groupKey: string; rowId: string; metadata: Partial<EngineRowMetadata>; values?: Record<string, FieldValue>; reason: string }>;
}

const textOf = (v: FieldValue | undefined): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

export function computeRows(ctx: RowsContext): RowsResult {
  const out: RowsResult = { add: [], remove: [], update: [] };
  const b = ENGINE_BINDINGS.templates[ctx.templateId];
  const present = ENGINE_BINDINGS.codes.vincoloPresente;
  const nextOrdinal = (group: string) =>
    Math.max(0, ...(ctx.after.repeats[group] ?? []).map((r) => r.ordinal), ...out.add.filter((a) => a.groupKey === group).map((a) => a.ordinal)) + 1;

  /* Vincoli → voci Ente */
  const enti = ctx.after.repeats.ENTE ?? [];
  for (const v of ctx.after.repeats.VINCOLI ?? []) {
    const isPresent = v.constraint?.stato?.code === present;
    const linked = enti.find((e) => e.metadata?.origin?.groupKey === "VINCOLI" && e.metadata.origin.rowId === v.rowId);
    const name = ctx.enteLabel(v.constraint?.ente ?? null);
    const code = v.constraint?.code;

    if (isPresent && !linked) {
      out.add.push({
        groupKey: "ENTE",
        rowId: ctx.newRowId(),
        ordinal: nextOrdinal("ENTE"),
        values: name ? { [b.enteNome]: name } : {},
        metadata: { origin: { groupKey: "VINCOLI", rowId: v.rowId }, locked: true, generatedName: name },
        reason: `Vincolo ${code} Presente: voce Ente creata (D-35)`,
      });
      continue;
    }
    if (!linked) continue;

    const meta = linked.metadata ?? {};
    // Voci create prima di M-02 non ricordano il nome generato: vale l'etichetta dell'ente del vincolo PRIMA di questo
    // salvataggio (se il vincolo non c'era, quella attuale).
    const before = ctx.before.repeats.VINCOLI?.find((x) => x.rowId === v.rowId);
    const generated = meta.generatedName !== undefined ? meta.generatedName : before ? ctx.enteLabel(before.constraint?.ente ?? null) : name;
    const current = textOf(linked.values[b.enteNome]);
    const nameIsGenerated = current === (generated ?? null);
    const otherData = Object.entries(linked.values).some(([flowId, val]) => flowId !== b.enteNome && !isEmpty(val));
    const intact = nameIsGenerated && !otherData;

    if (isPresent) {
      const patch: Partial<EngineRowMetadata> = {};
      let values: Record<string, FieldValue> | undefined;
      const reasons: string[] = [];
      if (!meta.locked) patch.locked = true;
      if ((name ?? null) !== (generated ?? null)) {
        if (intact) {
          // M-03: voce intatta → stesso rowId, nome aggiornato e ricordato.
          values = { [b.enteNome]: name };
          patch.generatedName = name;
          if (meta.warning) patch.warning = undefined;
          reasons.push(`Vincolo ${code}: ente cambiato, nome della voce Ente aggiornato (D-103)`);
        } else if (current === (name ?? null)) {
          // L'utente ha già allineato il nome al nuovo ente: si ricorda come generato e si toglie l'avviso.
          patch.generatedName = name;
          if (meta.warning) patch.warning = undefined;
          reasons.push(`Vincolo ${code}: nome della voce Ente già allineato all'ente`);
        } else if (meta.warning !== enteChangedWarning(name)) {
          patch.warning = enteChangedWarning(name);
          reasons.push(`Vincolo ${code}: ente cambiato su una voce Ente con dati, nessuna sovrascrittura (D-126 M-03)`);
        }
      } else if (meta.warning === ENTE_WARNING) {
        patch.warning = undefined;
        reasons.push(`Vincolo ${code} di nuovo Presente`);
      }
      if (Object.keys(patch).length || values) {
        out.update.push({ groupKey: "ENTE", rowId: linked.rowId, metadata: patch, ...(values ? { values } : {}), reason: reasons.join("; ") || `Vincolo ${code} di nuovo Presente` });
      }
      continue;
    }

    // Vincolo non più PRESENTE.
    if (intact) {
      out.remove.push({ groupKey: "ENTE", rowId: linked.rowId, reason: `Vincolo ${code} non più Presente: voce Ente vuota tolta (D-35)` });
    } else if (meta.locked || meta.warning !== ENTE_WARNING) {
      out.update.push({ groupKey: "ENTE", rowId: linked.rowId, metadata: { locked: false, warning: ENTE_WARNING }, reason: `Vincolo ${code} non più Presente: voce Ente con dati conservata e segnalata (D-35)` });
    }
  }

  /* Ripresentazione Pratica → nuova riga ARPA, una sola volta per riga (§3.2) */
  const arpa = ctx.after.repeats.ARPA ?? [];
  for (const r of arpa) {
    const prev = ctx.before.repeats.ARPA?.find((x) => x.rowId === r.rowId);
    const firstFill = isEmpty(prev?.values[b.arpa.ripresentazione]) && !isEmpty(r.values[b.arpa.ripresentazione]);
    const already = r.metadata?.arpaOpened || arpa.some((x) => x.metadata?.origin?.groupKey === "ARPA" && x.metadata.origin.rowId === r.rowId);
    if (firstFill && !already) {
      out.add.push({
        groupKey: "ARPA",
        rowId: ctx.newRowId(),
        ordinal: nextOrdinal("ARPA"),
        values: {},
        metadata: { origin: { groupKey: "ARPA", rowId: r.rowId } },
        reason: "Ripresentazione Pratica: nuovo ciclo ARPA (D-93)",
      });
      out.update.push({ groupKey: "ARPA", rowId: r.rowId, metadata: { arpaOpened: true }, reason: "Ripresentazione Pratica: ciclo successivo aperto (una volta per riga)" });
    }
  }
  return out;
}

export type { EngineRow };
