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

    const applyState = (el: NavWebviewEl | null) => {
      const state = readNavState(el)
      setCanGoBack(state.canGoBack)
      setCanGoForward(state.canGoForward)
    }

    const onNavChange = () => applyState(findWorkspaceWebview(tabId) as NavWebviewEl | null)

    const attach = (el: NavWebviewEl | null) => {
      if (el === webview) {
        applyState(el)
        return
      }
      webview?.removeEventListener?.('navigation-state-changed', onNavChange)
      webview = el
      webview?.addEventListener?.('navigation-state-changed', onNavChange)
      applyState(el)
    }

    attach(findWorkspaceWebview(tabId) as NavWebviewEl | null)
    const t1 = window.setTimeout(() => attach(findWorkspaceWebview(tabId) as NavWebviewEl | null), 100)
    const t2 = window.setTimeout(() => attach(findWorkspaceWebview(tabId) as NavWebviewEl | null), 500)
    const t3 = window.setTimeout(() => attach(findWorkspaceWebview(tabId) as NavWebviewEl | null), 1500)

    return () => {
      webview?.removeEventListener?.('navigation-state-changed', onNavChange)
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [tabId])

  const goBack = useCallback(() => {
    if (!tabId) return
    ;(findWorkspaceWebview(tabId) as NavWebviewEl | null)?.goBack?.()
  }, [tabId])

  const goForward = useCallback(() => {
    if (!tabId) return
    ;(findWorkspaceWebview(tabId) as NavWebviewEl | null)?.goForward?.()
  }, [tabId])

  return { canGoBack, canGoForward, goBack, goForward }
}
