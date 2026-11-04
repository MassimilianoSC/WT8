import { handle, json, parseBody } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { getStoreDb } from "@/lib/store/db";
import { commentCreateRequestSchema } from "@/lib/validators";
import { createComment, listComments, parseCommentQuery } from "@/services/comments";
import { storeDeps } from "@/services/users-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/practices/{id}/comments?iteration=&all= → CommentListResponse (§14). Pratica non visibile → 404.
export const GET = handle(async (req, { params }) => {
  const user = await requireCurrentUser();
  return json(await listComments(await getStoreDb(), user, params.id, parseCommentQuery(new URL(req.url).searchParams)));
});

// POST /api/practices/{id}/comments → CommentDTO (201). 409 ARCHIVED/PAST_ITERATION; testo vuoto o menzione non valida → 422.
export const POST = handle(async (req, { params }) => {
  const user = await requireCurrentUser();
  const body = await parseBody(req, commentCreateRequestSchema);
  return json(await createComment(await storeDeps(), user, params.id, body), 201);
});
