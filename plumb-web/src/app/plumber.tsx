'use client'

import type React from 'react'

// ── Single walking plumber character ──────────────────────────────────────────
// Cute comic/flat-illustration style (ponpon-mania sheep aesthetic):
// Bold black outlines, chibi proportions, big dot eyes, simple shapes.
// viewBox 80×120. Hard hat dome, coveralls with hi-vis stripe,
// pipe resting on left shoulder. Walk cycle: legs ±22°, arms counter-phase.

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

      {/* ── LEGS (behind body) ─────────────────────────────────────────── */}

      {/* Left leg — pivot at hip (30, 90) */}
      <g>
        <rect x="22" y="90" width="14" height="22" rx="7" fill="#2535d8" stroke="#111" strokeWidth="2"/>
        <ellipse cx="29" cy="113" rx="10" ry="6" fill="#111"/>
        <ellipse cx="27" cy="111" rx="6" ry="3" fill="#333"/>
        <animateTransform attributeName="transform" type="rotate"
          values={`-22,29,90; 22,29,90; -22,29,90`}
          dur={dur} begin={d} repeatCount="indefinite"/>
      </g>

      {/* Right leg — pivot at hip (51, 90), opposite phase */}
      <g>
        <rect x="44" y="90" width="14" height="22" rx="7" fill="#2535d8" stroke="#111" strokeWidth="2"/>
        <ellipse cx="51" cy="113" rx="10" ry="6" fill="#111"/>
        <ellipse cx="53" cy="111" rx="6" ry="3" fill="#333"/>
        <animateTransform attributeName="transform" type="rotate"
          values={`22,51,90; -22,51,90; 22,51,90`}
          dur={dur} begin={d} repeatCount="indefinite"/>
      </g>

      {/* ── BODY GROUP (bobs with walk) ───────────────────────────────── */}
      <g className={`${pfx}-body`}>

        {/* ── HARD HAT ─────────────────────────────── */}
        {/* Dome */}
        <path d="M14 34 Q14 6 40 4 Q66 6 66 34 Z"
          fill="#FFD600" stroke="#111" strokeWidth="2.4" strokeLinejoin="round"/>
        {/* Brim */}
        <rect x="8" y="30" width="64" height="11" rx="5.5" fill="#FFD600" stroke="#111" strokeWidth="2.2"/>
        {/* Under-brim shadow */}
        <rect x="10" y="35" width="60" height="6" rx="4" fill="#C9A400"/>
        {/* Hat band stripe */}
        <rect x="18" y="27" width="44" height="7" rx="3" fill="#E0A800"/>
        {/* Dome highlight */}
        <path d="M22 24 Q32 10 40 8 Q50 9 54 14 Q44 9 28 16 Z" fill="white" opacity="0.15"/>

        {/* ── HEAD ─────────────────────────────────── */}
        {/* Ears */}
        <ellipse cx="20" cy="52" rx="4.5" ry="6" fill="#FFE4B5" stroke="#111" strokeWidth="1.8"/>
        <ellipse cx="60" cy="52" rx="4.5" ry="6" fill="#FFE4B5" stroke="#111" strokeWidth="1.8"/>
        {/* Inner ear */}
        <ellipse cx="20" cy="52" rx="2.5" ry="3.5" fill="#f5c4a0"/>
        <ellipse cx="60" cy="52" rx="2.5" ry="3.5" fill="#f5c4a0"/>
        {/* Head circle */}
        <circle cx="40" cy="51" r="21" fill="#FFE4B5" stroke="#111" strokeWidth="2.4"/>

        {/* Eyes — big cute dot style (ponpon aesthetic) */}
        <circle cx="31" cy="49" r="5.5" fill="#111"/>
        <circle cx="49" cy="49" r="5.5" fill="#111"/>
        {/* Eye shines — two dots each for extra cute */}
        <circle cx="29" cy="46.5" r="2.2" fill="white"/>
        <circle cx="32.5" cy="50" r="1" fill="white" opacity="0.7"/>
        <circle cx="47" cy="46.5" r="2.2" fill="white"/>
        <circle cx="50.5" cy="50" r="1" fill="white" opacity="0.7"/>

        {/* Eyebrows — thick, expressive arches */}
        <path d="M26 41 Q31 37.5 36 41"
          stroke="#111" strokeWidth="2.4" strokeLinecap="round" fill="none"/>
        <path d="M44 41 Q49 37.5 54 41"
          stroke="#111" strokeWidth="2.4" strokeLinecap="round" fill="none"/>

        {/* Nose — tiny round dot */}
        <circle cx="40" cy="55" r="2.2" fill="#c07840"/>

        {/* Smile — wide curved grin */}
        <path d="M32 60 Q40 68 48 60"
          stroke="#111" strokeWidth="2.4" strokeLinecap="round" fill="none"/>

        {/* Cheek blush — big soft circles */}
        <ellipse cx="23" cy="57" rx="6.5" ry="4.5" fill="#ff8888" opacity="0.38"/>
        <ellipse cx="57" cy="57" rx="6.5" ry="4.5" fill="#ff8888" opacity="0.38"/>

        {/* ── COVERALLS (body) ─────────────────────── */}
        <rect x="16" y="70" width="48" height="26" rx="13" fill="#2535d8" stroke="#111" strokeWidth="2.2"/>

        {/* Overall suspender straps */}
        <rect x="32" y="68" width="7" height="15" rx="3.5" fill="#FFE4B5" stroke="#111" strokeWidth="1.6"/>
        <rect x="41" y="68" width="7" height="15" rx="3.5" fill="#FFE4B5" stroke="#111" strokeWidth="1.6"/>

        {/* Hi-vis yellow safety stripe */}
        <rect x="16" y="81" width="48" height="9" fill="#FFD600"/>
        <line x1="16" y1="81" x2="64" y2="81" stroke="#111" strokeWidth="0.8" opacity="0.35"/>
        <line x1="16" y1="90" x2="64" y2="90" stroke="#111" strokeWidth="0.8" opacity="0.35"/>

        {/* Chest pocket */}
        <rect x="47" y="72" width="12" height="8" rx="3" fill="none" stroke="#111" strokeWidth="1.3" opacity="0.45"/>
        <rect x="52" y="70" width="2.5" height="4" rx="1.25" fill="none" stroke="#111" strokeWidth="1.2" opacity="0.4"/>

        {/* ── BELT ─────────────────────────────────── */}
        <rect x="15" y="93" width="50" height="8" rx="4" fill="#1620c0" stroke="#111" strokeWidth="1.8"/>
        {/* Belt buckle */}
        <rect x="33" y="92" width="14" height="10" rx="3" fill="#8A94E8" stroke="#111" strokeWidth="1.6"/>
        <rect x="35.5" y="94" width="9" height="6" rx="2" fill="none" stroke="#111" strokeWidth="1.2" opacity="0.5"/>

        {/* ── LEFT ARM — raised, supporting pipe on shoulder ─── */}
        <g>
          <rect x="0" y="63" width="18" height="12" rx="6" fill="#2535d8" stroke="#111" strokeWidth="1.8"/>
          <circle cx="1" cy="69" r="7" fill="#1620c0" stroke="#111" strokeWidth="1.6"/>
          <animateTransform attributeName="transform" type="rotate"
            values={`-28,18,70; -8,18,70; -28,18,70`}
            dur={dur} begin={d} repeatCount="indefinite"/>
        </g>

        {/* ── PIPE on left shoulder ─────────────────────────── */}
        {/* Long pipe resting diagonally on shoulder, extending behind */}
        <rect x="-14" y="56" width="40" height="9" rx="4.5" fill="#7A8FA8" stroke="#111" strokeWidth="1.6"/>
        {/* Pipe end cap — left */}
        <circle cx="-14" cy="60.5" r="5.5" fill="#5A7090" stroke="#111" strokeWidth="1.4"/>
        {/* Pipe end cap — right */}
        <circle cx="26" cy="60.5" r="5.5" fill="#5A7090" stroke="#111" strokeWidth="1.4"/>
        {/* Pipe surface highlight */}
        <rect x="-12" y="58" width="36" height="3" rx="1.5" fill="white" opacity="0.22"/>
        {/* Pipe coupling ring in middle */}
        <rect x="3" y="55.5" width="6" height="10" rx="2" fill="#4A6080" stroke="#111" strokeWidth="1.2"/>

        {/* ── RIGHT ARM — swings freely, holds wrench ────────── */}
        <g>
          <rect x="62" y="63" width="18" height="12" rx="6" fill="#2535d8" stroke="#111" strokeWidth="1.8"/>
          <circle cx="79" cy="69" r="7" fill="#1620c0" stroke="#111" strokeWidth="1.6"/>
          {/* Wrench in right hand */}
          <rect x="75" y="64" width="12" height="5" rx="2" fill="#8A94E8" stroke="#111" strokeWidth="1.2"/>
          <animateTransform attributeName="transform" type="rotate"
            values={`20,62,70; -12,62,70; 20,62,70`}
            dur={dur} begin={d} repeatCount="indefinite"/>
        </g>

      </g>
    </svg>
  )
}

// ── PlumberParade — full-width scrolling marquee (kept for reference) ─────────
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

export function PlumberHero({ size = 200, style }: { size?: number; style?: React.CSSProperties }) {
  return <PlumberWalker size={size} animDelay={0} style={style} />
}

export function PlumberSmall({ size = 70, style }: { size?: number; style?: React.CSSProperties }) {
  return <PlumberWalker size={size} animDelay={0.14} style={style} />
}
