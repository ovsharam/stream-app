import React from 'react'

// Small cartoonish product graph — 6 colorful nodes, thick edges, playful.
const NODES = [
  { x: 100, y: 60,  r: 18, fill: '#4ade80', label: 'capability' },
  { x: 192, y: 44,  r: 13, fill: '#f472b6', label: 'constraint' },
  { x: 210, y: 118, r: 15, fill: '#fb923c', label: 'limitation' },
  { x: 148, y: 160, r: 11, fill: '#a78bfa', label: 'workaround' },
  { x: 52,  y: 138, r: 13, fill: '#38bdf8', label: 'integration' },
  { x: 80,  y: 205, r: 10, fill: '#fbbf24', label: 'pattern' },
]

const EDGES: [number, number][] = [
  [0, 1], [0, 2], [0, 4],
  [1, 2], [2, 3], [3, 4],
  [3, 5], [4, 5],
]

export const GRAPH_VIZ_CSS = `
  @keyframes pg-bob {
    0%,100% { transform: translateY(0px); }
    50%      { transform: translateY(-4px); }
  }
  .pg-n0 { animation: pg-bob 3.8s ease-in-out infinite 0s; }
  .pg-n1 { animation: pg-bob 3.8s ease-in-out infinite 0.6s; }
  .pg-n2 { animation: pg-bob 3.8s ease-in-out infinite 1.2s; }
  .pg-n3 { animation: pg-bob 3.8s ease-in-out infinite 1.8s; }
  .pg-n4 { animation: pg-bob 3.8s ease-in-out infinite 2.4s; }
  .pg-n5 { animation: pg-bob 3.8s ease-in-out infinite 3.0s; }
`

export function ProductGraphViz() {
  return (
    <svg
      viewBox="0 0 260 225"
      width="220"
      style={{ display: 'block' }}
      aria-hidden
    >
      {/* Edges */}
      {EDGES.map(([a, b], i) => (
        <line key={i}
          x1={NODES[a].x} y1={NODES[a].y}
          x2={NODES[b].x} y2={NODES[b].y}
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ))}

      {/* Nodes */}
      {NODES.map((n, i) => (
        <g key={i} className={`pg-n${i}`}>
          {/* Drop shadow ring */}
          <circle cx={n.x} cy={n.y + 3} r={n.r} fill="rgba(0,0,0,0.18)" />
          {/* Main circle */}
          <circle cx={n.x} cy={n.y} r={n.r} fill={n.fill} />
          {/* Specular highlight */}
          <circle cx={n.x - n.r * 0.28} cy={n.y - n.r * 0.28} r={n.r * 0.28}
            fill="rgba(255,255,255,0.45)" />
        </g>
      ))}

      {/* Labels */}
      {NODES.map((n, i) => (
        <text key={i}
          x={n.x}
          y={n.y + n.r + 11}
          textAnchor="middle"
          fontSize="8.5"
          fill="rgba(255,255,255,0.35)"
          style={{ fontFamily: 'var(--font-jetbrains), monospace' }}
        >{n.label}</text>
      ))}
    </svg>
  )
}
