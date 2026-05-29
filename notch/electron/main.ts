import 'dotenv/config'
import { app, BrowserWindow, globalShortcut, screen, Tray, nativeImage, ipcMain, shell, dialog } from 'electron'
import type { BrowserWindow as BW, Input } from 'electron'
import type { NativeImage } from 'electron'
import { join } from 'path'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { AudioTap, resolveWhisperRoot } from './services/AudioTap'
import { CallSessionManager } from './services/CallSessionManager'

const isDev = !app.isPackaged
const mobileOnly = process.argv.includes('--mobile-only')
const SIM = process.env.SIMULATION_MODE === 'true' || process.env.DEMO_MODE === '1'
const HOTKEY = 'CommandOrControl+Shift+M'
const API = 'http://localhost:3131'

const CENTRAL_URL = isDev
  ? 'http://localhost:5174/central.html'
  : `file://${join(__dirname, '../dist-renderer/central.html')}`
const MOBILE_URL = isDev
  ? 'http://localhost:5174/'
  : `file://${join(__dirname, '../dist-renderer/index.html')}`

const MOBILE_SIZE = { w: 280, h: 420 }

let centralWindow: BrowserWindow | null = null
let mobileWindow: BrowserWindow | null = null
let tray: Tray | null = null
let mobileVisible = false
let mobilePosition: { x: number; y: number } | null = null
let audioTap: AudioTap | null = null
let callSession: CallSessionManager | null = null

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
    })
    callSession.on('chunk-sent', (chunk) => {
      mobileWindow?.webContents.send('meeting:chunk', chunk)
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
  globalShortcut.unregisterAll()
  const ok = globalShortcut.register(HOTKEY, toggleMobile)
  if (!ok) console.error(`[notch] failed to register ${HOTKEY}`)
  else console.log(`[notch] ${HOTKEY} registered`)

  if (SIM) {
    globalShortcut.register('CommandOrControl+Shift+D', () => void simPost('/sim/start-call'))
    globalShortcut.register('CommandOrControl+Shift+E', () => void simPost('/sim/end-call'))
    console.log('[notch] sim shortcuts: ⌘⇧D start call · ⌘⇧E end call')
  }

  // Meeting capture hotkeys (live calls)
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

function createCentralWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 860,
    minWidth: 1008,
    minHeight: 560,
    title: 'Stream',
    backgroundColor: '#0E0E12',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  })

  wireLocalHotkey(win, toggleMobile)
  win.loadURL(CENTRAL_URL)
  win.show()
  win.focus()
  win.on('closed', () => {
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

app.whenReady().then(() => {
  mobileWindow = createMobileWindow()
  if (!mobileOnly) centralWindow = createCentralWindow()

  tray = new Tray(createTrayIcon())
  tray.setToolTip('Stream — ⌘⇧M mobile cluster')
  tray.setContextMenu(
    require('electron').Menu.buildFromTemplate([
      {
        label: 'Stream Central',
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
    return ensureCallSession().start(args ?? {})
  })
  ipcMain.handle('meeting:end', async () => {
    return ensureCallSession().end()
  })
  ipcMain.handle('meeting:star', async (_e, text?: string) => {
    return ensureCallSession().starMoment(text)
  })
  ipcMain.handle('meeting:status', () => ensureCallSession().status())
  ipcMain.on('shell:open', (_e, url: string) => {
    if (typeof url === 'string' && url.startsWith('http')) void shell.openExternal(url)
  })

  console.log('[stream] central + mobile ready · mobile hidden until ⌘⇧M')
})

app.on('will-quit', () => {
  void callSession?.end().catch(() => {})
  audioTap?.stop()
  globalShortcut.unregisterAll()
})
app.on('window-all-closed', () => {})
app.on('activate', () => registerShortcuts())
