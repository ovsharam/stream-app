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
  const [expandedId, setExpandedId] = useState<string | null>(null)

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

  useEffect(() => {
    if (expandedId && !items.some((item) => item.id === expandedId)) {
      setExpandedId(null)
    }
  }, [expandedId, items])

  return (
    <div className="x-rail-tab-body x-agent-inbox">
      <header className="x-agent-inbox-head">
        <h2 className="x-agent-inbox-head-title">Agent</h2>
        {items.length > 0 ? (
          <span className="x-agent-inbox-count">
            {items.length} item{items.length === 1 ? '' : 's'}
          </span>
        ) : null}
      </header>

      {error ? <p className="x-agent-inbox-error">{error}</p> : null}

      {items.length === 0 ? (
        <p className="x-agent-inbox-empty">No drafts or active builds.</p>
      ) : (
        <ul className="x-agent-inbox-list">
          {items.map((item) =>
            item.kind === 'status' ? (
              <li key={item.id} className="x-agent-inbox-entry">
                <AgentInboxStatusRow item={item} onOpenBuildDojo={onOpenBuildDojo} />
              </li>
            ) : (
              <AgentInboxDraftRow
                key={item.id}
                item={item}
                expanded={expandedId === item.id}
                onToggleExpand={() => setExpandedId((id) => (id === item.id ? null : item.id))}
                onComplete={load}
              />
            )
          )}
        </ul>
      )}
    </div>
  )
}
