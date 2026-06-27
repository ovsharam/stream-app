# Logo Design Skill

## Plumb brand context
- Product: Plumb — FDE deployment workspace by Applied Scope
- Brand feel: editorial, precise, minimal. No gimmicks, no gradients.
- Color: near-black (`#0c0c0c`) primary, teal (`#1db584`) accent — used sparingly
- Typography in UI: Inter (sans) + Lora (serif) + JetBrains Mono
- Domain: useplumb.ai

## Logo design principles

### Mark (icon/symbol)
The ideal Plumb mark references the core metaphor: **a plumb bob** (the precision tool used to find true vertical) or **pipe/flow** (data pipeline, unclogging).

Directions:
- **Plumb bob geometry**: a diamond or teardrop pointing down — implies precision, alignment, gravity-weighted truth
- **Pipe section**: a clean duct cross-section, elbow, or T-junction rendered as a minimal geometric form
- **P lettermark**: a stylized P where the bowl doubles as a pipeline segment or a flow arc

Design constraints:
- Works at 16px (favicon) and 256px+ (wordmark lockup)
- Single color (black) by default; teal variant for light backgrounds
- No gradients, no drop shadows, no bevels
- SVG-native: paths only, no raster

### Wordmark
- Typeface: geometric sans or editorial serif — NOT the Inter used in UI (too generic)
- Weight: medium to semibold (not bold)
- Letter-spacing: tight, -0.03em to -0.04em
- Case: lowercase preferred ("plumb") — more approachable than all-caps

### Lockup options
1. Mark + wordmark horizontal (nav use)
2. Mark stacked above wordmark (app icon, OG image)
3. Wordmark only (footer, text contexts)

## SVG implementation in Next.js

### Inline SVG component
```tsx
export function PlumbMark({ size = 24, color = '#0c0c0c' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* paths here */}
    </svg>
  )
}
```

### Favicon (app/favicon.ico or app/icon.tsx)
```tsx
// app/icon.tsx — Next.js generates favicon from this
import { ImageResponse } from 'next/og'
export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    <div style={{ background: '#0c0c0c', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6 }}>
      {/* mark SVG here */}
    </div>,
    { ...size }
  )
}
```

### OG image (app/opengraph-image.tsx)
```tsx
import { ImageResponse } from 'next/og'
export const size = { width: 1200, height: 630 }

export default function OGImage() {
  return new ImageResponse(
    <div style={{ background: '#fff', width: 1200, height: 630, display: 'flex', alignItems: 'center', padding: 80 }}>
      <div style={{ fontSize: 72, fontWeight: 600, letterSpacing: '-2px' }}>Plumb</div>
    </div>,
    { ...size }
  )
}
```

## Plumb bob mark — reference geometry
```
        ●         ← string attachment point
        |
       / \
      /   \
     /     \        ← tapered body (hexagonal or smooth)
    /       \
   /         \
  /           \
   \         /
    \_______/
        ▼          ← weighted tip (true vertical indicator)
```

As SVG path (simplified diamond variant, 24×24):
```svg
<path d="M12 2 L20 10 L12 22 L4 10 Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
<circle cx="12" cy="10" r="2" fill="currentColor" />
```

## What makes a mark work at small sizes
- Minimum 2px stroke weight at 16px render size
- No details thinner than 1px at target size
- Strong silhouette — recognizable as a shape, not just detail
- Test at: 16px, 32px, 64px, 256px

## Naming adjacent marks for inspiration
- Vercel (triangle/chevron): geometric, directional
- Linear (gradient arc): motion, flow — but avoid gradients
- Anthropic (atom-ish): technical but approachable
- Stripe (S lettermark): clean, scales perfectly
- For Plumb: aim for Stripe's precision + Vercel's geometry

## Deliverables checklist
- [ ] SVG mark (dark on light)
- [ ] SVG mark (light on dark)
- [ ] Horizontal lockup (mark + wordmark)
- [ ] Square lockup (app icon)
- [ ] Favicon (32×32, 64×64)
- [ ] OG image (1200×630)
- [ ] favicon.ico (16, 32, 48 multi-size)
