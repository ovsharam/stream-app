const TEAL = '#1db584'
const mono = { fontFamily: 'var(--font-jetbrains), monospace' } as const

const CASES = [
  { id: 'FDE-114', company: 'Acme Corp',     tag: 'Vertex AI',   score: null, stage: 'intake',   ts: '09:14' },
  { id: 'FDE-112', company: 'Northwind',     tag: 'OpenAI',      score: 78,   stage: 'scoring',  ts: '10:02' },
  { id: 'FDE-111', company: 'Atlas Freight', tag: 'Claude',      score: 91,   stage: 'building', ts: '10:47' },
  { id: 'FDE-109', company: 'Beta Systems',  tag: 'Gemini',      score: 100,  stage: 'deployed', ts: '08:31' },
]

const STAGE_LABEL: Record<string, string> = {
  intake:   'Intake',
  scoring:  'Scoring',
  building: 'Building',
  deployed: 'Deployed',
}

const STAGE_COLOR: Record<string, string> = {
  intake:   '#888',
  scoring:  '#f59e0b',
  building: TEAL,
  deployed: TEAL,
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: score >= 60 ? TEAL : '#f59e0b', borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 10, color: score >= 60 ? TEAL : '#f59e0b', ...mono, flexShrink: 0 }}>{score}</span>
    </div>
  )
}

/* ── Pipeline board mockup ─────────────────────────────────────────── */
export function PipelineMockup() {
  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: '#0d1117', boxShadow: '0 32px 80px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2)' }}>
      {/* Window chrome */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#161b22', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57', display: 'block' }} />
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e', display: 'block' }} />
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#28ca41', display: 'block' }} />
        </div>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', ...mono }}>plumb · pipeline</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="blink" style={{ width: 6, height: 6, borderRadius: '50%', background: TEAL, display: 'block' }} />
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', ...mono }}>live</span>
        </div>
      </div>

      {/* App body */}
      <div style={{ display: 'flex', minHeight: 340 }}>
        {/* Sidebar */}
        <div style={{ width: 44, background: '#0a0f14', borderRight: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 14, gap: 16 }}>
          {['⬜','≡','↗','⊙'].map((icon, i) => (
            <div key={i} style={{ width: 28, height: 28, borderRadius: 6, background: i === 0 ? 'rgba(29,181,132,0.15)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: i === 0 ? TEAL : 'rgba(255,255,255,0.2)', cursor: 'default' }}>
              {icon}
            </div>
          ))}
        </div>

        {/* Main */}
        <div style={{ flex: 1, padding: '14px 16px', overflow: 'hidden' }}>
          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {['All', 'Active', 'Deployed'].map((t, i) => (
                <span key={t} style={{ fontSize: 10.5, padding: '3px 10px', borderRadius: 6, background: i === 0 ? 'rgba(255,255,255,0.08)' : 'transparent', color: i === 0 ? '#fff' : 'rgba(255,255,255,0.3)', cursor: 'default', ...mono }}>
                  {t}
                </span>
              ))}
            </div>
            <div style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, background: TEAL, color: '#fff', cursor: 'default' }}>
              + New case
            </div>
          </div>

          {/* Cases */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {CASES.map(c => (
              <div key={c.id} style={{
                padding: '10px 12px',
                borderRadius: 8,
                background: c.stage === 'scoring' ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${c.stage === 'scoring' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)'}`,
                display: 'grid',
                gridTemplateColumns: '70px 1fr auto auto',
                alignItems: 'center',
                gap: 10,
              }}>
                <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.3)', ...mono }}>{c.id}</span>
                <div>
                  <p style={{ fontSize: 11.5, color: '#fff', fontWeight: 500, marginBottom: 1 }}>{c.company}</p>
                  <p style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.3)', ...mono }}>{c.tag}</p>
                </div>
                <div style={{ minWidth: 80 }}>
                  {c.score !== null
                    ? <ScoreBar score={c.score} />
                    : <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.2)', ...mono }}>pending</span>
                  }
                </div>
                <span style={{ fontSize: 9.5, padding: '2px 7px', borderRadius: 4, background: `${STAGE_COLOR[c.stage]}18`, color: STAGE_COLOR[c.stage], ...mono, flexShrink: 0 }}>
                  {STAGE_LABEL[c.stage]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Detail panel — case FDE-112 */}
        <div style={{ width: 200, background: '#0a0f14', borderLeft: '1px solid rgba(255,255,255,0.05)', padding: '14px 14px', flexShrink: 0 }}>
          <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', ...mono, marginBottom: 10, letterSpacing: '0.08em' }}>CONTEXT GATE</p>
          <p style={{ fontSize: 11, color: '#fff', fontWeight: 500, marginBottom: 2 }}>Northwind</p>
          <p style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.3)', ...mono, marginBottom: 12 }}>FDE-112 · OpenAI</p>

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.4)' }}>Scope score</span>
              <span style={{ fontSize: 9.5, color: '#f59e0b', ...mono }}>78 / 100</span>
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
              <div style={{ width: '78%', height: '100%', background: '#f59e0b', borderRadius: 2 }} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {[
              { label: 'OAuth scope',     ok: true  },
              { label: 'Latency: 200ms',  ok: true  },
              { label: 'Arch fork',       ok: false },
              { label: 'Prod keys',       ok: false },
            ].map(g => (
              <div key={g.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 9, color: g.ok ? TEAL : '#f87171' }}>{g.ok ? '✓' : '✗'}</span>
                <span style={{ fontSize: 10, color: g.ok ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.6)' }}>{g.label}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 14, padding: '6px 10px', background: 'rgba(29,181,132,0.08)', borderRadius: 6, border: '1px solid rgba(29,181,132,0.15)' }}>
            <p style={{ fontSize: 9, color: TEAL, ...mono, marginBottom: 2 }}>AE gap sync sent</p>
            <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>2 gaps to resolve</p>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Build prompt mockup ───────────────────────────────────────────── */
export function BuildPromptMockup() {
  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: '#0d1117', boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', background: '#161b22', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#ff5f57', display: 'block' }} />
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#ffbd2e', display: 'block' }} />
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#28ca41', display: 'block' }} />
        <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.3)', marginLeft: 6, ...mono }}>build prompt · FDE-109 · Atlas Freight</span>
      </div>
      <div style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {['Scope', 'Requirements', 'Build prompt', 'Output'].map((t, i) => (
            <span key={t} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: i === 2 ? 'rgba(29,181,132,0.12)' : 'transparent', color: i === 2 ? TEAL : 'rgba(255,255,255,0.25)', borderBottom: i === 2 ? `1px solid ${TEAL}` : '1px solid transparent', ...mono }}>
              {t}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 11, lineHeight: 1.7, color: 'rgba(255,255,255,0.55)', ...mono }}>
          <p style={{ color: 'rgba(255,255,255,0.25)', marginBottom: 6, fontSize: 9.5, letterSpacing: '0.06em' }}># CONTEXT-CLEARED BUILD SPEC</p>
          <p style={{ marginBottom: 4 }}><span style={{ color: TEAL }}>integration:</span> Salesforce CRM lookup</p>
          <p style={{ marginBottom: 4 }}><span style={{ color: TEAL }}>latency_target:</span> 200ms p95</p>
          <p style={{ marginBottom: 4 }}><span style={{ color: TEAL }}>approach:</span> native REST (no middleware)</p>
          <p style={{ marginBottom: 4 }}><span style={{ color: TEAL }}>auth:</span> OAuth 2.0 — scope pre-approved</p>
          <p style={{ marginBottom: 12 }}><span style={{ color: TEAL }}>env:</span> prod keys staged, operator review done</p>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 12 }} />
          <p style={{ marginBottom: 4 }}><span style={{ color: 'rgba(255,255,255,0.3)' }}>context_score:</span> <span style={{ color: TEAL }}>100 / 100</span></p>
          <p><span style={{ color: 'rgba(255,255,255,0.3)' }}>status:</span> <span style={{ color: '#28ca41' }}>approved → dispatched</span></p>
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 6 }}>
          <div style={{ padding: '6px 14px', background: TEAL, borderRadius: 6, fontSize: 10.5, color: '#fff', cursor: 'default' }}>Run build agent</div>
          <div style={{ padding: '6px 14px', background: 'rgba(255,255,255,0.06)', borderRadius: 6, fontSize: 10.5, color: 'rgba(255,255,255,0.4)', cursor: 'default' }}>Edit</div>
        </div>
      </div>
    </div>
  )
}
