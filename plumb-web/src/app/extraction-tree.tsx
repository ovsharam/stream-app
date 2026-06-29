'use client'

import { useEffect, useRef } from 'react'

const TEAL = '#1db584'

const AE_ITEMS = [
  { y: 180, label: '"CRM contact lookup"',     sub: 'field, no scope captured' },
  { y: 268, label: '"Near realtime"',           sub: 'latency never defined' },
  { y: 356, label: '…',                         sub: 'rest dropped at handoff' },
]

const PLUMB_ITEMS = [
  { y: 148, label: 'OAuth scope missing',           sub: 'action: block build',        strong: false },
  { y: 208, label: '"Near realtime" = 2s vs 200ms', sub: 'two different architectures', strong: false },
  { y: 268, label: 'Native lookup vs webhook',      sub: 'scope fork before repo open', strong: false },
  { y: 328, label: 'Prod keys flagged',             sub: 'operator approval required',  strong: false },
  { y: 388, label: 'Scope fork → build prompt',     sub: 'dispatched to Claude Code',   strong: true  },
]

export function ExtractionTree() {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          svg.classList.add('tree-in')
          obs.disconnect()
        }
      },
      { threshold: 0.1 }
    )
    obs.observe(svg)
    return () => obs.disconnect()
  }, [])

  const cx    = 470   // center x (root/trunk)
  const aeX   = 228   // left spine x
  const pX    = 712   // right spine x
  const topY  = 34    // root node y
  const splitY = 100  // horizontal split y
  const botY  = 415   // spine bottom y

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 940 440"
      style={{ width: '100%', overflow: 'visible' }}
      fill="none"
    >
      {/* ── Column headers ─────────────────────────────────────────── */}
      <text x={aeX} y={splitY - 18} textAnchor="middle"
        fontSize="9" fill="#bbb" fontWeight="600" letterSpacing="0.12em"
        fontFamily="system-ui, sans-serif">AE CAPTURES</text>
      <text x={pX} y={splitY - 18} textAnchor="middle"
        fontSize="9" fill={TEAL} fontWeight="600" letterSpacing="0.12em"
        fontFamily="system-ui, sans-serif">PLUMB SURFACES</text>

      {/* ── Root dot ───────────────────────────────────────────────── */}
      <circle cx={cx} cy={topY} r={7} fill="#0c0c0c"
        className="tree-dot tn0" />
      <text x={cx} y={topY - 16} textAnchor="middle"
        fontSize="10.5" fill="#888" fontFamily="system-ui, sans-serif"
        letterSpacing="0.01em">The call</text>

      {/* ── Trunk ──────────────────────────────────────────────────── */}
      <path className="tree-line tl0" pathLength="1"
        d={`M ${cx} ${topY + 7} L ${cx} ${splitY}`}
        stroke="#aaa" strokeWidth="1.5" />

      {/* ── Horizontal split ───────────────────────────────────────── */}
      <path className="tree-line tl1" pathLength="1"
        d={`M ${aeX} ${splitY} L ${pX} ${splitY}`}
        stroke="#ccc" strokeWidth="1" />

      {/* ── AE spine ───────────────────────────────────────────────── */}
      <path className="tree-line tl2a" pathLength="1"
        d={`M ${aeX} ${splitY} L ${aeX} ${botY}`}
        stroke="#e0e0e0" strokeWidth="1" />

      {/* ── Plumb spine ────────────────────────────────────────────── */}
      <path className="tree-line tl2b" pathLength="1"
        d={`M ${pX} ${splitY} L ${pX} ${botY}`}
        stroke={TEAL} strokeWidth="1.5" strokeOpacity="0.7" />

      {/* ── AE items ───────────────────────────────────────────────── */}
      {AE_ITEMS.map((item, i) => (
        <g key={i}>
          <path className={`tree-line tl${i + 3}`} pathLength="1"
            d={`M ${aeX} ${item.y} L ${aeX - 30} ${item.y}`}
            stroke="#ddd" strokeWidth="1" />
          <circle cx={aeX - 35} cy={item.y} r={3.5}
            fill="#ccc" className={`tree-dot tn${i + 1}`} />
          <text x={aeX - 44} y={item.y - 5} textAnchor="end"
            fontSize="11.5" fill="#aaa" fontStyle="italic"
            fontFamily="system-ui, sans-serif">{item.label}</text>
          <text x={aeX - 44} y={item.y + 12} textAnchor="end"
            fontSize="9.5" fill="#ccc"
            fontFamily="'JetBrains Mono', monospace">{item.sub}</text>
        </g>
      ))}

      {/* ── Plumb items ────────────────────────────────────────────── */}
      {PLUMB_ITEMS.map((item, i) => (
        <g key={i}>
          <path className={`tree-line tl${i + 6}`} pathLength="1"
            d={`M ${pX} ${item.y} L ${pX + 30} ${item.y}`}
            stroke={TEAL} strokeWidth="1" strokeOpacity="0.6" />
          <circle cx={pX + 35} cy={item.y} r={3.5}
            fill={TEAL} className={`tree-dot tn${i + 4}`} />
          <text x={pX + 44} y={item.y - 5} textAnchor="start"
            fontSize="11.5"
            fill={item.strong ? '#0c0c0c' : '#555'}
            fontWeight={item.strong ? '600' : '400'}
            fontFamily="system-ui, sans-serif">{item.label}</text>
          <text x={pX + 44} y={item.y + 12} textAnchor="start"
            fontSize="9.5"
            fill={item.strong ? TEAL : '#999'}
            fontFamily="'JetBrains Mono', monospace">{item.sub}</text>
        </g>
      ))}

      {/* ── Center divider ─────────────────────────────────────────── */}
      <line
        x1={cx} y1={splitY + 24} x2={cx} y2={botY}
        stroke="#f0f0f0" strokeWidth="1" strokeDasharray="3 5" />
    </svg>
  )
}
