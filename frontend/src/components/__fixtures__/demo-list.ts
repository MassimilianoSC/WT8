/**
 * TEST FIXTURE (cutover D-161): demo practice list, moved out of the app code.
 * Tests plug it in with vi.mock(<source>, ...) in place of the real API calls.
 */
import type { PraticaSummaryDTO, PracticeListQuery, PracticeListResponse, TemplateId } from "@/lib/contract";
import { demoSummaries } from "@/components/__fixtures__/demo-store";
import { STATI_CONCLUSIVI } from "@/components/pratiche/labels";

const MOCK_PAGE_SIZE = 20;

/** Mirrors the contract semantics of GET /api/practices on the demo data.
 *  `scope` is not simulated: the demo has no current user. */
export function mockList(query: PracticeListQuery): PracticeListResponse {
  const q = query.q?.trim().toLowerCase();
  let items = demoSummaries().filter(
    (p) =>
      (!query.templateId || p.templateId === query.templateId) &&
      (!query.stato || p.statoAttivita === query.stato) &&
      p.archived === (query.archived ?? false) &&
      (!query.from || p.createdAt.slice(0, 10) >= query.from) &&
      (!query.to || p.createdAt.slice(0, 10) <= query.to) &&
      (!q ||
        p.codiceSito.toLowerCase().includes(q) ||
        p.nomeSito.toLowerCase().includes(q) ||
        (p.codiceG7 ?? "").toLowerCase().includes(q))
  );
  const byUpdated = (a: PraticaSummaryDTO, b: PraticaSummaryDTO) => b.updatedAt.localeCompare(a.updatedAt);
  const sort = query.sort ?? "open_first";
  items = [...items].sort((a, b) => {
    if (sort === "created_desc") return b.createdAt.localeCompare(a.createdAt);
    if (sort === "open_first") {
      const ca = STATI_CONCLUSIVI.includes(a.statoAttivita) ? 1 : 0;
      const cb = STATI_CONCLUSIVI.includes(b.statoAttivita) ? 1 : 0;
      if (ca !== cb) return ca - cb;
    }
    return byUpdated(a, b);
  });
  const page = Math.max(1, query.page ?? 1);
  const start = (page - 1) * MOCK_PAGE_SIZE;
  return { items: items.slice(start, start + MOCK_PAGE_SIZE), total: items.length, page, pageSize: MOCK_PAGE_SIZE };
}

/** Same signature as data-source.listPratiche. */
async function mockFindDuplicates(templateId: TemplateId, key: { codiceG7: string; codiceSito: string; nomeSito: string }): Promise<PraticaSummaryDTO[]> {
  const norm = (x: string | null | undefined) => (x ?? "").trim().toLowerCase();
  return [false, true]
    .flatMap((archived) => mockList({ templateId, q: key.codiceG7.trim(), archived }).items)
    .filter((p) => (p.codiceG7 ?? "").trim() === key.codiceG7.trim() && norm(p.codiceSito) === norm(key.codiceSito) && norm(p.nomeSito) === norm(key.nomeSito));
}

/** Same signatures as data-source (findDuplicates too: it calls listPratiche inside the module). */
export const demoList = { listPratiche: async (q: PracticeListQuery) => mockList(q), findDuplicates: mockFindDuplicates };
