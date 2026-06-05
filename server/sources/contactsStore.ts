import { google } from 'googleapis'
import * as session from '../session'
import { getSessionIdFromContext } from '../request-context'
import { getOAuth2Client, GOOGLE_REQUEST_OPTS } from './googleOAuth'
import { listGmailAccounts } from './gmailAccounts'
import type { ContactsState, PlatformContact } from '../../shared/contacts'
import { expandContactMentions } from '../../shared/compose'
import {
  googleApiBlockedMessage,
  markGoogleRateLimited,
  effectiveGoogleSyncError,
  assertGoogleApiAllowed,
  isRateLimitMessage,
  isGoogleApiBlocked
} from './googleRateLimit'
import { googleApiEnableUrl, googleApiNeedsEnable } from './gmail'

const STORE_KEY = 'contacts'

let lastContactsError: string | null = null

export function clearLastContactsError(): void {
  lastContactsError = null
}

export function getLastContactsError(): string | null {
  return effectiveGoogleSyncError(lastContactsError)
}

function formatContactsSyncError(message: string): string {
  if (/insufficient.*scope|insufficient.*permission|access_not_configured|403/i.test(message)) {
    return `${message} — disconnect and reconnect Gmail in Apps to grant contact access.`
  }
  if (/invalid_grant|token has been expired|token has been revoked/i.test(message)) {
    return `${message} — reconnect Gmail in Apps.`
  }
  return message
}

function contactsErrorMeta(error: string | null): Pick<ContactsState, 'error' | 'needsApiEnable' | 'enableUrl'> {
  if (!error) return {}
  return {
    error,
    needsApiEnable: googleApiNeedsEnable(error),
    enableUrl: googleApiEnableUrl(error) ?? undefined
  }
}

function resolveSessionId(explicit?: string): string {
  return explicit ?? getSessionIdFromContext()
}

function readState(sid: string): ContactsState {
  const raw = session.getToken(sid, STORE_KEY) as ContactsState | undefined
  return raw?.contacts ? raw : { contacts: [], syncedAt: null }
}

function writeState(sid: string, state: ContactsState): void {
  session.setToken(sid, STORE_KEY, state)
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

type ContactRow = { id: string; name: string; email: string; photoUrl?: string; source: PlatformContact['source'] }

function assignMentionTokens(rows: ContactRow[]): PlatformContact[] {
  const firstNameCounts = new Map<string, number>()
  for (const row of rows) {
    const first = (row.name.split(/\s+/)[0] ?? row.email.split('@')[0]).toLowerCase()
    firstNameCounts.set(first, (firstNameCounts.get(first) ?? 0) + 1)
  }

  return rows.map((row) => {
    const first = (row.name.split(/\s+/)[0] ?? row.email.split('@')[0]).toLowerCase()
    const mentionToken =
      (firstNameCounts.get(first) ?? 0) > 1 ? slugify(row.name) || first : first
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      source: row.source,
      mentionToken,
      photoUrl: row.photoUrl
    }
  })
}

function personRowsFromApi(
  people: Array<{
    resourceName?: string | null
    names?: Array<{ displayName?: string | null }> | null
    emailAddresses?: Array<{ value?: string | null }> | null
    photos?: Array<{ url?: string | null }> | null
  }>,
  source: PlatformContact['source'],
  seen: Set<string>,
  out: ContactRow[]
): void {
  for (const person of people) {
    const email = person.emailAddresses?.find((e) => e.value)?.value?.trim()
    if (!email || seen.has(email.toLowerCase())) continue

    const name =
      person.names?.find((n) => n.displayName)?.displayName?.trim() ||
      person.names?.[0]?.displayName?.trim() ||
      email.split('@')[0]

    const photoUrl = person.photos?.find((p) => p.url)?.url
    seen.add(email.toLowerCase())
    out.push({
      id: String(person.resourceName ?? email),
      name,
      email,
      photoUrl: photoUrl || undefined,
      source
    })
  }
}

async function fetchSavedContactsForAccount(
  tokens: Record<string, unknown>,
  accountEmail?: string
): Promise<ContactRow[]> {
  assertGoogleApiAllowed(`contacts.saved:${accountEmail ?? 'unknown'}`)
  const oauth2 = getOAuth2Client()
  oauth2.setCredentials(tokens)
  const people = google.people({ version: 'v1', auth: oauth2 })

  const out: ContactRow[] = []
  const seen = new Set<string>()
  let pageToken: string | undefined

  do {
    const res = await people.people.connections.list(
      {
        resourceName: 'people/me',
        pageSize: 200,
        personFields: 'names,emailAddresses,photos',
        pageToken
      },
      GOOGLE_REQUEST_OPTS
    )

    personRowsFromApi(res.data.connections ?? [], 'gmail', seen, out)
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)

  return out
}

/** Gmail To: suggestions — people you've emailed but may not have saved as contacts. */
async function fetchOtherContactsForAccount(
  tokens: Record<string, unknown>,
  accountEmail?: string
): Promise<ContactRow[]> {
  assertGoogleApiAllowed(`contacts.other:${accountEmail ?? 'unknown'}`)
  const oauth2 = getOAuth2Client()
  oauth2.setCredentials(tokens)
  const people = google.people({ version: 'v1', auth: oauth2 })

  const out: ContactRow[] = []
  const seen = new Set<string>()
  let pageToken: string | undefined

  do {
    const res = await people.otherContacts.list(
      {
        pageSize: 1000,
        readMask: 'names,emailAddresses,photos',
        pageToken
      },
      GOOGLE_REQUEST_OPTS
    )

    personRowsFromApi(res.data.otherContacts ?? [], 'gmail-other', seen, out)
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)

  return out
}

async function fetchContactsForAccount(
  tokens: Record<string, unknown>,
  accountEmail?: string
): Promise<{ rows: ContactRow[]; savedCount: number; otherCount: number; warnings: string[] }> {
  const warnings: string[] = []
  let saved: ContactRow[] = []
  let other: ContactRow[] = []

  try {
    saved = await fetchSavedContactsForAccount(tokens, accountEmail)
  } catch (err) {
    const message = formatContactsSyncError(err instanceof Error ? err.message : String(err))
    warnings.push(`saved contacts: ${message}`)
    console.warn('[contacts] saved list failed for', accountEmail, message)
  }

  try {
    other = await fetchOtherContactsForAccount(tokens, accountEmail)
  } catch (err) {
    markGoogleRateLimited(err, 'contacts.other')
    const raw = err instanceof Error ? err.message : String(err)
    if (/insufficient.*scope|403|permission/i.test(raw)) {
      warnings.push(
        'other contacts (Gmail To: suggestions) need reconnect — disconnect Gmail, then Connect again to grant Other Contacts access.'
      )
    } else {
      warnings.push(`other contacts: ${formatContactsSyncError(raw)}`)
    }
    console.warn('[contacts] other contacts failed for', accountEmail, raw)
  }

  const merged = new Map<string, ContactRow>()
  for (const row of [...saved, ...other]) {
    merged.set(row.email.toLowerCase(), row)
  }

  return {
    rows: [...merged.values()],
    savedCount: saved.length,
    otherCount: other.length,
    warnings
  }
}

export function listContacts(sessionId?: string): PlatformContact[] {
  return readState(resolveSessionId(sessionId)).contacts
}

export function getContactsState(sessionId?: string): ContactsState {
  const state = readState(resolveSessionId(sessionId))
  if (state.error && isRateLimitMessage(state.error) && !isGoogleApiBlocked()) {
    return { ...state, error: undefined, needsApiEnable: undefined, enableUrl: undefined }
  }
  return state
}

export async function syncGmailContacts(sessionId?: string): Promise<ContactsState> {
  const sid = resolveSessionId(sessionId)
  const blocked = googleApiBlockedMessage()
  if (blocked) {
    lastContactsError = blocked
    return { ...readState(sid), ...contactsErrorMeta(blocked) }
  }

  const accounts = await listGmailAccounts(sid)
  if (accounts.length === 0) {
    lastContactsError = null
    const empty: ContactsState = {
      contacts: [],
      syncedAt: null,
      hint: 'Connect Gmail first, then sync contacts.'
    }
    writeState(sid, empty)
    return empty
  }

  const merged = new Map<string, ContactRow>()
  const errors: string[] = []
  let savedTotal = 0
  let otherTotal = 0

  for (const account of accounts) {
    try {
      const { rows, savedCount, otherCount, warnings } = await fetchContactsForAccount(
        account.tokens,
        account.email
      )
      savedTotal += savedCount
      otherTotal += otherCount
      errors.push(...warnings.map((w) => `${account.email}: ${w}`))
      for (const row of rows) {
        merged.set(row.email.toLowerCase(), row)
      }
    } catch (err) {
      markGoogleRateLimited(err, 'contacts.sync')
      const message = formatContactsSyncError(err instanceof Error ? err.message : String(err))
      errors.push(`${account.email}: ${message}`)
      console.warn('[contacts] sync failed for', account.email, message)
    }
  }

  const contacts = assignMentionTokens([...merged.values()]).sort((a, b) =>
    a.name.localeCompare(b.name)
  )

  console.log(
    `[contacts] synced ${contacts.length} total (${savedTotal} saved + ${otherTotal} other) for`,
    accounts.map((a) => a.email).join(', ')
  )

  if (contacts.length === 0 && errors.length > 0) {
    const error = errors.join('; ')
    lastContactsError = error
    const state: ContactsState = {
      contacts: [],
      syncedAt: Date.now(),
      accountEmail: accounts[0]?.email,
      savedCount: savedTotal,
      otherCount: otherTotal,
      ...contactsErrorMeta(error)
    }
    writeState(sid, state)
    return state
  }

  lastContactsError = errors.length > 0 ? errors.join('; ') : null
  const state: ContactsState = {
    contacts,
    syncedAt: Date.now(),
    accountEmail: accounts[0]?.email,
    savedCount: savedTotal,
    otherCount: otherTotal,
    hint:
      contacts.length === 0
        ? 'Reconnect Gmail once to grant Other Contacts access, then sync again.'
        : undefined,
    ...(errors.length > 0 ? contactsErrorMeta(errors.join('; ')) : {})
  }
  writeState(sid, state)
  return state
}

export function expandMentionsWithContacts(text: string, sessionId?: string): string {
  const contacts = listContacts(sessionId)
  return expandContactMentions(text, contacts)
}
