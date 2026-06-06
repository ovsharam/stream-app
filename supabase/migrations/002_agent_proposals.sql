-- Agent proposals + interaction log (mirrors local agent.sqlite for cloud training export)

create table if not exists public.agent_proposals (
  id text primary key,
  operator_id text not null,
  source text not null default 'linkedin',
  thread_id text not null,
  sender_name text not null,
  raw_message text not null,
  intent text not null,
  confidence real not null default 0,
  linkedin_reply_draft text not null,
  booking_task jsonb,
  invitee_resolution jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  execution_result jsonb
);

create index if not exists idx_agent_proposals_operator_status
  on public.agent_proposals (operator_id, status, created_at desc);

create table if not exists public.agent_interaction_log (
  id text primary key,
  proposal_id text not null references public.agent_proposals (id) on delete cascade,
  operator_id text not null,
  stage text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_interaction_log_proposal
  on public.agent_interaction_log (proposal_id, created_at);
