import { useCallback, useEffect, useState } from 'react'
import { openBrowserLink } from '../lib/api'
import type { WorkspaceTab } from './workspace'
import { EmbeddedWebview } from './EmbeddedWebview'
import {
  EMBED_BROWSE_PARTITIONS,
  embedBrowseKindForTab,
  embedBrowseSignInUrl,
  isLinkedInNavigationNoise,
  shouldPersistWorkspaceUrl,
  workspacePartitionForTab,
  LINKEDIN_FEED_URL
} from './embedBrowse'
import type { EmbedBrowseAuthState } from './useEmbedBrowseSignIn'

type Props = {
  tab: WorkspaceTab
  active: boolean
  reloadNonce?: number
  miniPlayerTarget?: boolean
  onUrlChange?: (url: string) => void
}

export function WorkspaceView({ tab, active, reloadNonce = 0, miniPlayerTarget = false, onUrlChange }: Props) {
  const partition = workspacePartitionForTab(tab)
  const embedBrowseKind = embedBrowseKindForTab(tab)
  const [embedAuthState, setEmbedAuthState] = useState<EmbedBrowseAuthState | 'checking'>(() =>
    embedBrowseKind ? 'checking' : 'ok'
  )

  useEffect(() => {
    if (embedAuthState !== 'checking') return
    const t = window.setTimeout(() => {
      setEmbedAuthState((s) => {
        if (s !== 'checking') return s
        // Google tabs (YouTube, Docs, etc.) work unsigned — only gate on explicit sign-in detection.
        return embedBrowseKind === 'linkedin' ? 'signin' : 'ok'
      })
    }, embedBrowseKind === 'linkedin' ? 4500 : 3000)
    return () => window.clearTimeout(t)
  }, [embedAuthState, tab.id, embedBrowseKind])
  const showSignInGate = embedBrowseKind !== null && embedAuthState !== 'ok'

  const onEmbedAuthState = useCallback((state: EmbedBrowseAuthState) => {
    setEmbedAuthState(state)
  }, [])

  const signInEmbedded = useCallback(async () => {
    if (!embedBrowseKind) return
    try {
      await window.notchDesktop?.openAuthWindow?.({
        partition: EMBED_BROWSE_PARTITIONS[embedBrowseKind],
        url: embedBrowseSignInUrl(embedBrowseKind, tab.url),
        title: embedBrowseKind === 'linkedin' ? 'Sign in to LinkedIn' : 'Sign in to Google'
      })
    } catch {
      openBrowserLink(tab.url, { forceExternal: true, title: tab.title, source: tab.source })
    }
  }, [embedBrowseKind, tab])

  const signInLabel =
    embedBrowseKind === 'linkedin'
      ? 'Sign in to LinkedIn'
      : embedAuthState === 'blocked'
        ? 'Open Chrome again'
        : 'Sign in to Google'

  const bannerCopy =
    embedBrowseKind === 'linkedin'
      ? embedAuthState === 'blocked'
        ? 'LinkedIn may block embedded sign-in. Open the sign-in window once to save your session in Notch.'
        : 'Sign in to LinkedIn in Notch to use messages and notifications in-app.'
      : embedAuthState === 'blocked'
        ? 'Google blocks in-app sign-in. Click below to open Chrome, sign in, then return to Notch — cookies sync automatically.'
        : 'Sign in once to save your Google session in Notch — opens in Chrome because Google blocks in-app sign-in.'

  const onLocationChange = useCallback(
    (url: string) => {
      if (url === tab.url) return
      if (!shouldPersistWorkspaceUrl(url, tab)) return
      onUrlChange?.(url)
    },
    [onUrlChange, tab]
  )

  const linkedInTab = tab.source === 'linkedin' || tab.pinId === 'linkedin'
  const webviewSrc =
    linkedInTab && isLinkedInNavigationNoise(tab.url) ? LINKEDIN_FEED_URL : tab.url

  return (
    <section
      className={`x-workspace${active ? ' x-workspace-active' : ''}${miniPlayerTarget ? ' x-workspace-mini-target' : ''}`}
      aria-hidden={!active && !miniPlayerTarget}
      data-workspace-tab-id={tab.id}
    >
      {showSignInGate ? (
        <div className="x-workspace-signin-gate">
          {embedAuthState === 'checking' ? (
            <p className="x-workspace-signin-copy">Loading…</p>
          ) : (
            <div className="x-workspace-signin-card">
              <p className="x-workspace-signin-title">
                {embedBrowseKind === 'linkedin'
                  ? 'Sign in to LinkedIn'
                  : embedAuthState === 'blocked'
                    ? 'Sign in via Chrome'
                    : 'Sign in to Google'}
              </p>
              <p className="x-workspace-signin-copy">{bannerCopy}</p>
              <div className="x-workspace-signin-actions">
                <button type="button" className="x-int-btn" onClick={() => void signInEmbedded()}>
                  {signInLabel}
                </button>
                <button
                  type="button"
                  className="x-int-btn x-int-btn-ghost"
                  onClick={() => openBrowserLink(tab.url, { forceExternal: true, title: tab.title, source: tab.source })}
                >
                  Open in Chrome
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
      <EmbeddedWebview
        className={`x-workspace-webview${showSignInGate ? ' x-workspace-webview-gated' : ''}`}
        src={webviewSrc}
        partition={partition}
        dataTabId={tab.id}
        embedBrowseKind={embedBrowseKind}
        reloadNonce={reloadNonce}
        onEmbedAuthState={onEmbedAuthState}
        onSignInNeeded={() => void signInEmbedded()}
        onLocationChange={onUrlChange ? onLocationChange : undefined}
      />
    </section>
  )
}
