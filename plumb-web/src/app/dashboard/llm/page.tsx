"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type BtSpan = {
  id: string;
  name: string;
  input: string;
  output: string;
  model: string;
  surface: string;
  latencyMs: number | null;
  tokens: number;
  hadThinking: boolean;
  thinkingLength: number;
  created: string;
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

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const MODEL_COLORS: Record<string, string> = {
  "claude": "#cc785c",
  "gemini": "#4285f4",
  "gpt": "#1db584",
};

function modelColor(model: string): string {
  for (const [key, color] of Object.entries(MODEL_COLORS)) {
    if (model.toLowerCase().includes(key)) return color;
  }
  return "rgba(255,255,255,0.3)";
}

export default function LlmCallsPage() {
  const [spans, setSpans] = useState<BtSpan[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<BtSpan | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/board/braintrust");
      const data = await res.json() as { spans: BtSpan[]; configured: boolean };
      setSpans(data.spans ?? []);
      setConfigured(data.configured);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetch_();
    const t = setInterval(() => void fetch_(), 15_000);
    return () => clearInterval(t);
  }, [fetch_]);

  const avgLatency =
    spans.filter((s) => s.latencyMs !== null).length > 0
      ? Math.round(
          spans.filter((s) => s.latencyMs !== null).reduce((a, s) => a + (s.latencyMs ?? 0), 0) /
            spans.filter((s) => s.latencyMs !== null).length
        )
      : null;

  const thinkingCount = spans.filter((s) => s.hadThinking).length;
  const totalTokens = spans.reduce((a, s) => a + s.tokens, 0);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
        <Link
          href="/dashboard"
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.3)",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          ← Overview
        </Link>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: "-0.03em" }}>
          LLM Calls
        </h1>
        {configured === false && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              background: "rgba(245,158,11,0.12)",
              color: "rgba(245,158,11,0.9)",
              border: "1px solid rgba(245,158,11,0.25)",
              padding: "3px 8px",
              borderRadius: 5,
            }}
          >
            Braintrust not configured
          </span>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 24 }}>
        {[
          ["Total spans", spans.length],
          ["Avg latency", formatMs(avgLatency)],
          ["With reasoning", `${thinkingCount} (${spans.length > 0 ? Math.round((thinkingCount / spans.length) * 100) : 0}%)`],
          ["Total tokens", totalTokens.toLocaleString()],
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

      <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 420px" : "1fr", gap: 16 }}>
        {/* Spans table */}
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                {["Surface", "Input", "Model", "Tokens", "Latency", "Time"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "11px 14px",
                      textAlign: "left",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "rgba(255,255,255,0.3)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      background: "rgba(255,255,255,0.02)",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && spans.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "24px 14px", fontSize: 12, color: "rgba(255,255,255,0.25)", textAlign: "center" }}>
                    Loading…
                  </td>
                </tr>
              ) : spans.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "24px 14px", fontSize: 12, color: "rgba(255,255,255,0.25)", textAlign: "center" }}>
                    No spans yet. LLM calls will appear here once Braintrust is wired up and the app is running.
                  </td>
                </tr>
              ) : (
                spans.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setSelected(selected?.id === s.id ? null : s)}
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      cursor: "pointer",
                      background: selected?.id === s.id ? "rgba(204,120,92,0.07)" : "transparent",
                      transition: "background 0.1s",
                    }}
                  >
                    <td style={{ padding: "9px 14px" }}>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          background: s.hadThinking ? "rgba(204,120,92,0.15)" : "rgba(255,255,255,0.06)",
                          color: s.hadThinking ? "#cc785c" : "rgba(255,255,255,0.4)",
                          padding: "2px 6px",
                          borderRadius: 4,
                          textTransform: "uppercase",
                        }}
                      >
                        {s.surface}
                      </span>
                    </td>
                    <td style={{ padding: "9px 14px", maxWidth: 280 }}>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.input || "(empty)"}
                      </div>
                    </td>
                    <td style={{ padding: "9px 14px" }}>
                      <span style={{ fontSize: 11, color: modelColor(s.model), fontWeight: 600 }}>{s.model}</span>
                    </td>
                    <td style={{ padding: "9px 14px", fontSize: 11, color: "rgba(255,255,255,0.4)", fontVariantNumeric: "tabular-nums" }}>
                      {s.tokens > 0 ? s.tokens.toLocaleString() : "—"}
                    </td>
                    <td style={{ padding: "9px 14px", fontSize: 12, color: "#1db584", fontVariantNumeric: "tabular-nums" }}>
                      {formatMs(s.latencyMs)}
                    </td>
                    <td style={{ padding: "9px 14px", fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
                      {timeAgo(s.created)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Detail panel */}
        {selected && (
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 12,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              overflow: "auto",
              maxHeight: 600,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{selected.name}</h3>
              <button
                type="button"
                onClick={() => setSelected(null)}
                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 16, padding: 0 }}
              >
                ×
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                ["Model", selected.model],
                ["Surface", selected.surface],
                ["Latency", formatMs(selected.latencyMs)],
                ["Tokens", selected.tokens.toLocaleString()],
                ["Thinking", selected.hadThinking ? `Yes (${selected.thinkingLength.toLocaleString()} chars)` : "No"],
                ["Time", new Date(selected.created).toLocaleTimeString()],
              ].map(([k, v]) => (
                <div key={k as string} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "8px 10px" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>{k}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>{v}</div>
                </div>
              ))}
            </div>

            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Input</div>
              <pre style={{ margin: 0, fontSize: 11.5, color: "rgba(255,255,255,0.65)", background: "rgba(255,255,255,0.04)", borderRadius: 7, padding: 10, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 180, overflow: "auto", lineHeight: 1.5 }}>
                {selected.input || "(empty)"}
              </pre>
            </div>

            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Output</div>
              <pre style={{ margin: 0, fontSize: 11.5, color: "rgba(255,255,255,0.65)", background: "rgba(255,255,255,0.04)", borderRadius: 7, padding: 10, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 200, overflow: "auto", lineHeight: 1.5 }}>
                {selected.output || "(empty)"}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
