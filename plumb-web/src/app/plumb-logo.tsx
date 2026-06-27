export function PlumbMark({ size = 28, light = false }: { size?: number; light?: boolean }) {
  const bg = light ? '#fff' : '#0c0c0c'
  const fg = light ? '#0c0c0c' : '#fff'

  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-label="Plumb">
      {/* Rounded square chip */}
      <rect width="28" height="28" rx="7" fill={bg} />
      {/* P — stem */}
      <path
        d="M8.5 7.5 L8.5 20.5"
        stroke={fg}
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      {/* P — bowl: arcs from top of stem, out and back to mid-stem */}
      <path
        d="M8.5 7.5 C8.5 7.5 20 7.5 20 13 C20 18.5 8.5 18.5 8.5 18.5"
        stroke={fg}
        strokeWidth="2.8"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}

export function PlumbLogo({ size = 28, light = false }: { size?: number; light?: boolean }) {
  const c = light ? '#fff' : '#0c0c0c'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <PlumbMark size={size} light={light} />
      <span style={{
        fontSize: size * 0.57,
        fontWeight: 600,
        letterSpacing: '-0.035em',
        color: c,
        lineHeight: 1,
        fontFamily: 'var(--font-inter), sans-serif',
      }}>
        plumb
      </span>
    </div>
  )
}
