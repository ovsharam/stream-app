import { contextBridge, ipcRenderer } from 'electron'

type DropletMode = 'idle' | 'expanded'

contextBridge.exposeInMainWorld('notch', {
  collapse: () => ipcRenderer.send('notch:collapse'),
  expand: () => ipcRenderer.send('notch:expand'),
  onMode: (cb: (mode: DropletMode) => void) => {
    const handler = (_: unknown, mode: DropletMode) => cb(mode)
    ipcRenderer.on('notch:mode', handler)
    return () => ipcRenderer.removeListener('notch:mode', handler)
  }
})

declare global {
  interface Window {
    notch: {
      collapse: () => void
      expand: () => void
      onMode: (cb: (mode: DropletMode) => void) => () => void
    }
  }
}

export {}
