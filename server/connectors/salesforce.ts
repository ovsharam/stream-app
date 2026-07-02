import type { ConnectorImpl, ConnectorChunk, ConnectorCredentials } from './types'

// Salesforce — OAuth 2.0 web server flow.
// Extracts product knowledge: Knowledge articles (published) and recently
// closed Cases (subject + description + resolution) — the places where
// "what the product can/can't do" actually gets written down in a CRM.
//
// credentials.workspaceUrl stores the instance URL returned by the token
// exchange (e.g. https://acme.my.salesforce.com).

const LOGIN_HOST = 'https://login.salesforce.com'
const API_VERSION = 'v59.0'

function instanceUrl(creds: ConnectorCredentials): string {
  return (creds.workspaceUrl ?? '').replace(/\/$/, '')
}

async function sfQuery(
  creds: ConnectorCredentials,
  soql: string
): Promise<Array<Record<string, unknown>>> {
  const base = instanceUrl(creds)
  if (!base) throw new Error('Salesforce instance URL missing — reconnect OAuth')
  let url = `${base}/services/data/${API_VERSION}/query?q=${encodeURIComponent(soql)}`
  const records: Array<Record<string, unknown>> = []

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${creds.accessToken ?? ''}` },
    })
    if (!res.ok) throw new Error(`Salesforce ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const data = await res.json() as {
      records: Array<Record<string, unknown>>
      done: boolean
      nextRecordsUrl?: string
    }
    records.push(...data.records)
    url = data.done || !data.nextRecordsUrl ? '' : `${base}${data.nextRecordsUrl}`
    if (records.length >= 500) break // sanity cap per sync
  }
  return records
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function sfDate(ms: number): string {
  return new Date(ms).toISOString()
}

export const salesforceConnector: ConnectorImpl = {
  type: 'salesforce',
  label: 'Salesforce',
  description: 'Syncs Knowledge articles and resolved-case learnings from Salesforce.',
  authType: 'oauth',

  getAuthUrl(clientId, redirectUri, state) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'api refresh_token',
      state,
    })
    return `${LOGIN_HOST}/services/oauth2/authorize?${params}`
  },

  async exchangeCode(code, clientId, clientSecret, redirectUri) {
    const res = await fetch(`${LOGIN_HOST}/services/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    })
    const data = await res.json() as Record<string, unknown>
    if (data.error) throw new Error(`Salesforce OAuth error: ${data.error_description ?? data.error}`)
    return {
      accessToken: String(data.access_token),
      refreshToken: String(data.refresh_token ?? ''),
      workspaceUrl: String(data.instance_url ?? ''),
    }
  },

  async refreshAccessToken(creds, clientId, clientSecret) {
    if (!creds.refreshToken) throw new Error('No refresh token')
    const res = await fetch(`${LOGIN_HOST}/services/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: creds.refreshToken,
        client_id: clientId, client_secret: clientSecret,
      }),
    })
    const data = await res.json() as Record<string, unknown>
    if (data.error) throw new Error(`Salesforce refresh error: ${data.error_description ?? data.error}`)
    return {
      accessToken: String(data.access_token),
      workspaceUrl: String(data.instance_url ?? creds.workspaceUrl ?? ''),
    }
  },

  async validate(creds) {
    try {
      await sfQuery(creds, 'SELECT Id FROM User LIMIT 1')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  },

  async *fetchChunks(creds, _settings, since) {
    const sinceIso = sfDate(since ?? Date.now() - 180 * 86400000)

    // 1. Published Knowledge articles — the canonical product-fact store in SF
    try {
      const articles = await sfQuery(
        creds,
        `SELECT Id, Title, Summary, UrlName, LastPublishedDate
         FROM KnowledgeArticleVersion
         WHERE PublishStatus = 'Online' AND Language = 'en_US'
           AND LastPublishedDate > ${sinceIso}
         ORDER BY LastPublishedDate DESC LIMIT 200`
      )
      for (const a of articles) {
        const title = String(a.Title ?? '')
        const summary = stripHtml(String(a.Summary ?? ''))
        if (!title || summary.length < 50) continue
        yield {
          content: `Knowledge article: ${title}\n\n${summary}`,
          sourceId: `sf-ka-${a.Id}`,
          sourceUrl: `${instanceUrl(creds)}/lightning/r/Knowledge__kav/${a.Id}/view`,
          title,
          timestamp: a.LastPublishedDate ? new Date(String(a.LastPublishedDate)).getTime() : undefined,
          contentType: 'doc',
        } satisfies ConnectorChunk
      }
    } catch (e) {
      // Knowledge not enabled in many orgs — skip quietly
      console.warn('[salesforce] knowledge query skipped:', (e as Error).message)
    }

    // 2. Recently closed cases — where limitations and workarounds get recorded
    try {
      const cases = await sfQuery(
        creds,
        `SELECT Id, CaseNumber, Subject, Description, Status, ClosedDate
         FROM Case
         WHERE IsClosed = true AND ClosedDate > ${sinceIso}
         ORDER BY ClosedDate DESC LIMIT 200`
      )
      for (const c of cases) {
        const subject = String(c.Subject ?? '')
        const description = stripHtml(String(c.Description ?? ''))
        if (!subject || description.length < 100) continue
        yield {
          content: `Closed case ${c.CaseNumber}: ${subject}\n\n${description}`,
          sourceId: `sf-case-${c.Id}`,
          sourceUrl: `${instanceUrl(creds)}/lightning/r/Case/${c.Id}/view`,
          title: subject,
          timestamp: c.ClosedDate ? new Date(String(c.ClosedDate)).getTime() : undefined,
          contentType: 'issue',
        } satisfies ConnectorChunk
      }
    } catch (e) {
      console.warn('[salesforce] case query error:', (e as Error).message)
    }
  },
}
