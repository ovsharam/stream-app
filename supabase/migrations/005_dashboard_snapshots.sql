-- Cached dashboard snapshot for Scope Measure when Cloudflare tunnel is offline.

CREATE TABLE IF NOT EXISTS dashboard_snapshots (
  id TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  exported_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dashboard_snapshots_exported ON dashboard_snapshots (exported_at DESC);
