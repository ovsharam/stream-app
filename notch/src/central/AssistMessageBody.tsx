import type { ReactNode } from 'react'
import type { AssistResult } from '@shared/cluster'
import { dedupeAssistLines } from '@shared/assistText'

type Props = {
  assist: AssistResult
  query: string
}

function InlineText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((part, i) => {
        const bold = part.match(/^\*\*(.+)\*\*$/)
        if (bold) return <strong key={i}>{bold[1]}</strong>
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

function renderChatContent(text: string) {
  const lines = dedupeAssistLines(text).split('\n')
  const blocks: ReactNode[] = []
  let bullets: string[] = []
  let key = 0

  const flushBullets = () => {
    if (bullets.length === 0) return
    blocks.push(
      <ul key={`ul-${key++}`} className="x-home-msg-list">
        {bullets.map((item, i) => (
          <li key={i}>
            <InlineText text={item} />
          </li>
        ))}
      </ul>
    )
    bullets = []
  }

  for (const raw of lines) {
    const line = raw.replace(/\r/g, '').trimEnd()
    const trimmed = line.trim()
    if (!trimmed) {
      flushBullets()
      continue
    }

    const section = trimmed.match(/^\*\*([^*]+)\*\*$/)
    if (section) {
      flushBullets()
      blocks.push(
        <h4 key={`h-${key++}`} className="x-home-msg-section">
          {section[1]}
        </h4>
      )
      continue
    }

    const bullet = trimmed.match(/^[-*•]\s+(.*)/)
    if (bullet) {
      bullets.push(bullet[1].trim())
      continue
    }

    flushBullets()
    blocks.push(
      <p key={`p-${key++}`} className="x-home-msg-text">
        <InlineText text={trimmed} />
      </p>
    )
  }

  flushBullets()
  return blocks
}

export function AssistMessageBody({ assist }: Props) {
  const main = String(assist.response ?? '').trim()

  if (!main) {
    return (
      <div className="x-home-msg-body">
        <p className="x-home-msg-text x-home-msg-muted">Nothing came back — try again in a moment.</p>
      </div>
    )
  }

  return <div className="x-home-msg-body">{renderChatContent(main)}</div>
}
