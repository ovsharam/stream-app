export type StreamSource =
  | 'gmail'
  | 'slack'
  | 'x'
  | 'monday'
  | 'discord'
  | 'perplexity'
  | 'claude'
  | 'cursor'
  | 'github'
  | 'gemini'
  | 'gdocs'
  | 'gong'
  | 'calcom'
  | 'meeting'
  | 'note'

export interface StreamItem {
  id: string
  source: StreamSource
  sender: {
    name: string
    handle?: string
    avatarUrl?: string
  }
  timestamp: Date
  title?: string
  body: string
  bodyFull?: string
  thread?: {
    id: string
    replyCount: number
    participants: string[]
  }
  attachments?: {
    type: 'file' | 'image' | 'link'
    name: string
    url?: string
    mimeType?: string
  }[]
  reactions?: { emoji: string; count: number }[]
  isUnread: boolean
  isStarred: boolean
  metadata: Record<string, unknown>
}

export interface StreamItemRow {
  id: string
  source: string
  sender_name: string | null
  sender_handle: string | null
  timestamp: number
  title: string | null
  body: string
  body_full: string | null
  is_unread: number
  is_starred: number
  raw_json: string
  created_at: number
}

export type ConnectionStatus = {
  gmail: boolean
  slack: boolean
  x: boolean
  monday: boolean
  discord: boolean
  perplexity: boolean
  claude: boolean
  cursor: boolean
  github: boolean
  gemini: boolean
  gdocs: boolean
  gong: boolean
}

export const SOURCE_COLORS: Record<StreamSource, string> = {
  gmail: '#EA4335',
  slack: '#E01E5A',
  x: '#ffffff',
  monday: '#ff3d57',
  discord: '#5865f2',
  perplexity: '#20B2AA',
  claude: '#D97757',
  cursor: '#7B61FF',
  github: '#24292f',
  gemini: '#4285F4',
  gdocs: '#4285F4',
  gong: '#7c3aed',
  calcom: '#292929',
  meeting: '#FF9500',
  note: '#F5A623'
}
