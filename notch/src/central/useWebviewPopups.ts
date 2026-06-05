import { useEffect, type RefObject } from 'react'
import { isEmbedAuthPopupUrl } from './embedBrowse'
import { openBrowserLink } from '../lib/api'

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
      // Let Electron open Google/LinkedIn auth in-process (same session partition).
      if (isEmbedAuthPopupUrl(url)) return
      event.preventDefault?.()
      openBrowserLink(url)
    }

    el.addEventListener('new-window', onNewWindow)
    return () => el.removeEventListener('new-window', onNewWindow)
  }, [ref, enabled])
}
