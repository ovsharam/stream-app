'use client'

import { useNotificationStore } from '@/store/notificationStore'
import { SourceBadge } from './SourceBadge'
import type { StreamItem } from '@shared/types'

function PrepSection({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="border-b border-stream-border px-4 py-3">
      <h3 className="font-mono text-[10px] uppercase tracking-wider text-stream-secondary">
        {title}
      </h3>
      <div className="mt-2">{children}</div>
    </section>
  )
}

function MiniItem({ item }: { item: StreamItem }) {
  return (
    <div className="rounded border border-stream-border bg-stream-bg/50 p-2">
      <div className="flex items-center gap-2">
        <SourceBadge source={item.source} />
        <span className="truncate font-sans text-xs text-stream-primary">{item.sender.name}</span>
      </div>
      <p className="mt-1 line-clamp-2 font-sans text-xs text-stream-secondary">{item.body}</p>
    </div>
  )
}

export function MeetingContextPanel() {
  const sidePanelOpen = useNotificationStore((s) => s.sidePanelOpen)
  const meeting = useNotificationStore((s) => s.activeMeeting)
  const closeMeetingPanel = useNotificationStore((s) => s.closeMeetingPanel)

  if (!sidePanelOpen || !meeting) return null

  return (
    <>
      <button
        type="button"
        aria-label="Close panel"
        className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm"
        onClick={closeMeetingPanel}
      />
      <aside className="panel-slide fixed bottom-0 right-0 top-0 z-[80] flex w-full max-w-md flex-col border-l border-stream-border bg-stream-bg shadow-2xl">
        <header className="shrink-0 border-b border-stream-border px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <p className="font-mono text-[10px] uppercase tracking-wide text-stream-perplexity">
            Call prep — FDE context
          </p>
          <h2 className="mt-1 font-sans text-lg font-semibold text-stream-primary">{meeting.title}</h2>
          <p className="mt-1 font-mono text-xs text-stream-secondary">
            {meeting.attendees.join(' · ')}
          </p>
          {meeting.zoomJoinUrl && (
            <a
              href={meeting.zoomJoinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex rounded bg-stream-perplexity px-3 py-2 font-mono text-xs font-medium text-stream-bg"
            >
              Join Zoom →
            </a>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <PrepSection title="Goals for this call">
            <ul className="list-inside list-disc space-y-1 font-sans text-sm text-stream-primary/90">
              {meeting.prep.goals.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </PrepSection>

          {meeting.prep.claudeBrief && (
            <PrepSection title="Claude brief">
              <p className="font-sans text-sm leading-relaxed text-stream-primary/85">
                {meeting.prep.claudeBrief}
              </p>
            </PrepSection>
          )}

          <PrepSection title="Open emails">
            <div className="space-y-2">
              {meeting.prep.openEmails.map((item) => (
                <MiniItem key={item.id} item={item} />
              ))}
            </div>
          </PrepSection>

          <PrepSection title="Slack threads">
            <div className="space-y-2">
              {meeting.prep.openSlackThreads.map((item) => (
                <MiniItem key={item.id} item={item} />
              ))}
            </div>
          </PrepSection>

          <PrepSection title="Builds">
            <ul className="space-y-2">
              {meeting.prep.recentBuilds.map((b) => (
                <li
                  key={b.name}
                  className="flex items-center justify-between rounded border border-stream-border px-2 py-1.5 font-mono text-xs"
                >
                  <span className="text-stream-primary">{b.name}</span>
                  <span className="text-stream-perplexity">{b.status}</span>
                </li>
              ))}
            </ul>
          </PrepSection>

          {meeting.prep.gongHighlights && (
            <PrepSection title="Gong highlights">
              <ul className="space-y-2 font-sans text-xs text-stream-secondary">
                {meeting.prep.gongHighlights.map((h) => (
                  <li key={h} className="rounded border border-stream-border/60 bg-stream-surface/50 p-2">
                    {h}
                  </li>
                ))}
              </ul>
            </PrepSection>
          )}
        </div>

        <footer className="shrink-0 border-t border-stream-border p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={closeMeetingPanel}
            className="w-full rounded border border-stream-border py-2 font-mono text-xs text-stream-secondary hover:bg-stream-surface"
          >
            Back to stream
          </button>
        </footer>
      </aside>
    </>
  )
}
