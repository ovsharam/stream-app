import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";

const GH_REPO = process.env.GITHUB_REPO ?? "apoorvasharma/stream-app";
const GH_TOKEN = process.env.GITHUB_TOKEN;

export async function GET() {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (GH_TOKEN) headers["Authorization"] = `Bearer ${GH_TOKEN}`;

    const res = await fetch(
      `https://api.github.com/repos/${GH_REPO}/actions/runs?per_page=20`,
      { headers, signal: AbortSignal.timeout(5000) }
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ runs: [], error: `GitHub API ${res.status}: ${text}` });
    }

    const data = (await res.json()) as {
      workflow_runs?: {
        id: number;
        name: string;
        head_branch: string;
        status: string;
        conclusion: string | null;
        created_at: string;
        updated_at: string;
        run_started_at: string;
        html_url: string;
        head_commit?: { message: string };
      }[];
    };

    const runs = (data.workflow_runs ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      branch: r.head_branch,
      status: r.status,
      conclusion: r.conclusion,
      createdAt: r.created_at,
      durationMs:
        r.run_started_at && r.updated_at
          ? new Date(r.updated_at).getTime() - new Date(r.run_started_at).getTime()
          : null,
      url: r.html_url,
      commitMessage: r.head_commit?.message?.split("\n")[0] ?? "",
    }));

    return NextResponse.json({ runs });
  } catch (err) {
    return NextResponse.json({ runs: [], error: String(err) });
  }
}
