import { useState } from 'react'
import type { CentralStreamEvent } from '@shared/cluster'
import { openExternal } from '../lib/api'

const COLLAPSE_CHARS = 520

type Props = {
  role: 'user' | 'agent' | 'system'
  content: string
  deployUrl?: string | null
}

export function BuildDojoMessage({ role, content, deployUrl }: Props) {
  const [expanded, setExpanded] = useState(false)
  const long = content.length > COLLAPSE_CHARS
  const shown = long && !expanded ? `${content.slice(0, COLLAPSE_CHARS).trim()}…` : content

  return (
    <>
      <pre className="x-dojo-msg-body">{shown}</pre>
      {long ? (
        <button
          type="button"
          className="x-dojo-msg-expand"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Show less' : `Show full (${content.length.toLocaleString()} chars)`}
        </button>
      ) : null}
      {deployUrl ? (
        <div className="x-dojo-deploy-link">
          <span>Deployed to</span>
          <button type="button" onClick={() => void openExternal(deployUrl)}>
            {deployUrl.replace(/^https?:\/\//, '')}
          </button>
        </div>
      ) : null}
    </>
  )
}

export function buildAgentMessageContent(
  event: CentralStreamEvent | undefined,
  logLines: string[]
): string {
  const log = logLines.join('\n').trim()
  const summary = String(event?.meta?.buildSummary ?? event?.body ?? '').trim()
  if (log && summary && summary !== log && !log.includes(summary)) {
    return `${log}\n\n—\n${summary}`
  }
  return log || summary || String(event?.meta?.currentStep ?? 'Working…')
}
