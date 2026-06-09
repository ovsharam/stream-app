import { useEffect, useRef } from 'react'
import type { EmbedBrowseKind } from './embedBrowse'
import { EMBED_BROWSE_PARTITIONS, isEmbedAuthPopupUrl, isGoogleBlockedAuthUrl } from './embedBrowse'

export type EmbedBrowseAuthState = 'ok' | 'signin' | 'blocked'

type WebviewEl = HTMLElement & {
  addEventListener(type: string, listener: (event?: WebviewNavigateEvent) => void): void
  removeEventListener(type: string, listener: (event?: WebviewNavigateEvent) => void): void
  getURL?(): string
  reload?(): void
  executeJavaScript?(code: string, userGesture?: boolean): Promise<unknown>
}

type WebviewNavigateEvent = Event & {
  url?: string
  preventDefault?: () => void
}

const AUTH_DETECT_JS = `(function() {
  const url = location.href;
  const t = (document.title || '').toLowerCase();
  const b = (document.body && document.body.innerText) || '';
  if (t.includes("couldn't sign you in") || b.includes('may not be secure')) return 'blocked';
  if (url.includes('accounts.google.com') || url.includes('linkedin.com/login') || url.includes('linkedin.com/checkpoint') || url.includes('linkedin.com/authwall') || url.includes('linkedin.com/uas/')) return 'signin';
  if (b.includes('Sign in to continue') || b.includes('Email or phone') || b.includes('Sign in with email') || b.includes('Join LinkedIn')) return 'signin';
  if (document.querySelector('input[type="email"], input[name="identifier"], input[name="session_key"]')) return 'signin';
  if (url.includes('linkedin.com') && (url.includes('/feed') || /linkedin\\.com\\/?$/.test(url.replace(/\\/$/, '')))) {
    const hasNav = document.querySelector('header#global-nav, nav[aria-label="Primary"], [data-global-nav]');
    if (!hasNav && document.readyState !== 'complete' && b.trim().length < 80) return 'signin';
  }
  return 'ok';
})();`

function safeWebviewUrl(el: WebviewEl): string {
  try {
    return el.getURL?.() ?? ''
  } catch {
    return ''
  }
}

async function detectEmbedAuthState(el: WebviewEl): Promise<EmbedBrowseAuthState> {
  const current = safeWebviewUrl(el)
  if (
    current.includes('accounts.google.com') ||
    current.includes('linkedin.com/login') ||
    current.includes('linkedin.com/checkpoint') ||
    current.includes('linkedin.com/authwall') ||
    current.includes('linkedin.com/uas/')
  ) {
    try {
      const state = await el.executeJavaScript?.(AUTH_DETECT_JS, true)
      if (state === 'blocked' || state === 'signin') return state
      return 'signin'
    } catch {
      return 'signin'
    }
  }
  try {
    const state = await el.executeJavaScript?.(AUTH_DETECT_JS, true)
    if (state === 'blocked' || state === 'signin') return state
  } catch {
    /* ignore */
  }
  return 'ok'
}

export function useEmbedBrowseSignIn(
  el: HTMLElement | null,
  opts: {
    enabled: boolean
    kind: EmbedBrowseKind | null
    onAuthState?: (state: EmbedBrowseAuthState) => void
    onSignInNeeded?: () => void
  }
) {
  const onAuthStateRef = useRef(opts.onAuthState)
  onAuthStateRef.current = opts.onAuthState
  const onSignInNeededRef = useRef(opts.onSignInNeeded)
  onSignInNeededRef.current = opts.onSignInNeeded
  const partition = opts.kind ? EMBED_BROWSE_PARTITIONS[opts.kind] : null

  useEffect(() => {
    const webview = el as WebviewEl | null
    if (!opts.enabled || !opts.kind || !partition || !webview?.addEventListener) return

    let checkTimer: ReturnType<typeof setTimeout> | null = null
    const check = () => {
      if (checkTimer) window.clearTimeout(checkTimer)
      checkTimer = window.setTimeout(() => {
        checkTimer = null
        void detectEmbedAuthState(webview).then((state) => onAuthStateRef.current?.(state))
      }, opts.kind === 'linkedin' ? 800 : 200)
    }

    const interceptAuthNavigation = (event?: WebviewNavigateEvent) => {
      const url = event?.url
      if (!url || !isEmbedAuthPopupUrl(url)) return
      event?.preventDefault?.()
      if (opts.kind === 'google' && isGoogleBlockedAuthUrl(url)) {
        onAuthStateRef.current?.('blocked')
        return
      }
      onAuthStateRef.current?.('signin')
      void window.notchDesktop?.openAuthWindow?.({
        partition,
        url,
        title: opts.kind === 'linkedin' ? 'Sign in to LinkedIn' : 'Sign in to Google'
      })
    }

    const onStartNavigation = (event?: WebviewNavigateEvent) => {
      const url = event?.url
      if (!url || !isGoogleBlockedAuthUrl(url)) return
      onAuthStateRef.current?.('blocked')
    }

    const onFailLoad = (event?: Event & { errorCode?: number }) => {
      // ERR_ABORTED (-3) — auth redirect intercepted in main process, webview stays blank.
      if (event?.errorCode === -3) onAuthStateRef.current?.('signin')
    }

    webview.addEventListener('did-finish-load', check)
    if (opts.kind !== 'linkedin') {
      webview.addEventListener('did-navigate-in-page', check)
    }
    webview.addEventListener('did-fail-load', onFailLoad)
    webview.addEventListener('will-navigate', interceptAuthNavigation)
    webview.addEventListener('will-redirect', interceptAuthNavigation)
    webview.addEventListener('did-start-navigation', onStartNavigation)
    let authReloadPending = false
    const offAuth = window.notchDesktop?.onAuthClosed?.((closedPartition) => {
      if (closedPartition !== partition || authReloadPending) return
      authReloadPending = true
      onAuthStateRef.current?.('ok')
      window.setTimeout(() => {
        authReloadPending = false
        webview.reload?.()
      }, 400)
    })
    const offEmbedSignIn = window.notchDesktop?.onEmbedSignInNeeded?.((neededPartition) => {
      if (neededPartition !== partition) return
      onAuthStateRef.current?.(opts.kind === 'google' ? 'blocked' : 'signin')
    })
    const offAuthFallback = window.notchDesktop?.onAuthExternalFallback?.((fallbackPartition) => {
      if (fallbackPartition !== partition) return
      onAuthStateRef.current?.('blocked')
    })

    return () => {
      if (checkTimer) window.clearTimeout(checkTimer)
      webview.removeEventListener('did-finish-load', check)
      if (opts.kind !== 'linkedin') {
        webview.removeEventListener('did-navigate-in-page', check)
      }
      webview.removeEventListener('did-fail-load', onFailLoad)
      webview.removeEventListener('will-navigate', interceptAuthNavigation)
      webview.removeEventListener('will-redirect', interceptAuthNavigation)
      webview.removeEventListener('did-start-navigation', onStartNavigation)
      offAuth?.()
      offEmbedSignIn?.()
      offAuthFallback?.()
    }
  }, [el, opts.enabled, opts.kind, partition])
}
