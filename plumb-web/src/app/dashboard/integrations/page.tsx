"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";

const CUSTOMER_ID = "plumb-internal";
const API = process.env.NEXT_PUBLIC_STREAM_API_URL ?? "http://localhost:4000/api/stream";

type ConnectorMeta = {
  type: string;
  label: string;
  description: string;
  authType: "pat" | "api_key" | "oauth";
};

type ConnectorConfig = {
  id: string;
  type: string;
  label: string;
  status: "active" | "paused" | "error" | "pending_auth";
  errorMsg?: string;
  lastSyncAt?: number;
  createdAt: number;
};

type SyncRun = {
  id: string;
  status: "running" | "done" | "error";
  chunksProcessed: number;
  nodesExtracted: number;
  errorMsg?: string;
  startedAt: number;
  completedAt?: number;
};

const CONNECTOR_ICONS: Record<string, string> = {
  slack: "💬",
  github: "🐙",
  linear: "🔺",
  notion: "📝",
  google_drive: "📁",
  jira: "🎯",
  gong: "🎙️",
  zoom: "📹",
};

const STATUS_COLOR: Record<string, string> = {
  active: "#1db584",
  paused: "rgba(255,255,255,0.3)",
  error: "#ef4444",
  pending_auth: "#f59e0b",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  error: "Error",
  pending_auth: "Auth needed",
};

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export default function IntegrationsPage() {
  const searchParams = useSearchParams();
  const [meta, setMeta] = useState<ConnectorMeta[]>([]);
  const [connectors, setConnectors] = useState<ConnectorConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [addingType, setAddingType] = useState<ConnectorMeta | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    const [metaRes, listRes] = await Promise.all([
      fetch(`${API}/connectors/meta`),
      fetch(`${API}/connectors?customerId=${CUSTOMER_ID}`),
    ]);
    if (metaRes.ok) setMeta((await metaRes.json()).connectors ?? []);
    if (listRes.ok) setConnectors((await listRes.json()).connectors ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Show toast after OAuth redirect
  useEffect(() => {
    const connected = searchParams.get("connected");
    if (connected) {
      showToast(`${connected} connected! Sync will start shortly.`);
      load();
    }
  }, [searchParams, load]);

  const loadRuns = async (connectorId: string) => {
    const res = await fetch(`${API}/connectors/${connectorId}/runs`);
    if (res.ok) setRuns((await res.json()).runs ?? []);
  };

  const selectConnector = (id: string) => {
    setSelectedId(id);
    loadRuns(id);
  };

  const handleConnect = async (m: ConnectorMeta) => {
    if (m.authType === "oauth") {
      // Create stub connector first, then redirect to OAuth
      const res = await fetch(`${API}/connectors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: CUSTOMER_ID, type: m.type }),
      });
      const data = await res.json();
      const connectorId = data.connector?.id ?? "";
      window.location.href = `${API}/connectors/oauth/authorize?type=${m.type}&customerId=${CUSTOMER_ID}&connectorId=${connectorId}`;
    } else {
      setAddingType(m);
      setFormData({});
    }
  };

  const handleSave = async () => {
    if (!addingType) return;
    setSaving(true);
    try {
      const credentials: Record<string, string> = {};
      const settings: Record<string, string[] | string> = {};

      if (addingType.type === "github") {
        credentials.pat = formData.pat ?? "";
        settings.repos = (formData.repos ?? "").split(",").map(s => s.trim()).filter(Boolean);
      } else if (addingType.type === "linear") {
        credentials.apiKey = formData.apiKey ?? "";
      } else if (addingType.type === "jira") {
        credentials.workspaceUrl = formData.workspaceUrl ?? "";
        (credentials as Record<string, string>).email = formData.email ?? "";
        credentials.apiKey = formData.apiKey ?? "";
        if (formData.projectKeys) {
          (settings as Record<string, string[]>).projectKeys = formData.projectKeys.split(",").map(s => s.trim()).filter(Boolean);
        }
      }

      const res = await fetch(`${API}/connectors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: CUSTOMER_ID, type: addingType.type, credentials, settings }),
      });

      if (!res.ok) throw new Error("Failed to save");
      setAddingType(null);
      showToast(`${addingType.label} connected!`);
      load();
    } catch (e) {
      showToast(`Error: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async (id: string) => {
    setSyncing(id);
    try {
      await fetch(`${API}/connectors/${id}/sync`, { method: "POST" });
      showToast("Sync started");
      setTimeout(() => { loadRuns(id); setSyncing(null); }, 1500);
    } catch {
      setSyncing(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this connector?")) return;
    await fetch(`${API}/connectors/${id}`, { method: "DELETE" });
    if (selectedId === id) setSelectedId(null);
    load();
  };

  const connectedTypes = new Set(connectors.map(c => c.type));
  const unconnected = meta.filter(m => !connectedTypes.has(m.type));
  const selected = connectors.find(c => c.id === selectedId);

  return (
    <div style={{ padding: "2rem", maxWidth: 960, margin: "0 auto" }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, background: "#1db584",
          color: "#000", padding: "0.75rem 1.25rem", borderRadius: 8,
          fontWeight: 600, fontSize: 14, zIndex: 9999,
        }}>
          {toast}
        </div>
      )}

      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 4 }}>
        Integrations
      </h1>
      <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, marginBottom: 32 }}>
        Connect data sources to automatically build and update your product knowledge graph.
      </p>

      {/* Connected */}
      {connectors.length > 0 && (
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.4)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
            Connected
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {connectors.map(c => (
              <div
                key={c.id}
                onClick={() => selectConnector(c.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "14px 18px", borderRadius: 10,
                  background: selectedId === c.id ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${selectedId === c.id ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.07)"}`,
                  cursor: "pointer", transition: "all 0.15s",
                }}
              >
                <span style={{ fontSize: 20 }}>{CONNECTOR_ICONS[c.type] ?? "🔌"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{c.label}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                    {c.lastSyncAt ? `Last sync ${formatRelative(c.lastSyncAt)}` : "Never synced"}
                  </div>
                </div>
                <div style={{
                  fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 20,
                  background: `${STATUS_COLOR[c.status]}22`, color: STATUS_COLOR[c.status],
                }}>
                  {STATUS_LABEL[c.status]}
                </div>
                <button
                  onClick={e => { e.stopPropagation(); handleSync(c.id); }}
                  disabled={syncing === c.id}
                  style={{
                    padding: "5px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)",
                    fontSize: 12, cursor: "pointer",
                  }}
                >
                  {syncing === c.id ? "Syncing…" : "Sync now"}
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(c.id); }}
                  style={{
                    padding: "5px 10px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.2)",
                    background: "rgba(239,68,68,0.05)", color: "rgba(239,68,68,0.7)",
                    fontSize: 12, cursor: "pointer",
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Sync runs panel */}
      {selected && (
        <section style={{ marginBottom: 40, padding: "16px 20px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 12 }}>
            Recent syncs — {selected.label}
          </h3>
          {runs.length === 0 ? (
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>No syncs yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {runs.map(r => (
                <div key={r.id} style={{ display: "flex", gap: 16, fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
                  <span style={{ color: r.status === "done" ? "#1db584" : r.status === "error" ? "#ef4444" : "#f59e0b", fontWeight: 600, width: 60 }}>
                    {r.status}
                  </span>
                  <span>{r.chunksProcessed} chunks</span>
                  <span>{r.nodesExtracted} nodes</span>
                  <span style={{ color: "rgba(255,255,255,0.3)", marginLeft: "auto" }}>{formatRelative(r.startedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Available to connect */}
      {unconnected.length > 0 && (
        <section>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.4)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
            Available
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {unconnected.map(m => (
              <div
                key={m.type}
                style={{
                  padding: "18px 20px", borderRadius: 10,
                  background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 22 }}>{CONNECTOR_ICONS[m.type] ?? "🔌"}</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{m.label}</span>
                </div>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 16, lineHeight: 1.5 }}>
                  {m.description}
                </p>
                <button
                  onClick={() => handleConnect(m)}
                  style={{
                    padding: "7px 16px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.15)",
                    background: "rgba(255,255,255,0.06)", color: "#fff",
                    fontSize: 13, fontWeight: 600, cursor: "pointer", width: "100%",
                  }}
                >
                  Connect {m.label}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Add connector modal (PAT/API key flows) */}
      {addingType && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        }} onClick={() => setAddingType(null)}>
          <div
            style={{
              background: "#111", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12,
              padding: "28px 32px", width: 440, maxWidth: "90vw",
            }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 6 }}>
              Connect {addingType.label}
            </h2>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 24 }}>
              {addingType.description}
            </p>

            {/* GitHub */}
            {addingType.type === "github" && (
              <>
                <Field label="Personal Access Token" value={formData.pat ?? ""} type="password"
                  onChange={v => setFormData(p => ({ ...p, pat: v }))}
                  hint="Needs repo scope. Create at github.com/settings/tokens"
                />
                <Field label="Repositories" value={formData.repos ?? ""}
                  onChange={v => setFormData(p => ({ ...p, repos: v }))}
                  hint="Comma-separated: owner/repo, owner/repo2"
                />
              </>
            )}

            {/* Linear */}
            {addingType.type === "linear" && (
              <Field label="API Key" value={formData.apiKey ?? ""} type="password"
                onChange={v => setFormData(p => ({ ...p, apiKey: v }))}
                hint="Create at linear.app/settings/api"
              />
            )}

            {/* Jira */}
            {addingType.type === "jira" && (
              <>
                <Field label="Workspace URL" value={formData.workspaceUrl ?? ""}
                  onChange={v => setFormData(p => ({ ...p, workspaceUrl: v }))}
                  hint="e.g. https://yourcompany.atlassian.net"
                />
                <Field label="Email" value={formData.email ?? ""}
                  onChange={v => setFormData(p => ({ ...p, email: v }))}
                />
                <Field label="API Token" value={formData.apiKey ?? ""} type="password"
                  onChange={v => setFormData(p => ({ ...p, apiKey: v }))}
                  hint="Create at id.atlassian.com/manage-profile/security/api-tokens"
                />
                <Field label="Project Keys (optional)" value={formData.projectKeys ?? ""}
                  onChange={v => setFormData(p => ({ ...p, projectKeys: v }))}
                  hint="Comma-separated: API,PLAT (empty = all projects)"
                />
              </>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
              <button
                onClick={handleSave} disabled={saving}
                style={{
                  flex: 1, padding: "10px 0", borderRadius: 8, border: "none",
                  background: "#1db584", color: "#000", fontWeight: 700, fontSize: 14, cursor: "pointer",
                }}
              >
                {saving ? "Connecting…" : "Connect"}
              </button>
              <button
                onClick={() => setAddingType(null)}
                style={{
                  padding: "10px 20px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)",
                  background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 14, cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", hint }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; hint?: string
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.7)", display: "block", marginBottom: 6 }}>
        {label}
      </label>
      <input
        type={type} value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: "100%", padding: "9px 12px", borderRadius: 7,
          border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)",
          color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box",
        }}
      />
      {hint && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>{hint}</p>}
    </div>
  );
}
