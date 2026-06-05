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
}

export function WorkspaceView({ tab, active }: Props) {
  const partition = workspacePartitionForUrl(tab.url, tab.id)
  const embedBrowseKind = embedBrowseKindForUrl(tab.url)
  const [embedAuthState, setEmbedAuthState] = useState<EmbedBrowseAuthState>('ok')
  const needsEmbedAuth = embedBrowseKind !== null && embedAuthState !== 'ok'

  const signInEmbedded = useCallback(async () => {
    if (!embedBrowseKind) return
    try {
      if (embedBrowseKind === 'google') {
        const { url } = await integrationApi.gmailAuthUrl(false)
        if (!url) return
        await window.notchDesktop?.openAuthWindow?.({
          partition: EMBED_BROWSE_PARTITIONS.google,
          url,
          title: 'Sign in to Google'
        })
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
    embedBrowseKind === 'linkedin' ? 'Sign in to LinkedIn' : 'Sign in via Gmail'

  const bannerCopy =
    embedBrowseKind === 'linkedin'
      ? embedAuthState === 'blocked'
        ? 'LinkedIn may block embedded sign-in. Open the sign-in window once to save your session in Notch.'
        : 'Sign in to LinkedIn in Notch to use messages and notifications in-app.'
      : embedAuthState === 'blocked'
        ? 'Google blocks direct sign-in here. Connect Gmail once to share your session with Docs and YouTube.'
        : 'Sign in once through Gmail to open Google Docs, YouTube, and other Google tabs inside Notch.'

  return (
    <section className={`x-workspace${active ? ' x-workspace-active' : ''}`} aria-hidden={!active}>
      <div className="x-workspace-toolbar">
        <span className="x-workspace-toolbar-url" title={tab.url}>
          {tab.url}
        </span>
        <button
          type="button"
          className="x-workspace-external"
          onClick={() => openBrowserLink(tab.url, { forceExternal: true, title: tab.title, source: tab.source })}
          title="Open in system browser"
        >
          ↗
        </button>
      </div>
      {needsEmbedAuth ? (
        <div className="x-google-browse-banner">
          <p>{bannerCopy}</p>
          <div className="x-google-browse-banner-actions">
            <button type="button" className="x-post-link" onClick={() => void signInEmbedded()}>
              {signInLabel}
            </button>
            <span className="x-post-links-sep" aria-hidden>
              ·
            </span>
            <button
              type="button"
              className="x-post-link"
              onClick={() => openBrowserLink(tab.url, { forceExternal: true, title: tab.title, source: tab.source })}
            >
              Open in Chrome
            </button>
          </div>
        </div>
      ) : null}
      <EmbeddedWebview
        className="x-workspace-webview"
        src={tab.url}
        partition={partition}
        embedBrowseKind={embedBrowseKind}
        onEmbedAuthState={setEmbedAuthState}
        onSignInNeeded={() => void signInEmbedded()}
      />
    </section>
  )
}
