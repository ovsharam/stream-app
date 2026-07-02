import { NextResponse } from 'next/server'
import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getUserOrg } from '@/lib/db/cases'

/**
 * Auth guard for the /api/connectors/* routes.
 *
 * These routes use a service-role Supabase client (bypasses RLS), so tenancy
 * MUST be enforced here: session required, org resolved from the users table,
 * and the org id — never a client-supplied customerId — scopes every query.
 */

export type OrgContext = {
  orgId: string
  accessToken: string
}

export async function requireOrg(): Promise<OrgContext | NextResponse> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const org = await getUserOrg(session.user.id)
  if (!org?.orgId) {
    return NextResponse.json(
      { error: 'No organization membership found. Complete onboarding first.' },
      { status: 403 }
    )
  }

  return { orgId: org.orgId, accessToken: session.access_token }
}

export function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

/** 404 (not 403) on cross-tenant access — don't confirm the connector exists. */
export async function assertConnectorOwned(
  sb: SupabaseClient,
  connectorId: string,
  orgId: string
): Promise<NextResponse | null> {
  const { data, error } = await sb
    .from('pg_connectors')
    .select('customer_id')
    .eq('id', connectorId)
    .single()
  if (error || !data || data.customer_id !== orgId) {
    return NextResponse.json({ error: 'Connector not found' }, { status: 404 })
  }
  return null
}
