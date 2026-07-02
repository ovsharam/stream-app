/**
 * Supabase JWT auth middleware for the Plumb API.
 *
 * - Validates the Bearer token from Authorization header using supabase.auth.getUser()
 * - Attaches req.userId and req.orgId to every authenticated request
 * - Falls back gracefully when SUPABASE_URL is not set (local Electron dev)
 */

import type { Request, Response, NextFunction } from 'express'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Augment Express Request so downstream handlers can read these without casting
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string
      orgId?: string
    }
  }
}

let _supabase: SupabaseClient | null = null

function getSupabaseAdminClient(): SupabaseClient | null {
  if (_supabase) return _supabase
  const url = process.env.SUPABASE_URL?.trim()
  // Accept both key names: SUPABASE_SECRET_KEY (new sb_secret_ format, used on Railway)
  // and SUPABASE_SERVICE_ROLE_KEY (legacy service-role JWT).
  const key =
    process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return null
  _supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
  return _supabase
}

/** Routes that are always public — no auth required. */
const PUBLIC_PREFIXES = [
  '/health',
  '/auth/',
  '/webhooks/',
  '/sim/'
]

function isPublicRoute(path: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix))
}

/** Routes that require authentication when Supabase is configured. */
const PROTECTED_PREFIXES = [
  '/fde/',
  '/kb/',
  '/cluster/',
  '/meeting/',
  '/agent/',
  '/build/',
  '/graph/',
  '/pipeline/',
  '/telemetry/',
  '/training/',
  '/integrations/',
  '/capture/',
  '/contacts/',
  '/browser/',
  '/notes',
  '/stream',
  '/connections',
  '/sync/',
  '/product-graph/',
]

function isProtectedRoute(path: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix))
}

/**
 * Resolves the org_id for a given user from the org_members table.
 * Returns the first org the user belongs to (most deployments have one org per user).
 */
async function resolveOrgId(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', userId)
    .limit(1)
    .single()

  if (error || !data) return null
  return data.org_id as string
}

/**
 * Main auth middleware.
 *
 * When SUPABASE_URL is not configured (local dev / Electron), this is a no-op
 * and all routes pass through — preserving existing local behaviour.
 *
 * When Supabase IS configured, protected routes require a valid Bearer JWT.
 * The resolved userId and orgId are attached to req for downstream handlers.
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const supabase = getSupabaseAdminClient()

  // Local dev without Supabase — bypass all auth
  if (!supabase) {
    next()
    return
  }

  // Public routes always pass through
  if (isPublicRoute(req.path)) {
    next()
    return
  }

  const authHeader = req.headers['authorization']
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null

  if (!token) {
    if (isProtectedRoute(req.path)) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }
    // Non-protected route with no token — let it through (e.g. /dashboard, /supabase/status)
    next()
    return
  }

  // Validate JWT with Supabase
  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  req.userId = user.id

  // Resolve org membership
  const orgId = await resolveOrgId(supabase, user.id)
  if (!orgId && isProtectedRoute(req.path)) {
    res.status(403).json({ error: 'No organization membership found. Complete onboarding first.' })
    return
  }

  if (orgId) {
    req.orgId = orgId
  }

  next()
}

/**
 * Lightweight version for routes that optionally use auth context if present.
 * Never rejects — just attaches userId/orgId when a valid token is provided.
 */
export async function optionalAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const supabase = getSupabaseAdminClient()
  if (!supabase) {
    next()
    return
  }

  const authHeader = req.headers['authorization']
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
  if (!token) {
    next()
    return
  }

  try {
    const { data: { user } } = await supabase.auth.getUser(token)
    if (user) {
      req.userId = user.id
      const orgId = await resolveOrgId(supabase, user.id)
      if (orgId) req.orgId = orgId
    }
  } catch {
    // Ignore auth errors for optional middleware
  }

  next()
}
