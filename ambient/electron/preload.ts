import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('ambient', {
  close: () => window.close()
})
