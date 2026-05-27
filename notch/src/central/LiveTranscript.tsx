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
    <article className="x-post x-transcript">
      <div className="x-avatar x-avatar-notch">N</div>
      <div className="x-post-content">
        <div className="x-post-head">
          <span className="x-name">Notch AI</span>
          <span className="x-handle">@notch</span>
          <span className="x-dot">·</span>
          <span className="x-transcript-live">
            <span className="x-transcript-pulse" />
            transcribing
          </span>
        </div>

        <p className="x-transcript-sub">
          Live on your behalf — faster than Meet captions
        </p>

        <div className="x-transcript-body">
          {lines.length === 0 ? (
            <p className="x-transcript-wait">Listening…</p>
          ) : (
            lines.map((l, i) => (
              <p key={`${l.ts}-${i}`} className={`x-transcript-line ${i === 0 ? 'x-transcript-line-new' : ''}`}>
                <span className="x-transcript-speaker">{l.speaker}</span>
                {l.text}
              </p>
            ))
          )}
        </div>

        {meetingLink && (
          <button type="button" className="x-transcript-join" onClick={() => openMeeting(meetingLink)}>
            Join Meet
          </button>
        )}
      </div>
    </article>
  )
}
