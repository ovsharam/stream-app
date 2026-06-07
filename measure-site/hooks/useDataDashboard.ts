'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import type { DashboardActivity, DataDashboardSnapshot } from '@shared/dashboard'
import { emptyIntentionBlock, emptyInsights } from '@shared/dashboard'
import type { IntentionEpisode } from '@shared/intention-episode'
import { formatEpisodeChain } from '@shared/intention-episode'
import { streamItemFromApi } from '@shared/serialize'
import { dashboardApi } from '@/lib/dashboard-api'
import { hasStreamApi, streamSocketUrl } from '@/lib/stream-api-base'
import { emptyDashboardSnapshot } from '@shared/dashboard'

function mergeEpisodes(prev: IntentionEpisode[], incoming: IntentionEpisode): IntentionEpisode[] {
  const byId = new Map<string, IntentionEpisode>()
  for (const item of [incoming, ...prev]) {
    byId.set(item.id, item)
  }
  return [...byId.values()].sort((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt)).slice(0, 60)
}

function episodeToLiveActivity(episode: IntentionEpisode): DashboardActivity {
  return {
    id: `activity-${episode.id}`,
    kind: 'intention_episode',
    ts: episode.endedAt ?? episode.startedAt,
    title: `Intention ${episode.outcome ?? 'open'} · ${episode.behavioralWeight.toFixed(2)}`,
    detail: formatEpisodeChain(episode.eventChain),
    meta: {
      weight: episode.behavioralWeight,
      outcome: episode.outcome,
      source: episode.stimulusSource
    }
  }
}

function mergeActivity(prev: DashboardActivity[], incoming: DashboardActivity[]): DashboardActivity[] {
  const byId = new Map<string, DashboardActivity>()
  for (const item of [...incoming, ...prev]) {
    if (!byId.has(item.id)) byId.set(item.id, item)
  }
  return [...byId.values()].sort((a, b) => b.ts - a.ts).slice(0, 120)
}

export function useDataDashboard() {
  const [snapshot, setSnapshot] = useState<DataDashboardSnapshot | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const socketRef = useRef<Socket | null>(null)
  const lastFetchRef = useRef(0)

  const applyEpisode = useCallback((episode: IntentionEpisode) => {
    if (!episode?.id) return
    setSnapshot((prev) => {
      if (!prev) return prev
      const intention = structuredClone(prev.intention ?? emptyIntentionBlock())
      intention.episodes = mergeEpisodes(intention.episodes, episode)
      return {
        ...prev,
        generatedAt: Date.now(),
        intention,
        activity: mergeActivity(prev.activity, [episodeToLiveActivity(episode)])
      }
    })
  }, [])

  const applyActivity = useCallback((activity: DashboardActivity) => {
    setSnapshot((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        generatedAt: Date.now(),
        activity: mergeActivity(prev.activity, [activity])
      }
    })
  }, [])

  const refresh = useCallback(async (since?: number) => {
    if (!hasStreamApi()) {
      setSnapshot(emptyDashboardSnapshot())
      setError(null)
      setLoading(false)
      return
    }
    try {
      const data = await dashboardApi.getSnapshot(since)
      lastFetchRef.current = data.generatedAt
      if (since != null) {
        setSnapshot((prev) =>
          prev
            ? {
                ...data,
                activity: mergeActivity(prev.activity, data.activity),
                moments: data.moments,
                intention: data.intention ?? prev.intention ?? emptyIntentionBlock(),
                insights: data.insights ?? prev.insights ?? emptyInsights()
              }
            : data
        )
      } else {
        setSnapshot(data)
      }
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    if (!hasStreamApi()) return

    let pollTimer: ReturnType<typeof setInterval> | null = null
    const startPolling = () => {
      if (pollTimer) return
      pollTimer = setInterval(() => {
        void refresh(lastFetchRef.current || Date.now() - 30_000)
      }, 10_000)
    }

    const socketUrl = streamSocketUrl()
    if (!socketUrl) {
      startPolling()
      return () => {
        if (pollTimer) clearInterval(pollTimer)
      }
    }

    try {
      const socket = io(socketUrl, {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        withCredentials: true
      })
      socketRef.current = socket

      socket.on('connect', () => setConnected(true))
      socket.on('disconnect', () => setConnected(false))
      socket.on('connect_error', () => {
        setConnected(false)
        startPolling()
      })
      socket.on('dashboard:activity', (payload: DashboardActivity) => {
        if (payload?.id) applyActivity(payload)
      })
      socket.on('dashboard:episode', (payload: IntentionEpisode) => {
        applyEpisode(payload)
      })
      socket.on('stream:item', (payload: Record<string, unknown>) => {
        const item = streamItemFromApi(payload)
        applyActivity({
          id: item.id,
          kind: 'stream_item',
          ts: item.timestamp.getTime(),
          title: `${item.source} · ${item.sender.name}`,
          detail: (item.title ?? item.body).slice(0, 120),
          meta: { source: item.source }
        })
      })
    } catch {
      startPolling()
    }

    startPolling()

    return () => {
      if (pollTimer) clearInterval(pollTimer)
      socketRef.current?.disconnect()
      socketRef.current = null
    }
  }, [applyActivity, applyEpisode, refresh])

  return { snapshot, connected, error, loading, refresh, apiConfigured: hasStreamApi() }
}
