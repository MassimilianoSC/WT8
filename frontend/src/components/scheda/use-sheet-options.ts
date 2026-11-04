"use client";
import * as React from "react";
import type { FieldValue, ListDTO, ListRefDTO, RoleId, TemplateId } from "@/lib/contract";
import { EMPTY_LIST_TEXT, type Option } from "@/components/scheda/fields/format";
import { istatPath, loadAssignable, loadCatalog, loadIstat, optionsOf } from "@/components/scheda/lists-source";
import type { OptionsResult } from "@/components/scheda/sections";

type IstatEntry = { options?: Option[]; error?: string };

function codeOf(v: FieldValue | undefined): string | null {
  return v && typeof v === "object" && !Array.isArray(v) && "code" in v ? v.code : null;
}

/**
 * Options of the sheet's menus from the real lists (B6): the template's lists
 * (own version, else common), the ISTAT cascade loaded on demand, and the user
 * fields. Synchronous for the renderers: missing data is requested after the
 * render and shows "Caricamento…" meanwhile.
 */
export function useSheetOptions(templateId: TemplateId | null) {
  const [catalog, setCatalog] = React.useState<Map<string, ListDTO> | null>(null);
  const [catalogError, setCatalogError] = React.useState<string | null>(null);
  const [istat, setIstat] = React.useState<Record<string, IstatEntry>>({});
  const started = React.useRef(new Set<string>());

  /** Loads an ISTAT route (or a role's users, key "users:ROLE") once; called after the render that needed it. */
  const requestIstat = React.useCallback((path: string) => {
    if (started.current.has(path)) return;
    started.current.add(path);
    const role = path.startsWith("users:") ? path.slice("users:".length) : null;
    (role && templateId ? loadAssignable(templateId, role as RoleId) : loadIstat(path))
      .then((options) => setIstat((s) => ({ ...s, [path]: { options } })))
      .catch((e) => {
        started.current.delete(path); // retry on the next render that needs it
        setIstat((s) => ({ ...s, [path]: { error: (e as Error).message } }));
      });
  }, [templateId]);

  React.useEffect(() => {
    if (!templateId) return;
    let alive = true;
    setCatalog(null);
    setCatalogError(null);
    loadCatalog(templateId)
      .then((c) => alive && setCatalog(c))
      .catch((e) => alive && setCatalogError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [templateId]);

  return React.useCallback(
    (list: ListRefDTO, parentValue: FieldValue | undefined): OptionsResult => {
      // User fields: the assignable users of the role (D-39), loaded on demand.
      if (list.kind === "USERS") {
        if (!list.userRole || !templateId) return { options: [], emptyText: "Nessun utente" };
        const key = `users:${list.userRole}`;
        const entry = istat[key];
        if (!entry) {
          queueMicrotask(() => requestIstat(key));
          return { options: [], loading: true };
        }
        if (entry.error) return { options: [], emptyText: entry.error };
        return { options: entry.options ?? [], emptyText: "Nessun utente con questo ruolo" };
      }

      if (list.kind === "ISTAT") {
        const path = istatPath(list, list.parentFlowId ? codeOf(parentValue) : null);
        if (!path) return { options: [], emptyText: "Scegli prima il valore del livello superiore" };
        const entry = istat[path];
        if (!entry) {
          queueMicrotask(() => requestIstat(path));
          return { options: [], loading: true };
        }
        if (entry.error) return { options: [], emptyText: entry.error };
        if (!entry.options) return { options: [], loading: true };
        return { options: entry.options, emptyText: "Nessun valore" };
      }

      if (catalogError) return { options: [], emptyText: `Liste non disponibili: ${catalogError}` };
      if (!catalog) return { options: [], loading: true };
      const options = optionsOf(catalog.get(list.listId));
      return { options, emptyText: options.some((o) => !o.inactive) ? undefined : EMPTY_LIST_TEXT };
    },
    [catalog, catalogError, istat, requestIstat, templateId]
  );
}
