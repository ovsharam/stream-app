// Flat illustration — strong adult male mechanic with pipe on shoulder.
// No outlines. Bold flat fills + dual-tone depth.
// Pipe rests across the back shoulder, extending up-right. Arm steadies it.

import React from 'react'

const SK   = '#F4A27A'
const SKD  = '#D98A5E'
const WT   = '#F0F0F0'
const WTS  = '#D0D0D0'
const DK   = '#141420'
const DKS  = '#0A0A12'
const YL   = '#F5C53A'
const YLD  = '#C89D1E'
const PG   = '#8899AE'
const PGS  = '#5C6E82'
const PGL  = '#C8DCF0'
const CAP  = '#3E78C8'
const CAPD = '#2B5BA0'
const HAIR = '#16100A'

export const PLUMB_CHARACTER_CSS = `
  @keyframes plumb-float {
    0%,100% { transform: translateY(0px); }
    50%      { transform: translateY(-12px); }
  }
`

export function PlumbMechanic({
  size  = 320,
  float = false,
  style,
}: {
  size?:  number
  float?: boolean
  style?: React.CSSProperties
}) {
  const VBW = 460
  const VBH = 530
  const h   = Math.round(size * VBH / VBW)

  return (
    <svg
      width={size} height={h}
      viewBox={`0 0 ${VBW} ${VBH}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      style={{
        display: 'block',
        overflow: 'visible',
        animation: float ? 'plumb-float 4.2s ease-in-out infinite' : undefined,
        ...style,
      }}
    >
      {/* Ground shadow */}
      <ellipse cx="190" cy="516" rx="148" ry="12" fill="rgba(0,0,0,0.18)"/>

      {/* ─── BACK LEG ────────────────────────────────────────── */}
      <path d="M188 270 L196 390 L230 388 L222 270 Z" fill={DK}/>
      <path d="M195 364 L200 402 L235 400 L229 362 Z" fill={DKS}/>
      {/* back boot */}
      <path d="M193 395 Q190 430 198 450 L248 450 Q264 443 260 430 L244 395 Z" fill={YL}/>
      <path d="M190 410 Q188 434 198 450 L200 450 Q192 436 192 414 Z" fill={YLD}/>
      <rect x="190" y="446" width="73" height="11" rx="3" fill={YLD}/>

      {/* ─── PIPE ── rests on back shoulder, extends upper-right ─── */}
      {/*
          Pipe axis at ~28° above horizontal.
          Shoulder contact point: (206, 152).
          Far cap center: (455, 70). Near end: hangs just below shoulder.
          Near end center: (172, 182) — pipe extends behind/below shoulder.
          Pipe diameter: 50px. Perp offsets at 28°: dx≈14, dy≈31.
          Top edge:    near=(158,151) → far=(441,39)
          Bottom edge: near=(186,213) → far=(469,101)
      */}
      {/* Near cap — visible behind/below shoulder */}
      <ellipse cx="172" cy="182" rx="38" ry="14"
        fill={PGS} transform="rotate(-28 172 182)"/>
      {/* Pipe body */}
      <path d="M158 151 L441 39 L469 101 L186 213 Z" fill={PG}/>
      {/* Top highlight strip */}
      <path d="M160 149 L443 37 L443 49 L162 161 Z" fill={PGL} opacity="0.7"/>
      {/* Bottom shadow strip */}
      <path d="M182 209 L466 97 L469 101 L186 213 Z" fill={PGS} opacity="0.55"/>
      {/* Far cap */}
      <ellipse cx="455" cy="70" rx="38" ry="14"
        fill={PGL} transform="rotate(-28 455 70)"/>
      <ellipse cx="455" cy="70" rx="24" ry="8"
        fill={PGS} opacity="0.4" transform="rotate(-28 455 70)"/>

      {/* ─── BACK ARM ─── arch up to elbow, forearm rests on pipe ─ */}
      {/*
          Shoulder: (190, 145).
          Elbow peaks at: (218, 105) — above pipe top at that x.
          Hand lands on pipe top: (248, 115). Pipe top at x=248 is y≈115.
          Upper arm: 26px wide parallelogram, 55° rise.
          Forearm: 24px wide, nearly horizontal (-18°), ends at pipe.
      */}
      {/* Upper arm — shoulder (190,145) → elbow (218,105) */}
      <path d="M179 138 L201 153 L229 113 L207 98 Z" fill={SK}/>
      {/* Elbow bulge */}
      <ellipse cx="218" cy="105" rx="15" ry="12" fill={SK}/>
      {/* Shadow on back of elbow */}
      <path d="M222 94 L232 108 Q228 114 224 112 L216 98 Z" fill={SKD} opacity="0.28"/>
      {/* Forearm — elbow (218,105) → hand (248,115), nearly horizontal */}
      <path d="M222 94 L214 116 L244 126 L252 104 Z" fill={SK}/>
      {/* Hand gripping pipe — centered on pipe top (y≈115 at x=248) */}
      <ellipse cx="248" cy="115" rx="20" ry="14" fill={SK}/>
      {/* Knuckle shadow for grip depth */}
      <ellipse cx="248" cy="115" rx="13" ry="9" fill={SKD} opacity="0.25"/>

      {/* ─── TORSO / SHIRT ──────────────────────────────────── */}
      {/* Shadow back panel */}
      <path d="M202 155 Q212 215 210 275 L172 277 Q176 218 172 155 Z" fill={WTS}/>
      {/* Main shirt */}
      <path d="
        M82 152
        Q72 215 76 275
        Q112 290 202 275
        Q212 215 208 152
        Q188 130 140 128
        Q102 130 82 152
      Z" fill={WT}/>
      {/* Chest highlight */}
      <path d="M140 130 Q170 138 196 158 Q206 185 200 200
               Q180 178 160 158 Q150 142 140 130 Z" fill="rgba(255,255,255,0.48)"/>
      {/* Belt */}
      <rect x="77" y="270" width="134" height="17" rx="5" fill="#181818"/>
      {/* Buckle */}
      <rect x="124" y="262" width="26" height="32" rx="5" fill={PG}/>
      <rect x="128" y="266" width="18" height="24" rx="3" fill={PGS}/>

      {/* ─── FRONT LEG ──────────────────────────────────────── */}
      <path d="M106 270 L92 390 L126 394 L138 270 Z" fill={DK}/>
      <path d="M92 364 L80 403 L122 406 L126 362 Z" fill={DK}/>
      {/* front boot */}
      <path d="M64 398 Q56 433 66 452 L136 452 Q152 445 148 432 L130 398 Z" fill={YL}/>
      <path d="M56 415 Q54 436 66 452 L68 452 Q58 438 58 418 Z" fill={YLD}/>
      <rect x="57" y="448" width="94" height="11" rx="3" fill={YLD}/>

      {/* ─── FRONT ARM + WRENCH ─────────────────────────────── */}
      {/* Upper arm swings forward and down */}
      <path d="
        M83 153 Q58 197 48 242
        Q42 264 55 274
        Q70 278 80 262
        Q90 222 115 170
        Z
      " fill={SK}/>
      <path d="M50 240 Q43 264 55 274 Q68 278 76 264 Q72 244 60 232 Z" fill={SKD} opacity="0.35"/>
      {/* hand */}
      <ellipse cx="57" cy="268" rx="19" ry="13" fill={SK}/>
      {/* Wrench */}
      <g transform="translate(55 286) rotate(-16)">
        <rect x="-8" y="0" width="16" height="85" rx="8" fill={PG}/>
        <rect x="-5" y="5" width="7" height="73" rx="3.5" fill={PGL} opacity="0.3"/>
        <path d="M-22 -4 Q-22 -30 0 -30 Q22 -30 22 -4 L14 -4 Q14 -22 0 -22 Q-14 -22 -14 -4 Z" fill={PG}/>
        <rect x="-7" y="-10" width="14" height="10" rx="3" fill={PGS}/>
        <path d="M-10 -4 L-22 -4 L-22 4 Q-18 9 -10 9 Z" fill={PGS}/>
        <path d="M10 -4 L22 -4 L22 4 Q18 9 10 9 Z" fill={PGS}/>
      </g>

      {/* ─── NECK ───────────────────────────────────────────── */}
      <path d="M118 126 Q130 114 150 114 L152 134 Q140 138 120 136 Z" fill={SK}/>

      {/* ─── HEAD ───────────────────────────────────────────── */}
      {/* Ear */}
      <ellipse cx="170" cy="78" rx="13" ry="16" fill={SK}/>
      <ellipse cx="170" cy="78" rx="7"  ry="9"  fill={SKD}/>
      {/* Head — slightly wider/taller for adult male */}
      <path d="
        M78 72
        Q80 26 122 22
        Q164 24 172 58
        Q174 94 162 116
        Q150 132 122 134
        Q96 132 84 116
        Q76 98 78 72
      Z" fill={SK}/>
      {/* Jaw shadow */}
      <path d="M78 72 Q76 94 82 116 Q92 132 106 126 Q96 108 85 84 Z" fill={SKD} opacity="0.25"/>
      {/* Side face shadow */}
      <path d="M154 46 Q172 62 172 82 Q172 104 158 118 Q152 104 152 82 Q152 62 154 46 Z" fill={SKD} opacity="0.13"/>
      {/* Eye */}
      <ellipse cx="136" cy="72" rx="5.5" ry="6" fill={SKD}/>
      <ellipse cx="134" cy="70" rx="2" ry="2" fill="rgba(255,255,255,0.4)"/>
      {/* Brow */}
      <path d="M128 62 Q138 58 148 60" stroke={SKD} strokeWidth="4" strokeLinecap="round"/>
      {/* Nose */}
      <path d="M118 82 Q113 91 116 93 Q121 95 126 93 Q129 91 124 82 Z" fill={SKD} opacity="0.36"/>

      {/* ─── HAIR ───────────────────────────────────────────── */}
      <path d="M78 74 Q80 30 122 24 Q162 26 172 58 L166 66 Q162 36 122 34 Q84 36 82 72 Z" fill={HAIR}/>
      <path d="M78 72 Q74 92 78 120 Q88 134 104 126 Q94 106 84 78 Z" fill={HAIR}/>

      {/* ─── CAP ────────────────────────────────────────────── */}
      <path d="M80 64 Q82 26 122 22 Q162 24 168 54 Q150 42 122 40 Q96 42 82 62 Z" fill={CAP}/>
      <path d="M80 64 Q88 54 112 48 Q124 46 136 50 Q110 58 92 66 Z" fill={CAPD} opacity="0.4"/>
      <circle cx="124" cy="24" r="5" fill={CAPD}/>
      {/* brim points LEFT */}
      <path d="M80 64 Q76 74 50 70 Q56 52 82 58 Z" fill={CAPD}/>
      <path d="M56 68 Q50 72 50 70 Q56 52 62 56 Z" fill={CAPD} opacity="0.4"/>

      {/* ─── TOOLBOX ────────────────────────────────────────── */}
      <rect x="6"  y="412" width="76" height="62" rx="7" fill={CAP}/>
      <rect x="6"  y="412" width="76" height="22" rx="7" fill={CAPD}/>
      <rect x="28" y="402" width="32" height="16" rx="8" fill="#181818"/>
      <rect x="30" y="404" width="14" height="5"  rx="2.5" fill="#2a2a2a"/>
      <rect x="14" y="417" width="14" height="10" rx="3" fill={YL}/>
      <rect x="60" y="417" width="14" height="10" rx="3" fill={YL}/>
      <rect x="6"  y="433" width="76" height="4" fill="#5090E8"/>
      <line x1="28" y1="438" x2="28" y2="468" stroke={CAPD} strokeWidth="2.5"/>
      <line x1="44" y1="438" x2="44" y2="468" stroke={CAPD} strokeWidth="2.5"/>
      <line x1="60" y1="438" x2="60" y2="468" stroke={CAPD} strokeWidth="2.5"/>

    </svg>
  )
}

export { PlumbMechanic as PlumbFDE }
