import { useMemo, useState, type ReactNode } from 'react'

const URL_RE = /https?:\/\/[^\s<>"')\]]+/g

export function cleanEmailText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function splitEmailBody(body: string): { content: string; quoted: string | null } {
  const lines = body.split('\n')
  let quoteStart = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (
      line.startsWith('>') ||
      /^On .+ wrote:$/.test(line) ||
      /^-{2,}\s*Forwarded message/i.test(line) ||
      /^From:\s/i.test(line)
    ) {
      quoteStart = i
      break
    }
  }
  if (quoteStart === -1) return { content: cleanEmailText(body), quoted: null }
  return {
    content: cleanEmailText(lines.slice(0, quoteStart).join('\n')),
    quoted: cleanEmailText(lines.slice(quoteStart).join('\n')) || null
  }
}

function truncateUrl(url: string, max = 52): string {
  try {
    const u = new URL(url)
    const short = `${u.hostname}${u.pathname !== '/' ? u.pathname : ''}`
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
    const url = match[0]
    const index = match.index ?? 0
    if (index > last) parts.push(text.slice(last, index))
    parts.push(
      <a key={`${index}-${url}`} className="x-thread-link" href={url} target="_blank" rel="noreferrer">
        {truncateUrl(url)}
      </a>
    )
    last = index + url.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length ? parts : [text]
}

export function FormattedEmailBody({ body }: { body: string }) {
  const [showQuote, setShowQuote] = useState(false)
  const { content, quoted } = useMemo(() => splitEmailBody(body), [body])
  const main = useMemo(() => linkifyPlainText(content), [content])
  const quote = useMemo(() => (quoted ? linkifyPlainText(quoted) : null), [quoted])

  if (!content && !quoted) return null

  return (
    <div className="x-thread-email-body">
      {content ? <p className="x-thread-email-text">{main}</p> : null}
      {quoted ? (
        <div className="x-thread-email-quote-wrap">
          <button type="button" className="x-thread-email-quote-toggle" onClick={() => setShowQuote((v) => !v)}>
            {showQuote ? 'Hide quoted text' : 'Show quoted text'}
          </button>
          {showQuote ? <pre className="x-thread-email-quote">{quote}</pre> : null}
        </div>
      ) : null}
    </div>
  )
}

export function FormattedChatBody({ body }: { body: string }) {
  const text = cleanEmailText(body)
  const nodes = useMemo(() => linkifyPlainText(text), [text])
  return <p className="x-thread-chat-text">{nodes}</p>
}
