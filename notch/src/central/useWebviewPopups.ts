import { useEffect } from 'react'
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
export function useWebviewPopups(el: HTMLElement | null) {
  useEffect(() => {
    const webview = el as WebviewEl | null
    if (!webview?.addEventListener) return

    const onNewWindow = (event: WebviewNewWindowEvent) => {
      const url = event.url
      if (!url || !/^https?:\/\//i.test(url)) return
      // Let Electron open Google/LinkedIn auth in-process (same session partition).
      if (isEmbedAuthPopupUrl(url)) return
      event.preventDefault?.()
      openBrowserLink(url)
    }

    webview.addEventListener('new-window', onNewWindow)
    return () => webview.removeEventListener('new-window', onNewWindow)
  }, [el])
}
