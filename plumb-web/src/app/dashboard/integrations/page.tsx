"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";

const CUSTOMER_ID = "plumb-internal";

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
  slack:        "💬",
  github:       "🐙",
  linear:       "🔺",
  notion:       "📝",
  google_drive: "📁",
  jira:         "🎯",
  gong:         "🎙️",
  zoom:         "📹",
  monday:       "📅",
  trello:       "🗂️",
  asana:        "✅",
  clickup:      "⚡",
  confluence:   "📚",
  gitbook:      "📖",
  readme:       "📄",
};

const STATUS_COLOR: Record<string, string> = {
  active:       "#1db584",
  paused:       "var(--db-text-5)",
  error:        "#ef4444",
  pending_auth: "#f59e0b",
};

const STATUS_LABEL: Record<string, string> = {
  active:       "Active",
  paused:       "Paused",
  error:        "Error",
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
      fetch("/api/connectors/meta"),
      fetch(`/api/connectors?customerId=${CUSTOMER_ID}`),
    ]);
    if (metaRes.ok) setMeta((await metaRes.json()).connectors ?? []);
    if (listRes.ok) setConnectors((await listRes.json()).connectors ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const connected = searchParams.get("connected");
    if (connected) {
      showToast(`${connected} connected! Sync will start shortly.`);
      load();
    }
  }, [searchParams, load]);

  const loadRuns = async (connectorId: string) => {
    const res = await fetch(`/api/connectors/${connectorId}/runs`);
    if (res.ok) setRuns((await res.json()).runs ?? []);
  };

  const selectConnector = (id: string) => {
    setSelectedId(id);
    loadRuns(id);
  };

  const handleConnect = async (m: ConnectorMeta) => {
    if (m.authType === "oauth") {
      const res = await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: CUSTOMER_ID, type: m.type, label: m.label }),
      });
      const data = await res.json();
      const connectorId = data.connector?.id ?? "";
      // OAuth flows require the Railway backend — show instructions for now
      showToast(`${m.label} connector created. Configure OAuth via the Railway backend.`);
      if (connectorId) load();
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
      const t = addingType.type;

      if (t === "github") {
        credentials.pat = formData.pat ?? "";
        settings.repos = (formData.repos ?? "").split(",").map(s => s.trim()).filter(Boolean);
      } else if (t === "linear") {
        credentials.apiKey = formData.apiKey ?? "";
      } else if (t === "jira") {
        credentials.workspaceUrl = formData.workspaceUrl ?? "";
        credentials.email = formData.email ?? "";
        credentials.apiKey = formData.apiKey ?? "";
        if (formData.projectKeys) settings.projectKeys = formData.projectKeys.split(",").map(s => s.trim()).filter(Boolean);
      } else if (t === "monday") {
        credentials.apiKey = formData.apiKey ?? "";
        if (formData.boardIds) settings.boardIds = formData.boardIds.split(",").map(s => s.trim()).filter(Boolean);
      } else if (t === "trello") {
        // Trello needs apiKey:token combined
        credentials.apiKey = `${formData.apiKey ?? ""}:${formData.token ?? ""}`;
        if (formData.boardIds) settings.boardIds = formData.boardIds.split(",").map(s => s.trim()).filter(Boolean);
      } else if (t === "asana") {
        credentials.pat = formData.pat ?? "";
        if (formData.projectIds) settings.projectIds = formData.projectIds.split(",").map(s => s.trim()).filter(Boolean);
      } else if (t === "clickup") {
        credentials.apiKey = formData.apiKey ?? "";
      } else if (t === "confluence") {
        credentials.workspaceUrl = formData.workspaceUrl ?? "";
        credentials.email = formData.email ?? "";
        credentials.apiKey = formData.apiKey ?? "";
        if (formData.spaceKeys) settings.spaceKeys = formData.spaceKeys.split(",").map(s => s.trim()).filter(Boolean);
      } else if (t === "gitbook") {
        credentials.apiKey = formData.apiKey ?? "";
        if (formData.spaceIds) settings.spaceIds = formData.spaceIds.split(",").map(s => s.trim()).filter(Boolean);
      } else if (t === "readme") {
        credentials.apiKey = formData.apiKey ?? "";
      }

      const res = await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: CUSTOMER_ID, type: t, label: addingType.label, credentials, settings }),
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
      await fetch(`/api/connectors/${id}/sync`, { method: "POST" });
      showToast("Sync started");
      setTimeout(() => { loadRuns(id); setSyncing(null); }, 1500);
    } catch {
      setSyncing(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this connector?")) return;
    await fetch(`/api/connectors/${id}`, { method: "DELETE" });
    if (selectedId === id) setSelectedId(null);
    load();
  };

  const connectedTypes = new Set(connectors.map(c => c.type));
  const unconnected = meta.filter(m => !connectedTypes.has(m.type));
  const selected = connectors.find(c => c.id === selectedId);

  return (
    <div style={{ padding: "2rem", maxWidth: 960, margin: "0 auto" }}>
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, background: "#1db584",
          color: "#000", padding: "0.75rem 1.25rem", borderRadius: 8,
          fontWeight: 600, fontSize: 14, zIndex: 9999,
        }}>
          {toast}
        </div>
      )}

      <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--db-text)", marginBottom: 4 }}>
        Integrations
      </h1>
      <p style={{ color: "var(--db-text-4)", fontSize: 14, marginBottom: 32 }}>
        Connect data sources to automatically build and update your product knowledge graph.
      </p>

      {connectors.length > 0 && (
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--db-text-5)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
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
                  background: selectedId === c.id ? "var(--db-overlay-md)" : "var(--db-overlay-sm)",
                  border: `1px solid ${selectedId === c.id ? "var(--db-border-alt)" : "var(--db-border)"}`,
                  cursor: "pointer", transition: "all 0.15s",
                }}
              >
                <span style={{ fontSize: 20 }}>{CONNECTOR_ICONS[c.type] ?? "🔌"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--db-text)" }}>{c.label}</div>
                  <div style={{ fontSize: 12, color: "var(--db-text-5)", marginTop: 2 }}>
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
                    padding: "5px 12px", borderRadius: 6, border: "1px solid var(--db-border-alt)",
                    background: "var(--db-overlay-md)", color: "var(--db-text-3)",
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

      {selected && (
        <section style={{ marginBottom: 40, padding: "16px 20px", borderRadius: 10, background: "var(--db-border)", border: "1px solid var(--db-border)" }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--db-text-4)", marginBottom: 12 }}>
            Recent syncs — {selected.label}
          </h3>
          {runs.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--db-text-6)" }}>No syncs yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {runs.map(r => (
                <div key={r.id} style={{ display: "flex", gap: 16, fontSize: 13, color: "var(--db-text-3)" }}>
                  <span style={{ color: r.status === "done" ? "#1db584" : r.status === "error" ? "#ef4444" : "#f59e0b", fontWeight: 600, width: 60 }}>
                    {r.status}
                  </span>
                  <span>{r.chunksProcessed} chunks</span>
                  <span>{r.nodesExtracted} nodes</span>
                  <span style={{ color: "var(--db-text-6)", marginLeft: "auto" }}>{formatRelative(r.startedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {unconnected.length > 0 && (
        <section>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--db-text-5)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
            Available
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {unconnected.map(m => (
              <div
                key={m.type}
                style={{
                  padding: "18px 20px", borderRadius: 10,
                  background: "var(--db-border)", border: "1px solid var(--db-border)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 22 }}>{CONNECTOR_ICONS[m.type] ?? "🔌"}</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "var(--db-text)" }}>{m.label}</span>
                </div>
                <p style={{ fontSize: 13, color: "var(--db-text-5)", marginBottom: 16, lineHeight: 1.5 }}>
                  {m.description}
                </p>
                <button
                  onClick={() => handleConnect(m)}
                  style={{
                    padding: "7px 16px", borderRadius: 7, border: "1px solid var(--db-border-alt)",
                    background: "var(--db-overlay-md)", color: "var(--db-text-2)",
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

      {addingType && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        }} onClick={() => setAddingType(null)}>
          <div
            style={{
              background: "var(--db-surface)", border: "1px solid var(--db-border-alt)", borderRadius: 12,
              padding: "28px 32px", width: 440, maxWidth: "90vw", maxHeight: "85vh", overflowY: "auto",
            }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--db-text)", marginBottom: 6 }}>
              Connect {addingType.label}
            </h2>
            <p style={{ fontSize: 13, color: "var(--db-text-5)", marginBottom: 24 }}>
              {addingType.description}
            </p>

            {addingType.type === "github" && <>
              <Field label="Personal Access Token" value={formData.pat ?? ""} type="password"
                onChange={v => setFormData(p => ({ ...p, pat: v }))}
                hint="Needs repo scope — github.com/settings/tokens" />
              <Field label="Repositories" value={formData.repos ?? ""}
                onChange={v => setFormData(p => ({ ...p, repos: v }))}
                hint="Comma-separated: owner/repo, owner/repo2" />
            </>}

            {addingType.type === "linear" && <>
              <Field label="API Key" value={formData.apiKey ?? ""} type="password"
                onChange={v => setFormData(p => ({ ...p, apiKey: v }))}
                hint="linear.app → Settings → API → Personal API Keys" />
            </>}

            {addingType.type === "jira" && <>
              <Field label="Workspace URL" value={formData.workspaceUrl ?? ""}
                onChange={v => setFormData(p => ({ ...p, workspaceUrl: v }))}
                hint="https://yourcompany.atlassian.net" />
              <Field label="Email" value={formData.email ?? ""}
                onChange={v => setFormData(p => ({ ...p, email: v }))} />
              <Field label="API Token" value={formData.apiKey ?? ""} type="password"
                onChange={v => setFormData(p => ({ ...p, apiKey: v }))}
                hint="id.atlassian.com/manage-profile/security/api-tokens" />
              <Field label="Project Keys (optional)" value={formData.projectKeys ?? ""}
                onChange={v => setFormData(p => ({ ...p, projectKeys: v }))}
                hint="Comma-separated: API,PLAT (empty = all)" />
            </>}

            {addingType.type === "monday" && <>
              <Field label="API Key" value={formData.apiKey ?? ""} type="password"
                onChange={v => setFormData(p => ({ ...p, apiKey: v }))}
                hint="monday.com → Avatar → Admin → API" />
              <Field label="Board IDs (optional)" value={formData.boardIds ?? ""}
                onChange={v => setFormData(p => ({ ...p, boardIds: v }))}
                hint="Comma-separated board IDs (empty = all boards)" />
            </>}

            {addingType.type === "trello" && <>
              <Field label="API Key" value={formData.apiKey ?? ""}
                onChange={v => setFormData(p => ({ ...p, apiKey: v }))}
                hint="trello.com/app-key" />
              <Field label="Token" value={formData.token ?? ""} type="password"
                onChange={v => setFormData(p => ({ ...p, token: v }))}
                hint="Generate token on the same page" />
              <Field label="Board IDs (optional)" value={formData.boardIds ?? ""}
                onChange={v => setFormData(p => ({ ...p, boardIds: v }))}
                hint="Comma-separated (empty = all boards)" />
            </>}

            {addingType.type === "asana" && <>
              <Field label="Personal Access Token" value={formData.pat ?? ""} type="password"
                onChange={v => setFormData(p => ({ ...p, pat: v }))}
                hint="app.asana.com → Profile → Apps → Personal access tokens" />
              <Field label="Project IDs (optional)" value={formData.projectIds ?? ""}
                onChange={v => setFormData(p => ({ ...p, projectIds: v }))}
                hint="Comma-separated GIDs (empty = all projects)" />
            </>}

            {addingType.type === "clickup" && <>
              <Field label="API Key" value={formData.apiKey ?? ""} type="password"
                onChange={v => setFormData(p => ({ ...p, apiKey: v }))}
                hint="app.clickup.com → Settings → Apps → API Token" />
            </>}

            {addingType.type === "confluence" && <>
              <Field label="Workspace URL" value={formData.workspaceUrl ?? ""}
                onChange={v => setFormData(p => ({ ...p, workspaceUrl: v }))}
                hint="https://yourcompany.atlassian.net" />
              <Field label="Email" value={formData.email ?? ""}
                onChange={v => setFormData(p => ({ ...p, email: v }))} />
              <Field label="API Token" value={formData.apiKey ?? ""} type="password"
                onChange={v => setFormData(p => ({ ...p, apiKey: v }))}
                hint="Same token as Jira — id.atlassian.com/api-tokens" />
              <Field label="Space Keys (optional)" value={formData.spaceKeys ?? ""}
                onChange={v => setFormData(p => ({ ...p, spaceKeys: v }))}
                hint="Comma-separated: PROD,ENG (empty = all spaces)" />
            </>}

            {addingType.type === "gitbook" && <>
              <Field label="API Key" value={formData.apiKey ?? ""} type="password"
                onChange={v => setFormData(p => ({ ...p, apiKey: v }))}
                hint="app.gitbook.com → Settings → Developer → API Keys" />
              <Field label="Space IDs (optional)" value={formData.spaceIds ?? ""}
                onChange={v => setFormData(p => ({ ...p, spaceIds: v }))}
                hint="Comma-separated space IDs (empty = all spaces)" />
            </>}

            {addingType.type === "readme" && <>
              <Field label="API Key" value={formData.apiKey ?? ""} type="password"
                onChange={v => setFormData(p => ({ ...p, apiKey: v }))}
                hint="dash.readme.com → Configuration → API Key" />
            </>}

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
                  padding: "10px 20px", borderRadius: 8, border: "1px solid var(--db-border-alt)",
                  background: "transparent", color: "var(--db-text-4)", fontSize: 14, cursor: "pointer",
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
      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--db-text-2)", display: "block", marginBottom: 6 }}>
        {label}
      </label>
      <input
        type={type} value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: "100%", padding: "9px 12px", borderRadius: 7,
          border: "1px solid var(--db-border-alt)", background: "var(--db-border)",
          color: "var(--db-text)", fontSize: 14, outline: "none", boxSizing: "border-box",
        }}
      />
      {hint && <p style={{ fontSize: 12, color: "var(--db-text-6)", marginTop: 4 }}>{hint}</p>}
    </div>
  );
}
