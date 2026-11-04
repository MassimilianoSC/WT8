/**
 * Template compilati correnti (B2), letti dai JSON in src/data/templates/ generati da
 * `yarn templates:compile`. Nessuna lettura degli MD né del database.
 */
import { TEMPLATE_IDS, type TemplateId } from "@/lib/contract";
import type { CompiledTemplate } from "@/lib/templates/compiler";
import FASTWEB_VODAFONE from "@/data/templates/FASTWEB_VODAFONE.json";
import ILIAD from "@/data/templates/ILIAD.json";
import INWIT from "@/data/templates/INWIT.json";
import LEONARDO from "@/data/templates/LEONARDO.json";
import TIM_FIBERCOP from "@/data/templates/TIM_FIBERCOP.json";
import TOWERNET from "@/data/templates/TOWERNET.json";

export const COMPILED_TEMPLATES = { ILIAD, TOWERNET, TIM_FIBERCOP, INWIT, FASTWEB_VODAFONE, LEONARDO } as unknown as Readonly<
  Record<TemplateId, CompiledTemplate>
>;

export const isTemplateId = (id: string): id is TemplateId => (TEMPLATE_IDS as readonly string[]).includes(id);
