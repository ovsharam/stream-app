import React from 'react'

const TEAL = '#1db584'

const NODES = [
  // 0-3: hub nodes (primary concepts)
  { x: 72,  y: 92,  label: 'capability',   hub: true  },
  { x: 198, y: 78,  label: 'constraint',   hub: true  },
  { x: 55,  y: 235, label: 'integration',  hub: true  },
  { x: 185, y: 268, label: 'limitation',   hub: true  },
  // 4-13: leaf nodes
  { x: 135, y: 20,  label: 'OAuth scope',  hub: false },
  { x: 252, y: 30,  label: 'rate limit',   hub: false },
  { x: 14,  y: 150, label: 'webhooks',     hub: false },
  { x: 140, y: 165, label: 'SSO',          hub: false },
  { x: 255, y: 172, label: 'sandbox',      hub: false },
  { x: 22,  y: 335, label: 'streaming',    hub: false },
  { x: 115, y: 358, label: 'bulk API',     hub: false },
  { x: 248, y: 340, label: 'latency',      hub: false },
  { x: 72,  y: 425, label: 'workaround',   hub: false },
  { x: 198, y: 415, label: 'auth pattern', hub: false },
]

// anchor, dx, dy for label placement
const LP = [
  { a: 'start' as const, dx: 10,  dy: -8 },
  { a: 'end'   as const, dx: -10, dy: -8 },
  { a: 'start' as const, dx: 10,  dy: -8 },
  { a: 'end'   as const, dx: -10, dy: -8 },
  { a: 'middle'as const, dx: 0,   dy: -7 },
  { a: 'end'   as const, dx: -7,  dy: 4  },
  { a: 'start' as const, dx: 7,   dy: 4  },
  { a: 'start' as const, dx: 7,   dy: 4  },
  { a: 'end'   as const, dx: -7,  dy: 4  },
  { a: 'start' as const, dx: 7,   dy: 4  },
  { a: 'start' as const, dx: 7,   dy: 4  },
  { a: 'end'   as const, dx: -7,  dy: 4  },
  { a: 'start' as const, dx: 7,   dy: 4  },
  { a: 'end'   as const, dx: -7,  dy: 4  },
]

const EDGES: Array<[number, number, 'hh' | 'hl' | 'll']> = [
  [0, 1, 'hh'], [0, 2, 'hh'], [1, 3, 'hh'], [2, 3, 'hh'], [0, 3, 'hh'],
  [0, 4, 'hl'], [0, 6, 'hl'], [0, 7, 'hl'],
  [1, 5, 'hl'], [1, 7, 'hl'], [1, 8, 'hl'],
  [2, 6, 'hl'], [2, 9, 'hl'],
  [3, 7, 'hl'], [3, 10, 'hl'], [3, 11, 'hl'], [3, 12, 'hl'], [3, 13, 'hl'],
  [4, 5, 'll'], [9, 10, 'll'], [11, 13, 'll'], [12, 13, 'll'],
]

export const GRAPH_VIZ_CSS = `
  @keyframes pg-pulse {
    0%, 100% { fill-opacity: 0.05; }
    50%       { fill-opacity: 0.16; }
  }
  .pg-p1 { animation: pg-pulse 4.5s ease-in-out infinite 0s; }
  .pg-p2 { animation: pg-pulse 4.5s ease-in-out infinite 1.1s; }
  .pg-p3 { animation: pg-pulse 4.5s ease-in-out infinite 2.2s; }
  .pg-p4 { animation: pg-pulse 4.5s ease-in-out infinite 3.3s; }
`

export function ProductGraphViz() {
  return (
    <svg
      viewBox="0 0 275 450"
      width="100%"
      style={{ display: 'block', overflow: 'visible' }}
      aria-hidden
    >
      <defs>
        <radialGradient id="pg-amb" cx="38%" cy="28%" r="62%">
          <stop offset="0%"   stopColor={TEAL} stopOpacity="0.11" />
          <stop offset="100%" stopColor={TEAL} stopOpacity="0"    />
        </radialGradient>
        <filter id="pg-gh" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="5.5" result="b" />
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="pg-gl" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="2.5" result="b" />
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* Ambient teal glow */}
      <rect x="0" y="0" width="275" height="450" fill="url(#pg-amb)" />

      {/* Edges */}
      {EDGES.map(([a, b, t], i) => (
        <line key={i}
          x1={NODES[a].x} y1={NODES[a].y}
          x2={NODES[b].x} y2={NODES[b].y}
          stroke={t === 'll' ? '#ffffff' : TEAL}
          strokeOpacity={t === 'hh' ? 0.28 : t === 'hl' ? 0.13 : 0.07}
          strokeWidth={t === 'hh' ? 0.9 : 0.5}
        />
      ))}

      {/* Leaf nodes */}
      {NODES.map((n, i) => n.hub ? null : (
        <g key={i} filter="url(#pg-gl)">
          <circle cx={n.x} cy={n.y} r={3} fill="rgba(255,255,255,0.45)" />
          <text x={n.x + LP[i].dx} y={n.y + LP[i].dy}
            textAnchor={LP[i].a} fontSize="7"
            fill="rgba(255,255,255,0.22)"
            style={{ fontFamily: 'var(--font-jetbrains), monospace' }}
          >{n.label}</text>
        </g>
      ))}

      {/* Hub nodes — on top */}
      {NODES.map((n, i) => !n.hub ? null : (
        <g key={i}>
          <circle cx={n.x} cy={n.y} r={20} fill={TEAL} fillOpacity={0.05}
            className={`pg-p${i + 1}`} />
          <circle cx={n.x} cy={n.y} r={11} fill={TEAL} fillOpacity={0.15}
            filter="url(#pg-gh)" />
          <circle cx={n.x} cy={n.y} r={5.5} fill={TEAL} filter="url(#pg-gh)" />
          <circle cx={n.x - 1.5} cy={n.y - 1.5} r={1.5} fill="rgba(255,255,255,0.6)" />
          <text x={n.x + LP[i].dx} y={n.y + LP[i].dy}
            textAnchor={LP[i].a} fontSize="7.5"
            fill="rgba(255,255,255,0.38)"
            style={{ fontFamily: 'var(--font-jetbrains), monospace', letterSpacing: '0.04em' }}
          >{n.label}</text>
        </g>
      ))}
    </svg>
  )
}
