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
      <div style={{ flex: 1, height: 3, background: '#f0f0f0', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: score >= 60 ? TEAL : '#f59e0b', borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 10, color: score >= 60 ? TEAL : '#f59e0b', ...mono, flexShrink: 0 }}>{score}</span>
    </div>
  )
}

/* ── Pipeline board mockup — light mode, full-height ───────────────── */
export function PipelineMockup() {
  const CASES_FULL = [
    { id: 'FDE-115', company: 'Stripe',        tag: 'OpenAI · webhook ingestion',   score: null, stage: 'intake',   ts: 'just now',  active: false },
    { id: 'FDE-114', company: 'Acme Corp',     tag: 'Vertex AI · CRM lookup',       score: 44,   stage: 'scoring',  ts: '4m ago',    active: false },
    { id: 'FDE-113', company: 'Linear',        tag: 'Claude · Slack integration',   score: 82,   stage: 'building', ts: '11m ago',   active: true  },
    { id: 'FDE-112', company: 'Northwind',     tag: 'OpenAI · auth middleware',      score: 78,   stage: 'building', ts: '31m ago',   active: false },
    { id: 'FDE-111', company: 'Atlas Freight', tag: 'Claude · route optimizer',     score: 100,  stage: 'deployed', ts: '1h ago',    active: false },
    { id: 'FDE-110', company: 'Beta Systems',  tag: 'Gemini · data pipeline',       score: 91,   stage: 'deployed', ts: '3h ago',    active: false },
  ]

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e2e2', background: '#fff', boxShadow: '0 32px 80px rgba(0,0,0,0.10), 0 4px 16px rgba(0,0,0,0.05)' }}>
      {/* Window chrome */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 18px', background: '#f5f5f5', borderBottom: '1px solid #e8e8e8' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff5f57', display: 'block' }} />
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ffbd2e', display: 'block' }} />
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#28ca41', display: 'block' }} />
          <span style={{ fontSize: 11.5, color: '#bbb', marginLeft: 10, ...mono }}>Plumb — Pipeline</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {['Pipeline', 'Inbox', 'Agents', 'Settings'].map((t, i) => (
            <span key={t} style={{ fontSize: 11, color: i === 0 ? '#111' : '#bbb', fontWeight: i === 0 ? 600 : 400, cursor: 'default', borderBottom: i === 0 ? `1.5px solid ${TEAL}` : 'none', paddingBottom: 1 }}>{t}</span>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="blink" style={{ width: 6, height: 6, borderRadius: '50%', background: TEAL, display: 'block' }} />
          <span style={{ fontSize: 10, color: '#bbb', ...mono }}>live · 7 active</span>
        </div>
      </div>

      {/* App body */}
      <div style={{ display: 'flex', height: 500 }}>
        {/* Sidebar */}
        <div style={{ width: 52, background: '#fafafa', borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 18, paddingBottom: 18, gap: 6, flexShrink: 0 }}>
          {[
            { icon: '◎', active: false },
            { icon: '≋', active: true  },
            { icon: '✉', active: false },
            { icon: '⬡', active: false },
            { icon: '◈', active: false },
          ].map((item, i) => (
            <div key={i} style={{ width: 34, height: 34, borderRadius: 8, background: item.active ? `${TEAL}15` : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: item.active ? TEAL : '#ccc', cursor: 'default' }}>
              {item.icon}
            </div>
          ))}
          <div style={{ flex: 1 }} />
          <div style={{ width: 34, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#ddd' }}>⚙</div>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#e8e8e8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#999', fontWeight: 600 }}>AS</div>
        </div>

        {/* Main pipeline list */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Subheader */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #f0f0f0' }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#111', letterSpacing: '-0.02em', marginBottom: 2 }}>Pipeline</p>
              <p style={{ fontSize: 10, color: '#bbb', ...mono }}>6 cases · 2 building · 2 deployed today</p>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {['All', 'Active', 'Deployed'].map((t, i) => (
                <span key={t} style={{ fontSize: 10.5, padding: '4px 11px', borderRadius: 6, background: i === 0 ? '#f0f0f0' : 'transparent', color: i === 0 ? '#333' : '#bbb', cursor: 'default', ...mono }}>{t}</span>
              ))}
              <div style={{ width: 1, height: 16, background: '#e8e8e8', margin: '0 2px' }} />
              <div style={{ fontSize: 10.5, padding: '4px 12px', borderRadius: 6, background: TEAL, color: '#fff', cursor: 'default', ...mono }}>+ New</div>
            </div>
          </div>

          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr 88px 76px 64px', gap: 8, padding: '8px 20px', background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
            {['ID', 'Account', 'Score', 'Stage', 'Updated'].map(h => (
              <span key={h} style={{ fontSize: 9, color: '#ccc', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', ...mono }}>{h}</span>
            ))}
          </div>

          {/* Case rows */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 12px' }}>
            {CASES_FULL.map((c) => (
              <div key={c.id} style={{
                display: 'grid',
                gridTemplateColumns: '72px 1fr 88px 76px 64px',
                gap: 8,
                alignItems: 'center',
                padding: '10px 8px',
                borderRadius: 8,
                margin: '2px 0',
                background: c.active ? `${TEAL}07` : 'transparent',
                borderLeft: c.active ? `2px solid ${TEAL}` : '2px solid transparent',
              }}>
                <span style={{ fontSize: 9.5, color: '#bbb', ...mono }}>{c.id}</span>
                <div>
                  <p style={{ fontSize: 12, color: '#111', fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 1 }}>{c.company}</p>
                  <p style={{ fontSize: 9.5, color: '#bbb', ...mono }}>{c.tag}</p>
                </div>
                <div>
                  {c.score !== null ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ flex: 1, height: 3, background: '#f0f0f0', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${c.score}%`, height: '100%', background: c.score >= 60 ? TEAL : '#f59e0b', borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 9.5, color: c.score >= 60 ? TEAL : '#f59e0b', ...mono, flexShrink: 0, minWidth: 20 }}>{c.score}</span>
                    </div>
                  ) : (
                    <span style={{ fontSize: 9.5, color: '#ddd', ...mono }}>—</span>
                  )}
                </div>
                <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: `${STAGE_COLOR[c.stage]}14`, color: STAGE_COLOR[c.stage], ...mono, display: 'inline-block', whiteSpace: 'nowrap' }}>
                  {STAGE_LABEL[c.stage]}
                </span>
                <span style={{ fontSize: 9.5, color: '#ccc', ...mono }}>{c.ts}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right detail panel */}
        <div style={{ width: 232, borderLeft: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          {/* Active build card */}
          <div style={{ padding: '16px 16px', borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span className="blink" style={{ width: 5, height: 5, borderRadius: '50%', background: TEAL, display: 'block' }} />
              <span style={{ fontSize: 9, color: TEAL, fontWeight: 700, ...mono, letterSpacing: '0.08em' }}>ACTIVE BUILD</span>
            </div>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#111', letterSpacing: '-0.02em', marginBottom: 1 }}>Linear</p>
            <p style={{ fontSize: 9.5, color: '#bbb', ...mono, marginBottom: 12 }}>FDE-113 · Slack integration · Claude Code</p>

            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 9.5, color: '#aaa' }}>Build progress</span>
                <span style={{ fontSize: 9.5, color: TEAL, ...mono, fontWeight: 600 }}>64%</span>
              </div>
              <div style={{ height: 5, background: '#f0f0f0', borderRadius: 3 }}>
                <div style={{ width: '64%', height: '100%', background: TEAL, borderRadius: 3 }} />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {[
                { step: 'Scaffold repo',         done: true,  active: false },
                { step: 'Auth layer wired',      done: true,  active: false },
                { step: 'Slack webhook handler', done: false, active: true  },
                { step: 'Tests + deploy',        done: false, active: false },
              ].map(s => (
                <div key={s.step} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 10, color: s.done ? TEAL : s.active ? '#f59e0b' : '#ddd', flexShrink: 0 }}>
                    {s.done ? '✓' : s.active ? '◉' : '○'}
                  </span>
                  <span style={{ fontSize: 10, color: s.done ? '#888' : s.active ? '#444' : '#ccc', fontWeight: s.active ? 500 : 400 }}>{s.step}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Context gate for FDE-112 */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0' }}>
            <p style={{ fontSize: 9, color: '#bbb', fontWeight: 700, ...mono, letterSpacing: '0.07em', marginBottom: 8 }}>CONTEXT GATE · FDE-114</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 10, color: '#888' }}>Scope score</span>
              <span style={{ fontSize: 10, color: '#f59e0b', ...mono, fontWeight: 600 }}>44 / 100</span>
            </div>
            <div style={{ height: 4, background: '#f0f0f0', borderRadius: 2, marginBottom: 10 }}>
              <div style={{ width: '44%', height: '100%', background: '#f59e0b', borderRadius: 2 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[
                { label: 'Auth requirements',  ok: false },
                { label: 'Latency target',     ok: false },
                { label: 'Integration type',   ok: true  },
                { label: 'Env / stack',        ok: false },
              ].map(g => (
                <div key={g.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 9, color: g.ok ? TEAL : '#f87171' }}>{g.ok ? '✓' : '✗'}</span>
                  <span style={{ fontSize: 9.5, color: g.ok ? '#888' : '#555' }}>{g.label}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, padding: '5px 9px', background: 'rgba(245,158,11,0.06)', borderRadius: 6, border: '1px solid rgba(245,158,11,0.18)' }}>
              <p style={{ fontSize: 9, color: '#f59e0b', ...mono }}>AE sync needed · 3 gaps</p>
            </div>
          </div>

          {/* Activity feed */}
          <div style={{ flex: 1, padding: '12px 16px', overflow: 'hidden' }}>
            <p style={{ fontSize: 9, color: '#bbb', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', ...mono, marginBottom: 10 }}>Activity</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {[
                { msg: 'FDE-113 build started',         sub: 'Claude Code dispatched',     dot: TEAL,      ts: '11m' },
                { msg: 'FDE-112 context cleared',       sub: 'Score 78 → building',        dot: TEAL,      ts: '34m' },
                { msg: 'FDE-111 deployed',              sub: 'Atlas Freight is live',       dot: '#28ca41', ts: '1h'  },
                { msg: 'Gong call synced',              sub: 'Acme Corp · 47 min',         dot: '#bbb',    ts: '2h'  },
                { msg: 'FDE-110 shipped to prod',       sub: 'Beta Systems · Gemini',      dot: '#28ca41', ts: '3h'  },
              ].map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: e.dot, display: 'block', flexShrink: 0, marginTop: 4 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 10, color: '#333', fontWeight: 500, marginBottom: 1, lineHeight: 1.3 }}>{e.msg}</p>
                    <p style={{ fontSize: 9.5, color: '#bbb' }}>{e.sub}</p>
                  </div>
                  <span style={{ fontSize: 9, color: '#ccc', ...mono, flexShrink: 0 }}>{e.ts}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Build prompt mockup ───────────────────────────────────────────── */
export function BuildPromptMockup() {
  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #e8e8e8', background: '#fff', boxShadow: '0 8px 40px rgba(0,0,0,0.07)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', background: '#f5f5f5', borderBottom: '1px solid #e8e8e8' }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#ff5f57', display: 'block' }} />
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#ffbd2e', display: 'block' }} />
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#28ca41', display: 'block' }} />
        <span style={{ fontSize: 10.5, color: '#aaa', marginLeft: 6, ...mono }}>build prompt · FDE-109 · Atlas Freight</span>
      </div>
      <div style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {['Scope', 'Requirements', 'Build prompt', 'Output'].map((t, i) => (
            <span key={t} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: i === 2 ? 'rgba(29,181,132,0.08)' : 'transparent', color: i === 2 ? TEAL : '#bbb', borderBottom: i === 2 ? `1px solid ${TEAL}` : '1px solid transparent', ...mono }}>
              {t}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 11, lineHeight: 1.7, color: '#666', ...mono }}>
          <p style={{ color: '#bbb', marginBottom: 6, fontSize: 9.5, letterSpacing: '0.06em' }}># CONTEXT-CLEARED BUILD SPEC</p>
          <p style={{ marginBottom: 4 }}><span style={{ color: TEAL }}>integration:</span> Salesforce CRM lookup</p>
          <p style={{ marginBottom: 4 }}><span style={{ color: TEAL }}>latency_target:</span> 200ms p95</p>
          <p style={{ marginBottom: 4 }}><span style={{ color: TEAL }}>approach:</span> native REST (no middleware)</p>
          <p style={{ marginBottom: 4 }}><span style={{ color: TEAL }}>auth:</span> OAuth 2.0 — scope pre-approved</p>
          <p style={{ marginBottom: 12 }}><span style={{ color: TEAL }}>env:</span> prod keys staged, operator review done</p>
          <div style={{ height: 1, background: '#f0f0f0', marginBottom: 12 }} />
          <p style={{ marginBottom: 4 }}><span style={{ color: '#bbb' }}>context_score:</span> <span style={{ color: TEAL }}>100 / 100</span></p>
          <p><span style={{ color: '#bbb' }}>status:</span> <span style={{ color: '#28ca41' }}>approved → dispatched</span></p>
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 6 }}>
          <div style={{ padding: '6px 14px', background: TEAL, borderRadius: 6, fontSize: 10.5, color: '#fff', cursor: 'default' }}>Run build agent</div>
          <div style={{ padding: '6px 14px', background: '#f5f5f5', borderRadius: 6, fontSize: 10.5, color: '#888', cursor: 'default' }}>Edit</div>
        </div>
      </div>
    </div>
  )
}
