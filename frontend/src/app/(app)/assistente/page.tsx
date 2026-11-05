import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/layout/page-header";
import { MissingUser } from "@/components/me/missing-user";
import { resolvePageUser } from "@/components/me/resolve-page-user";
import { AssistantPage } from "@/components/assistente/assistant-page";

export const metadata = { title: "Assistente — WT8" };

/** The assistant at full width (project §9): the same conversation as the "Chiedi" panel. */
export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { state, me } = await resolvePageUser();
  if (!me) return <MissingUser state={state} />;
  // Without MeDTO.assistant the assistant does not exist for this user (contract §13.1).
  if (!me.assistant) redirect("/pratiche");

  return (
    <div className="space-y-6" data-testid="assistente-page">
      <PageHeader title="Assistente" description="Domande sulle pratiche che puoi vedere. Sola lettura: non modifica nulla." />
      {/* AssistantPage reads ?domanda= (useSearchParams). */}
      <Suspense fallback={null}>
        <AssistantPage />
      </Suspense>
    </div>
  );
}
