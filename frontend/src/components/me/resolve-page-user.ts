import type { MeDTO } from "@/lib/contract";
import { loadMe } from "@/components/me/load-me";
import type { MeState } from "@/components/me/me-derive";

/**
 * User of a page: every page needs a user of the new model. Without one
 * (`me` null) the page shows the MissingUser box with `state`.
 */
export async function resolvePageUser(): Promise<{ state: MeState; me: MeDTO | null }> {
  const state = await loadMe();
  return { state, me: state.status === "ok" ? state.me : null };
}
