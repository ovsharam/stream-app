import { useEffect, useRef, type RefObject } from 'react'
import type { NavApp } from './navAppsStore'
import { isNavAppDesktop } from './navAppsStore'
import type { NavAppPlayerMode } from './NavAppPlayer'

type Bounds = { x: number; y: number; width: number; height: number }

export function useNavAppBrowserView(
  containerRef: RefObject<HTMLElement | null>,
  app: NavApp | null,
  mode: NavAppPlayerMode
) {
  const modeRef = useRef(mode)
  modeRef.current = mode

  // Suspend (detach) only — destroy is reserved for closeNavApp so playback
  // checks during dockNavAppMini are not racing a torn-down BrowserView.
  useEffect(() => {
    if (mode !== 'off') return
    void window.notchDesktop?.hideNavApp?.()
  }, [mode])

  useEffect(() => {
    if (!isNavAppDesktop() || !app) return

    const partition = `persist:nav-app-${app.id}`
    let raf = 0

    const sync = () => {
      if (modeRef.current === 'off') return
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => {
          const el = containerRef.current
          if (!el || modeRef.current === 'off') return
          const rect = el.getBoundingClientRect()
          if (rect.width < 1 || rect.height < 1) return
          const bounds: Bounds = {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          }
          const layout = modeRef.current === 'mini' ? 'mini' : 'full'
          void window.notchDesktop?.showNavApp?.({ partition, url: app.url, bounds, layout })
        })
      })
    }

    sync()
    const ro = new ResizeObserver(sync)
    if (containerRef.current) ro.observe(containerRef.current)
    window.addEventListener('resize', sync)
    window.addEventListener('scroll', sync, true)

    const unsubReady = window.notchDesktop?.onNavAppRendererReady?.(() => sync())

    const unsubAuth = window.notchDesktop?.onAuthClosed?.((closedPartition) => {
      if (closedPartition === partition) void window.notchDesktop?.reloadNavApp?.()
    })

    return () => {
      cancelAnimationFrame(raf)
      unsubReady?.()
      unsubAuth?.()
      ro.disconnect()
      window.removeEventListener('resize', sync)
      window.removeEventListener('scroll', sync, true)
    }
  }, [app?.id, app?.url, containerRef])

  // Re-sync bounds when switching full ↔ mini without tearing down the view.
  useEffect(() => {
    if (!isNavAppDesktop() || !app || mode === 'off') return
    const el = containerRef.current
    if (!el) return
    const partition = `persist:nav-app-${app.id}`
    let raf = 0
    raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect()
        if (rect.width < 1 || rect.height < 1) return
        const layout = mode === 'mini' ? 'mini' : 'full'
        void window.notchDesktop?.showNavApp?.({
          partition,
          url: app.url,
          bounds: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          },
          layout
        })
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [mode, app?.id, app?.url, containerRef])
}
