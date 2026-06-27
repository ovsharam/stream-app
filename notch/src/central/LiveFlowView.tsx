import { useCallback, useEffect, useRef, useState } from 'react'
import { clusterApi } from '../lib/api'

// ─── Scripted data ────────────────────────────────────────────────────────────

const CLIENT = 'Northwind Telephony'
const PRODUCT = 'Northwind CRM Portal'
const URL = 'northwind-crm.acme.io'

const INVESTIGATION_EVENTS: { ms: number; icon: string; text: string; detail?: string; decision?: boolean }[] = [
  { ms: 0,    icon: '→', text: `Connecting to ${URL}` },
  { ms: 900,  icon: '→', text: 'Navigating /login — OAuth 2.0 detected' },
  { ms: 1700, icon: '✓', text: 'Authenticated — scanning dashboard' },
  { ms: 2500, icon: '✓', text: 'Contacts module mapped', detail: 'GET /api/v2/contacts?phone={e164}' },
  { ms: 3300, icon: '✓', text: 'Case management mapped', detail: 'POST /api/v2/cases · update · escalate' },
  { ms: 4100, icon: '✓', text: 'Avaya CTI bridge available', detail: 'Webhook on inbound call event' },
  { ms: 4900, icon: '✓', text: 'Salesforce Service Cloud connector', detail: 'eu.salesforce.com — separate EU instance' },
  { ms: 5700, icon: '⚡', text: '/admin/batch requires SWE access', detail: 'Flagging escalation path', decision: true },
  { ms: 6500, icon: '✓', text: 'Capability map complete', detail: '12 agent actions · 1 escalation path' },
]

const CAPABILITIES = [
  'Contact lookup by phone (sub-2s)',
  'Open case retrieval',
  'Last order + tier lookup',
  'Rep UI overlay injection',
  'EU data routing',
  'Inbound call event hook',
  'Case creation + assignment',
  'Avaya CTI handshake',
]

const TRANSCRIPT_LINES: { ms: number; speaker: string; text: string; signal?: string }[] = [
  { ms: 0,    speaker: 'Jordan', text: `Thanks for jumping on. ${CLIENT} runs inbound sales on a legacy Avaya stack. They want your voice agent to look up CRM contacts when a call lands.` },
  { ms: 3200, speaker: 'Priya',  text: 'We use Salesforce Service Cloud. When someone calls, the rep needs account name, open cases, and last order — basically before they say hello.', signal: 'Salesforce Service Cloud' },
  { ms: 6000, speaker: 'Jordan', text: "What's the latency bar?" },
  { ms: 7500, speaker: 'Priya',  text: "Fast enough that the rep isn't waiting awkwardly. Near-realtime is fine.", signal: 'Sub-2s latency (soft)' },
  { ms: 9800, speaker: 'Priya',  text: 'Also EU — some callers are German entities. Data can\'t leave EU for processing if we can help it.', signal: 'EU data residency' },
  { ms: 12500, speaker: 'Jordan', text: 'Security review timeline?' },
  { ms: 13800, speaker: 'Priya',  text: 'Probably 4–6 weeks if we need a new vendor. Faster if it\'s just an extension of what we already approved with Acme.', signal: '4–6 week security window' },
  { ms: 16200, speaker: 'FDE',    text: 'So v1 is Salesforce lookup on inbound call, surfaced to the rep UI. Can you confirm the exact fields reps need on screen?' },
  { ms: 19000, speaker: 'Priya',  text: 'Account name, tier, last order date, and any open P1 case. That\'s the must-have.' },
  { ms: 21500, speaker: 'Jordan', text: "Let's schedule a technical deep-dive next week. Priya — can you get your Salesforce admin on that call?" },
]

const BUILD_EVENTS: { ms: number; type: 'log' | 'file' | 'decision' | 'test' | 'done'; text: string; detail?: string }[] = [
  { ms: 0,    type: 'log',      text: 'Generating build plan from context', detail: '4 requirements · 2 constraints · 1 escalation' },
  { ms: 1000, type: 'file',     text: 'salesforce-resolver/index.ts', detail: 'Contact lookup — GET /api/v2/contacts' },
  { ms: 2000, type: 'file',     text: 'eu-data-router/index.ts', detail: 'EU PII routing → eu.salesforce.com' },
  { ms: 2800, type: 'decision', text: 'EU residency constraint → all PII routed to EU endpoint', detail: 'Autonomous — no escalation needed' },
  { ms: 3600, type: 'file',     text: 'rep-ui-overlay/index.ts', detail: 'Injects account panel on call connect' },
  { ms: 4400, type: 'decision', text: '/admin/batch access restricted', detail: 'Escalating to backend team via Slack' },
  { ms: 5200, type: 'test',     text: 'contact-lookup: 847ms p50', detail: '✓ within latency bar' },
  { ms: 5600, type: 'test',     text: 'eu-routing: PII isolation verified', detail: '✓ no cross-region leakage' },
  { ms: 6000, type: 'test',     text: 'avaya-handoff: escalation path confirmed', detail: '✓ Slack webhook → backend oncall' },
  { ms: 6500, type: 'done',     text: 'Build complete', detail: '3 agents · 6.5s · 1 escalation documented' },
]

// ─── Types ───────────────────────────────────────────────────────────────────

type Phase = 'investigate' | 'meet' | 'build' | 'deliver'

const PHASE_ORDER: Phase[] = ['investigate', 'meet', 'build', 'deliver']

const PHASE_LABELS: Record<Phase, string> = {
  investigate: 'Investigate',
  meet: 'Meet',
  build: 'Build',
  deliver: 'Deliver',
}

const PHASE_DESCRIPTIONS: Record<Phase, string> = {
  investigate: `Agents map ${CLIENT}'s product`,
  meet: 'Call transcript → build prompt',
  build: 'Agents execute the solution',
  deliver: 'Case ready for handoff',
}

// ─── Phase durations (ms) for fast vs normal mode ─────────────────────────────

const PHASE_DURATION: Record<Phase, number> = {
  investigate: 7200,
  meet: 22000,
  build: 7000,
  deliver: 0,
}

// ─── Component ───────────────────────────────────────────────────────────────

type Props = {
  onOpenCase: (engagementId: string) => void
  onBack: () => void
}

export function LiveFlowView({ onOpenCase, onBack }: Props) {
  const [phase, setPhase] = useState<Phase>('investigate')
  const [playing, setPlaying] = useState(false)
  const [fast, setFast] = useState(false)
  const [elapsed, setElapsed] = useState(0) // ms elapsed within current phase
  const [engagementId, setEngagementId] = useState<string | null>(null)
  const [creatingCase, setCreatingCase] = useState(false)

  const timerRef = useRef<number | null>(null)
  const startRef = useRef<number>(0)
  const phaseRef = useRef<Phase>(phase)
  phaseRef.current = phase

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const advance = useCallback(() => {
    const idx = PHASE_ORDER.indexOf(phaseRef.current)
    if (idx < PHASE_ORDER.length - 1) {
      const next = PHASE_ORDER[idx + 1]
      setPhase(next)
      setElapsed(0)
      startRef.current = performance.now()
      if (next === 'deliver') {
        setPlaying(false)
      }
    } else {
      setPlaying(false)
    }
  }, [])

  // tick elapsed time
  useEffect(() => {
    if (!playing) { clearTimer(); return }
    startRef.current = performance.now() - elapsed
    timerRef.current = window.setInterval(() => {
      const now = performance.now()
      const ms = fast ? (now - startRef.current) * 8 : now - startRef.current
      setElapsed(ms)
      const duration = PHASE_DURATION[phaseRef.current]
      if (duration > 0 && ms >= duration) {
        advance()
      }
    }, 40)
    return clearTimer
  }, [playing, fast]) // eslint-disable-line react-hooks/exhaustive-deps

  const startDemo = (useFast: boolean) => {
    setFast(useFast)
    setPhase('investigate')
    setElapsed(0)
    setEngagementId(null)
    startRef.current = performance.now()
    setPlaying(true)
  }

  const skipPhase = () => {
    setElapsed(PHASE_DURATION[phase] + 1)
    advance()
  }

  const goToPhase = (p: Phase) => {
    if (!playing) return
    setPhase(p)
    setElapsed(0)
    startRef.current = performance.now()
    if (p === 'deliver') setPlaying(false)
  }

  const createCase = async () => {
    setCreatingCase(true)
    try {
      const result = await clusterApi.createEngagement({
        clientName: CLIENT,
        company: 'Northwind Telephony',
        summary: 'Salesforce contact lookup on inbound call — surfaced to rep UI before answer. EU data residency required. 3 agents built, 1 escalation path (backend team for /admin/batch access).',
      })
      setEngagementId(result.engagement.id)
      window.dispatchEvent(new Event('notch:engagements-updated'))
    } catch {
      // still allow viewing in demo mode
      setEngagementId('demo')
    } finally {
      setCreatingCase(false)
    }
  }

  const phaseIdx = PHASE_ORDER.indexOf(phase)
  const started = playing || elapsed > 0 || phase !== 'investigate'

  return (
    <div className="x-live-flow">
      {/* Toolbar */}
      <header className="x-pipeline-toolbar x-live-flow-toolbar">
        <div className="x-pipeline-toolbar-main">
          <button type="button" className="x-live-flow-back" onClick={onBack}>
            ← Pipeline
          </button>
          <h1 className="x-pipeline-title">
            Live demo
            <span className="x-live-flow-client-tag">{CLIENT}</span>
          </h1>
        </div>
        <div className="x-pipeline-toolbar-actions">
          {playing ? (
            <>
              <button type="button" className="x-pipeline-btn x-pipeline-btn-muted" onClick={skipPhase}>
                Skip phase
              </button>
              <button type="button" className="x-pipeline-btn x-pipeline-btn-muted" onClick={() => setPlaying(false)}>
                Pause
              </button>
            </>
          ) : started ? (
            <>
              {phase !== 'deliver' ? (
                <button type="button" className="x-pipeline-btn x-pipeline-btn-muted" onClick={() => setPlaying(true)}>
                  Resume
                </button>
              ) : null}
              <button type="button" className="x-pipeline-btn x-pipeline-btn-muted" onClick={() => startDemo(false)}>
                Restart
              </button>
            </>
          ) : (
            <>
              <button type="button" className="x-pipeline-btn x-pipeline-btn-muted" onClick={() => startDemo(true)}>
                Fast demo
              </button>
              <button type="button" className="x-pipeline-btn x-pipeline-btn-primary" onClick={() => startDemo(false)}>
                Run demo
              </button>
            </>
          )}
        </div>
      </header>

      {/* Phase stepper */}
      <div className="x-demo-phases">
        {PHASE_ORDER.map((p, i) => {
          const state = i < phaseIdx ? 'done' : i === phaseIdx ? 'active' : 'pending'
          return (
            <button
              key={p}
              type="button"
              className={`x-demo-phase x-demo-phase-${state}`}
              onClick={() => playing && i <= phaseIdx + 1 ? goToPhase(p) : undefined}
              disabled={!playing && !started}
            >
              <span className="x-demo-phase-num">{state === 'done' ? '✓' : i + 1}</span>
              <span className="x-demo-phase-label">{PHASE_LABELS[p]}</span>
              <span className="x-demo-phase-desc">{PHASE_DESCRIPTIONS[p]}</span>
            </button>
          )
        })}
      </div>

      {/* Phase content */}
      <div className="x-live-flow-body">
        {!started ? (
          <StartScreen onRun={() => startDemo(false)} onFast={() => startDemo(true)} />
        ) : phase === 'investigate' ? (
          <InvestigatePhase elapsed={elapsed} />
        ) : phase === 'meet' ? (
          <MeetPhase elapsed={elapsed} />
        ) : phase === 'build' ? (
          <BuildPhase elapsed={elapsed} />
        ) : (
          <DeliverPhase
            engagementId={engagementId}
            creating={creatingCase}
            onCreate={createCase}
            onOpen={engagementId && engagementId !== 'demo' ? () => onOpenCase(engagementId) : undefined}
          />
        )}
      </div>
    </div>
  )
}

// ─── Start screen ─────────────────────────────────────────────────────────────

function StartScreen({ onRun, onFast }: { onRun: () => void; onFast: () => void }) {
  return (
    <div className="x-demo-start">
      <div className="x-demo-start-inner">
        <p className="x-demo-start-eyebrow">Full-cycle FDE simulation</p>
        <h2 className="x-demo-start-heading">{CLIENT} × Acme Voice AI</h2>
        <p className="x-demo-start-body">
          Watch Plumb agents investigate a customer's product, process a live meeting into a build prompt,
          execute the solution, and deliver a case — end to end.
        </p>
        <div className="x-demo-start-actions">
          <button type="button" className="x-pipeline-btn x-pipeline-btn-primary x-demo-start-btn" onClick={onRun}>
            Run full demo
          </button>
          <button type="button" className="x-pipeline-btn x-pipeline-btn-muted x-demo-start-btn" onClick={onFast}>
            Fast (skip timings)
          </button>
        </div>
        <div className="x-demo-start-meta">
          <span>4 phases</span>
          <span>·</span>
          <span>~40s live</span>
          <span>·</span>
          <span>1 case created</span>
        </div>
      </div>
    </div>
  )
}

// ─── Phase 1: Investigate ─────────────────────────────────────────────────────

function InvestigatePhase({ elapsed }: { elapsed: number }) {
  const visible = INVESTIGATION_EVENTS.filter((e) => e.ms <= elapsed)
  const capVisible = Math.min(Math.floor(elapsed / 900), CAPABILITIES.length)

  return (
    <div className="x-demo-phase-body">
      <section className="x-demo-panel x-demo-panel-main">
        <div className="x-demo-panel-head">
          <span className="x-demo-panel-label">Agent session</span>
          <span className="x-demo-terminal-url">
            <span className="x-demo-terminal-dot" />
            {URL}
          </span>
        </div>
        <ol className="x-demo-log">
          {visible.map((e, i) => (
            <li key={i} className={`x-demo-log-row${e.decision ? ' x-demo-log-decision' : ''}`}>
              <span className={`x-demo-log-icon${e.icon === '✓' ? ' done' : e.icon === '⚡' ? ' warn' : ''}`}>
                {e.icon}
              </span>
              <span className="x-demo-log-text">
                {e.text}
                {e.detail ? <span className="x-demo-log-detail">{e.detail}</span> : null}
              </span>
            </li>
          ))}
          {visible.length < INVESTIGATION_EVENTS.length ? (
            <li className="x-demo-log-row x-demo-log-cursor" aria-hidden>
              <span className="x-demo-log-icon">→</span>
              <span className="x-demo-log-text x-demo-cursor-blink">▊</span>
            </li>
          ) : null}
        </ol>
      </section>

      <section className="x-demo-panel x-demo-panel-side">
        <div className="x-demo-panel-head">
          <span className="x-demo-panel-label">Capability map</span>
          <span className="x-demo-panel-count">{capVisible} / {CAPABILITIES.length}</span>
        </div>
        <ul className="x-demo-cap-list">
          {CAPABILITIES.map((cap, i) => (
            <li key={i} className={`x-demo-cap-item${i < capVisible ? ' x-demo-cap-item-found' : ''}`}>
              <span className="x-demo-cap-dot" />
              {cap}
            </li>
          ))}
        </ul>
        {capVisible === CAPABILITIES.length ? (
          <p className="x-demo-side-note">
            Agents are ready to use {PRODUCT} to build for your clients.
          </p>
        ) : null}
      </section>
    </div>
  )
}

// ─── Phase 2: Meet ────────────────────────────────────────────────────────────

function MeetPhase({ elapsed }: { elapsed: number }) {
  const visibleLines = TRANSCRIPT_LINES.filter((l) => l.ms <= elapsed)
  const signals = TRANSCRIPT_LINES.filter((l) => l.ms <= elapsed && l.signal)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [visibleLines.length])

  return (
    <div className="x-demo-phase-body">
      <section className="x-demo-panel x-demo-panel-main">
        <div className="x-demo-panel-head">
          <span className="x-demo-panel-label">Meeting transcript</span>
          <span className="x-demo-panel-live">● Live</span>
        </div>
        <div className="x-demo-transcript" ref={scrollRef}>
          {visibleLines.map((line, i) => (
            <div key={i} className={`x-demo-transcript-turn${line.signal ? ' x-demo-transcript-signal' : ''}`}>
              <span className={`x-demo-transcript-speaker x-demo-speaker-${line.speaker.toLowerCase()}`}>
                {line.speaker}
              </span>
              <p className="x-demo-transcript-text">{line.text}</p>
            </div>
          ))}
          {visibleLines.length < TRANSCRIPT_LINES.length ? (
            <div className="x-demo-transcript-turn" aria-hidden>
              <span className="x-demo-transcript-speaker" />
              <p className="x-demo-cursor-blink">▊</p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="x-demo-panel x-demo-panel-side">
        <div className="x-demo-panel-head">
          <span className="x-demo-panel-label">Extracted signals</span>
          <span className="x-demo-panel-count">{signals.length}</span>
        </div>
        {signals.length === 0 ? (
          <p className="x-demo-side-empty">Listening…</p>
        ) : (
          <ul className="x-demo-signal-list">
            {signals.map((l, i) => (
              <li key={i} className="x-demo-signal-item">
                <span className="x-demo-signal-dot" />
                {l.signal}
              </li>
            ))}
          </ul>
        )}
        {signals.length > 0 ? (
          <div className="x-demo-build-prompt-preview">
            <p className="x-demo-build-prompt-label">Build prompt forming…</p>
            <p className="x-demo-build-prompt-text">
              Build a Salesforce contact resolver that surfaces account name, tier, last order, and open P1 cases to the rep UI on inbound call.
              {signals.length >= 3 ? ' All PII must stay within eu.salesforce.com.' : ''}
              {signals.length >= 4 ? ' Target sub-2s p50 latency.' : ''}
            </p>
          </div>
        ) : null}
      </section>
    </div>
  )
}

// ─── Phase 3: Build ───────────────────────────────────────────────────────────

function BuildPhase({ elapsed }: { elapsed: number }) {
  const visible = BUILD_EVENTS.filter((e) => e.ms <= elapsed)
  const files = visible.filter((e) => e.type === 'file')
  const done = visible.some((e) => e.type === 'done')

  return (
    <div className="x-demo-phase-body">
      <section className="x-demo-panel x-demo-panel-main">
        <div className="x-demo-panel-head">
          <span className="x-demo-panel-label">Agent build log</span>
          {done ? <span className="x-demo-panel-done">✓ Complete</span> : <span className="x-demo-panel-live">● Building</span>}
        </div>
        <ol className="x-demo-log">
          {visible.map((e, i) => (
            <li
              key={i}
              className={`x-demo-log-row${e.type === 'decision' ? ' x-demo-log-decision' : ''}${e.type === 'done' ? ' x-demo-log-done' : ''}`}
            >
              <span className={`x-demo-log-icon${e.type === 'file' ? ' done' : e.type === 'decision' ? ' warn' : e.type === 'done' ? ' done' : ''}`}>
                {e.type === 'file' ? '✓' : e.type === 'decision' ? '⚡' : e.type === 'test' ? '✓' : e.type === 'done' ? '✓' : '→'}
              </span>
              <span className="x-demo-log-text">
                {e.text}
                {e.detail ? <span className="x-demo-log-detail">{e.detail}</span> : null}
              </span>
            </li>
          ))}
          {!done ? (
            <li className="x-demo-log-row x-demo-log-cursor" aria-hidden>
              <span className="x-demo-log-icon">→</span>
              <span className="x-demo-log-text x-demo-cursor-blink">▊</span>
            </li>
          ) : null}
        </ol>
      </section>

      <section className="x-demo-panel x-demo-panel-side">
        <div className="x-demo-panel-head">
          <span className="x-demo-panel-label">Agents built</span>
          <span className="x-demo-panel-count">{files.length} / 3</span>
        </div>
        <ul className="x-demo-cap-list">
          {files.map((f, i) => (
            <li key={i} className="x-demo-cap-item x-demo-cap-item-found">
              <span className="x-demo-cap-dot" />
              <span className="x-demo-file-name">{f.text}</span>
            </li>
          ))}
          {files.length < 3 ? (
            Array.from({ length: 3 - files.length }).map((_, i) => (
              <li key={`ph-${i}`} className="x-demo-cap-item">
                <span className="x-demo-cap-dot" />
                <span className="x-demo-placeholder-bar" />
              </li>
            ))
          ) : null}
        </ul>
        {done ? (
          <div className="x-demo-build-summary">
            <div className="x-demo-build-stat"><strong>3</strong><span>agents</span></div>
            <div className="x-demo-build-stat"><strong>2</strong><span>auto</span></div>
            <div className="x-demo-build-stat"><strong>1</strong><span>escalation</span></div>
          </div>
        ) : null}
      </section>
    </div>
  )
}

// ─── Phase 4: Deliver ─────────────────────────────────────────────────────────

function DeliverPhase({
  engagementId,
  creating,
  onCreate,
  onOpen,
}: {
  engagementId: string | null
  creating: boolean
  onCreate: () => void
  onOpen?: () => void
}) {
  return (
    <div className="x-demo-deliver">
      <div className="x-demo-deliver-card">
        <div className="x-demo-deliver-head">
          <div className="x-demo-deliver-title">
            <span className="x-demo-deliver-ref">FDE-26 · {CLIENT}</span>
            <span className="x-eng-scope x-eng-scope-big_bet">Enterprise</span>
          </div>
          <p className="x-demo-deliver-summary">
            Salesforce contact resolver surfacing account name, tier, last order, and open P1 cases
            to rep UI on inbound call. EU data routing via eu.salesforce.com. Avaya CTI bridge escalation path documented.
          </p>
        </div>

        <div className="x-demo-deliver-stats">
          <div className="x-demo-deliver-stat">
            <strong>3</strong>
            <span>agents built</span>
          </div>
          <div className="x-demo-deliver-stat">
            <strong>4</strong>
            <span>requirements met</span>
          </div>
          <div className="x-demo-deliver-stat">
            <strong>1</strong>
            <span>escalation path</span>
          </div>
          <div className="x-demo-deliver-stat">
            <strong>6.5s</strong>
            <span>build time</span>
          </div>
        </div>

        <div className="x-demo-deliver-agents">
          <p className="x-demo-deliver-agents-label">Delivered agents</p>
          <ul className="x-demo-deliver-agent-list">
            <li><span className="x-demo-deliver-agent-dot done" />salesforce-resolver — contact lookup on inbound call</li>
            <li><span className="x-demo-deliver-agent-dot done" />eu-data-router — PII stays in eu.salesforce.com</li>
            <li><span className="x-demo-deliver-agent-dot warn" />avaya-cti-bridge — escalates /admin/batch to backend</li>
          </ul>
        </div>

        <div className="x-demo-deliver-actions">
          {!engagementId ? (
            <button
              type="button"
              className="x-pipeline-btn x-pipeline-btn-primary x-demo-deliver-cta"
              onClick={onCreate}
              disabled={creating}
            >
              {creating ? 'Creating case…' : 'Create case in Pipeline'}
            </button>
          ) : (
            <>
              <span className="x-demo-deliver-created">✓ Case created in Pipeline</span>
              {onOpen ? (
                <button type="button" className="x-pipeline-btn x-pipeline-btn-primary x-demo-deliver-cta" onClick={onOpen}>
                  Open case →
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
