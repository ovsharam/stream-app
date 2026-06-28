'use client'

/* ── Pipe tile (480×280) — tiles seamlessly left-right and top-bottom ── */
function PipeTile() {
  const C  = '#d4d4d4'  // pipe body
  const CJ = '#c0c0c0'  // joint slightly darker
  const PW = 14         // pipe stroke-width
  const JR = 10         // joint circle radius
  const HL = 'rgba(255,255,255,0.65)' // inner highlight

  const pipes = [
    // horizontal at y=80 (main, full width)
    { x1:   0, y1:  80, x2: 480, y2:  80, w: PW },
    // horizontal at y=200 (secondary, full width)
    { x1:   0, y1: 200, x2: 480, y2: 200, w: PW * 0.8 },
    // vertical at x=120 (full height)
    { x1: 120, y1:   0, x2: 120, y2: 280, w: PW * 0.8 },
    // vertical at x=360 (full height)
    { x1: 360, y1:   0, x2: 360, y2: 280, w: PW },
  ]

  const joints = [
    [120,  80],
    [360,  80],
    [120, 200],
    [360, 200],
  ]

  return (
    <svg
      viewBox="0 0 480 280"
      width={480}
      height={280}
      aria-hidden
      style={{ display: 'block', flexShrink: 0 }}
    >
      {/* Pipe bodies */}
      {pipes.map((p, i) => (
        <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2}
          stroke={C} strokeWidth={p.w} strokeLinecap="round" />
      ))}
      {/* Inner highlight lines (makes them look cylindrical) */}
      {pipes.map((p, i) => (
        <line key={`h${i}`} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2}
          stroke={HL} strokeWidth={p.w * 0.28} strokeLinecap="round" />
      ))}
      {/* Joints */}
      {joints.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r={JR + 2} fill={CJ} />
          <circle cx={x} cy={y - 2} r={JR * 0.55} fill="rgba(255,255,255,0.45)" />
        </g>
      ))}
      {/* End-cap circles where pipes meet the tile edge */}
      {[[0,80],[480,80],[0,200],[480,200],[120,0],[120,280],[360,0],[360,280]].map(([x,y]) => (
        <circle key={`e${x}-${y}`} cx={x} cy={y} r={JR - 1} fill={C} />
      ))}
    </svg>
  )
}

export function PipeFooter() {
  const COLS = 5   // tiles horizontally (5 × 480 = 2400px wide, animation shifts by 480)
  const ROWS = 3   // tiles vertically  (3 × 280 = 840px)

  return (
    <div style={{ background: '#fff', overflow: 'hidden', position: 'relative' }}>
      {/* ── Pipe canvas ─────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
        }}
      >
        {/* Horizontal drift animation — shift left by 1 tile (480px) */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            animation: 'pipe-drift-x 28s linear infinite',
            willChange: 'transform',
          }}
        >
          {Array.from({ length: ROWS }, (_, r) => (
            <div key={r} style={{ display: 'flex' }}>
              {Array.from({ length: COLS }, (_, c) => (
                <PipeTile key={c} />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── White fade at very top (hides pipes above the text) ─────── */}
      <div
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: 160,
          background: 'linear-gradient(to bottom, #fff 50%, transparent)',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />

      {/* ── PLUMB gradient text ──────────────────────────────────────── */}
      <div
        style={{
          position: 'relative',
          zIndex: 3,
          textAlign: 'center',
          padding: '64px 24px 0',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        <div
          style={{
            display: 'inline-block',
            fontSize: 'clamp(120px, 18vw, 280px)',
            fontWeight: 900,
            letterSpacing: '-0.045em',
            lineHeight: 0.82,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif',
            background: 'linear-gradient(to bottom, #1db584 0%, #0c0c0c 38%, rgba(12,12,12,0.18) 72%, transparent 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          PLUMB
        </div>
      </div>

      {/* ── Spacer so pipes show below the text ─────────────────────── */}
      <div style={{ height: 340, position: 'relative', zIndex: 1 }} />
    </div>
  )
}
