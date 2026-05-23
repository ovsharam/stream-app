import { openMeeting } from '../lib/api'

type Line = { speaker: string; text: string; ts: number }

type Props = {
  lines: Line[]
  active: boolean
  meetingLink?: string
}

export function LiveTranscript({ lines, active, meetingLink }: Props) {
  if (!active && lines.length === 0) return null

  return (
    <div className="x-transcript">
      <div className="x-transcript-head">
        <div className="x-transcript-brand">
          <span className="x-transcript-pulse" />
          <span className="x-transcript-label">Notch AI</span>
          <span className="x-transcript-badge">transcribing</span>
        </div>
        {meetingLink && (
          <button type="button" className="x-transcript-join" onClick={() => openMeeting(meetingLink)}>
            Join Meet
          </button>
        )}
      </div>
      <p className="x-transcript-sub">
        Real-time transcript on your behalf — faster than Meet captions · synced to mobile droplet
      </p>
      <div className="x-transcript-body">
        {lines.length === 0 ? (
          <p className="x-transcript-wait">Listening…</p>
        ) : (
          lines.map((l, i) => (
            <div key={`${l.ts}-${i}`} className={`x-transcript-line ${i === 0 ? 'x-transcript-line-new' : ''}`}>
              <span className="x-transcript-speaker">{l.speaker}</span>
              <span className="x-transcript-text">{l.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
