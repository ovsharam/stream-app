import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Product chat — ask the product graph anything, get a grounded answer.
 *
 * Every answer cites the graph nodes it used and carries their roadmap
 * position (GA / beta / upcoming / requested / not planned / deprecated).
 * Zero coverage = explicit refusal, never a guess.
 */

function resolveApiBase(): string {
  if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).__PLUMB_API_URL__) {
    return String((window as unknown as Record<string, unknown>).__PLUMB_API_URL__)
  }
  return 'http://localhost:3131'
}

const API = resolveApiBase()
const CUSTOMER_ID = 'org' // local-dev fallback; production resolves org from JWT server-side

type MatchedNode = {
  id: string
  label: string
  name: string
  description: string
  availability: string
  mentionCount: number
  lastConfirmedAt?: number
}

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  nodes?: MatchedNode[]
  noCoverage?: boolean
  error?: boolean
}

const AVAILABILITY_COLORS: Record<string, string> = {
  ga: '#1db584',
  beta: '#3e78c8',
  upcoming: '#8b5cf6',
  requested: '#f59e0b',
  not_planned: '#e05252',
  deprecated: '#6b7280'
}

const AVAILABILITY_LABELS: Record<string, string> = {
  ga: 'GA',
  beta: 'Beta',
  upcoming: 'Upcoming',
  requested: 'Requested',
  not_planned: 'Not planned',
  deprecated: 'Deprecated'
}

const SUGGESTED_QUESTIONS = [
  'Can we do SSO / SAML today?',
  'What are our known API rate limits?',
  'Is there a workaround for bulk imports?',
  'What integrations do we support right now?'
]

function NodeChip({ node }: { node: MatchedNode }) {
  const color = AVAILABILITY_COLORS[node.availability] ?? 'var(--x-muted)'
  const demand =
    node.availability === 'requested' && node.mentionCount > 1 ? ` ·${node.mentionCount}×` : ''
  return (
    <span className="x-pchat-node-chip" title={node.description}>
      <span className="x-pchat-node-dot" style={{ background: color }} />
      {node.name}
      <span className="x-pchat-node-avail" style={{ color }}>
        {AVAILABILITY_LABELS[node.availability] ?? node.availability}
        {demand}
      </span>
    </span>
  )
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === 'user') {
    return (
      <div className="x-pchat-row x-pchat-row-user">
        <div className="x-pchat-bubble x-pchat-bubble-user">{msg.content}</div>
      </div>
    )
  }
  return (
    <div className="x-pchat-row">
      <div
        className={`x-pchat-bubble x-pchat-bubble-assistant${msg.noCoverage ? ' x-pchat-bubble-nocov' : ''}${msg.error ? ' x-pchat-bubble-error' : ''}`}
      >
        {msg.nodes && msg.nodes.length > 0 ? (
          <div className="x-pchat-citations">
            {msg.nodes.slice(0, 8).map((n) => (
              <NodeChip key={n.id} node={n} />
            ))}
            {msg.nodes.length > 8 ? (
              <span className="x-pchat-node-more">+{msg.nodes.length - 8} more</span>
            ) : null}
          </div>
        ) : null}
        {msg.noCoverage ? (
          <div className="x-pchat-nocov-head">No graph coverage</div>
        ) : null}
        <div className="x-pchat-answer">{msg.content}</div>
      </div>
    </div>
  )
}

export function ProductChatView() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim()
      if (!q || streaming) return
      setInput('')
      setStreaming(true)

      // History = prior turns (before this question), assistant refusals excluded
      const history = messages
        .filter((m) => !m.noCoverage && !m.error)
        .map((m) => ({ role: m.role, content: m.content }))

      setMessages((prev) => [
        ...prev,
        { role: 'user', content: q },
        { role: 'assistant', content: '' }
      ])

      const patchLast = (patch: Partial<ChatMessage>) => {
        setMessages((prev) => {
          const next = [...prev]
          next[next.length - 1] = { ...next[next.length - 1], ...patch }
          return next
        })
      }

      try {
        const res = await fetch(`${API}/api/product-graph/chat`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerId: CUSTOMER_ID, question: q, history })
        })
        if (!res.ok || !res.body) {
          const err = (await res.json().catch(() => null)) as { error?: string } | null
          patchLast({ content: err?.error ?? `Request failed (${res.status})`, error: true })
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let answer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split('\n\n')
          buffer = parts.pop() ?? ''
          for (const part of parts) {
            if (!part.startsWith('data: ')) continue
            try {
              const data = JSON.parse(part.slice(6)) as {
                event: string
                text?: string
                message?: string
                nodes?: MatchedNode[]
              }
              if (data.event === 'nodes') {
                patchLast({ nodes: data.nodes ?? [] })
              } else if (data.event === 'delta') {
                answer += data.text ?? ''
                patchLast({ content: answer })
              } else if (data.event === 'no_coverage') {
                patchLast({ content: data.message ?? 'No graph coverage.', noCoverage: true })
              } else if (data.event === 'error') {
                patchLast({ content: data.message ?? 'Something went wrong.', error: true })
              }
            } catch {
              /* invalid chunk */
            }
          }
        }
      } catch (e) {
        patchLast({ content: (e as Error).message, error: true })
      } finally {
        setStreaming(false)
        inputRef.current?.focus()
      }
    },
    [messages, streaming]
  )

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void ask(input)
    }
  }

  return (
    <div className="x-pchat">
      <header className="x-pchat-head">
        <div>
          <h1 className="x-pchat-title">Product</h1>
          <p className="x-pchat-sub">
            Grounded in your product graph — answers cite nodes and their roadmap status. No
            coverage means no guessing.
          </p>
        </div>
      </header>

      <div className="x-pchat-scroll">
        {messages.length === 0 ? (
          <div className="x-pchat-empty">
            <p className="x-pchat-empty-title">Ask the product graph</p>
            <p className="x-pchat-empty-sub">
              “Can the product do X?” · “Is Y on the roadmap?” · “What’s the workaround for Z?”
            </p>
            <div className="x-pchat-suggestions">
              {SUGGESTED_QUESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="x-pchat-suggestion"
                  onClick={() => void ask(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => <MessageBubble key={i} msg={m} />)
        )}
        {streaming ? <div className="x-pchat-streaming-dot" aria-label="Answering…" /> : null}
        <div ref={bottomRef} />
      </div>

      <div className="x-pchat-composer">
        <textarea
          ref={inputRef}
          className="x-pchat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask what the product can do, what's coming, what's blocked…"
          rows={2}
          disabled={streaming}
        />
        <button
          type="button"
          className="x-pchat-send"
          onClick={() => void ask(input)}
          disabled={streaming || !input.trim()}
        >
          {streaming ? 'Answering…' : 'Ask'}
        </button>
      </div>
    </div>
  )
}
