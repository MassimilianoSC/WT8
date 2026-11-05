import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/layout/page-header";
import { ListsEditor } from "@/components/configurazione/lists-editor";
import { MissingUser } from "@/components/me/missing-user";
import { resolvePageUser } from "@/components/me/resolve-page-user";
import { isLeader, visibleTemplates } from "@/components/me/me-derive";

export const metadata = { title: "Liste — WT8" };

/** Team leaders and ADMIN (the backend sets `editable` per list, D-40). */
export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { state, me } = await resolvePageUser();
  if (!me) return <MissingUser state={state} />;
  if (!(me.isAdmin || isLeader(me))) redirect("/pratiche");

  return (
    <div className="space-y-6" data-testid="config-liste-page">
      <PageHeader title="Liste" description="Valori dei menu per gestore: li modificano i team leader del gruppo e l'ADMIN." />
      <ListsEditor allowed={visibleTemplates(me)} />
    </div>
  );
}
