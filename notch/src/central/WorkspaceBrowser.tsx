import { useEffect, useState } from 'react'
import type { WorkspaceTab } from './workspace'
import { WorkspaceView } from './WorkspaceView'

type Props = {
  tabs: WorkspaceTab[]
  activeId: string
  reloadKeys?: Record<string, number>
  miniTabId?: string | null
  onTabUrlChange?: (id: string, url: string) => void
}

/** Keeps one webview mounted per tab so switching tabs does not reload Google Docs / Meet. */
export function WorkspaceBrowser({ tabs, activeId, reloadKeys = {}, miniTabId = null, onTabUrlChange }: Props) {
  const [mountedTabIds, setMountedTabIds] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    if (activeId) initial.add(activeId)
    if (miniTabId) initial.add(miniTabId)
    return initial
  })

  useEffect(() => {
    if (!activeId) return
    setMountedTabIds((prev) => {
      if (prev.has(activeId)) return prev
      const next = new Set(prev)
      next.add(activeId)
      return next
    })
  }, [activeId])

  useEffect(() => {
    if (!miniTabId) return
    setMountedTabIds((prev) => {
      if (prev.has(miniTabId)) return prev
      const next = new Set(prev)
      next.add(miniTabId)
      return next
    })
  }, [miniTabId])

  return (
    <div
      className={`x-workspace-browser-host${activeId || miniTabId ? ' x-workspace-browser-host-active' : ''}${miniTabId ? ' x-workspace-browser-host-mini' : ''}`}
    >
      <div className="x-workspace-browser">
        {tabs.map((tab) =>
          mountedTabIds.has(tab.id) ? (
            <WorkspaceView
              key={tab.id}
              tab={tab}
              active={tab.id === activeId}
              miniPlayerTarget={miniTabId === tab.id}
              reloadNonce={reloadKeys[tab.id] ?? 0}
              onUrlChange={onTabUrlChange ? (url) => onTabUrlChange(tab.id, url) : undefined}
            />
          ) : null
        )}
      </div>
    </div>
  )
}
