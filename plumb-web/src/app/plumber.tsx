'use client'

import type React from 'react'

// ── Single walking plumber character ──────────────────────────────────────────
// viewBox 80×120. Hat is a proper yellow construction hard hat (dome + brim).
// Eyes have white sclera + dark iris + specular dot. Eyebrows + cheek blush.
// Walk cycle: legs ±26° from hip, arms counter-phase, body double-bounce bob.

export function PlumberWalker({
  size = 90,
  animDelay = 0,
  style,
}: {
  size?: number
  animDelay?: number
  style?: React.CSSProperties
}) {
  const h = Math.round(size * 1.5)
  const pfx = `pw${Math.round(animDelay * 1000)}`
  const d   = `${animDelay}s`
  const dur = '0.54s'

  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 80 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      style={{ display: 'block', overflow: 'visible', flexShrink: 0, ...style }}
    >
      <style>{`
        @keyframes ${pfx}-bob {
          0%, 100% { transform: translateY(0); }
          25%       { transform: translateY(-2.5px); }
          75%       { transform: translateY(-2.5px); }
        }
        .${pfx}-body { animation: ${pfx}-bob ${dur} ease-in-out ${d} infinite; }
      `}</style>

      {/* ── LEGS (rendered first so body sits on top) ─────────────── */}

      {/* Left leg — pivot at hip (30, 91) */}
      <g>
        <rect x="24" y="91" width="12" height="22" rx="5" fill="#2535d8"/>
        {/* Knee highlight */}
        <rect x="25" y="100" width="10" height="4" rx="2" fill="#fff" opacity="0.07"/>
        {/* Boot */}
        <rect x="19" y="106" width="18" height="9" rx="4" fill="#1c1c3a"/>
        {/* Boot highlight */}
        <rect x="21" y="107" width="14" height="3" rx="1.5" fill="#fff" opacity="0.10"/>
        <animateTransform attributeName="transform" type="rotate"
          values={`-26,30,91; 26,30,91; -26,30,91`}
          dur={dur} begin={d} repeatCount="indefinite"/>
      </g>

      {/* Right leg — pivot at hip (50, 91), opposite phase */}
      <g>
        <rect x="44" y="91" width="12" height="22" rx="5" fill="#2535d8"/>
        {/* Knee highlight */}
        <rect x="45" y="100" width="10" height="4" rx="2" fill="#fff" opacity="0.07"/>
        {/* Boot */}
        <rect x="43" y="106" width="18" height="9" rx="4" fill="#1c1c3a"/>
        {/* Boot highlight */}
        <rect x="45" y="107" width="14" height="3" rx="1.5" fill="#fff" opacity="0.10"/>
        <animateTransform attributeName="transform" type="rotate"
          values={`26,50,91; -26,50,91; 26,50,91`}
          dur={dur} begin={d} repeatCount="indefinite"/>
      </g>

      {/* ── BODY GROUP (bobs) ──────────────────────────────────────── */}
      <g className={`${pfx}-body`}>

        {/* ── YELLOW CONSTRUCTION HARD HAT ──────────────────── */}
        {/* Dome — proper rounded construction hat shape */}
        <path d="M17 31 Q17 9 40 7 Q63 9 63 31Z" fill="#FFD000"/>
        {/* Dome highlight (top-left specular) */}
        <path d="M24 22 Q30 9 40 7 Q52 9 55 15 Q46 9 30 13Z" fill="#fff" opacity="0.13"/>
        {/* Brim — flat all-around, slightly wider than head */}
        <ellipse cx="40" cy="31" rx="26"  ry="6"   fill="#FFD000"/>
        {/* Brim underside (shadow) */}
        <ellipse cx="40" cy="33" rx="23.5" ry="4.5" fill="#B89000" opacity="0.55"/>
        {/* Front bill sticking forward */}
        <path d="M14 30 Q16 24 25 24 L25 32 Q16 33 12 32Z" fill="#C9A800"/>
        {/* Top brim edge highlight */}
        <ellipse cx="40" cy="29" rx="26"  ry="2" fill="#fff" opacity="0.07"/>

        {/* ── HEAD ────────────────────────────────────────────── */}
        {/* Ears */}
        <ellipse cx="23" cy="44" rx="3.5" ry="5" fill="#f5c49a"/>
        <ellipse cx="57" cy="44" rx="3.5" ry="5" fill="#f5c49a"/>
        {/* Head */}
        <circle cx="40" cy="44" r="17" fill="#f5c49a"/>

        {/* Eyes — white sclera + dark iris + pupil highlight */}
        <circle cx="33" cy="42" r="5"   fill="white"/>
        <circle cx="33" cy="43" r="3.2" fill="#1a1a2e"/>
        <circle cx="31.6" cy="41" r="1.2" fill="#fff" opacity="0.82"/>

        <circle cx="47" cy="42" r="5"   fill="white"/>
        <circle cx="47" cy="43" r="3.2" fill="#1a1a2e"/>
        <circle cx="45.6" cy="41" r="1.2" fill="#fff" opacity="0.82"/>

        {/* Eyebrows — cheerful upward-arc (happy brows) */}
        <path d="M29 37 Q33 34.5 37 37"
          stroke="#c07840" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
        <path d="M43 37 Q47 34.5 51 37"
          stroke="#c07840" strokeWidth="1.5" strokeLinecap="round" fill="none"/>

        {/* Nose — small rounded triangle */}
        <path d="M39 48 Q40 50.5 41 48" stroke="#c48a58" strokeWidth="1.2" strokeLinecap="round" fill="none"/>

        {/* Smile — wide friendly grin */}
        <path d="M33 52 Q40 59 47 52"
          stroke="#c48a58" strokeWidth="1.8" strokeLinecap="round" fill="none"/>

        {/* Cheek blush */}
        <ellipse cx="26" cy="49" rx="4.5" ry="3" fill="#f08050" opacity="0.28"/>
        <ellipse cx="54" cy="49" rx="4.5" ry="3" fill="#f08050" opacity="0.28"/>

        {/* ── NECK ────────────────────────────────────────────── */}
        <rect x="36" y="59" width="8" height="8" rx="3" fill="#f5c49a"/>

        {/* ── COVERALLS ───────────────────────────────────────── */}
        <rect x="18" y="65" width="44" height="29" rx="8" fill="#202ded"/>
        {/* Hi-vis yellow stripe */}
        <rect x="18" y="77" width="44" height="9" fill="#FFD000" opacity="0.95"/>
        {/* Centre zip */}
        <rect x="38" y="65" width="4"  height="29" rx="2" fill="#1620c0"/>
        {/* Pocket */}
        <rect x="50" y="69" width="9" height="6" rx="2"
          stroke="#fff" strokeWidth="0.6" fill="none" opacity="0.12"/>
        {/* Shoulder seams */}
        <line x1="18" y1="65" x2="18" y2="78" stroke="#1620c0" strokeWidth="0.5"/>
        <line x1="62" y1="65" x2="62" y2="78" stroke="#1620c0" strokeWidth="0.5"/>

        {/* ── BELT ────────────────────────────────────────────── */}
        <rect x="17" y="91" width="46" height="6" rx="3" fill="#1620c0"/>
        {/* Buckle */}
        <rect x="36" y="90" width="8"  height="8" rx="2" fill="#898fe9" opacity="0.85"/>

        {/* ── LEFT ARM — swings forward (same phase as right leg) */}
        <g>
          <rect x="3"  y="63" width="17" height="10" rx="5" fill="#202ded"/>
          {/* Glove */}
          <circle cx="2" cy="68" r="6" fill="#1620c0"/>
          {/* Pipe segment */}
          <rect x="-5" y="65" width="9" height="5" rx="2.5" fill="#202ded" opacity="0.7"/>
          <animateTransform attributeName="transform" type="rotate"
            values={`22,20,67; -22,20,67; 22,20,67`}
            dur={dur} begin={d} repeatCount="indefinite"/>
        </g>

        {/* ── RIGHT ARM — opposite phase ───────────────────────── */}
        <g>
          <rect x="60" y="63" width="17" height="10" rx="5" fill="#202ded"/>
          {/* Glove */}
          <circle cx="78" cy="68" r="6" fill="#1620c0"/>
          {/* Wrench */}
          <rect x="75" y="65" width="10" height="5" rx="2" fill="#898fe9"/>
          <animateTransform attributeName="transform" type="rotate"
            values={`-22,60,67; 22,60,67; -22,60,67`}
            dur={dur} begin={d} repeatCount="indefinite"/>
        </g>

      </g>
    </svg>
  )
}

// ── PlumberParade — full-width scrolling marquee ───────────────────────────────
export function PlumberParade({ bg = 'transparent' }: { bg?: string }) {
  const walkers = Array.from({ length: 8 }, (_, i) => (
    <PlumberWalker
      key={i}
      size={78}
      animDelay={i * 0.068}
      style={{ marginRight: i % 3 === 0 ? 52 : 28 }}
    />
  ))

  return (
    <div style={{
      background: bg,
      overflow: 'hidden',
      width: '100%',
      paddingBottom: 16,
      cursor: 'default',
      userSelect: 'none',
    }}>
      <div
        className="parade-track"
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          whiteSpace: 'nowrap',
          width: 'max-content',
        }}
      >
        {walkers}
        {walkers}
      </div>
    </div>
  )
}

// ── PlumberHero — large single for the hero section ───────────────────────────
export function PlumberHero({ size = 200, style }: { size?: number; style?: React.CSSProperties }) {
  return <PlumberWalker size={size} animDelay={0} style={style} />
}

// ── PlumberSmall — CTA accent ─────────────────────────────────────────────────
export function PlumberSmall({ size = 70, style }: { size?: number; style?: React.CSSProperties }) {
  return <PlumberWalker size={size} animDelay={0.14} style={style} />
}
