import type { StreamSource } from '@shared/cluster'

const SOURCE: Record<StreamSource, { label: string; color: string; dot: string }> = {
  notch: { label: 'Notch', color: 'text-emerald-600', dot: 'bg-emerald-500' },
  meet: { label: 'Google Meet', color: 'text-blue-600', dot: 'bg-blue-500' },
  gmail: { label: 'Gmail', color: 'text-red-600', dot: 'bg-red-400' },
  slack: { label: 'Slack', color: 'text-violet-600', dot: 'bg-violet-500' },
  gong: { label: 'Gong', color: 'text-fuchsia-600', dot: 'bg-fuchsia-500' },
  salesforce: { label: 'Salesforce', color: 'text-sky-600', dot: 'bg-sky-500' },
  build: { label: 'Build', color: 'text-amber-600', dot: 'bg-amber-500' },
  insight: { label: 'Insight', color: 'text-neutral-600', dot: 'bg-neutral-400' }
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

type Props = {
  source: StreamSource
  title: string
  body: string
  ts: number
  highlight?: string
  promptPreview?: string
  isNew?: boolean
}

export function StreamEventCard({
  source,
  title,
  body,
  ts,
  highlight,
  promptPreview,
  isNew
}: Props) {
  const s = SOURCE[source]
  const isBuild = source === 'build'
  const isInsight = source === 'insight'

  return (
    <article
      className={`stream-event ${isNew ? 'stream-event-new' : ''} ${
        isBuild ? 'stream-event-build' : isInsight ? 'stream-event-insight' : ''
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
        <span className={`text-[11px] font-medium ${s.color}`}>{s.label}</span>
        <span className="text-[11px] text-neutral-400">·</span>
        <span className="text-[11px] text-neutral-400">{timeAgo(ts)}</span>
        {highlight && (
          <span className="ml-auto rounded-full bg-black/[0.04] px-2 py-0.5 text-[10px] font-medium text-neutral-600">
            {highlight}
          </span>
        )}
      </div>
      <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-neutral-900">{title}</h3>
      <p className="mt-1.5 text-[14px] leading-relaxed tracking-[-0.01em] text-neutral-600">{body}</p>
      {promptPreview && (
        <div className="mt-3 rounded-xl border border-amber-200/60 bg-amber-50/50 px-3.5 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700/80">Agent prompt</p>
          <p className="mt-1.5 font-mono text-[12px] leading-relaxed text-neutral-700">{promptPreview}</p>
        </div>
      )}
    </article>
  )
}
