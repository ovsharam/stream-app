import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";

const NOTCH_API = process.env.NOTCH_API_URL ?? "http://localhost:3131";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") ?? "stats";

  try {
    const endpoint = mode === "recent" ? "/api/telemetry/recent" : "/api/telemetry/stats";
    const res = await fetch(`${NOTCH_API}${endpoint}`, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Plumb API ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    if (mode === "stats") {
      return NextResponse.json({
        sessions: 0,
        llmCalls: 0,
        avgLatencyMs: null,
        thinkingRate: 0,
        feedImpressions: 0,
        signalRatings: { confirmed: 0, noise: 0, known: 0 },
        topPages: [],
        totalEvents: 0,
        _error: String(err),
      });
    }
    return NextResponse.json({ events: [], _error: String(err) });
  }
}
