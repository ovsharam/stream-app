-- Run in Supabase SQL Editor (applied_plumbing / Fairway-Pro)
-- Captures operator telemetry + FDE training sessions for baseline model work.

CREATE TABLE IF NOT EXISTS operator_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  operator_id TEXT NOT NULL,
  type TEXT NOT NULL,
  ts BIGINT NOT NULL,
  surface TEXT,
  subject_type TEXT,
  subject_id TEXT,
  correlation_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_operator_events_ts ON operator_events (ts DESC);
CREATE INDEX IF NOT EXISTS idx_operator_events_type ON operator_events (type);
CREATE INDEX IF NOT EXISTS idx_operator_events_operator ON operator_events (operator_id);
CREATE INDEX IF NOT EXISTS idx_operator_events_correlation ON operator_events (correlation_id);
CREATE INDEX IF NOT EXISTS idx_operator_events_subject ON operator_events (subject_type, subject_id);

CREATE TABLE IF NOT EXISTS fde_training_sessions (
  id TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  started_at BIGINT NOT NULL,
  ended_at BIGINT NOT NULL,
  signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  meetings JSONB NOT NULL DEFAULT '[]'::jsonb,
  traces JSONB NOT NULL DEFAULT '[]'::jsonb,
  exported_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fde_training_operator ON fde_training_sessions (operator_id);
CREATE INDEX IF NOT EXISTS idx_fde_training_started ON fde_training_sessions (started_at DESC);

-- Optional: enable later for semantic retrieval (HF embeddings → pgvector)
-- CREATE EXTENSION IF NOT EXISTS vector;
-- CREATE TABLE IF NOT EXISTS kb_datapoint_embeddings (
--   datapoint_id TEXT PRIMARY KEY,
--   operator_id TEXT NOT NULL,
--   source TEXT NOT NULL,
--   title TEXT,
--   body_preview TEXT,
--   embedding vector(384),
--   ingested_at BIGINT NOT NULL
-- );

ALTER TABLE operator_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE fde_training_sessions ENABLE ROW LEVEL SECURITY;

-- Server uses service_role key (bypasses RLS). No anon policies until multi-user.
