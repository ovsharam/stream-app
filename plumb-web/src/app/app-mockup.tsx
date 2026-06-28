'use client'

import { useEffect, useRef, useState } from 'react'

const mono = { fontFamily: 'var(--font-jetbrains), monospace' } as const
const TEAL  = '#1db584'
const INK   = '#0c0c0c'
const MUTED = '#6b6b6b'
const LINE  = '#e5e5e5'
const PAPER = '#f7f7f5'

/* ──────────────────────────────────────────────────────────────────────
   HERO: Pipeline Kanban mockup
   Phases:
     0 – board at rest                      (6s)
     1 – new Acme Corp deal slides in, score counts to 82  (7s)
     2 – detail panel opens, build brief visible            (6s)
     3 – FDE approves, deal card moves to Build             (7s)
     4 – build completes, card moves to Live ✓              (4s → loop)
────────────────────────────────────────────────────────────────────── */

type Col = 'intake' | 'build' | 'live' | 'paused'
type Deal = { id: string; client: string; date: string; score: number | null; desc: string; col: Col; tags?: string[]; isNew?: boolean }

const BASE_DEALS: Deal[] = [
  { id:'d1', client:'Valerie Simashkevich', date:'Jun 27', score: null, col:'intake', desc:'LinkedIn inbound — scope TBD', tags:['agent','LinkedIn'] },
  { id:'d2', client:'LinkedIn Contact',     date:'Jun 24', score: null, col:'intake', desc:'LinkedIn inbound — schedule new', tags:['agent','LinkedIn'] },
  { id:'d3', client:'Northwind Corp',       date:'Jun 20', score:44,    col:'intake', desc:'AE gap · OAuth scope not captured' },
  { id:'d4', client:'Fairway Pro',          date:'Jun 18', score:94,    col:'live',   desc:'Shipped · CRM lookup · Salesforce' },
  { id:'d5', client:'Beta Systems',         date:'Jun 4',  score:null,  col:'paused', desc:'No transcript provided' },
]

const ACME: Deal = { id:'acme', client:'Acme Corp', date:'Jun 27', score:0, col:'intake', desc:'CRM lookup on inbound · Salesforce', isNew:true }

const BUILD_LOG_LINES = [
  'Build prompt dispatched → Claude Code',
  'Cloning repo · acme-corp-integration',
  'OAuth2 scaffold generated',
  'Salesforce REST client wired',
  'Latency test: 142ms avg · ✓',
  'Deploy · prod · acme-corp.useplumb.ai',
  '✓ Customer live',
]

const PHASE_MS = [6000, 7000, 6000, 7000, 4000]

const FEED_SIGNALS = [
  { tag: 'NEW',   client: 'Acme Corp',     detail: 'CRM lookup on inbound · Salesforce', ts: '09:14', score: null,  col: TEAL,      isNew: true  },
  { tag: 'ALERT', client: 'Northwind Corp',detail: 'AE gap · OAuth scope not captured',  ts: '09:16', score: 44,    col: '#f59e0b', isNew: false },
  { tag: 'BUILD', client: 'FDE-109',       detail: 'Build prompt dispatched → Claude Code', ts: '10:03', score: null, col: '#8b5cf6', isNew: false },
  { tag: 'LIVE',  client: 'Fairway Pro',   detail: 'Shipped · CRM lookup · Salesforce',  ts: '10:31', score: 94,   col: '#22c55e', isNew: false },
]

export function PlumbHeroMockup() {
  const [phase, setPhase]           = useState(0)
  const [deals, setDeals]           = useState<Deal[]>(BASE_DEALS)
  const [score, setScore]           = useState(0)
  const [panelOpen, setPanelOpen]   = useState(false)
  const [approved, setApproved]     = useState(false)
  const [buildLines, setBuildLines] = useState(0)
  const [flashId, setFlashId]       = useState<string|null>(null)
  const [feedNew, setFeedNew]       = useState(false)
  const phaseRef = useRef(0)

  const reset = () => {
    setDeals(BASE_DEALS); setScore(0); setPanelOpen(false)
    setApproved(false); setBuildLines(0); setFlashId(null); setFeedNew(false)
  }

  // Master phase ticker
  useEffect(() => {
    const tick = () => {
      const next = (phaseRef.current + 1) % 5
      phaseRef.current = next
      setPhase(next)
      if (next === 0) reset()
      setTimeout(tick, PHASE_MS[next])
    }
    const t = setTimeout(tick, PHASE_MS[0])
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Phase 0: Feed view — new Acme signal slides in after 1.8s
  useEffect(() => {
    if (phase !== 0) return
    const t = setTimeout(() => setFeedNew(true), 1800)
    return () => clearTimeout(t)
  }, [phase])

  // Phase 1: add Acme deal + count score to 82
  useEffect(() => {
    if (phase !== 1) return
    setDeals(prev => [ACME, ...prev])
    let n = 0
    const t = setInterval(() => {
      n += 2; setScore(Math.min(n, 82))
      if (n >= 82) clearInterval(t)
    }, 50)
    return () => clearInterval(t)
  }, [phase])

  // Phase 2: open detail panel
  useEffect(() => { if (phase === 2) setPanelOpen(true) }, [phase])

  // Phase 3: approve flash → move acme to Build + log
  useEffect(() => {
    if (phase !== 3) return
    setTimeout(() => {
      setApproved(true)
      setFlashId('acme')
      setTimeout(() => {
        setDeals(prev => prev.map(d => d.id === 'acme' ? { ...d, col: 'build', isNew: false } : d))
        setFlashId(null)
      }, 700)
      let i = 0
      const t = setInterval(() => { i++; setBuildLines(i); if (i >= BUILD_LOG_LINES.length) clearInterval(t) }, 800)
      return () => clearInterval(t)
    }, 600)
  }, [phase])

  // Phase 4: move acme to Live
  useEffect(() => {
    if (phase !== 4) return
    setDeals(prev => prev.map(d => d.id === 'acme' ? { ...d, col: 'live', score: 82 } : d))
  }, [phase])

  const cols: { id: Col; label: string; sub: string }[] = [
    { id:'intake',  label:'Intake',  sub:'Technical buyer surfaced · AE gap · scope the mismatch' },
    { id:'build',   label:'Build',   sub:'FDE solutioning · POC · custom software path' },
    { id:'live',    label:'Live',    sub:'White-glove onboard · support · expansion' },
    { id:'paused',  label:'Paused',  sub:'Stalled pipeline · revisit later' },
  ]

  const acmeDeal = deals.find(d => d.id === 'acme')
  const displayScore = phase >= 1 ? score : 0

  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${LINE}`, background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 24px 70px rgba(0,0,0,0.09)', display: 'flex', flexDirection: 'column' }}>

      {/* macOS chrome */}
      <div style={{ height: 42, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7, padding: '0 16px', background: '#f0eeeb', borderBottom: `1px solid ${LINE}` }}>
        {['#ff5f57','#ffbd2e','#28ca41'].map(c => <span key={c} style={{ width: 11, height: 11, borderRadius: '50%', background: c, display: 'block' }} />)}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: '#888' }}>Plumb · Work OS</span>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span className="blink" style={{ width: 6, height: 6, borderRadius: '50%', background: TEAL, display: 'block' }} />
          <span style={{ fontSize: 9.5, color: '#aaa', ...mono }}>8 deals · 3 agent drafts</span>
        </span>
      </div>

      {/* App body */}
      <div style={{ display: 'flex', height: 580, overflow: 'hidden' }}>

        {/* Sidebar */}
        <div style={{ width: 156, flexShrink: 0, borderRight: `1px solid ${LINE}`, background: PAPER, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '14px 14px 8px', display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>P</span>
            </div>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: INK, letterSpacing: '-0.01em' }}>Plumb</span>
            <span style={{ fontSize: 9.5, color: '#aaa', marginLeft: 'auto' }}>Work OS</span>
          </div>
          <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
            {[
              { label: 'Home',      icon: '⌂', id: 'home'     },
              { label: 'Feed',      icon: '≡', id: 'feed'     },
              { label: 'Pipeline',  icon: '↗', id: 'pipeline' },
              { label: 'Notes',     icon: '✎', id: 'notes'    },
              { label: 'Mind',      icon: '⬡', id: 'mind'     },
              { label: 'Build Dojo',icon: '◈', id: 'build'    },
            ].map(n => {
              const active = phase === 0 ? n.id === 'feed' : n.id === 'pipeline'
              return (
                <div key={n.label} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 8px', borderRadius: 6, background: active ? 'rgba(0,0,0,0.05)' : 'transparent', borderLeft: active ? `2px solid ${TEAL}` : '2px solid transparent', cursor: 'default' }}>
                  <span style={{ fontSize: 12, color: active ? INK : '#bbb', width: 14, textAlign: 'center' as const }}>{n.icon}</span>
                  <span style={{ fontSize: 11.5, color: active ? INK : '#aaa', fontWeight: active ? 600 : 400 }}>{n.label}</span>
                </div>
              )
            })}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ padding: '8px', borderTop: `1px solid ${LINE}` }}>
            {[{ label: 'Apps', icon: '⊞' }, { label: 'Settings', icon: '⚙' }].map(n => (
              <div key={n.label} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 8px', cursor: 'default' }}>
                <span style={{ fontSize: 12, color: '#ccc', width: 14, textAlign: 'center' as const }}>{n.icon}</span>
                <span style={{ fontSize: 11.5, color: '#bbb' }}>{n.label}</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 8px', cursor: 'default', marginTop: 2 }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(204,120,92,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#cc785c', flexShrink: 0 }}>AE</div>
              <div>
                <p style={{ fontSize: 10.5, fontWeight: 600, color: INK, lineHeight: 1 }}>Apoorva</p>
                <p style={{ fontSize: 9.5, color: '#aaa', ...mono }}>@ae</p>
              </div>
            </div>
          </div>
        </div>

        {/* Main: Feed (phase 0) or Kanban (phase 1+) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* ── Feed view ── */}
          {phase === 0 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '11px 16px', borderBottom: `1px solid ${LINE}`, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, background: PAPER }}>
                <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, letterSpacing: '-0.02em' }}>Feed</p>
                <span className="blink" style={{ width: 5, height: 5, borderRadius: '50%', background: TEAL, display: 'block', marginLeft: 4 }} />
                <span style={{ fontSize: 10, color: MUTED }}>live</span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                {/* New Acme signal slides in once feedNew is true */}
                {feedNew && FEED_SIGNALS.filter(s => s.isNew).map(sig => (
                  <div key={sig.client} className="feed-new" style={{ padding: '11px 16px', borderBottom: `1px solid ${LINE}`, display: 'flex', alignItems: 'flex-start', gap: 10, background: 'rgba(29,181,132,0.04)' }}>
                    <span style={{ fontSize: 8.5, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: `${sig.col}18`, color: sig.col, flexShrink: 0, letterSpacing: '0.05em', marginTop: 1, ...mono }}>{sig.tag}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12.5, fontWeight: 600, color: INK, marginBottom: 2 }}>{sig.client}</p>
                      <p style={{ fontSize: 11, color: MUTED }}>{sig.detail}</p>
                    </div>
                    <span style={{ fontSize: 10, color: '#bbb', flexShrink: 0, ...mono }}>{sig.ts}</span>
                  </div>
                ))}
                {FEED_SIGNALS.filter(s => !s.isNew).map(sig => (
                  <div key={sig.client} style={{ padding: '11px 16px', borderBottom: `1px solid ${LINE}`, display: 'flex', alignItems: 'flex-start', gap: 10, background: '#fff' }}>
                    <span style={{ fontSize: 8.5, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: `${sig.col}18`, color: sig.col, flexShrink: 0, letterSpacing: '0.05em', marginTop: 1, ...mono }}>{sig.tag}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <p style={{ fontSize: 12.5, fontWeight: 600, color: INK }}>{sig.client}</p>
                        {sig.score !== null && <span style={{ fontSize: 9.5, fontWeight: 700, color: sig.score >= 60 ? TEAL : '#f59e0b', ...mono }}>{sig.score}</span>}
                      </div>
                      <p style={{ fontSize: 11, color: MUTED }}>{sig.detail}</p>
                    </div>
                    <span style={{ fontSize: 10, color: '#bbb', flexShrink: 0, ...mono }}>{sig.ts}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Kanban toolbar (phases 1+) ── */}
          {phase > 0 && <div style={{ padding: '12px 16px', borderBottom: `1px solid ${LINE}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: INK, letterSpacing: '-0.02em' }}>Pipeline</p>
            <span style={{ fontSize: 10.5, color: '#aaa' }}>8 deals</span>
            <span style={{ fontSize: 10.5, color: '#aaa' }}>·</span>
            <span style={{ fontSize: 10.5, color: '#aaa' }}>3 agent drafts</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 10.5, padding: '4px 11px', borderRadius: 6, background: INK, color: '#fff', fontWeight: 600, cursor: 'default' }}>+ New deal</span>
          </div>}

          {/* Column headers (phases 1+) */}
          {phase > 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: `1px solid ${LINE}`, flexShrink: 0 }}>
            {cols.map((col, i) => {
              const count = deals.filter(d => d.col === col.id).length
              return (
                <div key={col.id} style={{ padding: '9px 12px', borderLeft: i > 0 ? `1px solid ${LINE}` : 'none', display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: INK }}>{col.label}</span>
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: count > 0 ? 'rgba(0,0,0,0.07)' : LINE, color: count > 0 ? INK : '#bbb', fontWeight: 600, ...mono }}>{count}</span>
                </div>
              )
            })}
          </div>}

          {/* Cards area (phases 1+) */}
          {phase > 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', flex: 1, overflow: 'hidden' }}>
            {cols.map((col, ci) => {
              const colDeals = deals.filter(d => d.col === col.id)
              return (
                <div key={col.id} style={{ borderLeft: ci > 0 ? `1px solid ${LINE}` : 'none', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '6px 10px 4px', background: PAPER, borderBottom: `1px solid ${LINE}`, flexShrink: 0 }}>
                    <p style={{ fontSize: 9.5, color: '#aaa', lineHeight: 1.4 }}>{col.sub}</p>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {colDeals.length === 0 && (
                      <p style={{ fontSize: 10.5, color: '#ccc', padding: '8px 4px' }}>No deals</p>
                    )}
                    {colDeals.map(deal => (
                      <DealCard
                        key={deal.id}
                        deal={deal}
                        liveScore={deal.id === 'acme' && phase >= 1 ? displayScore : deal.score}
                        isActive={panelOpen && deal.id === 'acme'}
                        isFlashing={flashId === deal.id}
                        isLive={deal.col === 'live'}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>}
        </div>

        {/* Detail panel */}
        <div style={{ width: panelOpen ? 300 : 0, flexShrink: 0, borderLeft: panelOpen ? `1px solid ${LINE}` : 'none', overflow: 'hidden', transition: 'width 0.35s cubic-bezier(0.16,1,0.3,1)', background: '#fff', display: 'flex', flexDirection: 'column' }}>
          {panelOpen && acmeDeal && (
            <>
              <div style={{ padding: '12px 14px', borderBottom: `1px solid ${LINE}`, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: INK, flex: 1 }}>Acme Corp</p>
                  <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: 'rgba(29,181,132,0.08)', color: TEAL, fontWeight: 700, ...mono }}>{phase >= 3 && approved ? 'build' : 'intake'}</span>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div>
                    <p style={{ fontSize: 9, color: '#bbb', ...mono }}>context score</p>
                    <p style={{ fontSize: 20, fontWeight: 700, color: TEAL, letterSpacing: '-0.03em', ...mono, lineHeight: 1 }}>{displayScore}</p>
                    <p style={{ fontSize: 8.5, color: '#aaa', ...mono }}>/100 · gate clear</p>
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center' }}>
                    {[['Auth','OAuth2 only'],['Latency','<200ms'],['Stack','Salesforce'],['Scale','4K–6K']].map(([k,v]) => (
                      <div key={k} style={{ display: 'flex', gap: 5 }}>
                        <span style={{ fontSize: 9.5, color: '#bbb', width: 40, flexShrink: 0 }}>{k}</span>
                        <span style={{ fontSize: 9.5, color: INK, fontWeight: 500 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* AE ↔ FDE handoff */}
              <div style={{ padding: '10px 14px', borderBottom: `1px solid ${LINE}`, flexShrink: 0 }}>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', color: '#bbb', textTransform: 'uppercase' as const, ...mono, marginBottom: 7 }}>AE ↔ FDE handoff</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', gap: 7, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#2563eb', width: 24, ...mono }}>AE</span>
                    <p style={{ fontSize: 11, color: '#333', lineHeight: 1.5 }}>Monitor expansion signals. Budget approved by Sarah Chen.</p>
                  </div>
                  <div style={{ display: 'flex', gap: 7, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#7c3aed', width: 24, ...mono }}>FDE</span>
                    <p style={{ fontSize: 11, color: '#333', lineHeight: 1.5 }}>CRM lookup, Salesforce REST v57. Caching layer for 6K spike.</p>
                  </div>
                </div>
              </div>

              {/* Build section */}
              <div style={{ flex: 1, overflow: 'auto', padding: '10px 14px' }}>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', color: '#bbb', textTransform: 'uppercase' as const, ...mono, marginBottom: 7 }}>Build brief</p>
                {phase < 3 || !approved ? (
                  <>
                    {[
                      'Connect Salesforce OAuth2 on inbound webhook',
                      'Cache layer — Redis TTL 60s, fallback empty contact',
                      'Latency gate: p95 < 200ms',
                      'No HubSpot data touch',
                    ].map(item => (
                      <div key={item} style={{ display: 'flex', gap: 6, marginBottom: 5 }}>
                        <span style={{ fontSize: 10, color: '#ccc', flexShrink: 0, marginTop: 1 }}>○</span>
                        <p style={{ fontSize: 11, color: '#555', lineHeight: 1.5 }}>{item}</p>
                      </div>
                    ))}
                    <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                      <div style={{ flex: 1, padding: '7px 10px', border: `1px solid ${LINE}`, borderRadius: 6, fontSize: 11, color: MUTED, textAlign: 'center' as const, cursor: 'default' }}>Review call</div>
                      <div style={{ flex: 1, padding: '7px 10px', background: INK, borderRadius: 6, fontSize: 11, fontWeight: 700, color: '#fff', textAlign: 'center' as const, cursor: 'default', transition: 'all 0.2s' }}>FDE → Build</div>
                    </div>
                  </>
                ) : (
                  <div style={{ background: '#0d0d0d', borderRadius: 8, padding: '10px 12px', ...mono, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {BUILD_LOG_LINES.slice(0, buildLines).map((line, i) => (
                      <div key={i} className="msg-in" style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                        <span style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>›</span>
                        <span style={{ fontSize: 10, color: line.startsWith('✓') ? TEAL : 'rgba(255,255,255,0.55)' }}>{line}</span>
                      </div>
                    ))}
                    {buildLines < BUILD_LOG_LINES.length && (
                      <div style={{ display: 'flex', gap: 4, paddingTop: 2 }}>
                        <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function DealCard({ deal, liveScore, isActive, isFlashing, isLive }: { deal: Deal; liveScore: number | null; isActive: boolean; isFlashing: boolean; isLive: boolean }) {
  const scoreColor = liveScore === null ? '#ccc' : liveScore < 60 ? '#ef4444' : liveScore < 78 ? '#f59e0b' : TEAL
  return (
    <div className={deal.isNew ? 'feed-new' : undefined} style={{ padding: '9px 10px', borderRadius: 8, border: `1px solid ${isActive ? TEAL + '44' : isFlashing ? '#f59e0b44' : LINE}`, background: isActive ? 'rgba(29,181,132,0.03)' : isFlashing ? 'rgba(245,158,11,0.04)' : '#fff', transition: 'all 0.4s', cursor: 'default' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: INK, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{deal.client}</p>
        {isLive && liveScore !== null && (
          <span style={{ fontSize: 8.5, padding: '1px 5px', borderRadius: 3, background: 'rgba(29,181,132,0.1)', color: TEAL, fontWeight: 700, ...mono, flexShrink: 0 }}>{liveScore}</span>
        )}
        {!isLive && liveScore !== null && (
          <span style={{ fontSize: 9, fontWeight: 700, color: scoreColor, ...mono, flexShrink: 0, transition: 'color 0.3s' }}>{liveScore}</span>
        )}
      </div>
      <p style={{ fontSize: 10, color: MUTED, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, lineHeight: 1.4 }}>{deal.desc}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 9, color: '#ccc', ...mono }}>{deal.date}</span>
        {(deal.tags ?? []).map(t => (
          <span key={t} style={{ fontSize: 8.5, padding: '1px 5px', borderRadius: 3, background: 'rgba(0,0,0,0.05)', color: '#888', ...mono }}>{t}</span>
        ))}
        {isLive && <span style={{ marginLeft: 'auto', fontSize: 9, color: TEAL, fontWeight: 700 }}>✓ live</span>}
      </div>
      {deal.id === 'acme' && liveScore !== null && liveScore > 0 && !isLive && (
        <div style={{ marginTop: 5, height: 2, background: LINE, borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${liveScore}%`, background: scoreColor, borderRadius: 99, transition: 'width 0.05s, background 0.4s' }} />
        </div>
      )}
    </div>
  )
}

/* ── Mind knowledge graph mockup ────────────────────────────────────── */

type NodeId = 'acme'|'sarah'|'marcus'|'sf'|'okta'|'oauth'|'lat'|'scale'|'crm'|'call12'|'call19'

const GNODES: { id: NodeId; label: string; sub?: string; x: number; y: number; r: number; color: string; fill: string; initials?: string }[] = [
  { id:'acme',   label:'Acme Corp',      x:220, y:155, r:22, color:'#2563eb', fill:'#dbeafe', initials:'AC' },
  { id:'sarah',  label:'Sarah Chen',     sub:'VP Engineering', x:80,  y:68,  r:18, color:'#7c3aed', fill:'#ede9fe', initials:'SC' },
  { id:'marcus', label:'Marcus Webb',    sub:'Sec. Arch. ↑',   x:80,  y:242, r:18, color:'#dc2626', fill:'#fee2e2', initials:'MW' },
  { id:'sf',     label:'Salesforce',     x:358, y:72,  r:14, color:'#0ea5e9', fill:'#e0f2fe' },
  { id:'okta',   label:'Okta',           x:368, y:232, r:14, color:'#f59e0b', fill:'#fef3c7' },
  { id:'oauth',  label:'OAuth2',         sub:'hard req',       x:190, y:30,  r:12, color:'#7c3aed', fill:'#ede9fe' },
  { id:'lat',    label:'<200ms',         sub:'hard req',       x:402, y:148, r:12, color:TEAL,      fill:'#d1fae5' },
  { id:'scale',  label:'4K concurrent', sub:'6K spike',        x:375, y:292, r:12, color:'#dc2626', fill:'#fee2e2' },
  { id:'crm',    label:'CRM lookup',     x:190, y:295, r:12, color:'#f59e0b', fill:'#fef3c7' },
  { id:'call12', label:'Jun 12',         sub:'discovery',      x:42,  y:148, r:9,  color:'#aaa',    fill:'#f5f5f5' },
  { id:'call19', label:'Jun 19',         sub:'follow-up',      x:42,  y:240, r:9,  color:'#aaa',    fill:'#f5f5f5' },
]

const GEDGES: [NodeId, NodeId][] = [
  ['acme','sarah'],['acme','marcus'],['acme','sf'],['acme','okta'],['acme','crm'],
  ['sarah','oauth'],['sarah','lat'],['marcus','oauth'],['okta','oauth'],
  ['sf','crm'],['crm','lat'],['crm','scale'],
  ['call12','sarah'],['call12','marcus'],['call12','oauth'],['call12','lat'],
  ['call19','acme'],['call19','scale'],
]

const MIND_QA = [
  { q: "What's Marcus blocking on OAuth?", active: ['marcus','oauth','okta','call12'] as NodeId[], a: `Marcus (Principal Sec. Arch. as of Jun 20) flagged refresh token storage in localStorage as a hard blocker — Jun 12, 34:18.\n\n"If the token lives in the browser I can't sign off. Full stop."\n\nOkta is already live at Acme so OAuth app registration is same-day. Use httpOnly cookies — address it before he asks.` },
  { q: "What's the real scale target?",    active: ['scale','crm','acme','call19'] as NodeId[], a: `Sarah quoted 4K peak concurrent — but the real ceiling is 6K.\n\nThey hit 6K during the Super Bowl campaign in March. Another one planned for November. That's the actual design target.\n\nSize the caching layer for 6K. Don't let them anchor to 4K.` },
  { q: "What does Sarah actually care about?", active: ['sarah','lat','sf','crm'] as NodeId[], a: `Latency, above everything. Previous vendor sat at 450ms — she called it a "trust issue with the whole rollout" (Jun 12, 12:44).\n\nSalesforce is source of truth. She was explicit: don't touch HubSpot data.\n\nIf you're under 200ms and OAuth is clean, she approves.` },
]

function graphPath(ax: number, ay: number, bx: number, by: number) {
  const mx = (ax + bx) / 2, my = (ay + by) / 2
  const dx = bx - ax, dy = by - ay, len = Math.sqrt(dx * dx + dy * dy) || 1
  return `M ${ax} ${ay} Q ${mx + (-dy / len) * 18} ${my + (dx / len) * 18} ${bx} ${by}`
}

export function CallPrepMockup() {
  const [activeNodes, setActiveNodes] = useState<NodeId[]>(MIND_QA[0].active)
  const [msgKey,  setMsgKey]  = useState(0)
  const [currentQ, setCurrentQ] = useState(MIND_QA[0].q)
  const [currentA, setCurrentA] = useState<string | null>(MIND_QA[0].a)
  const [showTyping, setShowTyping] = useState(false)
  const [composing, setComposing] = useState('')
  const idx = useRef(1)

  useEffect(() => {
    const run = () => {
      const c = MIND_QA[idx.current % MIND_QA.length]; idx.current++
      let i = 0
      const t = setInterval(() => {
        i++; setComposing(c.q.slice(0, i))
        if (i >= c.q.length) {
          clearInterval(t)
          setTimeout(() => {
            setComposing('')
            setActiveNodes(c.active)
            setCurrentQ(c.q)
            setCurrentA(null)
            setShowTyping(true)
            setMsgKey(k => k + 1)
            setTimeout(() => { setShowTyping(false); setCurrentA(c.a) }, 2000)
          }, 300)
        }
      }, 40)
    }
    const t = setInterval(run, 13000)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${LINE}`, background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 24px 64px rgba(0,0,0,0.09)' }}>
      <div style={{ height: 42, display: 'flex', alignItems: 'center', gap: 7, padding: '0 16px', background: '#f0eeeb', borderBottom: `1px solid ${LINE}` }}>
        {['#ff5f57','#ffbd2e','#28ca41'].map(c => <span key={c} style={{ width: 11, height: 11, borderRadius: '50%', background: c, display: 'block' }} />)}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: '#777' }}>Plumb · Mind — Acme Corp</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 9.5, padding: '2px 9px', borderRadius: 4, background: 'rgba(29,181,132,0.08)', color: TEAL, fontWeight: 600, ...mono }}>47 nodes · 31 edges</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', height: 520 }}>
        {/* Graph — overflow hidden, no scroll */}
        <div style={{ background: PAPER, position: 'relative', borderRight: `1px solid ${LINE}`, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 10, left: 14, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.07em', color: '#ccc', textTransform: 'uppercase' as const, ...mono }}>Knowledge graph · Acme Corp</div>
          <svg viewBox="0 0 440 330" style={{ width: '100%', height: '100%' }} aria-hidden>
            {GEDGES.map(([a, b]) => {
              const na = GNODES.find(n => n.id === a)!, nb = GNODES.find(n => n.id === b)!
              const lit = activeNodes.includes(a) && activeNodes.includes(b)
              return <path key={`${a}-${b}`} d={graphPath(na.x, na.y, nb.x, nb.y)} fill="none" stroke={lit ? na.color : '#e2e2e2'} strokeWidth={lit ? 1.4 : 0.8} opacity={lit ? 0.8 : 1} style={{ transition: 'stroke 0.5s, stroke-width 0.5s' }} />
            })}
            {GNODES.map(n => {
              const active = activeNodes.includes(n.id)
              return (
                <g key={n.id}>
                  {active && <circle cx={n.x} cy={n.y} r={n.r + 7} fill={n.color} opacity={0.1} />}
                  <circle cx={n.x} cy={n.y} r={n.r} fill={active ? n.fill : '#fff'} stroke={active ? n.color : '#ddd'} strokeWidth={active ? 2 : 1} style={{ transition: 'all 0.5s' }} />
                  {n.initials
                    ? <text x={n.x} y={n.y + 1} textAnchor="middle" dominantBaseline="middle" fontSize={n.r * 0.65} fontWeight={700} fill={active ? n.color : '#bbb'} style={{ transition: 'fill 0.5s', fontFamily: 'system-ui,sans-serif' }}>{n.initials}</text>
                    : <text x={n.x} y={n.y + 1} textAnchor="middle" dominantBaseline="middle" fontSize={7.5} fontWeight={600} fill={active ? n.color : '#bbb'} style={{ transition: 'fill 0.5s', fontFamily: 'system-ui,sans-serif' }}>{n.label.split(' ')[0]}</text>
                  }
                  <text x={n.x} y={n.y + n.r + 10} textAnchor="middle" fontSize={7} fill={active ? '#333' : '#bbb'} style={{ transition: 'fill 0.5s', fontFamily: 'system-ui,sans-serif' }}>{n.label}</text>
                  {n.sub && <text x={n.x} y={n.y + n.r + 18} textAnchor="middle" fontSize={6} fill={active ? n.color : '#ccc'} style={{ transition: 'fill 0.5s', fontFamily: 'system-ui,sans-serif' }}>{n.sub}</text>}
                </g>
              )
            })}
          </svg>
        </div>
        {/* Chat — single message pair, no internal scroll */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${LINE}`, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, background: '#fafaf8' }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: `${TEAL}12`, border: `1.5px solid ${TEAL}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>⬡</div>
            <div><p style={{ fontSize: 12, fontWeight: 700, color: INK }}>@mind</p><p style={{ fontSize: 10, color: '#aaa' }}>Acme Corp · 3 calls ingested</p></div>
            <span style={{ marginLeft: 'auto', fontSize: 9.5, padding: '2px 7px', background: 'rgba(29,181,132,0.07)', borderRadius: 4, color: TEAL, fontWeight: 600, ...mono }}>live</span>
          </div>
          <div style={{ flex: 1, overflow: 'hidden', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div key={msgKey} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div className="msg-in" style={{ maxWidth: '85%', padding: '8px 13px', borderRadius: 11, background: INK, fontSize: 12.5, color: '#fff', lineHeight: 1.5 }}>{currentQ}</div>
              </div>
              {showTyping && <div style={{ display: 'flex', gap: 5, padding: '9px 12px', background: PAPER, border: `1px solid ${LINE}`, borderRadius: 10, width: 'fit-content' }}><span className="typing-dot" style={{ background: '#ccc' }} /><span className="typing-dot" style={{ background: '#ccc' }} /><span className="typing-dot" style={{ background: '#ccc' }} /></div>}
              {currentA && (
                <div className="msg-in" style={{ padding: '11px 14px', borderRadius: 11, background: PAPER, border: `1px solid ${LINE}`, fontSize: 12, color: '#333', lineHeight: 1.75, overflow: 'hidden' }}>
                  {currentA.split('\n').map((line, j) => {
                    if (!line) return <br key={j} />
                    if (line.startsWith('"')) return <p key={j} style={{ margin: '4px 0', borderLeft: `2px solid ${TEAL}`, paddingLeft: 9, color: MUTED, fontStyle: 'italic' }}>{line}</p>
                    return <p key={j} style={{ margin: '1px 0' }}>{line}</p>
                  })}
                </div>
              )}
            </div>
          </div>
          <div style={{ borderTop: `1px solid ${LINE}`, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, background: '#fafaf8', flexShrink: 0 }}>
            <span style={{ fontSize: 13, color: '#bbb' }}>⬡</span>
            <span style={{ flex: 1, fontSize: 12, color: composing ? INK : '#ccc', minHeight: 18 }}>
              {composing || 'Ask about this client…'}
              {composing && <span style={{ display: 'inline-block', width: 1.5, height: 13, background: INK, marginLeft: 1, verticalAlign: 'text-bottom', animation: 'dot-blink 0.8s step-end infinite' }} />}
            </span>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: composing ? INK : LINE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: composing ? '#fff' : '#bbb', transition: 'all 0.2s', flexShrink: 0 }}>▶</div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Aliases ────────────────────────────────────────────────────────── */
export function PipelineMockup()    { return <PlumbHeroMockup /> }
export function BuildPromptMockup() { return <CallPrepMockup />  }
export function PlumbAppMockup()    { return <PlumbHeroMockup /> }
export function HomeMockup()        { return <PlumbHeroMockup /> }
