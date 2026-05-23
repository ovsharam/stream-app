import { useState } from 'react'
import type { StreamSource, StreamItem } from '@shared/types'
import { useStreamStore } from '@/store/streamStore'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/lib/api'
import { buildQuerySystemPrompt } from '@/lib/contextBuilder'
import { INTERACTIVE_DEMO } from '@/hooks/useInteractiveDemo'
import { v4 as uuidv4 } from 'uuid'

type RouteMode = 'smart' | StreamSource

const SOURCES: { id: RouteMode; label: string }[] = [
  { id: 'smart', label: 'smart' },
  { id: 'gmail', label: 'gmail' },
  { id: 'slack', label: 'slack' },
  { id: 'x', label: 'x' },
  { id: 'perplexity', label: 'perplexity' },
  { id: 'note', label: 'note' }
]

export function AIBar() {
  const [input, setInput] = useState('')
  const [route, setRoute] = useState<RouteMode>('smart')
  const [sending, setSending] = useState(false)
  const items = useStreamStore((s) => s.items)
  const upsertItem = useStreamStore((s) => s.upsertItem)
  const pushLiveItem = useStreamStore((s) => s.pushLiveItem)
  const connected = useAuthStore((s) => s.connected)

  const demoReply = (query: string): StreamItem => {
    const unread = items.filter((i) => i.isUnread)
    const top = unread[0]
    const summary = top
      ? `Start with ${top.source} from ${top.sender.name}: "${top.body.slice(0, 60)}…"`
      : 'Your stream is calm right now — nothing urgent.'
    return {
      id: `demo-live-${uuidv4()}`,
      source: 'perplexity',
      sender: { name: 'Perplexity', handle: 'assistant' },
      timestamp: new Date(),
      title: query,
      body: `${summary} (${unread.length} unread signals in context.)`,
      bodyFull: summary,
      isUnread: true,
      isStarred: false,
      metadata: {}
    }
  }

  const handleSubmit = async () => {
    const text = input.trim()
    if (!text || sending) return

    setSending(true)
    setInput('')

    try {
      if (text.startsWith('/note')) {
        const body = text.replace(/^\/note\s*/, '')
        if (INTERACTIVE_DEMO) {
          pushLiveItem({
            id: `demo-live-${uuidv4()}`,
            source: 'note',
            sender: { name: 'You', handle: 'local' },
            timestamp: new Date(),
            body,
            bodyFull: body,
            isUnread: false,
            isStarred: false,
            metadata: {}
          })
        } else {
          const note = await api.createNote(body)
          upsertItem(note)
        }
        return
      }

      if (text.startsWith('/reply')) {
        // Phase 2: route to source reply API
        return
      }

      const isQuestion = text.includes('?') || /^(what|why|how|when|who|where|is|are|can|should)\b/i.test(text)

      if (isQuestion && (route === 'smart' || route === 'perplexity')) {
        if (INTERACTIVE_DEMO) {
          await new Promise((r) => setTimeout(r, 700))
          pushLiveItem(demoReply(text))
          return
        }
        if (!connected.perplexity) {
          alert('Connect Perplexity with an API key to ask questions.')
          return
        }
        const systemPrompt = buildQuerySystemPrompt(items)
        const response = await api.askAI(text, systemPrompt)
        upsertItem(response)
        return
      }

      if (route === 'note' || (!isQuestion && route === 'smart')) {
        if (INTERACTIVE_DEMO) {
          pushLiveItem({
            id: `demo-live-${uuidv4()}`,
            source: 'note',
            sender: { name: 'You', handle: 'local' },
            timestamp: new Date(),
            body: text,
            bodyFull: text,
            isUnread: false,
            isStarred: false,
            metadata: {}
          })
        } else {
          const note = await api.createNote(text)
          upsertItem(note)
        }
        return
      }

      if (INTERACTIVE_DEMO) {
        await new Promise((r) => setTimeout(r, 500))
        pushLiveItem(demoReply(text))
        return
      }

      if (connected.perplexity) {
        const systemPrompt = buildQuerySystemPrompt(items)
        const response = await api.askAI(text, systemPrompt)
        upsertItem(response)
      } else {
        const note = await api.createNote(text)
        upsertItem(note)
      }
    } catch (err) {
      console.error(err)
      alert(String(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 mx-auto flex h-aibar max-w-lg items-center gap-2 border-t border-stream-border bg-stream-surface px-3"
      style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom))' }}
    >
      <select
        value={route}
        onChange={(e) => setRoute(e.target.value as RouteMode)}
        className="rounded border border-stream-border bg-stream-bg px-2 py-1.5 font-mono text-xs text-stream-primary outline-none"
      >
        {SOURCES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>

      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void handleSubmit()}
        placeholder={
          sending
            ? 'Thinking…'
            : INTERACTIVE_DEMO
              ? 'Try: what needs attention?'
              : 'ask about your stream, reply, capture...'
        }
        className={`min-w-0 flex-1 rounded border bg-stream-bg px-3 py-2 font-sans text-sm text-stream-primary placeholder:text-stream-secondary outline-none focus:border-stream-perplexity/50 ${
          sending ? 'border-stream-perplexity/60 ai-thinking' : 'border-stream-border'
        }`}
        disabled={sending}
      />

      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={sending || !input.trim()}
        className="rounded bg-stream-perplexity px-4 py-2 font-mono text-xs font-medium text-stream-bg transition-opacity disabled:opacity-40"
      >
        {sending ? '…' : 'Send'}
      </button>
    </div>
  )
}
