import type { BuildAgentsStatus, BuildExecutor } from '@shared/build-executor'
import { BUILD_AGENTS } from '@shared/build-dojo'

type Props = {
  executor: BuildExecutor
  buildStatus: BuildAgentsStatus | null
  ready: boolean
  onProjectChange: (projectId: string) => void
  onOpenDashboard: () => void
  onOpenIntegrations?: () => void
}

export function BuildChrome({
  executor,
  buildStatus,
  ready,
  onProjectChange,
  onOpenDashboard,
  onOpenIntegrations
}: Props) {
  const projects = buildStatus?.localProjects ?? []
  const agentName = BUILD_AGENTS.find((a) => a.id === executor)?.name ?? 'Build'

  return (
    <header className="x-build-chrome">
      <span className="x-build-chrome-agent">{agentName}</span>
      {executor !== 'cursor-cloud' ? (
        <select
          className="x-build-chrome-project"
          value={buildStatus?.activeLocalProjectId ?? ''}
          onChange={(e) => onProjectChange(e.target.value)}
          aria-label="Project folder"
        >
          {projects.length === 0 ? (
            <option value="">No project — add in Setup</option>
          ) : (
            projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))
          )}
        </select>
      ) : (
        <span className="x-build-chrome-cloud">
          {buildStatus?.cursor.repo ?? 'Cloud repo'}
        </span>
      )}
      <span className={`x-build-chrome-ready${ready ? ' x-build-chrome-ready-on' : ''}`}>
        {ready ? 'Ready' : 'Setup needed'}
      </span>
      <div className="x-build-chrome-actions">
        <button type="button" className="x-build-chrome-link" onClick={onOpenDashboard}>
          Metrics
        </button>
        {onOpenIntegrations ? (
          <button type="button" className="x-build-chrome-link" onClick={onOpenIntegrations}>
            Setup
          </button>
        ) : null}
      </div>
    </header>
  )
}
