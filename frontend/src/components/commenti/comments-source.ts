import { apiFetch } from "@/lib/client";
import { newRequestId } from "@/components/assistente/assistant-source";
import type {
  CommentCreateRequest,
  CommentDTO,
  CommentListResponse,
  CommentMention,
  CommentUpdateRequest,
  MentionableDTO,
} from "@/components/commenti/types";

/** Comments of a practice (contract §14). Every write carries an operationId, so a retry is safe. */

const base = (practiceId: string) => `/api/practices/${encodeURIComponent(practiceId)}/comments`;

/** One iteration (default: current); `all` = every iteration. */
export async function loadComments(practiceId: string, opts: { iteration?: number; all?: boolean } = {}): Promise<CommentListResponse> {
  const params = new URLSearchParams();
  if (opts.iteration !== undefined) params.set("iteration", String(opts.iteration));
  if (opts.all) params.set("all", "1");
  const qs = params.toString();
  return apiFetch<CommentListResponse>(`${base(practiceId)}${qs ? `?${qs}` : ""}`, { cache: "no-store" });
}

export async function createComment(practiceId: string, body: string, mentions: CommentMention[], parentId?: string): Promise<CommentDTO> {
  const req: CommentCreateRequest = { body, mentions, operationId: newRequestId(), ...(parentId ? { parentId } : {}) };
  return apiFetch<CommentDTO>(base(practiceId), { method: "POST", body: JSON.stringify(req) });
}

export async function updateComment(practiceId: string, commentId: string, body: string, mentions: CommentMention[]): Promise<CommentDTO> {
  const req: CommentUpdateRequest = { body, mentions, operationId: newRequestId() };
  return apiFetch<CommentDTO>(`${base(practiceId)}/${encodeURIComponent(commentId)}`, { method: "PATCH", body: JSON.stringify(req) });
}

export async function deleteComment(practiceId: string, commentId: string): Promise<void> {
  await apiFetch(`${base(practiceId)}/${encodeURIComponent(commentId)}?operationId=${encodeURIComponent(newRequestId())}`, { method: "DELETE" });
}

export async function loadMentionable(practiceId: string): Promise<MentionableDTO> {
  return apiFetch<MentionableDTO>(`/api/practices/${encodeURIComponent(practiceId)}/mentionable`, { cache: "no-store" });
}
