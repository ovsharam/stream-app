import { useEffect, useRef, type RefObject } from 'react'
import type { EmbedBrowseKind } from './embedBrowse'
import {
  EMBED_BROWSE_PARTITIONS,
  isEmbedAuthPopupUrl,
  isGoogleDirectSignInUrl,
  isGoogleOAuthUrl
} from './embedBrowse'

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
    if (!hasNav && b.trim().length < 160) return 'signin';
  }
  return 'ok';
})();`

async function detectEmbedAuthState(el: WebviewEl): Promise<EmbedBrowseAuthState> {
  const current = el.getURL?.() ?? ''
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
  ref: RefObject<HTMLElement | null>,
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
    if (!opts.enabled || !opts.kind || !partition) return
    const el = ref.current as WebviewEl | null
    if (!el?.addEventListener) return

    const check = () => {
      void detectEmbedAuthState(el).then((state) => onAuthStateRef.current?.(state))
    }

    const interceptAuthNavigation = (event?: WebviewNavigateEvent) => {
      const url = event?.url
      if (!url || !isEmbedAuthPopupUrl(url)) return
      event?.preventDefault?.()
      onAuthStateRef.current?.('signin')
      if (opts.kind === 'google' && isGoogleDirectSignInUrl(url)) {
        onSignInNeededRef.current?.()
        return
      }
      if (opts.kind === 'google' && isGoogleOAuthUrl(url)) {
        void window.notchDesktop?.openAuthWindow?.({
          partition,
          url,
          title: 'Sign in to Google'
        })
        return
      }
      void window.notchDesktop?.openAuthWindow?.({
        partition,
        url,
        title: opts.kind === 'linkedin' ? 'Sign in to LinkedIn' : 'Sign in to Google'
      })
    }

    const onFailLoad = (event?: Event & { errorCode?: number }) => {
      // ERR_ABORTED (-3) — auth redirect intercepted in main process, webview stays blank.
      if (event?.errorCode === -3) onAuthStateRef.current?.('signin')
    }

    el.addEventListener('did-finish-load', check)
    el.addEventListener('did-navigate-in-page', check)
    el.addEventListener('did-fail-load', onFailLoad)
    el.addEventListener('will-navigate', interceptAuthNavigation)
    el.addEventListener('will-redirect', interceptAuthNavigation)
    const offAuth = window.notchDesktop?.onAuthClosed?.((closedPartition) => {
      if (closedPartition !== partition) return
      onAuthStateRef.current?.('ok')
      el.reload?.()
    })
    const offGoogleSignIn = window.notchDesktop?.onGoogleSignInNeeded?.((closedPartition) => {
      if (closedPartition !== partition) return
      onSignInNeededRef.current?.()
    })
    const offEmbedSignIn = window.notchDesktop?.onEmbedSignInNeeded?.((neededPartition) => {
      if (neededPartition !== partition) return
      onAuthStateRef.current?.('signin')
    })

    return () => {
      el.removeEventListener('did-finish-load', check)
      el.removeEventListener('did-navigate-in-page', check)
      el.removeEventListener('did-fail-load', onFailLoad)
      el.removeEventListener('will-navigate', interceptAuthNavigation)
      el.removeEventListener('will-redirect', interceptAuthNavigation)
      offAuth?.()
      offGoogleSignIn?.()
      offEmbedSignIn?.()
    }
  }, [ref, opts.enabled, opts.kind, partition])
}
