import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/layout/page-header";
import { MissingUser } from "@/components/me/missing-user";
import { resolvePageUser } from "@/components/me/resolve-page-user";
import { AlertRulesEditor } from "@/components/configurazione/alert-rules-editor";
import { andamentoOn } from "@/components/andamento/access";
import { FermeThreshold } from "@/components/andamento/ferme-threshold";

export const metadata = { title: "Soglie alert — WT8" };

/** Thresholds: ADMIN only (D-46). */
export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { state, me } = await resolvePageUser();
  if (!me) return <MissingUser state={state} />;
  if (!me.isAdmin) redirect("/pratiche");

  return (
    <div className="space-y-6" data-testid="config-soglie-page">
      <PageHeader title="Soglie alert" description="Giorni prima o dopo i quali parte ciascun alert, per gestore." />
      <AlertRulesEditor />
      {/* Only with PH_ANDAMENTO on (§15.3): off, the page is as before. */}
      {andamentoOn(me) && <FermeThreshold />}
    </div>
  );
}
