import Link from 'next/link'
import { ExtractionTree } from './extraction-tree'
import { PipelineMockup, BuildPromptMockup } from './app-mockup'
import { PlumbLogo } from './plumb-logo'

const EVENTS = [
  { kind: 'intake',        detail: 'FDE-112 ingested — Vertex AI, Acme Corp',         ts: '09:14' },
  { kind: 'context_score', detail: 'Scored 44/100 — OAuth scope not captured',         ts: '09:16' },
  { kind: 'ae_sync',       detail: 'AE gap sync requested — 3 blockers flagged',       ts: '09:17' },
  { kind: 'context_score', detail: 'Re-scored 78/100 — context gate cleared',          ts: '10:02' },
  { kind: 'build_kickoff', detail: 'Build prompt dispatched → Claude Code',            ts: '10:03' },
  { kind: 'stage_change',  detail: 'FDE-112 → build · Quick Win · 21d SLA',           ts: '10:04' },
  { kind: 'deploy',        detail: 'FDE-109 shipped — Northwind, Atlas Freight',       ts: '10:31' },
  { kind: 'ingest',        detail: 'FDE-113 ingested from Gong transcript',            ts: '11:04' },
  { kind: 'classify',      detail: 'FDE-113 → Big Bet · custom middleware · 45d SLA', ts: '11:05' },
  { kind: 'stage_change',  detail: 'FDE-112 → deploy · prod keys approved',           ts: '11:47' },
]

const W    = { maxWidth: 1100, margin: '0 auto', padding: '0 32px' } as const
const mono = { fontFamily: 'var(--font-jetbrains), monospace' } as const
const teal = '#1db584'

const NAV = [
  { label: 'Problem',  href: '#problem' },
  { label: 'Plumb',    href: '#plumb'   },
  { label: 'The loop', href: '#loop'    },
  { label: 'Compare',  href: '#compare' },
  { label: 'Moat',     href: '#moat'    },
]

export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: '#0c0c0c' }}>

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
              Meeting ends.<br />Build deploys.
            </h1>
            <p className="h2" style={{ fontSize: 17, color: '#6b6b6b', lineHeight: 1.72, maxWidth: 480, marginBottom: 32, letterSpacing: '-0.01em' }}>
              Your AI sales agents fill the calendar. But every meeting that closes
              needs a custom build — scoped, coded, and shipped to the customer&apos;s stack.
              Plumb does that automatically. Same day.
            </p>
            <div className="h3" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <Link href="/login" className="btn btn-solid" style={{ fontSize: 14 }}>Request early access</Link>
              <a href="#plumb" className="access-link" style={{ fontSize: 14 }}>See how it works</a>
            </div>
          </div>

          {/* Full-width app mockup — no gradient, sits clean on white */}
          <div className="h4">
            <PipelineMockup />
          </div>
        </div>
      </section>

      {/* Stats row */}
      <div style={{ ...W, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderTop: '1px solid #e8e8e8', borderBottom: '1px solid #e8e8e8', margin: '0 auto' }}>
        {[
          { v: '1 FDE',   d: 'does what used to take a full team' },
          { v: '< 1 day', d: 'from call to customer going live' },
          { v: '729%',    d: 'YoY growth in FDE job postings' },
        ].map((s, i) => (
          <div key={s.v} style={{ padding: '28px 0', paddingLeft: i > 0 ? 40 : 0, borderLeft: i > 0 ? '1px solid #e8e8e8' : 'none' }}>
            <p style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 4 }}>{s.v}</p>
            <p style={{ fontSize: 13, color: '#999' }}>{s.d}</p>
          </div>
        ))}
      </div>

      {/* ── 01 · The clog ──────────────────────────────────────────────── */}
      <section id="problem" style={{ padding: '96px 32px' }}>
        <div style={W}>
          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 80, alignItems: 'start' }}>
            <div className="reveal">
              <p className="section-no" style={{ marginBottom: 10 }}>01 · The clog</p>
              <p style={{ fontSize: 13, color: '#999', lineHeight: 1.65 }}>Why AI ROI is stuck.</p>
            </div>
            <div>
              <h2 className="display-md reveal" style={{ marginBottom: 24, maxWidth: 560 }}>
                AI closes the meeting.<br />Nobody ships the build.
              </h2>
              <p className="reveal" style={{ fontSize: 15, color: '#6b6b6b', lineHeight: 1.78, maxWidth: 560, marginBottom: 20 }}>
                AI agents have gotten really good at booking meetings. Your pipeline is growing.
                But every deal that closes needs a real custom integration — built to that customer&apos;s
                exact systems, by someone who understands both your product and their stack.
              </p>
              <p className="reveal" style={{ fontSize: 15, color: '#6b6b6b', lineHeight: 1.78, maxWidth: 560 }}>
                That person is the Forward Deployed Engineer. And right now they&apos;re buried — pulling
                call recordings, writing specs from scratch, rebuilding the same context every time.
                95% of AI deals never deliver real ROI. Not because the AI doesn&apos;t work.
                Because the build never shipped.
              </p>
            </div>
          </div>

          {/* Pipeline diagram */}
          <div style={{ marginTop: 72 }}>
            <div className="reveal" style={{ display: 'flex', gap: 6 }}>
              {[
                { n: '01', label: 'AI Outbound',    sub: 'Pipeline fills fast',    owned: false },
                { n: '02', label: 'Discovery call', sub: 'AE closes the meeting',  owned: false },
                { n: '03', label: 'Scope & qualify', sub: 'What do they need?',    owned: true  },
                { n: '04', label: 'Build it',       sub: '← stuck here',           owned: true, clog: true },
                { n: '05', label: 'Ship & expand',  sub: 'Customer goes live',     owned: true  },
              ].map((s, i) => (
                <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                  <div style={{
                    flex: 1, padding: '20px 18px', borderRadius: 10,
                    border: `1px solid ${s.owned ? (s.clog ? '#f59e0b' : teal) : '#e8e8e8'}`,
                    background: s.owned ? (s.clog ? 'rgba(245,158,11,0.03)' : 'rgba(29,181,132,0.03)') : '#fafafa',
                    position: 'relative',
                  }}>
                    {s.clog && (
                      <div style={{ position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)', fontSize: 9.5, fontWeight: 600, color: '#f59e0b', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap', ...mono }}>↑ the clog</div>
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
              <span style={{ fontSize: 12.5, color: '#888' }}>Plumb handles steps <strong style={{ color: '#0c0c0c' }}>03 → 05</strong></span>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: '#e8e8e8', border: '1px solid #e8e8e8', borderRadius: 14, overflow: 'hidden', marginTop: 64 }}>
            {[
              { v: '729%',        label: 'YoY growth in FDE job postings', sub: '643 → 5,330 · Indeed Apr \'25→\'26' },
              { v: '$190K–$385K', label: 'average FDE salary', sub: 'Senior roles hit $600K+' },
              { v: 'No playbook', label: 'no shared process, no tools', sub: 'Every build starts from zero' },
            ].map((s, i) => (
              <div key={s.v} className={`feat-cell reveal reveal-d${(i + 1) as 1|2|3}`}>
                <p className="serif" style={{ fontSize: 22, fontWeight: 400, letterSpacing: '-0.01em', marginBottom: 8 }}>{s.v}</p>
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{s.label}</p>
                <p style={{ fontSize: 11, color: '#aaa', ...mono }}>{s.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <hr className="section-rule" />

      {/* ── 02 · Plumb ─────────────────────────────────────────────────── */}
      <section id="plumb" style={{ padding: '96px 32px' }}>
        <div style={W}>
          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 80, alignItems: 'start', marginBottom: 64 }}>
            <div className="reveal">
              <p className="section-no" style={{ marginBottom: 10 }}>02 · Plumb</p>
              <p style={{ fontSize: 13, color: '#999', lineHeight: 1.65 }}>One surface. Replaces the whole chain.</p>
            </div>
            <div>
              <h2 className="display-md reveal" style={{ marginBottom: 20, maxWidth: 520 }}>
                Sits in your call. Ships the build.
              </h2>
              <p className="reveal" style={{ fontSize: 15, color: '#6b6b6b', lineHeight: 1.78, maxWidth: 540, marginBottom: 20 }}>
                Plumb listens to your discovery calls in real time. It pulls out everything an engineer
                needs — OAuth requirements, latency specs, the architecture decision the customer mentioned
                once and nobody wrote down. When the call ends, the build prompt is ready.
              </p>
              <p className="reveal" style={{ fontSize: 15, color: '#6b6b6b', lineHeight: 1.78, maxWidth: 540, marginBottom: 28 }}>
                The FDE reviews it, hits approve, and the build kicks off. The customer goes live
                that day. No Gong scrubbing. No spec writing. No waiting on the next sprint.
              </p>
              <div className="reveal" style={{ padding: '18px 22px', borderLeft: '2px solid #e8e8e8', background: '#fafafa', borderRadius: '0 8px 8px 0' }}>
                <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', color: '#bbb', textTransform: 'uppercase', marginBottom: 8 }}>Why live, not a form</p>
                <p style={{ fontSize: 14, color: '#555', lineHeight: 1.72 }}>
                  Post-call forms miss the detail. The latency target. The auth edge case.
                  The scope fork the customer only said once. That information exists in the call
                  and nowhere else. Plumb gets it there.
                </p>
              </div>
            </div>
          </div>

          {/* Feature grid */}
          <div className="feat-grid reveal">
            {[
              { n: '01', tag: 'Platform',    title: 'Headless by default',
                body: 'Your platform exposed as an agent-native API. Builds run against your real product stack — no separate environment, no manual steps.' },
              { n: '02', tag: 'Integration', title: 'Inside your calls',
                body: 'Plugs into Gong and Zoom. Captures scope as it\'s being defined — not after the fact. The build prompt is ready before the AE closes the tab.' },
              { n: '03', tag: 'Intelligence', title: 'Context gate',
                body: 'Scores every call 0–100. Under 60? Build blocked, gaps listed. Over 60? Prompt generated. You never kick off a build on an incomplete spec again.' },
              { n: '04', tag: 'Model',       title: 'Gets smarter every build',
                body: 'Every deployment teaches the system how your best FDEs think. Which forks to take. Which questions to ask. The more you ship, the faster you ship.' },
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
            <p className="eyebrow" style={{ marginBottom: 16, textAlign: 'center' }}>What the FDE actually sees</p>
            <BuildPromptMockup />
          </div>
        </div>
      </section>

      <hr className="section-rule" />

      {/* ── 03 · The loop ──────────────────────────────────────────────── */}
      <section id="loop" style={{ padding: '96px 32px' }}>
        <div style={W}>
          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 80, alignItems: 'start', marginBottom: 64 }}>
            <div className="reveal">
              <p className="section-no" style={{ marginBottom: 10 }}>03 · The loop</p>
              <p style={{ fontSize: 13, color: '#999', lineHeight: 1.65 }}>Meeting ends. Build deploys.</p>
            </div>
            <div>
              <h2 className="display-md reveal" style={{ marginBottom: 20, maxWidth: 540 }}>
                Five steps. Used to live in five tools. Now it&apos;s one.
              </h2>
              <p className="reveal" style={{ fontSize: 15, color: '#6b6b6b', lineHeight: 1.78, maxWidth: 540 }}>
                Call → notes → spec → build → deploy. Each step is a place where something gets
                lost or delayed. Plumb collapses it. The call ends. The build starts.
                The customer is live before end of day.
              </p>
            </div>
          </div>

          {/* Steps */}
          <div className="reveal" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, background: '#e8e8e8', border: '1px solid #e8e8e8', borderRadius: 14, overflow: 'hidden' }}>
            {[
              { n: '01', title: 'The call',     body: 'Plumb listens live. No notes, no recordings to scrub later.' },
              { n: '02', title: 'Score it',     body: 'Context scored 0–100. Gaps flagged. AE synced if needed.' },
              { n: '03', title: 'Prompt out',   body: 'Build spec generated. FDE reviews in 30 seconds, not 30 minutes.' },
              { n: '04', title: 'Customer live', body: 'Build ships. Customer onboarded. Same day as the call.' },
            ].map(s => (
              <div key={s.n} className="feat-cell">
                <p style={{ fontSize: 10, color: '#ccc', ...mono, marginBottom: 14 }}>{s.n}</p>
                <h3 className="serif" style={{ fontSize: 17, fontWeight: 400, marginBottom: 10 }}>{s.title}</h3>
                <p style={{ fontSize: 13, lineHeight: 1.65, color: '#6b6b6b' }}>{s.body}</p>
              </div>
            ))}
          </div>

          {/* Sensor stream */}
          <div className="reveal" style={{ marginTop: 32, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden', background: '#0d1117' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: '#161b22', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57', display: 'block' }} />
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e', display: 'block' }} />
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#28ca41', display: 'block' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="blink" style={{ width: 6, height: 6, borderRadius: '50%', background: teal, display: 'block' }} />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', ...mono }}>plumb · live feed</span>
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
              <p style={{ fontSize: 13, color: '#999', lineHeight: 1.65 }}>Same call. Very different result.</p>
            </div>
            <div>
              <h2 className="display-md reveal" style={{ marginBottom: 16, maxWidth: 480 }}>
                The AE hears the deal.<br />Plumb hears the build.
              </h2>
              <p className="reveal" style={{ fontSize: 15, color: '#6b6b6b', lineHeight: 1.78, maxWidth: 500 }}>
                One call. Two completely different things captured. The AE gets the CRM note.
                We get everything an engineer needs to actually build it.
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
            Scope fork → build prompt. Not a summary.
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
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', lineHeight: 1.65 }}>Why us.</p>
            </div>
            <div>
              <h2 className="display-md reveal" style={{ color: '#fff', marginBottom: 24, maxWidth: 520 }}>
                Gets better every time someone ships a build.
              </h2>
              <p className="reveal" style={{ fontSize: 15, lineHeight: 1.78, color: 'rgba(255,255,255,0.5)', maxWidth: 520, marginBottom: 20 }}>
                Every build Plumb ships teaches it something. How the best FDEs think through
                a scope problem. Which questions to ask. Which forks to take before the repo opens.
                That knowledge compounds — every customer makes every future customer faster.
              </p>
              <p className="reveal" style={{ fontSize: 15, lineHeight: 1.78, color: 'rgba(255,255,255,0.5)', maxWidth: 520, marginBottom: 36, padding: '16px 20px', borderLeft: `2px solid ${teal}`, background: 'rgba(255,255,255,0.03)' }}>
                Gong has transcripts. We have intention — and that dataset doesn&apos;t exist anywhere else.
              </p>
              <a href="/login" className="access-link" style={{ color: '#fff', textDecorationColor: 'rgba(255,255,255,0.25)' }}>Request early access →</a>
            </div>
          </div>

          <div className="reveal" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden' }}>
            {[
              { title: 'It learns how your best FDEs think',
                body: 'Not just what they said — what they decided. Which fork they took. What they resolved before the repo even opened. That signal is captured on every build.' },
              { title: 'Faster with every customer',
                body: 'More builds → smarter prompts → faster go-lives. The gap between Plumb and doing it by hand gets bigger every week you use it.' },
              { title: 'Data nobody else has',
                body: 'This only accumulates on the surface where the work gets done. No CRM, no transcript tool, no PM platform is close. We\'re the only one here.' },
            ].map(m => (
              <div key={m.title} style={{ padding: '36px 32px', background: 'rgba(255,255,255,0.02)' }}>
                <h3 className="serif" style={{ fontSize: 16, fontWeight: 400, color: '#fff', marginBottom: 12 }}>{m.title}</h3>
                <p style={{ fontSize: 13, lineHeight: 1.7, color: 'rgba(255,255,255,0.4)' }}>{m.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────────── */}
      <section style={{ padding: '120px 32px 96px', borderTop: '1px solid #e8e8e8' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <p className="reveal eyebrow" style={{ marginBottom: 20 }}>Plumb · useplumb.ai</p>
          <h2 className="display reveal" style={{ marginBottom: 24 }}>
            Clear the clog.<br />Ship the build.
          </h2>
          <p className="reveal" style={{ fontSize: 15, color: '#6b6b6b', lineHeight: 1.78, maxWidth: 440, marginBottom: 40 }}>
            We&apos;re working with our first customers now — AI companies where
            the pipeline is growing faster than the team can ship builds.
            If that&apos;s you, talk to us.
          </p>
          <div className="reveal" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <Link href="/login" className="btn btn-solid" style={{ fontSize: 14 }}>Request early access</Link>
            <a href="mailto:hello@useplumb.ai" className="access-link" style={{ fontSize: 14 }}>hello@useplumb.ai</a>
          </div>
        </div>
      </section>

      <footer style={{ borderTop: '1px solid #e8e8e8', padding: '0 32px' }}>
        <div style={{ ...W, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <PlumbLogo size={18} />
          <div style={{ display: 'flex', gap: 24 }}>
            <Link href="/login" style={{ fontSize: 12.5, color: '#aaa', textDecoration: 'none' }}>Sign in</Link>
            <a href="mailto:hello@useplumb.ai" style={{ fontSize: 12.5, color: '#aaa', textDecoration: 'none' }}>hello@useplumb.ai</a>
          </div>
          <span style={{ fontSize: 12, color: '#ccc' }}>© 2026 Applied Scope</span>
        </div>
      </footer>
    </div>
  )
}
