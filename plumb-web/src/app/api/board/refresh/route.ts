import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";
import { getBoardStats, getCases, getUserOrg } from "@/lib/db/cases";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const org = await getUserOrg(user.id);
  if (!org) {
    return NextResponse.json({ error: "No org" }, { status: 403 });
  }

  const [cases, stats] = await Promise.all([
    getCases(org.orgId),
    getBoardStats(org.orgId),
  ]);

  return NextResponse.json({ cases, stats });
}
