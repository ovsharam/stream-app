import { useEffect, useMemo, useRef, useState } from 'react'
import type { AssistResult, CentralStreamEvent, ClusterSearchHit } from '@shared/cluster'
import { sanitizeDisplayText } from '../lib/displayText'
import { clusterApi } from '../lib/api'
import { AssistMessageBody } from './AssistMessageBody'
import { buildRunningAgents } from './homeAgents'
import type { HomeChatMessage } from './homeChatStore'
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

const STARTERS = [
  { id: 'today', label: 'What needs my attention today?', hint: 'Priorities & open loops' },
  { id: 'call', label: 'Prep me for my next call', hint: 'Context & talking points' },
  { id: 'monday', label: 'Summarize my open Monday tasks', hint: 'Board status' }
] as const

type Props = {
  compact?: boolean
  events: CentralStreamEvent[]
  liveCapture?: boolean
  messages: HomeChatMessage[]
  onMessagesChange: (updater: HomeChatMessage[] | ((prev: HomeChatMessage[]) => HomeChatMessage[])) => void
  onFocusMeeting: (itemId: string) => void
  onOpenSearchHit?: (hit: ClusterSearchHit) => void
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
  onOpenSearchHit
}: Props) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const genRef = useRef(0)

  const streamAgents = useMemo(
    () => buildRunningAgents({ events, liveCapture }),
    [events, liveCapture]
  )
  const mergedAgents = useMergedRunningAgents(streamAgents)
  const { panelDismissed } = useRunningAgentsPanel()
  const showAgentsPanel = mergedAgents.length > 0 && !panelDismissed
  const hasThread = messages.length > 0

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
      const result = await clusterApi.assist(trimmed, undefined, { chat: true, history, signal })
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
      if (gen === genRef.current) {
        setBusy(false)
        inputRef.current?.focus()
      }
    }

    if (aborted || gen !== genRef.current) return

    onMessagesChange((prev) =>
      prev.map((m) =>
        m.id === assistantId
          ? {
              ...m,
              loading: false,
              content: assist?.response ?? '',
              assist: assist ?? undefined,
              error
            }
          : m
      )
    )
  }

  const now = new Date()
  const greeting = greetingForHour(now.getHours())
  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  })

  const agentsPanel = showAgentsPanel ? (
    <RunningAgentsPanel
      agents={mergedAgents}
      onStopAll={stopAll}
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
              <p className="x-home-date">{dateLabel}</p>
              <h1 className="x-home-greeting">{greeting}</h1>
              <p className="x-home-lede">
                Ask about deals, calls, and tasks — agents keep working while you chat.
              </p>
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
            {agentsPanel}
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
              placeholder="Message Notch…"
              disabled={busy}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void sendMessage()
                }
              }}
            />
            <button
              type="button"
              className="x-home-composer-send"
              disabled={!input.trim() || busy}
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
          </div>
          {!compact ? (
            <p className="x-home-dock-hint">Enter to send · Shift+Enter for new line</p>
          ) : null}
        </div>
        </div>
      </footer>
    </div>
  )
}
