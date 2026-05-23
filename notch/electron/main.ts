import 'dotenv/config'
import { app, BrowserWindow, globalShortcut, screen, Tray, nativeImage, ipcMain } from 'electron'
import type { NativeImage } from 'electron'
import { join } from 'path'
import { SimulationEngine } from '../simulation/SimulationEngine'
import { GraphStore } from '../graph/GraphStore'
import type {
  ExtractedSignal,
  LoadBearingGap,
  Phase,
  PostCallSummary,
  PreCallPrep,
  TechnicalQuestion
} from '../simulation/types'

const isDev = !app.isPackaged
const RENDERER_URL = isDev
  ? 'http://localhost:5174'
  : `file://${join(__dirname, '../dist-renderer/index.html')}`

type LiveState = {
  transcript: { speaker: string; text: string }[]
  liveAnswer: TechnicalQuestion | null
  loadBearing: LoadBearingGap[]
  signals: ExtractedSignal[]
  checkedPoints: Set<number>
}

type NotchState = {
  phase: Phase
  prep: PreCallPrep | null
  live: LiveState
  postCall: PostCallSummary | null
  searchOpen: boolean
  callActive: boolean
  simulationMode: boolean
}

let panelWindow: BrowserWindow | null = null
let tray: Tray | null = null
let engine: SimulationEngine
let graph: GraphStore
let state: NotchState
let sessionId = ''

function defaultLive(): LiveState {
  return {
    transcript: [],
    liveAnswer: null,
    loadBearing: [],
    signals: [],
    checkedPoints: new Set()
  }
}

function broadcast(): void {
  panelWindow?.webContents.send('notch:state', {
    ...state,
    live: { ...state.live, checkedPoints: [...state.live.checkedPoints] }
  })
}

function setPhase(phase: Phase): void {
  state.phase = phase
  state.callActive = phase === 'live_call'
  updateTray()
  broadcast()
}

async function loadPreCall(): Promise<void> {
  const scenario = engine.getScenario()
  state.prep = await engine.getPreCallPrep(scenario.active_deal_id)
  state.live = defaultLive()
  state.postCall = null
  setPhase('pre_call')
}

async function startCall(): Promise<void> {
  const scenario = engine.getScenario()
  sessionId = `session-${Date.now()}`
  state.live = defaultLive()
  setPhase('live_call')

  engine.startCallReplay(
    scenario.call_id,
    {
      onTranscriptChunk: (speaker, text) => {
        state.live.transcript.push({ speaker, text })
        if (state.live.transcript.length > 20) state.live.transcript.shift()
        broadcast()
      },
      onSignalDetected: (signal) => {
        state.live.signals.push(signal)
        graph.addSessionSignals(scenario.active_deal_id, sessionId, [signal])
        broadcast()
      },
      onTechnicalQuestion: (trigger) => {
        state.live.liveAnswer = trigger
        broadcast()
      },
      onLoadBearingGap: (gap) => {
        state.live.loadBearing.push(gap)
        broadcast()
      },
      onCallEnd: (summary) => {
        finishCall(summary)
      }
    },
    scenario.replay_speed
  )
}

function finishCall(summary: PostCallSummary): void {
  engine.stopCallReplay()
  const scenario = engine.getScenario()
  graph.saveSession(
    sessionId,
    scenario.active_deal_id,
    'post_call',
    JSON.stringify(state.live.transcript),
    summary.summary,
    summary.signals
  )
  state.postCall = summary
  setPhase('post_call')
}

async function endCall(): Promise<void> {
  engine.stopCallReplay()
  const summary = await engine.getPostCallSummary(sessionId || 'manual')
  finishCall(summary)
}

function createPanelWindow(): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const panelWidth = 320
  const panelHeight = 700

  const win = new BrowserWindow({
    width: panelWidth,
    height: panelHeight,
    x: width - panelWidth - 12,
    y: 48,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    focusable: true,
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
  win.loadURL(RENDERER_URL)
  win.show()

  return win
}

function createTrayIcon(callActive: boolean): NativeImage {
  const size = 16
  const canvas = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    const o = i * 4
    const x = i % size
    const y = Math.floor(i / size)
    const cx = size / 2
    const cy = size / 2
    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    if (dist < 5) {
      canvas[o] = callActive ? 80 : 180
      canvas[o + 1] = callActive ? 220 : 180
      canvas[o + 2] = callActive ? 120 : 180
      canvas[o + 3] = 255
    }
  }
  return nativeImage.createFromBuffer(canvas, { width: size, height: size })
}

function updateTray(): void {
  if (!tray) return
  tray.setImage(createTrayIcon(state.callActive))
  tray.setToolTip(state.callActive ? 'Notch — call active' : 'Notch — idle')
}

app.whenReady().then(async () => {
  if (process.platform === 'darwin') app.dock?.hide()

  const simulationMode = process.env.SIMULATION_MODE !== 'false'
  engine = new SimulationEngine('live-call-demo')
  engine.setMode(simulationMode ? 'simulation' : 'live')
  graph = new GraphStore()

  const deal = await engine.getDealContext(engine.getScenario().active_deal_id)
  graph.ingestDeal(deal)

  state = {
    phase: 'idle',
    prep: null,
    live: defaultLive(),
    postCall: null,
    searchOpen: false,
    callActive: false,
    simulationMode
  }

  panelWindow = createPanelWindow()
  await loadPreCall()

  tray = new Tray(createTrayIcon(false))
  tray.setContextMenu(
    require('electron').Menu.buildFromTemplate([
      { label: 'Pre-call prep', click: () => void loadPreCall() },
      { label: 'Start call (⌘⇧D)', click: () => void startCall() },
      { label: 'End call (⌘⇧E)', click: () => void endCall() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  )

  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    state.searchOpen = !state.searchOpen
    broadcast()
  })
  globalShortcut.register('CommandOrControl+Shift+D', () => void startCall())
  globalShortcut.register('CommandOrControl+Shift+E', () => void endCall())

  ipcMain.handle('notch:getState', () => ({
    ...state,
    live: { ...state.live, checkedPoints: [...state.live.checkedPoints] }
  }))

  ipcMain.on('notch:togglePoint', (_e, idx: number) => {
    if (state.live.checkedPoints.has(idx)) state.live.checkedPoints.delete(idx)
    else state.live.checkedPoints.add(idx)
    broadcast()
  })

  ipcMain.on('notch:closeSearch', () => {
    state.searchOpen = false
    broadcast()
  })

  ipcMain.on('notch:startCall', () => void startCall())
  ipcMain.on('notch:endCall', () => void endCall())
  ipcMain.on('notch:loadPreCall', () => void loadPreCall())

  console.log('[notch] ready — ⌘⇧D start call · ⌘⇧E end · ⌘⇧Space search')
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  graph?.close()
})

app.on('window-all-closed', () => {
  /* tray app */
})
