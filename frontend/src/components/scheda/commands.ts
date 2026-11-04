import { ApiError, apiFetch } from "@/lib/client";
import type {
  ConflictCode,
  CreatePracticeRequest,
  GroupId,
  OperationRequest,
  PraticaDetailDTO,
  ResolveTemplateRequest,
  ResolveTemplateResponse,
  StatoAttivita,
} from "@/lib/contract";

/**
 * Practice commands (§5.3). Every command that changes an existing practice
 * sends the revision read (optimistic locking) and an operationId generated
 * once per user action and reused on retries (v0.1.7).
 */

export type Command =
  | { kind: "assign"; groups: GroupId[]; note?: string }
  | { kind: "stato"; stato: StatoAttivita }
  | { kind: "archive" }
  | { kind: "restore" }
  | { kind: "delete" }
  | { kind: "rework"; codiceG7?: string }
  | { kind: "resubmit"; codiceG7?: string };

/** One id per user action: create it when the dialog opens, reuse it on retry. */
export function newOperationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `op-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Kind of 409, or null if the error is not a conflict. A 409 without code
 *  (backend before v0.1.7) is treated as a revision conflict. */
export function conflictOf(e: unknown): ConflictCode | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null;
  const code = (e.body as { code?: string } | null)?.code;
  return code === "ITERATION_CONFLICT" || code === "OPERATION_REUSED" ? code : "REVISION_CONFLICT";
}

/**
 * Runs a command. Resolves to the updated practice (for rework: the NEW
 * practice), or null for delete.
 */
export async function runCommand(
  practice: PraticaDetailDTO,
  command: Command,
  operationId: string
): Promise<PraticaDetailDTO | null> {
  const base = `/api/practices/${encodeURIComponent(practice.id)}`;
  const op: OperationRequest = { operationId };

  if (command.kind === "delete") {
    const params = new URLSearchParams({ revision: String(practice.revision), operationId });
    await apiFetch<void>(`${base}?${params.toString()}`, { method: "DELETE" });
    return null;
  }
  const { kind, ...payload } = command;
  // Rework does not change the origin practice: no revision (contract §5.3).
  const body = kind === "rework" ? { ...payload, ...op } : { ...payload, revision: practice.revision, ...op };
  return apiFetch<PraticaDetailDTO>(`${base}/${kind}`, { method: "POST", body: JSON.stringify(body) });
}

export async function resolveTemplate(req: ResolveTemplateRequest): Promise<ResolveTemplateResponse> {
  return apiFetch<ResolveTemplateResponse>("/api/practices/resolve-template", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function createPractice(req: CreatePracticeRequest, operationId: string): Promise<PraticaDetailDTO> {
  const body: CreatePracticeRequest = { ...req, operationId };
  return apiFetch<PraticaDetailDTO>("/api/practices", { method: "POST", body: JSON.stringify(body) });
}
