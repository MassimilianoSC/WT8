import type { ExportQuery } from "@/lib/contract";
import { exportUrl } from "@/components/statistiche/stats-source";

/** CSV export (§11): the server makes the file (UTF-8 with BOM, ";", labels), the browser downloads it. */
export async function downloadExport(q: ExportQuery): Promise<void> {
  window.location.assign(exportUrl(q));
}
