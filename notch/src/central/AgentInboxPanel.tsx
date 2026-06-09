import { useCallback, useEffect, useState } from 'react'
import type { AgentProposal } from '@shared/agent-proposal'
import { agentApi } from '../lib/api'
import { AgentProposalActionCard } from './AgentProposalActionCard'
import { IconLinkedin } from './Icons'

export function AgentInboxPanel() {
  const [proposals, setProposals] = useState<AgentProposal[]>([])
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

  return (
    <div className="x-rail-tab-body x-agent-inbox x-li-inbox">
      <header className="x-li-inbox-head">
        <div className="x-li-inbox-brand">
          <span className="x-li-inbox-icon-wrap" aria-hidden>
            <IconLinkedin className="x-li-inbox-icon" />
          </span>
          <div>
            <h2 className="x-li-inbox-title">LinkedIn</h2>
            <p className="x-li-inbox-sub">
              {proposals.length
                ? `${proposals.length} draft${proposals.length === 1 ? '' : 's'} ready`
                : 'Messages with agent drafts'}
            </p>
          </div>
        </div>
      </header>

      {error ? <p className="x-cal-empty">{error}</p> : null}
      {proposals.length === 0 ? (
        <p className="x-li-inbox-empty">
          No LinkedIn drafts right now. New messages appear here with a reply ready to send.
        </p>
      ) : (
        <ul className="x-li-inbox-list">
          {proposals.map((p) => (
            <li key={p.id}>
              <AgentProposalActionCard surface="inbox" proposal={p} onActionComplete={load} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
