import { useCallback, useEffect, useState } from 'react'
import type { FdeEngagement } from '@shared/fde-engagement'
import { PIPELINE_STAGES } from '@shared/pipeline'
import { clusterApi } from '../lib/api'
import { engagementRef } from './pipelineDisplay'
import { NewCaseModal } from './NewCaseModal'

type ClientGroup = {
  clientName: string
  engagements: FdeEngagement[]
}

type Props = {
  onOpenCase: (id: string) => void
}

export function ClientsView({ onOpenCase }: Props) {
  const [clients, setClients] = useState<ClientGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await clusterApi.fdeClients()
      setClients(data.clients)
    } catch {
      setClients([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const onRefresh = () => void load()
    window.addEventListener('notch:engagements-updated', onRefresh)
    return () => window.removeEventListener('notch:engagements-updated', onRefresh)
  }, [load])

  const stageLabel = (stage: FdeEngagement['stage']) =>
    PIPELINE_STAGES.find((s) => s.id === stage)?.label ?? stage

  const createCase = async (input: { clientName: string; company?: string; summary?: string }) => {
    setCreating(true)
    try {
      const { engagement } = await clusterApi.createEngagement(input)
      await load()
      setModalOpen(false)
      onOpenCase(engagement.id)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="x-clients-view">
      <header className="x-page-header x-page-header-enterprise">
        <div>
          <div className="x-pipeline-breadcrumb">
            <span>Workspace</span>
            <span className="x-pipeline-breadcrumb-sep">/</span>
            <span>Clients</span>
          </div>
          <h1>Clients</h1>
          <p className="x-page-header-sub">
            Every customer account — engagements, builds, and channel history roll up here.
          </p>
        </div>
        <button type="button" className="x-btn x-btn-primary" onClick={() => setModalOpen(true)}>
          New engagement
        </button>
      </header>

      <div className="x-clients-table-wrap">
        {loading ? (
          <p className="x-case-muted">Loading clients…</p>
        ) : clients.length === 0 ? (
          <p className="x-case-muted">No clients yet — create an engagement or finish a discovery call.</p>
        ) : (
          <table className="x-clients-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Engagements</th>
                <th>Latest stage</th>
                <th>Signals</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((group) => {
                const latest = group.engagements[0]
                if (!latest) return null
                const signalCount = group.engagements.reduce(
                  (n, e) => n + (e.signalSources?.length ?? 0),
                  0
                )
                return (
                  <tr key={group.clientName}>
                    <td>
                      <strong>{group.clientName}</strong>
                      {latest.company ? (
                        <span className="x-clients-co">{latest.company}</span>
                      ) : null}
                    </td>
                    <td>
                      <ul className="x-clients-eng-list">
                        {group.engagements.map((e) => (
                          <li key={e.id}>
                            <button type="button" className="x-clients-case-link" onClick={() => onOpenCase(e.id)}>
                              <span className="x-pipeline-card-id">{engagementRef(e)}</span>
                              {e.summary ? e.summary.slice(0, 64) : 'Engagement'}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td>
                      <span className="x-case-stage-pill">{stageLabel(latest.stage)}</span>
                    </td>
                    <td className="x-clients-signals">{signalCount || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <NewCaseModal
        open={modalOpen}
        busy={creating}
        onClose={() => setModalOpen(false)}
        onCreate={createCase}
      />
    </div>
  )
}
