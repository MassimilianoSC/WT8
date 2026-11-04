import { NextResponse } from "next/server";
import type { ZodSchema } from "zod";
import { HttpError } from "@/lib/http-error";

/** Small helpers to keep API route handlers thin and consistent. */

export { HttpError };

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Validate a JSON request body against a Zod schema (throws HttpError 422). */
export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  const raw = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new HttpError(parsed.error.issues.map((i) => i.message).join(", "), 422);
  }
  return parsed.data;
}

/** Wrap a handler, converting thrown HttpError into a JSON error response. */
export function handle(
  fn: (req: Request, ctx: { params: Record<string, string> }) => Promise<Response>
) {
  return async (req: Request, ctx: { params: Record<string, string> }) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ ...e.extra, error: e.message }, { status: e.status });
      console.error("[api] unhandled error:", e);
      return apiError("Internal server error", 500);
    }
  };
}
