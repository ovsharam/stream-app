import type { Server as SocketServer } from 'socket.io'
import { normalizeGongCall } from '../normalizer'
import { upsertItems, itemExists } from '../db'
import type { StreamItem } from '../../shared/types'
import { connectWithToken, getIntegrationToken, isTokenConnected } from './integrationTokens'

function credentials(): { accessKey: string; accessSecret: string } | null {
  const t = getIntegrationToken('gong')
  const accessKey = String(t?.accessKey ?? '').trim()
  const accessSecret = String(t?.accessSecret ?? '').trim()
  if (!accessKey || !accessSecret) return null
  return { accessKey, accessSecret }
}

export function connectGong(accessKey: string, accessSecret: string): void {
  connectWithToken('gong', { accessKey, accessSecret })
}

export function isGongConnected(): boolean {
  return isTokenConnected('gong')
}

async function gongFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const creds = credentials()
  if (!creds) throw new Error('Gong not connected')
  const auth = Buffer.from(`${creds.accessKey}:${creds.accessSecret}`).toString('base64')
  const res = await fetch(`https://api.gong.io${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<T>
}

export async function syncGong(io?: SocketServer): Promise<StreamItem[]> {
  if (!isGongConnected()) return []

  const from = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const data = await gongFetch<{
    calls?: {
      id: string
      title?: string
      started?: string
      duration?: number
      url?: string
      parties?: { name?: string; emailAddress?: string }[]
    }[]
  }>(`/v2/calls?fromDateTime=${encodeURIComponent(from)}`)

  const items: StreamItem[] = []
  for (const call of data.calls ?? []) {
    if (!call.id) continue
    items.push(
      normalizeGongCall({
        id: call.id,
        title: call.title ?? 'Gong call',
        startedAt: new Date(call.started ?? Date.now()),
        durationSec: call.duration,
        url: call.url,
        participants: (call.parties ?? []).map((p) => p.name || p.emailAddress || 'Participant')
      })
    )
  }

  if (items.length > 0) {
    const fresh = items.filter((i) => !itemExists(i.id))
    upsertItems(items)
    for (const item of fresh) io?.emit('stream:item', item)
  }
  return items
}

export async function addGongCallNote(input: {
  callId: string
  note: string
}): Promise<void> {
  await gongFetch('/v2/calls/notes', {
    method: 'POST',
    body: JSON.stringify({
      callId: input.callId,
      note: input.note
    })
  })
}
