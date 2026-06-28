'use client'

import { PlumberWalker } from './plumber'

// Plumbers wander across the viewport as a fixed overlay.
// Each inhabits its own horizontal "lane" at a distinct depth (y position + size).
// Larger + lower + faster  = close to camera
// Smaller + higher + slower = far away (perspective depth illusion)
// RTL plumbers are mirrored with scaleX(-1) so they face the direction of travel.
// pointer-events: none throughout — plumbers never block clicks.

interface Lane {
  y: string       // top, in vh
  dir: 'ltr' | 'rtl'
  size: number    // px — drives perceived depth
  dur: number     // seconds for a full viewport crossing
  delay: number   // seconds before first appearance
  anim: number    // walk-cycle phase offset
  opacity: number
}

const LANES: Lane[] = [
  // Close foreground — big, fast, low on screen
  { y: '71vh', dir: 'ltr', size: 96,  dur: 20, delay: 0,   anim: 0,    opacity: 1 },
  // Mid distance — medium, medium speed
  { y: '55vh', dir: 'rtl', size: 70,  dur: 28, delay: 9,   anim: 0.18, opacity: 0.92 },
  // Second foreground run — slightly different height
  { y: '78vh', dir: 'ltr', size: 82,  dur: 23, delay: 17,  anim: 0.08, opacity: 1 },
  // Far back — small, slow, high up on screen
  { y: '38vh', dir: 'rtl', size: 50,  dur: 38, delay: 5,   anim: 0.28, opacity: 0.7 },
  // Mid-close — another run
  { y: '64vh', dir: 'ltr', size: 76,  dur: 21, delay: 26,  anim: 0.14, opacity: 0.95 },
]

export function PlumberWorld() {
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 8,
        overflow: 'hidden',
      }}
    >
      {LANES.map((lane, i) => (
        <div
          key={i}
          className={lane.dir === 'ltr' ? 'pw-walk-ltr' : 'pw-walk-rtl'}
          style={{
            position: 'absolute',
            top: lane.y,
            animationDuration:       `${lane.dur}s`,
            animationDelay:          `${lane.delay}s`,
            animationTimingFunction: 'linear',
            animationIterationCount: 'infinite',
            animationFillMode:       'both',
            willChange:              'transform',
          }}
        >
          <PlumberWalker
            size={lane.size}
            animDelay={lane.anim}
            style={{
              opacity:   lane.opacity,
              transform: lane.dir === 'rtl' ? 'scaleX(-1)' : undefined,
              filter:    lane.size < 65
                ? 'drop-shadow(0 4px 12px rgba(32,45,237,0.15))'
                : 'drop-shadow(0 8px 24px rgba(32,45,237,0.22))',
            }}
          />
        </div>
      ))}
    </div>
  )
}
