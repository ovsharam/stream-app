import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { GmailAccount, GoogleCalendarOption, MondayAccount } from '@shared/cluster'
import { clusterApi, integrationApi, type IntegrationConnections } from '../lib/api'
import { IconGmail, IconMonday, IconYoutube } from './Icons'
import { McpAgentsSection } from './McpAgentsSection'
import { isNavAppDesktop, NAV_APP_CATALOG, type NavApp } from './navAppsStore'

type IntegrationId =
  | 'gmail'
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
  | 'gong'

type IntegrationDef = {
  id: IntegrationId
  name: string
  tagline: string
  feeds: string
  brandClass: string
  icon: ReactNode
  compose?: string
}

const INTEGRATIONS: IntegrationDef[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    tagline: 'Inbox threads + Google Calendar',
    feeds: 'Feed · Calendar rail',
    brandClass: 'x-int-card-gmail',
    icon: <IconGmail className="x-int-brand-icon" />
  },
  {
    id: 'calcom',
    name: 'Cal.com',
    tagline: 'Scheduling — upcoming & past bookings',
    feeds: 'Feed',
    brandClass: 'x-int-card-calcom',
    icon: <span className="x-int-brand-letter">Cal</span>
  },
  {
    id: 'monday',
    name: 'Monday.com',
    tagline: 'Board updates and item threads',
    feeds: 'Feed',
    brandClass: 'x-int-card-monday',
    icon: <IconMonday className="x-int-brand-icon" />
  },
  {
    id: 'agents',
    name: 'MCP Agents',
    tagline: 'Register your agency MCP servers for custom compose dispatch',
    feeds: 'Compose',
    brandClass: 'x-int-card-agents',
    icon: <span className="x-int-brand-letter">MCP</span>,
    compose: '@alias ask: … (when executor wired)'
  },
  {
    id: 'github',
    name: 'GitHub',
    tagline: 'Issues in feed, create & comment',
    feeds: 'Feed',
    brandClass: 'x-int-card-github',
    icon: <span className="x-int-brand-letter">GH</span>,
    compose: '@github org/repo: title / body'
  },
  {
    id: 'gdocs',
    name: 'Google Docs',
    tagline: 'Recent docs via Gmail OAuth',
    feeds: 'Feed',
    brandClass: 'x-int-card-gdocs',
    icon: <span className="x-int-brand-letter">Gd</span>,
    compose: '@gdocs create: title / body'
  },
  {
    id: 'gong',
    name: 'Gong',
    tagline: 'Call recordings & notes',
    feeds: 'Feed',
    brandClass: 'x-int-card-gong',
    icon: <span className="x-int-brand-letter">Go</span>,
    compose: '@gong #CALL_ID note: …'
  },
  {
    id: 'claude',
    name: 'Claude',
    tagline: 'Sign in with Claude Pro — sync chats',
    feeds: 'Feed · Compose',
    brandClass: 'x-int-card-claude',
    icon: <span className="x-int-brand-letter">C</span>,
    compose: '@claude ask: …'
  },
  {
    id: 'gemini',
    name: 'Gemini',
    tagline: 'Google AI ask & summarize',
    feeds: 'Feed · Compose',
    brandClass: 'x-int-card-gemini',
    icon: <span className="x-int-brand-letter">G</span>,
    compose: '@gemini ask: …'
  },
  {
    id: 'cursor',
    name: 'Cursor',
    tagline: 'Agent prompts & cloud runs',
    feeds: 'Feed · Compose',
    brandClass: 'x-int-card-cursor',
    icon: <span className="x-int-brand-letter">Cu</span>,
    compose: '@cursor ask: …'
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    tagline: 'Sign in · news in calendar rail',
    feeds: 'Feed · Calendar rail · Compose',
    brandClass: 'x-int-card-perplexity',
    icon: <span className="x-int-brand-letter">P</span>,
    compose: '@perplexity ask: …'
  },
  {
    id: 'x',
    name: 'X',
    tagline: 'Timeline posts via bearer token',
    feeds: 'Feed',
    brandClass: 'x-int-card-x',
    icon: <span className="x-int-brand-letter">𝕏</span>
  },
  {
    id: 'discord',
    name: 'Discord',
    tagline: 'Channel messages via bot token',
    feeds: 'Feed',
    brandClass: 'x-int-card-discord',
    icon: <span className="x-int-brand-letter">D</span>
  }
]

function StatusBadge({ connected }: { connected: boolean }) {
  return (
    <span className={`x-int-status ${connected ? 'x-int-status-on' : 'x-int-status-off'}`}>
      {connected ? 'Connected' : 'Not connected'}
    </span>
  )
}

export function IntegrationsPanel({
  navApps,
  onOpenNavApp,
  onPinNavApp,
  onUnpinNavApp
}: {
  navApps: NavApp[]
  onOpenNavApp?: (id: string) => void
  onPinNavApp?: (id: string) => void
  onUnpinNavApp?: (id: string) => void
}) {
  const desktop = isNavAppDesktop()
  const [connections, setConnections] = useState<IntegrationConnections | null>(null)
  const [selected, setSelected] = useState<IntegrationId>('gmail')
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

  const loadMcpAgents = useCallback(async () => {
    try {
      const data = await clusterApi.mcpAgents()
      setMcpAgentCount(data.agents.length)
    } catch {
      setMcpAgentCount(0)
    }
  }, [])

  const refreshConnections = useCallback(async () => {
    const data = await integrationApi.connections()
    setConnections(data)
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

  const loadCalendars = useCallback(async () => {
    setCalendarsLoading(true)
    setCalendarsError(null)
    try {
      const data = await clusterApi.calendars()
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
    void refreshConnections()
    void loadMcpAgents()
  }, [refreshConnections, loadMcpAgents])

  useEffect(() => {
    if (selected === 'agents') void loadMcpAgents()
  }, [selected, loadMcpAgents])

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
    if (connections?.connected.gmail) {
      void loadGmailAccounts()
      void loadCalendars()
    } else {
      setGmailAccounts([])
      setCalendars([])
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
    loadCalendars,
    loadGmailAccounts,
    loadMondayAccount,
    loadMondayCreateTarget
  ])

  const connectedCount = useMemo(() => {
    if (!connections) return 0
    return INTEGRATIONS.filter((i) => connections.connected[i.id]).length
  }, [connections])

  const connectGmail = async (addAccount: boolean) => {
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
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
      setStatus(addAccount ? 'Complete sign-in in your browser, then return here.' : 'Complete Gmail OAuth in your browser.')
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
      setStatus(
        `Synced — Gmail ${result.gmail ?? 0}, GitHub ${result.github ?? 0}, Docs ${result.gdocs ?? 0}, Gong ${result.gong ?? 0}, X ${result.x ?? 0}, Monday ${result.monday ?? 0}`
      )
      await refreshConnections()
      await loadGmailAccounts()
      await loadMondayAccount()
      await loadMondayCreateTarget()
      await loadCalendars()
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

  const cardMeta = (id: IntegrationId): string => {
    if (!connections) return 'Loading…'
    if (id === 'gmail' && connections.connected.gmail) {
      const feedCount = gmailAccounts.filter((a) => a.feedEnabled).length
      const calCount = gmailAccounts.filter((a) => a.calendarEnabled).length
      return `${gmailAccounts.length} account${gmailAccounts.length === 1 ? '' : 's'} · ${feedCount} in feed · ${calCount} calendar`
    }
    if (id === 'calcom' && connections.connected.calcom) {
      return 'Bookings sync to feed'
    }
    if (id === 'monday' && connections.connected.monday) {
      if (mondayAccount?.email) return mondayAccount.email
      if (mondayAccount?.name) return mondayAccount.name
      return 'Connected · active in stream'
    }
    if (id === 'agents') {
      return mcpAgentCount > 0
        ? `${mcpAgentCount} agent${mcpAgentCount === 1 ? '' : 's'} registered`
        : 'Register stdio or HTTP MCP servers'
    }
    if (connections.connected[id]) return 'Active in stream'
    return 'Tap to connect'
  }

  const renderDetail = () => {
    if (selected === 'gmail') {
      return (
        <div className="x-int-detail">
          <div className="x-int-detail-head">
            <div>
              <h3>Gmail & Calendar</h3>
              <p>OAuth connects inbox and Google Calendar. Add multiple accounts and choose what syncs.</p>
            </div>
            <div className="x-int-detail-actions">
              <button type="button" className="x-int-btn" onClick={() => void connectGmail(false)}>
                {connections?.connected.gmail ? 'Reconnect' : 'Connect'}
              </button>
              {connections?.connected.gmail ? (
                <button type="button" className="x-int-btn x-int-btn-ghost" onClick={() => void connectGmail(true)}>
                  Add account
                </button>
              ) : null}
            </div>
          </div>

          {connections?.syncErrors?.gmail ? (
            <p className="x-int-alert">
              {connections.syncErrors.gmail}
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
                  <h4>Calendars in rail</h4>
                  <button type="button" className="x-int-link" onClick={() => void loadCalendars()}>
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
                    await refreshConnections()
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
              <p>Cloud agent API key — optional default repo for agent runs.</p>
            </div>
          </div>
          <div className="x-int-block x-int-block-first">
            <h4>{connections?.connected.cursor ? 'Update API key' : 'Connect'}</h4>
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
                placeholder="Default repo URL or owner/name (optional)"
              />
              <button
                type="button"
                className="x-int-btn x-int-btn-wide"
                disabled={!cursorKey.trim()}
                onClick={async () => {
                  try {
                    await integrationApi.connectCursor(
                      cursorKey.trim(),
                      cursorRepo.trim() || undefined
                    )
                    setCursorKey('')
                    setStatus('Cursor connected.')
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
              <code>@cursor ask: …</code>
            </p>
          </div>
        </div>
      )
    }

    if (selected === 'calcom') {
      const connectCalcomOAuth = async () => {
        try {
          const { url } = await integrationApi.calcomAuthUrl()
          if (window.notchDesktop?.openExternal) {
            window.notchDesktop.openExternal(url)
          } else {
            window.open(url, '_blank', 'noopener,noreferrer')
          }
          setStatus('Complete Cal.com sign-in in your browser, then return here and sync.')
        } catch (err) {
          setStatus(`Cal.com OAuth failed: ${String(err)}`)
        }
      }

      return (
        <div className="x-int-detail">
          <div className="x-int-detail-head">
            <div>
              <h3>Cal.com</h3>
              <p>
                API key syncs bookings and powers post-call follow-up scheduling. OAuth is optional
                if your client is approved.
              </p>
            </div>
          </div>
          <div className="x-int-block x-int-block-first">
            <h4>{connections?.connected.calcom ? 'Update API key' : 'Connect'}</h4>
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
                placeholder="Event type ID (optional — skips slug lookup)"
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
                {connections?.connected.calcom ? 'Update' : 'Connect'}
              </button>
            </div>
            <p className="x-int-muted">
              Create a key at{' '}
              <a
                href="https://app.cal.com/settings/developer/api-keys"
                target="_blank"
                rel="noreferrer"
              >
                app.cal.com/settings/developer/api-keys
              </a>
              . Set <code>CALCOM_DEFAULT_EVENT_TYPE_SLUG</code> in <code>.env.local</code> for
              post-call booking. Post-call routing proposes a <strong>Cal.com follow-up</strong>{' '}
              action when the call mentions scheduling the next meeting.
            </p>
          </div>
          {connections?.connected.calcom ? (
            <div className="x-int-block">
              <h4>Sync bookings</h4>
              <p className="x-int-muted">Pull upcoming and recent past bookings into the stream.</p>
              <button
                type="button"
                className="x-int-btn x-int-btn-secondary"
                onClick={async () => {
                  try {
                    const res = await integrationApi.syncSource('calcom')
                    setStatus(`Synced ${res.count} Cal.com booking${res.count === 1 ? '' : 's'}`)
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
            <h4>OAuth (optional)</h4>
            <p className="x-int-muted">
              Requires <code>CALCOM_CLIENT_ID</code> / <code>CALCOM_CLIENT_SECRET</code> in{' '}
              <code>.env.local</code> and Cal.com admin approval.
            </p>
            <button type="button" className="x-int-btn x-int-btn-ghost" onClick={() => void connectCalcomOAuth()}>
              Connect via OAuth
            </button>
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
              <p>Bot token plus comma-separated channel IDs for message ingest.</p>
            </div>
          </div>
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
      )
    }

    return null
  }

  return (
    <div className="x-int-page">
      <header className="x-int-header">
        <div>
          <h1>Apps</h1>
          <p>
            {desktop ? 'Pin desktop apps to the sidebar · ' : ''}
            {connectedCount} of {INTEGRATIONS.length} feed integrations connected
          </p>
        </div>
        <button type="button" className="x-int-btn" onClick={() => void syncAll()}>
          Sync all
        </button>
      </header>

      <div className="x-int-body">
        {desktop ? (
          <section className="x-int-section x-int-desktop-apps">
            <div className="x-int-section-head">
              <h2>Desktop apps</h2>
              <p>Open inside Notch — pin to the sidebar for quick access. Mini player keeps playing when you switch to Feed.</p>
            </div>
            <div className="x-int-grid x-int-grid-desktop">
              {NAV_APP_CATALOG.map((entry) => {
                const pinned = navApps.some((a) => a.id === entry.id)
                return (
                  <div key={entry.id} className={`x-int-card x-int-card-static ${entry.brandClass}`}>
                    <div className={`x-int-card-icon ${entry.brandClass}`}>
                      {entry.id === 'youtube' ? (
                        <IconYoutube className="x-int-brand-icon" />
                      ) : (
                        <span className="x-int-brand-letter">{entry.label.slice(0, 2)}</span>
                      )}
                    </div>
                    <div className="x-int-card-body">
                      <div className="x-int-card-top">
                        <strong>{entry.label}</strong>
                        <span className={`x-int-status ${pinned ? 'x-int-status-on' : 'x-int-status-off'}`}>
                          {pinned ? 'Pinned' : 'Available'}
                        </span>
                      </div>
                      <p>{entry.description}</p>
                      <span className="x-int-card-meta">Sidebar · Mini player</span>
                      <div className="x-int-desktop-actions">
                        {pinned ? (
                          <>
                            <button
                              type="button"
                              className="x-int-btn"
                              onClick={() => onOpenNavApp?.(entry.id)}
                            >
                              Open
                            </button>
                            <button
                              type="button"
                              className="x-int-btn x-int-btn-ghost"
                              onClick={() => onUnpinNavApp?.(entry.id)}
                            >
                              Unpin
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="x-int-btn"
                            onClick={() => {
                              onPinNavApp?.(entry.id)
                              onOpenNavApp?.(entry.id)
                            }}
                          >
                            Pin to sidebar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ) : null}

        <div className="x-int-feed-layout">
          <div className="x-int-feed-col">
            <div className="x-int-section-head x-int-section-head-col">
              <h2>Feed integrations</h2>
              <p>Connect tools — sources flow into your Central feed.</p>
            </div>
            <div className="x-int-grid">
          {INTEGRATIONS.map((item) => {
            const connected =
              item.id === 'agents'
                ? mcpAgentCount > 0
                : (connections?.connected[item.id] ?? false)
            const isSelected = selected === item.id
            return (
              <button
                key={item.id}
                type="button"
                className={`x-int-card ${item.brandClass} ${isSelected ? 'x-int-card-selected' : ''}`}
                onClick={() => setSelected(item.id)}
              >
                <div className={`x-int-card-icon ${item.brandClass}`}>{item.icon}</div>
                <div className="x-int-card-body">
                  <div className="x-int-card-top">
                    <strong>{item.name}</strong>
                    <StatusBadge connected={connected} />
                  </div>
                  <p>{item.tagline}</p>
                  <span className="x-int-card-meta">{cardMeta(item.id)}</span>
                </div>
              </button>
            )
          })}
            </div>
          </div>

          <div className="x-int-detail-wrap">{renderDetail()}</div>
        </div>
      </div>

      {status ? <p className="x-int-toast">{status}</p> : null}
    </div>
  )
}
