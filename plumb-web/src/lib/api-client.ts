/**
 * Typed fetch wrapper for the Plumb Railway API (api.useplumb.ai).
 *
 * All requests include the Supabase JWT from the browser session as
 * Authorization: Bearer {token}.
 *
 * The API base URL is read from NEXT_PUBLIC_API_URL (set in .env.local or
 * Vercel env). Falls back to localhost:3131 for local development.
 */

import { createClient as createBrowserClient } from '@/lib/supabase/client'
import type { FdeEngagement } from '@/lib/types/fde'

function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL?.trim() || 'http://localhost:3131'
}

class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Get the current session's JWT from Supabase (browser-side).
 * Returns null when not authenticated (public pages, SSR without session).
 */
async function getAuthToken(): Promise<string | null> {
  try {
    const supabase = createBrowserClient()
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  } catch {
    return null
  }
}

/**
 * Core fetch wrapper. Attaches auth header automatically.
 */
async function apiFetch<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs = 30_000, ...fetchInit } = init
  const base = getApiBase()
  const url = `${base}/api${path}`

  const token = await getAuthToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchInit.headers as Record<string, string>)
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      ...fetchInit,
      headers,
      signal: controller.signal
    })

    const text = await res.text()
    let body: unknown
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      throw new ApiError(`Invalid response from ${path}`, res.status)
    }

    if (!res.ok) {
      const msg =
        (body as { error?: string; message?: string } | null)?.error ??
        (body as { error?: string; message?: string } | null)?.message ??
        `Request failed (${res.status})`
      throw new ApiError(msg, res.status)
    }

    return body as T
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError(`Request to ${path} timed out`, 408)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// ─── Engagements ─────────────────────────────────────────────────────────────

export const engagementsApi = {
  list(): Promise<{ engagements: FdeEngagement[] }> {
    return apiFetch('/fde/engagements')
  },

  get(id: string): Promise<{ engagement: FdeEngagement }> {
    return apiFetch(`/fde/engagements/${encodeURIComponent(id)}`)
  },

  create(input: {
    clientName: string
    company?: string
    summary?: string
    stage?: string
  }): Promise<{ engagement: FdeEngagement }> {
    return apiFetch('/fde/engagements', {
      method: 'POST',
      body: JSON.stringify(input)
    })
  },

  patch(
    id: string,
    patch: Partial<FdeEngagement> & { scopeApproved?: boolean }
  ): Promise<{ engagement: FdeEngagement }> {
    return apiFetch(`/fde/engagements/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    })
  },

  delete(id: string): Promise<{ ok: boolean }> {
    return apiFetch(`/fde/engagements/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },

  requirements(engagementId: string): Promise<{ requirements: unknown[] }> {
    return apiFetch(`/fde/engagements/${encodeURIComponent(engagementId)}/requirements`)
  },

  handoff(id: string): Promise<{ handoff: unknown }> {
    return apiFetch(`/fde/engagements/${encodeURIComponent(id)}/handoff`)
  }
}

// ─── Clients ─────────────────────────────────────────────────────────────────

export const clientsApi = {
  list(): Promise<{ clients: { clientName: string; engagements: FdeEngagement[] }[] }> {
    return apiFetch('/fde/clients')
  }
}

// ─── Org management ──────────────────────────────────────────────────────────

export const orgApi = {
  invite(input: {
    email: string
    role: 'fde' | 'ae' | 'am' | 'admin'
  }): Promise<{ ok: boolean }> {
    return apiFetch('/fde/org/invite', {
      method: 'POST',
      body: JSON.stringify(input)
    })
  }
}

// ─── Health ───────────────────────────────────────────────────────────────────

export const healthApi = {
  check(): Promise<{ ok: boolean; ts: number }> {
    return apiFetch('/health')
  }
}

// ─── Stream ───────────────────────────────────────────────────────────────────

export const streamApi = {
  list(limit = 100): Promise<unknown[]> {
    return apiFetch(`/stream?limit=${limit}`)
  },

  poll(since: number): Promise<unknown[]> {
    return apiFetch(`/stream/poll?since=${since}`)
  }
}
