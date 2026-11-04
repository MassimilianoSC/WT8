import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";
import { shellAssistantOf, shellUserOf } from "@/components/layout/shell-user";
import { ForcedPasswordShell } from "@/components/auth/forced-password-shell";
import { loadMe } from "@/components/me/load-me";

/**
 * Account pages (change password), outside the (app) group so that the
 * mandatory change (D-173) can send here without a redirect loop. Normally
 * the same shell as the app; with mustChangePassword a bare shell with the
 * warning and nothing else to open.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const state = await loadMe();
  const me = state.status === "ok" ? state.me : null;

  if (me?.mustChangePassword) return <ForcedPasswordShell email={session.user.email ?? me.email}>{children}</ForcedPasswordShell>;
  return (
    <AppShell user={shellUserOf(session.user, me)} assistant={shellAssistantOf(me)}>
      {children}
    </AppShell>
  );
}
