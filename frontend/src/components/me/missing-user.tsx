import { UserX } from "lucide-react";
import type { MeState } from "@/components/me/me-derive";

/**
 * Shown on the pages when the session's user cannot be read as a PracticeHub
 * user (GET /api/me → 404: not invited or deactivated; or the service is down).
 */
export function MissingUser({ state }: { state: MeState }) {
  if (state.status === "ok") return null;
  const message =
    state.status === "missing"
      ? `Il tuo utente (${state.email}) non è attivo in PracticeHub. Chiedi all'amministratore di invitarti o di riattivarti.`
      : state.status === "error"
        ? "PracticeHub non è raggiungibile in questo momento. Riprova tra poco."
        : "Sessione scaduta: accedi di nuovo.";
  return (
    <div className="flex gap-3 border-2 border-foreground bg-card p-6" role="alert" data-testid="missing-user">
      <UserX className="mt-0.5 h-5 w-5 shrink-0" />
      <p className="font-medium">{message}</p>
    </div>
  );
}
