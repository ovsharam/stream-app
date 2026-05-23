'use client'

import { useEffect } from 'react'
import { useNotificationStore } from '@/store/notificationStore'
import { SOURCE_COLORS } from '@shared/types'
import type { StreamSource } from '@shared/types'

export function NotificationBannerStack() {
  const queue = useNotificationStore((s) => s.queue)
  const dismissBanner = useNotificationStore((s) => s.dismissBanner)
  const openMeetingPanel = useNotificationStore((s) => s.openMeetingPanel)
  const activeMeeting = useNotificationStore((s) => s.activeMeeting)

  const top = queue[0]
  if (!top) return null

  const source = top.item.source as StreamSource
  const accent = SOURCE_COLORS[source] ?? '#20B2AA'

  useEffect(() => {
    if (!top.expiresAt) return
    const t = setTimeout(() => dismissBanner(top.id), top.expiresAt - Date.now())
    return () => clearTimeout(t)
  }, [top, dismissBanner])

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-3 pt-[max(8px,env(safe-area-inset-top))]">
      <div
        className="banner-drop pointer-events-auto w-full max-w-lg overflow-hidden rounded-2xl border border-stream-border bg-stream-surface/95 shadow-2xl backdrop-blur-xl"
        style={{ borderTopColor: accent, borderTopWidth: 3 }}
      >
        <div className="flex items-start gap-3 p-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-wide text-stream-secondary">
              {top.title}
            </p>
            <p className="mt-0.5 font-sans text-sm font-semibold text-stream-primary">
              {top.subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={() => dismissBanner(top.id)}
            className="shrink-0 font-mono text-xs text-stream-secondary hover:text-stream-primary"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
        <div className="flex border-t border-stream-border">
          {top.actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => {
                if (action.type === 'meeting_panel' && activeMeeting) {
                  openMeetingPanel(activeMeeting)
                } else if (action.type === 'external' && action.payload) {
                  window.open(action.payload, '_blank', 'noopener,noreferrer')
                }
                dismissBanner(top.id)
              }}
              className="flex-1 py-2.5 font-mono text-xs text-stream-perplexity hover:bg-stream-border/50"
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
