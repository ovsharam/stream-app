import { google } from 'googleapis'
import type { Server as SocketServer } from 'socket.io'
import { normalizeGdocsItem } from '../normalizer'
import { upsertItems, itemExists } from '../db'
import type { StreamItem } from '../../shared/types'
import { feedEnabledAccounts, feedEnabledAccountsAnySession } from './gmailAccounts'
import { authClientForTokens, googleOAuthProjectNumber } from './googleOAuth'

let lastGdocsError: string | null = null

export function getLastGdocsError(): string | null {
  return lastGdocsError
}

/** Parse GCP project id from Google API error text. */
export function gdocsProjectIdFromError(error: string | null): string | null {
  if (!error) return null
  const m = error.match(/project[=\s](\d+)/i)
  return m?.[1] ?? null
}

export function gdocsApiEnableUrlsForProject(project?: string | null): {
  drive: string
  docs: string
} {
  const q = project ? `?project=${project}` : ''
  return {
    drive: `https://console.developers.google.com/apis/api/drive.googleapis.com/overview${q}`,
    docs: `https://console.developers.google.com/apis/api/docs.googleapis.com/overview${q}`
  }
}

export function gdocsApiEnableUrls(error: string | null): {
  drive?: string
  docs?: string
} {
  const project = gdocsProjectIdFromError(error) ?? googleOAuthProjectNumber()
  if (!project) return {}
  return gdocsApiEnableUrlsForProject(project)
}

export function gdocsNeedsApiEnable(error: string | null): boolean {
  if (!error) return false
  return /has not been used|is disabled|accessNotConfigured|403/i.test(error)
}

export async function isGdocsConnected(): Promise<boolean> {
  return (await feedEnabledAccountsAnySession()).length > 0
}

async function docsClient(accountId?: string) {
  const accounts = await feedEnabledAccountsAnySession()
  const account =
    (accountId ? accounts.find((a) => a.id === accountId) : undefined) ?? accounts[0]
  if (!account) throw new Error('Connect Gmail with Docs scope first')
  const auth = authClientForTokens(account.tokens)
  return {
    drive: google.drive({ version: 'v3', auth }),
    docs: google.docs({ version: 'v1', auth }),
    accountEmail: account.email
  }
}

export async function syncGdocs(io?: SocketServer): Promise<StreamItem[]> {
  const { googleApiBlockedMessage } = await import('./googleRateLimit')
  const blocked = googleApiBlockedMessage()
  if (blocked) {
    lastGdocsError = blocked
    return []
  }

  if (!(await isGdocsConnected())) return []

  try {
    const { drive, accountEmail } = await docsClient()
    const list = await drive.files.list({
      pageSize: 15,
      orderBy: 'modifiedTime desc',
      q: "mimeType='application/vnd.google-apps.document' and trashed=false",
      fields: 'files(id,name,modifiedTime,webViewLink,owners(displayName))'
    })

    const items: StreamItem[] = []
    for (const file of list.data.files ?? []) {
      if (!file.id || !file.name) continue
      items.push(
        normalizeGdocsItem({
          id: file.id,
          title: file.name,
          url: file.webViewLink ?? `https://docs.google.com/document/d/${file.id}`,
          modifiedAt: new Date(file.modifiedTime ?? Date.now()),
          owner: file.owners?.[0]?.displayName ?? accountEmail,
          accountEmail
        })
      )
    }

    lastGdocsError = null

    if (items.length > 0) {
      const fresh = items.filter((i) => !itemExists(i.id))
      upsertItems(items)
      for (const item of fresh) io?.emit('stream:item', item)
    }
    return items
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    lastGdocsError = message
    console.error('[gdocs] sync failed:', err)
    return []
  }
}

export async function createGoogleDoc(input: {
  title: string
  body?: string
}): Promise<{ id: string; url: string }> {
  const { docs } = await docsClient()
  try {
    const created = await docs.documents.create({
      requestBody: { title: input.title }
    })
    const id = created.data.documentId
    if (!id) throw new Error('Google Docs did not return document id')

    if (input.body?.trim()) {
      await docs.documents.batchUpdate({
        documentId: id,
        requestBody: {
          requests: [
            {
              insertText: {
                location: { index: 1 },
                text: input.body.trim()
              }
            }
          ]
        }
      })
    }

    lastGdocsError = null
    return {
      id,
      url: `https://docs.google.com/document/d/${id}/edit`
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    lastGdocsError = message
    throw err
  }
}

export async function appendGoogleDoc(input: {
  documentId: string
  text: string
  accountId?: string
}): Promise<void> {
  const { docs } = await docsClient(input.accountId)
  const doc = await docs.documents.get({ documentId: input.documentId })
  const endIndex = doc.data.body?.content?.at(-1)?.endIndex ?? 1
  const insertAt = Math.max(1, endIndex - 1)
  await docs.documents.batchUpdate({
    documentId: input.documentId,
    requestBody: {
      requests: [
        {
          insertText: {
            location: { index: insertAt },
            text: `\n${input.text.trim()}`
          }
        }
      ]
    }
  })
}
