import { parseAssistBody, sanitizeDisplayText } from './displayText'

const SECTION_LABELS =
  'HEADLINE|Headline|SUMMARY|Summary|RESPONSE|Response|SAY THIS|Say this|Say|Q'

function extractLabeledSection(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const re = new RegExp(
      `(?:^|\\n)${label}\\s*:\\s*([\\s\\S]+?)(?=\\n(?:${SECTION_LABELS})\\s*:|$)`,
      'i'
    )
    const match = text.match(re)
    if (match?.[1]?.trim()) return match[1].trim()
  }
  return null
}

/** Remove templated Q:/Headline:/Say: lines from stored KB or LLM dumps. */
export function stripAssistTemplate(raw: string): string {
  return String(raw ?? '')
    .replace(/^Q:\s*.+?(?:\n|$)/gim, '')
    .replace(/^(?:Headline|HEADLINE|Summary|SUMMARY|Response|RESPONSE|Say(?: this)?|SAY THIS|Sources)\s*:\s*/gim, '')
    .replace(/\n(?:Headline|HEADLINE|Summary|SUMMARY|Response|RESPONSE|Say(?: this)?|SAY THIS|Sources)\s*:\s*/gi, '\n')
    .replace(/\s+/g, ' ')
    .trim()
}

export function cleanAssistField(raw: string, maxLen = 280): string {
  return sanitizeDisplayText(stripAssistTemplate(raw), maxLen)
}

function stripLabelLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/^(Q|Headline|Say|Summary|Response|Sources)\s*:/i.test(line.trim()))
    .join('\n')
    .trim()
}

function isShortHeadline(line: string): boolean {
  const t = line.trim()
  return t.length > 0 && t.length <= 90 && !/^[-*•]\s/.test(t) && !/^\*+\s/.test(t)
}

export function parseAssistSections(
  raw: string,
  query: string
): { headline: string; response: string; sayThis: string } {
  const text = String(raw ?? '').trim()

  const labeledHeadline = extractLabeledSection(text, ['HEADLINE', 'Headline'])
  const labeledResponse = extractLabeledSection(text, ['SUMMARY', 'Summary', 'RESPONSE', 'Response'])

  let sayRaw = extractLabeledSection(text, ['SAY THIS', 'Say this', 'Say']) ?? ''
  sayRaw = sayRaw.replace(/^["']|["']$/g, '').trim()

  let headlineRaw = labeledHeadline ?? ''
  let responseRaw = labeledResponse ?? ''

  if (!responseRaw) {
    responseRaw = stripLabelLines(text)
  }

  if (!headlineRaw) {
    const firstLine = text.split('\n').find((line) => line.trim() && !/^Q:/i.test(line)) ?? ''
    headlineRaw = isShortHeadline(firstLine) && !labeledResponse ? firstLine : query
  }

  const headline = cleanAssistField(headlineRaw, 120) || cleanAssistField(query, 80)
  const response = formatChatAssistBody(
    labeledResponse ? responseRaw : responseRaw.replace(/\r/g, '').trim()
  )
  let sayThis = cleanAssistField(sayRaw, 280)

  return { headline, response, sayThis }
}

/** Full chat assist body — keeps line breaks, strips markdown/template noise. */
export function formatChatAssistBody(raw: string, maxLen = 4000): string {
  let t = String(raw ?? '')
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/^Q:\s*.+?(?:\n|$)/gim, '')
    .trim()

  t = t
    .split('\n')
    .map((line) =>
      line
        .replace(
          /^(?:Headline|HEADLINE|Summary|SUMMARY|Response|RESPONSE|Say(?: this)?|SAY THIS|Sources)\s*:\s*/i,
          ''
        )
        .trimEnd()
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (t.length > maxLen) t = `${t.slice(0, maxLen - 1).trim()}…`
  return dedupeAssistLines(t)
}

/** Drop repeated intro lines (KB feedback-loop artifact). */
export function dedupeAssistLines(text: string): string {
  const lines = String(text ?? '').split('\n')
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of lines) {
    const norm = line
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/…$/g, '')
    if (norm.length > 48 && seen.has(norm)) continue
    if (norm) seen.add(norm)
    out.push(line)
  }
  return out.join('\n').trim()
}

/** Home chat — use response only; never merge headline/say-this into the body. */
export function normalizeChatAssistResult(
  raw: { headline?: string; response?: string; sayThis?: string; query?: string },
  query: string
): { headline: string; response: string; sayThis: string } {
  let text = String(raw.response ?? '').trim()
  if (!text) {
    return {
      headline: '',
      response: 'I don’t have enough context yet — connect Gmail or Monday in Apps, or ask after your feed syncs.',
      sayThis: ''
    }
  }
  if (/^(HEADLINE|SUMMARY|RESPONSE|SAY)/im.test(text)) {
    text = parseAssistSections(text, query).response
  }
  return { headline: '', response: dedupeAssistLines(formatChatAssistBody(text)), sayThis: '' }
}

/** Clean KB/mobile_cluster excerpts for rails and overnight widgets. */
export function cleanKbExcerpt(raw: string, maxLen = 160): string {
  const text = String(raw ?? '').trim()
  if (!text) return ''

  const fromResponse = extractLabeledSection(text, ['Response', 'RESPONSE', 'Summary', 'SUMMARY'])
  if (fromResponse) return sanitizeDisplayText(fromResponse, maxLen)

  const fromHeadline = extractLabeledSection(text, ['Headline', 'HEADLINE'])
  if (fromHeadline && /^Q:/m.test(text)) return sanitizeDisplayText(fromHeadline, maxLen)

  const fromSay = extractLabeledSection(text, ['Say', 'SAY THIS', 'Say this'])
  if (fromSay && /^Q:/m.test(text)) return sanitizeDisplayText(fromSay.replace(/^["']|["']$/g, ''), maxLen)

  return sanitizeDisplayText(stripAssistTemplate(text), maxLen)
}

function normalizeComparable(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function textsOverlap(a: string, b: string): boolean {
  const na = normalizeComparable(a)
  const nb = normalizeComparable(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.length >= 24 && nb.startsWith(na.slice(0, Math.min(na.length, 48)))) return true
  if (nb.length >= 24 && na.startsWith(nb.slice(0, Math.min(nb.length, 48)))) return true
  return false
}

export type PortalAssistView = {
  headline: string
  response: string
  sayThis: string
  showHeadline: boolean
  showSayThis: boolean
  body: ReturnType<typeof parseAssistBody>
}

/** Normalize AssistResult fields before API response or UI render. */
export function normalizeAssistResult(
  raw: { headline?: string; response?: string; sayThis?: string; query?: string },
  query: string
): { headline: string; response: string; sayThis: string } {
  const combined = [raw.headline, raw.response, raw.sayThis].filter(Boolean).join('\n')
  const templated = /^(Q:|Headline:|Say:)/im.test(combined) || /Headline:\s*.+Say:/i.test(combined)
  const freeformBullets = /^\s*[-*•]\s/m.test(combined) || /\n\s*[-*•]\s/m.test(combined)

  if (templated || freeformBullets) {
    return parseAssistSections(combined, query)
  }

  const headline = cleanAssistField(raw.headline ?? query, 120)
  const response = formatChatAssistBody(String(raw.response ?? '').trim())
  const sayThis = cleanAssistField((raw.sayThis ?? '').replace(/^["']|["']$/g, ''), 280)
  return { headline, response, sayThis }
}

/** Portal-specific view: dedupe headline/say-this and preserve bullet structure. */
export function formatPortalAssist(
  raw: { headline?: string; response?: string; sayThis?: string; query?: string; intent?: string },
  query: string,
  conversational: boolean
): PortalAssistView {
  const normalized = normalizeAssistResult(raw, query)
  const body = parseAssistBody(normalized.response)

  const sayStripped = normalized.sayThis.replace(/^["']|["']$/g, '').trim()
  const showSayThis =
    Boolean(sayStripped) &&
    !textsOverlap(sayStripped, normalized.response) &&
    !textsOverlap(sayStripped, body.intro) &&
    (!conversational || raw.intent === 'say_this')

  const showHeadline =
    Boolean(normalized.headline) &&
    !conversational &&
    !textsOverlap(normalized.headline, normalized.response) &&
    !textsOverlap(normalized.headline, body.intro)

  return {
    ...normalized,
    showHeadline,
    showSayThis,
    body
  }
}
