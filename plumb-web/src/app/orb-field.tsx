'use client'

import { useEffect, useRef } from 'react'
import { LightOrb } from './light-orb'

// Mouse-driven parallax + sine-wave float for each orb.
// All motion is JS-driven via a single RAF loop so float + parallax stack
// in one transform call (avoids conflict with CSS animation).

interface OrbConfig {
  size: number
  opacity: number
  top?: string
  bottom?: string
  left?: string
  right?: string
  speed: number   // parallax multiplier (higher = moves more with mouse)
  phase: number   // sine wave phase offset (seconds)
}

const ORBS: OrbConfig[] = [
  { size: 340, opacity: 0.40, top:    '2%',  right:  '4%',  speed: 0.80, phase: 0 },
  { size: 240, opacity: 0.26, top:    '36%', left:   '1%',  speed: 0.50, phase: 2.1 },
  { size: 190, opacity: 0.20, bottom: '12%', left:   '20%', speed: 1.10, phase: 4.4 },
  { size: 150, opacity: 0.18, top:    '56%', right:  '14%', speed: 0.65, phase: 1.5 },
]

export function OrbField() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let raf = 0
    let tx = 0, ty = 0   // mouse target -1..1
    let cx = 0, cy = 0   // smoothed current

    const onMove = (e: MouseEvent) => {
      tx = (e.clientX / window.innerWidth  - 0.5) * 2
      ty = (e.clientY / window.innerHeight - 0.5) * 2
    }

    const tick = () => {
      // Exponential smoothing (lerp toward target)
      cx += (tx - cx) * 0.055
      cy += (ty - cy) * 0.055

      const now = performance.now() / 1000
      const orbEls = el.querySelectorAll<HTMLElement>('[data-orb]')

      orbEls.forEach(o => {
        const speed = parseFloat(o.dataset.orbSpeed ?? '1')
        const phase = parseFloat(o.dataset.orbPhase ?? '0')
        const floatY = Math.sin(now * 0.38 + phase) * 20
        const floatX = Math.sin(now * 0.25 + phase + 1) * 8
        const px = cx * speed * 50
        const py = cy * speed * 50
        o.style.transform = `translate3d(${px + floatX}px, ${py + floatY}px, 0)`
      })

      raf = requestAnimationFrame(tick)
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    raf = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div
      ref={ref}
      aria-hidden
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}
    >
      {ORBS.map((o, i) => (
        <div
          key={i}
          data-orb
          data-orb-speed={o.speed}
          data-orb-phase={o.phase}
          style={{
            position: 'absolute',
            top:    o.top,
            bottom: o.bottom,
            left:   o.left,
            right:  o.right,
            willChange: 'transform',
          }}
        >
          <LightOrb size={o.size} opacity={o.opacity} />
        </div>
      ))}
    </div>
  )
}
