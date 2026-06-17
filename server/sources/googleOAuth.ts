import { google } from 'googleapis'
import { calendarEnabledAccounts } from './gmailAccounts'

export function googleOAuthProjectNumber(): string | null {
  const id = process.env.GMAIL_CLIENT_ID?.trim()
  if (!id) return null
  const m = id.match(/^(\d+)-/)
  return m?.[1] ?? null
}

export const GOOGLE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/contacts.other.readonly',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file'
]

/** Optional — associates Docs/Drive calls with a GCP project (quota + API enablement). */
export function getGoogleApiKey(): string | undefined {
  return process.env.GOOGLE_API_KEY?.trim() || undefined
}

export function getOAuth2Client() {
  const clientId = process.env.GMAIL_CLIENT_ID
  const clientSecret = process.env.GMAIL_CLIENT_SECRET
  const base = process.env.APP_URL ?? 'http://localhost:3131'
  const redirectUri =
    process.env.GMAIL_REDIRECT_URI || `${base}/api/auth/gmail/callback`

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured')
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

export function authClientForTokens(tokens: Record<string, unknown>) {
  const oauth2 = getOAuth2Client()
  oauth2.setCredentials(tokens)
  return oauth2
}

/** Do not retry 429s — retries burn quota and extend user-rate limits. */
export const GOOGLE_REQUEST_OPTS = { retry: false } as const

export async function isGoogleConnected(): Promise<boolean> {
  return (await calendarEnabledAccounts()).length > 0
}
