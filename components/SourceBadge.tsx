import type { StreamSource } from '@shared/types'
import { SOURCE_COLORS } from '@shared/types'

const LABELS: Record<StreamSource, string> = {
  gmail: 'Gmail',
  slack: 'Slack',
  x: 'X',
  monday: 'Monday',
  discord: 'Discord',
  perplexity: 'Perplexity',
  claude: 'Claude',
  cursor: 'Cursor',
  github: 'GitHub',
  gemini: 'Gemini',
  gdocs: 'Docs',
  gong: 'Gong',
  calcom: 'Cal.com',
  meeting: 'Meeting',
  note: 'Note'
}

interface Props {
  source: StreamSource
}

export function SourceBadge({ source }: Props) {
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide"
      style={{ color: SOURCE_COLORS[source], border: `1px solid ${SOURCE_COLORS[source]}33` }}
    >
      {LABELS[source]}
    </span>
  )
}
