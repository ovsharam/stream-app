'use client'
// Scroll reveal observer — wires .reveal-up / .reveal-left via IntersectionObserver
import { useEffect } from 'react'

export function PlumberBob() {
  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target) }
      })
    }, { threshold: 0.12 })
    document.querySelectorAll('.reveal-up, .reveal-left').forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [])
  return null
}
