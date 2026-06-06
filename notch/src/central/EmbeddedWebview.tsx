import { useCallback, useEffect, useRef, useState } from 'react'
import { useWebviewPopups } from './useWebviewPopups'
import { useEmbedBrowseSignIn, type EmbedBrowseAuthState } from './useEmbedBrowseSignIn'
import { workspaceUrlsEquivalent, type EmbedBrowseKind } from './embedBrowse'

type Props = {
  className?: string
  src: string
  partition: string
  embedBrowseKind?: EmbedBrowseKind | null
  reloadNonce?: number
  onEmbedAuthState?: (state: EmbedBrowseAuthState) => void
  onSignInNeeded?: () => void
  onLocationChange?: (url: string) => void
}

type WebviewEl = HTMLElement & {
  reload?: () => void
  getURL?: () => string
  loadURL?: (url: string) => void
}

export function EmbeddedWebview({
  className,
  src,
  partition,
  embedBrowseKind,
  reloadNonce = 0,
  onEmbedAuthState,
  onSignInNeeded,
  onLocationChange
}: Props) {
  const [webviewEl, setWebviewEl] = useState<HTMLElement | null>(null)
  const [domReady, setDomReady] = useState(false)
  const [guestPreload, setGuestPreload] = useState('')
  /** First src for this mount — React must not re-set webview src on every parent re-render. */
  const initialSrcRef = useRef(src)
  /** Last URL emitted from webview navigation (address-bar sync only, no reload). */
  const lastEmittedUrlRef = useRef<string | null>(null)

  const onWebviewRef = useCallback((node: HTMLElement | null) => {
    setWebviewEl(node)
  }, [])

  useWebviewPopups(webviewEl)
  useEmbedBrowseSignIn(webviewEl, {
    enabled: Boolean(webviewEl && domReady && embedBrowseKind),
    kind: embedBrowseKind ?? null,
    onAuthState: onEmbedAuthState,
    onSignInNeeded
  })

  useEffect(() => {
    if (!webviewEl) {
      setDomReady(false)
      return
    }
    const webview = webviewEl as WebviewEl
    const onDomReady = () => setDomReady(true)
    webview.addEventListener('dom-ready', onDomReady)
    return () => {
      webview.removeEventListener('dom-ready', onDomReady)
      setDomReady(false)
    }
  }, [webviewEl])

  function safeGetUrl(webview: WebviewEl): string {
    if (!domReady) return ''
    try {
      return webview.getURL?.() ?? ''
    } catch {
      return ''
    }
  }

  useEffect(() => {
    if (!embedBrowseKind) return
    const getter = window.notchDesktop?.getGuestPreloadPath
    if (!getter) return
    void getter()
      .then((path) => {
        if (path) setGuestPreload(path)
      })
      .catch(() => {
        /* mount without preload */
      })
  }, [embedBrowseKind])

  useEffect(() => {
    if (!reloadNonce || !domReady) return
    const el = webviewEl as WebviewEl | null
    lastEmittedUrlRef.current = null
    el?.reload?.()
  }, [reloadNonce, webviewEl, domReady])

  /** Explicit navigation (address bar) — skip reload when change came from in-page webview sync. */
  useEffect(() => {
    if (!webviewEl || !domReady || !src.startsWith('http')) return
    const webview = webviewEl as WebviewEl
    const current = safeGetUrl(webview)

    if (lastEmittedUrlRef.current && workspaceUrlsEquivalent(src, lastEmittedUrlRef.current)) {
      return
    }
    if (current.startsWith('http') && workspaceUrlsEquivalent(src, current)) {
      return
    }
    // First load is driven by the static src attribute on <webview>.
    if (!current.startsWith('http') && workspaceUrlsEquivalent(src, initialSrcRef.current)) {
      return
    }

    if (typeof webview.loadURL === 'function') {
      webview.loadURL(src)
    } else {
      webview.setAttribute('src', src)
    }
    lastEmittedUrlRef.current = null
  }, [src, webviewEl, domReady])

  useEffect(() => {
    if (!webviewEl || !onLocationChange) return
    const webview = webviewEl as WebviewEl

    const sync = (event?: Event) => {
      const fromEvent = (event as Event & { url?: string } | undefined)?.url
      const next = fromEvent ?? safeGetUrl(webview)
      if (!next?.startsWith('http')) return
      lastEmittedUrlRef.current = next
      onLocationChange(next)
    }

    webview.addEventListener('did-navigate', sync)
    webview.addEventListener('did-navigate-in-page', sync)
    return () => {
      webview.removeEventListener('did-navigate', sync)
      webview.removeEventListener('did-navigate-in-page', sync)
    }
  }, [webviewEl, onLocationChange])

  return (
    <webview
      ref={onWebviewRef}
      className={className}
      src={initialSrcRef.current}
      partition={partition}
      {...(guestPreload ? { preload: guestPreload } : {})}
      allowpopups="true"
      webpreferences="contextIsolation=yes,nativeWindowOpen=yes,javascript=yes"
    />
  )
}
