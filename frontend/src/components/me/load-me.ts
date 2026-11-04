import { getCurrentUser, getSessionEmail } from "@/lib/auth-v2";
import { loadMeDTO } from "@/lib/current-user";
import { getStoreDb } from "@/lib/store/db";
import type { MeState } from "@/components/me/me-derive";

/**
 * Current user of the new model for server pages and the layout (D-4: o2's
 * services are imported, never changed). Never throws: if the new database
 * is not reachable the beta pages must keep working.
 */
export async function loadMe(): Promise<MeState> {
  try {
    const email = await getSessionEmail();
    if (!email) return { status: "anonymous" };
    const user = await getCurrentUser();
    if (!user) return { status: "missing", email };
    // Same MeDTO as GET /api/me, "assistant" included (§13.1): one function for both.
    return { status: "ok", me: await loadMeDTO(await getStoreDb(), user) };
  } catch {
    return { status: "error" };
  }
}
