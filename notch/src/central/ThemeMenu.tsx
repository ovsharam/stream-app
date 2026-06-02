import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { THEMES, type ThemeId } from './useTheme'

type Props = {
  open: boolean
  theme: ThemeId
  setTheme: (id: ThemeId) => void
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
}

export function ThemeMenu({ open, theme, setTheme, anchorRef, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [ready, setReady] = useState(false)

  useLayoutEffect(() => {
    if (!open) {
      setReady(false)
      return
    }
    if (!anchorRef.current || !menuRef.current) return

    const anchor = anchorRef.current.getBoundingClientRect()
    const menu = menuRef.current.getBoundingClientRect()
    const gap = 12
    const pad = 12

    let left = anchor.right + gap
    let top = anchor.top + anchor.height / 2 - menu.height / 2

    if (left + menu.width > window.innerWidth - pad) {
      left = anchor.left - menu.width - gap
    }
    top = Math.max(pad, Math.min(top, window.innerHeight - menu.height - pad))

    setPos({ top, left })
    setReady(true)
  }, [open, anchorRef, theme])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const pick = (id: ThemeId) => {
    setTheme(id)
    onClose()
  }

  return createPortal(
    <>
      <button type="button" className="x-theme-backdrop" aria-label="Close appearance menu" onClick={onClose} />
      <div
        ref={menuRef}
        className={`x-theme-menu ${ready ? 'x-theme-menu-ready' : ''}`}
        style={{ top: pos.top, left: pos.left }}
        role="dialog"
        aria-label="Appearance"
      >
        <p className="x-theme-menu-title">Appearance</p>
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`x-theme-option ${theme === t.id ? 'active' : ''}`}
            onClick={() => pick(t.id)}
          >
            <span className={`x-theme-swatch x-theme-swatch-${t.id}`} aria-hidden />
            <span className="x-theme-option-label">{t.label}</span>
            {theme === t.id && <span className="x-theme-check" aria-hidden>✓</span>}
          </button>
        ))}
      </div>
    </>,
    document.body
  )
}
