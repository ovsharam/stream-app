# Web Animation Skill

## Philosophy
Animations should feel like they belong to the product — not bolted on. Every motion should have a reason: directing attention, communicating state, or revealing structure. When in doubt, do less.

## Hierarchy of approaches (prefer top of list)
1. **CSS `@keyframes` + class toggles** — zero JS, best performance, SSR-safe
2. **CSS `animation-timeline: view()`** — scroll-driven, no IntersectionObserver needed, use `@supports` guard
3. **SVG SMIL (`animateMotion`, `animate`)** — for path-following motion; no JS needed
4. **`requestAnimationFrame` loop** — for physics, continuous data-driven animation, or multi-element sync
5. **Framer Motion** — last resort; adds bundle weight and requires 'use client'; never use `initial="hidden"` on SSR-rendered content

## Critical rule: never hide content
- **Never set `opacity: 0` as the initial state for below-fold content** — Playwright screenshots and SSR will show blank pages
- Scroll reveals: animate `transform` only (`translateY`). Content is always visible at `opacity: 1`
- Hero animations: `opacity: 0 → 1` is fine (above fold, animates immediately on load)
- Exception: purely decorative SVG elements (dots, lines) can use opacity animation

## CSS animation patterns

### Staggered hero entrance
```css
.h0 { animation: fade-up 0.65s cubic-bezier(0.16,1,0.3,1) both; }
.h1 { animation: fade-up 0.65s cubic-bezier(0.16,1,0.3,1) 0.08s both; }
/* .h2 through .h5 with increasing delays */

@keyframes fade-up {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

### Scroll reveal (transform only)
```css
@supports (animation-timeline: view()) {
  .reveal {
    animation: slide-up 0.6s cubic-bezier(0.16,1,0.3,1) both;
    animation-timeline: view();
    animation-range: entry 0% entry 28%;
  }
}
@keyframes slide-up {
  from { transform: translateY(12px); }
  to   { transform: translateY(0); }
}
```

### Line drawing (SVG path)
```css
.tree-line { stroke-dasharray: 1; stroke-dashoffset: 1; }
.in-view .tree-line { animation: draw-path 0.5s ease forwards; }
@keyframes draw-path { to { stroke-dashoffset: 0; } }
```
Requires `pathLength="1"` on the SVG `<path>` element.

### Infinite scroll ticker
```css
.stream { animation: stream-tick 28s linear infinite; }
@keyframes stream-tick { to { transform: translateY(-50%); } }
```
Duplicate content once in the DOM so the loop is seamless.

### Breathing / pulse
```css
@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 0.9; }
  50%       { transform: scale(1.06); opacity: 1; }
}
```

## requestAnimationFrame patterns

### Packet travel along a line
```tsx
useEffect(() => {
  let raf: number
  let start: number | null = null
  const CYCLE = 5000 // ms

  function easeInOut(t: number) {
    return t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2
  }

  function tick(ts: number) {
    if (!start) start = ts
    const t = ((ts - start) % CYCLE) / CYCLE
    
    // update SVG element positions via refs
    if (t >= seg.t0 && t <= seg.t1) {
      const p = easeInOut((t - seg.t0) / (seg.t1 - seg.t0))
      el.setAttribute('cx', String(from.x + (to.x - from.x) * p))
      el.setAttribute('cy', String(from.y + (to.y - from.y) * p))
      el.setAttribute('opacity', '1')
    } else {
      el.setAttribute('opacity', '0')
    }
    
    raf = requestAnimationFrame(tick)
  }
  
  raf = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(raf)
}, [])
```

## SVG animation tips
- Use `filter: url(#glow)` with `feGaussianBlur` for teal glow on packets
- `pathLength="1"` normalizes stroke-dasharray so you can use values 0–1 regardless of actual path length
- For packet travel, prefer `requestAnimationFrame` over SMIL `animateMotion` — more reliable with React hydration
- SVG `<animate>` on `r` attribute works for circle size animation (SVG 2)
- Set `transform-origin: center` for scale animations on SVG elements; may need `transform-box: fill-box`

## Timing reference
| Feel       | Duration | Easing |
|------------|----------|--------|
| Snap       | 120–180ms | ease-out |
| Responsive | 200–280ms | ease-in-out |
| Graceful   | 350–500ms | cubic-bezier(0.16,1,0.3,1) |
| Cinematic  | 600–900ms | cubic-bezier(0.16,1,0.3,1) |

Spring easing `cubic-bezier(0.16,1,0.3,1)` works well for entrance animations — fast exit from initial state, overshoots slightly, settles.

## What not to animate
- Don't animate `width`, `height`, or `margin` — triggers layout reflow; use `transform: scale()` instead
- Don't animate `box-shadow` directly — use opacity on a pseudo-element instead
- Don't add animations to elements that toggle rapidly (tabs, dropdowns) — they'll feel laggy
- Don't use `will-change: transform` on everything — it creates new compositing layers, use only on elements that actually animate
