-- Internal Plumb DB (djfsegqmzggnjifefqcd / applied_plumbing)
-- Behavioral telemetry from the Plumb desktop app — per user, per session.
-- This is NOT the customer product DB. Server uses service_role key (bypasses RLS).

CREATE TABLE IF NOT EXISTS telemetry_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event       text NOT NULL,          -- e.g. feed.impression, chat.send, nav.page
  session_id  text,
  user_id     text,                   -- auth.uid or anonymous device ID
  ts          timestamptz NOT NULL,
  properties  jsonb NOT NULL DEFAULT '{}'::jsonb,  -- full TelemetryPayload
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_event    ON telemetry_events(event);
CREATE INDEX IF NOT EXISTS idx_telemetry_session  ON telemetry_events(session_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_user     ON telemetry_events(user_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_ts       ON telemetry_events(ts DESC);

ALTER TABLE telemetry_events ENABLE ROW LEVEL SECURITY;
-- Server writes via service_role (bypasses RLS). No client-facing policies needed.
