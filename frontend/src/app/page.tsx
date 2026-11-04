import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// Entry point: send authenticated users to the dashboard, others to login.
export default async function Home() {
  const session = await auth();
  redirect(session?.user ? "/pratiche" : "/login");
}
