import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { Serwist } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher({ request }) {
          return request.destination === 'document'
        }
      }
    ]
  }
})

serwist.addEventListeners()

// Cache last 100 stream items for offline viewing
const STREAM_CACHE = 'stream-items-v1'

self.addEventListener('message', (event) => {
  if (event.data?.type === 'CACHE_STREAM_ITEMS' && Array.isArray(event.data.items)) {
    void caches.open(STREAM_CACHE).then(async (cache) => {
      const res = new Response(JSON.stringify(event.data.items.slice(0, 100)), {
        headers: { 'Content-Type': 'application/json' }
      })
      await cache.put('/stream-cache', res)
    })
  }
})

self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/stream') && event.request.method === 'GET') {
    event.respondWith(
      (async () => {
        try {
          const network = await fetch(event.request)
          if (network.ok) {
            const clone = network.clone()
            const data = await clone.json()
            const cache = await caches.open(STREAM_CACHE)
            await cache.put(
              '/stream-cache',
              new Response(JSON.stringify(data), {
                headers: { 'Content-Type': 'application/json' }
              })
            )
          }
          return network
        } catch {
          const cache = await caches.open(STREAM_CACHE)
          const cached = await cache.match('/stream-cache')
          if (cached) return cached
          return new Response('[]', { headers: { 'Content-Type': 'application/json' } })
        }
      })()
    )
  }
})
