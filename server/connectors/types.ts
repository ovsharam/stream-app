export type ConnectorType =
  | 'github'
  | 'slack'
  | 'linear'
  | 'notion'
  | 'google_drive'
  | 'jira'
  | 'gong'
  | 'zoom'
  | 'monday'
  | 'trello'
  | 'asana'
  | 'clickup'
  | 'confluence'
  | 'gitbook'
  | 'readme'
  | 'salesforce'
  | 'gmail'
  | 'teams'
  | 'docs_site'

export type AuthType = 'pat' | 'api_key' | 'oauth' | 'none'

export interface ConnectorCredentials {
  accessToken?: string
  refreshToken?: string
  apiKey?: string     // Linear, Jira token
  pat?: string        // GitHub personal access token
  email?: string      // Jira requires email + token
  workspaceUrl?: string // Jira cloud instance URL
  tokenType?: string
  expiresAt?: number
}

export interface ConnectorSettings {
  // GitHub
  repos?: string[]        // 'owner/repo' — e.g. ['acme/api', 'acme/backend']
  // Slack
  channels?: string[]     // channel names without #, e.g. ['product', 'engineering']
  // Linear
  teamIds?: string[]
  // Notion
  pageIds?: string[]
  databaseIds?: string[]
  // Google Drive
  folderIds?: string[]
  // Jira
  projectKeys?: string[]  // e.g. ['API', 'PLAT']
  // Gong
  trackerNames?: string[] // filter by tracker; empty = all recent calls
  // Zoom
  topicFilter?: string    // substring match on meeting topic
  // Monday
  boardIds?: string[]
  // Trello (key stored as 'apiKey' in key:token format)
  // Asana / ClickUp (shared)
  projectIds?: string[]
  // ClickUp
  listIds?: string[]
  // Confluence
  spaceKeys?: string[]
  // GitBook
  spaceIds?: string[]
  // Readme.com — no extra settings needed (syncs all docs + changelog)
  // Gmail
  searchQuery?: string    // Gmail search syntax, e.g. 'label:product-updates'
  // Teams — reuses `channels` (channel display names); empty = product-ish defaults
  teamNames?: string[]    // filter joined teams by display name; empty = all
  // Public docs crawler
  siteUrls?: string[]     // seed URLs, e.g. ['https://docs.vapi.ai']
  maxPages?: number       // crawl cap per seed (default 40)
}

export interface ConnectorConfig {
  id: string
  customerId: string
  type: ConnectorType
  label: string
  credentials: ConnectorCredentials
  settings: ConnectorSettings
  status: 'active' | 'paused' | 'error' | 'pending_auth'
  errorMsg?: string
  lastSyncAt?: number
  createdAt: number
  updatedAt: number
}

export interface SyncRun {
  id: string
  connectorId: string
  customerId: string
  status: 'running' | 'done' | 'error'
  chunksProcessed: number
  nodesExtracted: number
  errorMsg?: string
  startedAt: number
  completedAt?: number
}

/** A single unit of content yielded by a connector, ready for extraction. */
export interface ConnectorChunk {
  content: string
  sourceId: string       // stable ID for dedup (e.g. GH issue number, Slack ts)
  sourceUrl?: string
  title?: string
  author?: string
  timestamp?: number     // ms since epoch
  contentType: 'message' | 'doc' | 'issue' | 'pr' | 'release' | 'transcript' | 'comment'
}

export interface ConnectorImpl {
  type: ConnectorType
  label: string
  description: string
  authType: AuthType
  getAuthUrl?(clientId: string, redirectUri: string, state: string): string
  exchangeCode?(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string
  ): Promise<ConnectorCredentials>
  refreshAccessToken?(
    creds: ConnectorCredentials,
    clientId: string,
    clientSecret: string
  ): Promise<ConnectorCredentials>
  validate(creds: ConnectorCredentials, settings: ConnectorSettings): Promise<{ ok: boolean; error?: string }>
  fetchChunks(
    creds: ConnectorCredentials,
    settings: ConnectorSettings,
    since?: number
  ): AsyncGenerator<ConnectorChunk>
}
