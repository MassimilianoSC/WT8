/**
 * Scelta del template alla creazione (D-16, G §17.3). PURA. Codici delle liste COMMITTENTE e
 * CLIENTE_FINALE (LISTE_VALORI_INIZIALI). Con "Altro" o una combinazione non prevista il template lo sceglie
 * a mano chi crea la pratica: templateId = null e candidates = i template possibili.
 */
import { TEMPLATE_IDS, type ResolveTemplateRequest, type ResolveTemplateResponse, type TemplateId } from "@/lib/contract";

/** Cliente Finale → template (D-16). FASTWEB dipende dal Committente. */
const BY_CLIENTE_FINALE: Record<string, TemplateId> = {
  ILIAD: "ILIAD",
  WIND_3: "ILIAD",
  ZEFIRO: "ILIAD",
  INWIT: "INWIT",
  TOWERNET: "TOWERNET",
  TIM: "TIM_FIBERCOP",
  FIBERCOP: "TIM_FIBERCOP",
  VODAFONE: "FASTWEB_VODAFONE",
  LEONARDO: "LEONARDO",
};

export function resolveTemplate(req: ResolveTemplateRequest): ResolveTemplateResponse {
  const cliente = req.clienteFinale?.code?.trim().toUpperCase() ?? "";
  const committente = req.committente?.code?.trim().toUpperCase() ?? "";
  if (cliente === "FASTWEB") {
    // Cliente Finale FASTWEB: Committente Fastweb → FASTWEB-VODAFONE, altrimenti ILIAD (D-16).
    const t: TemplateId = committente === "FASTWEB" ? "FASTWEB_VODAFONE" : "ILIAD";
    return { templateId: t, candidates: [t] };
  }
  const t = BY_CLIENTE_FINALE[cliente];
  if (t) return { templateId: t, candidates: [t] };
  return { templateId: null, candidates: [...TEMPLATE_IDS] };
}
