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
    }
    notchDesktop?: { openExternal: (url: string) => void }
  }
}

export {}
