import 'dotenv/config'
import { app, BrowserView, BrowserWindow, globalShortcut, screen, Tray, nativeImage, ipcMain, shell, dialog, session, Notification } from 'electron'
import { autoUpdater } from 'electron-updater'

/** Avoid crash dialogs when stdout/stderr pipe closes (concurrently restarts, detached Terminal). */
function ignoreBrokenPipe(stream: NodeJS.WriteStream): void {
  stream.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') return
    throw err
  })
}
ignoreBrokenPipe(process.stdout)
ignoreBrokenPipe(process.stderr)
import type { BrowserWindow as BW, Input, Session, WebContents } from 'electron'
import type { NativeImage } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { spawn, type ChildProcess } from 'child_process'
import { existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { AudioTap, resolveWhisperRoot } from './services/AudioTap'
import { CallSessionManager } from './services/CallSessionManager'
import { importChromeCookiesToNotch } from './chromeProfileImport'

const isDev = !app.isPackaged
const GUEST_PRELOAD = join(__dirname, 'guest-preload.js')
const AUTH_PRELOAD = join(__dirname, 'auth-preload.js')

app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled')
const mobileOnly = process.argv.includes('--mobile-only')
const SIM = process.env.SIMULATION_MODE === 'true' || process.env.DEMO_MODE === '1'
const HOTKEY = 'CommandOrControl+Shift+M'

/**
 * When PLUMB_API_URL is set (e.g. https://api.useplumb.ai), the Electron app
 * connects to the hosted Railway API instead of spinning up a local server.
 * Falls back to localhost:3131 for local dev and packaged standalone installs.
 */
const PLUMB_API_URL = process.env.PLUMB_API_URL?.trim()
const API = PLUMB_API_URL ?? 'http://localhost:3131'
const USE_REMOTE_API = Boolean(PLUMB_API_URL)

const rendererDir = join(__dirname, '../../dist-renderer')

const CENTRAL_URL = isDev
  ? 'http://localhost:5174/central.html'
  : pathToFileURL(join(rendererDir, 'central.html')).href
const MOBILE_URL = isDev
  ? 'http://localhost:5174/'
  : pathToFileURL(join(rendererDir, 'index.html')).href

const MOBILE_SIZE = { w: 280, h: 420 }

let centralWindow: BrowserWindow | null = null
let mobileWindow: BrowserWindow | null = null
let tray: Tray | null = null
let mobileVisible = false
let mobilePosition: { x: number; y: number } | null = null
let audioTap: AudioTap | null = null
let callSession: CallSessionManager | null = null
let apiProcess: ChildProcess | null = null

function packagedServerDir(): string {
  return join(process.resourcesPath, 'server')
}

async function waitForApi(maxMs = 60_000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(`${API}/health`)
      if (res.ok) return
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`Local API at ${API} did not become ready within ${maxMs}ms`)
}

async function startPackagedApi(): Promise<void> {
  if (isDev) return
  const serverDir = packagedServerDir()
  const entry = join(serverDir, 'index.js')
  if (!existsSync(entry)) {
    throw new Error(`Bundled API missing: ${entry}`)
  }
  apiProcess = spawn(process.execPath, [entry], {
    cwd: serverDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NOTCH_PROTOTYPE: '1',
      SIMULATION_MODE: 'false',
      DEMO_MODE: '0',
      PORT: '3131'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  apiProcess.stdout?.on('data', (chunk: Buffer) => console.log('[api]', chunk.toString().trim()))
  apiProcess.stderr?.on('data', (chunk: Buffer) => console.error('[api]', chunk.toString().trim()))
  apiProcess.on('exit', (code) => {
    console.error('[api] exited', code)
    apiProcess = null
  })
  await waitForApi()
}

function stopPackagedApi(): void {
  if (apiProcess && !apiProcess.killed) {
    apiProcess.kill('SIGTERM')
    apiProcess = null
  }
}

/** Google blocks OAuth in Electron/webview UAs — present as current Chrome instead. */
const CHROME_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.204 Safari/537.36'

app.userAgentFallback = CHROME_USER_AGENT

let navBrowserView: BrowserView | null = null
let navBrowserViewPartition: string | null = null
let navBrowserViewTargetUrl: string | null = null
let navAppLayout: 'full' | 'mini' = 'full'
const authWindows = new Map<string, BrowserWindow>()
let navAppTheme = 'dark'

const NAV_APP_THEME_BG: Record<string, string> = {
  light: '#faf9f5',
  rose: '#fdf8f7',
  slate: '#f4f6f8',
  sepia: '#f3ead8',
  dark: '#181715',
  gray: '#1f1e1b',
  midnight: '#141312',
  ocean: '#0f1419',
  forest: '#0f1410',
  ember: '#1a1512',
  obsidian: '#000000'
}

const LIGHT_THEMES = new Set(['light', 'rose', 'slate', 'sepia'])

function navAppThemeIsDark(theme: string): boolean {
  return !LIGHT_THEMES.has(theme)
}

function applyYoutubeDarkMode(dark: boolean): void {
  if (!navBrowserView || navBrowserView.webContents.isDestroyed()) return
  const url = navBrowserView.webContents.getURL()
  if (!url.includes('youtube.com')) return
  void navBrowserView.webContents
    .executeJavaScript(
      `(function() {
        const html = document.documentElement;
        if (${dark}) {
          html.setAttribute('dark', 'true');
          html.setAttribute('theme', 'dark');
        } else {
          html.removeAttribute('dark');
          html.removeAttribute('theme');
        }
      })();`
    )
    .catch(() => {})
}

const YOUTUBE_MINI_STYLE_ID = 'notch-youtube-mini'

function applyYoutubeMiniLayout(mini: boolean): void {
  if (!navBrowserView || navBrowserView.webContents.isDestroyed()) return
  const url = navBrowserView.webContents.getURL()
  if (!url.includes('youtube.com')) return
  void navBrowserView.webContents
    .executeJavaScript(
      `(function() {
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

        if (!document.getElementById(STYLE_ID)) {
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
              --ytd-watch-flexy-max-player-width-available: 100vw !important;
              max-width: none !important;
            }
            ytd-watch-flexy #player-theater-container,
            ytd-watch-flexy #full-bleed-container,
            ytd-watch-flexy #player-container,
            ytd-watch-flexy #player,
            #movie_player, .html5-video-player, .ytp-player {
              position: fixed !important;
              top: 0 !important;
              left: 0 !important;
              right: 0 !important;
              bottom: 0 !important;
              width: 100vw !important;
              height: 100vh !important;
              max-width: none !important;
              max-height: none !important;
              margin: 0 !important;
              padding: 0 !important;
              z-index: 9999 !important;
            }
            video.html5-main-video, #movie_player video {
              width: 100% !important;
              height: 100% !important;
              object-fit: contain !important;
            }
            ytd-shorts, #shorts-container, ytd-reel-video-renderer {
              position: fixed !important;
              inset: 0 !important;
              width: 100vw !important;
              height: 100vh !important;
              margin: 0 !important;
              padding: 0 !important;
              background: #000 !important;
            }
            ytd-shorts .html5-video-player, ytd-shorts video {
              width: 100% !important;
              height: 100% !important;
              object-fit: contain !important;
            }
          \`;
          document.head.appendChild(style);
        }

        if (onWatch || onLive) {
          const flexy = document.querySelector('ytd-watch-flexy');
          if (flexy) {
            flexy.setAttribute('theater', '');
            flexy.setAttribute('fullscreen', '');
            flexy.removeAttribute('flexy');
          }
        }
      })();`
    )
    .catch(() => {})
}

function applyNavAppAppearance(theme: string): void {
  if (theme in NAV_APP_THEME_BG) {
    navAppTheme = theme
  }
  const dark = navAppThemeIsDark(navAppTheme)
  const bg = NAV_APP_THEME_BG[navAppTheme] ?? NAV_APP_THEME_BG.dark
  if (!navBrowserView || navBrowserView.webContents.isDestroyed()) return
  navBrowserView.setBackgroundColor(bg)
  const applyYoutube = () => {
    applyYoutubeDarkMode(dark)
    applyYoutubeMiniLayout(navAppLayout === 'mini')
  }
  if (navBrowserView.webContents.isLoading()) {
    navBrowserView.webContents.once('did-finish-load', applyYoutube)
  } else {
    applyYoutube()
  }
}

async function getNavAppPlaybackState(): Promise<{ playing: boolean }> {
  if (!navBrowserView || navBrowserView.webContents.isDestroyed()) return { playing: false }
  try {
    const result = await navBrowserView.webContents.executeJavaScript(
      `(function() {
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
      })();`,
      true
    )
    return result as { playing: boolean }
  } catch {
    return { playing: false }
  }
}

function whisperDir(): string {
  return resolveWhisperRoot(app.getPath('userData'))
}

function setupWhisperScriptPath(): string {
  const candidates = [
    join(app.getAppPath(), 'notch/scripts/setup-whisper.sh'),
    join(__dirname, '../../scripts/setup-whisper.sh'),
    join(process.cwd(), 'notch/scripts/setup-whisper.sh')
  ]
  return candidates.find((p) => existsSync(p)) ?? candidates[0]
}

function runWhisperSetup(): void {
  const script = setupWhisperScriptPath()
  if (!existsSync(script)) {
    dialog.showErrorBox('Setup failed', `setup-whisper.sh not found at ${script}`)
    return
  }
  const child = spawn('bash', [script], {
    env: { ...process.env, STREAM_WHISPER_DIR: whisperDir() },
    detached: true,
    stdio: 'inherit'
  })
  child.unref()
  dialog.showMessageBox({
    type: 'info',
    title: 'Meeting transcription setup',
    message: 'Setup running in Terminal',
    detail: 'Follow output in the terminal window. When complete, use tray → Start listening.'
  })
}

function ensureAudioTap(): AudioTap {
  if (!audioTap) {
    audioTap = new AudioTap(app.getPath('userData'))
    audioTap.on('chunk', (chunk) => {
      mobileWindow?.webContents.send('audio:chunk', chunk)
      centralWindow?.webContents.send('audio:chunk', chunk)
    })
    audioTap.on('error', (msg) => {
      console.warn('[audio]', msg)
      mobileWindow?.webContents.send('audio:error', msg)
    })
  }
  return audioTap
}

function ensureCallSession(): CallSessionManager {
  if (!callSession) {
    callSession = new CallSessionManager(ensureAudioTap())
    callSession.on('session-started', (id) => {
      console.log(`[meeting] session started ${id}`)
      mobileWindow?.webContents.send('meeting:session-started', id)
      centralWindow?.webContents.send('meeting:session-started', id)
    })
    callSession.on('session-ended', (result) => {
      console.log('[meeting] session ended', result)
      mobileWindow?.webContents.send('meeting:session-ended', result)
      centralWindow?.webContents.send('meeting:session-ended', result)
    })
    callSession.on('signal', (signal) => {
      mobileWindow?.webContents.send('meeting:signal', signal)
      centralWindow?.webContents.send('meeting:signal', signal)
    })
    callSession.on('chunk-sent', (chunk) => {
      mobileWindow?.webContents.send('meeting:chunk', chunk)
      centralWindow?.webContents.send('meeting:chunk', chunk)
    })
    callSession.on('error', (msg) => console.warn('[meeting]', msg))
  }
  return callSession
}

function isHotkey(input: Input): boolean {
  return Boolean(input.meta && input.shift && !input.alt && !input.control && input.key?.toUpperCase() === 'M')
}

function wireLocalHotkey(win: BW, toggle: () => void): void {
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !isHotkey(input)) return
    event.preventDefault()
    toggle()
  })
}

function mobileBounds(): { x: number; y: number; w: number; h: number } {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const defaultX = width - MOBILE_SIZE.w - 16
  const defaultY = 38
  const x = mobilePosition?.x ?? defaultX
  const y = mobilePosition?.y ?? defaultY
  return {
    x: Math.max(8, Math.min(x, width - MOBILE_SIZE.w - 8)),
    y: Math.max(8, Math.min(y, height - MOBILE_SIZE.h - 8)),
    w: MOBILE_SIZE.w,
    h: MOBILE_SIZE.h
  }
}

function showMobile(): void {
  if (!mobileWindow || mobileWindow.isDestroyed()) return
  mobileVisible = true
  const b = mobileBounds()
  mobileWindow.setIgnoreMouseEvents(false)
  mobileWindow.setOpacity(1)
  mobileWindow.setBounds(b, true)
  mobileWindow.show()
  mobileWindow.focus()
  mobileWindow.webContents.send('notch:mode', 'open')
  mobileWindow.webContents.send('focus-search')
}

function hideMobile(): void {
  if (!mobileWindow || mobileWindow.isDestroyed()) return
  mobileVisible = false
  mobileWindow.hide()
  mobileWindow.setOpacity(0)
  mobileWindow.setIgnoreMouseEvents(true, { forward: true })
  mobileWindow.webContents.send('notch:mode', 'hidden')
}

function toggleMobile(): void {
  if (mobileVisible) hideMobile()
  else showMobile()
}

async function simPost(path: string): Promise<void> {
  try {
    await fetch(`${API}/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    mobileWindow?.webContents.send('sim:refresh')
    centralWindow?.webContents.send('sim:refresh')
  } catch (e) {
    console.error('[notch] sim api failed', e)
  }
}

function registerShortcuts(): void {
  if (!app.isReady()) return
  globalShortcut.unregisterAll()
  const ok = globalShortcut.register(HOTKEY, toggleMobile)
  if (!ok) console.error(`[notch] failed to register ${HOTKEY}`)
  else console.log(`[notch] ${HOTKEY} registered`)

  if (SIM) {
    globalShortcut.register('CommandOrControl+Shift+D', () => void simPost('/sim/start-call'))
    globalShortcut.register('CommandOrControl+Shift+E', () => void simPost('/sim/end-call'))
    console.log('[notch] sim shortcuts: ⌘⇧D start Acme sim · ⌘⇧E end sim')
    return
  }

  // Meeting capture hotkeys (live calls — disabled in demo/sim)
  globalShortcut.register('CommandOrControl+Shift+L', () => {
    void ensureCallSession().start().catch((e) => console.warn('[meeting] start failed', e))
  })
  globalShortcut.register('CommandOrControl+Shift+K', () => {
    void ensureCallSession().end().catch((e) => console.warn('[meeting] end failed', e))
  })
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    void ensureCallSession().starMoment().catch((e) => console.warn('[meeting] star failed', e))
  })
  console.log('[notch] meeting hotkeys: ⌘⇧L start · ⌘⇧K end · ⌘⇧S star')
}

function configureEmbeddedSession(sess: Session): void {
  sess.setUserAgent(CHROME_USER_AGENT)
  sess.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(true)
  })
  sess.setPermissionCheckHandler(() => true)
  sess.webRequest.onBeforeSendHeaders({ urls: ['https://*/*'] }, (details, callback) => {
    const rawUa = details.requestHeaders['User-Agent'] || CHROME_USER_AGENT
    const ua = rawUa.replace(/\sElectron\/[^\s]+/g, '').trim()
    const headers = {
      ...details.requestHeaders,
      'User-Agent': ua,
      'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"'
    }
    callback({ requestHeaders: headers })
  })
}

/** LinkedIn passkey probe breaks Electron webviews — block and spoof credentials in guest-preload. */
function configureLinkedInBrowseSession(sess: Session): void {
  sess.webRequest.onBeforeRequest({ urls: ['*://*.linkedin.com/*'] }, (details, callback) => {
    if (details.url.includes('checkpoint/pk/initiateLogin')) {
      callback({ cancel: true })
      return
    }
    callback({})
  })
}

/** Cancel Google sign-in at the network layer — will-navigate alone is not reliable in webviews. */
function configureGoogleAuthBlock(sess: Session, cookiePartition: string): void {
  sess.webRequest.onBeforeRequest({ urls: GOOGLE_AUTH_WEBREQUEST_URLS }, (details, callback) => {
    const rt = details.resourceType
    if (rt !== 'mainFrame' && rt !== 'subFrame') {
      callback({})
      return
    }
    if (!googleAuthInterceptReady) {
      callback({})
      return
    }
    if (rt === 'subFrame') {
      callback({ cancel: true })
      return
    }
    callback({ cancel: true })
    setImmediate(() => queueGoogleSignIn(cookiePartition, details.url))
  })
}

function suspendNavBrowserView(): void {
  if (!navBrowserView || !centralWindow || centralWindow.isDestroyed()) return
  try {
    centralWindow.removeBrowserView(navBrowserView)
  } catch {
    /* already detached */
  }
}

/** Detach from window but keep webContents alive (mini dock / layout transitions). */
function hideNavBrowserView(): void {
  suspendNavBrowserView()
}

/** Tear down guest session (app closed, partition switch, shell reload). */
function destroyNavBrowserView(): void {
  if (!navBrowserView) return
  try {
    suspendNavBrowserView()
    navBrowserView.webContents.close()
  } catch {
    /* already torn down */
  }
  navBrowserView = null
  navBrowserViewPartition = null
  navBrowserViewTargetUrl = null
}

type NavAppBounds = { x: number; y: number; width: number; height: number }

/** Keep embedded views out of the sidebar / titlebar — BrowserView draws above all web UI. */
const NAV_APP_SIDEBAR_W = 196
const NAV_APP_TITLEBAR_H = 48

function sanitizeNavAppBounds(bounds: NavAppBounds): NavAppBounds | null {
  if (bounds.width < 2 || bounds.height < 2) return null

  let { x, y, width, height } = bounds

  if (x < NAV_APP_SIDEBAR_W) {
    width -= NAV_APP_SIDEBAR_W - x
    x = NAV_APP_SIDEBAR_W
  }
  if (y < NAV_APP_TITLEBAR_H) {
    height -= NAV_APP_TITLEBAR_H - y
    y = NAV_APP_TITLEBAR_H
  }

  if (width < 2 || height < 2) return null
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height)
  }
}

function navAppUrlsEquivalent(current: string, target: string): boolean {
  try {
    const a = new URL(current)
    const b = new URL(target)
    return a.origin === b.origin && a.pathname === b.pathname
  } catch {
    return current === target
  }
}

function showNavBrowserView(args: {
  partition: string
  url: string
  bounds: NavAppBounds
  layout?: 'full' | 'mini'
}): void {
  if (!centralWindow || centralWindow.isDestroyed()) return

  if (args.layout === 'mini' || args.layout === 'full') {
    navAppLayout = args.layout
  }

  navBrowserViewTargetUrl = args.url

  const bounds = sanitizeNavAppBounds(args.bounds)
  if (!bounds) {
    // Layout settling — keep session alive, skip bounds update until valid.
    return
  }

  const sess = session.fromPartition(args.partition)
  configureEmbeddedSession(sess)

  if (navBrowserView && navBrowserViewPartition !== args.partition) {
    destroyNavBrowserView()
  }

  if (!navBrowserView) {
    navBrowserView = new BrowserView({
      webPreferences: {
        session: sess,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })
    navBrowserView.webContents.setUserAgent(CHROME_USER_AGENT)
    configureNavAppWebContents(navBrowserView.webContents, args.partition)
    navBrowserViewPartition = args.partition
    navBrowserView.webContents.on('did-finish-load', () => applyNavAppAppearance(navAppTheme))
    void navBrowserView.webContents.loadURL(args.url)
  } else {
    const current = navBrowserView.webContents.getURL()
    if (
      !current ||
      current === 'about:blank' ||
      !navAppUrlsEquivalent(current, args.url)
    ) {
      void navBrowserView.webContents.loadURL(args.url)
    }
  }

  if (centralWindow && !centralWindow.isDestroyed()) {
    const views = centralWindow.getBrowserViews()
    if (!views.includes(navBrowserView)) {
      centralWindow.addBrowserView(navBrowserView)
    }
  }

  navBrowserView.setBounds(bounds)
  applyNavAppAppearance(navAppTheme)
}

const GOOGLE_BROWSE_PARTITION = 'persist:google-browse'
const pendingGoogleAuthSync = new Set<string>()

function isGoogleBrowsePartition(partition: string): boolean {
  return partition === GOOGLE_BROWSE_PARTITION
}

function isGoogleAccountsUrl(url: string): boolean {
  try {
    return new URL(url).hostname === 'accounts.google.com'
  } catch {
    return false
  }
}

/** Google login / OAuth hosts — must never load inside Electron webviews. */
function isGoogleBlockedAuthUrl(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url)
    if (hostname === 'accounts.google.com') return true
    if (hostname === 'myaccount.google.com' && pathname.includes('signin')) return true
    if (hostname.endsWith('google.com') && pathname.startsWith('/accounts/')) return true
    return false
  } catch {
    return false
  }
}

const GOOGLE_AUTH_WEBREQUEST_URLS = [
  '*://accounts.google.com/*',
  '*://myaccount.google.com/*',
  '*://www.google.com/accounts/*',
  '*://google.com/accounts/*'
]

const pendingGoogleAuthUrls = new Map<string, string>()
let lastGoogleAuthNotifyAt = 0
/** Defer network-level Google blocks until the main window is stable (avoids SIGSEGV on startup). */
let googleAuthInterceptReady = false

/** Block Google auth in webviews and show the sign-in gate — do not auto-open Chrome (SIGSEGV on macOS). */
function queueGoogleSignIn(partition: string, url: string): void {
  pendingGoogleAuthUrls.set(partition, url)
  const now = Date.now()
  if (now - lastGoogleAuthNotifyAt < 800) return
  lastGoogleAuthNotifyAt = now
  notifyEmbedSignInNeeded(partition)
}

/** User-initiated — open Google sign-in in system browser and sync cookies back. */
function openGoogleAuthExternal(url: string, partition: string): void {
  console.log('[embedded] Google sign-in — opening system browser (user action)')
  pendingGoogleAuthUrls.set(partition, url)
  void shell.openExternal(url)
  scheduleGoogleAuthCookieSync(partition)
  if (centralWindow && !centralWindow.isDestroyed()) {
    centralWindow.webContents.send('embedded:auth-external-fallback', partition)
  }
}

function reloadNavAppAfterAuth(partition: string): void {
  if (
    partition !== navBrowserViewPartition ||
    !navBrowserView ||
    navBrowserView.webContents.isDestroyed() ||
    !navBrowserViewTargetUrl
  ) {
    return
  }
  void navBrowserView.webContents.loadURL(navBrowserViewTargetUrl)
}

function notifyAuthClosed(partition: string): void {
  if (centralWindow && !centralWindow.isDestroyed()) {
    centralWindow.webContents.send('embedded:auth-closed', partition)
  }
  reloadNavAppAfterAuth(partition)
}

function scheduleGoogleAuthCookieSync(partition: string): void {
  pendingGoogleAuthSync.add(partition)
  const win = centralWindow
  if (!win || win.isDestroyed()) return

  const attemptSync = () => {
    if (!pendingGoogleAuthSync.has(partition)) return
    void importChromeCookiesToNotch({ quiet: true }).then((result) => {
      if (!pendingGoogleAuthSync.has(partition)) return
      if (!result.ok || result.imported === 0) return
      pendingGoogleAuthSync.delete(partition)
      console.log(`[embedded] synced ${result.imported} Chrome cookies after Google sign-in`)
      notifyAuthClosed(partition)
    })
  }

  win.once('focus', attemptSync)
  setTimeout(attemptSync, 5000)
  setTimeout(attemptSync, 15000)
}

function openAuthWindow(args: { partition: string; url: string; title?: string }): void {
  if (isGoogleBrowsePartition(args.partition)) {
    const existing = authWindows.get(args.partition)
    if (existing && !existing.isDestroyed()) existing.close()
    const url = pendingGoogleAuthUrls.get(args.partition) ?? args.url
    openGoogleAuthExternal(url, args.partition)
    return
  }

  const sess = session.fromPartition(args.partition)
  configureEmbeddedSession(sess)

  const existing = authWindows.get(args.partition)
  if (existing && !existing.isDestroyed()) {
    existing.focus()
    void existing.loadURL(args.url)
    return
  }

  const win = new BrowserWindow({
    ...popupWindowOptions(null, sess, false),
    width: 960,
    height: 780,
    title: args.title ?? 'Sign in'
  })
  win.webContents.setUserAgent(CHROME_USER_AGENT)
  configureGuestWebContents(win.webContents)
  void win.loadURL(args.url)
  authWindows.set(args.partition, win)
  win.on('closed', () => {
    authWindows.delete(args.partition)
    notifyAuthClosed(args.partition)
  })
}

function popupWindowOptions(
  parent: BrowserWindow | null,
  sess: Session,
  googleAuth = false
): Electron.BrowserWindowConstructorOptions {
  return {
    width: 520,
    height: 720,
    title: 'Sign in',
    autoHideMenuBar: true,
    parent: parent ?? undefined,
    modal: false,
    webPreferences: {
      session: sess,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: googleAuth ? AUTH_PRELOAD : GUEST_PRELOAD
    }
  }
}

function isNotchAppShell(url: string): boolean {
  return url.includes('localhost:5174') || url.includes('dist-renderer') || url.endsWith('central.html') || url.endsWith('index.html')
}

/** OAuth / Cloudflare login hosts — load in a dedicated window (same session partition). */
function isNavAppAuthUrl(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url)
    if (hostname === 'authenticate.cursor.sh') return true
    if (hostname.endsWith('.workos.com') || hostname === 'api.workos.com') return true
    if (hostname === 'accounts.google.com') return true
    if (hostname === 'github.com' && pathname.startsWith('/login')) return true
    if (hostname === 'cursor.com' && pathname.startsWith('/api/auth/')) return true
    return false
  } catch {
    return false
  }
}

function isGoogleOAuthUrl(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url)
    return hostname === 'accounts.google.com' && pathname.startsWith('/o/oauth2/')
  } catch {
    return false
  }
}

function isGoogleDirectSignInUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return hostname === 'accounts.google.com' && !isGoogleOAuthUrl(url)
  } catch {
    return false
  }
}

function isLinkedInAuthUrl(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url)
    if (!hostname.endsWith('linkedin.com')) return false
    return (
      pathname.startsWith('/login') ||
      pathname.startsWith('/checkpoint') ||
      pathname.startsWith('/authwall') ||
      pathname.startsWith('/uas/')
    )
  } catch {
    return false
  }
}

function isEmbedBrowsePartition(partition: string): boolean {
  return partition === GOOGLE_BROWSE_PARTITION || partition === 'persist:linkedin-browse'
}

function partitionForSession(sess: Session): string | null {
  for (const part of [
    'persist:google-browse',
    'persist:linkedin-browse',
    'persist:notch-browser',
    'persist:nav-app-youtube'
  ] as const) {
    if (sess === session.fromPartition(part)) return part
  }
  return null
}

function notifyGoogleSignInNeeded(partition: string): void {
  if (centralWindow && !centralWindow.isDestroyed()) {
    centralWindow.webContents.send('embedded:google-signin-needed', partition)
  }
}

function notifyEmbedSignInNeeded(partition: string): void {
  if (centralWindow && !centralWindow.isDestroyed()) {
    centralWindow.webContents.send('embedded:embed-signin-needed', partition)
  }
}

function blockGoogleAuthNavigation(
  contents: WebContents,
  partition: string,
  event: Electron.Event,
  url: string
): boolean {
  if (!googleAuthInterceptReady || !isGoogleBlockedAuthUrl(url)) return false
  event.preventDefault()
  queueGoogleSignIn(partition, url)
  return true
}

const wiredEmbedAuthNavigation = new WeakSet<WebContents>()

function wireEmbedBrowseAuthNavigation(contents: WebContents, partition: string): void {
  if (wiredEmbedAuthNavigation.has(contents)) return
  wiredEmbedAuthNavigation.add(contents)
  contents.setMaxListeners(Math.max(contents.getMaxListeners(), 24))

  const googlePartition =
    partition === GOOGLE_BROWSE_PARTITION ||
    partition === 'persist:notch-browser' ||
    partition === 'persist:nav-app-youtube'

  const intercept = (event: Electron.Event, url: string) => {
    if (googlePartition && blockGoogleAuthNavigation(contents, GOOGLE_BROWSE_PARTITION, event, url)) {
      return
    }
    if (!isEmbedBrowsePartition(partition)) return
    if (partition === GOOGLE_BROWSE_PARTITION) {
      if (!isNavAppAuthUrl(url)) return
      event.preventDefault()
      queueGoogleSignIn(partition, url)
      return
    }
    if (partition === 'persist:linkedin-browse' && isLinkedInAuthUrl(url)) {
      event.preventDefault()
      notifyEmbedSignInNeeded(partition)
      openAuthWindow({ partition, url, title: 'Sign in to LinkedIn' })
    }
  }

  contents.on('will-navigate', intercept)
  contents.on('will-redirect', intercept)

  contents.on('did-start-navigation', (_event, url, _inPlace, isMainFrame) => {
    if (!googleAuthInterceptReady || !isMainFrame || !isGoogleBlockedAuthUrl(url)) return
    if (!googlePartition && partition !== GOOGLE_BROWSE_PARTITION) return
    queueGoogleSignIn(GOOGLE_BROWSE_PARTITION, url)
  })
}

function openNavAppAuthWindow(partition: string, url: string, title?: string): void {
  openAuthWindow({ partition, url, title: title ?? 'Sign in' })
}

const wiredNavAppWebContents = new WeakSet<WebContents>()

function configureNavAppWebContents(contents: WebContents, partition: string): void {
  if (wiredNavAppWebContents.has(contents)) return
  wiredNavAppWebContents.add(contents)
  contents.setMaxListeners(Math.max(contents.getMaxListeners(), 24))
  configureGuestWebContents(contents)

  contents.on('will-navigate', (event, url) => {
    if (isGoogleBlockedAuthUrl(url)) {
      event.preventDefault()
      queueGoogleSignIn(GOOGLE_BROWSE_PARTITION, url)
      return
    }
    if (!isNavAppAuthUrl(url)) return
    event.preventDefault()
    openNavAppAuthWindow(partition, url, 'Sign in')
  })

  contents.on('will-redirect', (event, url) => {
    if (isGoogleBlockedAuthUrl(url)) {
      event.preventDefault()
      queueGoogleSignIn(GOOGLE_BROWSE_PARTITION, url)
      return
    }
    if (!isNavAppAuthUrl(url)) return
    event.preventDefault()
    openNavAppAuthWindow(partition, url, 'Sign in')
  })

  contents.on('did-start-navigation', (_event, url, _inPlace, isMainFrame) => {
    if (!googleAuthInterceptReady || !isMainFrame || !isGoogleBlockedAuthUrl(url)) return
    queueGoogleSignIn(GOOGLE_BROWSE_PARTITION, url)
  })

  contents.on('did-fail-load', (_event, code, desc, url) => {
    if (code === -3) return // ERR_ABORTED — navigation intercepted for auth popup
    console.warn('[navapp] failed to load', code, desc, url)
  })

  contents.on('did-navigate-in-page', () => {
    if (partition !== navBrowserViewPartition) return
    applyYoutubeMiniLayout(navAppLayout === 'mini')
    applyYoutubeDarkMode(navAppThemeIsDark(navAppTheme))
  })

  contents.on('did-finish-load', () => {
    if (partition !== navBrowserViewPartition) return
    if (!navBrowserViewTargetUrl) return
    const current = contents.getURL()
    if (!current || current === 'about:blank') return
    if (isNavAppAuthUrl(current)) return
    applyYoutubeMiniLayout(navAppLayout === 'mini')
    applyYoutubeDarkMode(navAppThemeIsDark(navAppTheme))
    // Stuck on Cloudflare "Just a moment…" with an empty body — retry in auth window.
    void contents
      .executeJavaScript(
        `(function() {
          const t = (document.title || '').toLowerCase();
          const body = (document.body && document.body.innerText) || '';
          return t.includes('just a moment') && body.trim().length < 80;
        })();`,
        true
      )
      .then((stuck) => {
        if (!stuck) return
        openNavAppAuthWindow(partition, contents.getURL(), 'Sign in')
      })
      .catch(() => {})
  })
}

function configureGuestWebContents(contents: WebContents): void {
  configureEmbeddedSession(contents.session)
  contents.setUserAgent(CHROME_USER_AGENT)

  contents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return { action: 'deny' as const }
    }
    if (isNavAppAuthUrl(url)) {
      if (isGoogleBlockedAuthUrl(url)) {
        const part = partitionForSession(contents.session)
        queueGoogleSignIn(part && isGoogleBrowsePartition(part) ? part : GOOGLE_BROWSE_PARTITION, url)
        return { action: 'deny' as const }
      }
      return {
        action: 'allow' as const,
        overrideBrowserWindowOptions: popupWindowOptions(centralWindow, contents.session)
      }
    }
    if (centralWindow && !centralWindow.isDestroyed()) {
      centralWindow.webContents.send('embedded:open-url', url)
    }
    return { action: 'deny' as const }
  })
}

function setupEmbeddedBrowsing(): void {
  for (const part of [
    'persist:stream-central',
    'persist:notch-browser',
    'persist:google-browse',
    'persist:linkedin-browse',
    'persist:nav-app-youtube',
    'persist:nav-app-cursor'
  ]) {
    try {
      const sess = session.fromPartition(part)
      configureEmbeddedSession(sess)
      if (part === 'persist:linkedin-browse') configureLinkedInBrowseSession(sess)
      if (
        part === GOOGLE_BROWSE_PARTITION ||
        part === 'persist:notch-browser' ||
        part === 'persist:nav-app-youtube'
      ) {
        configureGoogleAuthBlock(sess, GOOGLE_BROWSE_PARTITION)
      }
    } catch {
      /* partition may not exist yet */
    }
  }

  app.on('web-contents-created', (_event, contents) => {
    const type = contents.getType()
    if (type === 'webview') {
      configureGuestWebContents(contents)
      const part = partitionForSession(contents.session)
      if (part) wireEmbedBrowseAuthNavigation(contents, part)
      return
    }
    if (type === 'window') {
      contents.once('did-start-navigation', (_e, url) => {
        if (!isNotchAppShell(url)) configureGuestWebContents(contents)
      })
    }
  })
}

function hideNavAppAuthWindows(): void {
  for (const win of authWindows.values()) {
    if (!win.isDestroyed()) win.close()
  }
  authWindows.clear()
}

function wireCentralNavAppLifecycle(win: BrowserWindow): void {
  // Hard refresh (⌘⇧R) reloads React but BrowserView lives in the main process — tear it down.
  win.webContents.on('did-start-navigation', (_event, url, _inPlace, isMainFrame) => {
    if (!isMainFrame || !isNotchAppShell(url)) return
    destroyNavBrowserView()
    hideNavAppAuthWindows()
  })

  win.webContents.on('did-finish-load', () => {
    if (!isNotchAppShell(win.webContents.getURL())) return
    destroyNavBrowserView()
    win.webContents.send('navapp:renderer-ready')
  })
}

function createCentralWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 860,
    minWidth: 1008,
    minHeight: 560,
    title: 'Plumb',
    backgroundColor: '#141413',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  })

  if (isDev) {
    win.webContents.on('console-message', (_event, level, message) => {
      if (level >= 2) console.warn('[central-renderer]', message)
    })
    win.webContents.on('did-fail-load', (_event, code, desc, url) => {
      console.error('[central] failed to load', code, desc, url)
    })
  }

  destroyNavBrowserView()

  wireLocalHotkey(win, toggleMobile)
  wireCentralNavAppLifecycle(win)
  win.loadURL(CENTRAL_URL)
  win.show()
  win.focus()
  win.on('closed', () => {
    destroyNavBrowserView()
    centralWindow = null
  })
  return win
}

function createMobileWindow(): BrowserWindow {
  const win = new BrowserWindow({
    ...mobileBounds(),
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    focusable: true,
    skipTaskbar: true,
    hasShadow: true,
    movable: true,
    opacity: 0,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setContentProtection(true)
  win.setIgnoreMouseEvents(true, { forward: true })

  wireLocalHotkey(win, toggleMobile)

  win.on('moved', () => {
    if (!mobileVisible) return
    const [x, y] = win.getPosition()
    mobilePosition = { x, y }
  })

  win.webContents.on('did-finish-load', () => hideMobile())
  win.loadURL(MOBILE_URL)
  return win
}

function createTrayIcon(): NativeImage {
  const size = 16
  const canvas = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    const o = i * 4
    const x = i % size
    const y = Math.floor(i / size)
    const dist = Math.sqrt((x - 7.5) ** 2 + (y - 7.5) ** 2)
    if (dist < 5) {
      canvas[o] = 29
      canvas[o + 1] = 155
      canvas[o + 2] = 240
      canvas[o + 3] = 255
    }
  }
  return nativeImage.createFromBuffer(canvas, { width: size, height: size })
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (centralWindow && !centralWindow.isDestroyed()) {
      if (centralWindow.isMinimized()) centralWindow.restore()
      centralWindow.show()
      centralWindow.focus()
    } else if (!mobileOnly) {
      centralWindow = createCentralWindow()
    }
  })

app.whenReady().then(async () => {
  if (!isDev && !USE_REMOTE_API) {
    // Only spin up the bundled local API when not using the hosted remote API
    try {
      await startPackagedApi()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      dialog.showErrorBox('Plumb', `Could not start local API:\n${msg}`)
      app.quit()
      return
    }
  } else if (USE_REMOTE_API) {
    console.log(`[plumb] Using remote Plumb API at ${API}`)
  }

  // Auto-updater — only in packaged builds
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => { /* ignore update check failures */ })
  }

  setupEmbeddedBrowsing()

  mobileWindow = createMobileWindow()
  if (!mobileOnly) centralWindow = createCentralWindow()

  const enableGoogleAuthIntercept = () => {
    googleAuthInterceptReady = true
  }
  if (centralWindow && !centralWindow.isDestroyed()) {
    centralWindow.webContents.once('did-finish-load', () => {
      setTimeout(enableGoogleAuthIntercept, 2000)
      void (async () => {
        const result = await importChromeCookiesToNotch({ quiet: true })
        if (result.ok && result.imported > 0) {
          console.log(`[notch] Chrome session: ${result.imported} cookies imported`)
        } else if (result.error && !result.error.includes('not found')) {
          console.warn('[notch] Chrome cookie import:', result.error)
        }
      })()
    })
  } else {
    setTimeout(enableGoogleAuthIntercept, 3000)
  }

  tray = new Tray(createTrayIcon())
  tray.setToolTip('Plumb — ⌘⇧M toggle')
  tray.setContextMenu(
    require('electron').Menu.buildFromTemplate([
      {
        label: 'Plumb',
        click: () => {
          if (centralWindow && !centralWindow.isDestroyed()) {
            centralWindow.show()
            centralWindow.focus()
          } else {
            centralWindow = createCentralWindow()
          }
        }
      },
      { label: 'Mobile cluster (⌘⇧M)', click: toggleMobile },
      { type: 'separator' },
      {
        label: 'Setup meeting transcription',
        click: () => runWhisperSetup()
      },
      {
        label: 'Start meeting capture (⌘⇧L)',
        click: () => {
          void ensureCallSession()
            .start()
            .catch((e) => dialog.showErrorBox('Meeting', String(e)))
        }
      },
      {
        label: 'End meeting & sync (⌘⇧K)',
        click: () => {
          void ensureCallSession()
            .end()
            .catch((e) => dialog.showErrorBox('Meeting', String(e)))
        }
      },
      {
        label: 'Star moment (⌘⇧S)',
        click: () => void ensureCallSession().starMoment()
      },
      { type: 'separator' },
      {
        label: 'Audio: Start listening (no meeting)',
        click: () => {
          const status = ensureAudioTap().start()
          if (status.error) dialog.showErrorBox('Audio', status.error)
        }
      },
      {
        label: 'Audio: Stop listening',
        click: () => ensureAudioTap().stop()
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  )

  registerShortcuts()

  ipcMain.on('notch:hide', () => hideMobile())
  ipcMain.handle('notch:getMode', () => (mobileVisible ? 'open' : 'hidden'))
  ipcMain.handle('audio:start', () => ensureAudioTap().start())
  ipcMain.handle('audio:stop', () => ensureAudioTap().stop())
  ipcMain.handle('audio:status', () => ensureAudioTap().status())
  ipcMain.handle('whisper:setup', () => {
    runWhisperSetup()
    return { ok: true }
  })
  ipcMain.handle('meeting:start', async (_e, args?: { title?: string; dealHint?: string }) => {
    if (SIM) throw new Error('Meeting capture is disabled in demo mode — use ⌘⇧D for the Acme sim call.')
    return ensureCallSession().start(args ?? {})
  })
  ipcMain.handle('meeting:end', async () => {
    if (SIM) return null
    return ensureCallSession().end()
  })
  ipcMain.handle('meeting:star', async (_e, text?: string) => {
    if (SIM) return { ok: false }
    return ensureCallSession().starMoment(text)
  })
  ipcMain.handle('meeting:status', () => (SIM ? { active: false, chunkCount: 0, signalCount: 0, starredCount: 0, autoEnd: false } : ensureCallSession().status()))
  ipcMain.on('shell:open', (_e, url: string) => {
    if (typeof url === 'string' && url.startsWith('http')) void shell.openExternal(url)
  })
  ipcMain.handle(
    'desktop:showNotification',
    (_e, args: { title?: string; body?: string; proposalId?: string }) => {
      if (!args?.title) return { ok: false }
      const notification = new Notification({
        title: args.title,
        body: args.body ?? ''
      })
      notification.on('click', () => {
        if (centralWindow && !centralWindow.isDestroyed()) {
          if (centralWindow.isMinimized()) centralWindow.restore()
          centralWindow.show()
          centralWindow.focus()
          centralWindow.webContents.send('desktop:open-agent-proposal', args.proposalId ?? '')
        }
        mobileWindow?.webContents.send('agent:proposal-alert', {
          proposalId: args.proposalId,
          title: args.title,
          body: args.body
        })
      })
      notification.show()
      mobileWindow?.webContents.send('agent:proposal-alert', {
        proposalId: args.proposalId,
        title: args.title,
        body: args.body
      })
      return { ok: true }
    }
  )
  ipcMain.handle(
    'navapp:show',
    (_e, args: { partition: string; url: string; bounds: NavAppBounds; layout?: 'full' | 'mini' }) => {
      if (!args?.partition || !args?.url || !args?.bounds) return { ok: false }
      showNavBrowserView(args)
      return { ok: true }
    }
  )
  ipcMain.handle('navapp:hide', () => {
    hideNavBrowserView()
    return { ok: true }
  })
  ipcMain.handle('navapp:destroy', () => {
    destroyNavBrowserView()
    return { ok: true }
  })
  ipcMain.handle('navapp:reload', () => {
    navBrowserView?.webContents.reload()
    return { ok: true }
  })
  ipcMain.handle('navapp:getPlayback', () => getNavAppPlaybackState())
  ipcMain.handle('navapp:setTheme', (_e, theme: string) => {
    applyNavAppAppearance(theme)
    return { ok: true }
  })
  ipcMain.handle('embedded:openAuth', (_e, args: { partition: string; url: string; title?: string }) => {
    if (!args?.partition || !args?.url) return { ok: false }
    openAuthWindow(args)
    return { ok: true }
  })
  ipcMain.handle('browser:importChromeCookies', async () => importChromeCookiesToNotch())
  ipcMain.handle('embedded:guestPreloadPath', () => pathToFileURL(GUEST_PRELOAD).href)

  ipcMain.handle('build:pickProjectFolder', async () => {
    const win = centralWindow && !centralWindow.isDestroyed() ? centralWindow : BrowserWindow.getFocusedWindow()
    const opts = {
      properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[],
      defaultPath: join(homedir(), 'Projects')
    }
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  ipcMain.handle('build:createProjectFolder', async (_e, args: { name?: string; parent?: string }) => {
    const parent = args?.parent?.trim() || join(homedir(), 'Projects')
    const name = String(args?.name ?? '')
      .trim()
      .replace(/[^\w.-]+/g, '-')
    if (!name) return null
    const dir = join(parent, name)
    mkdirSync(dir, { recursive: true })
    return dir
  })

  ipcMain.handle('build:openInCursor', async (_e, projectPath: string) => {
    const path = String(projectPath ?? '').trim()
    if (!path) return { ok: false, error: 'No project path' }
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn('open', ['-a', 'Cursor', path], { stdio: 'ignore' })
        child.once('error', reject)
        child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))))
      })
      return { ok: true }
    } catch {
      try {
        const err = await shell.openPath(path)
        if (err) return { ok: false, error: err }
        return { ok: true }
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    }
  })

  console.log('[stream] central + mobile ready · mobile hidden until ⌘⇧M')
})

} // gotSingleInstanceLock

app.on('will-quit', () => {
  stopPackagedApi()
  if (!SIM) void callSession?.end().catch(() => {})
  audioTap?.stop()
  globalShortcut.unregisterAll()
})
app.on('window-all-closed', () => {})
app.on('activate', () => {
  if (!app.isReady()) return
  registerShortcuts()
  if (centralWindow && !centralWindow.isDestroyed()) {
    centralWindow.show()
    centralWindow.focus()
  } else if (!mobileOnly) {
    centralWindow = createCentralWindow()
  }
})
