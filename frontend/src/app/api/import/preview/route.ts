import { handle, json } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth-v2";
import { HttpError } from "@/lib/http-error";
import { MAX_FILE_BYTES } from "@/lib/import/sheet";
import { getStoreDb } from "@/lib/store/db";
import { assertAdmin, previewImport } from "@/services/import-v2/preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Margine per le intestazioni multipart e il campo templateId. */
const MAX_BODY_BYTES = MAX_FILE_BYTES + 64 * 1024;

// POST /api/import/preview (multipart: file .xlsx, templateId; solo ADMIN) → ImportPreviewDTO (contratto §12, D-49).
export const POST = handle(async (req) => {
  const user = await requireCurrentUser();
  assertAdmin(user);
  // Rifiuto prima di leggere il corpo, quando la dimensione è dichiarata.
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) throw new HttpError(`File troppo grande (massimo ${MAX_FILE_BYTES / 1024 / 1024} MB)`, 413);
  const form = await req.formData().catch(() => null);
  if (!form) throw new HttpError("Attesa una richiesta multipart/form-data", 422);
  const file = form.get("file");
  const templateId = form.get("templateId");
  if (!(file instanceof File)) throw new HttpError("File mancante", 422);
  if (typeof templateId !== "string" || !templateId) throw new HttpError("Gestore mancante", 422);
  if (file.size > MAX_FILE_BYTES) throw new HttpError(`File troppo grande (massimo ${MAX_FILE_BYTES / 1024 / 1024} MB)`, 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  return json(await previewImport({ db: await getStoreDb() }, user, { templateId, bytes, fileName: file.name || null }));
});
