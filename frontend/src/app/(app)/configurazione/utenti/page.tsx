import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/layout/page-header";
import { MissingUser } from "@/components/me/missing-user";
import { resolvePageUser } from "@/components/me/resolve-page-user";
import { UsersAdmin } from "@/components/configurazione/users-admin";
import { andamentoOn } from "@/components/andamento/access";

export const metadata = { title: "Utenti — PracticeHub" };

/** Users: ADMIN only (D-17, D-19). */
export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { state, me } = await resolvePageUser();
  if (!me) return <MissingUser state={state} />;
  if (!me.isAdmin) redirect("/pratiche");

  return (
    <div className="space-y-6" data-testid="config-utenti-page">
      <PageHeader title="Utenti" description="Utenti, appartenenze per gestore e ruolo, team leader e ADMIN." />
      <UsersAdmin andamento={andamentoOn(me)} />
    </div>
  );
}
