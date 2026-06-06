import { io, type Socket } from 'socket.io-client'

const SOCKET_URL = 'http://localhost:3131'

let socket: Socket | null = null
let connected = false

function dispatchStreamPush(): void {
  window.dispatchEvent(new Event('notch:stream-push'))
}

function dispatchEngagementsUpdated(): void {
  window.dispatchEvent(new Event('notch:engagements-updated'))
}

function onClusterRefresh(payload?: { reason?: string }): void {
  dispatchStreamPush()
  const reason = payload?.reason ?? ''
  if (reason === 'meeting-end' || reason === 'fde-engagement' || reason.startsWith('fde-')) {
    dispatchEngagementsUpdated()
  }
}

export function connectStreamSocket(): () => void {
  if (typeof window === 'undefined') return () => undefined
  if (socket) return () => undefined

  try {
    socket = io(SOCKET_URL, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 2000
    })

    socket.on('connect', () => {
      connected = true
    })

    socket.on('disconnect', () => {
      connected = false
    })

    socket.on('connect_error', () => {
      connected = false
    })

    socket.on('stream:item', () => {
      dispatchStreamPush()
    })

    socket.on('stream:update', () => {
      dispatchStreamPush()
    })

    socket.on('stream:bootstrap', () => {
      dispatchStreamPush()
    })

    socket.on('cluster:refresh', (payload?: { reason?: string }) => {
      onClusterRefresh(payload)
    })

    socket.on('agent:proposal', () => {
      window.dispatchEvent(new Event('notch:agent-proposal'))
      dispatchStreamPush()
    })

    socket.on('agent:proposal-updated', () => {
      window.dispatchEvent(new Event('notch:agent-proposal'))
      dispatchStreamPush()
    })

    socket.on('agent:brief', () => {
      window.dispatchEvent(new Event('notch:agent-proposal'))
      dispatchStreamPush()
    })
  } catch {
    connected = false
  }

  return () => {
    socket?.disconnect()
    socket = null
    connected = false
  }
}

export function isStreamSocketConnected(): boolean {
  return connected
}
