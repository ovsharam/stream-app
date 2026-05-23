import { contextBridge, ipcRenderer } from 'electron'
import type { NotchStatePayload } from '../src/types'

contextBridge.exposeInMainWorld('notch', {
  getState: (): Promise<NotchStatePayload> => ipcRenderer.invoke('notch:getState'),
  onState: (cb: (state: NotchStatePayload) => void) => {
    const handler = (_: unknown, state: NotchStatePayload) => cb(state)
    ipcRenderer.on('notch:state', handler)
    return () => ipcRenderer.removeListener('notch:state', handler)
  },
  togglePoint: (idx: number) => ipcRenderer.send('notch:togglePoint', idx),
  closeSearch: () => ipcRenderer.send('notch:closeSearch'),
  startCall: () => ipcRenderer.send('notch:startCall'),
  endCall: () => ipcRenderer.send('notch:endCall'),
  loadPreCall: () => ipcRenderer.send('notch:loadPreCall')
})
