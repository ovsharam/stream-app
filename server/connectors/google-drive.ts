import type { ConnectorImpl, ConnectorCredentials, ConnectorSettings } from './types'

// Uses googleapis package which is already in package.json
// Falls back to direct REST if googleapis not available at runtime
const DRIVE_BASE = 'https://www.googleapis.com/drive/v3'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

async function driveGet(token: string, path: string, params: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${DRIVE_BASE}${path}${qs ? '?' + qs : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 10000))
    return driveGet(token, path, params)
  }
  if (!res.ok) throw new Error(`Drive ${res.status}: ${path}`)
  return res.json() as Promise<Record<string, unknown>>
}

async function exportDoc(token: string, fileId: string, mimeType: string): Promise<string> {
  const res = await fetch(`${DRIVE_BASE}/files/${fileId}/export?mimeType=${encodeURIComponent(mimeType)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return ''
  return res.text()
}

async function downloadFile(token: string, fileId: string): Promise<string> {
  const res = await fetch(`${DRIVE_BASE}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return ''
  return res.text()
}

function gdocMimeToExport(mime: string): string | null {
  if (mime === 'application/vnd.google-apps.document') return 'text/plain'
  if (mime === 'application/vnd.google-apps.spreadsheet') return 'text/csv'
  if (mime === 'application/vnd.google-apps.presentation') return 'text/plain'
  return null
}

export const googleDriveConnector: ConnectorImpl = {
  type: 'google_drive',
  label: 'Google Drive',
  description: 'Indexes product docs, PRDs, and spec sheets from Google Drive.',
  authType: 'oauth',

  getAuthUrl(clientId, redirectUri, state) {
    const scopes = [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
    ].join(' ')
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      access_type: 'offline',
      prompt: 'consent',
      state,
    })
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  },

  async exchangeCode(code, clientId, clientSecret, redirectUri) {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirectUri, grant_type: 'authorization_code',
      }),
    })
    const data = await res.json() as Record<string, unknown>
    if (data.error) throw new Error(`Drive OAuth error: ${data.error}`)
    return {
      accessToken: String(data.access_token),
      refreshToken: String(data.refresh_token ?? ''),
      expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
    }
  },

  async refreshAccessToken(creds, clientId, clientSecret) {
    if (!creds.refreshToken) throw new Error('No refresh token')
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: creds.refreshToken, client_id: clientId,
        client_secret: clientSecret, grant_type: 'refresh_token',
      }),
    })
    const data = await res.json() as Record<string, unknown>
    if (data.error) throw new Error(`Drive refresh error: ${data.error}`)
    return {
      accessToken: String(data.access_token),
      expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
    }
  },

  async validate(creds) {
    try {
      await driveGet(creds.accessToken ?? '', '/about', { fields: 'user' })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  },

  async *fetchChunks(creds, settings, since) {
    const token = creds.accessToken ?? ''
    const sinceIso = since ? new Date(since).toISOString() : new Date(Date.now() - 180 * 86400000).toISOString()

    const targetFolders = settings.folderIds ?? []

    // Build query: modified files in target folders (or all of Drive)
    const mimeFilter = [
      'application/vnd.google-apps.document',
      'application/vnd.google-apps.presentation',
      'text/plain', 'text/markdown',
    ].map(m => `mimeType='${m}'`).join(' or ')

    let q = `(${mimeFilter}) and modifiedTime > '${sinceIso}' and trashed=false`
    if (targetFolders.length > 0) {
      const folderQ = targetFolders.map(id => `'${id}' in parents`).join(' or ')
      q += ` and (${folderQ})`
    }

    let pageToken: string | undefined
    do {
      const params: Record<string, string> = {
        q,
        fields: 'nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime)',
        pageSize: '50',
        orderBy: 'modifiedTime desc',
      }
      if (pageToken) params.pageToken = pageToken

      const data = await driveGet(token, '/files', params)
      const files = (data.files ?? []) as Array<{ id: string; name: string; mimeType: string; webViewLink?: string; modifiedTime: string }>
      pageToken = data.nextPageToken as string | undefined

      for (const file of files) {
        try {
          let text = ''
          const exportMime = gdocMimeToExport(file.mimeType)
          if (exportMime) {
            text = await exportDoc(token, file.id, exportMime)
          } else if (file.mimeType.startsWith('text/')) {
            text = await downloadFile(token, file.id)
          }

          if (!text || text.trim().length < 100) continue

          yield {
            content: text.slice(0, 20000),  // cap at 20k chars per doc
            sourceId: `gdrive-${file.id}`,
            sourceUrl: file.webViewLink,
            title: file.name,
            timestamp: new Date(file.modifiedTime).getTime(),
            contentType: 'doc' as const,
          }
        } catch (e) {
          console.warn(`[gdrive] file error ${file.name}:`, (e as Error).message)
        }
      }
    } while (pageToken)
  },
}
