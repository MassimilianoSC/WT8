import { ApiError, goToLoginIfExpired } from "@/lib/client";
import type { ImportCommitRequest, ImportPreviewDTO, ImportResultDTO, TemplateId } from "@/lib/contract";

/** Import (§12, ADMIN): preview without writes, then commit. */

export async function previewImport(file: File, templateId: TemplateId): Promise<ImportPreviewDTO> {
  const body = new FormData();
  body.set("file", file);
  body.set("templateId", templateId);
  // Multipart: no JSON content type, the browser sets the boundary.
  const res = await fetch("/api/import/preview", { method: "POST", body, credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    goToLoginIfExpired(res.status);
    throw new ApiError((data as { error?: string }).error || "Anteprima non riuscita", res.status, data);
  }
  return data as ImportPreviewDTO;
}

export async function commitImport(preview: ImportPreviewDTO, req: ImportCommitRequest): Promise<ImportResultDTO> {
  const res = await fetch(`/api/import/${encodeURIComponent(preview.importId)}/commit`, {
    method: "POST",
    body: JSON.stringify(req),
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    goToLoginIfExpired(res.status);
    throw new ApiError((data as { error?: string }).error || "Import non riuscito", res.status, data);
  }
  return data as ImportResultDTO;
}

/** What the user can still decide: ambiguous rows need a practice or SKIP (else 422). */
export function pendingChoices(preview: ImportPreviewDTO, choices: ImportCommitRequest["choices"]): number[] {
  return preview.rows
    .filter((r) => r.outcome === "AMBIGUOUS" && !choices?.some((c) => c.rowIndex === r.rowIndex && (c.action === "SKIP" || c.practiceId)))
    .map((r) => r.rowIndex);
}

/** Expected effect of a commit, for the confirmation. */
export function plannedSummary(preview: ImportPreviewDTO, choices: ImportCommitRequest["choices"] = []) {
  const choiceOf = (i: number) => choices.find((c) => c.rowIndex === i);
  const out = { created: 0, updated: 0, reworks: 0, skipped: 0 };
  for (const r of preview.rows) {
    const c = choiceOf(r.rowIndex);
    if (r.outcome === "ERROR" || c?.action === "SKIP") out.skipped += 1;
    else if (r.outcome === "NEW_PRACTICE") out.created += 1;
    else if (r.outcome === "REWORK") out.reworks += 1;
    else out.updated += 1; // UPDATE, AMBIGUOUS with a chosen practice
  }
  return out;
}
