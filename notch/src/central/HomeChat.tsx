import { useEffect, useMemo, useRef, useState } from 'react'
import type { AssistResult, CentralStreamEvent, ClusterSearchHit } from '@shared/cluster'
import { sanitizeDisplayText } from '../lib/displayText'
import { clusterApi, integrationApi } from '../lib/api'
import { AssistMessageBody } from './AssistMessageBody'
import { buildRunningAgents } from './homeAgents'
import type { HomeChatMessage } from './homeChatStore'
import { RunningAgentsPanel } from './RunningAgentsPanel'
import {
  completeAgent,
  createAgentAbortSignal,
  dismissRunningAgentsPanel,
  reconcileRunningAgentsWithStream,
  startAgent,
  stopAgent,
  stopAll,
  updateAgentStatus,
  useMergedRunningAgents,
  useRunningAgentsPanel
} from './runningAgentsStore'
import type { WorkspaceBrowserPageContext } from './workspaceBrowserContext'
import { looksLikeMeetSchedule, meetActionTextForSubmit } from '@shared/meeting-compose'

const STARTERS = [
  { id: 'today',    label: "What's on my plate today?",  hint: 'Priorities & open loops' },
  { id: 'call',     label: 'Prep me for my next call',   hint: 'Context & talking points' },
  { id: 'tomorrow', label: 'Plan for tomorrow',           hint: 'Calendar & handoffs' },
  { id: 'pipeline', label: 'Pipeline status summary',    hint: 'Deals, gaps & signals' }
] as const

type Props = {
  compact?: boolean
  events: CentralStreamEvent[]
  liveCapture?: boolean
  messages: HomeChatMessage[]
  onMessagesChange: (updater: HomeChatMessage[] | ((prev: HomeChatMessage[]) => HomeChatMessage[])) => void
  onFocusMeeting: (itemId: string) => void
  onOpenSearchHit?: (hit: ClusterSearchHit) => void
  browserPageContext?: WorkspaceBrowserPageContext | null
}

function greetingForHour(h: number): string {
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function newId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function agentTitle(text: string): string {
  const t = text.trim()
  return t.length > 56 ? `${t.slice(0, 55)}…` : t
}

export function HomeChat({
  compact,
  events,
  liveCapture,
  messages,
  onMessagesChange,
  onFocusMeeting,
  onOpenSearchHit,
  browserPageContext
}: Props) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const genRef = useRef(0)
  const activeRequestRef = useRef<{ agentId: string; assistantId: string; gen: number } | null>(
    null
  )

  const streamAgents = useMemo(
    () => buildRunningAgents({ events, liveCapture }),
    [events, liveCapture]
  )
  const mergedAgents = useMergedRunningAgents(streamAgents)
  const { panelDismissed } = useRunningAgentsPanel()
  const showAgentsPanel = mergedAgents.length > 0 && !panelDismissed
  const hasThread = messages.length > 0

  useEffect(() => {
    reconcileRunningAgentsWithStream(events)
  }, [events])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = '0'
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`
  }, [input])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  const finishAssistantMessage = (
    assistantId: string,
    patch: Pick<HomeChatMessage, 'content' | 'assist' | 'error'>
  ) => {
    onMessagesChange((prev) =>
      prev.map((m) =>
        m.id === assistantId
          ? {
              ...m,
              loading: false,
              content: patch.content,
              assist: patch.assist,
              error: patch.error
            }
          : m
      )
    )
  }

  const stopRequest = () => {
    const req = activeRequestRef.current
    if (!req) return
    stopAgent(req.agentId)
    genRef.current += 1
    activeRequestRef.current = null
    setBusy(false)
    finishAssistantMessage(req.assistantId, { content: '', error: 'Stopped.' })
    inputRef.current?.focus()
  }

  useEffect(() => {
    if (!busy) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        stopRequest()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy])

  const sendMessage = async (text?: string) => {
    const trimmed = (text ?? input).trim()
    if (!trimmed || busy) return

    const gen = ++genRef.current
    const userMsg: HomeChatMessage = { id: newId(), role: 'user', content: trimmed }
    const assistantId = newId()
    const loadingMsg: HomeChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      query: trimmed,
      loading: true
    }

    setInput('')
    onMessagesChange((prev) => [...prev, userMsg, loadingMsg])
    setBusy(true)

    const agentId = startAgent({ title: agentTitle(trimmed), status: 'Thinking…' })
    const signal = createAgentAbortSignal(agentId)
    activeRequestRef.current = { agentId, assistantId, gen }

    if (looksLikeMeetSchedule(trimmed)) {
      try {
        updateAgentStatus(agentId, 'Scheduling Google Meet…')
        const result = await clusterApi.runAction(
          { text: meetActionTextForSubmit(trimmed) },
          { signal }
        )
        if (signal.aborted) return
        finishAssistantMessage(assistantId, {
          content: result.message,
          error: result.ok ? undefined : result.message,
          assist: result.ok
            ? {
                query: trimmed,
                intent: 'general',
                headline: 'Meeting scheduled',
                response: result.message,
                sayThis: '',
                sources: []
              }
            : undefined
        })
        if (result.ok) {
          window.dispatchEvent(new CustomEvent('notch:calendars-updated'))
        }
      } catch (err) {
        if (!signal.aborted) {
          finishAssistantMessage(assistantId, {
            content: '',
            error: err instanceof Error ? err.message : 'Could not schedule meeting'
          })
        }
      } finally {
        completeAgent(agentId)
        if (activeRequestRef.current?.assistantId === assistantId) {
          activeRequestRef.current = null
        }
        if (gen === genRef.current) {
          setBusy(false)
          inputRef.current?.focus()
        }
      }
      return
    }

    const history = messages
      .filter((m) => !m.loading && m.content.trim())
      .slice(-10)
      .map((m) => ({
        role: m.role,
        content: m.role === 'assistant' ? m.assist?.response ?? m.content : m.content
      }))

    let assist: AssistResult | null = null
    let error: string | undefined
    let aborted = false

    try {
      updateAgentStatus(agentId, 'Searching context…')
      const pageContext = browserPageContext
        ? {
            url: browserPageContext.url,
            title: browserPageContext.title,
            excerpt: browserPageContext.excerpt,
            selectedText: browserPageContext.selectedText
          }
        : undefined
      const result = await clusterApi.assist(trimmed, undefined, {
        chat: true,
        history,
        signal,
        pageContext
      })
      if (signal.aborted) {
        aborted = true
        return
      }
      updateAgentStatus(agentId, 'Writing response…')
      assist = result
    } catch (err) {
      if (signal.aborted) {
        aborted = true
        return
      }
      error = err instanceof Error ? err.message : 'Could not reach assist'
    } finally {
      completeAgent(agentId)
      if (activeRequestRef.current?.assistantId === assistantId) {
        activeRequestRef.current = null
      }
      if (gen === genRef.current) {
        setBusy(false)
        inputRef.current?.focus()
      }
    }

    if (aborted || gen !== genRef.current) {
      if (aborted && gen === genRef.current) {
        finishAssistantMessage(assistantId, { content: '', error: 'Stopped.' })
      }
      return
    }

    finishAssistantMessage(assistantId, {
      content: assist?.response ?? '',
      assist: assist ?? undefined,
      error
    })
  }

  const now = new Date()
  const greeting = greetingForHour(now.getHours())
  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  })

  const handleStopAll = () => {
    stopAll()
    void integrationApi
      .buildCancelAll()
      .then(() => {
        window.dispatchEvent(new Event('notch:stream-push'))
      })
      .catch(() => undefined)
  }

  const agentsPanel = showAgentsPanel ? (
    <RunningAgentsPanel
      agents={mergedAgents}
      onStopAll={handleStopAll}
      onDismiss={dismissRunningAgentsPanel}
      onFocusMeeting={onFocusMeeting}
    />
  ) : null

  return (
    <div
      className={`x-home-chat${hasThread ? ' x-home-chat-thread' : ''}${compact ? ' x-home-chat-compact' : ''}`}
    >
      {!compact ? <div className="x-home-bg" aria-hidden /> : null}

      <div className="x-home-chat-scroll" ref={scrollRef}>
        <div className="x-home-col">
        {!hasThread ? (
          compact ? (
            <div className="x-home-hero x-home-hero-compact">
              <p className="x-home-compact-lede">Ask about your feed, tasks, or calls.</p>
              <div className="x-home-starter-grid x-home-starter-grid-compact">
                {STARTERS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="x-home-starter-card x-home-starter-card-compact"
                    disabled={busy}
                    onClick={() => void sendMessage(item.label)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
          <div className="x-home-hero">
            <header className="x-home-welcome">
              <h1 className="x-home-greeting">{greeting}</h1>
              <p className="x-home-lede">Ask about your pipeline, calls, and tasks.</p>
            </header>
            {agentsPanel}
            <div className="x-home-starter-grid">
              {STARTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="x-home-starter-card"
                  disabled={busy}
                  onClick={() => void sendMessage(item.label)}
                >
                  <span className="x-home-starter-label">{item.label}</span>
                  <span className="x-home-starter-hint">{item.hint}</span>
                </button>
              ))}
            </div>
          </div>
          )
        ) : (
          <div className="x-home-thread">
            <div className="x-home-messages">
            {messages.map((msg) => (
              <article
                key={msg.id}
                className={`x-home-turn x-home-turn-${msg.role}${msg.loading ? ' x-home-turn-loading' : ''}`}
              >
                <div className="x-home-turn-avatar" aria-hidden>
                  {msg.role === 'user' ? 'A' : 'N'}
                </div>
                <div
                  className={`x-home-msg x-home-msg-${msg.role}${msg.loading ? ' x-home-msg-loading' : ''}`}
                >
                  {msg.role === 'user' ? (
                    <p className="x-home-msg-text">{msg.content}</p>
                  ) : msg.loading ? (
                    <div className="x-home-msg-typing" aria-label="Thinking">
                      <span />
                      <span />
                      <span />
                    </div>
                  ) : msg.error ? (
                    <p className="x-home-msg-error">{msg.error}</p>
                  ) : msg.assist ? (
                    <AssistMessageBody assist={msg.assist} query={msg.query ?? msg.content} />
                  ) : (
                    <>
                      {msg.content ? (
                        <p className="x-home-msg-text">{msg.content}</p>
                      ) : (
                        <p className="x-home-msg-text x-home-msg-muted">No response.</p>
                      )}
                      {msg.hits && msg.hits.length > 0 ? (
                        <ul className="x-home-hit-list">
                          {msg.hits.map((hit) => (
                            <li key={hit.id}>
                              <button
                                type="button"
                                className="x-home-hit"
                                onClick={() => onOpenSearchHit?.(hit)}
                              >
                                <span className="x-home-hit-source">{hit.source}</span>
                                <span className="x-home-hit-title">
                                  {sanitizeDisplayText(hit.title, 100)}
                                </span>
                                <span className="x-home-hit-snippet">
                                  {sanitizeDisplayText(hit.snippet, 120)}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  )}
                </div>
              </article>
            ))}
            </div>
          </div>
        )}
        </div>
      </div>

      <footer className="x-home-dock">
        <div className="x-home-col">
        <div className="x-home-dock-inner">
          <div className="x-home-composer-inner">
            <textarea
              ref={inputRef}
              className="x-home-composer-input"
              value={input}
              rows={1}
              placeholder="Message Plumb…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (busy) stopRequest()
                  else void sendMessage()
                }
              }}
            />
            {busy ? (
              <button
                type="button"
                className="x-home-composer-send x-home-composer-stop"
                onClick={stopRequest}
                aria-label="Stop response"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                className="x-home-composer-send"
                disabled={!input.trim()}
                onClick={() => void sendMessage()}
                aria-label="Send message"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M12 19V5M12 5L6 11M12 5L18 11"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
          </div>
          {!compact ? (
            <p className="x-home-dock-hint">
              {busy ? 'Stop with the button or Esc · Shift+Enter for new line' : 'Enter to send · Shift+Enter for new line'}
            </p>
          ) : null}
        </div>
        </div>
      </footer>
    </div>
  )
}
