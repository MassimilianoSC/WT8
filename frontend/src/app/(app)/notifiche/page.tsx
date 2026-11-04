import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/layout/page-header";
import { NotificationsPage } from "@/components/notifiche/notifications-page";
import { MissingUser } from "@/components/me/missing-user";
import { resolvePageUser } from "@/components/me/resolve-page-user";

export const metadata = { title: "Notifiche — PracticeHub" };

/** Every user sees their own notifications (§8). */
export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { state, me } = await resolvePageUser();
  if (!me) return <MissingUser state={state} />;

  return (
    <div className="space-y-6" data-testid="notifiche-page">
      <PageHeader title="Notifiche" description="Assegna, alert e promemoria: un clic porta al punto della pratica." />
      <NotificationsPage />
    </div>
  );
}
