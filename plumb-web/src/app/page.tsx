import Link from 'next/link'
import { PlumbLogo } from './plumb-logo'
import { NavMenu } from './nav-menu'
import { ExtractionTree } from './extraction-tree'
import { CallPrepMockup, PipelineMockup } from './app-mockup'
import { PipeFlow } from './pipe-flow'
import { OrbField } from './orb-field'
import { FeatureCards, BuiltTicker } from './feature-cards'
import { PlumberWorld } from './plumber-world'

// ── Color tokens — key ones use CSS vars for light/dark theming ───────────

const BG       = 'var(--lp-bg)'       // switches dark ↔ light
const BG2      = 'var(--lp-bg2)'
const BLUE     = '#202ded'            // always blue
const BLUE_MID = '#898fe9'
const BLUE_PAL = '#cacdff'
const INK      = 'var(--lp-ink)'      // switches white ↔ dark
const DIM      = 'var(--lp-dim)'      // switches dim-white ↔ dim-black
const LINE     = 'var(--lp-line)'     // switches dim-border
const DIM2     = 'var(--lp-dim2)'     // medium opacity
const DIM3     = 'var(--lp-dim3)'     // low opacity
const NAVBG    = 'var(--lp-nav-bg)'   // nav blur tint

// ── Typography ─────────────────────────────────────────────────────────────

const HERO: React.CSSProperties = {
  fontFamily: 'var(--font-inter), system-ui, sans-serif',
  fontSize:   'clamp(60px, 10.5vw, 144px)',
  fontWeight: 900,
  lineHeight: 0.94,
  letterSpacing: '-0.04em',
  color: INK,
  textTransform: 'uppercase',
}

const SECT: React.CSSProperties = {
  fontFamily: 'var(--font-inter), system-ui, sans-serif',
  fontSize:   'clamp(42px, 7.5vw, 104px)',
  fontWeight: 900,
  lineHeight: 0.94,
  letterSpacing: '-0.04em',
  color: INK,
  textTransform: 'uppercase',
}

const MONO: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains), monospace',
  fontSize: 10, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: DIM,
}

// ── MaskLine — locomotive slide-up reveal ─────────────────────────────────

function ML({
  children, d = '', style,
}: { children: React.ReactNode; d?: string; style?: React.CSSProperties }) {
  return (
    <span className={`mask-wrap ${d}`} style={{ display: 'block', ...style }}>
      <span className="mask-inner">{children}</span>
    </span>
  )
}

// ── Marquee band ───────────────────────────────────────────────────────────

function Band({
  items, bg = BLUE, color = '#fff', dur = '20', rev = false, py = 16,
}: {
  items: string; bg?: string; color?: string; dur?: string; rev?: boolean; py?: number
}) {
  const rpt = Array.from({ length: 14 }, (_, i) => (
    <span key={i} style={{ paddingRight: '0.6em', display: 'inline-flex', alignItems: 'center', gap: '0.5em' }}>
      {items}
      <svg width="5" height="5" viewBox="0 0 5 5"><circle cx="2.5" cy="2.5" r="2.5" fill="currentColor" opacity={0.7}/></svg>
    </span>
  ))
  return (
    <div style={{ background: bg, overflow: 'hidden', padding: `${py}px 0` }}>
      <div
        className={`marquee-track${rev ? ' marquee-track-rev' : ''}`}
        data-dur={dur}
        style={{ color, fontSize: 'clamp(12px,1.3vw,15px)', fontWeight: 700, letterSpacing: '0.06em', display: 'flex', whiteSpace: 'nowrap' }}
      >
        {rpt}{rpt}
      </div>
    </div>
  )
}

// ── Label ──────────────────────────────────────────────────────────────────

function No({ n }: { n: string }) {
  return <p style={{ ...MONO, marginBottom: 24, color: BLUE_MID }}><span style={{ color: BLUE }}>{n}</span> —</p>
}

// ── Page ───────────────────────────────────────────────────────────────────

import type React from 'react'

export default function LandingPage() {
  return (
    <div style={{ background: BG, color: INK, overflowX: 'hidden' }}>

      {/* Scroll progress bar */}
      <div className="scroll-bar" />

      {/* ══ Wandering plumbers — fixed overlay, depth-layered lanes ═══ */}
      <PlumberWorld />

      {/* ══ Nav ═══════════════════════════════════════════════════════ */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 36px', height: 52,
        background: NAVBG,
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        borderBottom: `1px solid ${LINE}`,
      }}>
        <NavMenu />
        <div className="lp-nav-links">
          {['Problem', 'Plumb', 'Compare'].map(l => (
            <a key={l} href={`#${l.toLowerCase()}`}
              className="loco-nav-link"
              style={{ ...MONO, color: DIM, textDecoration: 'none' }}>{l}</a>
          ))}
        </div>
        <Link href="/login" className="loco-btn-ghost" style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
          textTransform: 'uppercase', color: INK,
          border: `1.5px solid ${DIM2}`,
          borderRadius: 4, padding: '7px 18px',
          textDecoration: 'none',
        }}>Get access</Link>
      </nav>

      {/* ══ Hero ══════════════════════════════════════════════════════ */}
      <section style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '0 36px 64px', paddingTop: 52, position: 'relative' }}>

        {/* Floating light orbs — mouse-parallax driven, reformcollective aesthetic */}
        <OrbField />

        {/* Big ghost number top-right */}
        <div aria-hidden data-parallax="-0.04" style={{
          position: 'absolute', top: '10vh', right: 32,
          fontFamily: 'var(--font-inter), sans-serif',
          fontSize: 'clamp(160px, 28vw, 380px)',
          fontWeight: 900, letterSpacing: '-0.06em',
          color: `${BLUE}0d`,
          lineHeight: 1, userSelect: 'none', pointerEvents: 'none',
        }}>01</div>

        {/* Badge + eyebrow row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 52 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: BLUE,
            border: `1px solid ${BLUE}55`, borderRadius: 3,
            padding: '3px 9px', fontFamily: 'var(--font-jetbrains), monospace',
          }}>Early Access</span>
          <ML style={{ ...MONO, color: DIM }}>
            The FDE deployment workspace
          </ML>
        </div>

        {/* Headline — data-skew gives it the locomotive distortion on scroll */}
        <div data-skew style={{ lineHeight: 1 }}>
          <ML style={HERO}>Meeting ends.</ML>
          <ML d="mask-d1" style={HERO}>Build deploys.</ML>
        </div>

        {/* Animated pipe flow — CALL → PLUMB → BUILD */}
        <div style={{ marginTop: 52, marginBottom: 4 }}>
          <PipeFlow />
        </div>

        {/* Bottom row: copy + CTA */}
        <div className="hero-bottom-grid">
          <p style={{ fontSize: 'clamp(14px,1.4vw,17px)', color: DIM, lineHeight: 1.74, letterSpacing: '-0.01em' }}>
            Plumb sits inside your sales calls. It pulls the spec, scores complexity,
            and ships a build prompt to engineering — before your AE engages an FDE.
          </p>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <Link href="/login" className="loco-btn-blue" style={{
              fontSize: 13, fontWeight: 700, letterSpacing: '0.03em',
              color: '#fff', background: BLUE,
              borderRadius: 4, padding: '11px 28px',
              textDecoration: 'none', textTransform: 'uppercase',
            }}>Request early access</Link>
            <a href="mailto:hello@useplumb.ai" className="loco-link" style={{ fontSize: 13.5, letterSpacing: '-0.01em' }}>hello@useplumb.ai</a>
          </div>

          {/* Scroll indicator */}
          <div aria-hidden style={{
            marginTop: 48,
            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8,
          }}>
            <span style={{ ...MONO, color: DIM, fontSize: 9 }}>Scroll to explore</span>
            <div className="scroll-arrow" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width: 1, height: 8, background: DIM, opacity: 1 - i * 0.28, borderRadius: 1 }} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ Feature cards — reformcollective 3-card style ═════════════ */}
      <FeatureCards />

      {/* ══ Built Different ticker ════════════════════════════════════ */}
      <BuiltTicker />

      {/* ══ Band 1 ════════════════════════════════════════════════════ */}
      <Band items="The FDE Pipeline" bg={BLUE} dur="20" />

      {/* ══ Problem ═══════════════════════════════════════════════════ */}
      <section id="problem" style={{ padding: 'clamp(80px,10vw,160px) 36px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'clamp(40px,6vw,96px)', alignItems: 'start' }}>

            {/* Sticky left: heading */}
            <div style={{ position: 'sticky', top: 80 }}>
              <No n="01" />
              <div data-skew>
                <ML style={SECT}>AI closes</ML>
                <ML d="mask-d1" style={SECT}>the meeting.</ML>
                <ML d="mask-d2" style={{ ...SECT, color: BLUE }}>Nobody ships</ML>
                <ML d="mask-d3" style={{ ...SECT, color: BLUE }}>the build.</ML>
              </div>
            </div>

            {/* Right: copy + items */}
            <div style={{ paddingTop: 48 }}>
              <p className="reveal-up" style={{ fontSize: 'clamp(14px,1.4vw,17px)', color: DIM, lineHeight: 1.78, letterSpacing: '-0.01em', marginBottom: 56 }}>
                The call ends. Gong records it. The AE writes a Slack. Engineering has
                three other builds open. The spec lands in a Notion nobody reads.
                Six weeks later, the customer asks where their build is.
              </p>
              {[
                { n: '01', h: 'The spec disappears',       b: 'Call transcripts sit unread. Requirements get lost in Slack. Scope mismatches surface three weeks into the build.' },
                { n: '02', h: 'Auth, latency — all guesses', b: 'OAuth scope, p95 latency requirements, concurrent user ceilings. Engineers guess. Deadlines slip.' },
                { n: '03', h: 'The pipe is clogged',       b: 'Data went in one end and never came out the other. Every stalled deal is a plumbing problem.' },
              ].map((item, i) => (
                <div key={item.n} className={`reveal-up stagger-${i + 1}`}
                  style={{ borderTop: `1px solid ${LINE}`, padding: '24px 0' }}>
                  <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
                    <span style={{ ...MONO, color: BLUE, flexShrink: 0, paddingTop: 3 }}>{item.n}</span>
                    <div>
                      <p style={{ fontSize: 'clamp(15px,1.5vw,18px)', fontWeight: 700, color: INK, letterSpacing: '-0.02em', marginBottom: 8 }}>{item.h}</p>
                      <p style={{ fontSize: 14, color: DIM, lineHeight: 1.7, letterSpacing: '-0.005em' }}>{item.b}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ Band 2 — reversed dim ═════════════════════════════════════ */}
      <Band items="Meeting ends · Build deploys" bg={BG2} color={BLUE_MID} dur="16" rev />

      {/* ══ Extract ═══════════════════════════════════════════════════ */}
      <section style={{ padding: 'clamp(80px,10vw,160px) 36px', background: BG2 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 'clamp(40px,6vw,80px)', alignItems: 'start' }}>

            {/* Sticky left: heading + description */}
            <div style={{ position: 'sticky', top: 88 }}>
              <No n="02" />
              <div data-skew>
                <ML style={SECT}>Surfaces what</ML>
                <ML d="mask-d1" style={{ ...SECT, color: BLUE }}>AEs miss.</ML>
              </div>
              <p className="reveal-up" style={{ fontSize: 'clamp(14px,1.4vw,17px)', color: DIM, lineHeight: 1.78, marginTop: 32 }}>
                Plumb listens to your Gong or Zoom call and extracts every technical requirement,
                latency constraint, auth gap, and integration mismatch — while you talk.
              </p>
              <p className="reveal-up stagger-1" style={{ fontSize: 'clamp(14px,1.4vw,17px)', color: DIM, lineHeight: 1.78, marginTop: 20 }}>
                What AEs write: <em style={{ color: BLUE_PAL }}>&ldquo;CRM lookup.&rdquo;</em><br />
                What engineers need: OAuth scope, p95 gate, Salesforce REST v57, Redis layer.
              </p>
            </div>

            {/* Right: extraction tree */}
            <div className="reveal-scale extraction-tree-wrap">
              <ExtractionTree />
            </div>
          </div>
        </div>
      </section>

      {/* ══ Plumb ═════════════════════════════════════════════════════ */}
      <section id="plumb" style={{ padding: 'clamp(80px,10vw,160px) 36px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>

          <div style={{ marginBottom: 72 }}>
            <No n="03" />
            <div data-skew>
              <ML style={SECT}>Sits in your call.</ML>
              <ML d="mask-d1" style={{ ...SECT, color: BLUE }}>Ships the build.</ML>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 72, alignItems: 'start', marginBottom: 96 }}>
            <div className="reveal-scale">
              <CallPrepMockup />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {[
                { t: 'Headless by default',  b: 'Sits silently in every Gong call. No new meeting. No prep doc. Just context, captured.' },
                { t: 'Inside your calls',    b: 'Knows what was said, promised, and missing — before your AE types the first Slack.' },
                { t: 'Connects the gaps',    b: 'Auth scope, latency requirements, platform constraints. Surfaces mismatches AEs miss every time.' },
                { t: 'Ships the prompt',     b: 'A build brief lands in Claude Code. Engineering opens a repo, not a doc.' },
              ].map((f, i) => (
                <div key={f.t} className={`reveal-up stagger-${i + 1}`}
                  style={{ borderTop: `1px solid ${LINE}`, padding: '22px 0' }}>
                  <p style={{ fontSize: 'clamp(14px,1.4vw,17px)', fontWeight: 700, color: INK, letterSpacing: '-0.02em', marginBottom: 7 }}>{f.t}</p>
                  <p style={{ fontSize: 13.5, color: DIM, lineHeight: 1.7, letterSpacing: '-0.005em' }}>{f.b}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Five steps + pipeline */}
          <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 64 }}>
            <No n="04" />
            <div style={{ display: 'flex', gap: 'clamp(20px,4vw,56px)', marginBottom: 48, flexWrap: 'wrap' }}>
              <ML style={{ ...SECT, flex: 1, minWidth: 240 }}>Five steps.</ML>
              <ML d="mask-d1" style={{ ...SECT, flex: 1, minWidth: 240, color: DIM }}>One surface.</ML>
            </div>
            <div className="reveal-scale">
              <PipelineMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ══ Compare ═══════════════════════════════════════════════════ */}
      <section id="compare" style={{ padding: 'clamp(80px,10vw,160px) 36px', background: BG2 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <No n="05" />
          <div style={{ marginBottom: 64 }}>
            <div data-skew>
              <ML style={SECT}>The AI hears</ML>
              <ML d="mask-d1" style={SECT}>the deal.</ML>
              <ML d="mask-d2" style={{ ...SECT, color: BLUE }}>Plumb hears</ML>
              <ML d="mask-d3" style={{ ...SECT, color: BLUE }}>the build.</ML>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: LINE, borderRadius: 10, overflow: 'hidden' }}>
            <div className="reveal-left" style={{ background: BG2, padding: 'clamp(32px,4vw,52px)' }}>
              <p style={{ ...MONO, color: DIM2, marginBottom: 24 }}>Before Plumb</p>
              {[
                'Call ends. AE writes a Slack.',
                'FDE asks six clarifying questions.',
                'Three docs shared, none are current.',
                'Spec goes into Notion. Nobody reads it.',
                'Engineering rediscovers scope 2 weeks later.',
              ].map(item => (
                <div key={item} style={{ display: 'flex', gap: 14, padding: '14px 0', borderBottom: `1px solid ${LINE}` }}>
                  <span style={{ color: '#e54545', fontSize: 13, flexShrink: 0 }}>✕</span>
                  <p style={{ fontSize: 'clamp(13px,1.3vw,15px)', color: DIM, lineHeight: 1.6 }}>{item}</p>
                </div>
              ))}
            </div>
            <div className="reveal-left stagger-2" style={{ background: BG2, padding: 'clamp(32px,4vw,52px)' }}>
              <p style={{ ...MONO, color: BLUE, marginBottom: 24 }}>With Plumb</p>
              {[
                'Plumb captures requirements mid-call.',
                'Spec scored and gap-flagged in real time.',
                'Build prompt in Claude Code before call ends.',
                'FDE reviews, approves, repo is open.',
                "Customer asks about their build. It's already live.",
              ].map(item => (
                <div key={item} style={{ display: 'flex', gap: 14, padding: '14px 0', borderBottom: `1px solid ${LINE}` }}>
                  <span style={{ color: BLUE_MID, fontSize: 13, flexShrink: 0 }}>✓</span>
                  <p style={{ fontSize: 'clamp(13px,1.3vw,15px)', color: INK, lineHeight: 1.6 }}>{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ Stats ═════════════════════════════════════════════════════ */}
      <section style={{ padding: 'clamp(80px,10vw,140px) 36px', borderTop: `1px solid ${LINE}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <No n="06" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: LINE, borderRadius: 10, overflow: 'hidden' }}>
            {[
              { raw: '730', s: '%',  l: 'FDE pipeline growth',   sub: 'for early customers' },
              { raw: '3',   s: '×',  l: 'faster first deploy',   sub: 'vs. manual handoff' },
              { raw: '100', s: '%',  l: 'signal captured',       sub: 'nothing lost at handoff' },
            ].map((s, i) => (
              <div key={s.l} className={`reveal-up stagger-${i + 1}`}
                style={{ background: BG, padding: 'clamp(32px,4vw,52px)' }}>
                <p style={{
                  fontFamily: 'var(--font-inter), sans-serif',
                  fontSize: 'clamp(52px,8.5vw,112px)',
                  fontWeight: 900, letterSpacing: '-0.05em',
                  color: BLUE, lineHeight: 1, marginBottom: 14,
                }}>
                  <span data-count-to={`${s.raw}${s.s}`}>{s.raw}{s.s}</span>
                </p>
                <p style={{ fontSize: 'clamp(14px,1.4vw,17px)', fontWeight: 600, color: INK, marginBottom: 4 }}>{s.l}</p>
                <p style={{ ...MONO, color: DIM }}>{s.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ Band 3 ════════════════════════════════════════════════════ */}
      <Band items="Clear the clog · Ship the build" bg={BLUE} dur="18" />

      {/* ══ CTA ═══════════════════════════════════════════════════════ */}
      <section style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center',
        textAlign: 'center', padding: 'clamp(80px,10vw,140px) 36px',
        position: 'relative',
      }}>
        <div aria-hidden data-parallax="0.05" style={{
          position: 'absolute', bottom: '6vh', left: 32,
          fontFamily: 'var(--font-inter), sans-serif',
          fontSize: 'clamp(140px,26vw,360px)',
          fontWeight: 900, letterSpacing: '-0.06em',
          color: `${BLUE}0d`,
          lineHeight: 1, userSelect: 'none', pointerEvents: 'none',
        }}>07</div>

        <div style={{ maxWidth: 900 }}>
          <p style={{ ...MONO, color: BLUE, marginBottom: 40 }}>Get started</p>
          <div data-skew>
            <ML style={HERO}>Clear the clog.</ML>
            <ML d="mask-d1" style={{ ...HERO, color: BLUE }}>Ship the build.</ML>
          </div>
          <p className="reveal-up" style={{ fontSize: 'clamp(15px,1.5vw,18px)', color: DIM, lineHeight: 1.75, maxWidth: 520, margin: '48px auto', letterSpacing: '-0.01em' }}>
            We&apos;re working with our first FDE teams now.
            If your pipeline is growing faster than your team can ship, talk to us.
          </p>
          <div className="reveal-up stagger-2" style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/login" className="loco-btn-blue" style={{
              fontSize: 13, fontWeight: 700, letterSpacing: '0.04em',
              textTransform: 'uppercase', color: '#fff',
              background: BLUE, borderRadius: 4, padding: '13px 34px',
              textDecoration: 'none',
            }}>Request early access</Link>
            <a href="mailto:hello@useplumb.ai" className="loco-btn-ghost" style={{
              fontSize: 13, fontWeight: 600, letterSpacing: '0.04em',
              textTransform: 'uppercase', color: DIM,
              border: `1.5px solid ${DIM3}`,
              borderRadius: 4, padding: '13px 34px', textDecoration: 'none',
            }}>hello@useplumb.ai</a>
          </div>
        </div>
      </section>

      {/* ══ Footer nav ════════════════════════════════════════════════ */}
      <footer style={{ background: '#0e0f14' }}>
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          padding: '48px 48px 40px', borderBottom: `1px solid ${LINE}`,
        }}>
          <div className="reveal-up">
            <div style={{ marginBottom: 18 }}><PlumbLogo size={20} light /></div>
            <p style={{
              fontFamily: 'var(--font-inter), sans-serif',
              fontSize: 'clamp(20px,2.2vw,28px)', fontWeight: 900,
              letterSpacing: '-0.03em', lineHeight: 1.2, color: INK,
              textTransform: 'uppercase', maxWidth: 400,
            }}>
              For Forward-Deployed<br />Engineering Teams.
            </p>
          </div>
          <div className="reveal-up stagger-2" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { l: 'X',  href: 'https://x.com/useplumb' },
                { l: 'in', href: 'https://linkedin.com/company/useplumb' },
                { l: '✉',  href: 'mailto:hello@useplumb.ai' },
              ].map(s => (
                <a key={s.l} href={s.href}
                  target={s.href.startsWith('http') ? '_blank' : undefined}
                  rel="noopener noreferrer"
                  style={{
                    width: 32, height: 32, borderRadius: 6, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    border: `1px solid rgba(255,255,255,0.12)`,
                    color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 700,
                    textDecoration: 'none', fontFamily: 'var(--font-jetbrains),monospace',
                  }}>{s.l}</a>
              ))}
            </div>
            <Link href="/login" style={{
              fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
              color: BG, background: INK, borderRadius: 4,
              padding: '9px 20px', textDecoration: 'none',
            }}>Get access →</Link>
          </div>
        </div>

        {/* Nav columns */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)' }}>
          {[
            { l: 'Plumb', links: [['Feed','#plumb'],['Mind','#plumb'],['Pipeline','#plumb'],['Build','#problem'],['Score','#problem'],['Changelog','mailto:hello@useplumb.ai']] },
            { l: 'FDE Teams', links: [['What is FDE?','#problem'],['Use cases','#compare'],['Integrations','#plumb'],['Pipeline setup','#plumb'],['Early access','/login']] },
            { l: 'Resources', links: [['Documentation','mailto:hello@useplumb.ai'],['Blog','mailto:hello@useplumb.ai'],['Status','mailto:hello@useplumb.ai'],['SOC 2','mailto:hello@useplumb.ai'],['Support','mailto:hello@useplumb.ai']] },
            { l: 'Company', links: [['About','mailto:hello@useplumb.ai'],['Careers','mailto:hello@useplumb.ai'],['Privacy','/privacy'],['Terms','mailto:hello@useplumb.ai'],['Twitter','https://x.com/useplumb'],['LinkedIn','https://linkedin.com/company/useplumb']] },
          ].map((col, ci) => (
            <div key={col.l} className={`reveal-up stagger-${ci + 1}`}
              style={{ padding: '36px 48px 44px', borderRight: ci < 3 ? `1px solid ${LINE}` : 'none' }}>
              <p style={{ ...MONO, color: BLUE, marginBottom: 18 }}>{col.l}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {col.links.map(([label, href]) => (
                  <a key={label} href={href}
                    target={href.startsWith('http') ? '_blank' : undefined}
                    rel="noopener noreferrer"
                    className="loco-link"
                    style={{ fontSize: 13.5, letterSpacing: '-0.01em', display: 'block' }}
                  >{label}</a>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div style={{ borderTop: `1px solid ${LINE}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 48px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <PlumbLogo size={13} light />
            <span style={{ ...MONO, color: 'rgba(255,255,255,0.26)' }}>© 2026 PLUMB, INC.</span>
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            {[['Privacy','/privacy'],['Terms','mailto:hello@useplumb.ai'],['useplumb.ai','https://useplumb.ai']].map(([l,h]) => (
              <a key={l} href={h} style={{ ...MONO, color: 'rgba(255,255,255,0.26)', textDecoration: 'none' }}>{l}</a>
            ))}
          </div>
        </div>
      </footer>

      {/* ══ Infinite PLUMB — scroll-driven velocity field ══════════════ */}
      <div style={{ background: BG, overflow: 'hidden', paddingBottom: 8, cursor: 'default', userSelect: 'none', position: 'relative' }}>
        {/* Gradient fade from footer into PLUMB field */}
        <div aria-hidden style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 64, zIndex: 2,
          background: 'linear-gradient(to bottom, #0e0f14 0%, transparent 100%)',
          pointerEvents: 'none',
        }} />
        {[
          { size: 'clamp(72px,13vw,176px)', op: 0.12, dur: '7' },
          { size: 'clamp(80px,14.5vw,196px)', op: 0.22, dur: '9' },
          { size: 'clamp(88px,15.5vw,210px)', op: 0.40, dur: '11' },
          { size: 'clamp(96px,16.5vw,224px)', op: 0.52, dur: '13' },
          { size: 'clamp(80px,14vw,190px)', op: 0.28, dur: '10' },
          { size: 'clamp(68px,12vw,164px)', op: 0.14, dur: '8' },
        ].map((row, i) => {
          const isRev = i % 2 !== 0
          const items = Array.from({ length: 10 }, (_, j) => (
            <span key={j} style={{ paddingRight: '0.35em' }}>PLUMB</span>
          ))
          return (
            <div key={i} style={{ overflow: 'hidden', lineHeight: 0.86, marginBottom: -6 }}>
              <div
                className="plumb-inf-row"
                data-x="0"
                style={{
                  direction: isRev ? 'rtl' : 'ltr',
                  fontSize: row.size,
                  fontWeight: 900,
                  letterSpacing: '-0.04em',
                  color: BLUE,
                  opacity: row.op,
                  fontFamily: 'var(--font-inter), system-ui, sans-serif',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                {items}{items}
              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}
