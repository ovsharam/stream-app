"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type TelemetryEvent = {
  event: string;
  sessionId?: string;
  userId?: string;
  ts: string;
  page?: string;
  surface?: string;
  rating?: string;
  query?: string;
  [key: string]: unknown;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const EVENT_COLOR: Record<string, string> = {
  "feed.signal_rate": "#1db584",
  "feed.impression": "rgba(255,255,255,0.3)",
  "feed.dwell": "#4285f4",
  "feed.action": "#f59e0b",
  "chat.send": "#cc785c",
  "chat.response": "#8b5cf6",
  "chat.thinking_expand": "#cc785c",
  "nav.page": "rgba(255,255,255,0.3)",
  "app.connect": "#1db584",
  "app.disconnect": "#ef4444",
  "demo.phase": "#4285f4",
  "pipeline.engagement_open": "#cc785c",
};

export default function TelemetryPage() {
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [stats, setStats] = useState<{
    sessions: number;
    totalEvents: number;
    feedImpressions: number;
    signalRatings: { confirmed: number; noise: number; known: number };
    topPages: [string, number][];
    _error?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [evtsRes, statsRes] = await Promise.allSettled([
        fetch("/api/board/telemetry?mode=recent").then((r) => r.json() as Promise<{ events: TelemetryEvent[] }>),
        fetch("/api/board/telemetry?mode=stats").then((r) => r.json()),
      ]);
      if (evtsRes.status === "fulfilled") setEvents(evtsRes.value.events ?? []);
      if (statsRes.status === "fulfilled") setStats(statsRes.value);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
    const t = setInterval(() => void fetchData(), 10_000);
    return () => clearInterval(t);
  }, [fetchData]);

  const eventTypes = ["all", ...Array.from(new Set(events.map((e) => e.event))).sort()];
  const filtered = filter === "all" ? events : events.filter((e) => e.event === filter);

  const plumbConnected = stats !== null && !stats._error;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
        <Link href="/dashboard" style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textDecoration: "none", fontWeight: 600 }}>
          ← Overview
        </Link>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: "-0.03em" }}>
          Behavioral Telemetry
        </h1>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "3px 8px",
            borderRadius: 5,
            background: plumbConnected ? "rgba(29,181,132,0.12)" : "rgba(239,68,68,0.1)",
            color: plumbConnected ? "#1db584" : "#ef4444",
            border: `1px solid ${plumbConnected ? "rgba(29,181,132,0.25)" : "rgba(239,68,68,0.2)"}`,
          }}
        >
          {plumbConnected ? "● Plumb connected" : "○ Plumb offline"}
        </span>
      </div>

      {/* Stats strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 24 }}>
        {[
          ["Active sessions", stats?.sessions ?? "—"],
          ["Total events", stats?.totalEvents ?? "—"],
          ["Feed impressions", stats?.feedImpressions ?? "—"],
          ["Confirmed signals", stats?.signalRatings.confirmed ?? "—"],
          ["Noise signals", stats?.signalRatings.noise ?? "—"],
        ].map(([label, value]) => (
          <div
            key={label as string}
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 9,
              padding: "14px 16px",
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
              {label}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.03em" }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 16 }}>
        {/* Event type filter */}
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 12,
            padding: "14px 0",
            alignSelf: "start",
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.05em", padding: "0 14px 10px" }}>
            Event type
          </div>
          {eventTypes.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setFilter(type)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "7px 14px",
                background: filter === type ? "rgba(255,255,255,0.07)" : "transparent",
                border: "none",
                borderLeft: `2px solid ${filter === type ? (EVENT_COLOR[type] ?? "#cc785c") : "transparent"}`,
                cursor: "pointer",
                fontSize: 12,
                color: filter === type ? "#f0efed" : "rgba(255,255,255,0.4)",
                fontWeight: filter === type ? 600 : 400,
              }}
            >
              {type}
            </button>
          ))}
        </div>

        {/* Event stream */}
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {loading && events.length === 0 ? (
            <p style={{ padding: "24px", fontSize: 12, color: "rgba(255,255,255,0.25)", margin: 0 }}>Loading…</p>
          ) : filtered.length === 0 ? (
            <p style={{ padding: "24px", fontSize: 12, color: "rgba(255,255,255,0.25)", margin: 0 }}>
              {plumbConnected
                ? "No events yet. The Plumb desktop app tracks interactions automatically once running."
                : "Plumb is offline. Deploy the API server to see live events."}
            </p>
          ) : (
            <div style={{ maxHeight: 560, overflow: "auto" }}>
              {filtered.slice(0, 200).map((e, i) => {
                const color = EVENT_COLOR[e.event] ?? "rgba(255,255,255,0.3)";
                return (
                  <div
                    key={`${e.ts}-${i}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "120px 160px 1fr 80px",
                      gap: 12,
                      padding: "8px 16px",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        background: `${color}18`,
                        color,
                        padding: "2px 6px",
                        borderRadius: 4,
                        textTransform: "uppercase" as const,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap" as const,
                      }}
                    >
                      {e.event}
                    </span>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                      {(e.sessionId ?? "").slice(-8) || "—"}
                    </span>
                    <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.55)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                      {e.page ?? e.surface ?? e.rating ?? e.query ?? JSON.stringify(e).slice(0, 80)}
                    </span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "right" as const }}>
                      {timeAgo(e.ts)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
