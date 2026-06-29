import Link from 'next/link'
import { ExtractionTree } from './extraction-tree'
import { PipelineMockup, BuildPromptMockup } from './app-mockup'
import { PlumbLogo } from './plumb-logo'
import { PlumberBob } from './plumber-bob'
import { PLUMB_CHARACTER_CSS } from './plumb-character'
import { ProductGraphViz, GRAPH_VIZ_CSS } from './graph-viz'

const EVENTS = [
  { kind: 'graph.query',   detail: 'OAuth scope — 3 constraints surfaced',            ts: '09:14' },
  { kind: 'scope.validate', detail: 'PRD validated — localStorage flag → blocker',    ts: '09:16' },
  { kind: 'scope.fork',    detail: 'httpOnly cookie path approved · phase 1 locked',  ts: '09:17' },
  { kind: 'graph.query',   detail: '"Near realtime" — 2s vs 200ms gap detected',      ts: '10:02' },
  { kind: 'build_kickoff', detail: 'Build prompt dispatched → Claude Code',           ts: '10:03' },
  { kind: 'stage_change',  detail: 'FDE-112 → build · Quick Win · 21d SLA',          ts: '10:04' },
  { kind: 'graph.ingest',  detail: 'API changelog ingested — 4 new capabilities',     ts: '10:31' },
  { kind: 'scope.validate', detail: 'Webhook vs native — graph resolves architecture', ts: '11:04' },
  { kind: 'stage_change',  detail: 'FDE-113 → Big Bet · 45d SLA confirmed',          ts: '11:05' },
  { kind: 'deploy',        detail: 'FDE-109 shipped — Northwind live',                ts: '11:47' },
]

const W    = { maxWidth: 1100, margin: '0 auto', padding: '0 32px' } as const
const mono = { fontFamily: 'var(--font-jetbrains), monospace' } as const
const teal = '#1db584'

const NAV = [
  { label: 'The gap',    href: '#problem' },
  { label: 'Plumb',      href: '#plumb'   },
  { label: 'How it works', href: '#loop'  },
  { label: 'Compare',    href: '#compare' },
  { label: 'Moat',       href: '#moat'    },
]

export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: '#0c0c0c' }}>
      <style>{PLUMB_CHARACTER_CSS}{GRAPH_VIZ_CSS}</style>

      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #e8e8e8' }}>
        <div style={{ ...W, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <PlumbLogo size={22} />
          <div style={{ display: 'flex', gap: 28 }}>
            {NAV.map(l => <a key={l.label} href={l.href} className="nav-a">{l.label}</a>)}
          </div>
          <Link href="/login" className="btn btn-solid" style={{ fontSize: 13.5 }}>Request early access</Link>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section style={{ padding: '80px 32px 60px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>

          {/* Text block */}
          <div style={{ maxWidth: 640, marginBottom: 56 }}>
            <p className="h0 eyebrow" style={{ marginBottom: 20 }}>Plumb · FDE workspace</p>
            <h1 className="h1 display" style={{ marginBottom: 24 }}>
              The PRD is<br />the easy part.
            </h1>
            <p className="h2" style={{ fontSize: 17, color: '#6b6b6b', lineHeight: 1.72, maxWidth: 500, marginBottom: 32, letterSpacing: '-0.01em' }}>
              Get the client&apos;s SWE and your FDE on a call — the PRD writes itself.
              The hard part is knowing whether it can be built. What&apos;s phase 1.
              What the rollout looks like. That requires knowing your product.
            </p>
            <div className="h3" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <Link href="/login" className="btn btn-solid" style={{ fontSize: 14 }}>Request early access</Link>
              <a href="#problem" className="access-link" style={{ fontSize: 14 }}>See the gap →</a>
            </div>
          </div>

          {/* Full-width app mockup — light mode */}
          <div className="h4">
            <PipelineMockup />
          </div>
        </div>
      </section>

      {/* Stats row */}
      <div style={{ ...W, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderTop: '1px solid #e8e8e8', borderBottom: '1px solid #e8e8e8', margin: '0 auto' }}>
        {[
          { v: '95%',     d: 'of AI deals that don\'t deliver ROI — not because the AI fails, because scope wasn\'t right' },
          { v: '< 1 day', d: 'from validated scope to customer going live' },
          { v: '729%',    d: 'YoY growth in FDE job postings · Indeed Apr \'25→\'26' },
        ].map((s, i) => (
          <div key={s.v} className={`reveal-up stagger-${i + 1}`} style={{ padding: '28px 0', paddingLeft: i > 0 ? 40 : 0, borderLeft: i > 0 ? '1px solid #e8e8e8' : 'none' }}>
            <p style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 4 }}>{s.v}</p>
            <p style={{ fontSize: 13, color: '#999' }}>{s.d}</p>
          </div>
        ))}
      </div>

      {/* ── 01 · The scope gap ───────────────────────────────────────── */}
      <section id="problem" style={{ padding: '96px 32px' }}>
        <div style={W}>
          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 80, alignItems: 'start' }}>
            <div className="reveal">
              <p className="section-no" style={{ marginBottom: 10 }}>01 · The gap</p>
              <p style={{ fontSize: 13, color: '#999', lineHeight: 1.65 }}>Why builds stall after the PRD.</p>
            </div>
            <div>
              <h2 className="display-md reveal" style={{ marginBottom: 24, maxWidth: 560 }}>
                The PRD doesn&apos;t tell you<br />what to build.
              </h2>
              <p className="reveal" style={{ fontSize: 15, color: '#6b6b6b', lineHeight: 1.78, maxWidth: 560, marginBottom: 20 }}>
                Transcribing a discovery call into a spec is a solved problem. Put the right people
                on a call and you have a PRD in an hour. What you don&apos;t have is an answer
                to the real question: can this actually be built against your product?
              </p>
              <p className="reveal" style={{ fontSize: 15, color: '#6b6b6b', lineHeight: 1.78, maxWidth: 560 }}>
                What are the constraints? Which integration pattern fits? Does that latency target
                require a different architecture entirely? Which limitation changes what phase 1 even is?
                Without a living map of what your product can and cannot do, every scope decision
                is a guess — and those guesses decide whether the build ships or stalls.
              </p>
            </div>
          </div>

          {/* The gap diagram */}
          <div style={{ marginTop: 72 }}>
            <div className="reveal" style={{ display: 'flex', gap: 6 }}>
              {[
                { n: '01', label: 'Discovery call',  sub: 'PRD drafts itself',           owned: false },
                { n: '02', label: 'Scope decision',  sub: '← the real bottleneck',       owned: true, clog: true },
                { n: '03', label: 'Phase 1 locked',  sub: 'What can actually be built',  owned: true  },
                { n: '04', label: 'Build it',        sub: 'Context-first prompt',         owned: true  },
                { n: '05', label: 'Ship & expand',   sub: 'Customer goes live',           owned: true  },
              ].map((s, i) => (
                <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                  <div style={{
                    flex: 1, padding: '20px 18px', borderRadius: 10,
                    border: `1px solid ${s.owned ? (s.clog ? '#f59e0b' : teal) : '#e8e8e8'}`,
                    background: s.owned ? (s.clog ? 'rgba(245,158,11,0.03)' : 'rgba(29,181,132,0.03)') : '#fafafa',
                    position: 'relative',
                  }}>
                    {s.clog && (
                      <div style={{ position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)', fontSize: 9.5, fontWeight: 600, color: '#f59e0b', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap', ...mono }}>↑ the gap</div>
                    )}
                    <p style={{ fontSize: 10, color: s.owned ? teal : '#ccc', fontWeight: 600, ...mono, marginBottom: 7 }}>{s.n}</p>
                    <p style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 4, color: s.owned ? '#0c0c0c' : '#888' }}>{s.label}</p>
                    <p style={{ fontSize: 11, color: s.clog ? '#f59e0b' : '#bbb' }}>{s.sub}</p>
                  </div>
                  {i < 4 && <span style={{ color: '#d0d0d0', fontSize: 14, flexShrink: 0 }}>→</span>}
                </div>
              ))}
            </div>
            <div className="reveal" style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: teal, display: 'block', flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, color: '#888' }}>Plumb owns <strong style={{ color: '#0c0c0c' }}>steps 02 → 05</strong> — starting with the scope question, not the transcript</span>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: '#e8e8e8', border: '1px solid #e8e8e8', borderRadius: 14, overflow: 'hidden', marginTop: 64 }}>
            {[
              { v: 'Can it be built?',   label: 'The question that decides scope', sub: 'Never answered by a PRD alone' },
              { v: 'What\'s phase 1?',   label: 'Determined by your constraints', sub: 'Not by what the customer asked for' },
              { v: 'Who knows?',         label: 'The senior FDE — or nobody', sub: 'Until now that knowledge had no home' },
            ].map((s, i) => (
              <div key={s.v} className={`feat-cell reveal reveal-d${(i + 1) as 1|2|3}`}>
                <p className="serif" style={{ fontSize: 20, fontWeight: 400, letterSpacing: '-0.01em', marginBottom: 8 }}>{s.v}</p>
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{s.label}</p>
                <p style={{ fontSize: 11, color: '#aaa', ...mono }}>{s.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <hr className="section-rule" />

      {/* ── 02 · The context graph ─────────────────────────────────── */}
      <section id="plumb" style={{ padding: '96px 32px' }}>
        <div style={W}>
          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 80, alignItems: 'start', marginBottom: 64 }}>
            <div className="reveal">
              <p className="section-no" style={{ marginBottom: 10 }}>02 · Plumb</p>
              <p style={{ fontSize: 13, color: '#999', lineHeight: 1.65 }}>Your product, mapped. Continuously.</p>
            </div>
            <div>
              <h2 className="display-md reveal" style={{ marginBottom: 20, maxWidth: 520 }}>
                The context graph<br />other tools skip.
              </h2>
              <p className="reveal" style={{ fontSize: 15, color: '#6b6b6b', lineHeight: 1.78, maxWidth: 540, marginBottom: 20 }}>
                Plumb creates and maintains a structured knowledge graph of your product — every
                capability, every limitation, every integration pattern, every constraint and workaround.
                Fed continuously from docs, Slack threads, internal handoffs, and build history.
              </p>
              <p className="reveal" style={{ fontSize: 15, color: '#6b6b6b', lineHeight: 1.78, maxWidth: 540, marginBottom: 20 }}>
                When a PRD comes in, we validate it against this graph before anyone opens a repo.
                Scope decisions stop being guesses. Phase 1 is defined by what the graph knows is
                buildable — not by what seemed reasonable in the meeting.
              </p>
              <div className="reveal" style={{ padding: '18px 22px', borderLeft: '2px solid #e8e8e8', background: '#fafafa', borderRadius: '0 8px 8px 0' }}>
                <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', color: '#bbb', textTransform: 'uppercase', marginBottom: 8 }}>Without this, you&apos;re a Cursor wrapper</p>
                <p style={{ fontSize: 14, color: '#555', lineHeight: 1.72 }}>
                  Tools that take a PRD and generate code are solving the last 10% of the problem.
                  The 90% is knowing what the PRD should ask for. That&apos;s what the context graph does.
                  FDE agents on Notch use it as source of truth on every deal.
                </p>
              </div>
            </div>
          </div>

          {/* Feature grid */}
          <div className="feat-grid reveal">
            {[
              { n: '01', tag: 'Knowledge',    title: 'Capabilities & limits',
                body: 'Every feature, every edge case, every known constraint — structured and searchable. When a PRD references something your product handles differently, the graph knows before the FDE asks.' },
              { n: '02', tag: 'Updates',      title: 'Stays current automatically',
                body: 'New API, new limitation, new workaround — the graph ingests and updates. No more senior FDEs holding the real product knowledge in their head alone.' },
              { n: '03', tag: 'Validation',   title: 'PRD hits the graph first',
                body: 'Before a build starts, every requirement is validated against what\'s actually possible. Constraints surface. Scope forks are caught. Phase 1 is what can ship, not what was hoped for.' },
              { n: '04', tag: 'Intelligence', title: 'Agents that know your product',
                body: 'FDE agents on Notch use the graph as context for every decision — scoping, prompt generation, rollout planning. They give the right answer because they have the right knowledge.' },
            ].map(f => (
              <div key={f.title} className="feat-cell">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                  <span style={{ fontSize: 10, color: teal, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{f.tag}</span>
                  <span style={{ fontSize: 10, color: '#ccc', ...mono }}>{f.n}</span>
                </div>
                <h3 className="serif" style={{ fontSize: 18, fontWeight: 400, marginBottom: 12, letterSpacing: '-0.01em' }}>{f.title}</h3>
                <p style={{ fontSize: 13.5, lineHeight: 1.72, color: '#6b6b6b' }}>{f.body}</p>
              </div>
            ))}
          </div>

          {/* Build prompt mockup */}
          <div className="reveal" style={{ marginTop: 48 }}>
            <p className="eyebrow" style={{ marginBottom: 16, textAlign: 'center' }}>What the FDE sees — scope validated, build ready</p>
            <BuildPromptMockup />
          </div>
        </div>
      </section>

      <hr className="section-rule" />

      {/* ── 03 · How it works ───────────────────────────────────────── */}
      <section id="loop" style={{ padding: '96px 32px' }}>
        <div style={W}>
          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 80, alignItems: 'start', marginBottom: 64 }}>
            <div className="reveal">
              <p className="section-no" style={{ marginBottom: 10 }}>03 · How it works</p>
              <p style={{ fontSize: 13, color: '#999', lineHeight: 1.65 }}>Context-first, every time.</p>
            </div>
            <div>
              <h2 className="display-md reveal" style={{ marginBottom: 20, maxWidth: 540 }}>
                PRD in. Validated scope out.<br />Build starts.
              </h2>
              <p className="reveal" style={{ fontSize: 15, color: '#6b6b6b', lineHeight: 1.78, maxWidth: 540 }}>
                The call ends. The PRD is there. Plumb runs it against the context graph — surfaces
                what fits, what doesn&apos;t, what changes the architecture. The FDE reviews in
                minutes. The build starts with everything it needs.
              </p>
            </div>
          </div>

          {/* Steps */}
          <div className="reveal" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, background: '#e8e8e8', border: '1px solid #e8e8e8', borderRadius: 14, overflow: 'hidden' }}>
            {[
              { n: '01', title: 'Call → PRD',          body: 'Discovery call with SWE + FDE. PRD drafts automatically. No notes scrubbing.' },
              { n: '02', title: 'Graph validation',     body: 'PRD hits the context graph. Constraints surface. Scope forks are caught early.' },
              { n: '03', title: 'FDE locks scope',      body: 'Validated build spec reviewed in minutes, not hours. Phase 1 is what can ship.' },
              { n: '04', title: 'Customer live',        body: 'Build starts with full context. Ships the same day. No guesswork at any step.' },
            ].map(s => (
              <div key={s.n} className="feat-cell">
                <p style={{ fontSize: 10, color: '#ccc', ...mono, marginBottom: 14 }}>{s.n}</p>
                <h3 className="serif" style={{ fontSize: 17, fontWeight: 400, marginBottom: 10 }}>{s.title}</h3>
                <p style={{ fontSize: 13, lineHeight: 1.65, color: '#6b6b6b' }}>{s.body}</p>
              </div>
            ))}
          </div>

          {/* Live event stream */}
          <div className="reveal" style={{ marginTop: 32, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden', background: '#0d1117' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: '#161b22', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57', display: 'block' }} />
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e', display: 'block' }} />
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#28ca41', display: 'block' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="blink" style={{ width: 6, height: 6, borderRadius: '50%', background: teal, display: 'block' }} />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', ...mono }}>plumb · graph events</span>
              </div>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.15)', ...mono }}>FDE-workspace-prod</span>
            </div>
            <div style={{ height: 220, overflow: 'hidden' }}>
              <div className="stream">
                {[...EVENTS, ...EVENTS].map((e, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '7px 16px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.2)', flexShrink: 0, ...mono }}>{e.ts}</span>
                    <span style={{ fontSize: 10, width: 108, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: teal, ...mono }}>{e.kind}</span>
                    <span style={{ fontSize: 11.5, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.45)' }}>{e.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <hr className="section-rule" />

      {/* ── 04 · Compare ───────────────────────────────────────────────── */}
      <section id="compare" style={{ padding: '96px 32px' }}>
        <div style={W}>
          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 80, alignItems: 'start', marginBottom: 56 }}>
            <div className="reveal">
              <p className="section-no" style={{ marginBottom: 10 }}>04 · Compare</p>
              <p style={{ fontSize: 13, color: '#999', lineHeight: 1.65 }}>Same PRD. Very different scope.</p>
            </div>
            <div>
              <h2 className="display-md reveal" style={{ marginBottom: 16, maxWidth: 480 }}>
                The PRD says CRM lookup.<br />The graph decides what that means.
              </h2>
              <p className="reveal" style={{ fontSize: 15, color: '#6b6b6b', lineHeight: 1.78, maxWidth: 500 }}>
                One requirement. Without product context it gets transcribed and passed to an engineer.
                With the graph, every implication is surfaced — constraints, architecture forks,
                blockers — before anyone touches a repo.
              </p>
            </div>
          </div>

          <div style={{ textAlign: 'center', marginBottom: 0 }}>
            <p style={{ fontSize: 15, fontStyle: 'italic', color: '#888', lineHeight: 1.6, fontFamily: 'var(--font-lora), Georgia, serif', letterSpacing: '-0.01em' }}>
              &ldquo;Customer wants CRM contact lookup on inbound, near realtime.&rdquo;
            </p>
          </div>

          <ExtractionTree />

          <p style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, color: teal, marginTop: 4 }}>
            Graph validation → locked scope. Not a summary.
          </p>
        </div>
      </section>

      <hr className="section-rule" />

      {/* ── 05 · The moat ──────────────────────────────────────────────── */}
      <section id="moat" style={{ background: '#0d1117', padding: '96px 32px' }}>
        <div style={W}>
          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 80, alignItems: 'start', marginBottom: 64 }}>
            <div className="reveal">
              <p className="section-no" style={{ color: 'rgba(255,255,255,0.2)', marginBottom: 10 }}>05 · The moat</p>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', lineHeight: 1.65, marginBottom: 28 }}>A graph that compounds.</p>
              <ProductGraphViz />
            </div>
            <div>
              <h2 className="display-md reveal" style={{ color: '#fff', marginBottom: 24, maxWidth: 520 }}>
                Every build makes the graph richer.
              </h2>
              <p className="reveal" style={{ fontSize: 15, lineHeight: 1.78, color: 'rgba(255,255,255,0.5)', maxWidth: 520, marginBottom: 20 }}>
                A constraint surfaced on one deal becomes a known limitation the next FDE sees
                before they even ask. A workaround documented on a Tuesday saves three hours
                the following Monday. The product knowledge that used to live only in senior FDE
                heads now accumulates across every build.
              </p>
              <p className="reveal" style={{ fontSize: 15, lineHeight: 1.78, color: 'rgba(255,255,255,0.5)', maxWidth: 520, marginBottom: 36, padding: '16px 20px', borderLeft: `2px solid ${teal}`, background: 'rgba(255,255,255,0.03)' }}>
                No transcript tool, no AI coding assistant, no PM platform builds this. The context
                graph is only possible on the surface where the work gets done — and that dataset
                doesn&apos;t exist anywhere else.
              </p>
              <a href="/login" className="access-link" style={{ color: '#fff', textDecorationColor: 'rgba(255,255,255,0.25)' }}>Request early access →</a>
            </div>
          </div>

          <div className="reveal" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden' }}>
            {[
              { title: 'Captures what your team knows',
                body: 'Not just what\'s documented. Every scope decision, every workaround, every architecture fork — recorded in the graph as product knowledge, not just a build artifact.' },
              { title: 'Agents that get smarter every sprint',
                body: 'FDE agents on Notch use the graph as source of truth. More builds → richer graph → better scope decisions. The gap between Plumb and a cursor wrapper grows every week.' },
              { title: 'Data that only exists here',
                body: 'This graph only accumulates on the surface where scoping decisions get made. No other tool is in this position. The knowledge compounds — and it\'s yours.' },
            ].map(m => (
              <div key={m.title} style={{ padding: '36px 32px', background: 'rgba(255,255,255,0.02)' }}>
                <h3 className="serif" style={{ fontSize: 16, fontWeight: 400, color: '#fff', marginBottom: 12 }}>{m.title}</h3>
                <p style={{ fontSize: 13, lineHeight: 1.7, color: 'rgba(255,255,255,0.4)' }}>{m.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <section style={{
        background: '#fff',
        padding: '80px 32px 60px',
        borderTop: '1px solid #e8e8e8',
        position: 'relative',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 64 }}>

          {/* Text */}
          <div style={{ flex: '1 1 0' }}>
            <p className="reveal eyebrow" style={{ marginBottom: 20 }}>Plumb · useplumb.ai</p>
            <h2 className="display reveal" style={{ marginBottom: 24 }}>
              Map the product.<br />Ship the right build.
            </h2>
            <p className="reveal" style={{ fontSize: 15, color: '#6b6b6b', lineHeight: 1.78, maxWidth: 440, marginBottom: 40 }}>
              We work with AI companies where the gap between what sales promises and
              what can actually be built is where deals stall. Plumb closes that gap
              before the build starts — not after it fails.
            </p>
            <div className="reveal" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <Link href="/login" className="btn btn-solid" style={{ fontSize: 14 }}>Request early access</Link>
              <a href="mailto:hello@useplumb.ai" style={{
                fontSize: 14, color: '#6b6b6b',
                textDecoration: 'underline', textUnderlineOffset: 3,
                textDecorationColor: 'rgba(0,0,0,0.2)',
              }}>hello@useplumb.ai</a>
            </div>
          </div>

          {/* Character image */}
          <div style={{ flex: '0 0 540px' }}>
            <img
              src="/plumb-footer-img.jpg"
              alt=""
              style={{ display: 'block', width: '100%', height: 'auto' }}
            />
          </div>
        </div>
      </section>

      <footer id="footer-cta" style={{ borderTop: '1px solid #e8e8e8', padding: '0 32px', background: '#fff' }}>
        <div style={{ ...W, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <PlumbLogo size={18} />
          <div style={{ display: 'flex', gap: 24 }}>
            <Link href="/login" style={{ fontSize: 12.5, color: '#aaa', textDecoration: 'none' }}>Sign in</Link>
            <a href="mailto:hello@useplumb.ai" style={{ fontSize: 12.5, color: '#aaa', textDecoration: 'none' }}>hello@useplumb.ai</a>
          </div>
          <span style={{ fontSize: 12, color: '#ccc' }}>© 2026 Applied Scope</span>
        </div>
      </footer>

      <PlumberBob />
    </div>
  )
}
