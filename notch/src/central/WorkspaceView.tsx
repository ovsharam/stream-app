import { useCallback, useState } from 'react'
import { integrationApi, openBrowserLink } from '../lib/api'
import type { WorkspaceTab } from './workspace'
import { EmbeddedWebview } from './EmbeddedWebview'
import {
  EMBED_BROWSE_PARTITIONS,
  embedBrowseKindForUrl,
  embedBrowseSignInUrl,
  workspacePartitionForUrl
} from './embedBrowse'
import type { EmbedBrowseAuthState } from './useEmbedBrowseSignIn'

type Props = {
  tab: WorkspaceTab
  active: boolean
  reloadNonce?: number
}

export function WorkspaceView({ tab, active, reloadNonce = 0 }: Props) {
  const partition = workspacePartitionForUrl(tab.url, tab.id)
  const embedBrowseKind = embedBrowseKindForUrl(tab.url)
  const [embedAuthState, setEmbedAuthState] = useState<EmbedBrowseAuthState | 'checking'>(() =>
    embedBrowseKind ? 'checking' : 'ok'
  )
  const showSignInGate = embedBrowseKind !== null && embedAuthState !== 'ok'

  const onEmbedAuthState = useCallback((state: EmbedBrowseAuthState) => {
    setEmbedAuthState(state)
  }, [])

  const signInEmbedded = useCallback(async () => {
    if (!embedBrowseKind) return
    try {
      if (embedBrowseKind === 'google') {
        const { url } = await integrationApi.gmailAuthUrl(false)
        if (!url) return
        openBrowserLink(url, { forceExternal: true })
        return
      }
      await window.notchDesktop?.openAuthWindow?.({
        partition: EMBED_BROWSE_PARTITIONS.linkedin,
        url: embedBrowseSignInUrl('linkedin', tab.url),
        title: 'Sign in to LinkedIn'
      })
    } catch {
      openBrowserLink(tab.url, { forceExternal: true, title: tab.title, source: tab.source })
    }
  }, [embedBrowseKind, tab])

  const signInLabel =
    embedBrowseKind === 'linkedin' ? 'Sign in to LinkedIn' : 'Connect in Chrome'

  const bannerCopy =
    embedBrowseKind === 'linkedin'
      ? embedAuthState === 'blocked'
        ? 'LinkedIn may block embedded sign-in. Open the sign-in window once to save your session in Notch.'
        : 'Sign in to LinkedIn in Notch to use messages and notifications in-app.'
      : embedAuthState === 'blocked'
        ? 'Google blocks sign-in inside Notch. Connect in Chrome for Gmail sync — use Open in Chrome for Docs and YouTube.'
        : 'Google blocks in-app sign-in. Connect in Chrome to link Gmail, then use Open in Chrome for Docs and YouTube tabs.'

  return (
    <section className={`x-workspace${active ? ' x-workspace-active' : ''}`} aria-hidden={!active}>
      {showSignInGate ? (
        <div className="x-workspace-signin-gate">
          {embedAuthState === 'checking' ? (
            <p className="x-workspace-signin-copy">Loading…</p>
          ) : (
            <div className="x-workspace-signin-card">
              <p className="x-workspace-signin-title">
                {embedBrowseKind === 'linkedin' ? 'Sign in to LinkedIn' : 'Connect Google'}
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
        src={tab.url}
        partition={partition}
        embedBrowseKind={embedBrowseKind}
        reloadNonce={reloadNonce}
        onEmbedAuthState={onEmbedAuthState}
        onSignInNeeded={() => void signInEmbedded()}
      />
    </section>
  )
}
