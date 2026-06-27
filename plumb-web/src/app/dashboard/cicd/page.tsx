"use client";

import { useEffect, useState, useCallback } from "react";

type CiRun = {
  id: number; name: string; branch: string; status: string;
  conclusion: string | null; createdAt: string; durationMs: number | null;
  url: string; commitMessage: string;
};

function ago(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function dur(ms: number | null) {
  if (ms === null) return "—";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

const DOT: Record<string, { icon: string; color: string }> = {
  success: { icon: "✓", color: "#3ecf8e" },
  failure: { icon: "✗", color: "#e05c45" },
  cancelled: { icon: "–", color: "#444" },
  skipped: { icon: "–", color: "#444" },
  in_progress: { icon: "●", color: "#f59e0b" },
  queued: { icon: "○", color: "#555" },
};

function dot(status: string, conclusion: string | null) {
  return DOT[conclusion ?? status] ?? { icon: "·", color: "#444" };
}

export default function CiCdPage() {
  const [runs, setRuns] = useState<CiRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [branch, setBranch] = useState("all");

  const load = useCallback(async () => {
    const res = await fetch("/api/board/cicd");
    const data = await res.json() as { runs: CiRun[]; error?: string };
    setRuns(data.runs ?? []);
    setError(data.error ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); const t = setInterval(() => void load(), 30000); return () => clearInterval(t); }, [load]);

  const branches = ["all", ...Array.from(new Set(runs.map(r => r.branch)))];
  const filtered = branch === "all" ? runs : runs.filter(r => r.branch === branch);
  const total = runs.length;
  const passing = runs.filter(r => r.conclusion === "success").length;
  const failing = runs.filter(r => r.conclusion === "failure").length;
  const withDur = runs.filter(r => r.durationMs !== null);
  const avgDur = withDur.length ? Math.round(withDur.reduce((a, r) => a + r.durationMs!, 0) / withDur.length) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Topbar */}
      <div className="db-topbar">
        <span className="db-topbar-title">CI / CD</span>
        <button type="button" className="db-refresh" onClick={() => void load()}>Refresh</button>
      </div>

      {/* Stats */}
      <div className="db-stat-row">
        <div className="db-stat"><div className="db-stat-label">Total runs</div><div className="db-stat-value">{total}</div></div>
        <div className="db-stat"><div className="db-stat-label">Passing</div><div className="db-stat-value">{passing}{total > 0 ? <span style={{ fontSize: 12, color: "#444", fontWeight: 400 }}> / {Math.round(passing/total*100)}%</span> : ""}</div></div>
        <div className="db-stat"><div className="db-stat-label">Failing</div><div className={`db-stat-value${failing > 0 ? " warn" : ""}`}>{failing}</div></div>
        <div className="db-stat"><div className="db-stat-label">Avg duration</div><div className="db-stat-value">{dur(avgDur)}</div></div>
      </div>

      {/* Error */}
      {error && (
        <div className="db-error-banner">
          {error.includes("404") ? (
            <>GitHub repo not found. Update <code>GITHUB_REPO</code> in Vercel env to <code>ovsharam/stream-app</code> (or your correct repo slug).</>
          ) : error.includes("401") || error.includes("403") ? (
            <>GitHub token doesn&apos;t have <code>repo</code> scope. Re-generate PAT with <code>actions:read</code> access.</>
          ) : error}
        </div>
      )}

      {/* Branch filter */}
      {branches.length > 1 && (
        <div style={{ display: "flex", gap: 4, padding: "8px 16px", borderBottom: "1px solid #1c1c1c", flexWrap: "wrap" }}>
          {branches.map(b => (
            <button key={b} type="button" onClick={() => setBranch(b)} style={{
              padding: "3px 10px", borderRadius: 4, fontSize: 11, cursor: "pointer",
              background: branch === b ? "#cc785c1a" : "#141414",
              border: `1px solid ${branch === b ? "#cc785c55" : "#222"}`,
              color: branch === b ? "#cc785c" : "#555",
              fontWeight: branch === b ? 600 : 400,
            }}>{b}</button>
          ))}
        </div>
      )}

      {/* Run list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading ? (
          <div className="db-empty">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="db-empty">
            {error ? "Fix the error above to see CI runs." : "No runs yet. Push .github/workflows/ci.yml to GitHub to trigger the first build."}
          </div>
        ) : filtered.map(run => {
          const d = dot(run.status, run.conclusion);
          return (
            <a key={run.id} href={run.url} target="_blank" rel="noreferrer" style={{ display: "grid", gridTemplateColumns: "20px 1fr auto", gap: 10, padding: "10px 16px", borderBottom: "1px solid #141414", textDecoration: "none", alignItems: "center" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#0f0f0f")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ color: d.color, fontSize: 13, fontWeight: 700 }}>{d.icon}</span>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "#c0c0c0" }}>{run.name}</span>
                  <span style={{ fontSize: 10, background: "#161616", border: "1px solid #222", borderRadius: 3, padding: "0 5px", color: "#555" }}>{run.branch}</span>
                  {run.conclusion && <span style={{ fontSize: 10, color: d.color, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>{run.conclusion}</span>}
                </div>
                <div style={{ fontSize: 11, color: "#444", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 520 }}>{run.commitMessage}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "#555", fontVariantNumeric: "tabular-nums" }}>{dur(run.durationMs)}</div>
                <div style={{ fontSize: 10, color: "#383838", marginTop: 1 }}>{ago(run.createdAt)}</div>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
