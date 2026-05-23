import { randomBytes } from 'crypto'
import axios from 'axios'
import cron from 'node-cron'
import type { Server as SocketServer } from 'socket.io'
import { normalizeXTweet } from '../normalizer'
import { upsertItem, itemExists } from '../db'
import { getToken, setToken, setConnection, getNested } from '../store'
import type { StreamItem } from '../../shared/types'

const X_AUTH_URL = 'https://twitter.com/i/oauth2/authorize'
const X_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token'
const X_API = 'https://api.twitter.com/2'

const pkceStore = new Map<string, { verifier: string; challenge: string }>()

function generatePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url')
  // Simplified challenge for dev — production should use SHA256
  const challenge = verifier
  return { verifier, challenge }
}

export function getXAuthUrl(state: string): { url: string; state: string } {
  const clientId = process.env.X_CLIENT_ID
  const base = process.env.APP_URL ?? 'http://localhost:3000'
  const redirectUri = process.env.X_REDIRECT_URI || `${base}/api/auth/x/callback`
  const { verifier, challenge } = generatePkce()
  pkceStore.set(state, { verifier, challenge })

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId ?? '',
    redirect_uri: redirectUri,
    scope: 'tweet.read users.read offline.access',
    state,
    code_challenge: challenge,
    code_challenge_method: 'plain'
  })

  return { url: `${X_AUTH_URL}?${params}`, state }
}

export async function handleXCallback(code: string, state: string): Promise<void> {
  const pkce = pkceStore.get(state)
  if (!pkce) throw new Error('Invalid OAuth state')

  const clientId = process.env.X_CLIENT_ID
  const clientSecret = process.env.X_CLIENT_SECRET
  const base = process.env.APP_URL ?? 'http://localhost:3000'
  const redirectUri = process.env.X_REDIRECT_URI || `${base}/api/auth/x/callback`

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: pkce.verifier,
    client_id: clientId ?? ''
  })

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded'
  }

  if (clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
  }

  const res = await axios.post(X_TOKEN_URL, body.toString(), { headers })
  const data = res.data as {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }

  setToken('x', {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined
  })
  setConnection('x', true)
  pkceStore.delete(state)
}

export async function connectXWithBearerToken(token: string): Promise<void> {
  setToken('x', { accessToken: token, type: 'bearer' })
  setConnection('x', true)
}

async function getXClient() {
  const tokens = getToken('x')
  const accessToken = tokens?.accessToken as string | undefined
  if (!accessToken) throw new Error('X not connected')

  return axios.create({
    baseURL: X_API,
    headers: { Authorization: `Bearer ${accessToken}` }
  })
}

export async function fetchXTimeline(limit = 30): Promise<StreamItem[]> {
  const client = await getXClient()

  const me = await client.get('/users/me')
  const userId = me.data.data?.id as string

  const timeline = await client.get(`/users/${userId}/timelines/reverse_chronological`, {
    params: {
      max_results: limit,
      'tweet.fields': 'created_at,public_metrics,referenced_tweets,author_id',
      expansions: 'author_id',
      'user.fields': 'name,username,profile_image_url'
    }
  })

  const users = new Map<string, { name: string; username: string; profile_image_url?: string }>()
  for (const u of timeline.data.includes?.users ?? []) {
    users.set(u.id, u)
  }

  const minEngagement =
    (getNested<number>(['preferences', 'xMinEngagement']) as number | undefined) ?? 0

  const items: StreamItem[] = []

  for (const tweet of timeline.data.data ?? []) {
    const author = users.get(tweet.author_id)
    if (!author) continue

    const engagement =
      (tweet.public_metrics?.like_count ?? 0) + (tweet.public_metrics?.retweet_count ?? 0)
    if (engagement < minEngagement && minEngagement > 0) continue

    const normalized = normalizeXTweet({
      id: tweet.id,
      text: tweet.text,
      author,
      created_at: tweet.created_at,
      public_metrics: tweet.public_metrics,
      referenced_tweets: tweet.referenced_tweets
    })

    if (normalized) items.push(normalized)
  }

  return items
}

async function fetchXNitterFallback(limit = 30): Promise<StreamItem[]> {
  // Graceful degradation placeholder — returns empty when API unavailable
  console.warn('[x] API unavailable, Nitter fallback not configured for Phase 1')
  return []
}

export async function syncX(io?: SocketServer): Promise<StreamItem[]> {
  if (!getToken('x')) return []

  try {
    let items: StreamItem[]
    try {
      items = await fetchXTimeline(30)
    } catch {
      items = await fetchXNitterFallback(30)
    }

    const newItems = items.filter((i) => !itemExists(i.id))
    for (const item of items) upsertItem(item)
    for (const item of newItems) io?.emit('stream:item', item)

    return items
  } catch (err) {
    console.error('[x] sync failed:', err)
    return []
  }
}

export function startXPolling(io: SocketServer): void {
  cron.schedule('*/1 * * * *', () => {
    void syncX(io)
  })
}

export function isXConfigured(): boolean {
  return !!process.env.X_CLIENT_ID
}

export function isXConnected(): boolean {
  return !!getToken('x')
}
