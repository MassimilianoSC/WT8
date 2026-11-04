import { NextResponse } from "next/server";
import { getStoreDb } from "@/lib/store/db";
import { getHealth, thresholdsFromEnv } from "@/services/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/health → stato dello stack (K5): 200 se il database risponde (status "ok" o "degraded" con il dettaglio
// dei controlli), 503 se il database non risponde. Senza autenticazione: lo interroga il controllo esterno
// (deploy/watchdog). Nessun dato riservato: solo esiti, età e spazio.
export async function GET(): Promise<Response> {
  let report;
  try {
    report = await getHealth(await getStoreDb(), new Date(), thresholdsFromEnv());
  } catch {
    report = { status: "down" as const, at: new Date().toISOString(), checks: { database: { ok: false, detail: "non raggiungibile" } } };
  }
  return NextResponse.json(report, { status: report.status === "down" ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
