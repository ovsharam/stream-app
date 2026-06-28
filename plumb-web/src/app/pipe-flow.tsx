'use client'

import type React from 'react'

// Animated pipe flow diagram: CALL → [pipe] → PLUMB → [pipe] → BUILD
// Used as the hero section's visual centerpiece.

export function PipeFlow({ style }: { style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 860 130"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', maxWidth: 860, display: 'block', overflow: 'visible', ...style }}
      aria-hidden
    >
      <defs>
        {/* Pipe glow filter */}
        <filter id="pf-glow" x="-20%" y="-100%" width="140%" height="300%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="6" result="blur"/>
          <feFlood floodColor="#202ded" floodOpacity="0.5" result="col"/>
          <feComposite in="col" in2="blur" operator="in" result="glow"/>
          <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        {/* Flow particle gradient */}
        <linearGradient id="pf-flow-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#202ded" stopOpacity="0"/>
          <stop offset="40%" stopColor="#898fe9" stopOpacity="1"/>
          <stop offset="100%" stopColor="#202ded" stopOpacity="0"/>
        </linearGradient>
        <style>{`
          @keyframes pf-draw {
            from { stroke-dashoffset: 1; }
            to   { stroke-dashoffset: 0; }
          }
          @keyframes pf-flow-left {
            from { transform: translateX(-100px); opacity: 0; }
            10%  { opacity: 1; }
            90%  { opacity: 1; }
            to   { transform: translateX(100px); opacity: 0; }
          }
          @keyframes pf-flow-right {
            from { transform: translateX(100px); opacity: 0; }
            10%  { opacity: 1; }
            90%  { opacity: 1; }
            to   { transform: translateX(-100px); opacity: 0; }
          }
          @keyframes pf-pulse {
            0%,100% { opacity: 0.6; r: 6; }
            50%      { opacity: 1;   r: 9; }
          }
          @keyframes pf-gauge-fill {
            0%,100% { stroke-dashoffset: 50; }
            50%      { stroke-dashoffset: 10; }
          }
          @keyframes pf-pressure {
            0%,100% { transform: rotate(-30deg); }
            50%      { transform: rotate(40deg); }
          }
          @keyframes pf-node-glow {
            0%,100% { box-shadow: 0 0 0 0 #202ded; filter: brightness(1); }
            50%      { filter: brightness(1.3); }
          }
          .pf-pipe-l { stroke-dasharray: 1; stroke-dashoffset: 1;
            animation: pf-draw 1s cubic-bezier(.4,0,.2,1) .2s forwards; }
          .pf-pipe-r { stroke-dasharray: 1; stroke-dashoffset: 1;
            animation: pf-draw 1s cubic-bezier(.4,0,.2,1) .5s forwards; }
          .pf-flow-particle {
            animation: pf-flow-left 2.4s ease-in-out infinite;
          }
          .pf-flow-particle-r {
            animation: pf-flow-right 2.4s ease-in-out 1.2s infinite;
          }
          .pf-dot {
            animation: pf-pulse 2s ease-in-out infinite;
          }
          .pf-dot-2 {
            animation: pf-pulse 2s ease-in-out .7s infinite;
          }
          .pf-needle {
            transform-origin: 430px 65px;
            animation: pf-pressure 3s ease-in-out infinite;
          }
        `}</style>
      </defs>

      {/* ── LEFT PIPE (CALL → PLUMB) ──────────────────────────────────── */}
      {/* Pipe shadow */}
      <rect x="158" y="55" width="240" height="20" rx="10" fill="#202ded" opacity=".08"/>
      {/* Pipe body */}
      <rect x="158" y="52" width="240" height="16" rx="8" fill="#202ded" opacity=".18"/>
      <rect x="160" y="54" width="236" height="12" rx="6" fill="#202ded" opacity=".65"
        pathLength="1" className="pf-pipe-l" filter="url(#pf-glow)"/>
      {/* Pipe highlight */}
      <rect x="162" y="55" width="232" height="4" rx="2" fill="#fff" opacity=".12"/>

      {/* Flowing particles — left pipe */}
      <rect x="200" y="57" width="80" height="6" rx="3"
        fill="url(#pf-flow-grad)" className="pf-flow-particle" opacity=".7"/>
      <rect x="260" y="57" width="60" height="6" rx="3"
        fill="url(#pf-flow-grad)" className="pf-flow-particle"
        style={{ animationDelay: '1.2s' }} opacity=".5"/>

      {/* ── RIGHT PIPE (PLUMB → BUILD) ────────────────────────────────── */}
      {/* Pipe body */}
      <rect x="462" y="52" width="240" height="16" rx="8" fill="#202ded" opacity=".18"/>
      <rect x="464" y="54" width="236" height="12" rx="6" fill="#202ded" opacity=".65"
        pathLength="1" className="pf-pipe-r" filter="url(#pf-glow)"/>
      {/* Pipe highlight */}
      <rect x="466" y="55" width="232" height="4" rx="2" fill="#fff" opacity=".12"/>

      {/* Flowing particles — right pipe */}
      <rect x="500" y="57" width="80" height="6" rx="3"
        fill="url(#pf-flow-grad)" className="pf-flow-particle-r" opacity=".7"/>
      <rect x="560" y="57" width="60" height="6" rx="3"
        fill="url(#pf-flow-grad)" className="pf-flow-particle-r"
        style={{ animationDelay: '.6s' }} opacity=".5"/>

      {/* ── LEFT END — CALL node ──────────────────────────────────────── */}
      {/* Coupling cap */}
      <rect x="144" y="46" width="18" height="28" rx="6" fill="#202ded" opacity=".8"/>
      {/* Node circle */}
      <circle cx="128" cy="60" r="20" fill="#14151A" stroke="#202ded" strokeWidth="1.5"/>
      <circle cx="128" cy="60" className="pf-dot" r="6" fill="#202ded"/>
      {/* Label */}
      <text x="128" y="98" textAnchor="middle" fontSize="9" fontWeight="700"
        letterSpacing=".1em" fill="#ffffff" opacity=".45"
        fontFamily="'JetBrains Mono',monospace">THE CALL</text>
      {/* Mic icon */}
      <rect x="124" y="52" width="8" height="12" rx="4" stroke="#fff" strokeWidth="1.2" fill="none" opacity=".5"/>
      <path d="M120 62 Q120 70 128 70 Q136 70 136 62" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity=".5"/>
      <line x1="128" y1="70" x2="128" y2="74" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity=".5"/>

      {/* ── CENTER — PLUMB fitting ────────────────────────────────────── */}
      {/* Main fitting body */}
      <rect x="398" y="38" width="64" height="44" rx="10" fill="#14151A" stroke="#202ded" strokeWidth="1.5"/>
      <rect x="400" y="40" width="60" height="40" rx="9" fill="#111"/>
      {/* Gauge ring */}
      <circle cx="430" cy="60" r="16" stroke="#202ded" strokeWidth="1.5" fill="none" opacity=".5"/>
      {/* Gauge arc (animated fill) */}
      <circle cx="430" cy="60" r="12"
        stroke="#202ded" strokeWidth="3"
        strokeDasharray="50 26" strokeDashoffset="0"
        strokeLinecap="round" fill="none"
        className="pf-gauge-fill"
        style={{ animation: 'pf-gauge-fill 2.5s ease-in-out infinite' }}
        filter="url(#pf-glow)"/>
      {/* Needle */}
      <line x1="430" y1="65" x2="430" y2="52"
        stroke="#fff" strokeWidth="1.5" strokeLinecap="round"
        className="pf-needle"/>
      {/* Center dot */}
      <circle cx="430" cy="65" r="2.5" fill="#202ded"/>
      {/* Tick marks */}
      {[0,45,90,135,180,225,270,315].map((deg, i) => {
        const r = (deg - 90) * Math.PI / 180
        const inner = 10, outer = 13
        return (
          <line key={i}
            x1={430 + inner * Math.cos(r)} y1={60 + inner * Math.sin(r)}
            x2={430 + outer * Math.cos(r)} y2={60 + outer * Math.sin(r)}
            stroke="#ffffff" strokeWidth="1" opacity=".18"/>
        )
      })}
      {/* PLUMB label */}
      <text x="430" y="95" textAnchor="middle" fontSize="8" fontWeight="800"
        letterSpacing=".12em" fill="#202ded"
        fontFamily="'JetBrains Mono',monospace">PLUMB</text>

      {/* ── RIGHT END — BUILD node ────────────────────────────────────── */}
      {/* Coupling cap */}
      <rect x="698" y="46" width="18" height="28" rx="6" fill="#202ded" opacity=".8"/>
      {/* Node circle */}
      <circle cx="730" cy="60" r="20" fill="#14151A" stroke="#202ded" strokeWidth="1.5"/>
      <circle cx="730" cy="60" className="pf-dot-2" r="6" fill="#202ded"/>
      {/* Label */}
      <text x="730" y="98" textAnchor="middle" fontSize="9" fontWeight="700"
        letterSpacing=".1em" fill="#ffffff" opacity=".45"
        fontFamily="'JetBrains Mono',monospace">BUILD</text>
      {/* Code brackets icon */}
      <path d="M722 54 L718 60 L722 66" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity=".5"/>
      <path d="M738 54 L742 60 L738 66" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity=".5"/>
      <line x1="726" y1="60" x2="734" y2="60" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity=".3"/>

      {/* ── PIPE CONNECTORS at fitting joints ──────────────────────────── */}
      {/* Left coupling to fitting */}
      <rect x="392" y="52" width="10" height="16" rx="3" fill="#202ded"/>
      {/* Right fitting to pipe */}
      <rect x="458" y="52" width="10" height="16" rx="3" fill="#202ded"/>
    </svg>
  )
}
