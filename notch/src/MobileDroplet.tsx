import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssistResult } from '@shared/cluster'
import { clusterApi } from './lib/api'
import {
  buildAmbientContext,
  loadMobileSettings,
  type AmbientContext
} from './lib/mobile-settings'

type Phase = 'hidden' | 'pill' | 'chat'

type ChatMsg = {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  assist?: AssistResult
}

export default function MobileDroplet() {
  const [phase, setPhase] = useState<Phase>('hidden')
  const [query, setQuery] = useState('')
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [loading, setLoading] = useState(false)
  const [ambient, setAmbient] = useState<AmbientContext | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const refreshAmbient = useCallback(() => {
    const s = loadMobileSettings()
    if (s.ambientListen) setAmbient(buildAmbientContext(s.objective))
    else setAmbient(null)
  }, [])

  const applyPhase = useCallback(
    (p: string) => {
      setPhase(p as Phase)
      if (p === 'hidden') {
        setQuery('')
        setMessages([])
      }
      if (p === 'chat') {
        refreshAmbient()
        setTimeout(() => inputRef.current?.focus(), 60)
      }
    },
    [refreshAmbient]
  )

  useEffect(() => {
    void window.notch?.getMode?.().then((m) => applyPhase(m))
    return window.notch?.onMode?.(applyPhase)
  }, [applyPhase])

  useEffect(() => {
    const onSettings = () => refreshAmbient()
    window.addEventListener('notch:mobile-settings', onSettings)
    window.addEventListener('storage', onSettings)
    return () => {
      window.removeEventListener('notch:mobile-settings', onSettings)
      window.removeEventListener('storage', onSettings)
    }
  }, [refreshAmbient])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') window.notch?.hide?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const openChat = () => {
    if (phase !== 'chat') {
      window.notch?.chat?.()
      refreshAmbient()
    }
  }

  const onInputChange = (value: string) => {
    setQuery(value)
    if (value.length > 0 && phase === 'pill') openChat()
  }

  const send = async () => {
    const q = query.trim()
    if (!q || loading) return

    const settings = loadMobileSettings()
    setQuery('')
    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: 'user', text: q }])
    setLoading(true)

    try {
      const r = await clusterApi.assist(q, settings.objective)
      setMessages((m) => [
        ...m,
        { id: `a-${Date.now()}`, role: 'assistant', text: r.sayThis, assist: r }
      ])
    } catch {
      setMessages((m) => [
        ...m,
        { id: `e-${Date.now()}`, role: 'assistant', text: 'Could not reach Plumb — is the API running?' }
      ])
    } finally {
      setLoading(false)
    }
  }

  if (phase === 'hidden') return null

  if (phase === 'pill') {
    return (
      <div className="mobile-root mobile-drop-in">
        <button type="button" className="mobile-pill" onClick={openChat} aria-label="Open Plumb">
          <span className="mobile-pill-dot" />
          <div className="mobile-wave" aria-hidden>
            <span /><span /><span /><span />
          </div>
          <span className="mobile-pill-label">Plumb</span>
        </button>
        <input
          ref={inputRef}
          className="mobile-pill-capture"
          value={query}
          onChange={(e) => onInputChange(e.target.value)}
          onFocus={openChat}
          placeholder=""
          aria-label="Start typing to ask Plumb"
        />
      </div>
    )
  }

  return (
    <div className="mobile-root mobile-drop-in">
      <button type="button" className="mobile-pill mobile-pill-open" onClick={() => window.notch?.hide?.()}>
        <span className="mobile-pill-dot mobile-pill-dot-live" />
        <div className="mobile-wave" aria-hidden>
          <span /><span /><span /><span />
        </div>
        <span className="mobile-pill-label">Listening</span>
      </button>

      <div className="mobile-glass">
        {ambient && (
          <div className="mobile-ambient">
            <div className="mobile-ambient-head">
              <span className="mobile-ambient-badge">Ambient</span>
              <span className="mobile-ambient-elapsed">{ambient.elapsed} on call</span>
            </div>
            <p className="mobile-ambient-meeting">{ambient.meetingTitle}</p>
            <p className="mobile-ambient-topic">{ambient.activeTopic}</p>
            <div className="mobile-ambient-shift">
              <p className="mobile-ambient-shift-label">Objective lens</p>
              <p className="mobile-ambient-shift-text">{ambient.objectiveShift}</p>
            </div>
            <ul className="mobile-ambient-lines">
              {ambient.recentLines.map((l, i) => (
                <li key={i}>
                  <strong>{l.speaker}</strong> {l.text}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mobile-chat" ref={scrollRef}>
          {messages.length === 0 && (
            <p className="mobile-chat-hint">Ask anything — e.g. &quot;wtf is the answer&quot;</p>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`mobile-msg mobile-msg-${m.role}`}>
              {m.role === 'assistant' && m.assist ? (
                <>
                  <p className="mobile-msg-label">{m.assist.headline}</p>
                  <p className="mobile-msg-say">{m.assist.sayThis}</p>
                  {m.assist.agendaNext && (
                    <p className="mobile-msg-next">
                      <span>Talk track</span> {m.assist.agendaNext}
                    </p>
                  )}
                  {m.assist.trustNote && (
                    <p className="mobile-msg-trust">{m.assist.trustNote}</p>
                  )}
                  <p className="mobile-msg-sources">{m.assist.sources.join(' · ')}</p>
                </>
              ) : (
                <p>{m.text}</p>
              )}
            </div>
          ))}
          {loading && <p className="mobile-typing">Plumb is thinking…</p>}
        </div>

        <div className="mobile-compose">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void send()}
            placeholder="wtf is the answer"
            className="mobile-compose-input"
          />
          <button type="button" className="mobile-compose-send" onClick={() => void send()} disabled={!query.trim() || loading}>
            ↑
          </button>
        </div>
      </div>
    </div>
  )
}
