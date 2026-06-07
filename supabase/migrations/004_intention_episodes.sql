-- Intention episodes — behavioral intention derived from operator events.
-- Run in Supabase SQL Editor after 001_operator_capture.sql.

CREATE TABLE IF NOT EXISTS intention_episodes (
  id TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  correlation_id TEXT,
  stimulus_type TEXT NOT NULL,
  stimulus_id TEXT NOT NULL,
  stimulus_source TEXT,
  stimulus_label TEXT,
  started_at BIGINT NOT NULL,
  ended_at BIGINT,
  status TEXT NOT NULL,
  outcome TEXT,
  event_chain JSONB NOT NULL DEFAULT '[]'::jsonb,
  event_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  latencies JSONB NOT NULL DEFAULT '{}'::jsonb,
  commitment_depth INTEGER NOT NULL,
  behavioral_weight REAL NOT NULL,
  reaction_tier TEXT,
  text_intention JSONB,
  dominant_intention TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_intention_episodes_started ON intention_episodes (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_intention_episodes_status ON intention_episodes (status);
CREATE INDEX IF NOT EXISTS idx_intention_episodes_operator ON intention_episodes (operator_id);
CREATE INDEX IF NOT EXISTS idx_intention_episodes_stimulus ON intention_episodes (stimulus_type, stimulus_id);

ALTER TABLE intention_episodes ENABLE ROW LEVEL SECURITY;
