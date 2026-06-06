/** Shared Electron sessions for OAuth-heavy sites opened as workspace tabs. */
export type EmbedBrowseKind = 'google' | 'linkedin'

export const EMBED_BROWSE_PARTITIONS: Record<EmbedBrowseKind, string> = {
  google: 'persist:google-browse',
  linkedin: 'persist:linkedin-browse'
}

/** @deprecated use EMBED_BROWSE_PARTITIONS.google */
export const GOOGLE_BROWSE_PARTITION = EMBED_BROWSE_PARTITIONS.google

const GOOGLE_HOSTS = [
  'youtube.com',
  'mail.google.com',
  'docs.google.com',
  'drive.google.com',
  'calendar.google.com',
  'meet.google.com'
]

const LINKEDIN_HOSTS = ['linkedin.com', 'www.linkedin.com']

function hostMatches(url: string, hosts: string[]): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return hosts.some((d) => host === d.replace(/^www\./, '') || host.endsWith(`.${d.replace(/^www\./, '')}`))
  } catch {
    return false
  }
}

export function isGoogleBrowseHost(url: string): boolean {
  return hostMatches(url, GOOGLE_HOSTS)
}

export function isLinkedInBrowseHost(url: string): boolean {
  return hostMatches(url, LINKEDIN_HOSTS)
}

/** LinkedIn tracking / auth probe hosts — don't persist as tab URL (breaks webview reload). */
export function isLinkedInNavigationNoise(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host === 'cs.ns1p.net' || host.endsWith('.ns1p.net')) return true
    if (host.endsWith('.licdn.com')) return true
    return false
  } catch {
    return false
  }
}

export function shouldPersistWorkspaceUrl(
  url: string,
  tab: { source?: string; pinId?: string }
): boolean {
  const linkedInTab = tab.pinId === 'linkedin' || tab.source === 'linkedin'
  if (!linkedInTab) return true
  if (isLinkedInNavigationNoise(url)) return false
  if (isLinkedInBrowseHost(url) || url.includes('linkedin.com')) return true
  return false
}

export const LINKEDIN_FEED_URL = 'https://www.linkedin.com/feed/'

export function embedBrowseKindForUrl(url: string): EmbedBrowseKind | null {
  if (isGoogleBrowseHost(url)) return 'google'
  if (isLinkedInBrowseHost(url)) return 'linkedin'
  return null
}

/** Pinned tabs keep OAuth session even when the URL redirects off-domain (e.g. LinkedIn → cs.ns1p.net). */
export function embedBrowseKindForTab(tab: {
  url: string
  source?: string
  pinId?: string
  tabKind?: string
}): EmbedBrowseKind | null {
  if (tab.pinId === 'linkedin' || tab.source === 'linkedin') return 'linkedin'
  if (tab.source === 'gdocs' || tab.source === 'youtube' || tab.source === 'gmail' || tab.source === 'calendar') {
    return 'google'
  }
  return embedBrowseKindForUrl(tab.url)
}

export function workspacePartitionForUrl(url: string, tabId: string): string {
  const kind = embedBrowseKindForUrl(url)
  if (kind) return EMBED_BROWSE_PARTITIONS[kind]
  const slug = tabId.replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 48)
  return `persist:ws-${slug}`
}

export function workspacePartitionForTab(tab: {
  url: string
  id: string
  source?: string
  pinId?: string
  tabKind?: string
}): string {
  const kind = embedBrowseKindForTab(tab)
  if (kind) return EMBED_BROWSE_PARTITIONS[kind]
  return workspacePartitionForUrl(tab.url, tab.id)
}

export function embedBrowseSignInUrl(kind: EmbedBrowseKind, continueUrl: string): string {
  if (kind === 'google') {
    return `https://accounts.google.com/ServiceLogin?passive=false&continue=${encodeURIComponent(continueUrl)}`
  }
  return `https://www.linkedin.com/login?fromSignIn=true&session_redirect=${encodeURIComponent(continueUrl)}`
}

/** @deprecated use embedBrowseSignInUrl('google', ...) */
export function googleSignInUrl(continueUrl: string): string {
  return embedBrowseSignInUrl('google', continueUrl)
}

/** Gmail OAuth consent — allowed in auth popup; password login pages are not. */
export function isGoogleOAuthUrl(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url)
    return hostname === 'accounts.google.com' && pathname.startsWith('/o/oauth2/')
  } catch {
    return false
  }
}

/** Google account password / ServiceLogin — blocked in embedded browsers. */
export function isGoogleDirectSignInUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return hostname === 'accounts.google.com' && !isGoogleOAuthUrl(url)
  } catch {
    return false
  }
}

export function isLinkedInAuthUrl(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url)
    if (!hostname.endsWith('linkedin.com')) return false
    return (
      pathname.startsWith('/login') ||
      pathname.startsWith('/checkpoint') ||
      pathname.startsWith('/authwall') ||
      pathname.startsWith('/uas/')
    )
  } catch {
    return false
  }
}

/** OAuth / login hosts that should open in an in-app auth window (same partition). */
export function isEmbedAuthPopupUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    if (hostname === 'accounts.google.com') return true
    return isLinkedInAuthUrl(url)
  } catch {
    return false
  }
}
