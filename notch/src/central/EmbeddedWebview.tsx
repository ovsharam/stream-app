import { useCallback, useEffect, useState } from 'react'
import { useWebviewPopups } from './useWebviewPopups'
import { useEmbedBrowseSignIn, type EmbedBrowseAuthState } from './useEmbedBrowseSignIn'
import type { EmbedBrowseKind } from './embedBrowse'

type Props = {
  className?: string
  src: string
  partition: string
  embedBrowseKind?: EmbedBrowseKind | null
  reloadNonce?: number
  onEmbedAuthState?: (state: EmbedBrowseAuthState) => void
  onSignInNeeded?: () => void
}

type WebviewEl = HTMLElement & { reload?: () => void }

export function EmbeddedWebview({
  className,
  src,
  partition,
  embedBrowseKind,
  reloadNonce = 0,
  onEmbedAuthState,
  onSignInNeeded
}: Props) {
  const [webviewEl, setWebviewEl] = useState<HTMLElement | null>(null)
  const [guestPreload, setGuestPreload] = useState('')

  const onWebviewRef = useCallback((node: HTMLElement | null) => {
    setWebviewEl(node)
  }, [])

  useWebviewPopups(webviewEl)
  useEmbedBrowseSignIn(webviewEl, {
    enabled: Boolean(webviewEl && embedBrowseKind),
    kind: embedBrowseKind ?? null,
    onAuthState: onEmbedAuthState,
    onSignInNeeded
  })

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
    if (!reloadNonce) return
    const el = webviewEl as WebviewEl | null
    el?.reload?.()
  }, [reloadNonce, webviewEl])

  return (
    <webview
      ref={onWebviewRef}
      className={className}
      src={src}
      partition={partition}
      {...(guestPreload ? { preload: guestPreload } : {})}
      allowpopups="true"
      webpreferences="contextIsolation=yes,nativeWindowOpen=yes,javascript=yes"
    />
  )
}
