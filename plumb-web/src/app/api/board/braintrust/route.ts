import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";

const BT_API = "https://api.braintrustdata.com/v1";
const BT_KEY = process.env.BRAINTRUST_API_KEY;
const BT_PROJECT_ID = process.env.BRAINTRUST_PROJECT_ID ?? "777205b0-580a-4ecb-a5a6-8954bc5dc7ec";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!BT_KEY) {
    return NextResponse.json({ spans: [], configured: false });
  }

  try {
    // Fetch recent spans from project logs
    const res = await fetch(
      `${BT_API}/project_logs/${BT_PROJECT_ID}/fetch`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${BT_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          limit: 50,
          max_xact_id: "0",
          filters: [],
          version: "0",
        }),
      }
    );

    if (!res.ok) {
      console.warn("[braintrust] fetch failed:", res.status, await res.text());
      return NextResponse.json({ spans: [], configured: true, error: `Braintrust API ${res.status}` });
    }

    const data = (await res.json()) as {
      events?: {
        id: string;
        input?: string;
        output?: string;
        metadata?: Record<string, unknown>;
        metrics?: { start?: number; end?: number; prompt_tokens?: number; completion_tokens?: number };
        span_attributes?: { name?: string };
        created?: string;
      }[];
    };

    const spans = (data.events ?? []).map((e) => ({
      id: e.id,
      name: e.span_attributes?.name ?? "llm-call",
      input: typeof e.input === "string" ? e.input.slice(0, 200) : "",
      output: typeof e.output === "string" ? e.output.slice(0, 300) : "",
      model: (e.metadata?.model as string) ?? "unknown",
      surface: (e.metadata?.surface as string) ?? "unknown",
      latencyMs: e.metrics?.start && e.metrics.end
        ? Math.round((e.metrics.end - e.metrics.start) * 1000)
        : null,
      tokens: (e.metrics?.prompt_tokens ?? 0) + (e.metrics?.completion_tokens ?? 0),
      hadThinking: Boolean(e.metadata?.thinking),
      thinkingLength: (e.metadata?.thinkingLength as number) ?? 0,
      created: e.created ?? new Date().toISOString(),
    }));

    return NextResponse.json({ spans, configured: true });
  } catch (err) {
    console.error("[braintrust] error:", err);
    return NextResponse.json({ spans: [], configured: true, error: String(err) });
  }
}
