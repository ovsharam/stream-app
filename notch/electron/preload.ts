import { contextBridge, ipcRenderer } from 'electron'

// Inject the API base URL into the renderer so api.ts can read it without
// hard-coding localhost. Set by main.ts based on PLUMB_API_URL env var.
contextBridge.exposeInMainWorld('__PLUMB_API_URL__', process.env.PLUMB_API_URL ?? null)

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
  onAgentProposalAlert: (
    cb: (payload: { proposalId?: string; title?: string; body?: string }) => void
  ) => {
    const handler = (_: unknown, payload: { proposalId?: string; title?: string; body?: string }) =>
      cb(payload)
    ipcRenderer.on('agent:proposal-alert', handler)
    return () => ipcRenderer.removeListener('agent:proposal-alert', handler)
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
  openExternal: (url: string) => ipcRenderer.send('shell:open', url),
  showNavApp: (args: {
    partition: string
    url: string
    bounds: { x: number; y: number; width: number; height: number }
    layout?: 'full' | 'mini'
  }) => ipcRenderer.invoke('navapp:show', args),
  hideNavApp: () => ipcRenderer.invoke('navapp:hide'),
  destroyNavApp: () => ipcRenderer.invoke('navapp:destroy'),
  reloadNavApp: () => ipcRenderer.invoke('navapp:reload'),
  getNavAppPlayback: () => ipcRenderer.invoke('navapp:getPlayback') as Promise<{ playing: boolean }>,
  setNavAppTheme: (theme: string) => ipcRenderer.invoke('navapp:setTheme', theme),
  openAuthWindow: (args: { partition: string; url: string; title?: string }) => ipcRenderer.invoke('embedded:openAuth', args),
  onAuthClosed: (cb: (partition: string) => void) => {
    const handler = (_: unknown, partition: string) => cb(partition)
    ipcRenderer.on('embedded:auth-closed', handler)
    return () => ipcRenderer.removeListener('embedded:auth-closed', handler)
  },
  onGoogleSignInNeeded: (cb: (partition: string) => void) => {
    const handler = (_: unknown, partition: string) => cb(partition)
    ipcRenderer.on('embedded:google-signin-needed', handler)
    return () => ipcRenderer.removeListener('embedded:google-signin-needed', handler)
  },
  onEmbedSignInNeeded: (cb: (partition: string) => void) => {
    const handler = (_: unknown, partition: string) => cb(partition)
    ipcRenderer.on('embedded:embed-signin-needed', handler)
    return () => ipcRenderer.removeListener('embedded:embed-signin-needed', handler)
  },
  onAuthExternalFallback: (cb: (partition: string) => void) => {
    const handler = (_: unknown, partition: string) => cb(partition)
    ipcRenderer.on('embedded:auth-external-fallback', handler)
    return () => ipcRenderer.removeListener('embedded:auth-external-fallback', handler)
  },
  onNavAppRendererReady: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('navapp:renderer-ready', handler)
    return () => ipcRenderer.removeListener('navapp:renderer-ready', handler)
  },
  onOpenUrl: (cb: (url: string) => void) => {
    const handler = (_: unknown, url: string) => cb(url)
    ipcRenderer.on('embedded:open-url', handler)
    return () => ipcRenderer.removeListener('embedded:open-url', handler)
  },
  getGuestPreloadPath: () => ipcRenderer.invoke('embedded:guestPreloadPath') as Promise<string>,
  importChromeCookies: () =>
    ipcRenderer.invoke('browser:importChromeCookies') as Promise<{
      ok: boolean
      imported: number
      skipped: number
      error?: string
    }>,
  pickProjectFolder: () => ipcRenderer.invoke('build:pickProjectFolder') as Promise<string | null>,
  createProjectFolder: (args: { name: string; parent?: string }) =>
    ipcRenderer.invoke('build:createProjectFolder', args) as Promise<string | null>,
  openProjectInCursor: (projectPath: string) =>
    ipcRenderer.invoke('build:openInCursor', projectPath) as Promise<{ ok: boolean; error?: string }>,
  showNotification: (args: { title: string; body: string; proposalId?: string }) =>
    ipcRenderer.invoke('desktop:showNotification', args) as Promise<{ ok: boolean }>,
  onOpenAgentProposal: (cb: (proposalId: string) => void) => {
    const handler = (_: unknown, proposalId: string) => cb(proposalId)
    ipcRenderer.on('desktop:open-agent-proposal', handler)
    return () => ipcRenderer.removeListener('desktop:open-agent-proposal', handler)
  }
})

declare global {
  interface Window {
    notch?: {
      hide: () => void
      getMode: () => Promise<DropletPhase>
      onMode: (cb: (mode: DropletPhase) => void) => () => void
      onFocusSearch: (cb: () => void) => () => void
      onSimRefresh: (cb: () => void) => () => void
      onAgentProposalAlert?: (
        cb: (payload: { proposalId?: string; title?: string; body?: string }) => void
      ) => () => void
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
    notchDesktop?: {
      openExternal: (url: string) => void
      showNavApp?: (args: {
        partition: string
        url: string
        bounds: { x: number; y: number; width: number; height: number }
        layout?: 'full' | 'mini'
      }) => Promise<{ ok: boolean }>
      hideNavApp?: () => Promise<{ ok: boolean }>
      destroyNavApp?: () => Promise<{ ok: boolean }>
      reloadNavApp?: () => Promise<{ ok: boolean }>
      getNavAppPlayback?: () => Promise<{ playing: boolean }>
      setNavAppTheme?: (theme: string) => Promise<{ ok: boolean }>
      openAuthWindow?: (args: { partition: string; url: string; title?: string }) => Promise<{ ok: boolean }>
      onAuthClosed?: (cb: (partition: string) => void) => () => void
      onGoogleSignInNeeded?: (cb: (partition: string) => void) => () => void
      onEmbedSignInNeeded?: (cb: (partition: string) => void) => () => void
      onAuthExternalFallback?: (cb: (partition: string) => void) => () => void
      onNavAppRendererReady?: (cb: () => void) => () => void
      onOpenUrl?: (cb: (url: string) => void) => () => void
      getGuestPreloadPath?: () => Promise<string>
      importChromeCookies?: () => Promise<{
        ok: boolean
        imported: number
        skipped: number
        error?: string
      }>
      pickProjectFolder?: () => Promise<string | null>
      createProjectFolder?: (args: { name: string; parent?: string }) => Promise<string | null>
      openProjectInCursor?: (projectPath: string) => Promise<{ ok: boolean }>
      showNotification?: (args: {
        title: string
        body: string
        proposalId?: string
      }) => Promise<{ ok: boolean }>
      onOpenAgentProposal?: (cb: (proposalId: string) => void) => () => void
    }
  }
}

export {}
