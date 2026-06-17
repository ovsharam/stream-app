import { useEffect } from 'react'

export type WorkspaceWebviewEl = HTMLElement & {
  executeJavaScript?: (code: string, userGesture?: boolean) => Promise<unknown>
  getWebContentsId?: () => number
}

/** Electron webviews often render black until guest size is nudged after container resize. */
export function forceWebviewRepaint(webview: WorkspaceWebviewEl | null): void {
  if (!webview) return

  const host =
    (webview.closest('.x-browser-main') as HTMLElement | null) ??
    (webview.closest('.x-workspace-media-layer--mini') as HTMLElement | null) ??
    (webview.closest('.x-workspace-mini-target') as HTMLElement | null) ??
    (webview.closest('.x-workspace') as HTMLElement | null) ??
    webview.parentElement

  if (!host) return

  const sync = () => {
    const rect = host.getBoundingClientRect()
    const w = Math.max(2, Math.floor(rect.width))
    const h = Math.max(2, Math.floor(rect.height))
    if (w < 2 || h < 2) return

    const prevDisplay = webview.style.display
    webview.style.display = 'none'
    void webview.offsetHeight
    webview.style.display = prevDisplay || 'inline-flex'
    webview.style.width = `${w - 1}px`
    webview.style.height = `${h - 1}px`

    requestAnimationFrame(() => {
      webview.style.width = `${w}px`
      webview.style.height = `${h}px`
      window.dispatchEvent(new Event('resize'))
      void webview.executeJavaScript?.(
        `(function() {
          window.dispatchEvent(new Event('resize'));
          const v =
            document.querySelector('video.html5-main-video') ||
            document.querySelector('#movie_player video') ||
            document.querySelector('video');
          if (v) v.play?.().catch(function() {});
        })();`,
        true
      )
    })
  }

  sync()
  requestAnimationFrame(sync)
  window.setTimeout(sync, 50)
  window.setTimeout(sync, 200)
  window.setTimeout(sync, 500)
}

export function repaintAllWorkspaceWebviews(): void {
  if (typeof document === 'undefined') return
  document.querySelectorAll('webview[data-workspace-tab-id]').forEach((node) => {
    forceWebviewRepaint(node as WorkspaceWebviewEl)
  })
}

function resizeHostsForWebview(webview: WorkspaceWebviewEl): HTMLElement[] {
  const seen = new Set<HTMLElement>()
  const add = (el: Element | null) => {
    if (el instanceof HTMLElement && !seen.has(el)) seen.add(el)
  }
  add(webview.closest('.x-browser-main'))
  add(webview.closest('.x-channel-main'))
  add(webview.closest('.x-browser-shell'))
  add(webview.closest('.x-workspace'))
  add(webview.parentElement)
  return [...seen]
}

export function useWebviewResizeSync(webviewEl: HTMLElement | null, enabled: boolean): void {
  useEffect(() => {
    if (!webviewEl || !enabled) return

    const webview = webviewEl as WorkspaceWebviewEl
    const hosts = resizeHostsForWebview(webview)
    if (hosts.length === 0) return

    const onResize = () => forceWebviewRepaint(webview)
    const observer = new ResizeObserver(onResize)
    for (const host of hosts) observer.observe(host)
    onResize()

    return () => observer.disconnect()
  }, [webviewEl, enabled])
}
