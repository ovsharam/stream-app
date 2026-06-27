import { BoardClient } from "@/components/board/BoardClient";
import SetupPage from "@/components/SetupPage";
import { fetchInboxThreads } from "@/lib/integrations/inbox";
import {
  getBoardStats,
  getCases,
  getLatestEvent,
  getUserOrg,
} from "@/lib/db/cases";
import { getSessionUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AppPage() {
  const user = await getSessionUser();
  if (!user?.email) redirect("/login");

  if (!process.env.DATABASE_URL?.trim()) {
    return <SetupPage message="DATABASE_URL is not set in plumb-web/.env.local" />;
  }

  try {
    const org = await getUserOrg(user.id);
    if (!org) redirect("/onboarding");

    const [cases, stats, latestEvent, inboxThreads] = await Promise.all([
      getCases(org.orgId),
      getBoardStats(org.orgId),
      getLatestEvent(org.orgId),
      fetchInboxThreads(org.orgId, "gmail"),
    ]);

    return (
      <BoardClient
        orgId={org.orgId}
        initialCases={cases}
        initialStats={stats}
        initialEvent={latestEvent}
        inboxThreads={inboxThreads}
      />
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    return <SetupPage message={message} />;
  }
}
