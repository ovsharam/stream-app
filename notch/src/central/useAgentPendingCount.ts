import { useCallback, useEffect, useState } from 'react'
import { agentApi } from '../lib/api'

export function useAgentPendingCount(): number {
  const [count, setCount] = useState(0)
  const [pendingDismiss, setPendingDismiss] = useState<Set<string>>(() => new Set())

  const load = useCallback(async () => {
    try {
      const data = await agentApi.listProposals('pending')
      setCount(data.pendingCount ?? data.proposals.length)
    } catch {
      /* ignore — badge is optional */
    }
  }, [])

  useEffect(() => {
    void load()
    const interval = window.setInterval(() => void load(), 15_000)
    const onProposal = () => void load()
    window.addEventListener('notch:agent-proposal', onProposal)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('notch:agent-proposal', onProposal)
    }
  }, [load])

  useEffect(() => {
    const addPending = (e: Event) => {
      const id = (e as CustomEvent<{ proposalId?: string }>).detail?.proposalId
      if (!id) return
      setPendingDismiss((prev) => new Set(prev).add(id))
    }
    const removePending = (e: Event) => {
      const id = (e as CustomEvent<{ proposalId?: string }>).detail?.proposalId
      if (!id) return
      setPendingDismiss((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
    window.addEventListener('notch:agent-proposal-dismiss-pending', addPending)
    window.addEventListener('notch:agent-proposal-dismiss-cancelled', removePending)
    window.addEventListener('notch:agent-proposal-resolved', removePending)
    return () => {
      window.removeEventListener('notch:agent-proposal-dismiss-pending', addPending)
      window.removeEventListener('notch:agent-proposal-dismiss-cancelled', removePending)
      window.removeEventListener('notch:agent-proposal-resolved', removePending)
    }
  }, [])

  return Math.max(0, count - pendingDismiss.size)
}
