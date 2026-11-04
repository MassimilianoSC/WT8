import type { Db } from "mongodb";
import { HttpError } from "@/lib/http-error";
import { TEMPLATE_IDS, type TemplateDTO, type TemplateId, type TemplateSummaryDTO } from "@/lib/contract";
import type { CompiledTemplate } from "@/lib/templates/compiler";
import { COMPILED_TEMPLATES, isTemplateId } from "@/lib/templates/compiled";
import { getStoreDb, store } from "@/lib/store/db";

/**
 * Template compilati (B2). La versione corrente si serve dai JSON in src/data/templates/, senza database;
 * il database si legge SOLO per una versione archiviata (snapshot immutabili, D-91), e in sola lettura
 * (D-104: una lettura non crea mai database, indici o snapshot).
 */

/** Elenco dei template nell'ordine dei gestori (D-15). */
export function listTemplates(): TemplateSummaryDTO[] {
  return TEMPLATE_IDS.map((id) => {
    const { label, baseline } = COMPILED_TEMPLATES[id].template;
    return { id, label, baseline };
  });
}

/** Template corrente o, con `version`, la versione archiviata richiesta (404 se assente). */
export async function getTemplate(
  id: string,
  version?: string | null,
  loadDb: () => Promise<Db> = getStoreDb
): Promise<TemplateDTO> {
  if (!isTemplateId(id)) throw new HttpError("Template non trovato", 404);
  const current = COMPILED_TEMPLATES[id].template;
  if (!version || version === current.version) return current;
  const snapshot = await store.templates(await loadDb()).findOne({ templateId: id, version }, { projection: { compiled: 1 } });
  if (!snapshot) throw new HttpError(`Versione ${version} del template ${id} non disponibile`, 404);
  return snapshot.compiled;
}

/** Collegamenti interni per i motori (calcolati, esclusioni, effetti): mai inviati al frontend. */
export function getTemplateBindings(id: TemplateId): CompiledTemplate["bindings"] {
  return COMPILED_TEMPLATES[id].bindings;
}

/** Template e collegamenti di una versione: corrente dai JSON, archiviata dallo snapshot (sola lettura). */
export async function getCompiledVersion(
  id: TemplateId,
  version: string,
  loadDb: () => Promise<Db> = getStoreDb
): Promise<Pick<CompiledTemplate, "template" | "bindings">> {
  const current = COMPILED_TEMPLATES[id];
  if (version === current.template.version) return current;
  const snapshot = await store.templates(await loadDb()).findOne({ templateId: id, version }, { projection: { compiled: 1, bindings: 1 } });
  if (!snapshot) throw new HttpError(`Versione ${version} del template ${id} non disponibile`, 404);
  return { template: snapshot.compiled, bindings: snapshot.bindings };
}
