import 'dotenv/config'
import { app, BrowserWindow, globalShortcut, screen, Tray, nativeImage, ipcMain, shell } from 'electron'
import type { BrowserWindow as BW, Input } from 'electron'
import type { NativeImage } from 'electron'
import { join } from 'path'

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
}

function createCentralWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 860,
    minWidth: 988,
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
      { label: 'Quit', click: () => app.quit() }
    ])
  )

  registerShortcuts()

  ipcMain.on('notch:hide', () => hideMobile())
  ipcMain.handle('notch:getMode', () => (mobileVisible ? 'open' : 'hidden'))
  ipcMain.on('shell:open', (_e, url: string) => {
    if (typeof url === 'string' && url.startsWith('http')) void shell.openExternal(url)
  })

  console.log('[stream] central + mobile ready · mobile hidden until ⌘⇧M')
})

app.on('will-quit', () => globalShortcut.unregisterAll())
app.on('window-all-closed', () => {})
app.on('activate', () => registerShortcuts())
