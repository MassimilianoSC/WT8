import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/layout/page-header";
import { PraticheList } from "@/components/pratiche/pratiche-list";
import { MissingUser } from "@/components/me/missing-user";
import { resolvePageUser } from "@/components/me/resolve-page-user";
import { isDirezionePura } from "@/components/andamento/access";

export const metadata = { title: "Pratiche — PracticeHub" };

export default async function PratichePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { state, me } = await resolvePageUser();
  if (!me) return <MissingUser state={state} />;
  // Direzione without memberships does not work on practices: it starts on Andamento (§15.2, D-193).
  if (isDirezionePura(me)) redirect("/andamento");

  return (
    <div data-testid="pratiche-page">
      <PageHeader title="Pratiche" description="Pratiche per cliente: prima quelle aperte." />
      {/* PraticheList reads the template from the URL (useSearchParams); canCreate per template (D-20). */}
      <Suspense fallback={null}>
        <PraticheList canCreateIn={me.canCreate} />
      </Suspense>
    </div>
  );
}
