'use client'

import { useEffect, useRef } from 'react'

const BLUE = '#202ded'

const AE_ITEMS = [
  { y: 212, label: '"CRM contact lookup"', sub: 'field, no scope captured'  },
  { y: 342, label: '"Near realtime"',       sub: 'latency never defined'    },
  { y: 472, label: '…',                     sub: 'rest dropped at handoff'  },
]

const PLUMB_ITEMS = [
  { y: 183, label: 'OAuth scope missing',           sub: 'action: block build',         strong: false },
  { y: 264, label: '"Near realtime" = 2s vs 200ms', sub: 'two different architectures',  strong: false },
  { y: 345, label: 'Native lookup vs webhook',      sub: 'scope fork before repo open',  strong: false },
  { y: 426, label: 'Prod keys flagged',             sub: 'operator approval required',   strong: false },
  { y: 507, label: 'Scope fork → build prompt',     sub: 'dispatched to Claude Code',    strong: true  },
]

// Layout constants
const CX     = 550   // trunk center
const AEX    = 232   // AE spine
const PX     = 868   // Plumb spine
const TOP_Y  = 46    // root gauge
const SPLIT_Y = 122  // T-junction
const BOT_Y  = 528   // spine bottom
const BRANCH = 42    // branch horizontal length

export function ExtractionTree() {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { svg.classList.add('tree-in'); obs.disconnect() } },
      { threshold: 0.08 }
    )
    obs.observe(svg)
    return () => obs.disconnect()
  }, [])

  // Gauge tick marks (6 evenly spaced)
  const ticks = [0, 60, 120, 180, 240, 300].map(deg => {
    const r = (deg - 90) * Math.PI / 180
    return { x1: CX + 10 * Math.cos(r), y1: TOP_Y + 10 * Math.sin(r), x2: CX + 14 * Math.cos(r), y2: TOP_Y + 14 * Math.sin(r) }
  })

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 1100 558"
      overflow="visible"
      style={{ width: '100%', maxWidth: '100%', display: 'block' }}
      fill="none"
    >
      <defs>
        {/* Blue pipe glow */}
        <filter id="pipe-glow" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="shadow"/>
          <feFlood floodColor={BLUE} floodOpacity="0.55" result="col"/>
          <feComposite in="col" in2="shadow" operator="in" result="glow"/>
          <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        {/* Strong branch extra glow */}
        <filter id="strong-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="shadow"/>
          <feFlood floodColor={BLUE} floodOpacity="0.8" result="col"/>
          <feComposite in="col" in2="shadow" operator="in" result="glow"/>
          <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* ── Column headers ────────────────────────────────────────── */}
      <text x={AEX} y={SPLIT_Y - 22} textAnchor="middle"
        className="tree-col-ae"
        fontSize="10" fontWeight="700" letterSpacing="0.1em"
        fontFamily="'JetBrains Mono', monospace">AE CAPTURES</text>
      <text x={PX} y={SPLIT_Y - 22} textAnchor="middle"
        className="tree-col-plumb"
        fontSize="10" fontWeight="700" letterSpacing="0.1em"
        fontFamily="'JetBrains Mono', monospace">PLUMB SURFACES</text>

      {/* ── Root: pressure gauge fitting ──────────────────────────── */}
      {/* Outer ring */}
      <circle cx={CX} cy={TOP_Y} r={16}
        className="tree-dot tn0 tree-gauge"
        strokeWidth="2.5"/>
      {/* Tick marks */}
      {ticks.map((t, i) => (
        <line key={i}
          x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
          className="tree-dot tn0 tree-tick"
          strokeWidth="1.5" strokeLinecap="round"/>
      ))}
      {/* Inner dot */}
      <circle cx={CX} cy={TOP_Y} r={5.5}
        className="tree-dot tn0 tree-gauge-inner"/>
      {/* "The call" label */}
      <text x={CX} y={TOP_Y - 26} textAnchor="middle"
        className="tree-dot tn0 tree-call-label"
        fontSize="12" letterSpacing="0.03em"
        fontFamily="system-ui, sans-serif">The call</text>

      {/* ── Trunk pipe ────────────────────────────────────────────── */}
      <path className="tree-line tl0 tree-pipe-trunk"
        pathLength="1"
        d={`M ${CX} ${TOP_Y + 16} L ${CX} ${SPLIT_Y - 9}`}
        strokeWidth="3.5" strokeLinecap="round"/>

      {/* ── T-junction fitting ────────────────────────────────────── */}
      <rect x={CX - 8} y={SPLIT_Y - 9} width={16} height={18}
        className="tree-dot tn0 tree-fitting"
        rx="3"/>

      {/* ── Horizontal cross pipe ─────────────────────────────────── */}
      <path className="tree-line tl1 tree-pipe-cross"
        pathLength="1"
        d={`M ${AEX + 10} ${SPLIT_Y} L ${PX - 10} ${SPLIT_Y}`}
        strokeWidth="2.5" strokeLinecap="round"/>

      {/* Left elbow fitting */}
      <circle cx={AEX + 8} cy={SPLIT_Y} r={8}
        className="tree-dot tn0 tree-fitting"/>
      {/* Right elbow fitting — blue */}
      <circle cx={PX - 8} cy={SPLIT_Y} r={8}
        className="tree-dot tn0 tree-fitting-plumb"/>

      {/* ── AE spine (dashed / muted) ─────────────────────────────── */}
      <path className="tree-line tl2a tree-pipe-ae"
        pathLength="1"
        d={`M ${AEX} ${SPLIT_Y} L ${AEX} ${BOT_Y}`}
        strokeWidth="2.5" strokeLinecap="round"/>

      {/* ── Plumb spine (solid blue + glow) ──────────────────────── */}
      <path className="tree-line tl2b tree-pipe-plumb"
        pathLength="1"
        d={`M ${PX} ${SPLIT_Y} L ${PX} ${BOT_Y}`}
        strokeWidth="2.5" strokeLinecap="round"
        filter="url(#pipe-glow)"/>

      {/* ── AE branches ──────────────────────────────────────────── */}
      {AE_ITEMS.map((item, i) => {
        const capX = AEX - BRANCH
        return (
          <g key={i}>
            {/* T-tap on spine */}
            <circle cx={AEX} cy={item.y} r={5}
              className={`tree-dot tn${i + 1} tree-fitting-sm`}/>
            {/* Branch pipe */}
            <path className={`tree-line tl${i + 3} tree-pipe-ae`}
              pathLength="1"
              d={`M ${AEX} ${item.y} L ${capX} ${item.y}`}
              strokeWidth="2" strokeLinecap="round"/>
            {/* Pipe cap (perpendicular bar) */}
            <rect x={capX - 4} y={item.y - 9} width={4} height={18}
              className={`tree-dot tn${i + 1} tree-cap-ae`}
              rx="1.5"/>
            {/* Labels */}
            <text x={capX - 12} y={item.y - 7} textAnchor="end"
              className="tree-ae-label"
              fontSize="15" fontStyle="italic"
              fontFamily="system-ui, sans-serif">{item.label}</text>
            <text x={capX - 12} y={item.y + 14} textAnchor="end"
              className="tree-ae-sub"
              fontSize="12"
              fontFamily="'JetBrains Mono', monospace">{item.sub}</text>
          </g>
        )
      })}

      {/* ── Plumb branches ───────────────────────────────────────── */}
      {PLUMB_ITEMS.map((item, i) => {
        const connX = PX + BRANCH
        return (
          <g key={i}>
            {/* T-tap on spine */}
            <circle cx={PX} cy={item.y} r={5}
              className={`tree-dot tn${i + 4} tree-fitting-plumb-sm`}/>
            {/* Branch pipe */}
            <path className={`tree-line tl${i + 6} tree-pipe-plumb`}
              pathLength="1"
              d={`M ${PX} ${item.y} L ${connX} ${item.y}`}
              strokeWidth="2" strokeLinecap="round"
              filter={item.strong ? 'url(#strong-glow)' : 'url(#pipe-glow)'}/>
            {/* Diamond connector */}
            <polygon
              points={`${connX + 7},${item.y - 7} ${connX + 15},${item.y} ${connX + 7},${item.y + 7} ${connX - 1},${item.y}`}
              className={`tree-dot tn${i + 4} ${item.strong ? 'tree-diamond-strong' : 'tree-diamond'}`}/>
            {/* Labels */}
            <text x={connX + 23} y={item.y - 6} textAnchor="start"
              className={item.strong ? 'tree-plumb-strong-label' : 'tree-plumb-label'}
              fontSize="15"
              fontWeight={item.strong ? '700' : '400'}
              fontFamily="system-ui, sans-serif">{item.label}</text>
            <text x={connX + 23} y={item.y + 14} textAnchor="start"
              className={item.strong ? 'tree-plumb-strong-sub' : 'tree-plumb-sub'}
              fontSize="12"
              fontFamily="'JetBrains Mono', monospace">{item.sub}</text>
          </g>
        )
      })}

      {/* ── Center divider (dashed pipe) ─────────────────────────── */}
      <line
        x1={CX} y1={SPLIT_Y + 20} x2={CX} y2={BOT_Y}
        className="tree-divider-pipe"
        strokeWidth="1" strokeDasharray="4 8"/>

      {/* ── Pipe pressure label (decorative) ─────────────────────── */}
      <text x={CX + 12} y={SPLIT_Y + 46} textAnchor="start"
        className="tree-pipe-label"
        fontSize="8.5" letterSpacing="0.08em"
        fontFamily="'JetBrains Mono', monospace"
        style={{ opacity: 0.35 }}>PSI</text>
      <text x={CX + 12} y={SPLIT_Y + 58} textAnchor="start"
        className="tree-pipe-label"
        fontSize="10" letterSpacing="0.04em"
        fontFamily="'JetBrains Mono', monospace"
        fontWeight="700"
        style={{ opacity: 0.35 }}>100%</text>

      {/* ── Pipe segment labels (decorative notch marks) ──────────── */}
      {[160, 290, 410].map((y, i) => (
        <g key={i}>
          <line x1={AEX - 6} y1={y} x2={AEX + 6} y2={y}
            className="tree-pipe-notch"
            strokeWidth="1" style={{ opacity: 0.3 }}/>
          <line x1={PX - 6} y1={y} x2={PX + 6} y2={y}
            className="tree-pipe-notch"
            strokeWidth="1" style={{ opacity: 0.3 }}/>
        </g>
      ))}
    </svg>
  )
}
