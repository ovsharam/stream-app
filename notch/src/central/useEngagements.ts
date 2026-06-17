import { useCallback, useEffect, useState } from 'react'
import type { FdeEngagement } from '@shared/fde-engagement'
import { clusterApi } from '../lib/api'

const CACHE_KEY = 'stream.central.engagements'

function readCachedEngagements(): FdeEngagement[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as FdeEngagement[]) : []
  } catch {
    return []
  }
}

function writeCachedEngagements(list: FdeEngagement[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(list))
  } catch {
    /* ignore quota */
  }
}

export function useEngagements() {
  const [engagements, setEngagements] = useState<FdeEngagement[]>(() => readCachedEngagements())
  const [refreshing, setRefreshing] = useState(false)
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set())

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setRefreshing(true)
    try {
      const data = await clusterApi.engagements()
      setEngagements(data.engagements)
      writeCachedEngagements(data.engagements)
    } catch {
      /* keep stale cache */
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load({ silent: readCachedEngagements().length > 0 })
    const onRefresh = () => void load({ silent: true })
    window.addEventListener('notch:engagements-updated', onRefresh)
    window.addEventListener('notch:stream-push', onRefresh)
    window.addEventListener('stream:user-role', onRefresh)
    return () => {
      window.removeEventListener('notch:engagements-updated', onRefresh)
      window.removeEventListener('notch:stream-push', onRefresh)
      window.removeEventListener('stream:user-role', onRefresh)
    }
  }, [load])

  const patch = useCallback(
    async (id: string, patchFields: Partial<FdeEngagement>) => {
      const prev = engagements.find((e) => e.id === id)
      if (!prev) return

      setEngagements((list) => list.map((e) => (e.id === id ? { ...e, ...patchFields } : e)))
      setPendingIds((s) => new Set(s).add(id))

      try {
        const { engagement } = await clusterApi.patchEngagement(id, patchFields)
        setEngagements((list) => {
          const next = list.map((e) => (e.id === id ? engagement : e))
          writeCachedEngagements(next)
          return next
        })
        window.dispatchEvent(new Event('notch:engagements-updated'))
      } catch {
        setEngagements((list) => list.map((e) => (e.id === id ? prev : e)))
      } finally {
        setPendingIds((s) => {
          const next = new Set(s)
          next.delete(id)
          return next
        })
      }
    },
    [engagements]
  )

  const create = useCallback(async (input: { clientName: string; company?: string }) => {
    const { engagement } = await clusterApi.createEngagement(input)
    setEngagements((list) => {
      const next = [engagement, ...list]
      writeCachedEngagements(next)
      return next
    })
    window.dispatchEvent(new Event('notch:engagements-updated'))
    return engagement
  }, [])

  return { engagements, refreshing, pendingIds, load, patch, create }
}
