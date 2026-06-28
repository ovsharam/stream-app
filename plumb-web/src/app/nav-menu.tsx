'use client'

import { useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { PlumbLogo } from './plumb-logo'

export function NavMenu() {
  const [open, setOpen]   = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const ref = useRef<HTMLDivElement>(null)

  // Hydrate from localStorage — defensive: some browsers block storage access
  useEffect(() => {
    try {
      const saved = (localStorage.getItem('plumb-theme') ?? 'dark') as 'dark' | 'light'
      setTheme(saved)
      document.documentElement.setAttribute('data-theme', saved)
    } catch {
      // storage blocked — stay dark
    }
  }, [])

  // Close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    try { localStorage.setItem('plumb-theme', next) } catch { /* blocked */ }
    // Signal smooth-scroll to apply brief CSS transition class
    document.dispatchEvent(new CustomEvent('plumb:theme-toggle'))
  }

  function scrollHome() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setOpen(false)
  }

  const isDark = theme === 'dark'

  return (
    <div ref={ref} style={{ position: 'relative', zIndex: 110 }}>
      <button
        aria-label="Site menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '2px 4px 2px 0', display: 'flex', alignItems: 'center',
          borderRadius: 4, outline: 'none',
        }}
      >
        <PlumbLogo size={18} light={isDark} />
      </button>

      {open && (
        <div role="menu" style={{
          position: 'absolute',
          top: 'calc(100% + 10px)', left: 0,
          background: 'rgba(11,11,11,0.97)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 9,
          padding: '5px',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          minWidth: 172,
          boxShadow: '0 12px 40px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3)',
        }}>
          <DropItem icon={<IconHome />} label="Home" onClick={scrollHome} />
          <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '3px 0' }} />
          <DropItem
            icon={isDark ? <IconSun /> : <IconMoon />}
            label={isDark ? 'Light mode' : 'Dark mode'}
            onClick={toggleTheme}
          />
        </div>
      )}
    </div>
  )
}

function DropItem({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      role="menuitem"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 9,
        width: '100%', padding: '8px 11px',
        background: hov ? 'rgba(255,255,255,0.08)' : 'transparent',
        border: 'none', borderRadius: 6, cursor: 'pointer',
        color: hov ? '#fff' : 'rgba(255,255,255,0.65)',
        fontSize: 12.5, fontWeight: 500, letterSpacing: '0.005em',
        fontFamily: 'var(--font-inter), system-ui, sans-serif',
        textAlign: 'left',
        transition: 'background 0.12s, color 0.12s',
      }}
    >
      <span style={{ width: 16, display: 'flex', justifyContent: 'center', opacity: 0.78 }}>{icon}</span>
      {label}
    </button>
  )
}

function IconHome() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M1 6L6.5 1 12 6v6.5H8.5V9h-4v3.5H1V6z"
        stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  )
}

function IconSun() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <circle cx="6.5" cy="6.5" r="2.2" stroke="currentColor" strokeWidth="1.15"/>
      <path d="M6.5 1v1.3M6.5 10.7V12M1 6.5h1.3M10.7 6.5H12M2.75 2.75l.92.92M9.33 9.33l.92.92M2.75 10.25l.92-.92M9.33 3.67l.92-.92"
        stroke="currentColor" strokeWidth="1.15" strokeLinecap="round"/>
    </svg>
  )
}

function IconMoon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M11.5 8.5A5 5 0 014.5 1.5a5 5 0 100 10 5 5 0 007-3z"
        stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round"/>
    </svg>
  )
}
