import { useMemo, useState, type ReactNode } from 'react'

const URL_RE = /https?:\/\/[^\s<>"')\]]+/g
const IMAGE_PLACEHOLDER_RE = /\[image:\s*[^\]]*\]/gi

export function cleanEmailText(text: string): string {
  return text
    .replace(IMAGE_PLACEHOLDER_RE, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function splitEmailBody(body: string): { content: string; quoted: string | null } {
  const cleaned = cleanEmailText(body)
  const lines = cleaned.split('\n')
  let quoteStart = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (
      line.startsWith('>') ||
      /^On .+ wrote:$/i.test(line) ||
      /^-{2,}\s*Forwarded message/i.test(line) ||
      /^From:\s/i.test(line) ||
      /^_{3,}$/.test(line)
    ) {
      quoteStart = i
      break
    }
  }
  if (quoteStart === -1) return { content: cleaned, quoted: null }
  const content = cleanEmailText(lines.slice(0, quoteStart).join('\n'))
  const quoted = cleanEmailText(lines.slice(quoteStart).join('\n'))
  return { content, quoted: quoted || null }
}

function truncateUrl(url: string, max = 52): string {
  try {
    const u = new URL(url)
    const short = `${u.hostname}${u.pathname !== '/' ? u.pathname : ''}${u.search ? '…' : ''}`
    if (short.length <= max) return short
    return `${short.slice(0, max - 1)}…`
  } catch {
    return url.length <= max ? url : `${url.slice(0, max - 1)}…`
  }
}

export function linkifyPlainText(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(URL_RE)) {
    const url = match[0].replace(/[.,;:!?)]+$/, '')
    const index = match.index ?? 0
    if (index > last) parts.push(text.slice(last, index))
    parts.push(
      <a key={`${index}-${url}`} className="x-thread-link" href={url} target="_blank" rel="noreferrer">
        {truncateUrl(url)}
      </a>
    )
    last = index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length ? parts : [text]
}

function EmailParagraphs({ text }: { text: string }) {
  const blocks = text.split(/\n\n+/).filter((b) => b.trim())
  if (blocks.length === 0) return null
  return (
    <>
      {blocks.map((block, i) => (
        <p key={i} className="x-thread-email-text">
          {linkifyPlainText(block)}
        </p>
      ))}
    </>
  )
}

export function FormattedEmailBody({ body }: { body: string }) {
  const [showQuote, setShowQuote] = useState(false)
  const { content, quoted } = useMemo(() => splitEmailBody(body), [body])

  if (!content && !quoted) return null

  return (
    <div className="x-thread-email-body">
      {content ? <EmailParagraphs text={content} /> : null}
      {quoted ? (
        <div className="x-thread-email-quote-wrap">
          <button type="button" className="x-thread-email-quote-toggle" onClick={() => setShowQuote((v) => !v)}>
            {showQuote ? 'Hide quoted reply' : 'Show quoted reply'}
          </button>
          {showQuote ? (
            <div className="x-thread-email-quote">
              <EmailParagraphs text={quoted} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function FormattedChatBody({ body }: { body: string }) {
  const text = cleanEmailText(body)
  const blocks = text.split(/\n\n+/).filter((b) => b.trim())
  if (blocks.length <= 1) {
    return <p className="x-thread-chat-text">{linkifyPlainText(text)}</p>
  }
  return (
    <div className="x-thread-chat-text-blocks">
      {blocks.map((block, i) => (
        <p key={i} className="x-thread-chat-text">
          {linkifyPlainText(block)}
        </p>
      ))}
    </div>
  )
}
