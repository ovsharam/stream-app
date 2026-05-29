import { google } from 'googleapis'
import type { Server as SocketServer } from 'socket.io'
import { normalizeGdocsItem } from '../normalizer'
import { upsertItems, itemExists } from '../db'
import type { StreamItem } from '../../shared/types'
import { feedEnabledAccounts, feedEnabledAccountsAnySession } from './gmailAccounts'
import { authClientForTokens, getGoogleApiKey } from './googleOAuth'

export async function isGdocsConnected(): Promise<boolean> {
  return (await feedEnabledAccountsAnySession()).length > 0
}

async function docsClient() {
  const accounts = await feedEnabledAccounts()
  const account = accounts[0] ?? (await feedEnabledAccountsAnySession())[0]
  if (!account) throw new Error('Connect Gmail with Docs scope first')
  const auth = authClientForTokens(account.tokens)
  const apiKey = getGoogleApiKey()
  return {
    drive: google.drive({ version: 'v3', auth, ...(apiKey ? { apiKey } : {}) }),
    docs: google.docs({ version: 'v1', auth, ...(apiKey ? { apiKey } : {}) }),
    accountEmail: account.email
  }
}

export async function syncGdocs(io?: SocketServer): Promise<StreamItem[]> {
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

    if (items.length > 0) {
      const fresh = items.filter((i) => !itemExists(i.id))
      upsertItems(items)
      for (const item of fresh) io?.emit('stream:item', item)
    }
    return items
  } catch (err) {
    console.error('[gdocs] sync failed:', err)
    return []
  }
}

export async function createGoogleDoc(input: {
  title: string
  body?: string
}): Promise<{ id: string; url: string }> {
  const { drive, docs } = await docsClient()
  const created = await drive.files.create({
    requestBody: {
      name: input.title,
      mimeType: 'application/vnd.google-apps.document'
    },
    fields: 'id,webViewLink'
  })
  const id = created.data.id
  if (!id) throw new Error('Google Docs did not return file id')

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

  return {
    id,
    url: created.data.webViewLink ?? `https://docs.google.com/document/d/${id}`
  }
}

export async function appendGoogleDoc(input: {
  documentId: string
  text: string
}): Promise<void> {
  const { docs } = await docsClient()
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
