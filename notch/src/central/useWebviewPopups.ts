import { useEffect, type RefObject } from 'react'

type WebviewEl = HTMLElement & {
  addEventListener(type: 'new-window', listener: (e: WebviewNewWindowEvent) => void): void
  removeEventListener(type: 'new-window', listener: (e: WebviewNewWindowEvent) => void): void
  loadURL?(url: string): void
  getURL?(): string
}

type WebviewNewWindowEvent = Event & {
  url?: string
  preventDefault?: () => void
  newGuest?: WebviewEl
}

/** Wire popup / OAuth windows for Electron <webview> (YouTube login, etc.). */
export function useWebviewPopups(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const el = ref.current as WebviewEl | null
    if (!el?.addEventListener) return

    const onNewWindow = (event: WebviewNewWindowEvent) => {
      const url = event.url
      if (!url || !/^https?:\/\//i.test(url)) return
      event.preventDefault?.()
      // Guest popup from allowpopups — load in same webview when Electron doesn't spawn a window.
      if (typeof el.loadURL === 'function') {
        el.loadURL(url)
        return
      }
      if (event.newGuest && typeof event.newGuest.loadURL === 'function') {
        event.newGuest.loadURL(url)
      }
    }

    el.addEventListener('new-window', onNewWindow)
    return () => el.removeEventListener('new-window', onNewWindow)
  }, [ref, enabled])
}
