import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/layout/page-header";
import { MissingUser } from "@/components/me/missing-user";
import { resolvePageUser } from "@/components/me/resolve-page-user";
import { canSeeStats, statsTemplates, workloadScope } from "@/components/me/me-derive";
import { StatisticheView, type StatsAccess } from "@/components/statistiche/statistiche-view";
import { paramsOf, statsInitialFromParams } from "@/components/statistiche/stats-url";

export const metadata = { title: "Statistiche — PracticeHub" };

/** Statistics and workload (§9–§10): PM of the template and ADMIN; team leaders see their group's workload (D-23). */
export default async function StatistichePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { state, me } = await resolvePageUser();
  if (!me) return <MissingUser state={state} />;
  if (!canSeeStats(me)) redirect("/pratiche");
  const access: StatsAccess = { statsTemplates: statsTemplates(me), workload: workloadScope(me) };
  // Template, period, view and group from the address (stats-url.ts); a new address remounts the view.
  const initial = statsInitialFromParams(paramsOf(searchParams));

  return (
    <div className="space-y-6" data-testid="statistiche-page">
      <PageHeader title="Statistiche" description="Volumi, scadenze, tempi e carichi di lavoro. Nessuna classifica: le persone sono in ordine di nome." />
      <StatisticheView key={JSON.stringify(initial)} access={access} initial={initial} />
    </div>
  );
}
