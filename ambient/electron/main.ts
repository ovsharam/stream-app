import { app, BrowserWindow, globalShortcut, screen, Tray, nativeImage } from 'electron'
import { join } from 'path'

const WEB_URL = process.env.AMBIENT_URL ?? 'http://localhost:3000'
const isDev = !app.isPackaged

let summonWindow: BrowserWindow | null = null
let notchWindow: BrowserWindow | null = null
let tray: Tray | null = null

function createSummonWindow(): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  const win = new BrowserWindow({
    width: 560,
    height: 520,
    x: Math.round((width - 560) / 2),
    y: Math.round(height * 0.12),
    frame: false,
    transparent: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    resizable: false,
    movable: true,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.loadURL(`${WEB_URL}/ambient/summon`)
  win.on('blur', () => win.hide())

  return win
}

function createNotchWindow(): BrowserWindow {
  const { width } = screen.getPrimaryDisplay().workAreaSize
  const barWidth = 520
  const barHeight = 36

  const win = new BrowserWindow({
    width: barWidth,
    height: barHeight,
    x: Math.round((width - barWidth) / 2),
    y: 8,
    frame: false,
    transparent: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.setIgnoreMouseEvents(false)
  win.loadURL(`${WEB_URL}/ambient/notch`)
  win.show()

  return win
}

function toggleSummon(): void {
  if (!summonWindow) summonWindow = createSummonWindow()

  if (summonWindow.isVisible()) {
    summonWindow.hide()
  } else {
    summonWindow.show()
    summonWindow.focus()
  }
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock?.hide()

  notchWindow = createNotchWindow()

  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setToolTip('STREAM Copilot')
  tray.setContextMenu(
    require('electron').Menu.buildFromTemplate([
      { label: 'Summon (⌥Space)', click: toggleSummon },
      { label: 'Toggle Notch', click: () => notchWindow?.isVisible() ? notchWindow.hide() : notchWindow?.show() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  )

  globalShortcut.register('Alt+Space', toggleSummon)

  console.log('[ambient] ready — ⌥Space to summon')
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  // Keep running in tray
})
