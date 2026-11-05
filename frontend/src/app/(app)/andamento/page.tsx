import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/layout/page-header";
import { MissingUser } from "@/components/me/missing-user";
import { resolvePageUser } from "@/components/me/resolve-page-user";
import { canSeeAndamento } from "@/components/andamento/access";
import { AndamentoView } from "@/components/andamento/andamento-view";
import { filtersFromParams } from "@/components/andamento/andamento-url";
import { paramsOf } from "@/components/statistiche/stats-url";

export const metadata = { title: "Andamento — WT8" };

/** Andamento (§15): ADMIN and Direzione with PH_ANDAMENTO on; otherwise the page does not exist (404), as before. */
export default async function AndamentoPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { state, me } = await resolvePageUser();
  if (!me) return <MissingUser state={state} />;
  if (!canSeeAndamento(me)) notFound();

  return (
    <div className="space-y-6" data-testid="andamento-page">
      <PageHeader
        title="Andamento"
        description="Come procede il lavoro: dove si fermano le pratiche, entrate e uscite, andamento nel tempo. Stati, gruppi e clienti, mai persone."
      />
      <AndamentoView initial={filtersFromParams(paramsOf(searchParams))} />
    </div>
  );
}
