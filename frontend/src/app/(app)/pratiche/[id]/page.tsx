import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PraticaSheet } from "@/components/scheda/pratica-sheet";
import { MissingUser } from "@/components/me/missing-user";
import { resolvePageUser } from "@/components/me/resolve-page-user";

export const metadata = { title: "Scheda pratica — PracticeHub" };

export default async function PraticaPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { iterazione?: string; sezione?: string; campo?: string; riga?: string; commento?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { state, me } = await resolvePageUser();
  if (!me) return <MissingUser state={state} />;

  const n = Number(searchParams.iterazione);
  const iteration = Number.isInteger(n) && n > 0 ? n : undefined;

  const focus =
    searchParams.sezione || searchParams.campo
      ? { sectionKey: searchParams.sezione, campo: searchParams.campo, rowId: searchParams.riga }
      : undefined;

  // The user's groups in the practice's template start open.
  // ?commento= (MENTION notification or mail, §14): the sheet opens on that comment.
  return <PraticaSheet id={params.id} me={me} iteration={iteration} focus={focus} commentId={searchParams.commento || undefined} />;
}
