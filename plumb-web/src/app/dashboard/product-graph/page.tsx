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
          style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textDecoration: "none", fontWeight: 600 }}
        >
          ← Overview
        </Link>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: "-0.03em", color: "#e8e8e8" }}>
          Product Graph
        </h1>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <label style={{ fontSize: 11, color: "var(--db-text-5)" }}>Customer</label>
          <input
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value.trim())}
            style={{
              fontSize: 12, border: "1px solid var(--db-input-border)", borderRadius: 5,
              padding: "4px 10px", width: 160, background: "var(--db-input-bg)", color: "var(--db-text-2)",
            }}
            placeholder="customer-id"
          />
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex", gap: 2, marginBottom: 24, borderBottom: "1px solid #1c1c1c", paddingBottom: 0,
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

  const loadJobs = useCallback(async () => {
    const r = await fetch(`${API}/product-graph/jobs?customerId=${encodeURIComponent(customerId)}`);
    if (r.ok) setJobs(await r.json());
  }, [customerId]);

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
          <div style={{ fontSize: 13, fontWeight: 500, color: loading ? "var(--db-text-4)" : "#666" }}>
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

        <button
          onClick={() => setPasteMode(!pasteMode)}
          style={{ fontSize: 11, color: "var(--db-text-5)", background: "none", border: "none", cursor: "pointer", marginBottom: 12, textDecoration: "underline" }}
        >
          {pasteMode ? "Hide paste mode" : "Or paste text directly"}
        </button>

        {pasteMode && (
          <div>
            <input
              value={pasteLabel}
              onChange={(e) => setPasteLabel(e.target.value)}
              placeholder="File label (e.g. api-docs.txt)"
              style={{
                width: "100%", fontSize: 12, border: "1px solid #222", borderRadius: 5,
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
                width: "100%", fontSize: 12, border: "1px solid #222", borderRadius: 5,
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
    await Promise.all(pending.map((i) => approve(i.id)));
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
                background: filter === f ? "#222" : "transparent",
                color: filter === f ? "var(--db-text)" : "var(--db-text-4)",
                border: `1px solid ${filter === f ? "#333" : "transparent"}`,
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
                border: "1px solid #333",
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
                  width: "100%", fontSize: 13, fontWeight: 500, border: "1px solid #2a2a2a",
                  borderRadius: 5, padding: "4px 8px", marginBottom: 5, background: "var(--db-surface-2)",
                  color: "var(--db-text)", boxSizing: "border-box",
                }}
              />
              <textarea
                value={editDesc}
                onChange={(e) => onEditDesc(e.target.value)}
                rows={2}
                style={{
                  width: "100%", fontSize: 12, border: "1px solid #2a2a2a",
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
                  style={{ fontSize: 11, padding: "4px 9px", borderRadius: 5, background: "var(--db-surface-2)", color: "var(--db-text-3)", border: "1px solid #2a2a2a", cursor: "pointer" }}
                >
                  Edit
                </button>
                <button
                  onClick={onReject}
                  style={{ fontSize: 11, padding: "4px 9px", borderRadius: 5, background: "var(--db-surface-2)", color: "#e05252", border: "1px solid #2a1a1a", cursor: "pointer" }}
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

type GraphStats = {
  totalNodes: number;
  byLabel: Record<ProductNodeLabel, number>;
  totalEdges: number;
  lastUpdated?: number;
};

function QueryTab({ customerId, controls }: { customerId: string; controls: GraphControls }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<GraphQueryResult | null>(null);
  const [promptText, setPromptText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<GraphStats | null>(null);

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
            onClick={() => void runQuery("json")}
            disabled={loading || !query.trim()}
            style={{
              fontSize: 12, padding: "8px 14px", borderRadius: 6, whiteSpace: "nowrap",
              background: loading || !query.trim() ? "var(--db-surface-2)" : "#cc785c",
              color: loading || !query.trim() ? "var(--db-text-5)" : "#fff",
              border: "none", cursor: loading || !query.trim() ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Querying..." : "Query graph"}
          </button>
          <button
            onClick={() => void runQuery("prompt")}
            disabled={loading || !query.trim()}
            style={{
              fontSize: 12, padding: "8px 14px", borderRadius: 6, whiteSpace: "nowrap",
              background: "transparent", color: loading || !query.trim() ? "var(--db-text-5)" : "var(--db-text-3)",
              border: `1px solid ${loading || !query.trim() ? "var(--db-surface-2)" : "#333"}`,
              cursor: loading || !query.trim() ? "not-allowed" : "pointer",
            }}
          >
            Prompt block
          </button>
        </div>
      </div>

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
              fontSize: 10, color: v === controls.minScore ? scoreInfo.color : "#333",
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
                background: "var(--db-surface-2)", border: "1px solid #2a2a2a",
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
