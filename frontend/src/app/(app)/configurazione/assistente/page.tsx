import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/layout/page-header";
import { MissingUser } from "@/components/me/missing-user";
import { resolvePageUser } from "@/components/me/resolve-page-user";
import { AssistantSettingsEditor } from "@/components/configurazione/assistant-settings";

export const metadata = { title: "Assistente AI — WT8" };

/** Assistant switch and per-person limits: ADMIN only (D-169, D-171). */
export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { state, me } = await resolvePageUser();
  if (!me) return <MissingUser state={state} />;
  if (!me.isAdmin) redirect("/pratiche");

  return (
    <div className="space-y-6" data-testid="config-assistente-page">
      <PageHeader title="Assistente AI" description="Acceso o spento per tutti, e quante domande può fare ciascuno." />
      <AssistantSettingsEditor />
    </div>
  );
}
