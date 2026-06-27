'use client'

import { useEffect, useRef } from 'react'

const TEAL = '#1db584'
const TEAL_DIM = 'rgba(29,181,132,0.18)'
const INK = '#0c0c0c'

const CX = 200, CY = 200, RAD = 118

const NODES = {
  intake: { x: CX,         y: CY - RAD, label: 'Intake'  },
  scope:  { x: CX + RAD,  y: CY,       label: 'Scope'   },
  deploy: { x: CX,         y: CY + RAD, label: 'Deploy'  },
  build:  { x: CX - RAD,  y: CY,       label: 'Build'   },
}

type NodeKey = keyof typeof NODES

// Active segments that carry packets
const SEGS: { from: NodeKey | 'center'; to: NodeKey | 'center'; t0: number; t1: number }[] = [
  { from: 'intake', to: 'center', t0: 0.00, t1: 0.18 },
  { from: 'center', to: 'scope',  t0: 0.23, t1: 0.38 },
  { from: 'center', to: 'build',  t0: 0.23, t1: 0.38 },
  { from: 'build',  to: 'deploy', t0: 0.43, t1: 0.60 },
]

const CYCLE = 5200 // ms

function getPos(id: NodeKey | 'center') {
  if (id === 'center') return { x: CX, y: CY }
  return NODES[id]
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

export function HeroAnimation() {
  const packetsRef = useRef<(SVGCircleElement | null)[]>([])
  const glowRef    = useRef<SVGCircleElement | null>(null)
  const centerRef  = useRef<SVGCircleElement | null>(null)

  useEffect(() => {
    let raf: number
    let start: number | null = null

    function tick(ts: number) {
      if (!start) start = ts
      const t = ((ts - start) % CYCLE) / CYCLE

      // animate packets
      packetsRef.current.forEach((el, i) => {
        if (!el) return
        const seg = SEGS[i]
        if (t >= seg.t0 && t <= seg.t1) {
          const p = easeInOut((t - seg.t0) / (seg.t1 - seg.t0))
          const f = getPos(seg.from), to = getPos(seg.to)
          el.setAttribute('cx', String(f.x + (to.x - f.x) * p))
          el.setAttribute('cy', String(f.y + (to.y - f.y) * p))
          el.setAttribute('opacity', '1')
        } else {
          el.setAttribute('opacity', '0')
        }
      })

      // center glow — pulses when scoring (t0.18–0.25)
      if (glowRef.current && centerRef.current) {
        const active = t > 0.18 && t < 0.26
        const pulseT = active ? Math.sin(((t - 0.18) / 0.08) * Math.PI) : 0
        const r = 14 + pulseT * 6
        const glowR = 22 + pulseT * 10
        centerRef.current.setAttribute('r', String(r))
        glowRef.current.setAttribute('r', String(glowR))
        glowRef.current.setAttribute('opacity', String(0.15 + pulseT * 0.4))
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const allNodes = Object.entries(NODES) as [NodeKey, typeof NODES[NodeKey]][]

  return (
    <svg viewBox="0 0 400 400" style={{ width: '100%', maxWidth: 420 }} fill="none" aria-hidden>
      <defs>
        <filter id="packet-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* ── Outer diamond (decorative) ─────────────────────────── */}
      {allNodes.map(([, n], i) => {
        const next = allNodes[(i + 1) % allNodes.length][1]
        return (
          <line key={i}
            x1={n.x} y1={n.y} x2={next.x} y2={next.y}
            stroke="#e4e4e4" strokeWidth="1"
          />
        )
      })}

      {/* ── Active segment lines (dashed teal) ────────────────── */}
      {SEGS.map((s, i) => {
        const f = getPos(s.from), t = getPos(s.to)
        return (
          <line key={i}
            x1={f.x} y1={f.y} x2={t.x} y2={t.y}
            stroke={TEAL_DIM} strokeWidth="1.5"
            strokeDasharray="5 5"
          />
        )
      })}

      {/* ── Node circles ──────────────────────────────────────── */}
      {allNodes.map(([id, n]) => (
        <circle key={id} cx={n.x} cy={n.y} r={6}
          fill="#fff" stroke="#ccc" strokeWidth="1.5"
        />
      ))}

      {/* ── Node labels ───────────────────────────────────────── */}
      {allNodes.map(([id, n]) => {
        const dx = n.x > CX + 5 ? 20 : n.x < CX - 5 ? -20 : 0
        const dy = n.y > CY + 5 ? 22 : n.y < CY - 5 ? -14 : 5
        return (
          <text key={id}
            x={n.x + dx} y={n.y + dy}
            textAnchor={dx > 0 ? 'start' : dx < 0 ? 'end' : 'middle'}
            fontSize="11.5" fill="#999" fontFamily="system-ui, sans-serif"
          >{n.label}</text>
        )
      })}

      {/* ── Center glow ring ─────────────────────────────────── */}
      <circle ref={glowRef} cx={CX} cy={CY} r={22}
        fill="none" stroke={TEAL} strokeWidth="1.5"
        opacity="0.15"
      />

      {/* ── Center operator node ─────────────────────────────── */}
      <circle ref={centerRef} cx={CX} cy={CY} r={14} fill={INK} />

      {/* ── Center label ─────────────────────────────────────── */}
      <text x={CX} y={CY + 32}
        textAnchor="middle" fontSize="11" fill="#777"
        fontFamily="system-ui, sans-serif" fontWeight="600"
      >Operator</text>

      {/* ── Animated packets ─────────────────────────────────── */}
      {SEGS.map((s, i) => {
        const f = getPos(s.from)
        return (
          <circle
            key={i}
            ref={el => { packetsRef.current[i] = el }}
            cx={f.x} cy={f.y} r={4.5}
            fill={TEAL} opacity={0}
            filter="url(#packet-glow)"
          />
        )
      })}
    </svg>
  )
}
