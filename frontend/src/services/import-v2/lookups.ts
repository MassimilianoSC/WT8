/**
 * Ricerche per la conversione delle celle (B9): una lettura delle liste e degli utenti del template all'inizio
 * dell'anteprima, poi tutto in memoria. Si accettano solo voci ATTIVE e utenti ATTIVI con un'appartenenza al
 * template (e al ruolo del campo): gli stessi vincoli del salvataggio (D-39, D-106), che il commit ricontrolla.
 * Un nome che corrisponde a più voci o utenti è ambiguo e non si converte.
 */
import type { Db } from "mongodb";
import type { TemplateId } from "@/lib/contract";
import type { ConvertLookups } from "@/lib/import/convert";
import { istatLookup } from "@/lib/istat/service";
import { store } from "@/lib/store/db";

const AMBIGUOUS = Symbol("ambiguous");
type Index = Map<string, string | typeof AMBIGUOUS>;

const lower = (s: string) => s.trim().toLocaleLowerCase("it");

function put(index: Index, key: string, value: string) {
  if (!key) return;
  const had = index.get(key);
  index.set(key, had !== undefined && had !== value ? AMBIGUOUS : value);
}

function get(index: Index | undefined, key: string): string | null {
  const v = index?.get(key);
  return v === undefined || v === AMBIGUOUS ? null : v;
}

export async function buildLookups(db: Db, templateId: TemplateId): Promise<ConvertLookups> {
  const [lists, users] = await Promise.all([
    store.lists(db).find({ templateId: { $in: [templateId, null] } }, { projection: { listId: 1, templateId: 1, items: 1 } }).toArray(),
    store.users(db)
      .find({ status: "active", "memberships.templateId": templateId }, { projection: { email: 1, name: 1, memberships: 1 } })
      .toArray(),
  ]);

  // Lista del template se c'è, altrimenti quella comune (come assertValuesInLists).
  const chosen = new Map<string, (typeof lists)[number]>();
  for (const l of lists) if (!chosen.has(l.listId) || l.templateId === templateId) chosen.set(l.listId, l);
  const byCode = new Map<string, Set<string>>();
  const byLabel = new Map<string, Index>();
  for (const [listId, l] of chosen) {
    const active = l.items.filter((i) => i.active);
    byCode.set(listId, new Set(active.map((i) => i.code)));
    const idx: Index = new Map();
    for (const i of active) put(idx, lower(i.label), i.code);
    byLabel.set(listId, idx);
  }

  // Per ruolo ("" = qualunque ruolo nel template): email e nome, senza maiuscole.
  const byRole = new Map<string, Index>();
  for (const u of users) {
    const id = u._id.toHexString();
    const roles = new Set(["", ...u.memberships.filter((m) => m.templateId === templateId).map((m) => m.role as string)]);
    for (const r of roles) {
      const idx = byRole.get(r) ?? new Map();
      put(idx, lower(u.email), id);
      put(idx, lower(u.name), id);
      byRole.set(r, idx);
    }
  }

  return {
    listCode(listId, text) {
      const t = text.trim();
      if (byCode.get(listId)?.has(t)) return t;
      return get(byLabel.get(listId), lower(t));
    },
    userId(role, text) {
      return get(byRole.get(role ?? ""), lower(text));
    },
    istatCode(listId, text, parentCode) {
      return istatLookup(listId, text, parentCode);
    },
  };
}
