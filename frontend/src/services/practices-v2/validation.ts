/**
 * Controllo dei valori sulle liste (B5b, D-106): i codici di SELECT/MULTISELECT devono esistere nella lista del
 * gestore (o comune) ed essere attivi; i codici utente devono essere utenti attivi con un'appartenenza
 * (template + ruolo) adatta (D-39). Un codice già salvato in quel campo resta valido anche se nel frattempo è
 * stato disattivato. ISTAT: il codice deve esistere ed essere coerente col genitore (Regione → Provincia → Comune).
 */
import { ObjectId } from "mongodb";
import type { FieldOccurrenceDTO, FieldValue, TemplateId } from "@/lib/contract";
import { HttpError } from "@/lib/http-error";
import { istatParentOf } from "@/lib/istat/service";
import { listCodesOf } from "@/lib/practice/normalize";
import { store } from "@/lib/store/db";
import type { OperationContext } from "@/lib/store/transaction";

export interface ListCheck {
  occ: Pick<FieldOccurrenceDTO, "label" | "list" | "dataType">;
  value: FieldValue;
  /** Valore salvato prima della modifica: i suoi codici restano ammessi. */
  previous?: FieldValue;
}

export async function assertValuesInLists(ctx: Pick<OperationContext, "db" | "session">, templateId: TemplateId, checks: ListCheck[]): Promise<void> {
  const listCache = new Map<string, Map<string, boolean> | null>();
  for (const c of checks) {
    const list = c.occ.list;
    if (!list) continue;
    const kept = new Set(c.previous === undefined ? [] : listCodesOf(c.occ, c.previous));
    const codes = listCodesOf(c.occ, c.value).filter((x) => !kept.has(x));
    if (codes.length === 0) continue;

    if (list.kind === "USERS") {
      const ids = codes.map((x) => new ObjectId(x));
      const ok = await store.users(ctx.db).countDocuments(
        {
          _id: { $in: ids },
          status: "active",
          memberships: { $elemMatch: { templateId, ...(list.userRole ? { role: list.userRole } : {}) } },
        },
        { session: ctx.session }
      );
      if (ok !== ids.length) throw new HttpError(`${c.occ.label}: utente non assegnabile`, 422);
      continue;
    }
    if (list.kind === "ISTAT") {
      // Solo l'esistenza dei codici nuovi; la parentela si controlla sul risultato finale (assertIstatCascade).
      for (const code of codes) {
        const parent = istatParentOf(list.listId, code);
        if (parent === "NOT_LOADED") throw new HttpError("Dataset ISTAT non caricato", 503);
        if (parent === undefined) throw new HttpError(`${c.occ.label}: codice ISTAT ${code} inesistente`, 422);
      }
      continue;
    }

    if (!listCache.has(list.listId)) {
      const docs = await store.lists(ctx.db)
        .find({ listId: list.listId, templateId: { $in: [templateId, null] } }, { session: ctx.session, projection: { templateId: 1, items: 1 } })
        .toArray();
      const doc = docs.find((d) => d.templateId === templateId) ?? docs[0];
      listCache.set(list.listId, doc ? new Map(doc.items.map((i) => [i.code, i.active])) : null);
    }
    const items = listCache.get(list.listId);
    if (!items) throw new HttpError(`${c.occ.label}: lista ${list.listId} non disponibile`, 422);
    for (const code of codes) {
      if (!items.has(code)) throw new HttpError(`${c.occ.label}: valore ${code} non presente nella lista`, 422);
      if (!items.get(code)) throw new HttpError(`${c.occ.label}: valore ${code} disattivato`, 422);
    }
  }
}

/**
 * Cascata ISTAT sul risultato FINALE (D-132 P-02): ogni campo ISTAT non vuoto con un genitore (Provincia → Regione,
 * Comune → Provincia) richiede il genitore non vuoto e coerente, figli già salvati compresi. Si controllano le catene
 * toccate dal salvataggio; l'eccezione dei codici già salvati riguarda le liste, non la parentela. Nessuno svuotamento
 * automatico: lo fa il client.
 */
export function assertIstatCascade(
  occurrences: ReadonlyArray<Pick<FieldOccurrenceDTO, "kind" | "flowId" | "label" | "list" | "repeatGroup">>,
  values: Record<string, FieldValue | undefined>,
  touched: ReadonlySet<string>
): void {
  const istat = occurrences.filter((o) => o.kind === "MASTER" && o.flowId && !o.repeatGroup && o.list?.kind === "ISTAT");
  const byFlow = new Map(istat.map((o) => [o.flowId!, o]));
  const codeOf = (f: string) => {
    const v = values[f];
    return v && typeof v === "object" && !Array.isArray(v) && v.code.trim() !== "" ? v.code : null;
  };
  // Catena interessata: un campo toccato e tutti i suoi antenati e discendenti.
  const chain = new Set<string>();
  const addUp = (f: string) => {
    for (let o = byFlow.get(f); o; o = o.list?.parentFlowId ? byFlow.get(o.list.parentFlowId) : undefined) chain.add(o.flowId!);
  };
  for (const f of touched) if (byFlow.has(f)) addUp(f);
  let grew = true;
  while (grew) {
    grew = false;
    for (const o of istat) if (o.list?.parentFlowId && chain.has(o.list.parentFlowId) && !chain.has(o.flowId!)) chain.add(o.flowId!), (grew = true);
  }
  for (const f of chain) {
    const o = byFlow.get(f)!;
    const code = codeOf(f);
    if (!code || !o.list?.parentFlowId) continue;
    const parentOcc = byFlow.get(o.list.parentFlowId);
    const parentCode = codeOf(o.list.parentFlowId);
    if (!parentCode) throw new HttpError(`${o.label}: serve prima ${parentOcc?.label ?? "il campo superiore"}`, 422);
    const actual = istatParentOf(o.list.listId, code);
    if (actual === "NOT_LOADED") throw new HttpError("Dataset ISTAT non caricato", 503);
    if (actual === undefined) throw new HttpError(`${o.label}: codice ISTAT ${code} inesistente`, 422);
    if (actual !== parentCode) throw new HttpError(`${o.label}: ${code} non appartiene a ${parentOcc?.label ?? ""} ${parentCode}`.trim(), 422);
  }
}
