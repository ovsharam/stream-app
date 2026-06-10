import { google } from 'googleapis'
import { getRecentItems } from '../db'
import { authClientForTokens } from './googleOAuth'
import { feedEnabledAccountsAnySession } from './gmailAccounts'
import {
  mergeGmailCalendarInvite,
  parseGmailCalendarInviteFromBody,
  parseGmailCalendarInviteFromIcs,
  parseGmailCalendarInviteFromSubject,
  type GmailCalendarInvite
} from '../../shared/gmail-calendar-invite'

type GmailPart = {
  mimeType?: string | null
  body?: { data?: string | null } | null
  parts?: GmailPart[] | null
}

function decodePartData(data?: string | null): string {
  if (!data) return ''
  return Buffer.from(data, 'base64').toString('utf-8')
}

function collectParts(
  payload: GmailPart | null | undefined,
  out: { plain: string; html: string; ics: string }
): void {
  if (!payload) return

  const mime = payload.mimeType ?? ''
  if (mime === 'text/plain' && payload.body?.data) {
    out.plain += decodePartData(payload.body.data)
  } else if (mime === 'text/html' && payload.body?.data) {
    out.html += decodePartData(payload.body.data)
  } else if ((mime === 'text/calendar' || mime === 'application/ics') && payload.body?.data) {
    out.ics += decodePartData(payload.body.data)
  }

  for (const part of payload.parts ?? []) {
    collectParts(part, out)
  }
}

async function gmailClientForAccount(accountId?: string) {
  const accounts = await feedEnabledAccountsAnySession()
  const account =
    (accountId ? accounts.find((a) => a.id === accountId) : null) ?? accounts[0]
  if (!account) throw new Error('No Gmail account available')
  const oauth2 = authClientForTokens(account.tokens)
  return { gmail: google.gmail({ version: 'v1', auth: oauth2 }), account }
}

export async function getGmailCalendarInvite(input: {
  threadId?: string
  accountId?: string
  streamItemId?: string
}): Promise<(GmailCalendarInvite & { threadId: string; accountId: string; subject: string; gmailUrl: string }) | null> {
  let threadId = input.threadId
  let accountId = input.accountId

  if (input.streamItemId) {
    const item = getRecentItems(500).find((i) => i.id === input.streamItemId)
    if (item?.source === 'gmail') {
      threadId = String(item.metadata?.threadId ?? threadId ?? '')
      accountId = String(item.metadata?.accountId ?? accountId ?? '')
    }
  }

  if (!threadId) return null

  const { gmail, account } = await gmailClientForAccount(accountId)
  const detail = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
    format: 'full'
  })

  const rawMessages = detail.data.messages ?? []
  if (rawMessages.length === 0) return null

  const latest = rawMessages[rawMessages.length - 1]
  const headers = latest?.payload?.headers ?? []
  const subject =
    headers.find((h) => h.name?.toLowerCase() === 'subject')?.value?.trim() ?? '(no subject)'

  const bodies = { plain: '', html: '', ics: '' }
  for (const msg of rawMessages) {
    collectParts(msg.payload as GmailPart | undefined, bodies)
  }

  const fromSubject = parseGmailCalendarInviteFromSubject(subject)
  const fromBody = parseGmailCalendarInviteFromBody(bodies.html || bodies.plain)
  const fromIcs = bodies.ics ? parseGmailCalendarInviteFromIcs(bodies.ics) : {}

  const invite = mergeGmailCalendarInvite(fromSubject, fromIcs, fromBody)
  const gmailUrl = `https://mail.google.com/mail/u/0/#inbox/${threadId}`

  return {
    ...invite,
    eventTitle: invite.eventTitle ?? fromSubject.eventTitle,
    whenLabel: invite.whenLabel ?? fromSubject.whenLabel,
    threadId,
    accountId: account.id,
    subject,
    gmailUrl,
    calendarUrl: invite.calendarUrl,
    rsvpUrls: invite.rsvpUrls
  }
}
