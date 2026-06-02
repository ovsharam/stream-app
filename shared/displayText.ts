/** Strip markdown/noise and shorten URLs for UI display. */
export function sanitizeDisplayText(raw: string, maxLen = 220): string {
  let t = String(raw ?? '')
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/[^\s<>"')\]]+/g, (url) => {
      try {
        const u = new URL(url.replace(/[.,;:!?]+$/, ''))
        return u.hostname.replace(/^www\./, '')
      } catch {
        return 'link'
      }
    })
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (t.length > maxLen) t = `${t.slice(0, maxLen - 1).trim()}…`
  return t
}

/** Heuristic: lookup vs conversational question for portal search. */
export function isConversationalQuery(q: string): boolean {
  const t = q.trim()
  if (!t) return false
  if (t.includes('?')) return true
  return /^(what|how|why|when|where|who|prep|summarize|help|should|can you|tell me|explain)/i.test(t)
}

export type AssistBodyParts = {
  intro: string
  bullets: string[]
  plain: string
}

/** Split assist response into intro prose + bullet items for portal rendering. */
export function parseAssistBody(raw: string, maxItemLen = 320): AssistBodyParts {
  const text = String(raw ?? '')
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/<\/?[^>]+>/g, ' ')
    .trim()

  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  const bullets: string[] = []
  const prose: string[] = []

  for (const line of lines) {
    if (/^(HEADLINE|SUMMARY|RESPONSE|SAY(?: THIS)?|Q|Sources)\s*:/i.test(line)) continue
    const bullet = line.match(/^[-*•]\s+(.+)/)
    if (bullet) {
      bullets.push(sanitizeDisplayText(bullet[1], maxItemLen))
      continue
    }
    const inlineBullets = line.match(/(?:^|\s)[-*•]\s+[^-*•]+/g)
    if (inlineBullets && inlineBullets.length > 1) {
      for (const part of inlineBullets) {
        const item = part.replace(/^[\s-*•]+/, '').trim()
        if (item) bullets.push(sanitizeDisplayText(item, maxItemLen))
      }
      continue
    }
    prose.push(line.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1'))
  }

  const intro = sanitizeDisplayText(prose.join(' '), 900)
  const plain = bullets.length === 0 && !intro ? sanitizeDisplayText(text.replace(/\s+/g, ' '), 900) : ''
  return { intro, bullets, plain }
}
