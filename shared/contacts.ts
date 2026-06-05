/** Platform contacts synced from Gmail / manual sources — used for @mention autocomplete. */

export type ContactSource = 'gmail' | 'gmail-other'

export type PlatformContact = {
  id: string
  name: string
  email: string
  source: ContactSource
  /** Token typed after @ — e.g. martin or martin-smith when duplicates exist */
  mentionToken: string
  photoUrl?: string
}

export type ContactsState = {
  contacts: PlatformContact[]
  syncedAt: number | null
  accountEmail?: string
  /** Set when the last sync failed (rate limit, API disabled, reconnect needed). */
  error?: string
  needsApiEnable?: boolean
  enableUrl?: string
  /** Shown when sync succeeds but returned zero rows (e.g. need reconnect for new scopes). */
  hint?: string
  savedCount?: number
  otherCount?: number
}

import type { ComposeMentionTarget } from './compose'

export function contactsToMentionTargets(contacts: PlatformContact[]): ComposeMentionTarget[] {
  return contacts.map((c) => ({
    token: c.mentionToken,
    label: c.name,
    kind: 'person' as const,
    hint: c.email,
    email: c.email
  }))
}
