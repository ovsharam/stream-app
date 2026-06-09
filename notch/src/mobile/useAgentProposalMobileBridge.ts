import { useCallback, useEffect, useState } from 'react'
import { agentApi } from '../lib/api'
import { connectStreamSocket } from '../lib/streamSocket'

export type AgentProposalMobileAlert = {
  proposalId: string
  senderName: string
  summary: string
}

export function useAgentProposalMobileBridge() {
  const [pendingCount, setPendingCount] = useState(0)
  const [alert, setAlert] = useState<AgentProposalMobileAlert | null>(null)

  const refresh = useCallback(async () => {
    try {
      const data = await agentApi.listProposals('pending')
      const count = data.pendingCount ?? data.proposals.length
      setPendingCount(count)
      const latest = data.proposals[0]
      if (latest) {
        setAlert({
          proposalId: latest.id,
          senderName: latest.senderName,
          summary:
            latest.brief?.humanSummary?.slice(0, 120) ||
            latest.rawMessage.slice(0, 120) ||
            'New LinkedIn draft'
        })
      } else {
        setAlert(null)
      }
    } catch {
      /* optional on mobile */
    }
  }, [])

  useEffect(() => {
    void refresh()
    const disconnect = connectStreamSocket()
    const onProposal = () => void refresh()
    window.addEventListener('notch:agent-proposal', onProposal)

    const notchBridge = window.notch as
      | { onAgentProposalAlert?: (cb: () => void) => () => void }
      | undefined
    const offAlert = notchBridge?.onAgentProposalAlert?.(() => void refresh())

    return () => {
      disconnect()
      window.removeEventListener('notch:agent-proposal', onProposal)
      offAlert?.()
    }
  }, [refresh])

  const dismissAlert = useCallback(() => setAlert(null), [])

  return { pendingCount, alert, dismissAlert }
}
