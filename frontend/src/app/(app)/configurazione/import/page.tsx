import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/layout/page-header";
import { MissingUser } from "@/components/me/missing-user";
import { resolvePageUser } from "@/components/me/resolve-page-user";
import { ImportWizard } from "@/components/import/import-wizard";

export const metadata = { title: "Import — PracticeHub" };

/** Import of a client's workbook (§12, D-49): ADMIN only. */
export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { state, me } = await resolvePageUser();
  if (!me) return <MissingUser state={state} />;
  if (!me.isAdmin) redirect("/pratiche");

  return (
    <div className="space-y-6" data-testid="config-import-page">
      <PageHeader title="Import" description="Carica il file Excel di un gestore: vedi cosa succederebbe, poi confermi." />
      <ImportWizard />
    </div>
  );
}
