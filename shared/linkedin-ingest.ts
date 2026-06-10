import type { AgentThreadMessage, LinkedInIngestInput } from './agent-proposal'

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** First token of a scraped LinkedIn display name. */
export function contactFirstName(contactName: string): string {
  let clean = contactName
    .replace(/\s+Status is offline[\s\S]*$/i, '')
    .replace(/\s+Building[\s\S]*$/i, '')
    .replace(/\s+@\s*[\s\S]*$/i, '')
    .trim()
  return clean.split(/\s+/)[0]?.toLowerCase() ?? ''
}

/** Heuristic: message reads like you wrote it TO the contact (inbox preview without "You:" prefix). */
export function looksLikeOutboundToContact(message: string, contactName: string): boolean {
  const text = message.trim()
  if (!text) return false
  const first = contactFirstName(contactName)
  if (first.length < 2) return false

  if (
    new RegExp(`^(?:hey|hi|hello|dear|thanks|thank you)\\s+${escapeRegex(first)}\\b`, 'i').test(
      text
    )
  ) {
    return true
  }

  if (
    /\b(?:your journey|your work|if you'?re|would love to connect|great to connect)\b/i.test(text) &&
    new RegExp(`\\b${escapeRegex(first)}\\b`, 'i').test(text)
  ) {
    return true
  }

  return false
}

/** LinkedIn inbox previews prefix your own last message with "You:" */
export function isLinkedInOutboundPreview(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (/^you\s*:/i.test(t)) return true
  if (/^you sent\b/i.test(t)) return true
  return false
}

export function lastInboundThreadMessage(
  messages: AgentThreadMessage[] | undefined
): AgentThreadMessage | null {
  if (!messages?.length) return null
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.sender === 'other') return messages[i]!
  }
  return null
}

export function lastThreadMessage(
  messages: AgentThreadMessage[] | undefined
): AgentThreadMessage | null {
  if (!messages?.length) return null
  return messages[messages.length - 1] ?? null
}

/** Resolve the inbound message to act on, or null if the latest activity is outbound. */
export function resolveLinkedInInboundMessage(input: LinkedInIngestInput): {
  message: string
  inbound: boolean
} | null {
  const trimmed = input.message.trim()
  const lastInbound = lastInboundThreadMessage(input.threadMessages)
  const lastAny = lastThreadMessage(input.threadMessages)

  if (input.threadMessages?.length) {
    if (lastAny?.sender === 'self') {
      return null
    }
    if (lastInbound?.text.trim()) {
      return { message: lastInbound.text.trim(), inbound: true }
    }
    return null
  }

  if (isLinkedInOutboundPreview(trimmed)) {
    return null
  }

  if (looksLikeOutboundToContact(trimmed, input.senderName)) {
    return null
  }

  if (!trimmed) return null
  return { message: trimmed, inbound: true }
}
