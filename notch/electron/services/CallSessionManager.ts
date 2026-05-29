/**
 * Bridges AudioTap chunks → server meeting pipeline.
 *
 * Live: pipes each transcript chunk to POST /meeting/chunk; server runs signal
 *       detection + speculative Claude generation.
 * Auto-end: detects silence (no chunk for SILENCE_TIMEOUT_MS) after the call
 *           has been active for MIN_ACTIVE_MS, then triggers POST /meeting/end.
 */

import { EventEmitter } from 'events'
import { session as electronSession } from 'electron'
import type { AudioTap, TranscriptChunk } from './AudioTap'

const API = 'http://localhost:3131'
const SILENCE_TIMEOUT_MS = 90_000
const MIN_ACTIVE_MS = 90_000
const SILENCE_CHECK_INTERVAL_MS = 15_000

export type CallSessionStatus = {
  active: boolean
  sessionId?: string
  startedAt?: number
  lastChunkAt?: number
  chunkCount: number
  signalCount: number
  starredCount: number
  autoEnd: boolean
}

type CallSessionEvents = {
  'session-started': (sessionId: string) => void
  'session-ended': (result: unknown) => void
  'chunk-sent': (chunk: TranscriptChunk) => void
  'signal': (signal: { type: string; text: string }) => void
  error: (message: string) => void
}

async function sessionCookieHeader(): Promise<string> {
  try {
    const cookies = await electronSession.defaultSession.cookies.get({ url: API })
    return cookies.map((c) => `${c.name}=${c.value}`).join('; ')
  } catch {
    return ''
  }
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  const cookie = await sessionCookieHeader()
  const res = await fetch(`${API}/api${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${path} → ${res.status}: ${text.slice(0, 200)}`)
  }
  return (await res.json()) as T
}

export class CallSessionManager extends EventEmitter {
  private active = false
  private sessionId: string | undefined
  private startedAt: number | undefined
  private lastChunkAt: number | undefined
  private chunkCount = 0
  private signalCount = 0
  private starredCount = 0
  private silenceTimer: NodeJS.Timeout | null = null
  private autoEndEnabled = true
  private detachAudio: (() => void) | null = null

  constructor(private readonly audioTap: AudioTap) {
    super()
  }

  status(): CallSessionStatus {
    return {
      active: this.active,
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      lastChunkAt: this.lastChunkAt,
      chunkCount: this.chunkCount,
      signalCount: this.signalCount,
      starredCount: this.starredCount,
      autoEnd: this.autoEndEnabled
    }
  }

  async start(input: { title?: string; dealHint?: string; autoEnd?: boolean } = {}): Promise<CallSessionStatus> {
    if (this.active) return this.status()
    this.autoEndEnabled = input.autoEnd !== false

    const { session } = await api<{ ok: boolean; session: { id: string; startedAt: number } }>(
      '/meeting/start',
      { title: input.title, dealHint: input.dealHint }
    )

    this.active = true
    this.sessionId = session.id
    this.startedAt = session.startedAt
    this.lastChunkAt = undefined
    this.chunkCount = 0
    this.signalCount = 0
    this.starredCount = 0

    // ensure audio tap is running
    const audioStatus = this.audioTap.status()
    if (!audioStatus.running) {
      const startStatus = this.audioTap.start()
      if (startStatus.error) {
        this.emit('error', `Audio start failed: ${startStatus.error}`)
      }
    }

    const onChunk = (chunk: TranscriptChunk) => void this.handleChunk(chunk)
    this.audioTap.on('chunk', onChunk)
    this.detachAudio = () => this.audioTap.off('chunk', onChunk)

    if (this.autoEndEnabled) {
      this.silenceTimer = setInterval(() => this.checkSilence(), SILENCE_CHECK_INTERVAL_MS)
    }

    this.emit('session-started', session.id)
    return this.status()
  }

  private async handleChunk(chunk: TranscriptChunk): Promise<void> {
    if (!this.active) return
    this.lastChunkAt = chunk.timestamp
    this.chunkCount += 1
    this.emit('chunk-sent', chunk)

    try {
      const result = await api<{
        ok: boolean
        signals: { type: string; text: string }[]
      }>('/meeting/chunk', { text: chunk.text, ts: chunk.timestamp })
      if (result.signals?.length > 0) {
        this.signalCount += result.signals.length
        for (const s of result.signals) this.emit('signal', s)
      }
    } catch (e) {
      this.emit('error', `chunk POST failed: ${(e as Error).message}`)
    }
  }

  private checkSilence(): void {
    if (!this.active || !this.lastChunkAt || !this.startedAt) return
    const now = Date.now()
    const idle = now - this.lastChunkAt
    const active = now - this.startedAt
    if (idle > SILENCE_TIMEOUT_MS && active > MIN_ACTIVE_MS) {
      console.log(`[meeting] silence ${Math.round(idle / 1000)}s after ${Math.round(active / 1000)}s active → auto end`)
      void this.end()
    }
  }

  async starMoment(text?: string): Promise<{ ok: boolean }> {
    if (!this.active) return { ok: false }
    try {
      await api('/meeting/star', { text })
      this.starredCount += 1
      return { ok: true }
    } catch (e) {
      this.emit('error', `star failed: ${(e as Error).message}`)
      return { ok: false }
    }
  }

  async end(): Promise<unknown> {
    if (!this.active) return null

    this.active = false
    if (this.silenceTimer) {
      clearInterval(this.silenceTimer)
      this.silenceTimer = null
    }
    if (this.detachAudio) {
      this.detachAudio()
      this.detachAudio = null
    }

    try {
      const result = await api('/meeting/end', {})
      this.emit('session-ended', result)
      return result
    } catch (e) {
      const msg = `end failed: ${(e as Error).message}`
      this.emit('error', msg)
      throw new Error(msg)
    }
  }
}
