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

type Tab = "ingest" | "review" | "query";

export default function ProductGraphPage() {
  const [customerId, setCustomerId] = useState("acme-ai");
  const [tab, setTab] = useState<Tab>("ingest");

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
          <label style={{ fontSize: 11, color: "#444" }}>Customer</label>
          <input
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value.trim())}
            style={{
              fontSize: 12, border: "1px solid #2a2a2a", borderRadius: 5,
              padding: "4px 10px", width: 160, background: "#141414", color: "#c9c9c9",
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
        {(["ingest", "review", "query"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontSize: 12, fontWeight: tab === t ? 600 : 400,
              color: tab === t ? "#e0e0e0" : "#555",
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
      {tab === "query" && <QueryTab customerId={customerId} />}
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
        <p style={{ fontSize: 12, color: "#555", marginBottom: 20, lineHeight: 1.6 }}>
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
            border: `1px dashed ${dragging ? "#1db584" : "#2a2a2a"}`,
            borderRadius: 10, padding: "40px 24px", textAlign: "center", cursor: "pointer",
            background: dragging ? "rgba(29,181,132,0.04)" : "#0e0e0e",
            transition: "all 0.15s", marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: loading ? "#555" : "#666" }}>
            {loading ? "Processing..." : "Drop files here or click to upload"}
          </div>
          <div style={{ fontSize: 11, color: "#383838", marginTop: 4 }}>txt · md · pdf</div>
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
          style={{ fontSize: 11, color: "#444", background: "none", border: "none", cursor: "pointer", marginBottom: 12, textDecoration: "underline" }}
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
                padding: "7px 10px", marginBottom: 8, background: "#0e0e0e", color: "#c9c9c9",
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
                padding: "10px 12px", resize: "vertical", background: "#0e0e0e", color: "#c9c9c9",
                boxSizing: "border-box", fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              }}
            />
            <button
              onClick={() => void handlePasteSubmit()}
              disabled={loading || !pasteText.trim()}
              style={{
                marginTop: 8, fontSize: 12, padding: "7px 16px", borderRadius: 5,
                background: loading || !pasteText.trim() ? "#1a1a1a" : "#cc785c",
                color: loading || !pasteText.trim() ? "#444" : "#fff",
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
          <span style={{ fontSize: 11, fontWeight: 600, color: "#444", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Ingestion Jobs
          </span>
          <button
            onClick={() => void loadJobs()}
            style={{ fontSize: 11, color: "#444", background: "none", border: "none", cursor: "pointer" }}
          >
            ↻
          </button>
        </div>
        {jobs.length === 0 && (
          <div style={{ fontSize: 12, color: "#383838", padding: "24px 0", textAlign: "center" }}>
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
  pending: "#444", chunking: "#f59e0b", extracting: "#3e78c8",
  review: "#8b5cf6", writing: "#f59e0b", done: "#1db584", error: "#e05252",
};

function JobCard({ job, onRefresh }: { job: IngestJob; onRefresh: () => void }) {
  return (
    <div
      style={{
        background: "#0e0e0e", border: "1px solid #1c1c1c", borderRadius: 8, padding: "12px 14px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span
          style={{
            fontSize: 12, fontWeight: 500, color: "#c0c0c0",
            maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          {job.fileName}
        </span>
        <span
          style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
            color: STATUS_COLOR[job.status] ?? "#444", textTransform: "uppercase",
          }}
        >
          {job.status}
        </span>
      </div>
      <div style={{ fontSize: 11, color: "#444" }}>
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
                color: filter === f ? "#e0e0e0" : "#555",
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
                background: "transparent", color: "#888",
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
                background: writing ? "#1a1a1a" : "#cc785c", color: writing ? "#444" : "#fff", border: "none",
              }}
            >
              {writing ? "Writing..." : `Write to graph (${approved})`}
            </button>
          )}
          <button
            onClick={() => void load()}
            style={{ fontSize: 11, color: "#444", background: "none", border: "none", cursor: "pointer" }}
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
        <div style={{ fontSize: 12, color: "#383838", padding: "32px 0", textAlign: "center" }}>Loading...</div>
      )}
      {!loading && items.length === 0 && (
        <div style={{ fontSize: 12, color: "#383838", padding: "32px 0", textAlign: "center" }}>
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
  const color = LABEL_COLORS[item.label] ?? "#888";
  const icon = LABEL_ICONS[item.label] ?? "·";

  return (
    <div
      style={{
        background: item.status === "approved" ? "rgba(29,181,132,0.05)" : "#0e0e0e",
        border: `1px solid ${item.status === "approved" ? "rgba(29,181,132,0.2)" : item.status === "rejected" ? "rgba(224,82,82,0.15)" : "#1c1c1c"}`,
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
                  borderRadius: 5, padding: "4px 8px", marginBottom: 5, background: "#141414",
                  color: "#e0e0e0", boxSizing: "border-box",
                }}
              />
              <textarea
                value={editDesc}
                onChange={(e) => onEditDesc(e.target.value)}
                rows={2}
                style={{
                  width: "100%", fontSize: 12, border: "1px solid #2a2a2a",
                  borderRadius: 5, padding: "4px 8px", resize: "vertical",
                  background: "#141414", color: "#c9c9c9", boxSizing: "border-box",
                }}
              />
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#c9c9c9", marginBottom: 3 }}>
                {item.editedName ?? item.name}
              </div>
              <div style={{ fontSize: 12, color: "#555", lineHeight: 1.45 }}>
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
            <span style={{ fontSize: 10, color: "#383838" }}>
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
                  style={{ fontSize: 11, padding: "4px 9px", borderRadius: 5, background: "#1a1a1a", color: "#888", border: "none", cursor: "pointer" }}
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
                  style={{ fontSize: 11, padding: "4px 9px", borderRadius: 5, background: "#1a1a1a", color: "#888", border: "1px solid #2a2a2a", cursor: "pointer" }}
                >
                  Edit
                </button>
                <button
                  onClick={onReject}
                  style={{ fontSize: 11, padding: "4px 9px", borderRadius: 5, background: "#1a1a1a", color: "#e05252", border: "1px solid #2a1a1a", cursor: "pointer" }}
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

function QueryTab({ customerId }: { customerId: string }) {
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
      body: JSON.stringify({ customerId, dealDescription: query, format }),
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
            flex: 1, fontSize: 12, border: "1px solid #2a2a2a", borderRadius: 8,
            padding: "10px 14px", resize: "vertical", background: "#0e0e0e",
            color: "#c9c9c9", fontFamily: "inherit",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button
            onClick={() => void runQuery("json")}
            disabled={loading || !query.trim()}
            style={{
              fontSize: 12, padding: "8px 14px", borderRadius: 6, whiteSpace: "nowrap",
              background: loading || !query.trim() ? "#1a1a1a" : "#cc785c",
              color: loading || !query.trim() ? "#444" : "#fff",
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
              background: "transparent", color: loading || !query.trim() ? "#444" : "#888",
              border: `1px solid ${loading || !query.trim() ? "#1a1a1a" : "#333"}`,
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
            background: "#070710", border: "1px solid #1c1c2e", borderRadius: 9,
            padding: "18px 20px", marginBottom: 24,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#444", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Prompt context block
            </span>
            <button
              onClick={() => void navigator.clipboard.writeText(promptText)}
              style={{ fontSize: 11, color: "#555", background: "none", border: "none", cursor: "pointer" }}
            >
              Copy
            </button>
          </div>
          <pre
            style={{
              fontSize: 11, color: "#8899ae", margin: 0, whiteSpace: "pre-wrap",
              lineHeight: 1.65, fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            }}
          >
            {promptText}
          </pre>
        </div>
      )}

      {result && (
        <div>
          <div style={{ fontSize: 12, color: "#444", marginBottom: 16 }}>
            Matched context across{" "}
            {(Object.values(result) as ProductNode[][]).flat().length} nodes
          </div>
          {(["capability", "limitation", "integration", "constraint", "pattern", "workaround"] as const).map((label) => {
            const key = `${label}s` as keyof GraphQueryResult;
            const nodes = result[key];
            if (!nodes || nodes.length === 0) return null;
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
                  {nodes.slice(0, 8).map((n) => (
                    <div
                      key={n.id}
                      style={{
                        background: "#0e0e0e", border: "1px solid #1c1c1c",
                        borderRadius: 7, padding: "9px 12px",
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 500, color: "#c9c9c9", marginBottom: 2 }}>
                        {n.name}
                      </div>
                      <div style={{ fontSize: 11, color: "#555" }}>{n.description}</div>
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

function StatChip({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div
      style={{
        background: "#0e0e0e", border: "1px solid #1c1c1c", borderRadius: 7,
        padding: "7px 12px", display: "flex", alignItems: "center", gap: 7,
      }}
    >
      {color && <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />}
      <span style={{ fontSize: 11, color: "#444" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: "#e0e0e0" }}>{value}</span>
    </div>
  );
}
