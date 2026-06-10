import type { BuildExecutor } from '@shared/build-executor'
import { BUILD_AGENTS } from '@shared/build-dojo'
import type { BuildThread } from '@shared/build-dojo'
import type { BuildAgentTab, BuildPane } from './buildAgentTabs'
import { executorShort } from './buildAgentTabs'
import { IconSpark } from './Icons'

type Props = {
  buildPane: BuildPane
  executor: BuildExecutor
  threads: BuildThread[]
  activeThreadId: string | null
  agentTabs: BuildAgentTab[]
  activeAgentTabId: string | null
  collapsed: boolean
  onSelectExecutor: (id: BuildExecutor) => void
  onSelectChat: (threadId?: string) => void
  onNewChat: () => void
  onSelectAgentTab: (id: string) => void
  onCloseAgentTab: (id: string) => void
  onToggleCollapsed: () => void
}

export function BuildWorkspaceRail({
  buildPane,
  executor,
  threads,
  activeThreadId,
  agentTabs,
  activeAgentTabId,
  collapsed,
  onSelectExecutor,
  onSelectChat,
  onNewChat,
  onSelectAgentTab,
  onCloseAgentTab,
  onToggleCollapsed
}: Props) {
  const executorThreads = threads
    .filter((t) => t.executor === executor)
    .sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <aside
      className={`x-browser-sidebar x-build-workspace-rail${collapsed ? ' x-browser-sidebar-collapsed' : ''}`}
    >
      <div className="x-browser-sidebar-head">
        {!collapsed ? <span className="x-browser-sidebar-title">Build</span> : null}
        <button
          type="button"
          className="x-browser-sidebar-icon-btn x-browser-sidebar-icon-btn-end"
          title={collapsed ? 'Expand' : 'Collapse'}
          aria-label={collapsed ? 'Expand' : 'Collapse'}
          onClick={onToggleCollapsed}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {!collapsed ? (
        <nav className="x-build-rail-nav" aria-label="Build">
          <div className="x-build-agent-seg" role="tablist" aria-label="Agent">
            {BUILD_AGENTS.map((agent) => (
              <button
                key={agent.id}
                type="button"
                role="tab"
                aria-selected={executor === agent.id}
                title={agent.name}
                className={`x-build-agent-seg-btn${executor === agent.id ? ' active' : ''}`}
                onClick={() => onSelectExecutor(agent.id)}
              >
                {agent.short}
              </button>
            ))}
          </div>

          <section className="x-home-rail-section" aria-label="Chat">
            <p className="x-home-rail-section-label">Chat</p>
            <div className="x-home-rail-stack">
              <button type="button" className="x-home-rail-new" onClick={onNewChat}>
                <span className="x-home-rail-new-plus" aria-hidden>
                  +
                </span>
                <span>New chat</span>
              </button>
              {executorThreads.length === 0 ? (
                <p className="x-home-rail-empty">No chats yet</p>
              ) : (
                executorThreads.map((t) => {
                  const active = buildPane === 'chat' && t.id === activeThreadId
                  const live = t.messages.some((m) => m.status === 'running')
                  return (
                    <div
                      key={t.id}
                      className={`x-home-rail-row x-home-rail-tab${active ? ' active' : ''}`}
                    >
                      <button
                        type="button"
                        className="x-home-rail-tab-main"
                        onClick={() => onSelectChat(t.id)}
                        title={t.title}
                      >
                        <IconSpark className="x-home-rail-icon" />
                        <span className="x-home-rail-label">{t.title}</span>
                        {live ? <span className="x-dojo-thread-live" aria-hidden /> : null}
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </section>

          {agentTabs.length > 0 ? (
            <section className="x-home-rail-section" aria-label="Agent runs">
              <p className="x-home-rail-section-label">Runs</p>
              <div className="x-home-rail-tabs" role="tablist" aria-label="Build runs">
                {agentTabs.map((tab) => (
                  <div
                    key={tab.id}
                    role="tab"
                    aria-selected={buildPane === 'agent' && activeAgentTabId === tab.id}
                    className={`x-home-rail-row x-home-rail-tab${buildPane === 'agent' && activeAgentTabId === tab.id ? ' active' : ''}`}
                  >
                    <button
                      type="button"
                      className="x-home-rail-tab-main"
                      onClick={() => onSelectAgentTab(tab.id)}
                      title={tab.title}
                    >
                      <span className="x-home-rail-favicon" aria-hidden>
                        {executorShort(tab.executor)}
                      </span>
                      <span className="x-home-rail-label">{tab.title}</span>
                      {tab.status === 'running' ? (
                        <span className="x-dojo-thread-live" aria-hidden />
                      ) : null}
                    </button>
                    <button
                      type="button"
                      className="x-home-rail-close"
                      aria-label={`Close ${tab.title}`}
                      onClick={() => onCloseAgentTab(tab.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </nav>
      ) : null}
    </aside>
  )
}
