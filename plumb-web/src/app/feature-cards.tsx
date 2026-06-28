// Reformcollective-style three feature cards + "Built different" ticker.
// Pure server component — no client JS needed.

import type React from 'react'

const BG   = 'var(--lp-bg)'
const INK  = 'var(--lp-ink)'
const DIM  = 'var(--lp-dim)'
const LINE = 'var(--lp-line)'
const BLUE = '#202ded'
const MID  = '#898fe9'

// ── Decorative geometric SVGs ────────────────────────────────────────────────

// Card 1 — Orbital pipe gauge (adapted from reformcollective's astronomical card)
// Thin blue lines: concentric elliptical orbits + crosshair + center gauge node.
function OrbitalGaugeSVG() {
  const c  = 'rgba(32,45,237,0.38)'
  const cs = '#202ded'
  const [cx, cy] = [191, 190] as const

  const ticks = Array.from({ length: 24 }, (_, i) => {
    const a = (i * 15 - 90) * Math.PI / 180
    return { x1: cx + 152 * Math.cos(a), y1: cy + 152 * Math.sin(a), x2: cx + 168 * Math.cos(a), y2: cy + 168 * Math.sin(a) }
  })

  return (
    <svg viewBox="0 0 383 381" fill="none" style={{ width: '100%', maxWidth: 280, display: 'block' }}>
      {/* Boundary circles */}
      <circle cx={cx} cy={cy} r="168" stroke={c} strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="158" stroke={c} strokeWidth="0.5" strokeDasharray="2 5" opacity="0.5" />

      {/* Orbital ellipses at different tilt angles */}
      <ellipse cx={cx} cy={cy} rx="168" ry="54" stroke={c} strokeWidth="0.5" />
      <ellipse cx={cx} cy={cy} rx="168" ry="54" stroke={c} strokeWidth="0.5" strokeDasharray="4 4" opacity="0.55" transform={`rotate(30 ${cx} ${cy})`} />
      <ellipse cx={cx} cy={cy} rx="168" ry="54" stroke={c} strokeWidth="0.5" strokeDasharray="4 4" opacity="0.38" transform={`rotate(60 ${cx} ${cy})`} />
      <ellipse cx={cx} cy={cy} rx="168" ry="54" stroke={c} strokeWidth="0.5" strokeDasharray="4 4" opacity="0.25" transform={`rotate(90 ${cx} ${cy})`} />

      {/* Crosshair meridians */}
      <line x1={cx} y1="22" x2={cx} y2="358" stroke={c} strokeWidth="0.5" />
      <line x1="22" y1={cy} x2="358" y2={cy} stroke={c} strokeWidth="0.5" />

      {/* Diagonal longitude lines */}
      <line x1="70" y1="48" x2="312" y2="332" stroke={c} strokeWidth="0.5" opacity="0.32" />
      <line x1="312" y1="48" x2="70" y2="332" stroke={c} strokeWidth="0.5" opacity="0.32" />

      {/* Tick marks on outer ring */}
      {ticks.map((t, i) => (
        <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={c} strokeWidth="0.5" />
      ))}

      {/* Center gauge node */}
      <circle cx={cx} cy={cy} r="22" fill="#14151A" stroke={c} strokeWidth="1" />
      <circle cx={cx} cy={cy} r="8"  fill={cs} />

      {/* Small decorative accent circles */}
      <circle cx="94"  cy="316" r="10" stroke={c} strokeWidth="0.5" />
      <circle cx="94"  cy="316" r="3.5" fill={c} />
      <circle cx="292" cy="64"  r="5"  stroke={c} strokeWidth="0.5" />

      {/* Dashed arc accent (upper-left quadrant) */}
      <path d="M56 100 A140 140 0 0 1 100 56" stroke={c} strokeWidth="1.2" strokeDasharray="5 3" fill="none" strokeLinecap="round" />
    </svg>
  )
}

// Card 2 — Pipeline crystal (adapted from reformcollective's gem/prism card)
// Faceted diamond wireframe with pipe-connector nodes at vertices.
function PipelineCrystalSVG() {
  const c  = 'rgba(137,143,233,0.42)'
  const cs = '#898fe9'

  // Vertices
  const V = {
    T:  [255, 28 ] as const,
    L:  [48,  162] as const,
    R:  [462, 162] as const,
    B:  [255, 294] as const,
    TL: [150,  98 ] as const,
    TR: [360,  98 ] as const,
    BL: [150, 226] as const,
    BR: [360, 226] as const,
    C:  [255, 162] as const,
  }

  const outerPts  = [V.T, V.R, V.B, V.L].map(p => p.join(',')).join(' ')
  const innerPts  = [V.TL, V.TR, V.BR, V.BL].map(p => p.join(',')).join(' ')
  const facetPts  = [V.TL, V.TR, V.R, V.BR, V.BL, V.L].map(p => p.join(',')).join(' ')

  const outerNodes = [V.T, V.L, V.R, V.B]
  const innerNodes = [V.TL, V.TR, V.BL, V.BR]

  return (
    <svg viewBox="0 0 510 322" fill="none" style={{ width: '100%', maxWidth: 280, display: 'block' }}>
      {/* Outer diamond */}
      <polygon points={outerPts}  stroke={c} strokeWidth="0.8" />
      {/* Inner facet hexagon */}
      <polygon points={facetPts}  stroke={c} strokeWidth="0.5" />
      {/* Inner rect */}
      <polygon points={innerPts}  stroke={c} strokeWidth="0.4" opacity="0.6" />

      {/* Central cross */}
      <line x1={V.T[0]}  y1={V.T[1]}  x2={V.B[0]} y2={V.B[1]}   stroke={c} strokeWidth="0.5" />
      <line x1={V.L[0]}  y1={V.L[1]}  x2={V.R[0]} y2={V.R[1]}   stroke={c} strokeWidth="0.5" />
      {/* Diagonal bracing */}
      <line x1={V.TL[0]} y1={V.TL[1]} x2={V.BR[0]} y2={V.BR[1]} stroke={c} strokeWidth="0.4" opacity="0.5" />
      <line x1={V.TR[0]} y1={V.TR[1]} x2={V.BL[0]} y2={V.BL[1]} stroke={c} strokeWidth="0.4" opacity="0.5" />

      {/* Outer vertex nodes */}
      {outerNodes.map(([px, py], i) => (
        <g key={i}>
          <circle cx={px} cy={py} r="7"   fill="#14151A" stroke={c} strokeWidth="0.8" />
          <circle cx={px} cy={py} r="2.5" fill={cs} />
        </g>
      ))}
      {/* Inner vertex nodes */}
      {innerNodes.map(([px, py], i) => (
        <circle key={i} cx={px} cy={py} r="3.5" fill="#14151A" stroke={c} strokeWidth="0.6" />
      ))}

      {/* Center node */}
      <circle cx={V.C[0]} cy={V.C[1]} r="12" fill="#14151A" stroke={c} strokeWidth="0.8" />
      <circle cx={V.C[0]} cy={V.C[1]} r="5"  fill={cs} />
    </svg>
  )
}

// Card 3 — Signal-capture grid (adapted from reformcollective's security card)
// Rounded rectangle + corner circles + hatched diagonal fill + center node.
function SignalGridSVG() {
  const c  = 'rgba(83,149,144,0.42)'
  const cs = '#539590'

  // Hatching lines clipped to inner area
  const hatches: React.ReactElement[] = []
  for (let i = -320; i < 700; i += 18) {
    hatches.push(
      <line key={i} x1={i} y1="0" x2={i + 360} y2="360" stroke={c} strokeWidth="0.4" />
    )
  }

  return (
    <svg viewBox="0 0 348 348" fill="none" style={{ width: '100%', maxWidth: 240, display: 'block' }}>
      <defs>
        <clipPath id="sgc">
          <rect x="16" y="16" width="316" height="316" rx="40" />
        </clipPath>
      </defs>

      {/* Outer rounded rect */}
      <rect x="16" y="16" width="316" height="316" rx="40" stroke={c} strokeWidth="0.8" />

      {/* Large inner circle */}
      <circle cx="174" cy="174" r="130" stroke={c} strokeWidth="0.5" />

      {/* Dashed corner circles */}
      <circle cx="16"  cy="16"  r="30" stroke={c} strokeWidth="0.5" strokeDasharray="3 3" />
      <circle cx="332" cy="16"  r="30" stroke={c} strokeWidth="0.5" strokeDasharray="3 3" />
      <circle cx="16"  cy="332" r="30" stroke={c} strokeWidth="0.5" strokeDasharray="3 3" />
      <circle cx="332" cy="332" r="30" stroke={c} strokeWidth="0.5" strokeDasharray="3 3" />

      {/* Crosshair */}
      <line x1="174" y1="16"  x2="174" y2="332" stroke={c} strokeWidth="0.5" />
      <line x1="16"  y1="174" x2="332" y2="174" stroke={c} strokeWidth="0.5" />

      {/* Diagonal hatching inside rounded rect */}
      <g clipPath="url(#sgc)" opacity="0.45">
        {hatches}
      </g>

      {/* Dashed orbit sweep inside circle */}
      <ellipse cx="174" cy="174" rx="80" ry="48" stroke={c} strokeWidth="0.6" strokeDasharray="5 4" />

      {/* Center node */}
      <circle cx="174" cy="174" r="20" fill="#14151A" stroke={c} strokeWidth="0.8" />
      <circle cx="174" cy="174" r="7"  fill={cs} />
    </svg>
  )
}

// ── Large background decoration SVGs (subtle positional depth) ───────────────

function BgDecorCircle({ style }: { style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 520 520" fill="none" aria-hidden
      style={{ position: 'absolute', pointerEvents: 'none', ...style }}>
      <circle cx="260" cy="260" r="258" stroke="rgba(32,45,237,0.045)" strokeWidth="1" />
      <circle cx="260" cy="260" r="200" stroke="rgba(32,45,237,0.03)"  strokeWidth="0.5" />
    </svg>
  )
}

function BgDecorPill({ style }: { style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 420 120" fill="none" aria-hidden
      style={{ position: 'absolute', pointerEvents: 'none', ...style }}>
      <rect x="1" y="1" width="418" height="118" rx="59" stroke="rgba(32,45,237,0.05)" strokeWidth="1" />
    </svg>
  )
}

// ── Feature card ─────────────────────────────────────────────────────────────

interface CardProps {
  svg: React.ReactNode
  index: string          // "01" | "02" | "03"
  name: string           // "Clears the pipe"
  sub: string            // one-line description
}

function FeatureCard({ svg, index, name, sub }: CardProps) {
  return (
    <div
      className="feat-card"
      style={{
        background: 'rgba(255,255,255,0.026)',
        border: `1px solid ${LINE}`,
        borderRadius: 16,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* SVG illustration area */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 32px 36px',
        borderBottom: `1px solid ${LINE}`,
        minHeight: 280,
        position: 'relative',
      }}>
        {svg}
      </div>

      {/* Footer */}
      <div style={{ padding: '26px 28px 28px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}>
          <h3 style={{
            fontFamily: 'var(--font-inter), system-ui, sans-serif',
            fontSize: 'clamp(17px,1.8vw,21px)',
            fontWeight: 700,
            letterSpacing: '-0.025em',
            color: INK,
          }}>
            {name}
          </h3>
          <span style={{
            fontFamily: 'var(--font-jetbrains), monospace',
            fontSize: 10,
            letterSpacing: '0.06em',
            color: BLUE,
            border: `1px solid rgba(32,45,237,0.35)`,
            borderRadius: 3,
            padding: '3px 7px',
            flexShrink: 0,
            marginLeft: 12,
          }}>
            [{' '}{index}{' '}]
          </span>
        </div>
        <p style={{
          fontFamily: 'var(--font-jetbrains), monospace',
          fontSize: 11,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: DIM,
          lineHeight: 1.6,
        }}>
          {sub}
        </p>
      </div>
    </div>
  )
}

// ── Three-card section ────────────────────────────────────────────────────────

export function FeatureCards() {
  const cards: CardProps[] = [
    {
      index: '01',
      name:  'Clears the pipe',
      sub:   'Surfaces every spec, gap, and constraint while you talk',
      svg:   <OrbitalGaugeSVG />,
    },
    {
      index: '02',
      name:  'Ships the build',
      sub:   'Build prompt in Claude Code before your AE types the first Slack',
      svg:   <PipelineCrystalSVG />,
    },
    {
      index: '03',
      name:  'Locks the signal',
      sub:   '100% of requirements captured — nothing lost at handoff',
      svg:   <SignalGridSVG />,
    },
  ]

  return (
    <section style={{
      padding: 'clamp(72px,10vw,128px) 36px',
      background: BG,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Large background decoration circles */}
      <BgDecorCircle style={{ width: 520, top: -120, right: -80 }} />
      <BgDecorCircle style={{ width: 400, bottom: -80, left: -60 }} />
      <BgDecorPill   style={{ width: 380, top: '40%', left: '18%' }} />

      <div style={{ maxWidth: 1200, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        {/* Section eyebrow */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 48 }}>
          <div style={{ width: 32, height: 1, background: BLUE, opacity: 0.6 }} />
          <p style={{
            fontFamily: 'var(--font-jetbrains), monospace',
            fontSize: 10,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: MID,
          }}>The Plumb pipeline</p>
        </div>

        {/* Three cards */}
        <div className="feat-cards-grid">
          {cards.map(c => (
            <FeatureCard key={c.index} {...c} />
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Built-different ticker ────────────────────────────────────────────────────

// The small orbital separator SVG between ticker text instances.
function PipeSep() {
  return (
    <svg viewBox="0 0 32 32" width="24" height="24" fill="none" aria-hidden
      style={{ flexShrink: 0, marginLeft: 28, marginRight: 28, opacity: 0.55 }}>
      <circle cx="16" cy="16" r="13.5" stroke={MID} strokeWidth="0.8" />
      <circle cx="16" cy="16" r="7"    stroke={MID} strokeWidth="0.5" />
      <circle cx="16" cy="16" r="3"    fill={BLUE} />
    </svg>
  )
}

export function BuiltTicker() {
  const text = (
    <span style={{
      fontFamily: 'var(--font-inter), system-ui, sans-serif',
      fontSize: 'clamp(28px,4vw,48px)',
      fontWeight: 900,
      letterSpacing: '-0.035em',
      color: INK,
      flexShrink: 0,
    }}>
      Plumb is Built Different.
    </span>
  )

  const chunk = (
    <>
      {text}
      <PipeSep />
      {text}
      <PipeSep />
      {text}
      <PipeSep />
      {text}
      <PipeSep />
    </>
  )

  return (
    <div style={{
      borderTop:    `1px solid ${LINE}`,
      borderBottom: `1px solid ${LINE}`,
      overflow: 'hidden',
      padding: '28px 0',
      background: BG,
    }}>
      <div
        className="built-ticker"
        style={{ display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', width: 'max-content' }}
      >
        {chunk}{chunk}
      </div>
    </div>
  )
}
