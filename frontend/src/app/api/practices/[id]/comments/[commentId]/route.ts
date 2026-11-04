import { handle, HttpError, json, parseBody } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { commentUpdateRequestSchema } from "@/lib/validators";
import { deleteComment, updateComment } from "@/services/comments";
import { storeDeps } from "@/services/users-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/practices/{id}/comments/{commentId} → CommentDTO. Solo l'autore (403); le versioni precedenti restano salvate.
export const PATCH = handle(async (req, { params }) => {
  const user = await requireCurrentUser();
  const body = await parseBody(req, commentUpdateRequestSchema);
  return json(await updateComment(await storeDeps(), user, params.id, params.commentId, body));
});

// DELETE /api/practices/{id}/comments/{commentId}?operationId= → 204. Autore o ADMIN; cancellazione logica.
export const DELETE = handle(async (req, { params }) => {
  const user = await requireCurrentUser();
  const operationId = new URL(req.url).searchParams.get("operationId") ?? undefined;
  if (operationId !== undefined && !/^[0-9a-f-]{36}$/i.test(operationId)) throw new HttpError("operationId non valida", 422);
  await deleteComment(await storeDeps(), user, params.id, params.commentId, { operationId });
  return new Response(null, { status: 204 });
});
