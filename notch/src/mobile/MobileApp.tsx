import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssistResult } from '@shared/cluster'
import type { MobileContext } from '@shared/mobile'
import { mobileApi } from '../lib/api'
import { loadMobileSettings } from '../lib/mobile-settings'
import { AgendaTracker } from './components/AgendaTracker'
import { ContextStrip } from './components/ContextStrip'
import { GuideQuestions } from './components/GuideQuestions'
import { LiveAnswer } from './components/LiveAnswer'
import { MeetingPanel } from './components/MeetingPanel'

type Phase = 'hidden' | 'open'

export default function MobileApp() {
  const [phase, setPhase] = useState<Phase>('hidden')
  const [ctx, setCtx] = useState<MobileContext | null>(null)
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<AssistResult | null>(null)
  const [loading, setLoading] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const refreshContext = useCallback(() => {
    void mobileApi.context().then(setCtx).catch(() => setCtx(null))
  }, [])

  useEffect(() => {
    void window.notch?.getMode?.().then((m) => setPhase(m === 'hidden' ? 'hidden' : 'open'))
    return window.notch?.onMode?.((m) => setPhase(m === 'hidden' ? 'hidden' : 'open'))
  }, [])

  useEffect(() => {
    return window.notch?.onFocusSearch?.(() => {
      setTimeout(() => searchRef.current?.focus(), 40)
    })
  }, [])

  useEffect(() => {
    if (phase !== 'open') return
    refreshContext()
    const t = setInterval(refreshContext, 8000)
    return () => clearInterval(t)
  }, [phase, refreshContext])

  useEffect(() => {
    const onSettings = () => refreshContext()
    window.addEventListener('notch:mobile-settings', onSettings)
    return () => window.removeEventListener('notch:mobile-settings', onSettings)
  }, [refreshContext])

  useEffect(() => {
    return window.notch?.onSimRefresh?.(() => refreshContext())
  }, [refreshContext])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') window.notch?.hide?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const submit = async () => {
    const q = query.trim()
    if (!q || loading) return
    setQuery('')
    setLoading(true)
    setResult(null)
    try {
      const r = await mobileApi.assist(q)
      setResult(r)
    } finally {
      setLoading(false)
    }
  }

  if (phase === 'hidden') return null

  const settings = loadMobileSettings()
  const placeholder =
    ctx?.phase === 'live_call'
      ? 'What do you need? Ask anything — we\'re listening…'
      : 'Search cases, signals, people…'

  return (
    <div className="mobile-root">
      <div className="mobile-panel">
        <div className="pill-header">
          <div className="pill-dot" data-live={ctx?.phase === 'live_call'} />
          <span className="pill-name">stream</span>
          {ctx?.dealName && <span className="pill-call">{ctx.dealName}</span>}
          <button type="button" className="pill-close" onClick={() => window.notch?.hide?.()}>
            ⌘⇧M
          </button>
        </div>

        {ctx?.agenda && <AgendaTracker agenda={ctx.agenda} />}

        <MeetingPanel />

        <div className="mobile-body">
          {ctx && (
            <div className="ambient-banner">
              <p className="ambient-title">
                {settings.ambientListen ? '● Ambient · listening' : 'Ambient off'}
                {ctx.elapsed ? ` · ${ctx.elapsed}` : ''}
              </p>
              <p className="ambient-note">{ctx.objectiveNote}</p>
              <p className="ambient-line">Drag header to move this panel.</p>
            </div>
          )}

          <input
            ref={searchRef}
            autoFocus
            className="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            placeholder={placeholder}
          />

          {ctx && <ContextStrip chips={ctx.chips} />}

          <LiveAnswer result={result} loading={loading} />
          {result?.guideQuestions && <GuideQuestions questions={result.guideQuestions} />}
        </div>

        <div className="mobile-actions">
          <button type="button" className="ma-btn" onClick={() => void submit()}>
            Next step ↗
          </button>
          <button type="button" className="ma-btn ma-btn-muted" onClick={() => void mobileApi.startCall().then(refreshContext)}>
            Sim call
          </button>
        </div>
      </div>
    </div>
  )
}
