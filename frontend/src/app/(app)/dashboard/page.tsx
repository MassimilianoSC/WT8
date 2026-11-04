import { redirect } from "next/navigation";

/** The beta dashboard is gone: old links and bookmarks land on the list (cutover, CUTOVER.md §2). */
export default function DashboardPage() {
  redirect("/pratiche");
}
