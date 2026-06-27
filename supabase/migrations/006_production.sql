-- Production multi-tenant schema for Plumb / Notch FDE platform
-- Requires Supabase Postgres with RLS enabled

-- ─── Organizations ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organizations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  slug       text NOT NULL UNIQUE,
  plan       text NOT NULL DEFAULT 'free',  -- free | pro | enterprise
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- ─── Org membership ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS org_members (
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'fde',  -- fde | ae | am | admin
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);

ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

-- Users can see their own memberships
CREATE POLICY "org_members_self_read" ON org_members
  FOR SELECT USING (user_id = auth.uid());

-- Admins can see all members of their orgs
CREATE POLICY "org_members_org_read" ON org_members
  FOR SELECT USING (
    org_id IN (
      SELECT om.org_id FROM org_members om
      WHERE om.user_id = auth.uid() AND om.role = 'admin'
    )
  );

-- Only admins can insert members
CREATE POLICY "org_members_admin_insert" ON org_members
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT om.org_id FROM org_members om
      WHERE om.user_id = auth.uid() AND om.role = 'admin'
    )
  );

-- Admins can delete members (but not themselves)
CREATE POLICY "org_members_admin_delete" ON org_members
  FOR DELETE USING (
    user_id != auth.uid() AND
    org_id IN (
      SELECT om.org_id FROM org_members om
      WHERE om.user_id = auth.uid() AND om.role = 'admin'
    )
  );

-- Allow insert of first member (self-signup org creation)
CREATE POLICY "org_members_self_insert" ON org_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Organizations visible to members
CREATE POLICY "organizations_member_read" ON organizations
  FOR SELECT USING (
    id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

-- Admins can update their org
CREATE POLICY "organizations_admin_update" ON organizations
  FOR UPDATE USING (
    id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Any authenticated user can create an org (onboarding)
CREATE POLICY "organizations_authenticated_insert" ON organizations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ─── Clients ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clients (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name       text NOT NULL,
  company    text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clients_org ON clients(org_id);
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_org_read" ON clients
  FOR SELECT USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "clients_org_insert" ON clients
  FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "clients_org_update" ON clients
  FOR UPDATE USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "clients_org_delete" ON clients
  FOR DELETE USING (
    org_id IN (
      SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ─── Engagements ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engagements (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id          uuid REFERENCES clients(id) ON DELETE SET NULL,
  title              text NOT NULL,
  stage              text NOT NULL DEFAULT 'intake',  -- intake|context|build|test|deploy|paused
  scope              text NOT NULL DEFAULT 'unknown', -- quick_win|big_bet|unknown
  summary            text,
  build_prompt       text,
  context_score      int,
  classification     text,
  crm_ref            jsonb,   -- {system, external_id, owner_name}
  signal_sources     text[],
  meeting_ids        text[],
  feed_item_ids      text[],
  deploy_url         text,
  escalation_level   int NOT NULL DEFAULT 0,
  google_doc_url     text,
  next_steps         text[],
  flags              text[],
  open_questions     text[],
  proposal_ids       text[],
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_engagements_org ON engagements(org_id);
CREATE INDEX IF NOT EXISTS idx_engagements_updated ON engagements(org_id, updated_at DESC);

ALTER TABLE engagements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "engagements_org_read" ON engagements
  FOR SELECT USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "engagements_org_insert" ON engagements
  FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "engagements_org_update" ON engagements
  FOR UPDATE USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "engagements_org_delete" ON engagements
  FOR DELETE USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER engagements_updated_at
  BEFORE UPDATE ON engagements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Engagement requirements ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engagement_requirements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  field         text NOT NULL,
  value         text,
  status        text NOT NULL DEFAULT 'pending',  -- pending|done|skipped
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_req_engagement ON engagement_requirements(engagement_id);
CREATE INDEX IF NOT EXISTS idx_req_org ON engagement_requirements(org_id);

ALTER TABLE engagement_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "requirements_org_read" ON engagement_requirements
  FOR SELECT USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "requirements_org_insert" ON engagement_requirements
  FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "requirements_org_update" ON engagement_requirements
  FOR UPDATE USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "requirements_org_delete" ON engagement_requirements
  FOR DELETE USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

-- ─── Engagement events (telemetry / moat) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS engagement_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id  uuid REFERENCES engagements(id) ON DELETE CASCADE,
  org_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind           text NOT NULL,  -- stage_change|meeting_added|build_run|feedback|etc.
  detail         text,
  payload        jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_engagement ON engagement_events(engagement_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_org ON engagement_events(org_id, created_at DESC);

ALTER TABLE engagement_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_org_read" ON engagement_events
  FOR SELECT USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "events_org_insert" ON engagement_events
  FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

-- Events are immutable — no UPDATE/DELETE policies

-- ─── Integrations ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS integrations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider   text NOT NULL,  -- gmail|slack|monday|gong|etc.
  status     text NOT NULL DEFAULT 'disconnected',  -- connected|disconnected|error
  oauth_ref  text,  -- opaque reference to credentials in secrets store
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_integrations_org ON integrations(org_id);

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "integrations_org_read" ON integrations
  FOR SELECT USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "integrations_org_write" ON integrations
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role IN ('admin', 'fde')
    )
  );

-- ─── Meeting sessions ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS meeting_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  engagement_id  uuid REFERENCES engagements(id) ON DELETE SET NULL,
  transcript     text,
  summary        text,
  google_doc_url text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meetings_org ON meeting_sessions(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_engagement ON meeting_sessions(engagement_id);

ALTER TABLE meeting_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meetings_org_read" ON meeting_sessions
  FOR SELECT USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "meetings_org_insert" ON meeting_sessions
  FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "meetings_org_update" ON meeting_sessions
  FOR UPDATE USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
