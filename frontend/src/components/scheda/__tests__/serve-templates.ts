import { vi } from "vitest";
import type { ListDTO, ListItemDTO, TemplateDTO, TemplateId } from "@/lib/contract";
import { MOCK_TEMPLATES } from "@/components/__fixtures__/demo-data";
import { MOCK_OPTIONS, MOCK_PROVINCE, MOCK_TEMPLATE } from "@/components/scheda/mock-template";
import { invalidateCatalogs } from "@/components/scheda/lists-source";

/**
 * Test helper: answers the read routes of B2/B6 like the real ones —
 * GET /api/templates[/{id}], GET/PUT /api/lists[/{listId}] (409 on revision,
 * 422 with usedCodes when a saved code is removed), GET /api/istat/* (or 503).
 */

const item = (code: string, label: string, order: number, active = true): ListItemDTO => ({ code, label, active, order });

function common(listId: string, label: string, items: ListItemDTO[]): ListDTO {
  return { listId, label, kind: "CONTROLLED", templateId: null, group: null, items, editable: true, revision: 1 };
}

/** Lists of the demo: commons + per-template lists (from MOCK_OPTIONS for the reduced template). */
export function demoLists(): ListDTO[] {
  const fromOptions = (listId: string) =>
    (MOCK_OPTIONS[listId] ?? []).filter((o) => o.code !== "ALTRO").map((o, i) => item(o.code, o.label, i + 1));
  const commons: ListDTO[] = [
    // The common Cliente Finale / Committente carry a real ALTRO code (B6).
    common("CLIENTE_FINALE", "Cliente Finale", [...fromOptions("CLIENTE_FINALE"), item("ALTRO", "Altro", 99)]),
    common("COMMITTENTE", "Committente", [...fromOptions("COMMITTENTE"), item("ALTRO", "Altro", 99)]),
    common("SI_NO", "SI / NO", fromOptions("SI_NO")),
    ...["STATO_VINCOLO_NP", "STATO_VINCOLO_ASSOLTO", "STATO_VINCOLO_TUTTI", "ENTE_PAESAGGISTICO", "ENTE_AEROPORTUALE", "ENTE_AMBIENTALI"].map(
      (id) => common(id, id, fromOptions(id))
    ),
  ];
  const perTemplate = (["INWIT", "ILIAD", "TOWERNET"] as TemplateId[]).flatMap((t): ListDTO[] => [
    {
      listId: "TIPOLOGIA_SITO", label: "Tipologia sito", kind: "CONTROLLED", templateId: t, group: "PM_PERMESSI", editable: true, revision: 1,
      items: [item("RAW_LAND", "Raw Land", 1), item("ROOF_TOP", "Roof Top", 2), ...(t === "ILIAD" ? [item("TRALICCIO", "Traliccio", 3)] : [])],
    },
    {
      listId: "INCARICO_LAVORAZIONE", label: "Incarico / Lavorazione", kind: "CONFIGURABLE", templateId: t, group: "PM_PERMESSI", editable: true, revision: 5,
      items: [item("NUOVO_SITO", "Nuovo sito", 1), item("UPGRADE", "Upgrade", 2), item("RISANAMENTO", "Risanamento", 3, false)],
    },
    {
      listId: "FORNITORE_CARATTERIZZAZIONE", label: "Fornitore Caratterizzazione", kind: "CONFIGURABLE", templateId: t, group: "UT_PE", editable: false, revision: 1,
      items: [item("GEOTEC", "Geotec Srl", 1)],
    },
    { listId: "ESITO_ARPA", label: "Esito ARPA", kind: "CONTROLLED", templateId: t, group: "PM_PERMESSI", editable: true, revision: 1, items: fromOptions("ESITO_ARPA") },
    { listId: "PROPRIETA_HOST", label: "Proprietà / Host", kind: "CONFIGURABLE", templateId: t, group: "PM_PERMESSI", editable: true, revision: 1, items: fromOptions("PROPRIETA_HOST") },
    // An empty list (D-103).
    { listId: "REFERENTE", label: "Referente", kind: "CONFIGURABLE", templateId: t, group: "PM_PERMESSI", editable: true, revision: 1, items: [] },
  ]);
  return [...commons, ...perTemplate];
}

export function serveTemplates(
  byId: Partial<Record<string, TemplateDTO>> = {},
  opts: { istatAvailable?: boolean } = {}
) {
  invalidateCatalogs();
  let lists = demoLists();
  const istatAvailable = opts.istatAvailable ?? true;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    const [path, qs = ""] = url.split("?");
    const params = new URLSearchParams(qs);

    const one = /^\/api\/templates\/([A-Z_]+)$/.exec(path);
    if (one) return json(byId[one[1]] ?? { ...MOCK_TEMPLATE, id: one[1] as TemplateDTO["id"] });
    if (path === "/api/templates") return json(MOCK_TEMPLATES);

    if (path === "/api/lists") {
      const t = params.get("templateId");
      return json(lists.filter((l) => l.templateId === null || l.templateId === t));
    }
    const put = /^\/api\/lists\/([A-Z0-9_]+)$/.exec(path);
    if (put && init?.method === "PUT") {
      const t = params.get("templateId");
      const current = lists.find((l) => l.listId === put[1] && l.templateId === t);
      if (!current) return json({ error: "Lista non trovata" }, 404);
      const body = JSON.parse(String(init.body)) as { items: ListItemDTO[]; revision: number };
      if (body.revision !== current.revision) return json({ error: "Conflitto", code: "REVISION_CONFLICT", currentRevision: current.revision }, 409);
      const usedCodes = current.items.filter((o) => !body.items.some((i) => i.code === o.code)).map((o) => o.code);
      if (usedCodes.length) return json({ error: "Codici in uso", usedCodes }, 422);
      const saved = { ...current, items: body.items, revision: current.revision + 1 };
      lists = lists.map((l) => (l === current ? saved : l));
      return json(saved);
    }

    if (path.startsWith("/api/istat/")) {
      if (!istatAvailable) return json({ error: "Dataset ISTAT non caricato" }, 503);
      if (path === "/api/istat/regioni") return json(MOCK_OPTIONS.ISTAT_REGIONI);
      if (path === "/api/istat/province") return json(MOCK_PROVINCE[params.get("regione") ?? ""] ?? []);
      return json([]);
    }
    return json({ error: `Rotta non simulata: ${url}` }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
