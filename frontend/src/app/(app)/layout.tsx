import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { CHANGE_PASSWORD_PATH } from "@/lib/client";
import { AppShell } from "@/components/layout/app-shell";
import { shellAssistantOf, shellUserOf } from "@/components/layout/shell-user";
import { loadMe } from "@/components/me/load-me";

// Server-side guard for all authenticated pages.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // The shell is shaped by the new model's user (MeDTO); without one, every
  // page shows the MissingUser box (resolvePageUser) and the menus stay empty.
  const state = await loadMe();
  const me = state.status === "ok" ? state.me : null;
  // D-173: the first ADMIN changes the password before anything else (the page lives in the (account) group).
  if (me?.mustChangePassword) redirect(CHANGE_PASSWORD_PATH);

  return (
    <AppShell user={shellUserOf(session.user, me)} assistant={shellAssistantOf(me)}>
      {children}
    </AppShell>
  );
}
