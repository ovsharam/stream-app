import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { streamItemFromApi } from '@shared/serialize'
import { useStreamStore } from '@/store/streamStore'
import { cacheStreamItems } from '@/lib/idb-cache'
import { api } from '@/lib/api'

const SOCKET_URL =
  typeof window !== 'undefined' && process.env.NEXT_PUBLIC_SOCKET_URL
    ? process.env.NEXT_PUBLIC_SOCKET_URL
    : typeof window !== 'undefined'
      ? window.location.origin
      : ''

export function useStreamSync(enabled: boolean): void {
  const socketRef = useRef<Socket | null>(null)
  const setItems = useStreamStore((s) => s.setItems)
  const upsertItem = useStreamStore((s) => s.upsertItem)
  const updateItem = useStreamStore((s) => s.updateItem)
  const items = useStreamStore((s) => s.items)

  useEffect(() => {
    if (!enabled) return

    let pollTimer: ReturnType<typeof setInterval> | null = null
    let usePolling = process.env.NEXT_PUBLIC_USE_POLLING === '1' || !!process.env.VERCEL

    const startPolling = () => {
      if (pollTimer) return
      pollTimer = setInterval(() => {
        const since = items.length
          ? Math.max(...items.map((i) => i.timestamp.getTime()))
          : 0
        void api.pollStream(since).then(async (fresh) => {
          for (const item of fresh) upsertItem(item)
          if (fresh.length > 0) {
            const all = useStreamStore.getState().items
            await cacheStreamItems(all)
          }
        })
      }, 5000)
    }

    if (!usePolling) {
      try {
        const socket = io(SOCKET_URL, {
          path: '/socket.io',
          transports: ['websocket', 'polling'],
          withCredentials: true
        })
        socketRef.current = socket

        socket.on('connect', () => {
          if (pollTimer) {
            clearInterval(pollTimer)
            pollTimer = null
          }
        })

        socket.on('connect_error', () => {
          usePolling = true
          socket.disconnect()
          startPolling()
        })

        socket.on('stream:bootstrap', async (payload: Record<string, unknown>[]) => {
          const parsed = payload.map(streamItemFromApi)
          setItems(parsed)
          await cacheStreamItems(parsed)
        })

        socket.on('stream:item', async (payload: Record<string, unknown>) => {
          const item = streamItemFromApi(payload)
          upsertItem(item)
          await cacheStreamItems(useStreamStore.getState().items)
        })

        socket.on('stream:update', async (payload: Record<string, unknown>) => {
          updateItem(streamItemFromApi(payload))
          await cacheStreamItems(useStreamStore.getState().items)
        })
      } catch {
        startPolling()
      }
    } else {
      startPolling()
    }

    if (usePolling) startPolling()

    return () => {
      socketRef.current?.disconnect()
      if (pollTimer) clearInterval(pollTimer)
    }
  }, [enabled, setItems, upsertItem, updateItem, items])
}
