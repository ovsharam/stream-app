"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

type JobStatus = "pending" | "chunking" | "extracting" | "review" | "writing" | "done" | "error";

type Job = {
  id: string;
  customerId: string;
  fileName: string;
  mimeType: string;
  status: JobStatus;
  chunkCount?: number;
  nodeCount?: number;
  errorMsg?: string;
  createdAt: number;
  updatedAt: number;
};

type Stats = {
  customerId: string;
  totalNodes: number;
  byLabel: Record<string, number>;
  totalEdges: number;
  lastUpdated?: number;
};

const STATUS_COLOR: Record<JobStatus, string> = {
  pending:    "rgba(255,255,255,0.2)",
  chunking:   "#f59e0b",
  extracting: "#3e78c8",
  review:     "#cc785c",
  writing:    "#8b5cf6",
  done:       "#1db584",
  error:      "#ef4444",
};

const STATUS_LABEL: Record<JobStatus, string> = {
  pending:    "Pending",
  chunking:   "Chunking",
  extracting: "Extracting",
  review:     "Review",
  writing:    "Writing",
  done:       "Done",
  error:      "Error",
};

const STAGE_ORDER: JobStatus[] = ["pending", "chunking", "extracting", "review", "writing", "done"];

const LABEL_COLORS: Record<string, string> = {
  capability:  "#1db584",
  limitation:  "#e05252",
  integration: "#3e78c8",
  pattern:     "#8b5cf6",
  constraint:  "#f59e0b",
  workaround:  "#cc785c",
};

const CUSTOMER_ID = "plumb-internal";
const API = "/api/stream";

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function PipelineFlow({ activeStatus }: { activeStatus?: JobStatus }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 28 }}>
      {STAGE_ORDER.map((stage, i) => {
        const isActive = stage === activeStatus;
        const isDone = activeStatus && STAGE_ORDER.indexOf(activeStatus) > i;
        const color = isDone ? "#1db584" : isActive ? STATUS_COLOR[stage] : "rgba(255,255,255,0.08)";
        const labelColor = isDone || isActive ? "#e0e0e0" : "#444";
        return (
          <div key={stage} style={{ display: "flex", alignItems: "center", flex: 1 }}>
            <div style={{
              flex: 1,
              padding: "10px 12px",
              background: isActive ? `${color}18` : isDone ? "rgba(29,181,132,0.06)" : "#111",
              border: `1px solid ${color}`,
              borderRadius: i === 0 ? "6px 0 0 6px" : i === STAGE_ORDER.length - 1 ? "0 6px 6px 0" : 0,
              borderRight: i < STAGE_ORDER.length - 1 ? "none" : undefined,
              textAlign: "center",
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>
                {isDone ? "✓" : isActive ? "●" : `0${i + 1}`}
              </div>
              <div style={{ fontSize: 11, color: labelColor, fontWeight: isActive ? 600 : 400 }}>
                {STATUS_LABEL[stage]}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function PipelinePage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [jobsRes, statsRes] = await Promise.allSettled([
        fetch(`${API}/product-graph/jobs?customerId=${CUSTOMER_ID}`).then(r => r.json() as Promise<Job[]>),
        fetch(`${API}/product-graph/stats?customerId=${CUSTOMER_ID}`).then(r => r.json() as Promise<Stats>),
      ]);
      if (jobsRes.status === "fulfilled") setJobs(Array.isArray(jobsRes.value) ? jobsRes.value : []);
      if (statsRes.status === "fulfilled" && !("error" in statsRes.value)) setStats(statsRes.value);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
    const t = setInterval(() => void fetchData(), 5000);
    return () => clearInterval(t);
  }, [fetchData]);

  const uploadFile = useCallback(async (file: File) => {
    setUploading(true);
    setUploadMsg(null);
    try {
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch(`${API}/product-graph/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: CUSTOMER_ID,
          fileName: file.name,
          mimeType: file.type || "text/plain",
          content,
        }),
      });
      const data = await res.json() as { jobId?: string; error?: string };
      if (data.error) throw new Error(data.error);
      setUploadMsg(`Started job ${(data.jobId ?? "").slice(-8)} for ${file.name}`);
      void fetchData();
    } catch (e) {
      setUploadMsg(`Error: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  }, [fetchData]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void uploadFile(file);
  }, [uploadFile]);

  const activeJob = jobs.find(j => j.status !== "done" && j.status !== "error");
  const recentJobs = jobs.slice(0, 12);

  return (
    <div style={{ padding: "24px 28px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
        <Link href="/dashboard" style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textDecoration: "none", fontWeight: 600 }}>
          ← Overview
        </Link>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: "-0.03em" }}>
          Context Graph Pipeline
        </h1>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 5,
          background: activeJob ? "rgba(59,130,246,0.12)" : "rgba(255,255,255,0.05)",
          color: activeJob ? "#3e78c8" : "#444",
          border: `1px solid ${activeJob ? "rgba(59,130,246,0.25)" : "#1c1c1c"}`,
        }}>
          {activeJob ? `● ${STATUS_LABEL[activeJob.status]}` : "Idle"}
        </span>
      </div>

      {/* Pipeline flow diagram */}
      {activeJob && <PipelineFlow activeStatus={activeJob.status} />}

      {/* Stats strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 24 }}>
        {[
          { label: "Total nodes", value: stats?.totalNodes ?? "—" },
          { label: "Edges", value: stats?.totalEdges ?? "—" },
          { label: "Documents", value: jobs.filter(j => j.status === "done").length || "—" },
          { label: "Last ingest", value: stats?.lastUpdated ? timeAgo(stats.lastUpdated) : "—" },
        ].map(({ label, value }) => (
          <div key={label} style={{
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 9, padding: "14px 16px",
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
              {label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em" }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16 }}>
        {/* Left: jobs + upload */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `1px dashed ${dragOver ? "#3e78c8" : uploading ? "#1db584" : "rgba(255,255,255,0.12)"}`,
              borderRadius: 10,
              padding: "22px 24px",
              textAlign: "center",
              cursor: uploading ? "wait" : "pointer",
              background: dragOver ? "rgba(62,120,200,0.05)" : "rgba(255,255,255,0.02)",
              transition: "all 0.15s",
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.pdf,.markdown"
              style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) void uploadFile(f); }}
            />
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>
              {uploading ? "Uploading…" : dragOver ? "Drop to ingest" : "Drop a doc or click to upload"}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.18)" }}>
              PDF, Markdown, plain text — API docs, internal specs, Slack exports
            </div>
            {uploadMsg && (
              <div style={{
                marginTop: 10, fontSize: 11, padding: "6px 10px", borderRadius: 5,
                background: uploadMsg.startsWith("Error") ? "rgba(239,68,68,0.1)" : "rgba(29,181,132,0.1)",
                color: uploadMsg.startsWith("Error") ? "#ef4444" : "#1db584",
              }}>
                {uploadMsg}
              </div>
            )}
          </div>

          {/* Jobs table */}
          <div style={{
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 12, overflow: "hidden",
          }}>
            <div style={{
              padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                Ingest jobs
              </span>
              <Link href="/dashboard/product-graph" style={{ fontSize: 11, color: "#444", textDecoration: "none" }}>
                Full review queue →
              </Link>
            </div>
            {loading ? (
              <p style={{ padding: "20px 16px", fontSize: 12, color: "#383838", margin: 0 }}>Loading…</p>
            ) : recentJobs.length === 0 ? (
              <p style={{ padding: "20px 16px", fontSize: 12, color: "#383838", margin: 0 }}>
                No jobs yet. Upload a document above to start building the context graph.
              </p>
            ) : (
              recentJobs.map((job) => {
                const color = STATUS_COLOR[job.status];
                const stageIdx = STAGE_ORDER.indexOf(job.status);
                const pct = job.status === "done" ? 100 : job.status === "error" ? 0 : Math.round((stageIdx / (STAGE_ORDER.length - 1)) * 100);
                return (
                  <div key={job.id} style={{
                    padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)",
                    display: "grid", gridTemplateColumns: "1fr 80px 100px 70px", gap: 12, alignItems: "center",
                  }}>
                    <div>
                      <div style={{ fontSize: 12, color: "#c0c0c0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 3 }}>
                        {job.fileName}
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {/* Progress bar */}
                        <div style={{ flex: 1, height: 2, background: "#1a1a1a", borderRadius: 1, overflow: "hidden", maxWidth: 120 }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 1, transition: "width 0.4s" }} />
                        </div>
                        <span style={{ fontSize: 9, color: "#383838", fontVariantNumeric: "tabular-nums" }}>
                          {job.chunkCount != null ? `${job.chunkCount} chunks` : ""}
                          {job.nodeCount != null ? ` · ${job.nodeCount} nodes` : ""}
                        </span>
                      </div>
                    </div>
                    <span style={{
                      fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
                      padding: "2px 6px", borderRadius: 4,
                      background: `${color}18`, color,
                      textAlign: "center",
                    }}>
                      {STATUS_LABEL[job.status]}
                    </span>
                    <span style={{ fontSize: 10, color: "#383838", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {job.id.slice(-12)}
                    </span>
                    <span style={{ fontSize: 10, color: "#383838", textAlign: "right" }}>
                      {timeAgo(job.updatedAt)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: graph composition */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 12, padding: "16px",
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 14 }}>
              Graph composition
            </div>
            {stats ? (
              Object.entries(stats.byLabel).length > 0 ? (
                Object.entries(stats.byLabel).map(([label, count]) => {
                  const total = stats.totalNodes || 1;
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div key={label} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: LABEL_COLORS[label] ?? "#888", textTransform: "capitalize", fontWeight: 500 }}>
                          {label}
                        </span>
                        <span style={{ fontSize: 11, color: "#555", fontVariantNumeric: "tabular-nums" }}>
                          {count}
                        </span>
                      </div>
                      <div style={{ height: 3, background: "#1a1a1a", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: LABEL_COLORS[label] ?? "#888", borderRadius: 2 }} />
                      </div>
                    </div>
                  );
                })
              ) : (
                <p style={{ fontSize: 12, color: "#383838", margin: 0 }}>Graph is empty. Ingest documents to populate.</p>
              )
            ) : (
              <p style={{ fontSize: 12, color: "#383838", margin: 0 }}>—</p>
            )}
          </div>

          {/* Pipeline legend */}
          <div style={{
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 12, padding: "16px",
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 14 }}>
              How it works
            </div>
            {[
              { step: "01", title: "Upload docs", body: "API docs, specs, Slack exports, changelogs" },
              { step: "02", title: "Chunk + extract", body: "Claude Haiku maps text to capability/limitation/integration nodes" },
              { step: "03", title: "Review queue", body: "Approve, reject, or edit each extracted node" },
              { step: "04", title: "Write to graph", body: "Approved nodes land in the context graph — live for FDE agents" },
            ].map(({ step, title, body }) => (
              <div key={step} style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 9, color: "#383838", fontFamily: "monospace", fontWeight: 700, flexShrink: 0, paddingTop: 2 }}>{step}</span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#888", marginBottom: 2 }}>{title}</div>
                  <div style={{ fontSize: 11, color: "#444", lineHeight: 1.5 }}>{body}</div>
                </div>
              </div>
            ))}
            <Link href="/dashboard/product-graph" style={{
              display: "block", marginTop: 4,
              fontSize: 11, color: "#cc785c", textDecoration: "none",
              fontWeight: 600,
            }}>
              Open full graph interface →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
