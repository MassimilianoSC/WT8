import { ApiError, apiFetch } from "@/lib/client";
import type { AssignableUserDTO, IstatItemDTO, ListDTO, ListRefDTO, RoleId, TemplateId } from "@/lib/contract";
import type { Option } from "@/components/scheda/fields/format";

/**
 * Real lists (B6, contract §6) for the sheet, the creation dialog and the
 * configuration pages.
 */

const catalogs = new Map<string, Promise<Map<string, ListDTO>>>();

/**
 * Lists of a template: for each listId the template's own version, else the
 * common one (templateId null). `null` = common lists only (creation:
 * resolve-template uses the common CLIENTE_FINALE / COMMITTENTE).
 */
export function loadCatalog(templateId: TemplateId | null): Promise<Map<string, ListDTO>> {
  const key = templateId ?? "COMMON";
  let p = catalogs.get(key);
  if (!p) {
    p = apiFetch<ListDTO[]>(`/api/lists${templateId ? `?templateId=${templateId}` : ""}`).then((lists) => {
      const map = new Map<string, ListDTO>();
      for (const l of lists) {
        if (templateId === null && l.templateId !== null) continue;
        const current = map.get(l.listId);
        if (!current || (l.templateId !== null && current.templateId === null)) map.set(l.listId, l);
      }
      return map;
    });
    p.catch(() => catalogs.delete(key));
    catalogs.set(key, p);
  }
  return p;
}

/** Forget cached lists (after a save in Configurazione → Liste). */
export function invalidateCatalogs(): void {
  catalogs.clear();
}

/** All items, ordered; deactivated ones are kept (labels of saved values) but flagged. */
export function optionsOf(list: ListDTO | undefined): Option[] {
  return [...(list?.items ?? [])]
    .sort((a, b) => a.order - b.order)
    .map((i) => ({ code: i.code, label: i.label, inactive: !i.active }));
}

// ─── ISTAT cascade ──────────────────────────────────────────────────────────

export const ISTAT_UNAVAILABLE = "Dataset ISTAT non caricato: regioni, province e comuni non sono ancora disponibili";

const istat = new Map<string, Promise<Option[]>>();

/** Route of an ISTAT list for the given parent code (Regione → Provincia → Comune). */
export function istatPath(list: ListRefDTO, parentCode: string | null): string | null {
  switch (list.listId) {
    case "ISTAT_REGIONI":
      return "/api/istat/regioni";
    case "ISTAT_PROVINCE":
      return parentCode ? `/api/istat/province?regione=${encodeURIComponent(parentCode)}` : null;
    case "ISTAT_COMUNI":
      return parentCode ? `/api/istat/comuni?provincia=${encodeURIComponent(parentCode)}` : null;
    default:
      return null;
  }
}

/** ISTAT items, cached per route. A 503 (dataset missing, R-13) rejects with ISTAT_UNAVAILABLE. */
export function loadIstat(path: string): Promise<Option[]> {
  let p = istat.get(path);
  if (!p) {
    p = apiFetch<IstatItemDTO[]>(path)
      .then((items) => items.map((i) => ({ code: i.code, label: i.label })))
      .catch((e) => {
        istat.delete(path);
        throw e instanceof ApiError && e.status === 503 ? new Error(ISTAT_UNAVAILABLE) : e;
      });
    istat.set(path, p);
  }
  return p;
}

/** Users of a role on a template for the USER/USERS fields (D-39): GET /api/users/assignable. */
export async function loadAssignable(templateId: TemplateId, role: RoleId): Promise<Option[]> {
  const params = new URLSearchParams({ templateId, role });
  const users = await apiFetch<AssignableUserDTO[]>(`/api/users/assignable?${params.toString()}`);
  return users.map((u) => ({ code: u.id, label: u.name }));
}
