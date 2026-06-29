import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

const INTERNAL_SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const INTERNAL_SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function getInternalClient() {
  return createClient(INTERNAL_SUPABASE_URL, INTERNAL_SUPABASE_KEY);
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") ?? "stats";

  try {
    const db = getInternalClient();
    const sinceIso = new Date(Date.now() - 86_400_000).toISOString();

    if (mode === "recent") {
      const { data, error } = await db
        .from("telemetry_events")
        .select("*")
        .order("ts", { ascending: false })
        .limit(500);
      if (error) throw error;
      // remap snake_case columns to camelCase for the client
      const events = (data ?? []).map((r) => ({
        ...((r.properties as Record<string, unknown>) ?? {}),
        event: r.event,
        sessionId: r.session_id,
        userId: r.user_id,
        ts: r.ts,
      }));
      return NextResponse.json({ events });
    }

    // stats mode — pull last 24h
    const { data, error } = await db
      .from("telemetry_events")
      .select("*")
      .gte("ts", sinceIso)
      .order("ts", { ascending: false })
      .limit(2000);
    if (error) throw error;

    const events = data ?? [];
    // properties column holds the full TelemetryPayload
    const props = (e: Record<string, unknown>) => (e.properties ?? {}) as Record<string, unknown>;
    const llmCalls = events.filter((e) => e.event === "chat.response");
    const feedImpressions = events.filter((e) => e.event === "feed.impression");
    const signalRates = events.filter((e) => e.event === "feed.signal_rate");
    const sessions = new Set(events.map((e) => e.session_id).filter(Boolean)).size;
    const ratings = { confirmed: 0, noise: 0, known: 0 };
    for (const ev of signalRates) {
      const r = props(ev).rating as string;
      if (r === "confirmed") ratings.confirmed++;
      else if (r === "noise") ratings.noise++;
      else if (r === "known") ratings.known++;
    }
    const avgLatencyMs = llmCalls.length
      ? Math.round(llmCalls.reduce((s: number, e) => s + ((props(e).latencyMs as number) ?? 0), 0) / llmCalls.length)
      : null;
    const thinkingRate = llmCalls.length
      ? llmCalls.filter((e) => props(e).thinking).length / llmCalls.length
      : 0;

    // top pages by event count
    const pageCounts: Record<string, number> = {};
    for (const ev of events) {
      const page = props(ev).page as string | undefined;
      if (page) pageCounts[page] = (pageCounts[page] ?? 0) + 1;
    }
    const topPages = Object.entries(pageCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([page, count]) => ({ page, count }));

    return NextResponse.json({
      sessions,
      llmCalls: llmCalls.length,
      avgLatencyMs,
      thinkingRate,
      feedImpressions: feedImpressions.length,
      signalRatings: ratings,
      topPages,
      totalEvents: events.length,
    });
  } catch (err) {
    if (mode === "stats") {
      return NextResponse.json({
        sessions: 0, llmCalls: 0, avgLatencyMs: null, thinkingRate: 0,
        feedImpressions: 0, signalRatings: { confirmed: 0, noise: 0, known: 0 },
        topPages: [], totalEvents: 0, _error: String(err),
      });
    }
    return NextResponse.json({ events: [], _error: String(err) });
  }
}
