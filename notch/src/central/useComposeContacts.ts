import { useCallback, useEffect, useMemo, useState } from 'react'
import { contactsToMentionTargets } from '@shared/contacts'
import type { ComposeMentionTarget } from '@shared/compose'
import { contactsApi } from '../lib/api'

export function useComposeContacts(enabled = true) {
  const [mentionTargets, setMentionTargets] = useState<ComposeMentionTarget[]>([])
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const applyState = useCallback((state: import('@shared/contacts').ContactsState) => {
    setMentionTargets(contactsToMentionTargets(state.contacts))
    setError(state.error ?? null)
  }, [])

  const sync = useCallback(async () => {
    setSyncing(true)
    try {
      const state = await contactsApi.sync()
      applyState(state)
      return state
    } finally {
      setSyncing(false)
    }
  }, [applyState])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    void contactsApi
      .state()
      .then((state) => {
        if (!cancelled) applyState(state)
      })
      .catch(() => {})

    const onUpdated = () => {
      void contactsApi
        .state()
        .then((state) => {
          if (!cancelled) applyState(state)
        })
        .catch(() => {})
    }
    window.addEventListener('notch:contacts-updated', onUpdated)

    return () => {
      cancelled = true
      window.removeEventListener('notch:contacts-updated', onUpdated)
    }
  }, [enabled, applyState])

  return useMemo(
    () => ({ mentionTargets, syncing, sync, error }),
    [mentionTargets, syncing, sync, error]
  )
}
