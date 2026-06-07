-- FDE meeting corpus snapshots — auto-synced after each call ends.
-- Run in Supabase SQL Editor after 001_operator_capture.sql.

CREATE TABLE IF NOT EXISTS fde_meeting_snapshots (
  session_id TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL,
  engagement_id TEXT,
  exported_at BIGINT NOT NULL,
  meeting JSONB NOT NULL DEFAULT '{}'::jsonb,
  chunks JSONB NOT NULL DEFAULT '[]'::jsonb,
  signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  starred JSONB NOT NULL DEFAULT '[]'::jsonb,
  predictions JSONB NOT NULL DEFAULT '[]'::jsonb,
  decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
  revisions JSONB NOT NULL DEFAULT '[]'::jsonb,
  requirements JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_fde_meeting_snapshots_engagement ON fde_meeting_snapshots (engagement_id);
CREATE INDEX IF NOT EXISTS idx_fde_meeting_snapshots_exported ON fde_meeting_snapshots (exported_at DESC);
CREATE INDEX IF NOT EXISTS idx_fde_meeting_snapshots_operator ON fde_meeting_snapshots (operator_id);

ALTER TABLE fde_meeting_snapshots ENABLE ROW LEVEL SECURITY;
