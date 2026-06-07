import { useCallback, useEffect, useState } from 'react'
import { findWorkspaceWebview, type WorkspaceWebviewEl } from './workspacePlayback'

type NavWebviewEl = WorkspaceWebviewEl & {
  canGoBack?: () => boolean
  canGoForward?: () => boolean
  goBack?: () => void
  goForward?: () => void
  addEventListener?: (type: string, listener: (event: Event) => void) => void
  removeEventListener?: (type: string, listener: (event: Event) => void) => void
}

const NAV_EVENTS = [
  'navigation-state-changed',
  'did-navigate',
  'did-navigate-in-page',
  'did-start-navigation',
  'did-stop-loading'
] as const

function readNavState(webview: NavWebviewEl | null): { canGoBack: boolean; canGoForward: boolean } {
  if (!webview) return { canGoBack: false, canGoForward: false }
  try {
    return {
      canGoBack: webview.canGoBack?.() ?? false,
      canGoForward: webview.canGoForward?.() ?? false
    }
  } catch {
    return { canGoBack: false, canGoForward: false }
  }
}

export function useWebviewNavigation(tabId: string | null | undefined) {
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)

  useEffect(() => {
    if (!tabId) {
      setCanGoBack(false)
      setCanGoForward(false)
      return
    }

    let webview: NavWebviewEl | null = null
    let pollTimer: ReturnType<typeof setInterval> | null = null

    const applyState = (el: NavWebviewEl | null = findWorkspaceWebview(tabId) as NavWebviewEl | null) => {
      const state = readNavState(el)
      setCanGoBack(state.canGoBack)
      setCanGoForward(state.canGoForward)
    }

    const onNavChange = () => applyState()

    const detach = () => {
      if (!webview) return
      for (const type of NAV_EVENTS) {
        webview.removeEventListener?.(type, onNavChange)
      }
    }

    const attach = (el: NavWebviewEl | null) => {
      if (el === webview) {
        applyState(el)
        return
      }
      detach()
      webview = el
      if (!webview) {
        applyState(null)
        return
      }
      for (const type of NAV_EVENTS) {
        webview.addEventListener?.(type, onNavChange)
      }
      applyState(webview)
    }

    const resolveWebview = () => findWorkspaceWebview(tabId) as NavWebviewEl | null

    attach(resolveWebview())
    const t1 = window.setTimeout(() => attach(resolveWebview()), 100)
    const t2 = window.setTimeout(() => attach(resolveWebview()), 500)
    const t3 = window.setTimeout(() => attach(resolveWebview()), 1500)

    pollTimer = window.setInterval(() => applyState(), 400)

    return () => {
      detach()
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      if (pollTimer) clearInterval(pollTimer)
    }
  }, [tabId])

  const refreshNavState = useCallback(() => {
    if (!tabId) return
    const state = readNavState(findWorkspaceWebview(tabId) as NavWebviewEl | null)
    setCanGoBack(state.canGoBack)
    setCanGoForward(state.canGoForward)
  }, [tabId])

  const goBack = useCallback(() => {
    if (!tabId) return
    const webview = findWorkspaceWebview(tabId) as NavWebviewEl | null
    try {
      webview?.goBack?.()
    } catch {
      /* guest may not be ready */
    }
    window.setTimeout(refreshNavState, 0)
    window.setTimeout(refreshNavState, 120)
    window.setTimeout(refreshNavState, 400)
  }, [tabId, refreshNavState])

  const goForward = useCallback(() => {
    if (!tabId) return
    const webview = findWorkspaceWebview(tabId) as NavWebviewEl | null
    try {
      webview?.goForward?.()
    } catch {
      /* guest may not be ready */
    }
    window.setTimeout(refreshNavState, 0)
    window.setTimeout(refreshNavState, 120)
    window.setTimeout(refreshNavState, 400)
  }, [tabId, refreshNavState])

  return { canGoBack, canGoForward, goBack, goForward }
}
