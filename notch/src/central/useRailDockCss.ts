import { useEffect } from 'react'
import { applyRailDockCssVars, loadRailDock, RAIL_WIDTH_DEFAULT } from './railDockStore'

export function useRailDockCss(): void {
  useEffect(() => {
    applyRailDockCssVars(loadRailDock())

    const refresh = () => applyRailDockCssVars(loadRailDock())
    window.addEventListener('notch:rail-dock-updated', refresh)
    return () => {
      window.removeEventListener('notch:rail-dock-updated', refresh)
      document.documentElement.style.setProperty('--x-rail-w', `${RAIL_WIDTH_DEFAULT}px`)
    }
  }, [])
}
