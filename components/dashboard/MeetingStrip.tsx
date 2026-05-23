import type { ClusterMeeting } from '@shared/cluster'

const PHASE: Record<string, string> = {
  pre_call: 'Pre-call',
  live_call: 'Live',
  post_call: 'Post-call',
  idle: 'Idle'
}

type Props = { meeting: ClusterMeeting; expanded?: boolean }

export function MeetingStrip({ meeting, expanded }: Props) {
  const live = meeting.phase === 'live_call'
  return (
    <div
      className={`rounded-xl border bg-white p-4 ${live ? 'border-emerald-200 ring-1 ring-emerald-100' : 'border-neutral-200'}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {live && <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />}
          <div>
            <p className="text-sm font-semibold">{meeting.title}</p>
            <p className="text-xs text-neutral-500">{meeting.company}</p>
          </div>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${live ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-600'}`}
        >
          {PHASE[meeting.phase]}
        </span>
      </div>
      {expanded && meeting.meetingLink && (
        <p className="mt-3 font-mono text-[10px] text-neutral-400">{meeting.meetingLink}</p>
      )}
    </div>
  )
}
