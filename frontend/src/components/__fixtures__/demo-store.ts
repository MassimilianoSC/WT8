/**
 * TEST FIXTURE (cutover D-161): demo data from mock-store.ts, moved out of the app code.
 * Tests plug it in with vi.mock(<source>, ...) in place of the real API calls.
 */
import type { PraticaDetailDTO, PraticaSummaryDTO } from "@/lib/contract";
import { MOCK_PRATICHE } from "@/components/__fixtures__/demo-data";

/**
 * Demo practices of this browser session (USE_MOCK): built on first open,
 * then changed by saves and commands. Shared by the list, the archive and the
 * sheet, so archiving, restoring, creating or deleting shows everywhere.
 */

const store = new Map<string, PraticaDetailDTO>();
const deleted = new Set<string>();

export function storeGet(id: string): PraticaDetailDTO | undefined {
  return deleted.has(id) ? undefined : store.get(id);
}

export function storePut(practice: PraticaDetailDTO): void {
  deleted.delete(practice.id);
  store.set(practice.id, practice);
}

export function storeDelete(id: string): void {
  store.delete(id);
  deleted.add(id);
}

export function isDeleted(id: string): boolean {
  return deleted.has(id);
}

function summary(p: PraticaDetailDTO): PraticaSummaryDTO {
  return {
    id: p.id,
    templateId: p.templateId,
    codiceSito: p.codiceSito,
    nomeSito: p.nomeSito,
    committente: p.committente,
    clienteFinale: p.clienteFinale,
    codiceG7: p.codiceG7,
    iteration: p.iteration,
    statoAttivita: p.statoAttivita,
    enabledGroups: p.enabledGroups,
    archived: p.archived,
    archivedAt: p.archivedAt,
    originPracticeId: p.originPracticeId,
    openAlerts: p.openAlerts,
    progress: p.progress,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/** The demo list: seed rows overlaid with the session's changes, plus new practices. */
export function demoSummaries(): PraticaSummaryDTO[] {
  const seeded = MOCK_PRATICHE.filter((p) => !deleted.has(p.id)).map((p) => {
    const changed = store.get(p.id);
    return changed ? summary(changed) : p;
  });
  const added = Array.from(store.values())
    .filter((p) => !MOCK_PRATICHE.some((s) => s.id === p.id))
    .map(summary);
  return [...added, ...seeded];
}
