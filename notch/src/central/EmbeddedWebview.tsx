import { useCallback, useEffect, useRef, useState } from 'react'
import { useWebviewPopups } from './useWebviewPopups'
import { useWebviewResizeSync } from './useWebviewResizeSync'
import { useEmbedBrowseSignIn, type EmbedBrowseAuthState } from './useEmbedBrowseSignIn'
import {
  ingestFromHits,
  LINKEDIN_OBSERVER_INSTALL_JS,
  type LinkedInScanHit,
  useLinkedInAgentPoll
} from './useLinkedInAgentPoll'
import { workspaceUrlsEquivalent, LINKEDIN_MESSAGING_URL, type EmbedBrowseKind } from './embedBrowse'
import { useLinkedInPerceptionBackground } from './LinkedInPerceptionContext'

type Props = {
  className?: string
  src: string
  partition: string
  dataTabId?: string
  embedBrowseKind?: EmbedBrowseKind | null
  reloadNonce?: number
  onEmbedAuthState?: (state: EmbedBrowseAuthState) => void
  onSignInNeeded?: () => void
  onLocationChange?: (url: string) => void
  /** background = hidden messaging watcher; off = skip (background handles it) */
  agentPerceptionMode?: 'background' | 'off'
}

type WebviewEl = HTMLElement & {
  reload?: () => void
  getURL?: () => string
  loadURL?: (url: string) => void
  executeJavaScript?: (code: string, userGesture?: boolean) => Promise<unknown>
  addEventListener?: (type: string, listener: (event: Event) => void) => void
  removeEventListener?: (type: string, listener: (event: Event) => void) => void
}

function urlsSameDocument(a: string, b: string): boolean {
  if (a === b) return true
  try {
    return new URL(a).href === new URL(b).href
  } catch {
    return false
  }
}

export function EmbeddedWebview({
  className,
  src,
  partition,
  dataTabId,
  embedBrowseKind,
  reloadNonce = 0,
  onEmbedAuthState,
  onSignInNeeded,
  onLocationChange,
  agentPerceptionMode
}: Props) {
  const linkedInPerceptionBackground = useLinkedInPerceptionBackground()
  const perceptionBackground = agentPerceptionMode === 'background'
  const perceptionEnabled =
    embedBrowseKind === 'linkedin' &&
    (perceptionBackground || (agentPerceptionMode !== 'off' && !linkedInPerceptionBackground))
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
  const linkedInSeenRef = useRef<Set<string>>(new Set())

  useWebviewPopups(webviewEl)
  useWebviewResizeSync(webviewEl, Boolean(webviewEl && domReady))
  useEmbedBrowseSignIn(webviewEl, {
    enabled: Boolean(webviewEl && domReady && embedBrowseKind),
    kind: embedBrowseKind ?? null,
    onAuthState: onEmbedAuthState,
    onSignInNeeded
  })

  useLinkedInAgentPoll(webviewEl, {
    enabled: Boolean(webviewEl && domReady && perceptionEnabled),
    backgroundMode: perceptionBackground
  })

  useEffect(() => {
    const webview = webviewEl as WebviewEl | null
    if (!webview || !domReady || !perceptionEnabled) return

    const onIpcMessage = (event: Event) => {
      const detail = event as Event & { channel?: string; args?: unknown[] }
      if (detail.channel !== 'linkedin:hits' || !Array.isArray(detail.args?.[0])) return
      void ingestFromHits(webview, detail.args[0] as LinkedInScanHit[], linkedInSeenRef.current)
    }

    webview.addEventListener?.('ipc-message', onIpcMessage)
    return () => webview.removeEventListener?.('ipc-message', onIpcMessage)
  }, [webviewEl, domReady, embedBrowseKind])

  useEffect(() => {
    const webview = webviewEl as WebviewEl | null
    if (!webview?.executeJavaScript || !domReady || !perceptionEnabled) return
    const url = safeGetUrl(webview)
    if (!url.includes('linkedin.com')) return
    void webview.executeJavaScript(LINKEDIN_OBSERVER_INSTALL_JS, true).catch(() => {
      /* preload may have installed observer already */
    })
  }, [webviewEl, domReady, embedBrowseKind, src])

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

  /** Explicit navigation (address bar) — never loadURL for guest-initiated navigations. */
  useEffect(() => {
    if (!webviewEl || !domReady || !src.startsWith('http')) return
    const webview = webviewEl as WebviewEl
    const current = safeGetUrl(webview)

    if (lastEmittedUrlRef.current && urlsSameDocument(src, lastEmittedUrlRef.current)) {
      return
    }
    if (current.startsWith('http') && urlsSameDocument(src, current)) {
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

  useEffect(() => {
    if (!webviewEl || !dataTabId) return
    webviewEl.setAttribute('data-workspace-tab-id', dataTabId)
  }, [webviewEl, dataTabId])

  return (
    <webview
      ref={onWebviewRef}
      className={className}
      src={initialSrcRef.current}
      partition={partition}
      {...(dataTabId ? { 'data-workspace-tab-id': dataTabId } : {})}
      {...(guestPreload ? { preload: guestPreload } : {})}
      allowpopups="true"
      webpreferences="contextIsolation=yes,nativeWindowOpen=yes,javascript=yes"
    />
  )
}
