import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CentralStreamEvent } from '@shared/cluster'
import { clusterApi, integrationApi } from '../lib/api'
import { buildRunningAgents } from './homeAgents'
import { RunningAgentsPanel } from './RunningAgentsPanel'
import {
  completeAgent,
  createAgentAbortSignal,
  dismissRunningAgentsPanel,
  startAgent,
  stopAll,
  updateAgentStatus,
  useMergedRunningAgents,
  useRunningAgentsPanel
} from './runningAgentsStore'

type Props = {
  events: CentralStreamEvent[]
  onOpenIntegrations?: () => void
  onFocusMeeting?: (itemId: string) => void
}

function isBuildEvent(event: CentralStreamEvent): boolean {
  return event.source === 'build' || event.kind === 'build_prompt'
}

function eventStatus(event: CentralStreamEvent): string {
  const raw = String(event.meta?.agentStatus ?? event.meta?.phase ?? '').trim()
  if (raw) return raw.replace(/_/g, ' ')
  if (event.kind === 'build_prompt') return 'building'
  return 'queued'
}

export function BuildAgentsView({ events, onOpenIntegrations, onFocusMeeting }: Props) {
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [connected, setConnected] = useState<boolean | null>(null)

  const buildEvents = useMemo(
    () => events.filter(isBuildEvent).slice(0, 12),
    [events]
  )

  const streamAgents = useMemo(
    () =>
      buildRunningAgents({ events, liveCapture: false }).filter((a) =>
        /cursor|build/i.test(a.title)
      ),
    [events]
  )
  const mergedAgents = useMergedRunningAgents(streamAgents)
  const { panelDismissed } = useRunningAgentsPanel()
  const showAgentsPanel = mergedAgents.length > 0 && !panelDismissed

  const refreshConnection = useCallback(async () => {
    try {
      const data = await integrationApi.connections()
      setConnected(Boolean(data.connected?.cursor))
    } catch {
      setConnected(false)
    }
  }, [])

  useEffect(() => {
    void refreshConnection()
  }, [refreshConnection])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(t)
  }, [toast])

  const launchAgent = async () => {
    const text = prompt.trim()
    if (!text || busy) return
    if (!connected) {
      setError('Connect Cursor in Apps — API key + default repo.')
      return
    }

    setBusy(true)
    setError(null)
    const compose = `@cursor ask: ${text}`
    const agentId = startAgent({ title: `Cursor · ${text.slice(0, 48)}`, status: 'Launching…' })
    const signal = createAgentAbortSignal(agentId)

    try {
      updateAgentStatus(agentId, 'Routing to Cursor…')
      const result = await clusterApi.runAction({ text: compose }, { signal })
      if (result.ok) {
        setPrompt('')
        setToast(result.message || 'Cursor agent started')
      } else {
        setError(result.message)
      }
    } catch (err) {
      if (!signal.aborted) {
        setError(err instanceof Error ? err.message : 'Failed to launch agent')
      }
    } finally {
      completeAgent(agentId)
      setBusy(false)
      window.dispatchEvent(new Event('stream:user-role'))
    }
  }

  return (
    <div className="x-build-page">
      <header className="x-build-head">
        <div>
          <h1>Build agents</h1>
          <p>Route build prompts to Cursor Cloud — from here, Home, Feed compose, or post-call decks.</p>
        </div>
        <span className={`x-build-status ${connected ? 'x-build-status-on' : 'x-build-status-off'}`}>
          {connected == null ? '…' : connected ? 'Cursor connected' : 'Not connected'}
        </span>
      </header>

      {showAgentsPanel ? (
        <RunningAgentsPanel
          agents={mergedAgents}
          onStopAll={stopAll}
          onDismiss={dismissRunningAgentsPanel}
          onFocusMeeting={onFocusMeeting}
        />
      ) : null}

      <section className="x-build-compose">
        <label className="x-build-compose-label" htmlFor="x-build-prompt">
          Build prompt
        </label>
        <textarea
          id="x-build-prompt"
          className="x-build-prompt"
          rows={5}
          placeholder="Describe what to build — e.g. Add thumbs up/down on feed posts and wire to feedback store…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={busy}
        />
        <div className="x-build-compose-actions">
          <button type="button" className="x-int-btn" disabled={busy || !prompt.trim()} onClick={() => void launchAgent()}>
            {busy ? 'Launching…' : 'Run @cursor'}
          </button>
          {!connected && onOpenIntegrations ? (
            <button type="button" className="x-int-btn x-int-btn-ghost" onClick={onOpenIntegrations}>
              Connect in Apps
            </button>
          ) : null}
        </div>
        {error ? <p className="x-int-alert">{error}</p> : null}
        {toast ? <p className="x-build-toast">{toast}</p> : null}
      </section>

      <section className="x-build-recent">
        <h2>Recent builds</h2>
        {buildEvents.length === 0 ? (
          <p className="x-build-empty">
            No build runs yet. Approve a post-call Cursor action, or run <code>@cursor ask: …</code> from Feed.
          </p>
        ) : (
          <ul className="x-build-list">
            {buildEvents.map((event) => (
              <li key={event.id} className="x-build-list-item">
                <div className="x-build-list-main">
                  <strong>{event.title || 'Cursor build'}</strong>
                  <span className="x-build-list-status">{eventStatus(event)}</span>
                </div>
                <p>{event.body.slice(0, 220)}{event.body.length > 220 ? '…' : ''}</p>
                {event.meta?.agentId ? (
                  <code className="x-build-list-meta">agent {String(event.meta.agentId)}</code>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
