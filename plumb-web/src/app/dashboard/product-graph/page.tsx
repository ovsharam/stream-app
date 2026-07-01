"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import type {
  IngestJob,
  ReviewQueueItem,
  ProductNode,
  ProductNodeLabel,
} from "@/types/product-graph";

// Routes through the Vercel → Railway proxy
const API = "/api/stream";

const LABEL_COLORS: Record<string, string> = {
  capability: "#1db584",
  limitation: "#e05252",
  integration: "#3e78c8",
  pattern: "#8b5cf6",
  constraint: "#f59e0b",
  workaround: "#ec4899",
};

const LABEL_ICONS: Record<string, string> = {
  capability: "✓",
  limitation: "✗",
  integration: "⟷",
  pattern: "◈",
  constraint: "⊘",
  workaround: "↻",
};

type Tab = "ingest" | "review" | "query" | "controls";

const CONTROLS_KEY = "pg-controls-v1";

function loadControls() {
  try {
    const raw = localStorage.getItem(CONTROLS_KEY);
    if (raw) return JSON.parse(raw) as GraphControls;
  } catch { /* ignore */ }
  return null;
}

export type GraphControls = {
  minScore: number;
  caps: Record<string, number>;
};

const DEFAULT_CONTROLS: GraphControls = {
  minScore: 2,
  caps: { capability: 8, limitation: 6, constraint: 6, integration: 5, pattern: 5, workaround: 4 },
};

export default function ProductGraphPage() {
  const [customerId, setCustomerId] = useState("plumb-internal");
  const [tab, setTab] = useState<Tab>("ingest");
  const [controls, setControls] = useState<GraphControls>(DEFAULT_CONTROLS);

  useEffect(() => {
    const saved = loadControls();
    if (saved) setControls(saved);
  }, []);

  function saveControls(next: GraphControls) {
    setControls(next);
    try { localStorage.setItem(CONTROLS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
        <Link
          href="/dashboard"
          style={{ fontSize: 12, color: "var(--db-text-6)", textDecoration: "none", fontWeight: 600 }}
        >
          ← Overview
        </Link>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: "-0.03em", color: "var(--db-text)" }}>
          Product Graph
        </h1>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 11, color: "var(--db-text-5)", flexShrink: 0 }}>Customer</label>
          {[
            { id: "plumb-internal", label: "Mixed" },
            { id: "helix-demo", label: "Helix" },
            { id: "vapi-demo", label: "Vapi" },
          ].map((preset) => (
            <button
              key={preset.id}
              onClick={() => setCustomerId(preset.id)}
              style={{
                fontSize: 11, padding: "3px 10px", borderRadius: 5,
                background: customerId === preset.id ? "var(--db-overlay-md)" : "transparent",
                color: customerId === preset.id ? "var(--db-text)" : "var(--db-text-5)",
                border: `1px solid ${customerId === preset.id ? "var(--db-border-alt)" : "transparent"}`,
                cursor: "pointer", fontWeight: customerId === preset.id ? 600 : 400,
              }}
            >
              {preset.label}
            </button>
          ))}
          <input
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value.trim())}
            style={{
              fontSize: 12, border: "1px solid var(--db-input-border)", borderRadius: 5,
              padding: "4px 10px", width: 130, background: "var(--db-input-bg)", color: "var(--db-text-2)",
            }}
            placeholder="custom-id"
          />
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex", gap: 2, marginBottom: 24, borderBottom: "1px solid var(--db-border)", paddingBottom: 0,
        }}
      >
        {(["ingest", "review", "query", "controls"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontSize: 12, fontWeight: tab === t ? 600 : 400,
              color: tab === t ? "var(--db-text)" : "var(--db-text-4)",
              background: "none", border: "none",
              borderBottom: `2px solid ${tab === t ? "#cc785c" : "transparent"}`,
              padding: "8px 16px", cursor: "pointer", textTransform: "capitalize",
              marginBottom: -1,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "ingest" && <IngestTab customerId={customerId} />}
      {tab === "review" && <ReviewTab customerId={customerId} />}
      {tab === "query" && <QueryTab customerId={customerId} controls={controls} />}
      {tab === "controls" && <ControlsTab controls={controls} onChange={saveControls} />}
    </div>
  );
}

// ─── Ingest Tab ───────────────────────────────────────────────────────────────

function IngestTab({ customerId }: { customerId: string }) {
  const [jobs, setJobs] = useState<IngestJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteLabel, setPasteLabel] = useState("product-docs.txt");
  const [urlMode, setUrlMode] = useState(false);
  const [urlText, setUrlText] = useState("");
  const [urlResults, setUrlResults] = useState<{ url: string; jobId?: string; error?: string }[]>([]);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const defaultScenario = customerId === "vapi-demo" ? "voice-ai" : "b2b-payments";
  const [seedScenario, setSeedScenario] = useState<"b2b-payments" | "voice-ai">(defaultScenario);

  const loadJobs = useCallback(async () => {
    const r = await fetch(`${API}/product-graph/jobs?customerId=${encodeURIComponent(customerId)}`);
    if (r.ok) setJobs(await r.json());
  }, [customerId]);

  async function seedDemo() {
    setSeeding(true);
    setSeedMsg(null);
    const r = await fetch(`${API}/product-graph/seed-demo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, scenario: seedScenario }),
    });
    const data = await r.json() as { message?: string; chunkCount?: number; scenario?: string };
    const label = seedScenario === "voice-ai" ? "Vapi" : "Helix";
    setSeedMsg(`Seeding ${data.chunkCount ?? "?"} items from ${label} demo dataset — check Review tab in ~60s`);
    setSeeding(false);
    setTimeout(() => void loadJobs(), 5000);
  }

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  async function submitFile(fileName: string, mimeType: string, content: string) {
    setLoading(true);
    const r = await fetch(`${API}/product-graph/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, fileName, mimeType, content }),
    });
    setLoading(false);
    if (r.ok) {
      setPasteText("");
      await loadJobs();
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const b64 = btoa(e.target!.result as string);
        await submitFile(file.name, file.type || "text/plain", b64);
      };
      reader.readAsBinaryString(file);
    }
  }

  async function handlePasteSubmit() {
    if (!pasteText.trim()) return;
    const b64 = btoa(unescape(encodeURIComponent(pasteText)));
    await submitFile(pasteLabel || "paste.txt", "text/plain", b64);
  }

  async function handleUrlSubmit() {
    const urls = urlText.split('\n').map(u => u.trim()).filter(u => u.startsWith('http'));
    if (urls.length === 0) return;
    setLoading(true);
    setUrlResults([]);
    try {
      const r = await fetch(`${API}/product-graph/ingest-urls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, urls }),
      });
      if (r.ok) {
        const data = await r.json() as { jobs: { url: string; jobId?: string; error?: string }[] };
        setUrlResults(data.jobs);
        setUrlText("");
        await loadJobs();
      } else {
        const err = await r.json() as { error: string };
        setUrlResults([{ url: "—", error: err.error }]);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 28 }}>
      <div>
        <p style={{ fontSize: 12, color: "var(--db-text-4)", marginBottom: 20, lineHeight: 1.6 }}>
          Upload product docs, API references, internal specs, or Slack exports.
          Claude extracts capabilities, limitations, integrations, and constraints —
          then queues them for your review before writing to the graph.
        </p>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); void handleFiles(e.dataTransfer.files); }}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `1px dashed ${dragging ? "#1db584" : "var(--db-border-alt)"}`,
            borderRadius: 10, padding: "40px 24px", textAlign: "center", cursor: "pointer",
            background: dragging ? "rgba(29,181,132,0.04)" : "var(--db-surface)",
            transition: "all 0.15s", marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: loading ? "var(--db-text-4)" : "var(--db-text-3)" }}>
            {loading ? "Processing..." : "Drop files here or click to upload"}
          </div>
          <div style={{ fontSize: 11, color: "var(--db-text-6)", marginTop: 4 }}>txt · md · pdf</div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
            style={{ display: "none" }}
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </div>

        <div style={{ display: "flex", gap: 16, marginBottom: 4 }}>
          <button
            onClick={() => { setPasteMode(!pasteMode); setUrlMode(false); }}
            style={{ fontSize: 11, color: "var(--db-text-5)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
          >
            {pasteMode ? "Hide paste mode" : "Or paste text directly"}
          </button>
          <button
            onClick={() => { setUrlMode(!urlMode); setPasteMode(false); }}
            style={{ fontSize: 11, color: "var(--db-text-5)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
          >
            {urlMode ? "Hide URL import" : "Or import from URLs"}
          </button>
        </div>

        {pasteMode && (
          <div style={{ marginTop: 12 }}>
            <input
              value={pasteLabel}
              onChange={(e) => setPasteLabel(e.target.value)}
              placeholder="File label (e.g. api-docs.txt)"
              style={{
                width: "100%", fontSize: 12, border: "1px solid var(--db-border-alt)", borderRadius: 5,
                padding: "7px 10px", marginBottom: 8, background: "var(--db-input-bg)", color: "var(--db-text-2)",
                boxSizing: "border-box",
              }}
            />
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste product documentation, API specs, Slack export text..."
              rows={10}
              style={{
                width: "100%", fontSize: 12, border: "1px solid var(--db-border-alt)", borderRadius: 5,
                padding: "10px 12px", resize: "vertical", background: "var(--db-input-bg)", color: "var(--db-text-2)",
                boxSizing: "border-box", fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              }}
            />
            <button
              onClick={() => void handlePasteSubmit()}
              disabled={loading || !pasteText.trim()}
              style={{
                marginTop: 8, fontSize: 12, padding: "7px 16px", borderRadius: 5,
                background: loading || !pasteText.trim() ? "var(--db-surface-2)" : "#cc785c",
                color: loading || !pasteText.trim() ? "var(--db-text-5)" : "#fff",
                border: "none", cursor: loading || !pasteText.trim() ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Processing..." : "Extract from text"}
            </button>
          </div>
        )}

        {urlMode && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: "var(--db-text-5)", marginBottom: 8, lineHeight: 1.5 }}>
              Paste URLs — one per line. We&apos;ll scrape each page and extract product knowledge.
              Up to 20 URLs at once.
            </div>
            <textarea
              value={urlText}
              onChange={(e) => setUrlText(e.target.value)}
              placeholder={"https://docs.stripe.com/api/cards\nhttps://stripe.com/docs/payments\nhttps://docs.stripe.com/radar"}
              rows={8}
              style={{
                width: "100%", fontSize: 12, border: "1px solid var(--db-border-alt)", borderRadius: 5,
                padding: "10px 12px", resize: "vertical", background: "var(--db-input-bg)", color: "var(--db-text-2)",
                boxSizing: "border-box", fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
              <button
                onClick={() => void handleUrlSubmit()}
                disabled={loading || !urlText.trim()}
                style={{
                  fontSize: 12, padding: "7px 16px", borderRadius: 5,
                  background: loading || !urlText.trim() ? "var(--db-surface-2)" : "#cc785c",
                  color: loading || !urlText.trim() ? "var(--db-text-5)" : "#fff",
                  border: "none", cursor: loading || !urlText.trim() ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "Queuing..." : `Import ${urlText.split('\n').filter(u => u.trim().startsWith('http')).length || ""} URL${urlText.split('\n').filter(u => u.trim().startsWith('http')).length === 1 ? "" : "s"}`}
              </button>
              <span style={{ fontSize: 11, color: "var(--db-text-6)" }}>
                Jobs start immediately — check the queue on the right
              </span>
            </div>
            {urlResults.length > 0 && (
              <div style={{ marginTop: 12, border: "1px solid var(--db-border)", borderRadius: 6, overflow: "hidden" }}>
                {urlResults.map((r, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "7px 12px",
                    borderBottom: i < urlResults.length - 1 ? "1px solid var(--db-border)" : "none",
                    fontSize: 11,
                  }}>
                    <span style={{ color: r.error ? "#ef4444" : "#1db584", flexShrink: 0 }}>
                      {r.error ? "✗" : "✓"}
                    </span>
                    <span style={{ color: "var(--db-text-4)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.url}
                    </span>
                    <span style={{ color: r.error ? "#ef4444" : "var(--db-text-5)", flexShrink: 0 }}>
                      {r.error ?? `job ${r.jobId?.slice(0, 8)}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Demo seed banner */}
      <div style={{
        border: "1px dashed var(--db-border-alt)", borderRadius: 8, padding: "14px 16px",
        marginBottom: 20,
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--db-text-3)", marginBottom: 4 }}>
          Load demo dataset
        </div>
        <div style={{ fontSize: 11, color: "var(--db-text-5)", marginBottom: 10 }}>
          Synthetic Linear issues, Slack threads, GitHub releases, and internal docs — feeds through the same extraction pipeline as real connectors.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {(["b2b-payments", "voice-ai"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSeedScenario(s)}
              style={{
                fontSize: 11, padding: "5px 12px", borderRadius: 5,
                background: seedScenario === s ? "var(--db-overlay-md)" : "transparent",
                color: seedScenario === s ? "var(--db-text)" : "var(--db-text-5)",
                border: `1px solid ${seedScenario === s ? "var(--db-border-alt)" : "transparent"}`,
                cursor: "pointer", fontWeight: seedScenario === s ? 600 : 400,
              }}
            >
              {s === "b2b-payments" ? "Helix Payments" : "Vapi Voice AI"}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button
            onClick={() => void seedDemo()}
            disabled={seeding}
            style={{
              fontSize: 12, fontWeight: 600, padding: "7px 14px", borderRadius: 6,
              background: seeding ? "var(--db-surface-2)" : "var(--db-surface)",
              color: seeding ? "var(--db-text-5)" : "var(--db-text-3)",
              border: "1px solid var(--db-border-alt)", cursor: seeding ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {seeding ? "Seeding…" : "Load dataset →"}
          </button>
        </div>
        {seedMsg && (
          <div style={{ fontSize: 11, color: "#1db584", marginTop: 8 }}>{seedMsg}</div>
        )}
      </div>

      {/* Jobs list */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--db-text-5)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Ingestion Jobs
          </span>
          <button
            onClick={() => void loadJobs()}
            style={{ fontSize: 11, color: "var(--db-text-5)", background: "none", border: "none", cursor: "pointer" }}
          >
            ↻
          </button>
        </div>
        {jobs.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--db-text-6)", padding: "24px 0", textAlign: "center" }}>
            No jobs yet
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} onRefresh={() => void loadJobs()} />
          ))}
        </div>
      </div>
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = {
  pending: "var(--db-text-5)", chunking: "#f59e0b", extracting: "#3e78c8",
  review: "#8b5cf6", writing: "#f59e0b", done: "#1db584", error: "#e05252",
};

function JobCard({ job, onRefresh }: { job: IngestJob; onRefresh: () => void }) {
  return (
    <div
      style={{
        background: "var(--db-surface)", border: "1px solid var(--db-border)", borderRadius: 8, padding: "12px 14px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span
          style={{
            fontSize: 12, fontWeight: 500, color: "var(--db-text-2)",
            maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          {job.fileName}
        </span>
        <span
          style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
            color: STATUS_COLOR[job.status] ?? "var(--db-text-5)", textTransform: "uppercase",
          }}
        >
          {job.status}
        </span>
      </div>
      <div style={{ fontSize: 11, color: "var(--db-text-5)" }}>
        {job.chunkCount != null && `${job.chunkCount} chunks · `}
        {job.nodeCount != null && `${job.nodeCount} nodes extracted`}
        {job.errorMsg && <span style={{ color: "#e05252" }}> Error: {job.errorMsg}</span>}
      </div>
      {job.status === "extracting" && (
        <button
          onClick={onRefresh}
          style={{ fontSize: 11, color: "#3e78c8", background: "none", border: "none", cursor: "pointer", marginTop: 4, padding: 0 }}
        >
          Check status
        </button>
      )}
    </div>
  );
}

// ─── Review Tab ───────────────────────────────────────────────────────────────

function ReviewTab({ customerId }: { customerId: string }) {
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [writing, setWriting] = useState(false);
  const [writeResult, setWriteResult] = useState<{ nodes: number; edges: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const qs = filter === "all" ? "" : `&status=${filter}`;
    const r = await fetch(`${API}/product-graph/review?customerId=${encodeURIComponent(customerId)}${qs}`);
    if (r.ok) setItems(await r.json());
    setLoading(false);
  }, [customerId, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(id: string, editedName?: string, editedDescription?: string) {
    await fetch(`${API}/product-graph/review/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editedName, editedDescription }),
    });
    await load();
    setEditingId(null);
  }

  async function reject(id: string) {
    await fetch(`${API}/product-graph/review/${id}/reject`, { method: "POST" });
    await load();
  }

  async function approveAll() {
    const pending = items.filter((i) => i.status === "pending");
    const BATCH = 10;
    for (let i = 0; i < pending.length; i += BATCH) {
      await Promise.all(pending.slice(i, i + BATCH).map((item) => approve(item.id)));
    }
    await load();
  }

  async function writeToGraph() {
    const approved = items.filter((i) => i.status === "approved");
    if (approved.length === 0) return;
    setWriting(true);
    const jobIds = [...new Set(approved.map((i) => i.jobId))];
    let total = { nodes: 0, edges: 0 };
    for (const jobId of jobIds) {
      const r = await fetch(`${API}/product-graph/write`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, customerId }),
      });
      if (r.ok) {
        const result = (await r.json()) as { nodes: number; edges: number };
        total = { nodes: total.nodes + result.nodes, edges: total.edges + result.edges };
      }
    }
    setWriteResult(total);
    setWriting(false);
    await load();
  }

  const pending = items.filter((i) => i.status === "pending").length;
  const approved = items.filter((i) => i.status === "approved").length;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 2 }}>
          {(["pending", "approved", "rejected", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                fontSize: 11, padding: "4px 10px", borderRadius: 5, cursor: "pointer",
                background: filter === f ? "var(--db-border-alt)" : "transparent",
                color: filter === f ? "var(--db-text)" : "var(--db-text-4)",
                border: `1px solid ${filter === f ? "var(--db-border-alt)" : "transparent"}`,
                textTransform: "capitalize",
              }}
            >
              {f}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {pending > 0 && (
            <button
              onClick={() => void approveAll()}
              style={{
                fontSize: 11, padding: "5px 12px", borderRadius: 5, cursor: "pointer",
                background: "transparent", color: "var(--db-text-3)",
                border: "1px solid var(--db-border-alt)",
              }}
            >
              Approve all ({pending})
            </button>
          )}
          {approved > 0 && (
            <button
              onClick={() => void writeToGraph()}
              disabled={writing}
              style={{
                fontSize: 11, padding: "5px 12px", borderRadius: 5, cursor: writing ? "not-allowed" : "pointer",
                background: writing ? "var(--db-surface-2)" : "#cc785c", color: writing ? "var(--db-text-5)" : "#fff", border: "none",
              }}
            >
              {writing ? "Writing..." : `Write to graph (${approved})`}
            </button>
          )}
          <button
            onClick={() => void load()}
            style={{ fontSize: 11, color: "var(--db-text-5)", background: "none", border: "none", cursor: "pointer" }}
          >
            ↻
          </button>
        </div>
      </div>

      {writeResult && (
        <div
          style={{
            background: "rgba(29,181,132,0.08)", border: "1px solid rgba(29,181,132,0.2)",
            borderRadius: 7, padding: "9px 14px", marginBottom: 14, fontSize: 12, color: "#1db584",
          }}
        >
          ✓ Wrote {writeResult.nodes} nodes and {writeResult.edges} edges to the product graph
        </div>
      )}

      {loading && (
        <div style={{ fontSize: 12, color: "var(--db-text-6)", padding: "32px 0", textAlign: "center" }}>Loading...</div>
      )}
      {!loading && items.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--db-text-6)", padding: "32px 0", textAlign: "center" }}>
          No {filter === "all" ? "" : filter} items. Upload a document in the Ingest tab.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((item) => (
          <ReviewCard
            key={item.id}
            item={item}
            isEditing={editingId === item.id}
            editName={editName}
            editDesc={editDesc}
            onEdit={() => { setEditingId(item.id); setEditName(item.name); setEditDesc(item.description); }}
            onEditName={setEditName}
            onEditDesc={setEditDesc}
            onApprove={() => void approve(item.id, editingId === item.id ? editName : undefined, editingId === item.id ? editDesc : undefined)}
            onReject={() => void reject(item.id)}
            onCancelEdit={() => setEditingId(null)}
          />
        ))}
      </div>
    </div>
  );
}

function ReviewCard({
  item, isEditing, editName, editDesc,
  onEdit, onEditName, onEditDesc, onApprove, onReject, onCancelEdit,
}: {
  item: ReviewQueueItem;
  isEditing: boolean;
  editName: string;
  editDesc: string;
  onEdit: () => void;
  onEditName: (v: string) => void;
  onEditDesc: (v: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onCancelEdit: () => void;
}) {
  const color = LABEL_COLORS[item.label] ?? "var(--db-text-3)";
  const icon = LABEL_ICONS[item.label] ?? "·";

  return (
    <div
      style={{
        background: item.status === "approved" ? "rgba(29,181,132,0.05)" : "var(--db-surface)",
        border: `1px solid ${item.status === "approved" ? "rgba(29,181,132,0.2)" : item.status === "rejected" ? "rgba(224,82,82,0.15)" : "var(--db-border)"}`,
        borderRadius: 8, padding: "12px 14px",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div
          style={{
            flexShrink: 0, width: 24, height: 24, borderRadius: 5,
            background: `${color}18`, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 12, color, fontWeight: 700, marginTop: 1,
          }}
        >
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {isEditing ? (
            <>
              <input
                value={editName}
                onChange={(e) => onEditName(e.target.value)}
                style={{
                  width: "100%", fontSize: 13, fontWeight: 500, border: "1px solid var(--db-border-alt)",
                  borderRadius: 5, padding: "4px 8px", marginBottom: 5, background: "var(--db-surface-2)",
                  color: "var(--db-text)", boxSizing: "border-box",
                }}
              />
              <textarea
                value={editDesc}
                onChange={(e) => onEditDesc(e.target.value)}
                rows={2}
                style={{
                  width: "100%", fontSize: 12, border: "1px solid var(--db-border-alt)",
                  borderRadius: 5, padding: "4px 8px", resize: "vertical",
                  background: "var(--db-surface-2)", color: "var(--db-text-2)", boxSizing: "border-box",
                }}
              />
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--db-text-2)", marginBottom: 3 }}>
                {item.editedName ?? item.name}
              </div>
              <div style={{ fontSize: 12, color: "var(--db-text-4)", lineHeight: 1.45 }}>
                {item.editedDescription ?? item.description}
              </div>
            </>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7 }}>
            <span
              style={{
                fontSize: 9, fontWeight: 700, color,
                background: `${color}14`, borderRadius: 3, padding: "2px 6px",
                textTransform: "uppercase", letterSpacing: "0.05em",
              }}
            >
              {item.label}
            </span>
            <span style={{ fontSize: 10, color: "var(--db-text-6)" }}>
              {Math.round(item.confidence * 100)}% confidence
            </span>
          </div>
        </div>

        {item.status === "pending" && (
          <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
            {isEditing ? (
              <>
                <button
                  onClick={onApprove}
                  style={{ fontSize: 11, padding: "4px 9px", borderRadius: 5, background: "#1db584", color: "#fff", border: "none", cursor: "pointer" }}
                >
                  Save & approve
                </button>
                <button
                  onClick={onCancelEdit}
                  style={{ fontSize: 11, padding: "4px 9px", borderRadius: 5, background: "var(--db-surface-2)", color: "var(--db-text-3)", border: "none", cursor: "pointer" }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={onApprove}
                  style={{ fontSize: 11, padding: "4px 9px", borderRadius: 5, background: "#1a2a1a", color: "#1db584", border: "1px solid #1a3a1a", cursor: "pointer" }}
                >
                  ✓
                </button>
                <button
                  onClick={onEdit}
                  style={{ fontSize: 11, padding: "4px 9px", borderRadius: 5, background: "var(--db-surface-2)", color: "var(--db-text-3)", border: "1px solid var(--db-border-alt)", cursor: "pointer" }}
                >
                  Edit
                </button>
                <button
                  onClick={onReject}
                  style={{ fontSize: 11, padding: "4px 9px", borderRadius: 5, background: "var(--db-surface-2)", color: "#e05252", border: "1px solid rgba(224,82,82,0.2)", cursor: "pointer" }}
                >
                  ✗
                </button>
              </>
            )}
          </div>
        )}
        {item.status !== "pending" && (
          <span
            style={{
              fontSize: 11, fontWeight: 600,
              color: item.status === "approved" ? "#1db584" : "#e05252",
              flexShrink: 0,
            }}
          >
            {item.status === "approved" ? "✓" : "✗"}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Query Tab ────────────────────────────────────────────────────────────────

type GraphQueryResult = {
  capabilities: ProductNode[];
  limitations: ProductNode[];
  integrations: ProductNode[];
  patterns: ProductNode[];
  constraints: ProductNode[];
  workarounds: ProductNode[];
};

type LogLine =
  | { type: "status"; message: string }
  | { type: "graph_result"; labelCounts: Record<string, number>; totalNodes: number }
  | { type: "assessment_ready"; score: number }
  | { type: "error"; message: string }
  | { type: "thinking_done" };

type GraphStats = {
  totalNodes: number;
  byLabel: Record<ProductNodeLabel, number>;
  totalEdges: number;
  lastUpdated?: number;
};

type ScopeAssessment = {
  contextScore: number;
  headline: string;
  buildable: string[];
  blockers: { issue: string; action: string }[];
  scopeForks: { decision: string; options: string[] }[];
  gaps: string[];
  buildSpec: { approach: string; keyConstraints: string[]; openQuestions: string[] } | null;
};

function scoreColor(score: number) {
  if (score >= 70) return "#1db584";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

function PromptPreviewPanel({ systemPrompt, userPrompt }: { systemPrompt: string; userPrompt: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 11,
      background: "var(--db-surface)",
      border: "1px solid var(--db-border)",
      borderRadius: 8,
      marginBottom: 10,
      overflow: "hidden",
    }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "10px 16px", background: "none", border: "none", cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ color: "#cc785c", fontSize: 11 }}>{open ? "▼" : "▶"}</span>
        <span style={{ color: "var(--db-text-5)", fontSize: 11 }}>Prompt sent to Claude</span>
        <span style={{ marginLeft: "auto", color: "var(--db-text-6)", fontSize: 10 }}>
          {(systemPrompt.length + userPrompt.length).toLocaleString()} chars
        </span>
      </button>
      {open && (
        <div style={{ borderTop: "1px solid var(--db-border)", padding: "12px 16px", lineHeight: 1.65 }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#cc785c", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
              System
            </div>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: "var(--db-text-5)", fontSize: 10.5 }}>
              {systemPrompt}
            </pre>
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#3e78c8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
              User
            </div>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: "var(--db-text-4)", fontSize: 10.5 }}>
              {userPrompt}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function ThinkingPanel({ text, done }: { text: string; done: boolean }) {
  const [open, setOpen] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && !done) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [text, open, done]);

  return (
    <div style={{
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 11,
      background: "var(--db-surface)",
      border: "1px solid var(--db-border)",
      borderRadius: 8,
      marginBottom: 10,
      overflow: "hidden",
    }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "10px 16px", background: "none", border: "none", cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ color: "#8b5cf6", fontSize: 11 }}>{open ? "▼" : "▶"}</span>
        <span style={{ color: "var(--db-text-5)", fontSize: 11 }}>
          {done ? "Claude's reasoning" : "Claude is thinking…"}
        </span>
        {!done && (
          <span style={{
            display: "inline-block", width: 6, height: 6, borderRadius: "50%",
            background: "#8b5cf6", marginLeft: 4,
            animation: "pulse 1s ease-in-out infinite",
          }} />
        )}
        <span style={{ marginLeft: "auto", color: "var(--db-text-6)", fontSize: 10 }}>
          {text.length.toLocaleString()} chars
        </span>
      </button>
      {open && (
        <div style={{
          borderTop: "1px solid var(--db-border)",
          padding: "12px 16px",
          maxHeight: 320,
          overflowY: "auto",
          lineHeight: 1.7,
        }}>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: "var(--db-text-5)", fontSize: 10.5 }}>
            {text}
            {!done && <span style={{ color: "#8b5cf6" }}>▊</span>}
          </pre>
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}

function QueryLog({ lines }: { lines: LogLine[] }) {
  const BAR_MAX = 16;
  return (
    <div
      style={{
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 11.5,
        background: "var(--db-surface)",
        border: "1px solid var(--db-border)",
        borderRadius: 8,
        padding: "14px 16px",
        marginBottom: 16,
        lineHeight: 1.7,
      }}
    >
      {lines.map((line, i) => {
        if (line.type === "status") {
          const isLast = i === lines.length - 1;
          const nextIsThinking = lines[i + 1]?.type === "thinking_done";
          return (
            <div key={i} style={{ color: "var(--db-text-4)" }}>
              <span style={{ color: "#cc785c", marginRight: 8 }}>→</span>{line.message}
              {isLast && !nextIsThinking && (
                <span style={{ color: "var(--db-text-6)" }}> …</span>
              )}
            </div>
          );
        }
        if (line.type === "thinking_done") {
          return null;
        }
        if (line.type === "graph_result") {
          const counts = Object.entries(line.labelCounts).sort((a, b) => b[1] - a[1]);
          const maxCount = counts[0]?.[1] ?? 1;
          return (
            <div key={i} style={{ marginBottom: 6 }}>
              <div style={{ color: "var(--db-text-3)", marginBottom: 4 }}>
                <span style={{ color: "#1db584", marginRight: 8 }}>✓</span>
                {line.totalNodes} nodes matched
              </div>
              {counts.map(([label, count]) => {
                const bars = Math.max(1, Math.round((count / maxCount) * BAR_MAX));
                const color = LABEL_COLORS[label] ?? "var(--db-text-4)";
                return (
                  <div key={label} style={{ display: "flex", gap: 10, alignItems: "center", paddingLeft: 24 }}>
                    <span style={{ color: "var(--db-text-6)", width: 88, flexShrink: 0, fontSize: 11 }}>{label}</span>
                    <span style={{ color, letterSpacing: "0.02em", fontSize: 10 }}>{"█".repeat(bars)}</span>
                    <span style={{ color: "var(--db-text-5)", fontSize: 11 }}>{count}</span>
                  </div>
                );
              })}
            </div>
          );
        }
        if (line.type === "assessment_ready") {
          const color = scoreColor(line.score);
          return (
            <div key={i} style={{ color: "var(--db-text-4)" }}>
              <span style={{ color, marginRight: 8 }}>✓</span>
              Done · context score <span style={{ color, fontWeight: 700 }}>{line.score}</span>
            </div>
          );
        }
        if (line.type === "error") {
          return (
            <div key={i} style={{ color: "#ef4444" }}>
              <span style={{ marginRight: 8 }}>✗</span>{line.message}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

function AssessmentPanel({ assessment: a }: { assessment: ScopeAssessment }) {
  const color = scoreColor(a.contextScore);
  return (
    <div style={{ marginBottom: 24 }}>
      {/* Score header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 20, padding: "20px 24px",
        background: "var(--db-surface)", border: "1px solid var(--db-border)",
        borderRadius: "10px 10px 0 0", borderBottom: "none",
      }}>
        <div style={{ textAlign: "center", minWidth: 64 }}>
          <div style={{ fontSize: 44, fontWeight: 700, color, lineHeight: 1, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em" }}>
            {a.contextScore}
          </div>
          <div style={{ fontSize: 10, color: "var(--db-text-5)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4 }}>
            context score
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--db-text)", lineHeight: 1.4 }}>{a.headline}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {a.blockers.length > 0 && (
              <span style={{ fontSize: 11, background: "rgba(239,68,68,0.1)", color: "#ef4444", borderRadius: 4, padding: "2px 8px", fontWeight: 600 }}>
                {a.blockers.length} blocker{a.blockers.length !== 1 ? "s" : ""}
              </span>
            )}
            {a.scopeForks.length > 0 && (
              <span style={{ fontSize: 11, background: "rgba(245,158,11,0.1)", color: "#f59e0b", borderRadius: 4, padding: "2px 8px", fontWeight: 600 }}>
                {a.scopeForks.length} scope fork{a.scopeForks.length !== 1 ? "s" : ""}
              </span>
            )}
            {a.gaps.length > 0 && (
              <span style={{ fontSize: 11, background: "rgba(107,114,128,0.1)", color: "var(--db-text-4)", borderRadius: 4, padding: "2px 8px", fontWeight: 600 }}>
                {a.gaps.length} gap{a.gaps.length !== 1 ? "s" : ""}
              </span>
            )}
            {a.blockers.length === 0 && a.gaps.length === 0 && (
              <span style={{ fontSize: 11, background: "rgba(29,181,132,0.1)", color: "#1db584", borderRadius: 4, padding: "2px 8px", fontWeight: 600 }}>
                fully covered
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{
        border: "1px solid var(--db-border)", borderRadius: "0 0 10px 10px",
        overflow: "hidden",
      }}>
        {/* Confirmed buildable */}
        {a.buildable.length > 0 && (
          <Section label="✓ Confirmed buildable" labelColor="#1db584">
            {a.buildable.map((item, i) => (
              <Row key={i} icon="✓" iconColor="#1db584" text={item} />
            ))}
          </Section>
        )}

        {/* Blockers */}
        {a.blockers.length > 0 && (
          <Section label="✗ Blockers" labelColor="#ef4444">
            {a.blockers.map((b, i) => (
              <div key={i} style={{ padding: "10px 16px", borderBottom: i < a.blockers.length - 1 ? "1px solid var(--db-border)" : "none" }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--db-text-2)", marginBottom: 3 }}>{b.issue}</div>
                <div style={{ fontSize: 11, color: "#f59e0b" }}>→ {b.action}</div>
              </div>
            ))}
          </Section>
        )}

        {/* Scope forks */}
        {a.scopeForks.length > 0 && (
          <Section label="⟷ Scope forks" labelColor="#f59e0b">
            {a.scopeForks.map((f, i) => (
              <div key={i} style={{ padding: "10px 16px", borderBottom: i < a.scopeForks.length - 1 ? "1px solid var(--db-border)" : "none" }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--db-text-2)", marginBottom: 6 }}>{f.decision}</div>
                {f.options.map((opt, j) => (
                  <div key={j} style={{ fontSize: 11, color: "var(--db-text-4)", display: "flex", gap: 6, marginTop: 3 }}>
                    <span style={{ color: "#f59e0b", flexShrink: 0 }}>{String.fromCharCode(65 + j)}.</span>
                    {opt}
                  </div>
                ))}
              </div>
            ))}
          </Section>
        )}

        {/* Gaps */}
        {a.gaps.length > 0 && (
          <Section label="⚠ Gaps — no graph coverage" labelColor="var(--db-text-4)">
            {a.gaps.map((g, i) => (
              <Row key={i} icon="⚠" iconColor="var(--db-text-5)" text={g} />
            ))}
          </Section>
        )}

        {/* Build spec */}
        {a.buildSpec && (
          <div style={{ background: "var(--db-surface-2)", padding: "14px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#1db584", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
              Build spec · ready to dispatch
            </div>
            <div style={{ fontSize: 12, color: "var(--db-text-3)", marginBottom: 8 }}>
              <span style={{ color: "var(--db-text-5)", marginRight: 6 }}>approach</span>{a.buildSpec.approach}
            </div>
            {a.buildSpec.keyConstraints.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: "var(--db-text-5)", marginBottom: 4 }}>KEY CONSTRAINTS</div>
                {a.buildSpec.keyConstraints.map((c, i) => (
                  <div key={i} style={{ fontSize: 11, color: "var(--db-text-4)", marginTop: 2 }}>⊘ {c}</div>
                ))}
              </div>
            )}
            {a.buildSpec.openQuestions.length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: "var(--db-text-5)", marginBottom: 4 }}>OPEN QUESTIONS</div>
                {a.buildSpec.openQuestions.map((q, i) => (
                  <div key={i} style={{ fontSize: 11, color: "#f59e0b", marginTop: 2 }}>? {q}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ label, labelColor, children }: { label: string; labelColor: string; children: React.ReactNode }) {
  return (
    <div style={{ borderBottom: "1px solid var(--db-border)" }}>
      <div style={{ padding: "8px 16px", fontSize: 10, fontWeight: 700, color: labelColor, textTransform: "uppercase", letterSpacing: "0.07em", background: "var(--db-surface)" }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function Row({ icon, iconColor, text }: { icon: string; iconColor: string; text: string }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: "8px 16px", borderTop: "1px solid var(--db-border)", alignItems: "flex-start" }}>
      <span style={{ color: iconColor, fontSize: 11, flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <span style={{ fontSize: 12, color: "var(--db-text-3)", lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

function QueryTab({ customerId, controls }: { customerId: string; controls: GraphControls }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<GraphQueryResult | null>(null);
  const [promptText, setPromptText] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<ScopeAssessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [queryLog, setQueryLog] = useState<LogLine[]>([]);
  const [thinkingText, setThinkingText] = useState<string>("");
  const [thinkingDone, setThinkingDone] = useState(false);
  const [promptPreview, setPromptPreview] = useState<{ systemPrompt: string; userPrompt: string } | null>(null);
  const thinkingRef = useRef("");

  useEffect(() => {
    void fetch(`${API}/product-graph/stats?customerId=${encodeURIComponent(customerId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setStats(d as GraphStats); });
  }, [customerId]);

  async function runQuery(format: "json" | "prompt") {
    if (!query.trim()) return;
    setLoading(true);
    setResult(null);
    setPromptText(null);
    setAssessment(null);
    const r = await fetch(`${API}/product-graph/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, dealDescription: query, format, minScore: controls.minScore }),
    });
    if (r.ok) {
      const data = (await r.json()) as { context?: string } & GraphQueryResult;
      if (format === "prompt") setPromptText(data.context ?? "");
      else setResult(data);
    }
    setLoading(false);
  }

  async function runAssess() {
    if (!query.trim()) return;
    setLoading(true);
    setResult(null);
    setPromptText(null);
    setAssessment(null);
    setQueryLog([]);
    setThinkingText("");
    setThinkingDone(false);
    setPromptPreview(null);
    thinkingRef.current = "";

    const res = await fetch("/api/product-graph/assess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, dealDescription: query, minScore: controls.minScore }),
    });

    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({ error: "Request failed" })) as { error?: string };
      setQueryLog([{ type: "error", message: err.error ?? "Request failed" }]);
      setLoading(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        if (!part.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(part.slice(6)) as {
            event: string;
            message?: string;
            text?: string;
            systemPrompt?: string;
            userPrompt?: string;
            labelCounts?: Record<string, number>;
            totalNodes?: number;
            assessment?: ScopeAssessment;
          };
          if (data.event === "status") {
            setQueryLog(prev => [...prev, { type: "status", message: data.message! }]);
          } else if (data.event === "graph_result") {
            setQueryLog(prev => [...prev, { type: "graph_result", labelCounts: data.labelCounts!, totalNodes: data.totalNodes! }]);
          } else if (data.event === "prompt_preview") {
            setPromptPreview({ systemPrompt: data.systemPrompt!, userPrompt: data.userPrompt! });
          } else if (data.event === "thinking_delta") {
            thinkingRef.current += data.text ?? "";
            setThinkingText(thinkingRef.current);
          } else if (data.event === "thinking_done") {
            setThinkingDone(true);
            setQueryLog(prev => [...prev, { type: "thinking_done" }]);
          } else if (data.event === "assessment") {
            setAssessment(data.assessment!);
            setQueryLog(prev => [...prev, { type: "assessment_ready", score: data.assessment!.contextScore }]);
          } else if (data.event === "error") {
            setQueryLog(prev => [...prev, { type: "error", message: data.message! }]);
          }
        } catch { /* invalid chunk */ }
      }
    }

    setLoading(false);
  }

  return (
    <div>
      {/* Active controls strip */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
        <span style={{ fontSize: 11, color: "var(--db-text-6)" }}>min score</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#cc785c", background: "rgba(204,120,92,0.1)", borderRadius: 4, padding: "2px 7px" }}>
          {controls.minScore}
        </span>
        <span style={{ fontSize: 11, color: "var(--db-border-alt)", marginLeft: 4 }}>
          {controls.minScore <= 1 ? "· maximum recall" : controls.minScore <= 2 ? "· balanced" : controls.minScore <= 3 ? "· low noise" : "· precision mode"}
        </span>
      </div>

      {/* Stats strip */}
      {stats && (
        <div
          style={{
            display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap",
          }}
        >
          <StatChip label="Nodes" value={stats.totalNodes} />
          <StatChip label="Edges" value={stats.totalEdges} />
          {(Object.entries(stats.byLabel ?? {}) as [ProductNodeLabel, number][]).map(([label, count]) => (
            <StatChip key={label} label={label} value={count} color={LABEL_COLORS[label]} />
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={3}
          placeholder="Describe the deal — e.g. Northwind needs real-time Salesforce sync, custom dashboards, role-based access, and SOC 2 compliance..."
          style={{
            flex: 1, fontSize: 12, border: "1px solid var(--db-input-border)", borderRadius: 8,
            padding: "10px 14px", resize: "vertical", background: "var(--db-input-bg)",
            color: "var(--db-text-2)", fontFamily: "inherit",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button
            onClick={() => void runAssess()}
            disabled={loading || !query.trim()}
            style={{
              fontSize: 12, padding: "8px 14px", borderRadius: 6, whiteSpace: "nowrap",
              background: loading || !query.trim() ? "var(--db-surface-2)" : "#cc785c",
              color: loading || !query.trim() ? "var(--db-text-5)" : "#fff",
              border: "none", cursor: loading || !query.trim() ? "not-allowed" : "pointer",
              fontWeight: 600,
            }}
          >
            {loading ? "Assessing..." : "Assess"}
          </button>
          <button
            onClick={() => void runQuery("json")}
            disabled={loading || !query.trim()}
            style={{
              fontSize: 12, padding: "8px 14px", borderRadius: 6, whiteSpace: "nowrap",
              background: "transparent", color: loading || !query.trim() ? "var(--db-text-5)" : "var(--db-text-3)",
              border: `1px solid ${loading || !query.trim() ? "var(--db-surface-2)" : "var(--db-border-alt)"}`,
              cursor: loading || !query.trim() ? "not-allowed" : "pointer",
            }}
          >
            Raw nodes
          </button>
          <button
            onClick={() => void runQuery("prompt")}
            disabled={loading || !query.trim()}
            style={{
              fontSize: 12, padding: "8px 14px", borderRadius: 6, whiteSpace: "nowrap",
              background: "transparent", color: loading || !query.trim() ? "var(--db-text-5)" : "var(--db-text-3)",
              border: `1px solid ${loading || !query.trim() ? "var(--db-surface-2)" : "var(--db-border-alt)"}`,
              cursor: loading || !query.trim() ? "not-allowed" : "pointer",
            }}
          >
            Prompt block
          </button>
        </div>
      </div>

      {queryLog.length > 0 && <QueryLog lines={queryLog} />}
      {promptPreview && <PromptPreviewPanel systemPrompt={promptPreview.systemPrompt} userPrompt={promptPreview.userPrompt} />}
      {thinkingText && <ThinkingPanel text={thinkingText} done={thinkingDone} />}
      {assessment && <AssessmentPanel assessment={assessment} />}

      {promptText && (
        <div
          style={{
            background: "var(--db-surface-2)", border: "1px solid var(--db-border)", borderRadius: 9,
            padding: "18px 20px", marginBottom: 24,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--db-text-5)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Prompt context block
            </span>
            <button
              onClick={() => void navigator.clipboard.writeText(promptText)}
              style={{ fontSize: 11, color: "var(--db-text-4)", background: "none", border: "none", cursor: "pointer" }}
            >
              Copy
            </button>
          </div>
          <pre
            style={{
              fontSize: 11, color: "var(--db-text-3)", margin: 0, whiteSpace: "pre-wrap",
              lineHeight: 1.65, fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            }}
          >
            {promptText}
          </pre>
        </div>
      )}

      {result && (
        <div>
          <div style={{ fontSize: 12, color: "var(--db-text-5)", marginBottom: 16 }}>
            Matched context across{" "}
            {new Set((Object.values(result) as ProductNode[][]).flat().map(n => n.name)).size} unique nodes
          </div>
          {(["capability", "limitation", "integration", "constraint", "pattern", "workaround"] as const).map((label) => {
            const key = `${label}s` as keyof GraphQueryResult;
            const raw = result[key];
            if (!raw || raw.length === 0) return null;
            // Deduplicate by name — keep first occurrence (highest relevance score)
            const seen = new Set<string>();
            const nodes = raw.filter(n => seen.has(n.name) ? false : (seen.add(n.name), true));
            return (
              <div key={label} style={{ marginBottom: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span
                    style={{
                      fontSize: 10, fontWeight: 700, color: LABEL_COLORS[label],
                      textTransform: "uppercase", letterSpacing: "0.06em",
                    }}
                  >
                    {LABEL_ICONS[label]} {label}s ({nodes.length})
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {nodes.slice(0, controls.caps[label] ?? 8).map((n) => (
                    <div
                      key={n.id}
                      style={{
                        background: "var(--db-surface)", border: "1px solid #1c1c1c",
                        borderRadius: 7, padding: "9px 12px",
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--db-text-2)", marginBottom: 2 }}>
                        {n.name}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--db-text-4)" }}>{n.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Controls Tab ─────────────────────────────────────────────────────────────

const SCORE_LABELS: Record<number, { label: string; detail: string; color: string }> = {
  0: { label: "All nodes",       detail: "No filtering — include everything matched by FTS",         color: "var(--db-text-4)" },
  1: { label: "Any match",       detail: "At least one query term appears anywhere in the node",     color: "#6b7280" },
  2: { label: "Balanced",        detail: "Strong description match or any name match — recommended", color: "#cc785c" },
  3: { label: "Name match",      detail: "Query term must appear in the node name",                  color: "#3e78c8" },
  4: { label: "Strong name",     detail: "Multiple name matches or very high term density",          color: "#8b5cf6" },
  5: { label: "Precision mode",  detail: "Maximum precision, minimum recall — may miss valid nodes", color: "#1db584" },
};

const LABEL_ORDER = ["capability", "limitation", "constraint", "integration", "pattern", "workaround"] as const;

function ControlsTab({ controls, onChange }: { controls: GraphControls; onChange: (c: GraphControls) => void }) {
  const scoreInfo = SCORE_LABELS[controls.minScore] ?? SCORE_LABELS[1];

  return (
    <div style={{ maxWidth: 560 }}>
      <p style={{ fontSize: 12, color: "var(--db-text-4)", marginBottom: 28, lineHeight: 1.6 }}>
        Tune how aggressively the query filters nodes by relevance. Higher score = less noise, fewer results.
        Lower score = more recall, more noise. Changes apply immediately to the next query.
      </p>

      {/* Min score slider */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--db-text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Min relevance score
          </span>
          <span style={{ fontSize: 18, fontWeight: 700, color: scoreInfo.color }}>
            {controls.minScore}
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: scoreInfo.color }}>
            {scoreInfo.label}
          </span>
        </div>

        <input
          type="range" min={0} max={5} step={1}
          value={controls.minScore}
          onChange={e => onChange({ ...controls, minScore: Number(e.target.value) })}
          style={{ width: "100%", accentColor: scoreInfo.color, marginBottom: 8 }}
        />

        {/* Tick labels */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          {[0, 1, 2, 3, 4, 5].map(v => (
            <span key={v} style={{
              fontSize: 10, color: v === controls.minScore ? scoreInfo.color : "var(--db-border-alt)",
              fontWeight: v === controls.minScore ? 700 : 400,
            }}>
              {v}
            </span>
          ))}
        </div>

        <div style={{
          background: "var(--db-surface)", border: `1px solid ${scoreInfo.color}22`,
          borderLeft: `3px solid ${scoreInfo.color}`,
          borderRadius: 6, padding: "9px 12px",
          fontSize: 12, color: "var(--db-text-3)", lineHeight: 1.5,
        }}>
          {scoreInfo.detail}
        </div>
      </div>

      {/* Per-label caps */}
      <div style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--db-text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Results per label
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {LABEL_ORDER.map(label => (
          <div key={label} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "var(--db-surface)", border: "1px solid #1c1c1c",
            borderRadius: 7, padding: "9px 12px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: LABEL_COLORS[label] ?? "var(--db-text-4)" }} />
              <span style={{ fontSize: 12, color: "var(--db-text-3)", textTransform: "capitalize" }}>{label}</span>
            </div>
            <input
              type="number" min={1} max={20}
              value={controls.caps[label] ?? 6}
              onChange={e => onChange({
                ...controls,
                caps: { ...controls.caps, [label]: Math.max(1, Math.min(20, Number(e.target.value))) },
              })}
              style={{
                width: 44, fontSize: 13, fontWeight: 600, textAlign: "center",
                background: "var(--db-surface-2)", border: "1px solid var(--db-border-alt)",
                borderRadius: 5, padding: "3px 0", color: "var(--db-text)",
              }}
            />
          </div>
        ))}
      </div>

      <button
        onClick={() => onChange(DEFAULT_CONTROLS)}
        style={{
          marginTop: 24, fontSize: 11, color: "var(--db-text-5)", background: "none",
          border: "none", cursor: "pointer", textDecoration: "underline",
        }}
      >
        Reset to defaults
      </button>
    </div>
  );
}

function StatChip({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div
      style={{
        background: "var(--db-surface)", border: "1px solid #1c1c1c", borderRadius: 7,
        padding: "7px 12px", display: "flex", alignItems: "center", gap: 7,
      }}
    >
      {color && <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />}
      <span style={{ fontSize: 11, color: "var(--db-text-5)" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--db-text)" }}>{value}</span>
    </div>
  );
}
