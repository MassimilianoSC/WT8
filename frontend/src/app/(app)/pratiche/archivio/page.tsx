import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/layout/page-header";
import { PraticheList } from "@/components/pratiche/pratiche-list";
import { MissingUser } from "@/components/me/missing-user";
import { resolvePageUser } from "@/components/me/resolve-page-user";

export const metadata = { title: "Archivio — WT8" };

/** Storico / Archivio (D-23, D-28): archived practices, read-only until restored. */
export default async function ArchivioPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { state, me } = await resolvePageUser();
  if (!me) return <MissingUser state={state} />;

  return (
    <div data-testid="archivio-page">
      <PageHeader
        title="Archivio"
        description="Pratiche archiviate: in sola lettura e con gli alert sospesi fino al ripristino."
      />
      <Suspense fallback={null}>
        <PraticheList mode="archive" />
      </Suspense>
    </div>
  );
}
