'use client'

import { useEffect } from 'react'

export function ScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>('.reveal')

    // Mark everything as will-animate (becomes invisible).
    // Only do this now — after first paint — so SSR render is always visible.
    els.forEach(el => el.classList.add('will-animate'))

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('in-view')
            observer.unobserve(e.target)
          }
        })
      },
      { rootMargin: '-40px', threshold: 0.01 }
    )

    // Small delay so browser paints the will-animate state before observing,
    // otherwise elements already in viewport snap in with no animation.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        els.forEach(el => observer.observe(el))
      })
    })

    return () => observer.disconnect()
  }, [])

  return null
}
