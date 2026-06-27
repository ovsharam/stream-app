/**
 * Multi-tenant Supabase DB client for FDE tables.
 *
 * When SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set, all FDE CRUD goes
 * through Supabase Postgres (org-scoped, service-role bypasses RLS for
 * efficient queries).
 *
 * When Supabase is not configured, all functions fall back to the local
 * SQLite-backed engagementStore so local dev / Electron keeps working.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import type { FdeEngagement, EngagementStage, ScopeBucket, EscalationLevel } from '../shared/fde-engagement'
import { computeContextScore, normalizeEngagementStage } from '../shared/fde-context'

// ─── Supabase client singleton ──────────────────────────────────────────────

let _client: SupabaseClient | null = null

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
}

function getClient(): SupabaseClient | null {
  if (_client) return _client
  const url = process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return null
  _client = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
  return _client
}

// ─── SQLite fallback helpers ─────────────────────────────────────────────────

function getSqliteStore() {
  // Dynamic require to avoid import-time side-effects when Supabase IS configured
  return require('./fde/engagementStore') as typeof import('./fde/engagementStore')
}

function getSqliteTrainingStore() {
  return require('./fde/trainingStore') as typeof import('./fde/trainingStore')
}

// ─── Row ↔ FdeEngagement mapping ─────────────────────────────────────────────

interface EngagementRow {
  id: string
  org_id: string
  client_id: string | null
  title: string
  stage: string
  scope: string
  summary: string | null
  build_prompt: string | null
  context_score: number | null
  classification: string | null
  crm_ref: Record<string, unknown> | null
  signal_sources: string[] | null
  meeting_ids: string[] | null
  feed_item_ids: string[] | null
  deploy_url: string | null
  escalation_level: number
  google_doc_url: string | null
  next_steps: string[] | null
  flags: string[] | null
  open_questions: string[] | null
  proposal_ids: string[] | null
  created_at: string
  updated_at: string
}

function rowToEngagement(r: EngagementRow): FdeEngagement {
  const engagement: FdeEngagement = {
    id: r.id,
    clientName: r.title,
    company: (r.crm_ref as { owner_name?: string } | null)?.owner_name ?? undefined,
    stage: normalizeEngagementStage(r.stage),
    scope: (r.scope as ScopeBucket) ?? 'unknown',
    summary: r.summary ?? undefined,
    buildPrompt: r.build_prompt ?? undefined,
    nextSteps: r.next_steps ?? [],
    flags: r.flags ?? [],
    openQuestions: r.open_questions ?? [],
    meetingIds: r.meeting_ids ?? [],
    feedItemIds: r.feed_item_ids ?? [],
    proposalIds: r.proposal_ids ?? [],
    signalSources: (r.signal_sources ?? []) as FdeEngagement['signalSources'],
    googleDocUrl: r.google_doc_url ?? undefined,
    escalationLevel: (r.escalation_level ?? 0) as EscalationLevel,
    contextScore: r.context_score ?? undefined,
    createdAt: new Date(r.created_at).getTime(),
    updatedAt: new Date(r.updated_at).getTime()
  }
  if (engagement.contextScore == null) {
    engagement.contextScore = computeContextScore(engagement)
  }
  return engagement
}

function engagementToRow(
  e: Partial<FdeEngagement> & { clientName: string },
  orgId: string,
  existingId?: string
): Omit<EngagementRow, 'created_at' | 'updated_at'> {
  const id = existingId ?? e.id ?? `eng-${randomUUID()}`
  return {
    id,
    org_id: orgId,
    client_id: null,
    title: e.clientName,
    stage: e.stage ?? 'intake',
    scope: e.scope ?? 'unknown',
    summary: e.summary ?? null,
    build_prompt: e.buildPrompt ?? null,
    context_score: e.contextScore ?? null,
    classification: null,
    crm_ref: e.company ? { owner_name: e.company } : null,
    signal_sources: e.signalSources ?? [],
    meeting_ids: e.meetingIds ?? [],
    feed_item_ids: e.feedItemIds ?? [],
    deploy_url: null,
    escalation_level: e.escalationLevel ?? 0,
    google_doc_url: e.googleDocUrl ?? null,
    next_steps: e.nextSteps ?? [],
    flags: e.flags ?? [],
    open_questions: e.openQuestions ?? [],
    proposal_ids: e.proposalIds ?? []
  }
}

// ─── Engagement CRUD ─────────────────────────────────────────────────────────

/**
 * List all engagements for an org, ordered by most recently updated.
 */
export async function getEngagements(orgId: string): Promise<FdeEngagement[]> {
  const client = getClient()
  if (!client) {
    return getSqliteStore().listEngagements(500)
  }

  const { data, error } = await client
    .from('engagements')
    .select('*')
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false })
    .limit(500)

  if (error) {
    console.error('[supabase-db] getEngagements error:', error.message)
    throw new Error('Something went wrong')
  }

  return (data as EngagementRow[]).map(rowToEngagement)
}

/**
 * Get a single engagement by id, scoped to the org.
 */
export async function getEngagement(id: string, orgId: string): Promise<FdeEngagement | null> {
  const client = getClient()
  if (!client) {
    return getSqliteStore().getEngagement(id)
  }

  const { data, error } = await client
    .from('engagements')
    .select('*')
    .eq('id', id)
    .eq('org_id', orgId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // not found
    console.error('[supabase-db] getEngagement error:', error.message)
    throw new Error('Something went wrong')
  }

  return data ? rowToEngagement(data as EngagementRow) : null
}

/**
 * Upsert an engagement. If input.id exists and belongs to orgId, updates it.
 * Otherwise creates a new one.
 */
export async function upsertEngagement(
  input: Partial<FdeEngagement> & { clientName: string },
  orgId: string
): Promise<FdeEngagement> {
  const client = getClient()
  if (!client) {
    return getSqliteStore().upsertEngagement(input)
  }

  // Resolve existing record
  let existing: FdeEngagement | null = null
  if (input.id) {
    existing = await getEngagement(input.id, orgId)
  }

  const merged: Partial<FdeEngagement> & { clientName: string } = {
    ...existing,
    ...input,
    clientName: input.clientName,
    stage: normalizeEngagementStage(input.stage ?? existing?.stage ?? 'intake'),
    scope: input.scope ?? existing?.scope ?? 'unknown',
    nextSteps: input.nextSteps ?? existing?.nextSteps ?? [],
    flags: input.flags ?? existing?.flags ?? [],
    openQuestions: input.openQuestions ?? existing?.openQuestions ?? [],
    meetingIds: input.meetingIds ?? existing?.meetingIds ?? [],
    feedItemIds: input.feedItemIds ?? existing?.feedItemIds ?? [],
    proposalIds: input.proposalIds ?? existing?.proposalIds ?? [],
    signalSources: input.signalSources ?? existing?.signalSources ?? []
  }

  if (merged.contextScore === undefined) {
    merged.contextScore = computeContextScore(merged as FdeEngagement)
  }

  const row = engagementToRow(merged, orgId, existing?.id)

  const { data, error } = await client
    .from('engagements')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single()

  if (error) {
    console.error('[supabase-db] upsertEngagement error:', error.message)
    throw new Error('Something went wrong')
  }

  return rowToEngagement(data as EngagementRow)
}

/**
 * Delete an engagement by id, scoped to org.
 */
export async function deleteEngagement(id: string, orgId: string): Promise<boolean> {
  const client = getClient()
  if (!client) {
    return getSqliteStore().deleteEngagement(id)
  }

  const { error, count } = await client
    .from('engagements')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('org_id', orgId)

  if (error) {
    console.error('[supabase-db] deleteEngagement error:', error.message)
    throw new Error('Something went wrong')
  }

  return (count ?? 0) > 0
}

// ─── Requirements ────────────────────────────────────────────────────────────

interface RequirementRow {
  id: string
  engagement_id: string
  org_id: string
  field: string
  value: string | null
  status: string
  created_at: string
}

function rowToRequirement(r: RequirementRow) {
  return {
    id: r.id,
    engagementId: r.engagement_id,
    field: r.field,
    value: r.value ?? undefined,
    status: r.status as 'pending' | 'done' | 'skipped',
    createdAt: new Date(r.created_at).getTime()
  }
}

/**
 * List requirements for an engagement, scoped to org.
 */
export async function listRequirements(engagementId: string, orgId: string) {
  const client = getClient()
  if (!client) {
    return getSqliteTrainingStore().listRequirementsForEngagement(engagementId)
  }

  const { data, error } = await client
    .from('engagement_requirements')
    .select('*')
    .eq('engagement_id', engagementId)
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[supabase-db] listRequirements error:', error.message)
    throw new Error('Something went wrong')
  }

  return (data as RequirementRow[]).map(rowToRequirement)
}

/**
 * Update the status of a requirement, scoped to org.
 */
export async function patchRequirement(
  id: string,
  status: 'pending' | 'done' | 'skipped',
  orgId: string
) {
  const client = getClient()
  if (!client) {
    return getSqliteTrainingStore().updateRequirementStatus(id, status)
  }

  const { data, error } = await client
    .from('engagement_requirements')
    .update({ status })
    .eq('id', id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    console.error('[supabase-db] patchRequirement error:', error.message)
    throw new Error('Something went wrong')
  }

  return data ? rowToRequirement(data as RequirementRow) : null
}

// ─── Engagement events ────────────────────────────────────────────────────────

export interface EngagementEventInput {
  engagementId?: string
  actorUserId?: string
  kind: string
  detail?: string
  payload?: Record<string, unknown>
}

/**
 * Log a telemetry event for an engagement.
 */
export async function logEngagementEvent(
  event: EngagementEventInput,
  orgId: string
): Promise<void> {
  const client = getClient()
  if (!client) {
    // No-op in local dev — training store handles local telemetry
    return
  }

  const { error } = await client.from('engagement_events').insert({
    id: randomUUID(),
    engagement_id: event.engagementId ?? null,
    org_id: orgId,
    actor_user_id: event.actorUserId ?? null,
    kind: event.kind,
    detail: event.detail ?? null,
    payload: event.payload ?? null
  })

  if (error) {
    // Non-fatal — log but don't throw
    console.warn('[supabase-db] logEngagementEvent error:', error.message)
  }
}

// ─── Clients ─────────────────────────────────────────────────────────────────

interface ClientRow {
  id: string
  org_id: string
  name: string
  company: string | null
  created_at: string
}

/**
 * List clients for an org.
 */
export async function getClients(orgId: string): Promise<{ id: string; name: string; company?: string; createdAt: number }[]> {
  const client = getClient()
  if (!client) {
    // In local dev, derive clients from engagements
    const store = getSqliteStore()
    const byClient = store.listEngagementsByClient()
    return byClient.map((c) => ({
      id: c.clientName.toLowerCase().replace(/\s+/g, '-'),
      name: c.clientName,
      company: c.engagements[0]?.company,
      createdAt: c.engagements[0]?.createdAt ?? Date.now()
    }))
  }

  const { data, error } = await client
    .from('clients')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[supabase-db] getClients error:', error.message)
    throw new Error('Something went wrong')
  }

  return (data as ClientRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    company: r.company ?? undefined,
    createdAt: new Date(r.created_at).getTime()
  }))
}

// ─── Org management ──────────────────────────────────────────────────────────

/**
 * Create an organization and add the creating user as admin.
 */
export async function createOrg(input: {
  name: string
  slug: string
  userId: string
}): Promise<{ id: string; name: string; slug: string }> {
  const client = getClient()
  if (!client) throw new Error('Supabase not configured')

  // Create org
  const { data: org, error: orgError } = await client
    .from('organizations')
    .insert({ name: input.name, slug: input.slug, plan: 'free' })
    .select()
    .single()

  if (orgError) {
    console.error('[supabase-db] createOrg error:', orgError.message)
    if (orgError.code === '23505') throw new Error('An organization with that name already exists')
    throw new Error('Something went wrong')
  }

  // Add user as admin
  const { error: memberError } = await client
    .from('org_members')
    .insert({ org_id: (org as { id: string }).id, user_id: input.userId, role: 'admin' })

  if (memberError) {
    console.error('[supabase-db] createOrg member insert error:', memberError.message)
    throw new Error('Something went wrong')
  }

  return org as { id: string; name: string; slug: string }
}

/**
 * Get the org for a user (returns first org membership).
 */
export async function getUserOrg(userId: string): Promise<{ id: string; name: string; slug: string; role: string } | null> {
  const client = getClient()
  if (!client) return null

  const { data, error } = await client
    .from('org_members')
    .select('role, organizations(id, name, slug)')
    .eq('user_id', userId)
    .limit(1)
    .single()

  if (error || !data) return null

  const org = (data as { role: string; organizations: { id: string; name: string; slug: string } }).organizations
  return { ...org, role: (data as { role: string }).role }
}

/**
 * Invite a user to an org via Supabase magic link.
 * Adds a pending org_member record; full membership is confirmed after first login.
 */
export async function inviteOrgMember(input: {
  orgId: string
  email: string
  role: 'fde' | 'ae' | 'am' | 'admin'
  inviterUserId: string
}): Promise<{ ok: boolean }> {
  const client = getClient()
  if (!client) throw new Error('Supabase not configured')

  // Send magic link — user gets org membership on their first login
  // via a webhook or the onboarding flow checking pending invites
  const { error } = await client.auth.admin.inviteUserByEmail(input.email, {
    data: {
      invited_org_id: input.orgId,
      invited_role: input.role,
      invited_by: input.inviterUserId
    }
  })

  if (error) {
    console.error('[supabase-db] inviteOrgMember error:', error.message)
    throw new Error('Something went wrong')
  }

  return { ok: true }
}
