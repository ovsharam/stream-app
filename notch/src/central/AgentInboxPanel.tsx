import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CentralStreamEvent } from '@shared/cluster'
import { agentApi } from '../lib/api'
import {
  buildDraftInboxItems,
  buildStatusInboxItems,
  mergeAgentInboxItems
} from './agentInboxItems'
import { AgentInboxDraftRow, AgentInboxStatusRow } from './AgentInboxRows'

type Props = {
  events?: CentralStreamEvent[]
  onOpenBuildDojo?: () => void
}

export function AgentInboxPanel({ events = [], onOpenBuildDojo }: Props) {
  const [proposals, setProposals] = useState<Awaited<ReturnType<typeof agentApi.listProposals>>['proposals']>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await agentApi.listProposals('pending')
      setProposals(data.proposals)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load agent inbox')
    }
  }, [])

  useEffect(() => {
    void load()
    const onProposal = () => void load()
    window.addEventListener('notch:agent-proposal', onProposal)
    return () => window.removeEventListener('notch:agent-proposal', onProposal)
  }, [load])

  const items = useMemo(
    () =>
      mergeAgentInboxItems(buildStatusInboxItems(events), buildDraftInboxItems(proposals)),
    [events, proposals]
  )

  return (
    <div className="x-rail-tab-body x-agent-inbox">
      {error ? <p className="x-agent-inbox-error">{error}</p> : null}

      {items.length === 0 ? (
        <div className="x-agent-inbox-empty">
          <p className="x-agent-inbox-empty-title">Nothing pending</p>
          <p className="x-agent-inbox-empty-hint">
            Draft replies and running builds show up here when they need you.
          </p>
        </div>
      ) : (
        <ul className="x-agent-inbox-list">
          {items.map((item) =>
            item.kind === 'status' ? (
              <li key={item.id} className="x-agent-inbox-entry">
                <AgentInboxStatusRow item={item} onOpenBuildDojo={onOpenBuildDojo} />
              </li>
            ) : (
              <li key={item.id} className="x-agent-inbox-entry">
                <AgentInboxDraftRow item={item} onComplete={load} />
              </li>
            )
          )}
        </ul>
      )}
    </div>
  )
}
