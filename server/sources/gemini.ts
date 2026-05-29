import type { Server as SocketServer } from 'socket.io'
import { normalizeAiAssist } from '../normalizer'
import { upsertItem } from '../db'
import type { StreamItem } from '../../shared/types'
import { apiKey, connectWithToken, isTokenConnected } from './integrationTokens'
import * as session from '../session'

const MODEL = 'gemini-2.0-flash'

export function connectGemini(apiKeyValue: string): void {
  connectWithToken('gemini', { apiKey: apiKeyValue })
}

/** Seed GEMINI_API_KEY into a session when env is set (local dev). */
export function ensureGeminiFromEnv(sessionId: string): boolean {
  const key = process.env.GEMINI_API_KEY?.trim()
  if (!key) return false
  const existing = session.getToken(sessionId, 'gemini')
  if (existing?.apiKey) return true
  session.setToken(sessionId, 'gemini', { apiKey: key })
  session.setConnection(sessionId, 'gemini', true)
  return true
}

export function isGeminiConnected(): boolean {
  return isTokenConnected('gemini')
}

export async function queryGemini(
  query: string,
  systemPrompt: string
): Promise<StreamItem> {
  const key = apiKey('gemini')
  if (!key) throw new Error('Gemini not connected')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: query }] }]
    })
  })

  if (!res.ok) throw new Error(await res.text())
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const answer =
    data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ??
    'Gemini returned an empty response.'

  return normalizeAiAssist({
    source: 'gemini',
    query,
    answer,
    senderName: 'Gemini',
    handle: 'gemini',
    metadata: { model: MODEL }
  })
}

export async function askGemini(
  query: string,
  systemPrompt: string,
  io?: SocketServer
): Promise<StreamItem> {
  const item = await queryGemini(query, systemPrompt)
  upsertItem(item)
  io?.emit('stream:item', item)
  return item
}

export async function syncGemini(_io?: SocketServer): Promise<StreamItem[]> {
  return []
}
