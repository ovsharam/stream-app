'use client'

import Lenis from 'lenis'
import { useEffect } from 'react'

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const lenis = new Lenis({ lerp: 0.08, smoothWheel: true, syncTouch: false })

    // ── Scroll-driven effects ─────────────────────────────────────────
    lenis.on('scroll', ({ scroll, velocity }: { scroll: number; velocity: number }) => {
      const root = document.documentElement
      const abs  = Math.abs(velocity)
      const dir  = velocity > 0 ? 1 : -1

      root.style.setProperty('--sy', `${scroll}`)
      root.style.setProperty('--sv', `${abs.toFixed(3)}`)

      // Progress bar width
      const maxScroll = document.body.scrollHeight - window.innerHeight
      root.style.setProperty('--scroll-pct', `${(scroll / maxScroll * 100).toFixed(2)}%`)

      // Parallax: data-parallax="0.12"
      document.querySelectorAll<HTMLElement>('[data-parallax]').forEach(el => {
        const speed = parseFloat(el.dataset.parallax ?? '0.1')
        const rect  = el.getBoundingClientRect()
        const cy    = rect.top + rect.height / 2 - window.innerHeight / 2
        el.style.transform = `translateY(${(cy * speed).toFixed(2)}px)`
      })

      // Skew on velocity: data-skew — locomotive signature distortion, capped ±2.4°
      const skewRaw = velocity * 0.55
      const skew    = Math.min(Math.max(skewRaw, -2.4), 2.4).toFixed(3)
      document.querySelectorAll<HTMLElement>('[data-skew]').forEach(el => {
        el.style.transform = `skewY(${skew}deg)`
      })

      // Horizontal parallax: data-parallax-x="0.1"
      document.querySelectorAll<HTMLElement>('[data-parallax-x]').forEach(el => {
        const speed = parseFloat(el.dataset.parallaxX ?? '0.08')
        el.style.transform = `translateX(${(scroll * speed * dir).toFixed(2)}px)`
      })

      // Marquee velocity — CSS animation speed reacts to scroll
      document.querySelectorAll<HTMLElement>('.marquee-track').forEach(el => {
        const base = parseFloat(el.dataset.dur ?? '20')
        const fast = Math.max(base * 0.12, base / (1 + abs * 3.5))
        el.style.animationDuration = `${fast.toFixed(2)}s`
      })

      // Infinite PLUMB footer — each row is scroll-driven
      document.querySelectorAll<HTMLElement>('.plumb-inf-row').forEach((el, i) => {
        const d     = i % 2 === 0 ? 1 : -1
        const spd   = (1 + i * 0.25) * 18
        const curr  = parseFloat(el.dataset.x ?? '0')
        const next  = curr + velocity * d * spd
        el.dataset.x = String(next)
        // wrap so it never drifts too far (content is doubled)
        const wrap  = el.scrollWidth / 2
        const safe  = wrap ? ((next % wrap) + wrap) % wrap : 0
        el.style.transform = `translateX(${d > 0 ? -safe : safe}px)`
      })
    })

    // ── Intersection observer (mask + reveals) ────────────────────────
    const obs = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('in-view')
            obs.unobserve(e.target)
          }
        })
      },
      { rootMargin: '0px 0px -48px 0px', threshold: 0.06 },
    )

    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.querySelectorAll<HTMLElement>(
        '.reveal-up,.reveal-left,.reveal-scale,.mask-wrap,.clip-reveal'
      ).forEach(el => obs.observe(el))
    }))

    // ── Counter animation ─────────────────────────────────────────────
    const counters = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (!e.isIntersecting) return
          const el  = e.target as HTMLElement
          const raw = el.dataset.countTo ?? '0'
          const num = parseFloat(raw.replace(/[^0-9.]/g, ''))
          const pre = raw.match(/^[^0-9.]*/)?.[0] ?? ''
          const suf = raw.match(/[^0-9.]*$/)?.[0] ?? ''
          const isF = raw.includes('.')
          const t0  = performance.now()
          const tick = (now: number) => {
            const p = Math.min((now - t0) / 1600, 1)
            const v = num * (1 - Math.pow(1 - p, 3))
            el.textContent = pre + (isF ? v.toFixed(1) : Math.round(v)) + suf
            if (p < 1) requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
          counters.unobserve(el)
        })
      },
      { threshold: 0.5 },
    )

    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.querySelectorAll<HTMLElement>('[data-count-to]').forEach(el =>
        counters.observe(el)
      )
    }))

    // ── RAF loop ──────────────────────────────────────────────────────
    let id: number
    const raf = (t: number) => { lenis.raf(t); id = requestAnimationFrame(raf) }
    id = requestAnimationFrame(raf)

    return () => {
      cancelAnimationFrame(id)
      lenis.destroy()
      obs.disconnect()
      counters.disconnect()
    }
  }, [])

  return <>{children}</>
}
