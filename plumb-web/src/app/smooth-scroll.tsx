'use client'

import Lenis from 'lenis'
import { useEffect } from 'react'

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Defensive init — don't crash non-landing pages
    const lenis = (() => {
      try { return new Lenis({ lerp: 0.08, smoothWheel: true, syncTouch: false }) }
      catch { return null }
    })()
    if (!lenis) return

    // ── Cache DOM element sets once (avoids querySelectorAll every frame) ──
    type EL = HTMLElement
    const $ = {
      parallax:  [] as EL[],
      skew:      [] as EL[],
      parallaxX: [] as EL[],
      rows:      [] as EL[],
    }

    const populate = () => {
      $.parallax  = [...document.querySelectorAll<EL>('[data-parallax]')]
      $.skew      = [...document.querySelectorAll<EL>('[data-skew]')]
      $.parallaxX = [...document.querySelectorAll<EL>('[data-parallax-x]')]
      $.rows      = [...document.querySelectorAll<EL>('.plumb-inf-row')]
    }

    // Populate after first paint, then keep a lazy refresh every 2s
    requestAnimationFrame(() => requestAnimationFrame(populate))
    const refreshId = setInterval(populate, 2000)

    // ── Scroll-driven effects ─────────────────────────────────────────────
    lenis.on('scroll', ({ scroll, velocity }: { scroll: number; velocity: number }) => {
      const root = document.documentElement
      const abs  = Math.abs(velocity)
      const dir  = velocity > 0 ? 1 : -1

      root.style.setProperty('--sy', `${scroll}`)
      root.style.setProperty('--sv', `${abs.toFixed(3)}`)

      // Progress bar
      const maxScroll = document.body.scrollHeight - window.innerHeight
      root.style.setProperty('--scroll-pct', `${((scroll / maxScroll) * 100).toFixed(2)}%`)

      // Parallax — data-parallax="0.12"
      $.parallax.forEach(el => {
        const speed = parseFloat(el.dataset.parallax ?? '0.1')
        const rect  = el.getBoundingClientRect()
        const cy    = rect.top + rect.height / 2 - window.innerHeight / 2
        el.style.transform = `translateY(${(cy * speed).toFixed(2)}px)`
      })

      // Skew — capped at ±1.0° (subtle, not jarring)
      const skew = Math.min(Math.max(velocity * 0.22, -1.0), 1.0).toFixed(3)
      $.skew.forEach(el => { el.style.transform = `skewY(${skew}deg)` })

      // Horizontal parallax — data-parallax-x="0.08"
      $.parallaxX.forEach(el => {
        const speed = parseFloat(el.dataset.parallaxX ?? '0.08')
        el.style.transform = `translateX(${(scroll * speed * dir).toFixed(2)}px)`
      })

      // Marquee runs at fixed CSS animation speed — no per-frame animationDuration
      // change here because that restarts the animation and causes visible jitter.

      // Infinite PLUMB rows — velocity accumulates per row
      $.rows.forEach((el, i) => {
        const d    = i % 2 === 0 ? 1 : -1
        const spd  = (1 + i * 0.25) * 18
        const curr = parseFloat(el.dataset.x ?? '0')
        const next = curr + velocity * d * spd
        el.dataset.x = String(next)
        const wrap = el.scrollWidth / 2
        const safe = wrap ? ((next % wrap) + wrap) % wrap : 0
        el.style.transform = `translateX(${d > 0 ? -safe : safe}px)`
      })
    })

    // ── IntersectionObserver — mask reveals & scroll-ins ─────────────────
    const obs = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) { e.target.classList.add('in-view'); obs.unobserve(e.target) }
        })
      },
      { rootMargin: '0px 0px -48px 0px', threshold: 0.06 },
    )

    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.querySelectorAll<EL>(
        '.reveal-up,.reveal-left,.reveal-scale,.mask-wrap,.clip-reveal'
      ).forEach(el => obs.observe(el))
    }))

    // ── Counter animation — data-count-to="730%" ─────────────────────────
    const counters = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (!e.isIntersecting) return
          const el  = e.target as EL
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
      document.querySelectorAll<EL>('[data-count-to]').forEach(el => counters.observe(el))
    }))

    // ── Theme transition helper — brief transition class on toggle ────────
    //    NavMenu sets this attribute; we remove it after the CSS transition ends
    const onThemeTrans = () => {
      const root = document.documentElement
      root.setAttribute('data-theme-trans', '')
      setTimeout(() => root.removeAttribute('data-theme-trans'), 380)
    }
    document.addEventListener('plumb:theme-toggle', onThemeTrans)

    // ── RAF loop ──────────────────────────────────────────────────────────
    let raf: number
    const tick = (t: number) => { lenis.raf(t); raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      clearInterval(refreshId)
      lenis.destroy()
      obs.disconnect()
      counters.disconnect()
      document.removeEventListener('plumb:theme-toggle', onThemeTrans)
    }
  }, [])

  return <>{children}</>
}
