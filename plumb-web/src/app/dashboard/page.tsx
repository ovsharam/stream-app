"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Stats = {
  sessions: number; llmCalls: number; avgLatencyMs: number | null;
  thinkingRate: number; feedImpressions: number;
  signalRatings: { confirmed: number; noise: number; known: number };
  topPages: [string, number][]; totalEvents: number; _error?: string;
};
type BtSpan = { id: string; input: string; model: string; surface: string; latencyMs: number | null; tokens: number; hadThinking: boolean; created: string; };
type CiRun = { id: number; name: string; branch: string; status: string; conclusion: string | null; createdAt: string; durationMs: number | null; url: string; commitMessage: string; };

function ms(v: number | null) { return v === null ? "—" : v < 1000 ? `${v}ms` : `${(v / 1000).toFixed(1)}s`; }
function ago(iso: string) {
  const d = Date.now() - new Date(iso).getTime(), m = Math.floor(d / 60000);
  return m < 1 ? "now" : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`;
}

const DOT: Record<string, { icon: string; color: string }> = {
  success: { icon: "✓", color: "#3ecf8e" },
  failure: { icon: "✗", color: "#e05c45" },
  in_progress: { icon: "●", color: "#f59e0b" },
  cancelled: { icon: "–", color: "#444" },
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [spans, setSpans] = useState<BtSpan[]>([]);
  const [runs, setRuns] = useState<CiRun[]>([]);

  const load = useCallback(async () => {
    const [s, b, c] = await Promise.allSettled([
      fetch("/api/board/telemetry?mode=stats").then(r => r.json()),
      fetch("/api/board/braintrust").then(r => r.json()),
      fetch("/api/board/cicd").then(r => r.json()),
    ]);
    if (s.status === "fulfilled") setStats(s.value as Stats);
    if (b.status === "fulfilled") setSpans(((b.value as { spans?: BtSpan[] }).spans) ?? []);
    if (c.status === "fulfilled") setRuns(((c.value as { runs?: CiRun[] }).runs) ?? []);
  }, []);

  useEffect(() => { void load(); const t = setInterval(() => void load(), 15000); return () => clearInterval(t); }, [load]);

  const passRate = runs.length ? Math.round(runs.filter(r => r.conclusion === "success").length / runs.length * 100) : null;
  const latestRun = runs[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Topbar */}
      <div className="db-topbar">
        <span className="db-topbar-title">Overview</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="db-live">Live · refreshes 15s</span>
          <button type="button" className="db-refresh" onClick={() => void load()}>Refresh</button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="db-stat-row">
        <div className="db-stat"><div className="db-stat-label">LLM calls</div><div className="db-stat-value">{stats?.llmCalls ?? "—"}</div><div className="db-stat-sub">last 24h</div></div>
        <div className="db-stat"><div className="db-stat-label">Avg latency</div><div className="db-stat-value">{ms(stats?.avgLatencyMs ?? null)}</div></div>
        <div className="db-stat"><div className="db-stat-label">Thinking rate</div><div className="db-stat-value">{stats ? `${stats.thinkingRate}%` : "—"}</div><div className="db-stat-sub">with reasoning</div></div>
        <div className="db-stat"><div className="db-stat-label">Sessions</div><div className="db-stat-value">{stats?.sessions ?? "—"}</div></div>
        <div className="db-stat"><div className="db-stat-label">Feed signals</div><div className="db-stat-value">{stats ? stats.signalRatings.confirmed + stats.signalRatings.noise + stats.signalRatings.known : "—"}</div></div>
        <div className="db-stat"><div className="db-stat-label">CI pass rate</div><div className={`db-stat-value${passRate !== null && passRate < 80 ? " warn" : ""}`}>{passRate !== null ? `${passRate}%` : "—"}</div><div className="db-stat-sub">{runs.length} runs</div></div>
      </div>

      {/* Three-pane body */}
      <div className="db-panes" style={{ gridTemplateColumns: "1fr 1fr 260px" }}>
        {/* LLM */}
        <div className="db-pane">
          <div className="db-pane-head">
            <span className="db-pane-title">LLM Traces</span>
            <Link href="/dashboard/llm" className="db-pane-link">All →</Link>
          </div>
          <div className="db-pane-body">
            {spans.length === 0 ? (
              <div className="db-empty">No traces yet.<br />Start the Plumb server with <code style={{ color: "#555" }}>BRAINTRUST_API_KEY</code> set.</div>
            ) : spans.slice(0, 25).map(s => (
              <div key={s.id} className="db-row">
                <span className={`db-tag ${s.hadThinking ? "thinking" : "normal"}`}>{s.surface}</span>
                <span className="db-text-main">{s.input || "(empty)"}</span>
                <span className="db-text-mono">{ms(s.latencyMs)}</span>
                <span className="db-text-dim">{ago(s.created)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Behavior */}
        <div className="db-pane">
          <div className="db-pane-head">
            <span className="db-pane-title">Behavior</span>
            <Link href="/dashboard/telemetry" className="db-pane-link">All →</Link>
          </div>
          <div className="db-pane-body">
            <div className="db-section-label">Signal ratings</div>
            <div className="db-signal-grid">
              {(["confirmed", "noise", "known"] as const).map((k, i) => (
                <div key={k} className="db-signal-card">
                  <div className="db-signal-num" style={{ color: ["#3ecf8e","#e05c45","#cc785c"][i] }}>{stats?.signalRatings[k] ?? 0}</div>
                  <div className="db-signal-lbl">{k}</div>
                </div>
              ))}
            </div>
            <div className="db-section-label">Top pages</div>
            {stats && stats.topPages.length > 0 ? stats.topPages.map(([page, count]) => (
              <div key={page} className="db-bar-row">
                <span className="db-bar-label">{page}</span>
                <div className="db-bar-track"><div className="db-bar-fill" style={{ width: `${(count / stats.topPages[0][1]) * 100}%` }} /></div>
                <span className="db-bar-count">{count}</span>
              </div>
            )) : <div style={{ padding: "6px 16px", fontSize: 11, color: "#383838" }}>No events yet.</div>}
          </div>
        </div>

        {/* CI/CD */}
        <div className="db-pane">
          <div className="db-pane-head">
            <span className="db-pane-title">CI / CD</span>
            <Link href="/dashboard/cicd" className="db-pane-link">All →</Link>
          </div>
          {latestRun && (() => {
            const d = DOT[latestRun.conclusion ?? latestRun.status] ?? { icon: "·", color: "#444" };
            return (
              <div className="db-ci-latest">
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: d.color, fontSize: 12 }}>{d.icon}</span>
                  <span className="db-ci-branch">{latestRun.branch}</span>
                </div>
                <div className="db-ci-commit">{latestRun.commitMessage}</div>
              </div>
            );
          })()}
          <div className="db-pane-body">
            {runs.length === 0 ? (
              <div className="db-empty">No CI runs yet.</div>
            ) : runs.slice(0, 20).map(run => {
              const d = DOT[run.conclusion ?? run.status] ?? { icon: "·", color: "#444" };
              return (
                <a key={run.id} href={run.url} target="_blank" rel="noreferrer" className="db-row">
                  <span style={{ color: d.color, fontSize: 12, flexShrink: 0 }}>{d.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="db-text-main" style={{ color: "#777" }}>{run.name}</div>
                    <div className="db-text-dim">{run.branch} · {ago(run.createdAt)}</div>
                  </div>
                  <span className="db-text-dim">{run.durationMs ? `${Math.round(run.durationMs/1000)}s` : "—"}</span>
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
