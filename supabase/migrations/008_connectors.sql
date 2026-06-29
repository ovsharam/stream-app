-- Connector configs (one row per customer+integration)
-- credentials_json is stored encrypted at rest via Supabase Vault in prod
-- For now: service-role key access only (no RLS needed — backend reads all)

CREATE TABLE IF NOT EXISTS pg_connectors (
  id             TEXT PRIMARY KEY,
  customer_id    TEXT NOT NULL,
  type           TEXT NOT NULL,
  label          TEXT NOT NULL,
  credentials_json TEXT NOT NULL DEFAULT '{}',
  settings_json  TEXT NOT NULL DEFAULT '{}',
  status         TEXT NOT NULL DEFAULT 'pending_auth'
                   CHECK (status IN ('active','paused','error','pending_auth')),
  error_msg      TEXT,
  last_sync_at   BIGINT,
  created_at     BIGINT NOT NULL,
  updated_at     BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pg_connectors_customer
  ON pg_connectors (customer_id, type);

CREATE INDEX IF NOT EXISTS idx_pg_connectors_active
  ON pg_connectors (status)
  WHERE status = 'active';

-- Sync run history (immutable append-only log)
CREATE TABLE IF NOT EXISTS pg_connector_sync_runs (
  id               TEXT PRIMARY KEY,
  connector_id     TEXT NOT NULL REFERENCES pg_connectors(id) ON DELETE CASCADE,
  customer_id      TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'running'
                     CHECK (status IN ('running','done','error')),
  chunks_processed INTEGER NOT NULL DEFAULT 0,
  nodes_extracted  INTEGER NOT NULL DEFAULT 0,
  error_msg        TEXT,
  started_at       BIGINT NOT NULL,
  completed_at     BIGINT
);

CREATE INDEX IF NOT EXISTS idx_pg_sync_runs_connector
  ON pg_connector_sync_runs (connector_id, started_at DESC);
