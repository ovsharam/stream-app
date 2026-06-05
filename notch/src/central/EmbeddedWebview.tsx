import { useEffect, useRef, useState, type RefObject } from 'react'
import { useWebviewPopups } from './useWebviewPopups'
import { useEmbedBrowseSignIn, type EmbedBrowseAuthState } from './useEmbedBrowseSignIn'
import type { EmbedBrowseKind } from './embedBrowse'

type Props = {
  className?: string
  src: string
  partition: string
  embedBrowseKind?: EmbedBrowseKind | null
  onEmbedAuthState?: (state: EmbedBrowseAuthState) => void
  onSignInNeeded?: () => void
}

export function EmbeddedWebview({
  className,
  src,
  partition,
  embedBrowseKind,
  onEmbedAuthState,
  onSignInNeeded
}: Props) {
  const ref = useRef<HTMLElement>(null)
  const needsGuestPreload = Boolean(embedBrowseKind)
  const [guestPreload, setGuestPreload] = useState<string | null>(needsGuestPreload ? null : '')
  // Guest-preload gate renders a placeholder first; only wire webview listeners after mount.
  const webviewMounted = !needsGuestPreload || guestPreload !== null

  useWebviewPopups(ref, webviewMounted)
  useEmbedBrowseSignIn(ref, {
    enabled: webviewMounted && Boolean(embedBrowseKind),
    kind: embedBrowseKind ?? null,
    onAuthState: onEmbedAuthState,
    onSignInNeeded
  })

  useEffect(() => {
    if (!embedBrowseKind) return
    void window.notchDesktop?.getGuestPreloadPath?.()?.then((path) => {
      setGuestPreload(path ?? '')
    })
  }, [embedBrowseKind])

  if (needsGuestPreload && guestPreload === null) {
    return <div className={className} aria-busy="true" aria-label="Loading" />
  }

  return (
    <webview
      ref={ref as RefObject<HTMLElement>}
      className={className}
      src={src}
      partition={partition}
      {...(guestPreload ? { preload: guestPreload } : {})}
      allowpopups="true"
      webpreferences="contextIsolation=yes,nativeWindowOpen=yes,javascript=yes"
    />
  )
}
