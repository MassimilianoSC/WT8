/**
 * Lettura della scheda (contratto §5): GET /api/practices/{id} (al cutover, D-68) e
 * GET /api/practices/{id}/iterations/{n}. Sola lettura sul database _v2.
 */
import type { Db } from "mongodb";
import type { PraticaDetailDTO, UserDTO } from "@/lib/contract";
import { toDetailDTO } from "@/lib/practice/detail";
import { openAlertsOf } from "@/services/alerts";
import { getTemplate } from "@/services/templates";
import { loadAggregate, loadVisiblePractice, parsePracticeId } from "@/services/practices-v2/repository";

/** Scheda dell'iterazione corrente o, con `n`, di un'iterazione passata. 404 se non visibile. */
export async function getPracticeDetail(db: Db, user: UserDTO, id: string, n?: number): Promise<PraticaDetailDTO> {
  const practice = await loadVisiblePractice(db, user, parsePracticeId(id));
  const agg = await loadAggregate(db, practice, n);
  const template = await getTemplate(practice.templateId, agg.iteration.templateVersion, async () => db);
  const current = agg.iteration._id.equals(practice.currentIterationId);
  return toDetailDTO(agg, template, user, current ? await openAlertsOf(db, practice, agg.iteration.n, user) : []);
}
