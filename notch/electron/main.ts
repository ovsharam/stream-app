import 'dotenv/config'
import { app, BrowserWindow, globalShortcut, screen, Tray, nativeImage, ipcMain, shell } from 'electron'
import type { NativeImage } from 'electron'
import { join } from 'path'

const isDev = !app.isPackaged
const CENTRAL_URL = isDev
  ? 'http://localhost:5174/central.html'
  : `file://${join(__dirname, '../dist-renderer/central.html')}`
const MOBILE_URL = isDev
  ? 'http://localhost:5174/'
  : `file://${join(__dirname, '../dist-renderer/index.html')}`

const DROPLET_IDLE = { w: 48, h: 56 }
const DROPLET_EXPANDED = { w: 400, h: 480 }

let centralWindow: BrowserWindow | null = null
let dropletWindow: BrowserWindow | null = null
let tray: Tray | null = null
let dropletExpanded = false

function dropletPosition(expanded: boolean): { x: number; y: number; w: number; h: number } {
  const { width } = screen.getPrimaryDisplay().workAreaSize
  const w = expanded ? DROPLET_EXPANDED.w : DROPLET_IDLE.w
  const h = expanded ? DROPLET_EXPANDED.h : DROPLET_IDLE.h
  return { x: Math.round((width - w) / 2), y: expanded ? 28 : 4, w, h }
}

function setDropletExpanded(expanded: boolean): void {
  if (!dropletWindow) return
  dropletExpanded = expanded
  const { x, y, w, h } = dropletPosition(expanded)
  dropletWindow.setBounds({ x, y, width: w, height: h }, true)
  dropletWindow.setFocusable(expanded)
  if (expanded) {
    dropletWindow.focus()
    dropletWindow.webContents.send('notch:mode', 'expanded')
  } else {
    dropletWindow.webContents.send('notch:mode', 'idle')
  }
}

function toggleDroplet(): void {
  setDropletExpanded(!dropletExpanded)
}

function createCentralWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'Notch',
    backgroundColor: '#ffffff',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.loadURL(CENTRAL_URL)
  return win
}

function createDropletWindow(): BrowserWindow {
  const { x, y, w, h } = dropletPosition(false)

  const win = new BrowserWindow({
    width: w,
    height: h,
    x,
    y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    movable: true,
    resizable: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.loadURL(MOBILE_URL)
  win.show()

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
  centralWindow = createCentralWindow()
  dropletWindow = createDropletWindow()

  tray = new Tray(createTrayIcon())
  tray.setToolTip('Notch — Central + Mobile')
  tray.setContextMenu(
    require('electron').Menu.buildFromTemplate([
      { label: 'Central stream', click: () => centralWindow?.show() },
      { label: 'Mobile assist (⌘⇧Space)', click: toggleDroplet },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  )

  globalShortcut.register('CommandOrControl+Shift+Space', toggleDroplet)

  ipcMain.on('notch:collapse', () => setDropletExpanded(false))
  ipcMain.on('notch:expand', () => setDropletExpanded(true))
  ipcMain.on('shell:open', (_e, url: string) => {
    if (typeof url === 'string' && url.startsWith('http')) void shell.openExternal(url)
  })

  console.log('[notch] desktop apps ready — central stream + mobile droplet · ⌘⇧Space')
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  /* tray */
})
