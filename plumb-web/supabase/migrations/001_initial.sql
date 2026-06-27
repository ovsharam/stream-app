-- Plumb / Notch FDE workspace — initial schema + RLS
-- Run against Supabase Postgres (via psql, Supabase SQL editor, or drizzle-kit push + this file)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('fde', 'ae', 'am', 'se', 'ce', 'swe', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE case_stage AS ENUM ('intake', 'context', 'build', 'test', 'deploy');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE case_type AS ENUM ('quickwin', 'bigbet');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE requirement_status AS ENUM ('open', 'confirmed', 'dropped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE event_kind AS ENUM (
    'intake', 'open_case', 'stage_change', 'classify', 'context_score', 'ae_sync', 'build_kickoff', 'ingest'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE integration_provider AS ENUM ('gmail', 'slack', 'monday', 'linkedin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE integration_status AS ENUM ('connected', 'disconnected', 'error', 'stub');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  plan text NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  role user_role NOT NULL DEFAULT 'fde',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  title text NOT NULL,
  stage case_stage NOT NULL DEFAULT 'intake',
  type case_type,
  context_score int NOT NULL DEFAULT 0,
  context_gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  value_usd int NOT NULL DEFAULT 0,
  ae_name text,
  build_prompt text,
  due_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS case_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  text text NOT NULL,
  status requirement_status NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  kind event_kind NOT NULL,
  detail text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider integration_provider NOT NULL,
  status integration_status NOT NULL DEFAULT 'disconnected',
  oauth_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cases_org ON cases(org_id);
CREATE INDEX IF NOT EXISTS idx_case_events_org_created ON case_events(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM users WHERE id = auth.uid() LIMIT 1;
$$;

-- Organizations: members can read their org
DROP POLICY IF EXISTS org_select ON organizations;
CREATE POLICY org_select ON organizations FOR SELECT
  USING (id = public.current_org_id());

-- Users: same org
DROP POLICY IF EXISTS users_select ON users;
CREATE POLICY users_select ON users FOR SELECT
  USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS users_insert_self ON users;
CREATE POLICY users_insert_self ON users FOR INSERT
  WITH CHECK (id = auth.uid());

-- Clients
DROP POLICY IF EXISTS clients_all ON clients;
CREATE POLICY clients_all ON clients FOR ALL
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

-- Cases
DROP POLICY IF EXISTS cases_all ON cases;
CREATE POLICY cases_all ON cases FOR ALL
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

-- Requirements (via case org)
DROP POLICY IF EXISTS case_requirements_all ON case_requirements;
CREATE POLICY case_requirements_all ON case_requirements FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM cases c
      WHERE c.id = case_requirements.case_id
        AND c.org_id = public.current_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cases c
      WHERE c.id = case_requirements.case_id
        AND c.org_id = public.current_org_id()
    )
  );

-- Events
DROP POLICY IF EXISTS case_events_all ON case_events;
CREATE POLICY case_events_all ON case_events FOR ALL
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

-- Integrations
DROP POLICY IF EXISTS integrations_all ON integrations;
CREATE POLICY integrations_all ON integrations FOR ALL
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

-- Realtime publication for sensor rail
ALTER PUBLICATION supabase_realtime ADD TABLE case_events;
