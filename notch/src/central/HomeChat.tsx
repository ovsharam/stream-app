import { useEffect, useMemo, useRef, useState } from 'react'
import type { AssistResult, CentralStreamEvent, ClusterSearchHit } from '@shared/cluster'
import { sanitizeDisplayText } from '../lib/displayText'
import { clusterApi } from '../lib/api'
import { AssistMessageBody } from './AssistMessageBody'
import { buildRunningAgents, HOME_AGENT_VISIBLE } from './homeAgents'
import type { HomeChatMessage } from './homeChatStore'

const STARTERS = [
  { id: 'today', label: 'What needs my attention today?', hint: 'Priorities & open loops' },
  { id: 'call', label: 'Prep me for my next call', hint: 'Context & talking points' },
  { id: 'monday', label: 'Summarize my open Monday tasks', hint: 'Board status' }
] as const

type Props = {
  events: CentralStreamEvent[]
  liveCapture?: boolean
  messages: HomeChatMessage[]
  onMessagesChange: (updater: HomeChatMessage[] | ((prev: HomeChatMessage[]) => HomeChatMessage[])) => void
  onFocusMeeting: (itemId: string) => void
  onOpenSearchHit?: (hit: ClusterSearchHit) => void
  onSeeAllAgents?: () => void
}

function greetingForHour(h: number): string {
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function newId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function AgentSpinner() {
  return (
    <span className="x-home-running-spinner" aria-hidden>
      <span className="x-home-running-spinner-ring" />
    </span>
  )
}

export function HomeChat({
  events,
  liveCapture,
  messages,
  onMessagesChange,
  onFocusMeeting,
  onOpenSearchHit,
  onSeeAllAgents
}: Props) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const genRef = useRef(0)

  const runningAgents = useMemo(
    () => buildRunningAgents({ events, liveCapture }),
    [events, liveCapture]
  )

  const visibleAgents = runningAgents.slice(0, HOME_AGENT_VISIBLE)
  const hiddenAgentCount = Math.max(0, runningAgents.length - HOME_AGENT_VISIBLE)
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

    const history = messages
      .filter((m) => !m.loading && m.content.trim())
      .slice(-10)
      .map((m) => ({
        role: m.role,
        content: m.role === 'assistant' ? m.assist?.response ?? m.content : m.content
      }))

    let assist: AssistResult | null = null
    let error: string | undefined

    try {
      const result = await clusterApi.assist(trimmed, undefined, { chat: true, history })
      assist = result
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not reach assist'
    }

    if (gen !== genRef.current) return

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
    setBusy(false)
    inputRef.current?.focus()
  }

  const now = new Date()
  const greeting = greetingForHour(now.getHours())
  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  })

  const agentStrip =
    visibleAgents.length > 0 ? (
      <section className="x-home-agents" aria-label="Running agents">
        <ul className="x-home-running">
          {visibleAgents.map((agent) => {
            const meetingId = agent.meetingId
            const inner = (
              <>
                <span className="x-home-running-title">{agent.title}</span>
                <AgentSpinner />
              </>
            )
            return (
              <li key={agent.id} className="x-home-running-item">
                {meetingId ? (
                  <button
                    type="button"
                    className="x-home-running-row"
                    onClick={() => onFocusMeeting(meetingId)}
                  >
                    {inner}
                  </button>
                ) : (
                  <div className="x-home-running-row">{inner}</div>
                )}
              </li>
            )
          })}
        </ul>
        {hiddenAgentCount > 0 && onSeeAllAgents ? (
          <button type="button" className="x-home-running-more" onClick={onSeeAllAgents}>
            +{hiddenAgentCount} more
          </button>
        ) : null}
      </section>
    ) : null

  return (
    <div className={`x-home-chat${hasThread ? ' x-home-chat-thread' : ''}`}>
      <div className="x-home-bg" aria-hidden />

      <div className="x-home-chat-scroll" ref={scrollRef}>
        {!hasThread ? (
          <div className="x-home-hero">
            <header className="x-home-welcome">
              <p className="x-home-date">{dateLabel}</p>
              <h1 className="x-home-greeting">{greeting}</h1>
              <p className="x-home-lede">
                Ask about deals, calls, and tasks — agents keep working while you chat.
              </p>
            </header>
            {agentStrip}
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
        ) : (
          <div className="x-home-thread">
            {agentStrip}
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

      <footer className="x-home-dock">
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
          <p className="x-home-dock-hint">Enter to send · Shift+Enter for new line</p>
        </div>
      </footer>
    </div>
  )
}
