import { contextBridge, ipcRenderer } from 'electron'

export type DropletPhase = 'hidden' | 'open'

contextBridge.exposeInMainWorld('notch', {
  hide: () => ipcRenderer.send('notch:hide'),
  getMode: (): Promise<DropletPhase> => ipcRenderer.invoke('notch:getMode'),
  onMode: (cb: (mode: DropletPhase) => void) => {
    const handler = (_: unknown, mode: DropletPhase) => cb(mode)
    ipcRenderer.on('notch:mode', handler)
    return () => ipcRenderer.removeListener('notch:mode', handler)
  },
  onFocusSearch: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('focus-search', handler)
    return () => ipcRenderer.removeListener('focus-search', handler)
  },
  onSimRefresh: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('sim:refresh', handler)
    return () => ipcRenderer.removeListener('sim:refresh', handler)
  },
  audio: {
    start: () => ipcRenderer.invoke('audio:start'),
    stop: () => ipcRenderer.invoke('audio:stop'),
    status: () => ipcRenderer.invoke('audio:status'),
    onChunk: (cb: (chunk: { text: string; timestamp: number }) => void) => {
      const handler = (_: unknown, chunk: { text: string; timestamp: number }) => cb(chunk)
      ipcRenderer.on('audio:chunk', handler)
      return () => ipcRenderer.removeListener('audio:chunk', handler)
    },
    onError: (cb: (msg: string) => void) => {
      const handler = (_: unknown, msg: string) => cb(msg)
      ipcRenderer.on('audio:error', handler)
      return () => ipcRenderer.removeListener('audio:error', handler)
    }
  },
  whisper: {
    setup: () => ipcRenderer.invoke('whisper:setup')
  },
  meeting: {
    start: (args?: { title?: string; dealHint?: string }) => ipcRenderer.invoke('meeting:start', args),
    end: () => ipcRenderer.invoke('meeting:end'),
    star: (text?: string) => ipcRenderer.invoke('meeting:star', text),
    status: () => ipcRenderer.invoke('meeting:status'),
    onStarted: (cb: (sessionId: string) => void) => {
      const handler = (_: unknown, id: string) => cb(id)
      ipcRenderer.on('meeting:session-started', handler)
      return () => ipcRenderer.removeListener('meeting:session-started', handler)
    },
    onEnded: (cb: (result: unknown) => void) => {
      const handler = (_: unknown, result: unknown) => cb(result)
      ipcRenderer.on('meeting:session-ended', handler)
      return () => ipcRenderer.removeListener('meeting:session-ended', handler)
    },
    onChunk: (cb: (chunk: { text: string; timestamp: number }) => void) => {
      const handler = (_: unknown, chunk: { text: string; timestamp: number }) => cb(chunk)
      ipcRenderer.on('meeting:chunk', handler)
      return () => ipcRenderer.removeListener('meeting:chunk', handler)
    },
    onSignal: (cb: (signal: { type: string; text: string }) => void) => {
      const handler = (_: unknown, signal: { type: string; text: string }) => cb(signal)
      ipcRenderer.on('meeting:signal', handler)
      return () => ipcRenderer.removeListener('meeting:signal', handler)
    }
  }
})

contextBridge.exposeInMainWorld('notchDesktop', {
  openExternal: (url: string) => ipcRenderer.send('shell:open', url)
})

declare global {
  interface Window {
    notch?: {
      hide: () => void
      getMode: () => Promise<DropletPhase>
      onMode: (cb: (mode: DropletPhase) => void) => () => void
      onFocusSearch: (cb: () => void) => () => void
      onSimRefresh: (cb: () => void) => () => void
      audio?: {
        start: () => Promise<{ running: boolean; whisperReady: boolean; error?: string }>
        stop: () => Promise<{ running: boolean; whisperReady: boolean; error?: string }>
        status: () => Promise<{
          running: boolean
          whisperReady: boolean
          whisperPath: string
          modelPath: string
          lastChunkAt?: number
          error?: string
        }>
        onChunk: (cb: (chunk: { text: string; timestamp: number }) => void) => () => void
        onError: (cb: (msg: string) => void) => () => void
      }
      whisper?: { setup: () => Promise<{ ok: boolean }> }
      meeting?: {
        start: (args?: { title?: string; dealHint?: string }) => Promise<{
          active: boolean
          sessionId?: string
          startedAt?: number
          chunkCount: number
          signalCount: number
          starredCount: number
        }>
        end: () => Promise<unknown>
        star: (text?: string) => Promise<{ ok: boolean }>
        status: () => Promise<{
          active: boolean
          sessionId?: string
          startedAt?: number
          chunkCount: number
          signalCount: number
          starredCount: number
        }>
        onStarted: (cb: (sessionId: string) => void) => () => void
        onEnded: (cb: (result: unknown) => void) => () => void
        onChunk: (cb: (chunk: { text: string; timestamp: number }) => void) => () => void
        onSignal: (cb: (signal: { type: string; text: string }) => void) => () => void
      }
    }
    notchDesktop?: { openExternal: (url: string) => void }
  }
}

export {}
