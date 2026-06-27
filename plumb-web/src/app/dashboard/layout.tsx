import type { Metadata } from "next";
import { getSessionUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "./shell";

export const metadata: Metadata = {
  title: "Plumb Observability",
  description: "Internal observability dashboard",
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/dashboard");

  return <DashboardShell user={{ email: user.email ?? "" }}>{children}</DashboardShell>;
}
