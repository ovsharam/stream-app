import { useCallback, useEffect, useState } from 'react'
import { agentApi } from '../lib/api'

export function useAgentPendingCount(): number {
  const [count, setCount] = useState(0)

  const load = useCallback(async () => {
    try {
      const data = await agentApi.listProposals('pending')
      setCount(data.proposals.length)
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

  return count
}
