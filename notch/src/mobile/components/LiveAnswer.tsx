import type { AssistResult } from '@shared/cluster'

type Props = {
  result: AssistResult | null
  loading: boolean
  autoDetected?: boolean
}

export function LiveAnswer({ result, loading, autoDetected }: Props) {
  if (loading) {
    return (
      <div className="live-answer">
        <div className="la-label">Thinking…</div>
        <div className="la-body la-streaming">
          <span className="cursor-blink" />
        </div>
      </div>
    )
  }
  if (!result) return null

  return (
    <div className="live-answer">
      <div className="la-label">
        {autoDetected || result.autoDetected
          ? `Detected: "${result.triggerPhrase ?? result.headline}"`
          : 'Answer'}
      </div>
      <div className="la-body">{result.sayThis}</div>
      {result.trustNote && <p className="la-trust">{result.trustNote}</p>}
      <div className="la-sources">
        {result.sources.map((s) => (
          <span key={s} className="source-tag">
            {s}
          </span>
        ))}
      </div>
    </div>
  )
}
