import { useCallback, useRef } from 'react'
import { RAIL_WIDTH_MAX, RAIL_WIDTH_MIN, setRailWidth } from './railDockStore'

export function RailResizeHandle() {
  const dragging = useRef(false)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    const startX = e.clientX
    const startWidth = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--x-rail-w'),
      10
    )

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const delta = startX - ev.clientX
      setRailWidth(startWidth + delta)
    }

    const onUp = () => {
      dragging.current = false
      document.body.classList.remove('x-rail-resizing')
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.body.classList.add('x-rail-resizing')
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  return (
    <div
      className="x-rail-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize side panel"
      title="Drag to resize"
      onMouseDown={onMouseDown}
    />
  )
}

export function railWidthLabel(width: number): string {
  return `${Math.min(RAIL_WIDTH_MAX, Math.max(RAIL_WIDTH_MIN, width))}px`
}
