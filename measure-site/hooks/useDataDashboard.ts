'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import type { DashboardActivity, DataDashboardSnapshot } from '@shared/dashboard'
import { emptyIntentionBlock, emptyInsights } from '@shared/dashboard'
import type { IntentionEpisode } from '@shared/intention-episode'
import { formatEpisodeChain } from '@shared/intention-episode'
import { streamItemFromApi } from '@shared/serialize'
import { dashboardApi } from '@/lib/dashboard-api'
import type { DashboardApiStatus } from '@/lib/dashboard-status'
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

async function fetchApiStatus(): Promise<DashboardApiStatus> {
  const res = await fetch('/api/dashboard/status', { credentials: 'include', cache: 'no-store' })
  if (!res.ok) {
    return {
      configured: false,
      reachable: false,
      reason: 'unreachable',
      message: res.status === 401 ? 'Sign in to load dashboard data.' : 'Could not check STREAM API status.'
    }
  }
  return (await res.json()) as DashboardApiStatus
}

export function useDataDashboard() {
  const [snapshot, setSnapshot] = useState<DataDashboardSnapshot | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [apiStatus, setApiStatus] = useState<DashboardApiStatus>({ configured: false, reachable: false, checking: true })
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

  const checkStatus = useCallback(async () => {
    const status = await fetchApiStatus()
    setApiStatus({ ...status, checking: false })
    return status
  }, [])

  const refresh = useCallback(async (since?: number) => {
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
      setApiStatus((prev) => ({ ...prev, configured: true, reachable: true, checking: false }))
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load dashboard'
      setError(message)
      if (message.includes('not configured') || message.includes('503')) {
        setApiStatus({
          configured: false,
          reachable: false,
          checking: false,
          reason: 'missing_env'
        })
      } else {
        void checkStatus()
      }
      setSnapshot((prev) => prev ?? emptyDashboardSnapshot())
    } finally {
      setLoading(false)
    }
  }, [checkStatus])

  useEffect(() => {
    void (async () => {
      await checkStatus()
      try {
        await refresh()
      } catch {
        /* refresh sets error + empty snapshot if both live and cache fail */
      } finally {
        setLoading(false)
      }
    })()

    let pollTimer: ReturnType<typeof setInterval> | null = null
    const startPolling = () => {
      if (pollTimer) return
      pollTimer = setInterval(() => {
        void refresh(lastFetchRef.current || Date.now() - 30_000)
      }, 10_000)
    }

    let cancelled = false

    void (async () => {
      try {
        const res = await fetch('/api/dashboard/live-token', { credentials: 'include', cache: 'no-store' })
        if (cancelled || !res.ok) {
          startPolling()
          return
        }
        const { socketUrl, token } = (await res.json()) as { socketUrl?: string; token?: string }
        if (cancelled || !socketUrl) {
          startPolling()
          return
        }

        const socket = io(socketUrl, {
          path: '/socket.io',
          transports: ['websocket', 'polling'],
          withCredentials: true,
          auth: token ? { token } : undefined
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
    })()

    startPolling()

    const statusTimer = setInterval(() => {
      void checkStatus()
    }, 30_000)

    return () => {
      cancelled = true
      if (pollTimer) clearInterval(pollTimer)
      clearInterval(statusTimer)
      socketRef.current?.disconnect()
      socketRef.current = null
    }
  }, [applyActivity, applyEpisode, checkStatus, refresh])

  return {
    snapshot,
    connected,
    error,
    loading,
    refresh,
    apiStatus,
    apiConfigured: apiStatus.reachable
  }
}
