import type { WorkspaceTab } from './workspace'

export type WorkspaceWebviewEl = HTMLElement & {
  executeJavaScript?: (code: string, userGesture?: boolean) => Promise<unknown>
}

export const WORKSPACE_PLAYBACK_PROBE_JS = `(function() {
  const path = location.pathname || '';
  const onVideo =
    path.startsWith('/watch') || path.startsWith('/shorts') || path.startsWith('/live/');
  if (!onVideo) return { playing: false };
  const v =
    document.querySelector('video.html5-main-video') ||
    document.querySelector('#movie_player video') ||
    document.querySelector('ytd-watch-flexy video') ||
    document.querySelector('video');
  if (!v) return { playing: false };
  if (v.paused || v.ended) return { playing: false };
  if (v.readyState < 2) return { playing: false };
  if (v.currentTime < 1) return { playing: false };
  if (v.duration > 0 && v.duration < 3) return { playing: false };
  return { playing: true };
})();`

const YOUTUBE_MINI_STYLE_ID = 'notch-youtube-mini'

export function youtubeMiniLayoutJs(mini: boolean): string {
  return `(function() {
    const STYLE_ID = '${YOUTUBE_MINI_STYLE_ID}';
    const mini = ${mini};
    const path = location.pathname || '';
    const onWatch = path.startsWith('/watch');
    const onShorts = path.startsWith('/shorts');
    const onLive = path.startsWith('/live/');
    const onVideo = onWatch || onShorts || onLive;

    const removeStyle = () => {
      const el = document.getElementById(STYLE_ID);
      if (el) el.remove();
    };

    if (!mini || !onVideo) {
      removeStyle();
      return;
    }

    removeStyle();
    const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = \`
        ytd-masthead, #masthead-container, #guide, ytd-mini-guide-renderer,
        #secondary, #related, ytd-watch-metadata, #below, ytd-comments,
        #chat, ytd-engagement-panel-section-list-renderer, #panels,
        .ytp-chrome-top, .ytp-chrome-bottom, .ytp-gradient-top, .ytp-gradient-bottom,
        .ytp-pause-overlay, .ytp-ce-element, .ytp-show-cards-title, .ytp-watermark,
        .ytp-youtube-button, .ytp-title, .ytp-share-button, .ytp-overflow-button,
        ytd-shorts #header, ytd-shorts #navigation, ytd-shorts .reel-player-overlay-actions,
        ytd-shorts .yt-spec-button-shape-next, ytd-reel-player-overlay-renderer {
          display: none !important;
          visibility: hidden !important;
        }
        html, body, ytd-app, #content.ytd-app {
          overflow: hidden !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #000 !important;
        }
        ytd-watch-flexy {
          --ytd-watch-flexy-sidebar-min-width: 0px !important;
          --ytd-watch-flexy-max-player-width-available: 100% !important;
          max-width: none !important;
        }
        ytd-watch-flexy, ytd-shorts, #shorts-container {
          position: absolute !important;
          inset: 0 !important;
          width: 100% !important;
          height: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        ytd-watch-flexy #player-theater-container,
        ytd-watch-flexy #full-bleed-container,
        ytd-watch-flexy #player-container,
        ytd-watch-flexy #player,
        #movie_player, .html5-video-player, .ytp-player,
        ytd-shorts, #shorts-container, ytd-reel-video-renderer {
          position: absolute !important;
          inset: 0 !important;
          width: 100% !important;
          height: 100% !important;
          max-width: none !important;
          max-height: none !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        video.html5-main-video, #movie_player video, ytd-shorts video {
          width: 100% !important;
          height: 100% !important;
          object-fit: contain !important;
        }
      \`;
    document.head.appendChild(style);
  })();`
}

export function findWorkspaceWebview(tabId: string): WorkspaceWebviewEl | null {
  if (!tabId) return null
  return document.querySelector(
    `webview[data-workspace-tab-id="${CSS.escape(tabId)}"]`
  ) as WorkspaceWebviewEl | null
}

export async function getWorkspaceWebviewPlayback(el: WorkspaceWebviewEl | null): Promise<boolean> {
  if (!el?.executeJavaScript) return false
  try {
    const result = await el.executeJavaScript(WORKSPACE_PLAYBACK_PROBE_JS, true)
    return Boolean((result as { playing?: boolean })?.playing)
  } catch {
    return false
  }
}

export async function applyYoutubeMiniLayout(
  el: WorkspaceWebviewEl | null,
  mini: boolean
): Promise<void> {
  if (!el?.executeJavaScript) return
  try {
    await el.executeJavaScript(youtubeMiniLayoutJs(mini), true)
  } catch {
    /* guest may not be ready */
  }
}

export async function pauseWorkspaceMedia(el: WorkspaceWebviewEl | null): Promise<void> {
  if (!el?.executeJavaScript) return
  try {
    await el.executeJavaScript(
      `(function() {
        const v =
          document.querySelector('video.html5-main-video') ||
          document.querySelector('#movie_player video') ||
          document.querySelector('video');
        v?.pause();
      })();`,
      true
    )
  } catch {
    /* ignore */
  }
}

export function tabEligibleForMiniPlayer(tab: WorkspaceTab): boolean {
  if (tab.pinId === 'youtube' || tab.source === 'youtube') return true
  try {
    const host = new URL(tab.url).hostname.replace(/^www\./, '')
    return host === 'youtube.com' || host.endsWith('.youtube.com')
  } catch {
    return tab.url.includes('youtube.com')
  }
}
