import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { GmailAccount, GoogleCalendarOption, MondayAccount } from '@shared/cluster'
import { clusterApi, contactsApi, captureApi, integrationApi, type IntegrationConnections } from '../lib/api'
import { IconGmail, IconMonday, IconYoutube, IconLinkedin } from './Icons'
import { McpAgentsSection } from './McpAgentsSection'
import { isNavAppDesktop, isNavAppPinned, pinnableEntryById, pinnableEntryForIntegration, type NavApp } from './navAppsStore'
import { GOOGLE_BROWSE_PARTITION } from './embedBrowse'

type IntegrationId =
  | 'youtube'
  | 'linkedin'
  | 'gmail'
  | 'slack'
  | 'monday'
  | 'agents'
  | 'calcom'
  | 'x'
  | 'discord'
  | 'perplexity'
  | 'claude'
  | 'gemini'
  | 'cursor'
  | 'github'
  | 'gdocs'
  | 'obsidian'
  | 'gong'

type IntegrationCategory = 'desktop' | 'productivity' | 'communication' | 'ai' | 'sales'

type MarketCategoryFilter = 'all' | 'connected' | IntegrationCategory

type IntegrationDef = {
  id: IntegrationId
  name: string
  tagline: string
  feeds: string
  category: IntegrationCategory
  brandClass: string
  icon: ReactNode
  compose?: string
}

const INTEGRATIONS: IntegrationDef[] = [
  {
    id: 'youtube',
    name: 'YouTube',
    tagline: 'In-app tab · sidebar pin',
    feeds: 'Sidebar',
    category: 'desktop',
    brandClass: 'x-int-card-youtube',
    icon: <IconYoutube className="x-int-brand-icon" />
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    tagline: 'In-app tab · sidebar pin',
    feeds: 'Sidebar',
    category: 'desktop',
    brandClass: 'x-int-card-linkedin',
    icon: <IconLinkedin className="x-int-brand-icon" />
  },
  {
    id: 'gmail',
    name: 'Gmail',
    tagline: 'Inbox threads + Google Calendar',
    feeds: 'Feed · Calendar rail',
    category: 'productivity',
    brandClass: 'x-int-card-gmail',
    icon: <IconGmail className="x-int-brand-icon" />
  },
  {
    id: 'slack',
    name: 'Slack',
    tagline: 'Workspace channels in your feed',
    feeds: 'Feed',
    category: 'communication',
    brandClass: 'x-int-card-slack',
    icon: <span className="x-int-brand-letter">S</span>
  },
  {
    id: 'calcom',
    name: 'Cal.com',
    tagline: 'Scheduling — upcoming & past bookings',
    feeds: 'Feed',
    category: 'productivity',
    brandClass: 'x-int-card-calcom',
    icon: <span className="x-int-brand-letter">Cal</span>
  },
  {
    id: 'monday',
    name: 'Monday.com',
    tagline: 'Board updates and item threads',
    feeds: 'Feed',
    category: 'productivity',
    brandClass: 'x-int-card-monday',
    icon: <IconMonday className="x-int-brand-icon" />
  },
  {
    id: 'agents',
    name: 'MCP Agents',
    tagline: 'Register your agency MCP servers for custom compose dispatch',
    feeds: 'Compose',
    category: 'ai',
    brandClass: 'x-int-card-agents',
    icon: <span className="x-int-brand-letter">MCP</span>,
    compose: '@alias ask: … (when executor wired)'
  },
  {
    id: 'github',
    name: 'GitHub',
    tagline: 'Issues in feed, create & comment',
    feeds: 'Feed',
    category: 'productivity',
    brandClass: 'x-int-card-github',
    icon: <span className="x-int-brand-letter">GH</span>,
    compose: '@github org/repo: title / body'
  },
  {
    id: 'gdocs',
    name: 'Google Docs',
    tagline: 'Recent docs via Gmail OAuth',
    feeds: 'Feed',
    category: 'productivity',
    brandClass: 'x-int-card-gdocs',
    icon: <span className="x-int-brand-letter">Gd</span>,
    compose: '@gdocs create: title / body'
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    tagline: 'Append markdown to your vault',
    feeds: 'Notes · Compose',
    category: 'productivity',
    brandClass: 'x-int-card-obsidian',
    icon: <span className="x-int-brand-letter">Ob</span>,
    compose: '@obsidian append: note text'
  },
  {
    id: 'gong',
    name: 'Gong',
    tagline: 'Call recordings & notes',
    feeds: 'Feed',
    category: 'sales',
    brandClass: 'x-int-card-gong',
    icon: <span className="x-int-brand-letter">Go</span>,
    compose: '@gong #CALL_ID note: …'
  },
  {
    id: 'claude',
    name: 'Claude',
    tagline: 'Sign in with Claude Pro — sync chats',
    feeds: 'Feed · Compose',
    category: 'ai',
    brandClass: 'x-int-card-claude',
    icon: <span className="x-int-brand-letter">C</span>,
    compose: '@claude ask: …'
  },
  {
    id: 'gemini',
    name: 'Gemini',
    tagline: 'Google AI ask & summarize',
    feeds: 'Feed · Compose',
    category: 'ai',
    brandClass: 'x-int-card-gemini',
    icon: <span className="x-int-brand-letter">G</span>,
    compose: '@gemini ask: …'
  },
  {
    id: 'cursor',
    name: 'Cursor',
    tagline: 'Agent prompts & cloud runs',
    feeds: 'Feed · Compose',
    category: 'ai',
    brandClass: 'x-int-card-cursor',
    icon: <span className="x-int-brand-letter">Cu</span>,
    compose: '@cursor ask: …'
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    tagline: 'Sign in · news in calendar rail',
    feeds: 'Feed · Calendar rail · Compose',
    category: 'ai',
    brandClass: 'x-int-card-perplexity',
    icon: <span className="x-int-brand-letter">P</span>,
    compose: '@perplexity ask: …'
  },
  {
    id: 'x',
    name: 'X',
    tagline: 'Timeline posts via bearer token',
    feeds: 'Feed',
    category: 'communication',
    brandClass: 'x-int-card-x',
    icon: <span className="x-int-brand-letter">𝕏</span>
  },
  {
    id: 'discord',
    name: 'Discord',
    tagline: 'Channel messages via bot token',
    feeds: 'Feed',
    category: 'communication',
    brandClass: 'x-int-card-discord',
    icon: <span className="x-int-brand-letter">D</span>
  }
]

const MARKET_CATEGORIES: { id: MarketCategoryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'connected', label: 'Your apps' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'communication', label: 'Communication' },
  { id: 'ai', label: 'AI & Agents' },
  { id: 'desktop', label: 'Desktop' },
  { id: 'sales', label: 'Sales' }
]

const MARKET_CATEGORY_ORDER: IntegrationCategory[] = [
  'productivity',
  'communication',
  'ai',
  'desktop',
  'sales'
]

const MARKET_CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  productivity: 'Productivity',
  communication: 'Communication',
  ai: 'AI & Agents',
  desktop: 'Desktop tabs',
  sales: 'Sales & calls'
}


function openOAuthUrl(url: string, statusMessage: string, setStatus: (s: string) => void) {
  if (window.notchDesktop?.openExternal) {
    window.notchDesktop.openExternal(url)
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
  setStatus(statusMessage)
}

function PinIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} aria-hidden>
      <path
        d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function pinnableForItem(itemId: IntegrationId) {
  return pinnableEntryForIntegration(itemId) ?? pinnableEntryById(itemId)
}

function canPinItem(
  itemId: IntegrationId,
  connected: boolean,
  desktop: boolean
): boolean {
  if (!desktop) return false
  const entry = pinnableForItem(itemId)
  if (!entry) return false
  if (!entry.integrationId) return true
  return connected
}

export function IntegrationsPanel({
  navApps,
  onOpenNavApp,
  onPinNavApp,
  onUnpinNavApp,
  onOpenNotes
}: {
  navApps: NavApp[]
  onOpenNavApp?: (id: string) => void
  onPinNavApp?: (id: string) => void
  onUnpinNavApp?: (id: string) => void
  onOpenNotes?: () => void
}) {
  const desktop = isNavAppDesktop()
  const [connections, setConnections] = useState<IntegrationConnections | null>(null)
  const [selected, setSelected] = useState<IntegrationId | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<MarketCategoryFilter>('all')
  const [status, setStatus] = useState('')
  const [xToken, setXToken] = useState('')
  const [mondayToken, setMondayToken] = useState('')
  const [discordToken, setDiscordToken] = useState('')
  const [discordChannels, setDiscordChannels] = useState('')
  const [perplexityKey, setPerplexityKey] = useState('')
  const [perplexityEmail, setPerplexityEmail] = useState('')
  const [claudeKey, setClaudeKey] = useState('')
  const [claudeAuthCode, setClaudeAuthCode] = useState('')
  const [claudeLocalAccount, setClaudeLocalAccount] = useState<{
    label: string
    subscriptionType?: string
  } | null>(null)
  const [showClaudeApiKey, setShowClaudeApiKey] = useState(false)
  const [geminiKey, setGeminiKey] = useState('')
  const [cursorKey, setCursorKey] = useState('')
  const [cursorRepo, setCursorRepo] = useState('')
  const [githubPat, setGithubPat] = useState('')
  const [githubRepo, setGithubRepo] = useState('')
  const [gongKey, setGongKey] = useState('')
  const [gongSecret, setGongSecret] = useState('')
  const [calcomKey, setCalcomKey] = useState('')
  const [calcomUsername, setCalcomUsername] = useState('')
  const [calcomEventTypeId, setCalcomEventTypeId] = useState('')
  const [calendars, setCalendars] = useState<GoogleCalendarOption[]>([])
  const [calendarsLoading, setCalendarsLoading] = useState(false)
  const [calendarsError, setCalendarsError] = useState<string | null>(null)
  const [gmailAccounts, setGmailAccounts] = useState<GmailAccount[]>([])
  const [gmailAccountsLoading, setGmailAccountsLoading] = useState(false)
  const [mondayAccount, setMondayAccount] = useState<MondayAccount | null>(null)
  const [mondayCreateTarget, setMondayCreateTarget] = useState<{
    boardName: string
    groupTitle?: string
  } | null>(null)
  const [mcpAgentCount, setMcpAgentCount] = useState(0)
  const [contactsCount, setContactsCount] = useState(0)
  const [contactsSyncedAt, setContactsSyncedAt] = useState<number | null>(null)
  const [contactsError, setContactsError] = useState<string | null>(null)
  const [contactsSyncing, setContactsSyncing] = useState(false)
  const [obsidianVault, setObsidianVault] = useState('')
  const [obsidianNotePath, setObsidianNotePath] = useState('Daily Notes/{{date}}.md')
  const [obsidianProfileId, setObsidianProfileId] = useState('personal')
  const [obsidianSaving, setObsidianSaving] = useState(false)

  const loadMcpAgents = useCallback(async () => {
    try {
      const data = await clusterApi.mcpAgents()
      setMcpAgentCount(data.agents.length)
    } catch {
      setMcpAgentCount(0)
    }
  }, [])

  const refreshConnections = useCallback(async () => {
    try {
      const data = await integrationApi.connections()
      setConnections(data)
      return data
    } catch (err) {
      setConnections((prev) =>
        prev ?? {
          connections: {},
          configured: {},
          connected: {},
          onboardingComplete: false
        }
      )
      throw err
    }
  }, [])

  const loadMondayAccount = useCallback(async () => {
    try {
      const data = await clusterApi.mondayAccount()
      setMondayAccount(data.account)
    } catch {
      setMondayAccount(null)
    }
  }, [])

  const loadMondayCreateTarget = useCallback(async () => {
    try {
      const data = await clusterApi.mondayCreateTarget()
      if (data.connected && data.target) {
        setMondayCreateTarget({
          boardName: data.target.boardName,
          groupTitle: data.target.groupTitle
        })
      } else {
        setMondayCreateTarget(null)
      }
    } catch {
      setMondayCreateTarget(null)
    }
  }, [])

  const loadGmailAccounts = useCallback(async () => {
    setGmailAccountsLoading(true)
    try {
      const data = await clusterApi.gmailAccounts()
      setGmailAccounts(data.accounts ?? [])
    } catch {
      setGmailAccounts([])
    } finally {
      setGmailAccountsLoading(false)
    }
  }, [])

  const loadContacts = useCallback(async () => {
    try {
      const state = await contactsApi.state()
      setContactsCount(state.contacts.length)
      setContactsSyncedAt(state.syncedAt)
      setContactsError(state.error ?? connections?.syncErrors?.contacts ?? null)
    } catch {
      setContactsCount(0)
      setContactsSyncedAt(null)
      setContactsError(connections?.syncErrors?.contacts ?? null)
    }
  }, [connections?.syncErrors?.contacts])

  const loadCalendars = useCallback(async (refresh = false) => {
    setCalendarsLoading(true)
    setCalendarsError(null)
    try {
      const data = await clusterApi.calendars(refresh)
      setCalendars(data.calendars ?? [])
      if (data.error) setCalendarsError(data.error)
    } catch (err) {
      setCalendars([])
      setCalendarsError(String(err))
    } finally {
      setCalendarsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshConnections().catch((err) => {
      setStatus(`Could not load integrations: ${String(err)}`)
    })
    void loadMcpAgents()
  }, [refreshConnections, loadMcpAgents])

  useEffect(() => {
    if (selected === 'agents') void loadMcpAgents()
  }, [selected, loadMcpAgents])

  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  useEffect(() => {
    if (selected !== 'claude') return
    void integrationApi
      .claudeAuthUrl()
      .then((data) => setClaudeLocalAccount(data.localAccount ?? null))
      .catch(() => setClaudeLocalAccount(null))
    if (connections?.connected.claude) {
      void integrationApi.refreshClaudeApiKey().catch(() => {})
    }
  }, [selected, connections?.connected.claude])

  useEffect(() => {
    if (selected !== 'obsidian') return
    void captureApi
      .state()
      .then((state) => {
        const profile =
          state.profiles.find((p) => p.id === state.activeProfileId) ?? state.profiles[0]
        if (!profile) return
        setObsidianProfileId(profile.id)
        setObsidianVault(profile.obsidianVaultPath ?? '')
        setObsidianNotePath(profile.obsidianNotePath ?? 'Daily Notes/{{date}}.md')
      })
      .catch(() => undefined)
  }, [selected])

  useEffect(() => {
    void captureApi
      .state()
      .then((state) => {
        const profile =
          state.profiles.find((p) => p.id === state.activeProfileId) ?? state.profiles[0]
        if (!profile) return
        setObsidianProfileId(profile.id)
        setObsidianVault(profile.obsidianVaultPath ?? '')
        setObsidianNotePath(profile.obsidianNotePath ?? 'Daily Notes/{{date}}.md')
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (connections?.connected.gmail) {
      void loadGmailAccounts()
      void loadContacts()
    } else {
      setGmailAccounts([])
      setCalendars([])
      setContactsCount(0)
      setContactsSyncedAt(null)
      setContactsError(null)
    }
    if (connections?.connected.monday) {
      void loadMondayAccount()
      void loadMondayCreateTarget()
    } else {
      setMondayAccount(null)
      setMondayCreateTarget(null)
    }
  }, [
    connections?.connected.gmail,
    connections?.connected.monday,
    loadContacts,
    loadGmailAccounts,
    loadMondayAccount,
    loadMondayCreateTarget
  ])

  const feedIntegrationTotal = INTEGRATIONS.filter((i) => i.id !== 'youtube' && i.id !== 'linkedin').length

  const connectedCount = useMemo(() => {
    if (!connections) return 0
    return INTEGRATIONS.filter((i) => {
      if (i.id === 'youtube' || i.id === 'linkedin') return false
      if (i.id === 'agents') return mcpAgentCount > 0
      return connections.connected[i.id]
    }).length
  }, [connections, mcpAgentCount])

  const gmailRateLimited =
    connections?.syncErrors?.gmail?.toLowerCase().includes('rate limit') ?? false

  const isIntegrationConnected = useCallback(
    (id: IntegrationId): boolean => {
      if (id === 'youtube' || id === 'linkedin') return false
      if (id === 'agents') return mcpAgentCount > 0
      return connections?.connected[id] ?? false
    },
    [connections, mcpAgentCount]
  )

  const filteredIntegrations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return INTEGRATIONS.filter((item) => {
      if (categoryFilter === 'connected') {
        if (!isIntegrationConnected(item.id)) return false
      } else if (categoryFilter !== 'all' && item.category !== categoryFilter) {
        return false
      }
      if (!q) return true
      return (
        item.name.toLowerCase().includes(q) ||
        item.tagline.toLowerCase().includes(q)
      )
    })
  }, [searchQuery, categoryFilter, isIntegrationConnected])

  const connectedApps = useMemo(
    () => INTEGRATIONS.filter((item) => isIntegrationConnected(item.id)),
    [isIntegrationConnected]
  )

  const showGroupedCatalog =
    categoryFilter === 'all' && !searchQuery.trim() && filteredIntegrations.length > 0

  const groupedCatalog = useMemo(() => {
    if (!showGroupedCatalog) return null
    return MARKET_CATEGORY_ORDER.map((category) => ({
      category,
      label: MARKET_CATEGORY_LABELS[category],
      items: filteredIntegrations.filter((item) => item.category === category)
    })).filter((group) => group.items.length > 0)
  }, [showGroupedCatalog, filteredIntegrations])

  const syncContacts = useCallback(async () => {
    if (gmailRateLimited) {
      setStatus(connections?.syncErrors?.gmail ?? 'Google API rate limit — wait before syncing contacts.')
      return
    }
    setContactsSyncing(true)
    try {
      const state = await contactsApi.sync()
      setContactsCount(state.contacts.length)
      setContactsSyncedAt(state.syncedAt)
      setContactsError(state.error ?? null)
      setStatus(
        state.error
          ? `Contacts sync failed: ${state.error}`
          : state.contacts.length === 0
            ? state.hint ??
              'Synced 0 contacts — disconnect Gmail, reconnect once (grants Other Contacts), then sync again.'
            : `Synced ${state.contacts.length} contacts (${state.savedCount ?? 0} saved, ${state.otherCount ?? 0} from Gmail history) for @mention.`
      )
      window.dispatchEvent(new CustomEvent('notch:contacts-updated'))
      await refreshConnections()
    } catch (err) {
      const msg = String(err)
      setContactsError(msg)
      setStatus(`Contacts sync failed: ${msg}`)
    } finally {
      setContactsSyncing(false)
    }
  }, [connections?.syncErrors?.gmail, gmailRateLimited, refreshConnections])

  const disconnectGmail = async () => {
    try {
      await integrationApi.gmailDisconnect()
      setGmailAccounts([])
      setCalendars([])
      setStatus('Gmail disconnected.')
      await refreshConnections()
    } catch (err) {
      setStatus(`Gmail disconnect failed: ${String(err)}`)
    }
  }

  const connectGmail = async (addAccount: boolean) => {
    if (gmailRateLimited) {
      setStatus(connections?.syncErrors?.gmail ?? 'Google API rate limit — wait before reconnecting.')
      return
    }
    try {
      const { url, simulated } = await integrationApi.gmailAuthUrl(addAccount)
      if (simulated) {
        setStatus('Gmail connected in simulation mode.')
        await refreshConnections()
        return
      }
      if (!url) {
        setStatus('Gmail connect did not return an auth URL.')
        return
      }
      if (window.notchDesktop?.openExternal) {
        window.notchDesktop.openExternal(url)
      } else if (window.notchDesktop?.openAuthWindow) {
        await window.notchDesktop.openAuthWindow({
          partition: GOOGLE_BROWSE_PARTITION,
          url,
          title: addAccount ? 'Add Gmail account' : 'Connect Gmail'
        })
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
      setStatus(
        addAccount
          ? 'Complete sign-in in Chrome, then return to Notch. Google blocks in-app sign-in.'
          : 'Complete Gmail sign-in in Chrome, then return to Notch. Use Open in Chrome for Docs and YouTube tabs.'
      )
    } catch (err) {
      setStatus(`Gmail connect failed: ${String(err)}`)
    }
  }

  const patchGmailAccount = async (
    accountId: string,
    patch: { feedEnabled?: boolean; calendarEnabled?: boolean }
  ) => {
    try {
      const res = await clusterApi.updateGmailAccount(accountId, patch)
      setGmailAccounts(res.accounts)
      await loadCalendars()
      window.dispatchEvent(new CustomEvent('notch:calendars-updated'))
      setStatus('Gmail account updated.')
    } catch (err) {
      setStatus(`Account update failed: ${String(err)}`)
      await loadGmailAccounts()
    }
  }

  const removeAccount = async (accountId: string) => {
    try {
      const res = await clusterApi.removeGmailAccount(accountId)
      setGmailAccounts(res.accounts)
      await refreshConnections()
      await loadCalendars()
      setStatus('Gmail account removed.')
    } catch (err) {
      setStatus(`Remove account failed: ${String(err)}`)
    }
  }

  const syncAll = async () => {
    try {
      const result = await integrationApi.syncAll()
      const googleNote =
        result.googleBlocked && result.googleBlockedUntil
          ? ` Google rate limit active until ${new Date(result.googleBlockedUntil).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} — Gmail/Docs skipped.`
          : ''
      setStatus(
        `Synced — Gmail ${result.gmail ?? 0}, GitHub ${result.github ?? 0}, Docs ${result.gdocs ?? 0}, Gong ${result.gong ?? 0}, X ${result.x ?? 0}, Monday ${result.monday ?? 0}.${googleNote}`
      )
      await refreshConnections()
      await loadGmailAccounts()
      await loadContacts()
      await loadMondayAccount()
      await loadMondayCreateTarget()
      await loadCalendars()
      window.dispatchEvent(new CustomEvent('notch:contacts-updated'))
    } catch (err) {
      setStatus(`Sync failed: ${String(err)}`)
    }
  }

  const toggleCalendar = async (id: string, enabled: boolean) => {
    const next = calendars.map((cal) => (cal.id === id ? { ...cal, enabled } : cal))
    const enabledIds = next.filter((cal) => cal.enabled).map((cal) => cal.id)
    if (enabledIds.length === 0) {
      setStatus('Keep at least one calendar enabled.')
      return
    }
    setCalendars(next)
    try {
      const res = await clusterApi.saveCalendars(enabledIds)
      setCalendars(res.calendars)
      setStatus('Calendar selection saved.')
      window.dispatchEvent(new CustomEvent('notch:calendars-updated'))
    } catch (err) {
      setStatus(`Calendar update failed: ${String(err)}`)
      await loadCalendars()
    }
  }

  const renderDetail = () => {
    if (selected === 'youtube') {
      const pinned = isNavAppPinned('youtube', navApps)
      return (
        <div className="x-int-detail">
          <div className="x-int-detail-head">
            <div>
              <h3>YouTube</h3>
              <p>Opens in an in-app tab with the context rail, like Monday.</p>
            </div>
            {desktop ? (
              <button
                type="button"
                className="x-int-btn"
                onClick={() => onOpenNavApp?.('youtube')}
              >
                Open
              </button>
            ) : null}
          </div>
          {desktop ? (
            <p className="x-int-muted">
              {pinned ? 'Pinned to sidebar.' : 'Use the pin icon on the card to add YouTube to the sidebar.'}
            </p>
          ) : null}
        </div>
      )
    }

    if (selected === 'linkedin') {
      const pinned = isNavAppPinned('linkedin', navApps)
      return (
        <div className="x-int-detail">
          <div className="x-int-detail-head">
            <div>
              <h3>LinkedIn</h3>
              <p>Feed, messages, and notifications in an in-app tab — sign in once in Notch to stay logged in.</p>
            </div>
            {desktop ? (
              <button
                type="button"
                className="x-int-btn"
                onClick={() => onOpenNavApp?.('linkedin')}
              >
                Open
              </button>
            ) : null}
          </div>
          {desktop ? (
            <p className="x-int-muted">
              {pinned ? 'Pinned to sidebar.' : 'Pin LinkedIn from the card to open it beside Home and Feed.'}
            </p>
          ) : null}
        </div>
      )
    }

    if (selected === 'slack') {
      const connectSlackOAuth = async () => {
        try {
          const { url } = await integrationApi.slackAuthUrl()
          openOAuthUrl(url, 'Complete Slack sign-in in your browser, then return here.', setStatus)
        } catch (err) {
          setStatus(`Slack OAuth failed: ${String(err)}`)
        }
      }

      return (
        <div className="x-int-detail">
          <div className="x-int-detail-head">
            <div>
              <h3>Slack</h3>
              <p>Connect your workspace with OAuth — channel messages sync into the feed.</p>
            </div>
            <button type="button" className="x-int-btn" onClick={() => void connectSlackOAuth()}>
              {connections?.connected.slack ? 'Reconnect Slack' : 'Connect with Slack'}
            </button>
          </div>
          <p className="x-int-muted">
            Requires <code>SLACK_CLIENT_ID</code> / <code>SLACK_CLIENT_SECRET</code> in{' '}
            <code>.env.local</code>.
          </p>
          {connections?.connected.slack ? (
            <div className="x-int-block">
              <button
                type="button"
                className="x-int-btn x-int-btn-ghost"
                onClick={async () => {
                  try {
                    const res = await integrationApi.syncSource('slack')
                    setStatus(`Synced ${res.count} Slack messages.`)
                  } catch (err) {
                    setStatus(`Slack sync failed: ${String(err)}`)
                  }
                }}
              >
                Sync now
              </button>
            </div>
          ) : null}
        </div>
      )
    }

    if (selected === 'gmail') {
      return (
        <div className="x-int-detail">
          <div className="x-int-detail-head">
            <div>
              <h3>Gmail & Calendar</h3>
              <p>OAuth connects inbox and Google Calendar. Add multiple accounts and choose what syncs.</p>
            </div>
            <div className="x-int-detail-actions">
              <button
                type="button"
                className="x-int-btn"
                disabled={gmailRateLimited}
                onClick={() => void connectGmail(false)}
              >
                {connections?.connected.gmail ? 'Reconnect' : 'Connect'}
              </button>
              {connections?.connected.gmail ? (
                <>
                  <button
                    type="button"
                    className="x-int-btn x-int-btn-ghost"
                    disabled={gmailRateLimited}
                    onClick={() => void connectGmail(true)}
                  >
                    Add account
                  </button>
                  <button type="button" className="x-int-btn x-int-btn-ghost" onClick={() => void disconnectGmail()}>
                    Disconnect
                  </button>
                </>
              ) : null}
            </div>
          </div>

          {connections?.syncErrors?.gmail ? (
            <p className="x-int-alert">
              {connections.syncErrors.gmail}
              {connections.googleApi?.blocked && connections.googleApi.blockedUntil ? (
                <span className="x-int-muted">
                  {' '}
                  (Google says wait until{' '}
                  {new Date(connections.googleApi.blockedUntil).toLocaleTimeString(undefined, {
                    hour: 'numeric',
                    minute: '2-digit'
                  })}
                  )
                </span>
              ) : null}
              {connections.googleApiEnable?.gmail ? (
                <>
                  {' '}
                  <button
                    type="button"
                    className="x-settings-link"
                    onClick={() => window.notchDesktop?.openExternal?.(connections.googleApiEnable!.gmail!)}
                  >
                    Enable Gmail API
                  </button>
                </>
              ) : null}
            </p>
          ) : null}
          {connections?.syncErrors?.calendar ? (
            <p className="x-int-alert">
              {connections.syncErrors.calendar}
              {connections.googleApiEnable?.calendar ? (
                <>
                  {' '}
                  <button
                    type="button"
                    className="x-settings-link"
                    onClick={() => window.notchDesktop?.openExternal?.(connections.googleApiEnable!.calendar!)}
                  >
                    Enable Calendar API
                  </button>
                </>
              ) : null}
            </p>
          ) : null}
          {connections?.syncErrors?.gdocs ? (
            <p className="x-int-alert">
              {connections.syncErrors.gdocs}
              {connections.googleApiEnable?.gdocsDrive ? (
                <>
                  {' '}
                  <button
                    type="button"
                    className="x-settings-link"
                    onClick={() =>
                      window.notchDesktop?.openExternal?.(connections.googleApiEnable!.gdocsDrive!)
                    }
                  >
                    Enable Drive API
                  </button>
                </>
              ) : null}
              {connections.googleApiEnable?.gdocsDocs ? (
                <>
                  {' '}
                  <button
                    type="button"
                    className="x-settings-link"
                    onClick={() =>
                      window.notchDesktop?.openExternal?.(connections.googleApiEnable!.gdocsDocs!)
                    }
                  >
                    Enable Docs API
                  </button>
                </>
              ) : null}
            </p>
          ) : connections?.connected.gdocs &&
            (connections.googleApiEnable?.gdocsDrive || connections.googleApiEnable?.gdocsDocs) ? (
            <p className="x-int-muted">
              First-time setup: enable{' '}
              {connections.googleApiEnable?.gdocsDocs ? (
                <button
                  type="button"
                  className="x-settings-link"
                  onClick={() =>
                    window.notchDesktop?.openExternal?.(connections.googleApiEnable!.gdocsDocs!)
                  }
                >
                  Google Docs API
                </button>
              ) : null}
              {connections.googleApiEnable?.gdocsDrive && connections.googleApiEnable?.gdocsDocs
                ? ' and '
                : null}
              {connections.googleApiEnable?.gdocsDrive ? (
                <button
                  type="button"
                  className="x-settings-link"
                  onClick={() =>
                    window.notchDesktop?.openExternal?.(connections.googleApiEnable!.gdocsDrive!)
                  }
                >
                  Google Drive API
                </button>
              ) : null}{' '}
              in your GCP OAuth project, then reconnect Gmail.
            </p>
          ) : null}

          {connections?.connected.gmail ? (
            <>
              <div className="x-int-block">
                <h4>Accounts</h4>
                {gmailAccountsLoading ? (
                  <p className="x-int-muted">Loading accounts…</p>
                ) : gmailAccounts.length === 0 ? (
                  <p className="x-int-muted">No accounts yet.</p>
                ) : (
                  <ul className="x-int-account-list">
                    {gmailAccounts.map((account) => (
                      <li key={account.id} className="x-int-account">
                        <div className="x-int-account-top">
                          <strong>{account.email}</strong>
                          <button type="button" className="x-int-link" onClick={() => void removeAccount(account.id)}>
                            Remove
                          </button>
                        </div>
                        <div className="x-int-toggles">
                          <label className="x-int-toggle">
                            <input
                              type="checkbox"
                              checked={account.feedEnabled}
                              onChange={(e) =>
                                void patchGmailAccount(account.id, { feedEnabled: e.target.checked })
                              }
                            />
                            <span>Stream inbox</span>
                          </label>
                          <label className="x-int-toggle">
                            <input
                              type="checkbox"
                              checked={account.calendarEnabled}
                              onChange={(e) =>
                                void patchGmailAccount(account.id, { calendarEnabled: e.target.checked })
                              }
                            />
                            <span>Calendar rail</span>
                          </label>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="x-int-block">
                <div className="x-int-block-head">
                  <h4>Inbox feed</h4>
                  <button
                    type="button"
                    className="x-int-link"
                    disabled={gmailRateLimited}
                    onClick={async () => {
                      try {
                        const res = await integrationApi.syncSource('gmail')
                        setStatus(`Gmail inbox synced (${res.count} threads).`)
                        await refreshConnections()
                      } catch (err) {
                        setStatus(`Gmail sync failed: ${String(err)}`)
                      }
                    }}
                  >
                    Sync inbox
                  </button>
                </div>
                <p className="x-int-muted">
                  Sync one service at a time while Google rate limits are active — do not use Sync all for Gmail.
                </p>
              </div>

              <div className="x-int-block">
                <div className="x-int-block-head">
                  <h4>Contacts for @mention</h4>
                  <button
                    type="button"
                    className="x-int-link"
                    disabled={contactsSyncing || gmailRateLimited}
                    onClick={() => void syncContacts()}
                  >
                    {contactsSyncing ? 'Syncing…' : 'Sync contacts'}
                  </button>
                </div>
                <p className="x-int-muted">
                  {contactsSyncedAt
                    ? `${contactsCount} contact${contactsCount === 1 ? '' : 's'} for @mention — type @martin in compose, pick from the list, then @cal book @martin for July 10 2:30pm PST.`
                    : 'Sync after connecting Gmail. Includes saved contacts + Gmail To: suggestions (reconnect once if empty).'}
                </p>
                {contactsError || connections?.syncErrors?.contacts ? (
                  <p className="x-int-alert">
                    {contactsError ?? connections?.syncErrors?.contacts}
                    {connections?.googleApiEnable?.contacts ? (
                      <>
                        {' '}
                        <button
                          type="button"
                          className="x-settings-link"
                          onClick={() =>
                            window.notchDesktop?.openExternal?.(connections.googleApiEnable!.contacts!)
                          }
                        >
                          Enable People API
                        </button>
                      </>
                    ) : null}
                  </p>
                ) : null}
              </div>

              <div className="x-int-block">
                <div className="x-int-block-head">
                  <h4>Calendars in rail</h4>
                  <button type="button" className="x-int-link" onClick={() => void loadCalendars(true)}>
                    Refresh
                  </button>
                </div>
                {calendarsLoading ? (
                  <p className="x-int-muted">Loading calendars…</p>
                ) : calendarsError ? (
                  <p className="x-int-alert">{calendarsError}</p>
                ) : calendars.length === 0 ? (
                  <p className="x-int-muted">Enable Calendar on at least one account above.</p>
                ) : (
                  <ul className="x-int-cal-list">
                    {calendars.map((cal) => (
                      <li key={cal.id}>
                        <label className="x-int-cal-item">
                          <input
                            type="checkbox"
                            checked={cal.enabled}
                            onChange={(e) => void toggleCalendar(cal.id, e.target.checked)}
                          />
                          <span>
                            {cal.name}
                            {cal.primary ? ' · primary' : ''}
                            {cal.accountEmail ? ` · ${cal.accountEmail}` : ''}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : null}
        </div>
      )
    }

    if (selected === 'agents') {
      return (
        <div className="x-int-detail">
          <div className="x-int-detail-head">
            <div>
              <h3>MCP Agents</h3>
              <p>
                Register MCP servers your agency already runs. Config persists in{' '}
                <code>~/.stream-app/mcp-agents.json</code>.
              </p>
            </div>
          </div>
          <McpAgentsSection />
        </div>
      )
    }

    if (selected === 'monday') {
      return (
        <div className="x-int-detail">
          <div className="x-int-detail-head">
            <div>
              <h3>Monday.com</h3>
              <p>Paste your API token to stream board updates and threaded item activity.</p>
            </div>
          </div>

          {connections?.connected.monday && mondayAccount ? (
            <div className="x-int-block x-int-block-first">
              <h4>Connected account</h4>
              <div className="x-int-account">
                <div className="x-int-account-top">
                  <strong>{mondayAccount.name || mondayAccount.email || 'Monday user'}</strong>
                </div>
                {mondayAccount.email ? (
                  <p className="x-int-muted">{mondayAccount.email}</p>
                ) : null}
                <p className="x-int-muted">User ID {mondayAccount.id}</p>
              </div>
            </div>
          ) : null}

          {connections?.connected.monday && mondayCreateTarget ? (
            <div className="x-int-block">
              <h4>Feed task creation</h4>
              <p className="x-int-muted">
                <code>@monday: your request</code> uses Gemini (if connected) to match board +
                section, then creates the item. Example:{' '}
                <code>@monday: Add to new ideas — Phase 1 sim testing…</code>
                {' · '}
                Default board: <strong>{mondayCreateTarget.boardName}</strong>
                {mondayCreateTarget.groupTitle ? (
                  <>
                    {' '}
                    in <strong>{mondayCreateTarget.groupTitle}</strong>
                  </>
                ) : null}
                .
              </p>
            </div>
          ) : null}

          <div className="x-int-block x-int-block-first">
            <h4>{connections?.connected.monday ? 'Update token' : 'Connect'}</h4>
            <p className="x-int-muted">
              Monday OAuth is not wired yet — paste an API token from your Monday developer settings.
            </p>
            <p className="x-int-muted">
              Use a token with <strong>boards:write</strong> and <strong>updates:write</strong>{' '}
              scopes so meeting approve and <code>@monday</code> compose can create tasks. Read-only
              tokens sync the feed but cannot create items.
            </p>
            <div className="x-int-token-row">
              <input
                className="x-int-input"
                value={mondayToken}
                onChange={(e) => setMondayToken(e.target.value)}
                placeholder="Monday API token"
                type="password"
                autoComplete="off"
              />
              <button
                type="button"
                className="x-int-btn"
                disabled={!mondayToken.trim()}
                onClick={async () => {
                  try {
                    const result = await integrationApi.connectMondayToken(mondayToken.trim())
                    setMondayToken('')
                    setStatus(
                      result.warning ??
                        (result.writeAccess === false
                          ? 'Monday connected (read-only) — regenerate token with write scopes to create tasks.'
                          : 'Monday connected and synced.')
                    )
                    setConnections((prev) =>
                      prev
                        ? {
                            ...prev,
                            connected: { ...prev.connected, monday: true }
                          }
                        : prev
                    )
                    try {
                      await refreshConnections()
                    } catch (refreshErr) {
                      const msg = String(refreshErr).replace(/^Error:\s*/i, '')
                      setStatus(
                        msg.includes('invalid_grant')
                          ? 'Monday connected — Gmail token expired; reconnect Gmail separately when ready.'
                          : `Monday connected, but status refresh failed: ${msg}`
                      )
                    }
                    await loadMondayAccount()
                    await loadMondayCreateTarget()
                  } catch (err) {
                    setStatus(`Monday connect failed: ${String(err)}`)
                  }
                }}
              >
                {connections?.connected.monday ? 'Update token' : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      )
    }

    if (selected === 'github') {
      return (
        <div className="x-int-detail">
          <div className="x-int-detail-head">
            <div>
              <h3>GitHub</h3>
              <p>PAT syncs open issues. Compose to create issues or comment on threads.</p>
            </div>
          </div>
          <div className="x-int-block x-int-block-first">
            <h4>{connections?.connected.github ? 'Update token' : 'Connect'}</h4>
            <p className="x-int-muted">
              GitHub app OAuth is not wired yet — use a fine-grained PAT with repo scope for now.
            </p>
            <div className="x-int-token-stack">
              <input
                className="x-int-input"
                value={githubPat}
                onChange={(e) => setGithubPat(e.target.value)}
                placeholder="GitHub personal access token"
                type="password"
                autoComplete="off"
              />
              <input
                className="x-int-input"
                value={githubRepo}
                onChange={(e) => setGithubRepo(e.target.value)}
                placeholder="Default repo (owner/name) — optional"
              />
              <button
                type="button"
                className="x-int-btn x-int-btn-wide"
                disabled={!githubPat.trim()}
                onClick={async () => {
                  try {
                    await integrationApi.connectGithub(
                      githubPat.trim(),
                      githubRepo.trim() || undefined
                    )
                    setGithubPat('')
                    setStatus('GitHub connected and synced.')
                    await refreshConnections()
                  } catch (err) {
                    setStatus(`GitHub connect failed: ${String(err)}`)
                  }
                }}
              >
                {connections?.connected.github ? 'Update & sync' : 'Connect'}
              </button>
            </div>
            <p className="x-int-muted">
              <code>@github org/repo: Fix retries / details…</code> ·{' '}
              <code>@github #42 comment: shipped</code>
            </p>
          </div>
        </div>
      )
    }

    if (selected === 'gdocs') {
      return (
        <div className="x-int-detail">
          <div className="x-int-detail-head">
            <div>
              <h3>Google Docs</h3>
              <p>Uses your Gmail OAuth — reconnect Gmail to grant Docs & Drive scope.</p>
            </div>
            <div className="x-int-detail-actions">
              <button type="button" className="x-int-btn" onClick={() => void connectGmail(false)}>
                {connections?.connected.gdocs ? 'Reconnect Gmail' : 'Connect via Gmail'}
              </button>
            </div>
          </div>
          <div className="x-int-block x-int-block-first">
            <p className="x-int-muted">
              Recent docs sync into the feed. Compose:{' '}
              <code>@gdocs create: Q2 notes / Agenda…</code> or{' '}
              <code>@gdocs #DOC_ID append: action items</code>
            </p>
            {connections?.connected.gdocs ? (
              <button
                type="button"
                className="x-int-btn x-int-btn-ghost"
                onClick={async () => {
                  try {
                    const res = await integrationApi.syncSource('gdocs')
                    setStatus(`Google Docs synced (${res.count} items).`)
                    void refreshConnections()
                  } catch (err) {
                    setStatus(`Docs sync failed: ${String(err)}`)
                  }
                }}
              >
                Sync docs now
              </button>
            ) : null}
            {connections?.syncErrors?.gdocs ? (
              <p className="x-int-alert">
                {connections.syncErrors.gdocs}
                {connections.googleApiEnable?.gdocsDrive ? (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="x-settings-link"
                      onClick={() =>
                        window.notchDesktop?.openExternal?.(connections.googleApiEnable!.gdocsDrive!)
                      }
                    >
                      Enable Drive API
                    </button>
                  </>
                ) : null}
                {connections.googleApiEnable?.gdocsDocs ? (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="x-settings-link"
                      onClick={() =>
                        window.notchDesktop?.openExternal?.(connections.googleApiEnable!.gdocsDocs!)
                      }
                    >
                      Enable Docs API
                    </button>
                  </>
                ) : null}
              </p>
            ) : connections?.googleApiEnable?.gdocsDrive || connections?.googleApiEnable?.gdocsDocs ? (
              <p className="x-int-muted">
                Enable{' '}
                {connections.googleApiEnable?.gdocsDocs ? (
                  <button
                    type="button"
                    className="x-settings-link"
                    onClick={() =>
                      window.notchDesktop?.openExternal?.(connections.googleApiEnable!.gdocsDocs!)
                    }
                  >
                    Docs API
                  </button>
                ) : null}
                {connections.googleApiEnable?.gdocsDrive && connections.googleApiEnable?.gdocsDocs
                  ? ' + '
                  : null}
                {connections.googleApiEnable?.gdocsDrive ? (
                  <button
                    type="button"
                    className="x-settings-link"
                    onClick={() =>
                      window.notchDesktop?.openExternal?.(connections.googleApiEnable!.gdocsDrive!)
                    }
                  >
                    Drive API
                  </button>
                ) : null}{' '}
                in GCP project {connections.googleApiEnable?.gdocsDrive?.match(/project=(\d+)/)?.[1] ?? 'from your OAuth client'}.
              </p>
            ) : null}
          </div>
        </div>
      )
    }

    if (selected === 'obsidian') {
      return (
        <div className="x-int-detail">
          <div className="x-int-detail-head">
            <div>
              <h3>Obsidian</h3>
              <p>
                Append markdown to your local vault — no OAuth. Notch writes files directly (same as
                the Notes page).
              </p>
            </div>
            {onOpenNotes ? (
              <button type="button" className="x-int-btn x-int-btn-ghost" onClick={onOpenNotes}>
                Open Notes
              </button>
            ) : null}
          </div>
          <div className="x-int-block x-int-block-first">
            <p className="x-int-muted">
              Compose: <code>@obsidian append: standup notes</code> or{' '}
              <code>@obsidian Work/inbox.md append: follow-up</code>
            </p>
            <h4>Vault (active profile)</h4>
            <div className="x-int-token-stack">
              <input
                className="x-int-input"
                value={obsidianVault}
                onChange={(e) => setObsidianVault(e.target.value)}
                placeholder="/Users/you/Obsidian/Personal"
                autoComplete="off"
              />
              <input
                className="x-int-input"
                value={obsidianNotePath}
                onChange={(e) => setObsidianNotePath(e.target.value)}
                placeholder="Daily Notes/{{date}}.md"
                autoComplete="off"
              />
              <button
                type="button"
                className="x-int-btn x-int-btn-wide"
                disabled={obsidianSaving || !obsidianVault.trim() || !obsidianNotePath.trim()}
                onClick={async () => {
                  setObsidianSaving(true)
                  try {
                    const state = await captureApi.state()
                    const profiles = state.profiles.map((p) =>
                      p.id === obsidianProfileId
                        ? {
                            ...p,
                            obsidianVaultPath: obsidianVault.trim(),
                            obsidianNotePath: obsidianNotePath.trim()
                          }
                        : p
                    )
                    await captureApi.saveState({ profiles, activeProfileId: state.activeProfileId })
                    setStatus('Obsidian vault saved.')
                    await refreshConnections()
                  } catch (err) {
                    setStatus(`Obsidian save failed: ${String(err)}`)
                  } finally {
                    setObsidianSaving(false)
                  }
                }}
              >
                {connections?.connected.obsidian ? 'Update vault' : 'Connect vault'}
              </button>
            </div>
            <p className="x-int-muted">
              Use <code>{'{{date}}'}</code> in the note path for daily notes. Personal vs business
              profiles are configured on the Notes page.
            </p>
          </div>
        </div>
      )
    }

    if (selected === 'gong') {
      return (
        <div className="x-int-detail">
          <div className="x-int-detail-head">
            <div>
              <h3>Gong</h3>
              <p>Sync recent calls and add notes from compose.</p>
            </div>
          </div>
          <div className="x-int-block x-int-block-first">
            <h4>{connections?.connected.gong ? 'Update credentials' : 'Connect'}</h4>
            <div className="x-int-token-stack">
              <input
                className="x-int-input"
                value={gongKey}
                onChange={(e) => setGongKey(e.target.value)}
                placeholder="Gong access key"
                type="password"
                autoComplete="off"
              />
              <input
                className="x-int-input"
                value={gongSecret}
                onChange={(e) => setGongSecret(e.target.value)}
                placeholder="Gong access secret"
                type="password"
                autoComplete="off"
              />
              <button
                type="button"
                className="x-int-btn x-int-btn-wide"
                disabled={!gongKey.trim() || !gongSecret.trim()}
                onClick={async () => {
                  try {
                    await integrationApi.connectGong(gongKey.trim(), gongSecret.trim())
                    setGongKey('')
                    setGongSecret('')
                    setStatus('Gong connected and synced.')
                    await refreshConnections()
                  } catch (err) {
                    setStatus(`Gong connect failed: ${String(err)}`)
                  }
                }}
              >
                {connections?.connected.gong ? 'Update & sync' : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      )
    }

    const apiKeyPanel = (
      id: IntegrationId,
      title: string,
      blurb: string,
      value: string,
      onChange: (v: string) => void,
      placeholder: string,
      connect: (key: string) => Promise<unknown>,
      extra?: ReactNode
    ) => (
      <div className="x-int-detail">
        <div className="x-int-detail-head">
          <div>
            <h3>{title}</h3>
            <p>{blurb}</p>
          </div>
        </div>
        <div className="x-int-block x-int-block-first">
          <h4>{connections?.connected[id] ? 'Update API key' : 'Connect'}</h4>
          <div className="x-int-token-row">
            <input
              className="x-int-input"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              type="password"
              autoComplete="off"
            />
            <button
              type="button"
              className="x-int-btn"
              disabled={!value.trim()}
              onClick={async () => {
                try {
                  await connect(value.trim())
                  onChange('')
                  setStatus(`${title} connected.`)
                  await refreshConnections()
                } catch (err) {
                  setStatus(`${title} connect failed: ${String(err)}`)
                }
              }}
            >
              {connections?.connected[id] ? 'Update' : 'Connect'}
            </button>
          </div>
          {extra}
        </div>
      </div>
    )

    if (selected === 'perplexity') {
      return (
        <div className="x-int-detail">
          <div className="x-int-detail-head">
            <div>
              <h3>Perplexity</h3>
              <p>
                Sign in with your Perplexity account (email or Google), generate an API key,
                and we stream news into the calendar rail + feed.
              </p>
            </div>
            <div className="x-int-detail-actions">
              <button
                type="button"
                className="x-int-btn"
                onClick={() => {
                  const url = 'https://www.perplexity.ai/auth/signin'
                  if (window.notchDesktop?.openExternal) {
                    window.notchDesktop.openExternal(url)
                  } else {
                    window.open(url, '_blank', 'noopener,noreferrer')
                  }
                  setStatus('Sign in, then open API settings to copy your key.')
                }}
              >
                Sign in with Perplexity
              </button>
              <button
                type="button"
                className="x-int-btn x-int-btn-ghost"
                onClick={() => {
                  const url = 'https://www.perplexity.ai/settings/api'
                  if (window.notchDesktop?.openExternal) {
                    window.notchDesktop.openExternal(url)
                  } else {
                    window.open(url, '_blank', 'noopener,noreferrer')
                  }
                }}
              >
                API settings
              </button>
            </div>
          </div>

          {connections?.connected.perplexity ? (
            <div className="x-int-block x-int-block-first">
              <h4>Connected</h4>
              <p className="x-int-muted">Headlines sync under Calendar · @perplexity ask in feed</p>
              <button
                type="button"
                className="x-int-btn x-int-btn-ghost"
                onClick={async () => {
                  try {
                    const res = await integrationApi.syncSource('perplexity')
                    setStatus(`Synced ${res.count} Perplexity news items.`)
                    window.dispatchEvent(new CustomEvent('notch:calendars-updated'))
                  } catch (err) {
                    setStatus(`Sync failed: ${String(err)}`)
                  }
                }}
              >
                Sync news now
              </button>
            </div>
          ) : null}

          <div className="x-int-block x-int-block-first">
            <h4>{connections?.connected.perplexity ? 'Update API key' : 'Connect account'}</h4>
            <div className="x-int-token-stack">
              <input
                className="x-int-input"
                value={perplexityEmail}
                onChange={(e) => setPerplexityEmail(e.target.value)}
                placeholder="Your Perplexity email (optional)"
                autoComplete="email"
              />
              <input
                className="x-int-input"
                value={perplexityKey}
                onChange={(e) => setPerplexityKey(e.target.value)}
                placeholder="API key from perplexity.ai/settings/api"
                type="password"
                autoComplete="off"
              />
              <button
                type="button"
                className="x-int-btn x-int-btn-wide"
                disabled={!perplexityKey.trim()}
                onClick={async () => {
                  try {
                    const res = await integrationApi.connectPerplexity(
                      perplexityKey.trim(),
                      perplexityEmail.trim() || undefined
                    )
                    setPerplexityKey('')
                    setStatus(
                      `Perplexity connected${res.accountLabel ? ` (${res.accountLabel})` : ''} — synced ${res.count} headlines.`
                    )
                    await refreshConnections()
                    window.dispatchEvent(new CustomEvent('notch:calendars-updated'))
                  } catch (err) {
                    setStatus(`Perplexity connect failed: ${String(err)}`)
                  }
                }}
              >
                {connections?.connected.perplexity ? 'Update & sync' : 'Connect'}
              </button>
            </div>
            <p className="x-int-muted">
              <code>@perplexity ask: …</code> · News appears under Calendar in the right rail
            </p>
          </div>
        </div>
      )
    }

    if (selected === 'claude') {
      return (
        <div className="x-int-detail">
          <div className="x-int-detail-head">
            <div>
              <h3>Claude Pro</h3>
              <p>
                Sign in with your Claude account (same as claude.ai). We sync Claude Code
                conversations from this Mac and new @claude asks use your Pro subscription.
              </p>
            </div>
            <div className="x-int-detail-actions">
              <button
                type="button"
                className="x-int-btn"
                onClick={async () => {
                  try {
                    const { url } = await integrationApi.claudeAuthUrl()
                    if (window.notchDesktop?.openExternal) {
                      window.notchDesktop.openExternal(url)
                    } else {
                      window.open(url, '_blank', 'noopener,noreferrer')
                    }
                    setStatus('Complete sign-in in your browser, then paste the code below.')
                  } catch (err) {
                    setStatus(`Claude sign-in failed: ${String(err)}`)
                  }
                }}
              >
                {connections?.connected.claude ? 'Reconnect' : 'Sign in with Claude'}
              </button>
            </div>
          </div>

          {connections?.connected.claude ? (
            <div className="x-int-block x-int-block-first">
              <h4>Connected</h4>
              <p className="x-int-muted">Claude Pro account linked · conversations sync into feed</p>
              <div className="x-int-detail-actions">
                <button
                  type="button"
                  className="x-int-btn x-int-btn-ghost"
                  onClick={async () => {
                    try {
                      const res = await integrationApi.syncSource('claude')
                      setStatus(`Synced ${res.count} Claude conversations.`)
                    } catch (err) {
                      setStatus(`Claude sync failed: ${String(err)}`)
                    }
                  }}
                >
                  Sync conversations
                </button>
                <button
                  type="button"
                  className="x-int-btn x-int-btn-ghost"
                  onClick={async () => {
                    try {
                      const res = await integrationApi.refreshClaudeApiKey()
                      setStatus(
                        res.ok
                          ? 'Claude API access refreshed — retry @claude ask in feed.'
                          : 'Could not refresh API key — try Reconnect.'
                      )
                    } catch (err) {
                      setStatus(`Refresh failed: ${String(err)}`)
                    }
                  }}
                >
                  Refresh API access
                </button>
              </div>
            </div>
          ) : null}

          <div className="x-int-block x-int-block-first">
            <h4>Paste authorization code</h4>
            <p className="x-int-muted">
              After browser sign-in, copy the code from the Claude page and paste it here.
            </p>
            <div className="x-int-token-row">
              <input
                className="x-int-input"
                value={claudeAuthCode}
                onChange={(e) => setClaudeAuthCode(e.target.value)}
                placeholder="Paste code from claude.ai sign-in"
                autoComplete="off"
              />
              <button
                type="button"
                className="x-int-btn"
                disabled={!claudeAuthCode.trim()}
                onClick={async () => {
                  try {
                    const res = await integrationApi.connectClaudeCode(claudeAuthCode.trim())
                    setClaudeAuthCode('')
                    setStatus(
                      `Claude connected${res.accountLabel ? ` (${res.accountLabel})` : ''} — synced ${res.count} chats.`
                    )
                    await refreshConnections()
                  } catch (err) {
                    setStatus(`Claude connect failed: ${String(err)}`)
                  }
                }}
              >
                Connect
              </button>
            </div>
          </div>

          {claudeLocalAccount ? (
            <div className="x-int-block">
              <h4>Import from this Mac</h4>
              <p className="x-int-muted">
                Found <strong>{claudeLocalAccount.label}</strong> in Claude Code on this machine.
              </p>
              <button
                type="button"
                className="x-int-btn"
                onClick={async () => {
                  try {
                    const res = await integrationApi.importClaudeLocal()
                    setStatus(
                      `Imported ${claudeLocalAccount.label} — synced ${res.count} conversations.`
                    )
                    await refreshConnections()
                  } catch (err) {
                    setStatus(`Import failed: ${String(err)}`)
                  }
                }}
              >
                Import {claudeLocalAccount.label}
              </button>
            </div>
          ) : (
            <div className="x-int-block">
              <p className="x-int-muted">
                Tip: install{' '}
                <code>claude</code> CLI and run <code>claude login</code> to enable one-click import.
              </p>
            </div>
          )}

          <div className="x-int-block">
            <button
              type="button"
              className="x-settings-link"
              onClick={() => setShowClaudeApiKey((v) => !v)}
            >
              {showClaudeApiKey ? 'Hide API key option' : 'Use API key instead'}
            </button>
            {showClaudeApiKey ? (
              <div className="x-int-token-row" style={{ marginTop: 12 }}>
                <input
                  className="x-int-input"
                  value={claudeKey}
                  onChange={(e) => setClaudeKey(e.target.value)}
                  placeholder="Anthropic API key (pay-as-you-go)"
                  type="password"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="x-int-btn"
                  disabled={!claudeKey.trim()}
                  onClick={async () => {
                    try {
                      await integrationApi.connectClaude(claudeKey.trim())
                      setClaudeKey('')
                      setStatus('Claude API key saved.')
                      await refreshConnections()
                    } catch (err) {
                      setStatus(`Claude connect failed: ${String(err)}`)
                    }
                  }}
                >
                  Save key
                </button>
              </div>
            ) : null}
            <p className="x-int-muted">
              <code>@claude ask: …</code> · <code>@claude draft: …</code>
            </p>
          </div>
        </div>
      )
    }

    if (selected === 'gemini') {
      return apiKeyPanel(
        'gemini',
        'Gemini',
        'Google AI for summaries and quick answers.',
        geminiKey,
        setGeminiKey,
        'Google AI API key',
        integrationApi.connectGemini,
        <p className="x-int-muted">
          <code>@gemini ask: …</code>
        </p>
      )
    }

    if (selected === 'cursor') {
      return (
        <div className="x-int-detail">
          <div className="x-int-detail-head">
            <div>
              <h3>Cursor</h3>
              <p>
                Sign in with your Cursor API key — then run <strong>local</strong> builds on your Mac or{' '}
                <strong>cloud</strong> builds on GitHub from the <strong>Build</strong> page.
              </p>
            </div>
          </div>
          <div className="x-int-block x-int-block-first">
            <h4>API key (required)</h4>
            <p className="x-int-muted">
              Cursor does not offer OAuth for cloud agents. Create a key at{' '}
              <a href="https://cursor.com/settings" target="_blank" rel="noreferrer">
                cursor.com/settings
              </a>
              .
            </p>
            <div className="x-int-token-stack">
              <input
                className="x-int-input"
                value={cursorKey}
                onChange={(e) => setCursorKey(e.target.value)}
                placeholder="Cursor API key"
                type="password"
                autoComplete="off"
              />
              <input
                className="x-int-input"
                value={cursorRepo}
                onChange={(e) => setCursorRepo(e.target.value)}
                placeholder="Cloud repo URL or owner/name (optional — for cloud mode)"
              />
              <button
                type="button"
                className="x-int-btn x-int-btn-wide"
                disabled={!cursorKey.trim()}
                onClick={async () => {
                  try {
                    const result = await integrationApi.connectCursor(cursorKey.trim(), {
                      repo: cursorRepo.trim() || undefined,
                      mode: 'local'
                    })
                    setCursorKey('')
                    setStatus(
                      result.accountEmail
                        ? `Cursor connected as ${result.accountEmail}.`
                        : 'Cursor connected.'
                    )
                    await refreshConnections()
                  } catch (err) {
                    setStatus(`Cursor connect failed: ${String(err)}`)
                  }
                }}
              >
                {connections?.connected.cursor ? 'Update' : 'Connect'}
              </button>
            </div>
            <p className="x-int-muted">
              Local: <code>@cursor local ask: …</code> · Cloud: <code>@cursor ask: …</code>
            </p>
          </div>
        </div>
      )
    }

    if (selected === 'calcom') {
      const connectCalcomOAuth = async () => {
        try {
          const { url } = await integrationApi.calcomAuthUrl()
          openOAuthUrl(url, 'Complete Cal.com sign-in in your browser, then return here and sync.', setStatus)
        } catch (err) {
          setStatus(`Cal.com OAuth failed: ${String(err)}`)
        }
      }

      return (
        <div className="x-int-detail">
          <div className="x-int-detail-head">
            <div>
              <h3>Cal.com</h3>
              <p>Connect with OAuth when available — API key is under Advanced.</p>
            </div>
            <button type="button" className="x-int-btn" onClick={() => void connectCalcomOAuth()}>
              {connections?.connected.calcom ? 'Reconnect Cal.com' : 'Connect with Cal.com'}
            </button>
          </div>
          {connections?.connected.calcom ? (
            <div className="x-int-block x-int-block-first">
              <h4>Sync bookings</h4>
              <p className="x-int-muted">Pull upcoming and recent past bookings into the stream.</p>
              <button
                type="button"
                className="x-int-btn x-int-btn-secondary"
                onClick={async () => {
                  try {
                    const res = await integrationApi.syncSource('calcom')
                    setStatus(`Synced ${res.count} Cal.com booking${res.count === 1 ? '' : 's'}`)
                    window.dispatchEvent(new CustomEvent('notch:calendars-updated'))
                    await refreshConnections()
                  } catch (err) {
                    setStatus(`Cal.com sync failed: ${String(err)}`)
                  }
                }}
              >
                Sync now
              </button>
            </div>
          ) : null}
          <div className="x-int-block">
            <h4>Advanced · API key</h4>
            <p className="x-int-muted">
              Fallback if OAuth is not configured in <code>.env.local</code>.
            </p>
            <div className="x-int-token-stack">
              <input
                className="x-int-input"
                value={calcomKey}
                onChange={(e) => setCalcomKey(e.target.value)}
                placeholder="Cal.com API key (cal_live_…)"
                type="password"
                autoComplete="off"
              />
              <input
                className="x-int-input"
                value={calcomUsername}
                onChange={(e) => setCalcomUsername(e.target.value)}
                placeholder="Cal.com username (optional)"
              />
              <input
                className="x-int-input"
                value={calcomEventTypeId}
                onChange={(e) => setCalcomEventTypeId(e.target.value)}
                placeholder="Event type ID (optional)"
              />
              <button
                type="button"
                className="x-int-btn x-int-btn-wide"
                disabled={!calcomKey.trim()}
                onClick={async () => {
                  try {
                    const res = await integrationApi.connectCalcom(
                      calcomKey.trim(),
                      calcomUsername.trim() || undefined,
                      calcomEventTypeId.trim() || undefined
                    )
                    setCalcomKey('')
                    const label = res.accountLabel ? ` (${res.accountLabel})` : ''
                    setStatus(
                      `Cal.com connected${label} — synced ${res.count} booking${res.count === 1 ? '' : 's'}.`
                    )
                    await refreshConnections()
                  } catch (err) {
                    setStatus(`Cal.com connect failed: ${String(err)}`)
                  }
                }}
              >
                {connections?.connected.calcom ? 'Update API key' : 'Connect with API key'}
              </button>
            </div>
          </div>
        </div>
      )
    }

    if (selected === 'x') {
      const connectXOAuth = async () => {
        try {
          const { url } = await integrationApi.xAuthUrl()
          if (window.notchDesktop?.openExternal) {
            window.notchDesktop.openExternal(url)
          } else {
            window.open(url, '_blank', 'noopener,noreferrer')
          }
          setStatus('Complete X sign-in in your browser, then return here.')
        } catch (err) {
          setStatus(`X OAuth failed: ${String(err)}`)
        }
      }

      return (
        <div className="x-int-detail">
          <div className="x-int-detail-head">
            <div>
              <h3>X</h3>
              <p>Connect with OAuth to sync your timeline into the feed.</p>
            </div>
            <button type="button" className="x-int-btn" onClick={() => void connectXOAuth()}>
              {connections?.connected.x ? 'Reconnect X' : 'Connect X'}
            </button>
          </div>
          <p className="x-int-muted">
            Requires <code>X_CLIENT_ID</code> / <code>X_CLIENT_SECRET</code> in{' '}
            <code>.env.local</code> and callback{' '}
            <code>http://localhost:3131/api/auth/x/callback</code> in the X developer portal.
          </p>
          <div className="x-int-block">
            <h4>Or paste bearer token</h4>
            <p className="x-int-muted">App-only bearer tokens cannot read your home timeline — prefer OAuth above.</p>
            <div className="x-int-token-row">
              <input
                className="x-int-input"
                value={xToken}
                onChange={(e) => setXToken(e.target.value)}
                placeholder="X bearer token"
                type="password"
                autoComplete="off"
              />
              <button
                type="button"
                className="x-int-btn"
                disabled={!xToken.trim()}
                onClick={async () => {
                  try {
                    await integrationApi.connectXToken(xToken.trim())
                    setXToken('')
                    setStatus('X connected and synced.')
                    await refreshConnections()
                  } catch (err) {
                    setStatus(`X connect failed: ${String(err)}`)
                  }
                }}
              >
                Save token
              </button>
            </div>
          </div>
        </div>
      )
    }

    if (selected === 'discord') {
      return (
        <div className="x-int-detail">
          <div className="x-int-detail-head">
            <div>
              <h3>Discord</h3>
              <p>Bot token required for channel ingest — Discord user OAuth is not supported for bots.</p>
            </div>
          </div>
          <div className="x-int-block x-int-block-first">
            <h4>Bot connection</h4>
            <div className="x-int-token-stack">
            <input
              className="x-int-input"
              value={discordToken}
              onChange={(e) => setDiscordToken(e.target.value)}
              placeholder="Discord bot token"
              type="password"
              autoComplete="off"
            />
            <input
              className="x-int-input"
              value={discordChannels}
              onChange={(e) => setDiscordChannels(e.target.value)}
              placeholder="Channel IDs (comma-separated)"
            />
            <button
              type="button"
              className="x-int-btn x-int-btn-wide"
              disabled={!discordToken.trim()}
              onClick={async () => {
                try {
                  const channelIds = discordChannels
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                  await integrationApi.connectDiscordToken(discordToken.trim(), channelIds)
                  setDiscordToken('')
                  setDiscordChannels('')
                  setStatus('Discord connected and synced.')
                  await refreshConnections()
                } catch (err) {
                  setStatus(`Discord connect failed: ${String(err)}`)
                }
              }}
            >
              {connections?.connected.discord ? 'Update connection' : 'Connect'}
            </button>
            </div>
          </div>
        </div>
      )
    }

    return null
  }

  const renderAppTile = (item: IntegrationDef) => {
    const connected = isIntegrationConnected(item.id)
    const isDesktopTab = item.id === 'youtube' || item.id === 'linkedin'
    const pinnable = pinnableForItem(item.id)
    const showPin = canPinItem(item.id, connected || isDesktopTab, desktop)
    const pinned = pinnable ? isNavAppPinned(pinnable.id, navApps) : false
    const statusLabel = isDesktopTab
      ? pinned
        ? 'Pinned to sidebar'
        : 'Available'
      : connected
        ? 'Connected'
        : 'Not connected'

    return (
      <div key={item.id} className="x-market-tile-wrap">
        {showPin ? (
          <button
            type="button"
            className={`x-market-tile-pin${pinned ? ' x-market-tile-pin-active' : ''}`}
            title={pinned ? 'Unpin from sidebar' : 'Pin to sidebar'}
            aria-label={pinned ? `Unpin ${item.name}` : `Pin ${item.name} to sidebar`}
            aria-pressed={pinned}
            onClick={(e) => {
              e.stopPropagation()
              if (!pinnable) return
              if (pinned) onUnpinNavApp?.(pinnable.id)
              else onPinNavApp?.(pinnable.id)
            }}
          >
            <PinIcon filled={pinned} />
          </button>
        ) : null}
        <button
          type="button"
          className={`x-market-tile ${item.brandClass}${connected || pinned ? ' x-market-tile-active' : ''}`}
          onClick={() => setSelected(item.id)}
        >
          <div className="x-market-tile-icon-wrap">
            <div className={`x-market-tile-icon ${item.brandClass}`}>{item.icon}</div>
            {connected || pinned ? (
              <span className="x-market-tile-dot" aria-hidden />
            ) : null}
          </div>
          <strong className="x-market-tile-name">{item.name}</strong>
          <p className="x-market-tile-tagline">{item.tagline}</p>
          <span className="x-market-tile-status">{statusLabel}</span>
        </button>
      </div>
    )
  }

  const selectedItem = selected ? INTEGRATIONS.find((i) => i.id === selected) : null

  return (
    <div className="x-int-page">
      <header className="x-int-header x-market-header">
        <div className="x-market-header-copy">
          <h1>Apps</h1>
          <p className="x-market-header-meta">
            {connections ? (
              <>
                {connectedCount} of {feedIntegrationTotal} connected
                {connectedApps.length > 0 ? (
                  <>
                    {' · '}
                    <button
                      type="button"
                      className="x-market-header-link"
                      onClick={() => setCategoryFilter('connected')}
                    >
                      View your apps
                    </button>
                  </>
                ) : null}
              </>
            ) : (
              'Loading integrations…'
            )}
          </p>
        </div>
        <button type="button" className="x-int-btn x-market-sync-btn" onClick={() => void syncAll()}>
          Sync all
        </button>
      </header>

      <div className="x-int-body">
        <div className="x-market">
          <div className="x-market-toolbar">
            <input
              type="search"
              className="x-market-search"
              placeholder="Search apps…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search apps"
            />
            <div className="x-market-chips-wrap">
              <div className="x-market-chips" role="tablist" aria-label="App categories">
                {MARKET_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    role="tab"
                    aria-selected={categoryFilter === cat.id}
                    className={`x-market-chip${categoryFilter === cat.id ? ' x-market-chip-active' : ''}`}
                    onClick={() => setCategoryFilter(cat.id)}
                  >
                    {cat.label}
                    {cat.id === 'connected' && connectedApps.length > 0 ? (
                      <span className="x-market-chip-count">{connectedApps.length}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {filteredIntegrations.length > 0 ? (
            showGroupedCatalog && groupedCatalog ? (
              <div className="x-market-sections">
                {groupedCatalog.map((group) => (
                  <section key={group.category} className="x-market-section">
                    <h2 className="x-market-section-title">{group.label}</h2>
                    <div className="x-market-grid">{group.items.map((item) => renderAppTile(item))}</div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="x-market-grid">
                {filteredIntegrations.map((item) => renderAppTile(item))}
              </div>
            )
          ) : (
            <p className="x-market-empty">
              {categoryFilter === 'connected'
                ? 'No connected apps yet — pick one below to get started.'
                : 'No apps match your search.'}
            </p>
          )}
        </div>
      </div>

      {selected && selectedItem ? (
        <div
          className="x-market-modal-backdrop"
          onClick={() => setSelected(null)}
          role="presentation"
        >
          <div
            className="x-market-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="x-market-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="x-market-modal-head">
              <h2 id="x-market-modal-title">{selectedItem.name}</h2>
              <button
                type="button"
                className="x-market-modal-close"
                onClick={() => setSelected(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="x-market-modal-body">{renderDetail()}</div>
          </div>
        </div>
      ) : null}

      {status ? <p className="x-int-toast">{status}</p> : null}
    </div>
  )
}
