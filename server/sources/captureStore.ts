import { randomBytes } from 'crypto'
import * as session from '../session'
import { appendGoogleDoc } from './gdocs'
import { appendObsidianNote } from './obsidian'
import { normalizeNote } from '../normalizer'
import { upsertItem } from '../db'
import type { Server as SocketServer } from 'socket.io'
import { streamItemToApi } from '../../shared/serialize'
import {
  DEFAULT_CAPTURE_PROFILES,
  type CaptureDestination,
  type CaptureNoteResult,
  type CaptureProfile,
  type CaptureState,
  type Reminder
} from '../../shared/capture'

const STORE_KEY = 'capture'

function readRaw(sessionId: string): CaptureState | null {
  const raw = session.getToken(sessionId, STORE_KEY) as CaptureState | undefined
  if (!raw?.profiles?.length) return null
  return raw
}

function writeRaw(sessionId: string, state: CaptureState): void {
  session.setToken(sessionId, STORE_KEY, state)
}

export function getCaptureState(sessionId: string): CaptureState {
  const existing = readRaw(sessionId)
  if (existing) {
    return {
      profiles: existing.profiles,
      activeProfileId: existing.activeProfileId || existing.profiles[0]?.id || 'personal',
      reminders: existing.reminders ?? []
    }
  }
  const initial: CaptureState = {
    profiles: DEFAULT_CAPTURE_PROFILES.map((p) => ({ ...p })),
    activeProfileId: 'personal',
    reminders: []
  }
  writeRaw(sessionId, initial)
  return initial
}

export function setCaptureState(sessionId: string, patch: Partial<CaptureState>): CaptureState {
  const current = getCaptureState(sessionId)
  const next: CaptureState = {
    profiles: patch.profiles ?? current.profiles,
    activeProfileId: patch.activeProfileId ?? current.activeProfileId,
    reminders: patch.reminders ?? current.reminders
  }
  writeRaw(sessionId, next)
  return next
}

export function getCaptureProfile(sessionId: string, profileId?: string): CaptureProfile {
  const state = getCaptureState(sessionId)
  const id = profileId ?? state.activeProfileId
  const profile = state.profiles.find((p) => p.id === id)
  if (!profile) throw new Error(`Capture profile not found: ${id}`)
  return profile
}

export async function captureNote(
  sessionId: string,
  input: {
    text: string
    title?: string
    profileId?: string
    destinations?: CaptureDestination[]
    io?: SocketServer
  }
): Promise<CaptureNoteResult> {
  const profile = getCaptureProfile(sessionId, input.profileId)
  const destinations = input.destinations ?? ['feed', 'obsidian', 'gdocs']
  const result: CaptureNoteResult = {
    ok: true,
    profileId: profile.id,
    destinations: {}
  }

  if (destinations.includes('feed')) {
    try {
      const item = normalizeNote(input.text, input.title)
      item.metadata = { ...item.metadata, captureProfileId: profile.id }
      upsertItem(item)
      input.io?.emit('stream:item', streamItemToApi(item))
      result.destinations.feed = { ok: true }
      result.feedItemId = item.id
    } catch (err) {
      result.destinations.feed = { ok: false, error: String(err) }
      result.ok = false
    }
  }

  if (destinations.includes('obsidian')) {
    if (!profile.obsidianVaultPath?.trim()) {
      result.destinations.obsidian = { ok: false, error: 'Vault path not set for this profile' }
    } else if (!profile.obsidianNotePath?.trim()) {
      result.destinations.obsidian = { ok: false, error: 'Note path not set for this profile' }
    } else {
      try {
        await appendObsidianNote({
          vaultPath: profile.obsidianVaultPath,
          notePath: profile.obsidianNotePath,
          text: input.text,
          heading: input.title
        })
        result.destinations.obsidian = { ok: true }
      } catch (err) {
        result.destinations.obsidian = { ok: false, error: (err as Error).message }
        result.ok = false
      }
    }
  }

  if (destinations.includes('gdocs')) {
    if (!profile.gdocsDocumentId?.trim()) {
      result.destinations.gdocs = { ok: false, error: 'Google Doc id not set for this profile' }
    } else {
      try {
        const prefix = input.title ? `${input.title}\n` : ''
        await appendGoogleDoc({
          documentId: profile.gdocsDocumentId,
          text: `${prefix}${input.text}`,
          accountId: profile.gmailAccountId
        })
        result.destinations.gdocs = { ok: true }
      } catch (err) {
        result.destinations.gdocs = { ok: false, error: (err as Error).message }
        result.ok = false
      }
    }
  }

  return result
}

export function addReminder(
  sessionId: string,
  input: { text: string; dueAt: string; profileId?: string }
): Reminder {
  const state = getCaptureState(sessionId)
  const profileId = input.profileId ?? state.activeProfileId
  const reminder: Reminder = {
    id: randomBytes(8).toString('hex'),
    profileId,
    text: input.text.trim(),
    dueAt: input.dueAt,
    createdAt: new Date().toISOString(),
    done: false
  }
  setCaptureState(sessionId, { reminders: [reminder, ...state.reminders] })
  return reminder
}

export function updateReminder(
  sessionId: string,
  id: string,
  patch: Partial<Pick<Reminder, 'done' | 'text' | 'dueAt'>>
): Reminder | null {
  const state = getCaptureState(sessionId)
  let updated: Reminder | null = null
  const reminders = state.reminders.map((r) => {
    if (r.id !== id) return r
    updated = { ...r, ...patch }
    return updated
  })
  if (!updated) return null
  setCaptureState(sessionId, { reminders })
  return updated
}

export function deleteReminder(sessionId: string, id: string): boolean {
  const state = getCaptureState(sessionId)
  const next = state.reminders.filter((r) => r.id !== id)
  if (next.length === state.reminders.length) return false
  setCaptureState(sessionId, { reminders: next })
  return true
}
