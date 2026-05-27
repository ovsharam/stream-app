import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { GmailAccount, GoogleCalendarOption, MondayAccount } from '@shared/cluster'
import { clusterApi, integrationApi, type IntegrationConnections } from '../lib/api'
import { IconGmail, IconMonday } from './Icons'

type IntegrationId = 'gmail' | 'monday' | 'x' | 'discord'

type IntegrationDef = {
  id: IntegrationId
  name: string
  tagline: string
  feeds: string
  brandClass: string
  icon: ReactNode
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
    id: 'monday',
    name: 'Monday.com',
    tagline: 'Board updates and item threads',
    feeds: 'Feed',
    brandClass: 'x-int-card-monday',
    icon: <IconMonday className="x-int-brand-icon" />
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

export function IntegrationsPanel() {
  const [connections, setConnections] = useState<IntegrationConnections | null>(null)
  const [selected, setSelected] = useState<IntegrationId>('gmail')
  const [status, setStatus] = useState('')
  const [xToken, setXToken] = useState('')
  const [mondayToken, setMondayToken] = useState('')
  const [discordToken, setDiscordToken] = useState('')
  const [discordChannels, setDiscordChannels] = useState('')
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
  }, [refreshConnections])

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
        `Synced — Gmail ${result.gmail ?? 0}, Calendar ${result.calendar ?? 0}, X ${result.x ?? 0}, Monday ${result.monday ?? 0}, Discord ${result.discord ?? 0}`
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
    if (id === 'monday' && connections.connected.monday) {
      if (mondayAccount?.email) return mondayAccount.email
      if (mondayAccount?.name) return mondayAccount.name
      return 'Connected · active in stream'
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
                <code>monday: your task</code> creates items on{' '}
                <strong>{mondayCreateTarget.boardName}</strong>
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
                    await integrationApi.connectMondayToken(mondayToken.trim())
                    setMondayToken('')
                    setStatus('Monday connected and synced.')
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

    if (selected === 'x') {
      return (
        <div className="x-int-detail">
          <div className="x-int-detail-head">
            <div>
              <h3>X</h3>
              <p>Paste a bearer token to ingest timeline posts into your feed.</p>
            </div>
          </div>
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
              {connections?.connected.x ? 'Update token' : 'Connect'}
            </button>
          </div>
        </div>
      )
    }

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

  return (
    <div className="x-int-page">
      <header className="x-int-header">
        <div>
          <h1>Integrations</h1>
          <p>
            {connectedCount} of {INTEGRATIONS.length} connected · sources flow into your Central feed
          </p>
        </div>
        <button type="button" className="x-int-btn" onClick={() => void syncAll()}>
          Sync all
        </button>
      </header>

      <div className="x-int-body">
        <div className="x-int-grid">
          {INTEGRATIONS.map((item) => {
            const connected = connections?.connected[item.id] ?? false
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

        <div className="x-int-detail-wrap">{renderDetail()}</div>
      </div>

      {status ? <p className="x-int-toast">{status}</p> : null}
    </div>
  )
}
